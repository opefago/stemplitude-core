import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, CheckCheck, Loader2 } from "lucide-react";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRecord,
} from "../../lib/api/notifications";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { useTenantRealtime } from "../../hooks/useTenantRealtime";
import {
  getNotificationActionLabel,
  getNotificationActionPath,
} from "./notificationActions";
import "./notifications.css";

const PAGE = 40;

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const { tenant } = useTenant();
  const { isPlatformView } = useWorkspace();
  const tenantId = tenant?.id ?? user?.tenantId;
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageSubtitle = useMemo(() => {
    if (user?.subType === "student") {
      return "Updates from your classes and school. Older items load in pages.";
    }
    if (user?.role === "instructor") {
      return "Updates from your school and classes. Older items load in pages.";
    }
    if (user?.role === "admin" || user?.role === "owner" || (isSuperAdmin && !isPlatformView)) {
      return "Organization and class-related updates. Older items load in pages.";
    }
    if (isSuperAdmin && isPlatformView) {
      return "Platform and organization notices. Older items load in pages.";
    }
    return "Recent updates. Older items load in pages to keep things fast.";
  }, [user, isSuperAdmin, isPlatformView]);

  const emptyStateHint = useMemo(() => {
    if (user?.subType === "student") {
      return "When your teachers or school share updates, they’ll show up here.";
    }
    if (user?.role === "parent" || user?.role === "homeschool_parent") {
      return "When your child’s teachers or school share updates, they’ll show up here.";
    }
    if (user?.role === "instructor") {
      return "School announcements, class alerts, and messages for you will show up here.";
    }
    if (user?.role === "admin" || user?.role === "owner" || (isSuperAdmin && !isPlatformView)) {
      return "Organization announcements, enrollment activity, and other alerts will show up here.";
    }
    if (isSuperAdmin && isPlatformView) {
      return "Cross-tenant and platform notices will show up here when available.";
    }
    return "Updates meant for you will show up here.";
  }, [user, isSuperAdmin, isPlatformView]);

  const load = useCallback(
    async (fromSkip: number, append: boolean) => {
      if (fromSkip === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const res = await listNotifications({ skip: fromSkip, limit: PAGE });
        setTotal(res.total);
        setSkip(fromSkip + res.items.length);
        if (append) {
          setItems((prev) => [...prev, ...res.items]);
        } else {
          setItems(res.items);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Could not load notifications.";
        setError(msg);
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  const refresh = useCallback(() => load(0, false), [load]);

  useEffect(() => {
    void load(0, false);
  }, [load]);

  useTenantRealtime({
    tenantId,
    enabled: Boolean(user && tenantId),
    onNotificationsInvalidate: refresh,
  });

  const hasMore = items.length < total;

  const onMarkRead = async (n: NotificationRecord) => {
    if (n.is_read) return;
    try {
      await markNotificationRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    } catch {
      /* ignore */
    }
  };

  const onOpenNotification = async (n: NotificationRecord) => {
    await onMarkRead(n);
    const actionPath = getNotificationActionPath(n);
    if (actionPath) {
      navigate(actionPath);
    }
  };

  const onMarkAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    } catch {
      /* ignore */
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadOnPage = items.filter((x) => !x.is_read).length;

  return (
    <div className="notifications-page">
      <header className="notifications-page__header">
        <Link to="/app" className="notifications-page__back">
          <ArrowLeft size={18} aria-hidden />
          Back
        </Link>
        <div className="notifications-page__head-row">
          <div className="notifications-page__head-title">
            <Bell size={22} aria-hidden className="notifications-page__head-icon" />
            <div>
              <h1 className="notifications-page__title">Notifications</h1>
              <p className="notifications-page__subtitle">{pageSubtitle}</p>
            </div>
          </div>
          {items.length > 0 && unreadOnPage > 0 ? (
            <button
              type="button"
              className="notifications-page__mark-all"
              onClick={() => void onMarkAll()}
              disabled={markingAll}
            >
              {markingAll ? (
                <Loader2 size={16} className="notifications-page__spin" aria-hidden />
              ) : (
                <CheckCheck size={16} aria-hidden />
              )}
              Mark all read
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="notifications-page__error" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="notifications-page__loading">
          <Loader2 size={28} className="notifications-page__spin" aria-hidden />
          <span>Loading…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="notifications-page__empty">
          <p>No notifications yet.</p>
          <p className="notifications-page__empty-hint">{emptyStateHint}</p>
        </div>
      ) : (
        <>
          <ul className="notifications-page__list">
            {items.map((n) => (
              <li key={n.id}>
                <article
                  className={`notifications-page__card ${!n.is_read ? "notifications-page__card--unread" : ""}`}
                >
                  <div className="notifications-page__card-main">
                    <h2 className="notifications-page__card-title">{n.title}</h2>
                    {n.body ? <p className="notifications-page__card-body">{n.body}</p> : null}
                    <time className="notifications-page__card-time" dateTime={n.created_at}>
                      {formatWhen(n.created_at)}
                    </time>
                  </div>
                  <div className="notifications-page__card-actions">
                    {getNotificationActionPath(n) ? (
                      <button
                        type="button"
                        className="notifications-page__card-action notifications-page__card-action--open"
                        onClick={() => void onOpenNotification(n)}
                      >
                        {getNotificationActionLabel(n)}
                      </button>
                    ) : null}
                    {!n.is_read ? (
                      <button
                        type="button"
                        className="notifications-page__card-action"
                        onClick={() => void onMarkRead(n)}
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </article>
              </li>
            ))}
          </ul>

          {hasMore ? (
            <div className="notifications-page__more">
              <button
                type="button"
                className="notifications-page__load-more"
                disabled={loadingMore}
                onClick={() => void load(skip, true)}
              >
                {loadingMore ? (
                  <>
                    <Loader2 size={16} className="notifications-page__spin" aria-hidden />
                    Loading…
                  </>
                ) : (
                  `Load more (${items.length} of ${total})`
                )}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
