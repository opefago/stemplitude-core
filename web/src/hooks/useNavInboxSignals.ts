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
  const { user } = useAuth();
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? user?.tenantId;
  const [unreadChatThreads, setUnreadChatThreads] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const limit = 100;
      let skip = 0;
      const convItems: Conversation[] = [];
      for (;;) {
        const conv = await listConversations({ skip, limit }).catch(() => ({
          items: [],
          total: 0,
          skip: 0,
          limit,
        }));
        convItems.push(...conv.items);
        if (conv.items.length < limit || convItems.length >= conv.total) break;
        skip += limit;
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
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setUnreadChatThreads(0);
      setUnreadNotifications(0);
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
