import { browserCalendarTimeZone, ensureFreshAccessToken } from "./client";
import { getChildContextStudentId } from "../childContext";
import { decodeToken, getAccessToken, isTokenExpired } from "../tokens";

const RT_DEBUG = import.meta.env.DEV;

function rtDebug(message: string, extra?: Record<string, unknown>): void {
  if (!RT_DEBUG) return;
  if (extra && Object.keys(extra).length > 0) {
    console.debug(`[UserRealtime] ${message}`, extra);
  } else {
    console.debug(`[UserRealtime] ${message}`);
  }
}

export interface UserRealtimeEvent {
  event_type: string;
  payload?: Record<string, unknown>;
}

type RealtimeInbound =
  | { type: "snapshot"; data: { latest_sequence?: number; events?: unknown[] } }
  | { type: "event"; data: UserRealtimeEvent }
  | { type: "replay"; data?: unknown[] }
  | { type: "ack"; data?: Record<string, unknown> }
  | { type: "error"; error?: string }
  | { type: "ping"; ts?: string }
  | { type: "pong" };

export interface UserRealtimeClientOptions {
  tenantId: string;
  token?: string | null;
  initialSequence?: number;
  heartbeatMs?: number;
  reconnectMaxDelayMs?: number;
  onEvent?: (event: UserRealtimeEvent) => void;
  onError?: (message: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

function buildWsUrl(path: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

function randomCorrelationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class UserRealtimeClient {
  private readonly opts: UserRealtimeClientOptions;
  private ws: WebSocket | null = null;
  private stopped = false;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private lastSequence: number;
  private readonly heartbeatMs: number;
  private readonly reconnectMaxDelayMs: number;
  private shouldReconnect = true;

  constructor(options: UserRealtimeClientOptions) {
    this.opts = options;
    this.lastSequence = options.initialSequence ?? 0;
    this.heartbeatMs = Math.max(10_000, options.heartbeatMs ?? 20_000);
    this.reconnectMaxDelayMs = Math.max(3_000, options.reconnectMaxDelayMs ?? 30_000);
  }

  connect() {
    this.stopped = false;
    void this.prepareAndOpen();
  }

  /**
   * Align with {@link apiFetch}: refresh the access token when it is missing or near expiry
   * before opening the WebSocket. Query-string auth cannot use a stale JWT while HTTP keeps
   * working after a silent 401 refresh.
   */
  private async prepareAndOpen() {
    if (this.stopped) return;
    if (this.opts.token == null) {
      const ok = await ensureFreshAccessToken(60);
      if (this.stopped) return;
      if (!ok) {
        rtDebug("prepareAndOpen: ensureFreshAccessToken failed (sign in again)");
        this.opts.onError?.("Session expired; cannot connect realtime.");
        return;
      }
    }
    if (this.stopped) return;
    this.openSocket();
  }

  disconnect() {
    this.stopped = true;
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const sock = this.ws;
    if (sock) {
      sock.onopen = null;
      sock.onclose = null;
      sock.onerror = null;
      sock.onmessage = null;
      if (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CLOSING) {
        sock.close();
      }
    }
    this.ws = null;
  }

  getLastSequence(): number {
    return this.lastSequence;
  }

  private send(type: string, payload: Record<string, unknown> = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(
      JSON.stringify({
        type,
        correlation_id: randomCorrelationId(),
        ...payload,
      }),
    );
    return true;
  }

  private openSocket() {
    const token = this.opts.token ?? getAccessToken();
    if (!token) {
      rtDebug("aborted: no access token");
      this.opts.onError?.("Missing access token for realtime connection.");
      return;
    }
    const decoded = decodeToken(token);
    const calTz = browserCalendarTimeZone();
    const childCtx = getChildContextStudentId();
    const expired = isTokenExpired(token);
    rtDebug("connecting", {
      tenantId: this.opts.tenantId,
      tokenSource: this.opts.token != null ? "options" : "localStorage",
      subType: decoded?.sub_type,
      role: decoded?.role,
      accessExp: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null,
      isExpired: expired,
      lastSequence: this.lastSequence,
      calendarTz: calTz,
      childContextStudentId: childCtx ? `${childCtx.slice(0, 8)}…` : null,
    });
    if (expired) {
      rtDebug(
        "access token past exp — skipping socket (refresh session or re-login)",
      );
      this.opts.onError?.("Session expired; cannot connect realtime.");
      return;
    }
    const params = new URLSearchParams({
      token,
      tenant_id: this.opts.tenantId,
      last_sequence: String(this.lastSequence),
    });
    if (calTz) {
      params.set("calendar_tz", calTz);
    }
    if (childCtx) {
      params.set("child_context", childCtx);
    }
    const url = buildWsUrl(`/api/v1/realtime/ws?${params.toString()}`);
    this.ws = new WebSocket(url);
    this.shouldReconnect = true;
    this.ws.onopen = () => {
      rtDebug("socket open");
      this.reconnectAttempt = 0;
      this.opts.onConnected?.();
      this.startHeartbeat();
    };
    this.ws.onclose = (evt) => {
      rtDebug("socket closed", {
        code: evt.code,
        reason: evt.reason || "(empty)",
        wasClean: evt.wasClean,
      });
      this.stopHeartbeat();
      this.opts.onDisconnected?.();
      // 1008 = policy violation (auth/tenant mismatch). Don't spam retries.
      if (evt.code === 1008) {
        this.shouldReconnect = false;
        this.opts.onError?.("Realtime authorization failed.");
      }
      if (!this.stopped && this.shouldReconnect) this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      rtDebug("socket error event");
      if (!this.stopped) {
        this.opts.onError?.("Realtime connection error.");
      }
    };
    this.ws.onmessage = (evt) => {
      this.handleMessage(evt.data as string);
    };
  }

  private handleMessage(raw: string) {
    let parsed: RealtimeInbound;
    try {
      parsed = JSON.parse(raw) as RealtimeInbound;
    } catch {
      this.opts.onError?.("Received invalid realtime payload.");
      return;
    }
    if (parsed.type === "snapshot") {
      this.lastSequence = Math.max(this.lastSequence, parsed.data.latest_sequence ?? 0);
      return;
    }
    if (parsed.type === "event") {
      this.opts.onEvent?.(parsed.data);
      return;
    }
    if (parsed.type === "replay") {
      return;
    }
    if (parsed.type === "ack" || parsed.type === "error") {
      return;
    }
    if (parsed.type === "ping") {
      this.send("pong", {});
      return;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.send("presence.heartbeat", {});
    }, this.heartbeatMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer != null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer != null) return;
    const base = Math.min(this.reconnectMaxDelayMs, 1000 * 2 ** this.reconnectAttempt);
    const jitter = Math.floor(Math.random() * 500);
    const delay = Math.min(this.reconnectMaxDelayMs, base + jitter);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) void this.prepareAndOpen();
    }, delay);
  }
}
