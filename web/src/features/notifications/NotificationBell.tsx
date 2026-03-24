import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAccessToken } from "../../lib/tokens";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import { useTenantRealtime } from "../../hooks/useTenantRealtime";
import {
  getUnreadNotificationCount,
  listNotifications,
  markNotificationRead,
  type NotificationRecord,
} from "../../lib/api/notifications";
import {
  getNotificationActionLabel,
  getNotificationActionPath,
} from "./notificationActions";
import { AppTooltip } from "../../components/ui";
import "./notifications.css";

const DROPDOWN_LIMIT = 8;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? user?.tenantId;
  const [open, setOpen] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (forbidden) return;
    if (!getAccessToken()) {
      setUnread(0);
      setItems([]);
      setTotal(0);
      return;
    }
    try {
      const [countRes, listRes] = await Promise.all([
        getUnreadNotificationCount(),
        listNotifications({ limit: DROPDOWN_LIMIT, skip: 0 }),
      ]);
      setUnread(countRes.unread_count);
      setItems(listRes.items);
      setTotal(listRes.total);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/forbidden|missing permission|403/i.test(msg)) {
        setForbidden(true);
        return;
      }
      if (/401|session expired|unauthorized/i.test(msg)) {
        setUnread(0);
        setItems([]);
        setTotal(0);
        return;
      }
      setUnread(0);
      setItems([]);
      setTotal(0);
    }
  }, [forbidden]);

  useTenantRealtime({
    tenantId,
    enabled: Boolean(user && tenantId && !forbidden),
    onNotificationsInvalidate: refresh,
  });

  useEffect(() => {
    if (!user || forbidden) return undefined;
    void refresh();
    return undefined;
  }, [user, forbidden, refresh]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (open && !forbidden) void refresh();
  }, [open, forbidden, refresh]);

  const onPick = async (n: NotificationRecord) => {
    if (!n.is_read) {
      try {
        await markNotificationRead(n.id);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
        setUnread((u) => Math.max(0, u - 1));
      } catch {
        /* ignore */
      }
    }
    const actionPath = getNotificationActionPath(n);
    setOpen(false);
    if (actionPath) {
      navigate(actionPath);
    }
  };

  if (forbidden) {
    return null;
  }

  return (
    <div className="notif-bell" ref={wrapRef}>
      <AppTooltip
        title="Notifications"
        description="See announcements, grades, and classroom updates."
        placement="bottom"
        disabled={open}
      >
        <button
          type="button"
          className="dash-header__icon-btn notif-bell__trigger"
          aria-label="Notifications"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((o) => !o)}
        >
          <img
            src="/assets/cartoon-icons/Bell.png"
            alt=""
            className="notif-bell__icon"
            aria-hidden
          />
          {unread > 0 ? (
            <span className="notif-bell__badge" aria-hidden>
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </AppTooltip>

      {open && (
        <div className="notif-bell__panel" role="menu">
          <div className="notif-bell__head">
            <span className="notif-bell__title">Notifications</span>
          </div>

          <ul className="notif-bell__list">
            {items.length === 0 ? (
              <li className="notif-bell__empty">You&apos;re all caught up.</li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    role="menuitem"
                    className={`notif-bell__item ${!n.is_read ? "notif-bell__item--unread" : ""}`}
                    onClick={() => onPick(n)}
                  >
                    <span className="notif-bell__item-title">{n.title}</span>
                    {n.body ? (
                      <span className="notif-bell__item-body">{n.body}</span>
                    ) : null}
                    {getNotificationActionPath(n) ? (
                      <span className="notif-bell__item-action">
                        {getNotificationActionLabel(n)}
                      </span>
                    ) : null}
                    <span className="notif-bell__item-time">{formatWhen(n.created_at)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="notif-bell__footer">
            <Link
              to="/app/notifications"
              className="notif-bell__see-all"
              onClick={() => setOpen(false)}
            >
              View all
              {total > DROPDOWN_LIMIT ? ` (${total})` : ""}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
