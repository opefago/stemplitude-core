import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Link, Outlet, useParams, useSearchParams } from "react-router-dom";
import { Hash, MessageSquarePlus, Search, Users } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import {
  listConversations,
  type Conversation,
} from "../../lib/api/messaging";
import {
  listNotifications,
  type NotificationRecord,
} from "../../lib/api/notifications";
import { ComposeModal } from "./ComposeModal";
import { ParentEventsHub, useParentEventsWeekIndicator } from "./ParentEventsHub";
import { ParentAttendancePanel } from "../parent/ParentAttendancePanel";
import { subscribeMessagesInvalidate } from "../../lib/messagesInvalidate";
import "./messaging.css";

type HubTab = "updates" | "messages" | "events" | "attendance";

const PARENT_HUB_TABS: readonly HubTab[] = [
  "updates",
  "messages",
  "events",
  "attendance",
] as const;

function isParentHubTab(value: string | null): value is HubTab {
  return value != null && (PARENT_HUB_TABS as readonly string[]).includes(value);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "#1cb0f6",
  "#58cc02",
  "#ff9600",
  "#ff4b4b",
  "#a560f0",
  "#235390",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface ConvItemProps {
  conv: Conversation;
  active: boolean;
}

function ConvItem({ conv, active }: ConvItemProps) {
  const isGroup = conv.type === "group";
  const color = avatarColor(conv.display_name);
  const initials = getInitials(conv.display_name);
  const hasUnread = conv.unread_count > 0;

  return (
    <Link
      to={`/app/messages/${conv.id}`}
      className={[
        "msg-sidebar__item",
        active ? "msg-sidebar__item--active" : "",
        hasUnread ? "msg-sidebar__item--unread" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-current={active ? "page" : undefined}
    >
      <div
        className={`msg-sidebar__avatar ${isGroup ? "msg-sidebar__avatar--group" : ""}`}
        style={isGroup ? undefined : { background: color }}
        aria-hidden
      >
        {isGroup ? <Hash size={15} /> : initials}
      </div>

      <div className="msg-sidebar__item-body">
        <div className="msg-sidebar__item-top">
          <span className="msg-sidebar__item-name">{conv.display_name}</span>
          {conv.last_message && (
            <span className="msg-sidebar__item-time">
              {timeAgo(conv.last_message.created_at)}
            </span>
          )}
        </div>
        {conv.last_message && (
          <p className="msg-sidebar__item-preview">
            {conv.last_message.message_type === "system" ? (
              <em>{conv.last_message.body}</em>
            ) : (
              <>
                {conv.last_message.sender_name.split(" ")[0]}:{" "}
                {conv.last_message.body}
              </>
            )}
          </p>
        )}
      </div>

      {hasUnread && (
        <span className="msg-sidebar__badge" aria-label={`${conv.unread_count} unread`}>
          {conv.unread_count > 99 ? "99+" : conv.unread_count}
        </span>
      )}
    </Link>
  );
}

export function Inbox({ variant = "default" }: { variant?: "default" | "parent" }) {
  const { id: activeId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [hubTab, setHubTab] = useState<HubTab>("messages");
  const [updates, setUpdates] = useState<NotificationRecord[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const limit = 100;
      let skip = 0;
      const all: Conversation[] = [];
      for (;;) {
        const res = await listConversations({ skip, limit });
        all.push(...res.items);
        if (res.items.length < limit || all.length >= res.total) break;
        skip += limit;
      }
      setConversations(all);
    } catch {
      /* keep prior list */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (variant !== "parent" || !activeId) return;
    setHubTab("messages");
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("hub");
        return next;
      },
      { replace: true },
    );
  }, [variant, activeId, setSearchParams]);

  useLayoutEffect(() => {
    if (variant !== "parent" || activeId) return;
    const raw = searchParams.get("hub");
    if (isParentHubTab(raw)) setHubTab(raw);
    else setHubTab("messages");
  }, [variant, activeId, searchParams]);

  const selectParentHubTab = useCallback(
    (key: HubTab) => {
      setHubTab(key);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (key === "messages") next.delete("hub");
          else next.set("hub", key);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    return subscribeMessagesInvalidate(() => {
      void loadConversations();
    });
  }, [loadConversations]);

  useEffect(() => {
    if (variant !== "parent" || hubTab !== "updates") return;
    let mounted = true;
    setUpdatesLoading(true);
    listNotifications({ limit: 40 })
      .then((res) => {
        if (mounted) setUpdates(res.items);
      })
      .catch(() => {
        if (mounted) setUpdates([]);
      })
      .finally(() => {
        if (mounted) setUpdatesLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [variant, hubTab]);

  const filtered = conversations.filter((c) =>
    c.display_name.toLowerCase().includes(search.toLowerCase())
  );

  const classChannels = filtered.filter((c) => c.type === "group");
  const directMessages = filtered.filter((c) => c.type === "dm");

  const hasConversation = !!activeId;
  const isParentHub = variant === "parent";
  const eventsWeekIndicator = useParentEventsWeekIndicator(isParentHub);

  return (
    <div
      className={
        isParentHub ? "msg-layout msg-layout--parent-hub" : "msg-layout"
      }
    >
      {isParentHub ? (
        <div className="msg-hub-tabs" role="tablist" aria-label="Updates and messages">
          {(
            [
              ["updates", "Updates"],
              ["messages", "Messages"],
              ["events", "Events"],
              ["attendance", "Attendance"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={hubTab === key}
              className={`msg-hub-tabs__btn${hubTab === key ? " msg-hub-tabs__btn--active" : ""}`}
              onClick={() => selectParentHubTab(key)}
            >
              <span className="msg-hub-tabs__btn-inner">
                {label}
                {key === "events" && eventsWeekIndicator ? (
                  <span
                    className="msg-hub-tabs__events-dot"
                    aria-label="Class session scheduled this week"
                  />
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {isParentHub && hubTab === "updates" ? (
        <main className="msg-hub-panel" aria-label="Important updates">
          <h2 className="msg-hub-panel__title">Important updates</h2>
          <p className="msg-hub-panel__desc">
            Notifications from your school and workspace. For threads, open the Messages
            tab.
          </p>
          {updatesLoading ? (
            <p className="msg-hub-panel__muted">Loading…</p>
          ) : updates.length === 0 ? (
            <p className="msg-hub-panel__muted">No notifications yet.</p>
          ) : (
            <ul className="msg-hub-updates" role="list">
              {updates.map((n) => (
                <li key={n.id} className="msg-hub-updates__item" role="listitem">
                  <span className="msg-hub-updates__title">{n.title}</span>
                  {n.body ? (
                    <span className="msg-hub-updates__body">{n.body}</span>
                  ) : null}
                  <span className="msg-hub-updates__time">
                    {timeAgo(n.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/app/notifications" className="msg-hub-panel__link">
            Open all notifications
          </Link>
        </main>
      ) : null}

      {isParentHub && hubTab === "events" ? <ParentEventsHub /> : null}

      {isParentHub && hubTab === "attendance" ? <ParentAttendancePanel /> : null}

      {/* ── Sidebar + compose + thread ──────────────────────────────────── */}
      {(!isParentHub || hubTab === "messages") && (
      <div
        className={
          isParentHub ? "msg-layout__split" : "msg-layout__split--pass"
        }
      >
      <aside className="msg-sidebar" aria-label="Conversations">
        <div className="msg-sidebar__header">
          <div className="msg-sidebar__title-row">
            <span className="msg-sidebar__title">Messages</span>
            <button
              type="button"
              className="msg-sidebar__compose-btn"
              aria-label="New message"
              title="New message or group"
              onClick={() => setComposeOpen(true)}
            >
              <MessageSquarePlus size={18} />
            </button>
          </div>
          <div className="msg-sidebar__search-wrap">
            <Search size={14} className="msg-sidebar__search-icon" aria-hidden />
            <input
              type="search"
              className="msg-sidebar__search"
              placeholder="Search conversations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search conversations"
            />
          </div>
        </div>

        <nav className="msg-sidebar__nav">
          {loading ? (
            <div className="msg-sidebar__loading" aria-live="polite">
              <span className="msg-sidebar__loading-dot" />
              <span className="msg-sidebar__loading-dot" />
              <span className="msg-sidebar__loading-dot" />
            </div>
          ) : (
            <>
              {classChannels.length > 0 && (
                <section className="msg-sidebar__section">
                  <h2 className="msg-sidebar__section-label">
                    <Hash size={11} aria-hidden /> Classes
                  </h2>
                  {classChannels.map((conv) => (
                    <ConvItem
                      key={conv.id}
                      conv={conv}
                      active={conv.id === activeId}
                    />
                  ))}
                </section>
              )}

              {directMessages.length > 0 && (
                <section className="msg-sidebar__section">
                  <h2 className="msg-sidebar__section-label">
                    <Users size={11} aria-hidden /> Direct Messages
                  </h2>
                  {directMessages.map((conv) => (
                    <ConvItem
                      key={conv.id}
                      conv={conv}
                      active={conv.id === activeId}
                    />
                  ))}
                </section>
              )}

              {!loading && filtered.length === 0 && (
                <div className="msg-sidebar__empty">
                  {search ? (
                    <p>No conversations match "{search}"</p>
                  ) : (
                    <p>No conversations yet. Join a class to get started!</p>
                  )}
                </div>
              )}
            </>
          )}
        </nav>
      </aside>

      <ComposeModal isOpen={composeOpen} onClose={() => setComposeOpen(false)} />

      {/* ── Main panel ──────────────────────────────────────────────────── */}
      <main className="msg-main" aria-label="Chat thread">
        {hasConversation ? (
          <Outlet context={{ conversations, setConversations }} />
        ) : (
          <div className="msg-empty-state">
            <div className="msg-empty-state__icon" aria-hidden>
              💬
            </div>
            <h2 className="msg-empty-state__title">Pick a conversation</h2>
            <p className="msg-empty-state__desc">
              Select a class channel or direct message from the sidebar to start chatting.
            </p>
            {user && (
              <p className="msg-empty-state__name">
                Signed in as <strong>{user.firstName}</strong>
              </p>
            )}
          </div>
        )}
      </main>
      </div>
      )}
    </div>
  );
}
