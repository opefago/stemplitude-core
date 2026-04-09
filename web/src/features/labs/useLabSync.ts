/**
 * useLabSync — Yjs collaborative sync hook for virtual labs.
 *
 * Supports two room modes:
 *   Solo  (default):  lab:solo:{actorId}:{sessionId}  — one writer, N observers
 *   Group (explicit): lab:group:{groupId}:{sessionId}  — all group members write
 *
 * The room is addressed via an explicit `roomId` parameter.  Helper functions
 * `buildSoloRoomId` and `buildGroupRoomId` produce the correct IDs.
 *
 * Writer mode (readOnly=false): only authorised actors for the room.
 * Observer mode (readOnly=true): instructor or enrolled student.
 *
 * Token refresh: when the WebSocket disconnects (e.g. expired JWT), the hook
 * reads a fresh token from getAccessToken() and reconnects automatically.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { decodeToken, getAccessToken } from "../../lib/tokens";
import { getChildContextStudentId } from "../../lib/childContext";

export interface LabSyncHandle {
  ydoc: Y.Doc;
  provider: WebsocketProvider | null;
  isConnected: boolean;
}

// ─── Room ID helpers ─────────────────────────────────────────────────────────

/** Solo room: one student is the writer, others may only observe. */
export function buildSoloRoomId(actorId: string, sessionId: string): string {
  return `lab:solo:${actorId}:${sessionId}`;
}

/** Group room: all enrolled group members may write concurrently. */
export function buildGroupRoomId(groupId: string, sessionId: string): string {
  return `lab:group:${groupId}:${sessionId}`;
}

// ─── Internal config ─────────────────────────────────────────────────────────

function buildYjsConfig(
  roomName: string,
  readOnly: boolean,
): { serverUrl: string; roomName: string; params: Record<string, string> } {
  const token = getAccessToken() ?? "";
  const tenantId = localStorage.getItem("tenant_id") ?? "";
  const base = window.location.origin.replace(/^http/, "ws");
  return {
    serverUrl: `${base}/api/v1/labs/sync`,
    roomName,
    params: {
      token,
      tenant_id: tenantId,
      read_only: readOnly ? "1" : "0",
    },
  };
}

/** Decode actor ID from the stored access token. */
export function getLocalActorId(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  const payload = decodeToken(token);
  return payload?.sub ?? null;
}

const TOKEN_REFRESH_CHECK_MS = 30_000;
const MAX_DISCONNECT_BEFORE_REFRESH_MS = 5_000;

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Connect a Y.Doc to a lab Yjs sync room.
 *
 * @param roomId    - Explicit room ID produced by `buildSoloRoomId` or
 *                    `buildGroupRoomId`.  When `null` and not readOnly, falls
 *                    back to a solo room for the current user (backward compat).
 * @param sessionId - UUID of the classroom session.  Required when `roomId` is null.
 * @param readOnly  - true = observer mode (instructor watching a student/group).
 * @param enabled   - false = skip connection entirely (standalone lab use).
 */
export function useLabSync(
  roomId: string | null | undefined,
  sessionId: string | null | undefined,
  readOnly = false,
  enabled = true,
): LabSyncHandle {
  // When a parent is in learner view (child context), use the child's student
  // ID so the room matches what the observer connects to.
  const effectiveActorId = getChildContextStudentId() || getLocalActorId() || "";
  const resolvedRoomId = roomId ?? (
    !readOnly && sessionId
      ? buildSoloRoomId(effectiveActorId, sessionId)
      : null
  );

  const ydocRef = useRef<Y.Doc>(new Y.Doc());
  const providerRef = useRef<WebsocketProvider | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [tokenEpoch, setTokenEpoch] = useState(0);
  const disconnectedAtRef = useRef<number | null>(null);

  const refreshTokenIfNeeded = useCallback(() => {
    const provider = providerRef.current;
    if (!provider || provider.wsconnected) {
      disconnectedAtRef.current = null;
      return;
    }

    if (disconnectedAtRef.current === null) {
      disconnectedAtRef.current = Date.now();
      return;
    }

    if (Date.now() - disconnectedAtRef.current < MAX_DISCONNECT_BEFORE_REFRESH_MS) {
      return;
    }

    const freshToken = getAccessToken() ?? "";
    const currentToken = (provider.params as Record<string, string>).token ?? "";
    if (freshToken && freshToken !== currentToken) {
      disconnectedAtRef.current = null;
      setTokenEpoch((e) => e + 1);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !resolvedRoomId) return;

    const ydoc = ydocRef.current;
    const { serverUrl, roomName, params } = buildYjsConfig(resolvedRoomId, readOnly);

    const provider = new WebsocketProvider(serverUrl, roomName, ydoc, {
      connect: true,
      params,
    });
    providerRef.current = provider;

    provider.on("status", ({ status }: { status: string }) => {
      setIsConnected(status === "connected");
      if (status === "connected") {
        disconnectedAtRef.current = null;
      }
    });

    if (readOnly) {
      provider.awareness.setLocalStateField("isObserver", true);
    }

    const refreshTimer = window.setInterval(refreshTokenIfNeeded, TOKEN_REFRESH_CHECK_MS);

    return () => {
      window.clearInterval(refreshTimer);
      provider.disconnect();
      provider.destroy();
      providerRef.current = null;
      setIsConnected(false);
      disconnectedAtRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedRoomId, readOnly, enabled, tokenEpoch]);

  return {
    ydoc: ydocRef.current,
    provider: providerRef.current,
    isConnected,
  };
}
