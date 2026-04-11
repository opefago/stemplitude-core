import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import { useTenantRealtime } from "../../hooks/useTenantRealtime";
import { emitMessagesInvalidate } from "../../lib/messagesInvalidate";

/**
 * Keeps one tenant user WebSocket subscription for `messages.changed` for every
 * staff/parent session (including child mode, where the header bell is hidden).
 * Messaging UI subscribes via {@link emitMessagesInvalidate} listeners.
 */
export function TenantMessagesRealtimeBridge() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? user?.tenantId ?? null;

  useTenantRealtime({
    tenantId,
    enabled: Boolean(user && tenantId && user.subType === "user"),
    onMessagesInvalidate: (payload) => {
      const cid =
        typeof payload?.conversation_id === "string"
          ? payload.conversation_id
          : undefined;
      emitMessagesInvalidate(cid ? { conversation_id: cid } : {});
    },
  });

  return null;
}
