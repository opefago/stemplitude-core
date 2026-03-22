import { useEffect, useRef } from "react";
import { UserRealtimeClient } from "../lib/api/userRealtime";

const FALLBACK_POLL_MS = 50_000;
const FALLBACK_START_DELAY_MS = 8_000;

export interface UseTenantRealtimeOptions {
  tenantId: string | null | undefined;
  enabled?: boolean;
  /** Server signaled classroom session / active session changes. */
  onSessionsInvalidate?: () => void;
  /** Server signaled new or updated notifications (in-app inbox). */
  onNotificationsInvalidate?: () => void;
  /** Server signaled new messages / conversation updates. */
  onMessagesInvalidate?: () => void;
}

/**
 * Single user-scoped WebSocket per tab; when disconnected for a few seconds,
 * falls back to periodic polling. Refetches when the tab becomes visible while
 * the socket is down.
 */
export function useTenantRealtime(options: UseTenantRealtimeOptions): void {
  const {
    tenantId,
    enabled = true,
    onSessionsInvalidate,
    onNotificationsInvalidate,
    onMessagesInvalidate,
  } = options;
  const sessionsRef = useRef(onSessionsInvalidate);
  const notificationsRef = useRef(onNotificationsInvalidate);
  const messagesRef = useRef(onMessagesInvalidate);
  sessionsRef.current = onSessionsInvalidate;
  notificationsRef.current = onNotificationsInvalidate;
  messagesRef.current = onMessagesInvalidate;

  const pollTimerRef = useRef<number | null>(null);
  const fallbackStartRef = useRef<number | null>(null);
  const wsConnectedRef = useRef(false);

  const clearFallbackTimers = () => {
    if (pollTimerRef.current != null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (fallbackStartRef.current != null) {
      window.clearTimeout(fallbackStartRef.current);
      fallbackStartRef.current = null;
    }
  };

  const runAllInvalidations = () => {
    sessionsRef.current?.();
    notificationsRef.current?.();
    messagesRef.current?.();
  };

  const startFallbackPoll = () => {
    clearFallbackTimers();
    pollTimerRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        runAllInvalidations();
      }
    }, FALLBACK_POLL_MS);
  };

  const scheduleFallbackIfStillDisconnected = () => {
    clearFallbackTimers();
    fallbackStartRef.current = window.setTimeout(() => {
      fallbackStartRef.current = null;
      if (wsConnectedRef.current) return;
      startFallbackPoll();
    }, FALLBACK_START_DELAY_MS);
  };

  useEffect(() => {
    if (!enabled || !tenantId) {
      return undefined;
    }

    const client = new UserRealtimeClient({
      tenantId,
      onConnected: () => {
        wsConnectedRef.current = true;
        clearFallbackTimers();
      },
      onDisconnected: () => {
        wsConnectedRef.current = false;
        scheduleFallbackIfStillDisconnected();
      },
      onEvent: (evt) => {
        if (evt.event_type === "sessions.changed") {
          sessionsRef.current?.();
        } else if (evt.event_type === "notifications.changed") {
          notificationsRef.current?.();
        } else if (evt.event_type === "messages.changed") {
          messagesRef.current?.();
        }
      },
      onError: () => {
        /* reconnect loop handles recovery */
      },
    });

    client.connect();

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!wsConnectedRef.current) {
        runAllInvalidations();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearFallbackTimers();
      client.disconnect();
      wsConnectedRef.current = false;
    };
  }, [tenantId, enabled]);
}
