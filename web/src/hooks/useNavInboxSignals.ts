import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import { useTenant } from "../providers/TenantProvider";
import { useTenantRealtime } from "./useTenantRealtime";
import { subscribeMessagesInvalidate } from "../lib/messagesInvalidate";
import {
  listConversations,
  type Conversation,
} from "../lib/api/messaging";
import { getUnreadNotificationCount } from "../lib/api/notifications";

/**
 * Unread chat threads and in-app notifications for sidebar / nav affordances.
 */
export function useNavInboxSignals() {
  const { user, subType } = useAuth();
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? user?.tenantId;
  const [unreadChatThreads, setUnreadChatThreads] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [chatForbidden, setChatForbidden] = useState(false);
  const canReadConversations = subType !== "student";

  const refresh = useCallback(async () => {
    try {
      const convItems: Conversation[] = [];
      if (canReadConversations && !chatForbidden) {
        const limit = 100;
        let skip = 0;
        for (;;) {
          try {
            const conv = await listConversations({ skip, limit });
            convItems.push(...conv.items);
            if (conv.items.length < limit || convItems.length >= conv.total) break;
            skip += limit;
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            if (/forbidden|missing permission|403/i.test(msg)) {
              setChatForbidden(true);
            }
            break;
          }
        }
      }
      const [notif] = await Promise.all([
        getUnreadNotificationCount().catch(() => ({ unread_count: 0 })),
      ]);
      const chatUnread = convItems.filter((c) => c.unread_count > 0).length;
      setUnreadChatThreads(chatUnread);
      setUnreadNotifications(notif.unread_count);
    } catch {
      setUnreadChatThreads(0);
      setUnreadNotifications(0);
    }
  }, [canReadConversations, chatForbidden]);

  useEffect(() => {
    if (!user?.id) {
      setUnreadChatThreads(0);
      setUnreadNotifications(0);
      setChatForbidden(false);
      return;
    }
    void refresh();
  }, [user?.id, refresh]);

  useTenantRealtime({
    tenantId,
    enabled: Boolean(user && tenantId),
    onSessionsInvalidate: refresh,
    onNotificationsInvalidate: refresh,
    onMessagesInvalidate: refresh,
  });

  useEffect(() => {
    return subscribeMessagesInvalidate(() => {
      void refresh();
    });
  }, [refresh]);

  return { unreadChatThreads, unreadNotifications, refresh };
}
