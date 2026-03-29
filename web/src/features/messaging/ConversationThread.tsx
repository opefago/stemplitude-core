import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { Hash, Send, Settings2, Users } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import {
  getConversation,
  listConversationMessages,
  markConversationRead,
  sendConversationMessage,
  type Conversation,
  type ConversationMessage,
} from "../../lib/api/messaging";
import { GroupManageModal } from "./GroupManageModal";
import { subscribeMessagesInvalidate } from "../../lib/messagesInvalidate";
import "./messaging.css";

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
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

/** Group consecutive messages from the same sender (within 5 minutes) */
function groupMessages(messages: ConversationMessage[]) {
  type Group = {
    sender_id: string;
    sender_name: string;
    message_type: "text" | "system";
    messages: ConversationMessage[];
    groupTime: string;
  };
  const groups: Group[] = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    const sameBlock =
      last &&
      last.sender_id === msg.sender_id &&
      last.message_type === msg.message_type &&
      new Date(msg.created_at).getTime() - new Date(last.groupTime).getTime() < 5 * 60 * 1000;

    if (sameBlock) {
      last.messages.push(msg);
      last.groupTime = msg.created_at;
    } else {
      groups.push({
        sender_id: msg.sender_id,
        sender_name: msg.sender_name,
        message_type: msg.message_type,
        messages: [msg],
        groupTime: msg.created_at,
      });
    }
  }
  return groups;
}

interface OutletCtx {
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
}

export function ConversationThread() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const ctx = useOutletContext<OutletCtx | null>();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const setConvFromOutletRef = useRef<OutletCtx["setConversations"] | undefined>(
    undefined,
  );
  setConvFromOutletRef.current = ctx?.setConversations;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const mergeConversationIntoSidebar = useCallback((conv: Conversation | null) => {
    if (!conv) return;
    setConvFromOutletRef.current?.((prev) => {
      const rest = prev.filter((c) => c.id !== conv.id);
      return [conv, ...rest];
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setConversation(null);
    void (async () => {
      try {
        const [conv, msgs] = await Promise.all([
          getConversation(id),
          listConversationMessages(id, { limit: 100 }),
        ]);
        if (cancelled) return;
        if (!conv) {
          setConversation(null);
          setMessages([]);
        } else {
          setConversation(conv);
          setMessages(msgs.items);
          mergeConversationIntoSidebar(conv);
        }
        void markConversationRead(id).catch(() => {});
      } catch {
        if (!cancelled) {
          setConversation(null);
          setMessages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, mergeConversationIntoSidebar]);

  const refreshThreadSilent = useCallback(async () => {
    if (!id) return;
    try {
      const [conv, msgs] = await Promise.all([
        getConversation(id),
        listConversationMessages(id, { limit: 100 }),
      ]);
      if (!conv) return;
      setConversation(conv);
      setMessages(msgs.items);
      mergeConversationIntoSidebar(conv);
      void markConversationRead(id).catch(() => {});
    } catch {
      /* keep showing prior messages */
    }
  }, [id, mergeConversationIntoSidebar]);

  useEffect(() => {
    return subscribeMessagesInvalidate((detail) => {
      if (!id) return;
      const cid = detail.conversation_id;
      if (cid && cid !== id) return;
      void refreshThreadSilent();
    });
  }, [id, refreshThreadSilent]);

  // Scroll to bottom when messages load/change
  useEffect(() => {
    scrollToBottom("instant");
  }, [messages.length, scrollToBottom]);

  const handleSend = async () => {
    if (!inputValue.trim() || !id || sending) return;
    const body = inputValue.trim();
    setInputValue("");
    setSending(true);

    // Optimistic update
    if (user) {
      const optimistic: ConversationMessage = {
        id: `optimistic-${Date.now()}`,
        conversation_id: id,
        sender_id: user.id,
        sender_name: `${user.firstName} ${user.lastName}`,
        body,
        message_type: "text",
        is_read: true,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
    }

    try {
      const sent = await sendConversationMessage(id, body);
      setMessages((prev) => {
        // Replace optimistic entry
        const filtered = prev.filter((m) => !m.id.startsWith("optimistic-"));
        return [...filtered, sent];
      });
    } catch {
      // Roll back optimistic
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("optimistic-")));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="msg-thread msg-thread--loading" aria-live="polite">
        <div className="msg-thread__loading-dots">
          <span /><span /><span />
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="msg-thread msg-thread--error">
        <p>Conversation not found or you don't have access.</p>
      </div>
    );
  }

  const isGroup = conversation.type === "group";
  const groups = groupMessages(messages);
  const currentUserId = user?.id;
  const canManage = isGroup && user?.role != null && ["admin", "owner", "instructor"].includes(user.role);
  const canDelete = isGroup && user?.role != null && ["admin", "owner"].includes(user.role);

  return (
    <div className="msg-thread">
      {/* Header */}
      <header className="msg-thread__header">
        <div className="msg-thread__header-left">
          <div className="msg-thread__header-icon" aria-hidden>
            {isGroup ? (
              <Hash size={18} />
            ) : (
              <span
                className="msg-thread__header-avatar"
                style={{ background: avatarColor(conversation.display_name) }}
              >
                {getInitials(conversation.display_name)}
              </span>
            )}
          </div>
          <div>
            <h1 className="msg-thread__title">{conversation.display_name}</h1>
            {isGroup && (
              <p className="msg-thread__subtitle">
                {conversation.members.filter((m) => !m.left_at).length} member
                {conversation.members.filter((m) => !m.left_at).length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>

        {isGroup && (
          <div className="msg-thread__header-actions">
            <button
              type="button"
              className={`msg-thread__members-btn ${showMembers ? "msg-thread__members-btn--active" : ""}`}
              onClick={() => setShowMembers((v) => !v)}
              aria-label="Toggle member list"
              aria-pressed={showMembers}
            >
              <Users size={16} aria-hidden />
              <span>Members</span>
            </button>
            {canManage && (
              <button
                type="button"
                className="msg-thread__members-btn"
                onClick={() => setManageOpen(true)}
                aria-label="Manage group"
              >
                <Settings2 size={16} aria-hidden />
                <span>Manage</span>
              </button>
            )}
          </div>
        )}
      </header>

      <div className="msg-thread__body">
        {/* Messages area */}
        <div className="msg-thread__messages" role="log" aria-live="polite" aria-label="Chat messages">
          {messages.length === 0 && !loading && (
            <div className="msg-thread__welcome">
              <div className="msg-thread__welcome-icon" aria-hidden>
                {isGroup ? "📚" : "👋"}
              </div>
              <h2 className="msg-thread__welcome-title">
                {isGroup
                  ? `Welcome to #${conversation.display_name}!`
                  : `Start a conversation with ${conversation.display_name}`}
              </h2>
              <p className="msg-thread__welcome-desc">
                {isGroup
                  ? "This is the beginning of the class channel. Say hello!"
                  : "Send your first message below."}
              </p>
            </div>
          )}

          {groups.map((group, gi) => {
            if (group.message_type === "system") {
              return (
                <div key={`group-${gi}`} className="msg-thread__system-group">
                  {group.messages.map((msg) => (
                    <div key={msg.id} className="msg-thread__system-msg" role="status">
                      <span>{msg.body}</span>
                    </div>
                  ))}
                </div>
              );
            }

            const isMine = group.sender_id === currentUserId;
            const avatarName = isMine
              ? `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()
              : group.sender_name;

            return (
              <div
                key={`group-${gi}`}
                className={`msg-thread__group ${isMine ? "msg-thread__group--mine" : "msg-thread__group--theirs"}`}
              >
                {/* Avatar — left for theirs, right for mine (flex-direction handles side) */}
                <div
                  className={`msg-thread__group-avatar${isMine ? " msg-thread__group-avatar--mine" : ""}`}
                  style={{ background: avatarColor(avatarName) }}
                  aria-hidden
                >
                  {getInitials(avatarName)}
                </div>

                <div className="msg-thread__group-content">
                  {!isMine && (
                    <span className="msg-thread__sender-name">{group.sender_name}</span>
                  )}

                  <div className="msg-thread__bubbles">
                    {group.messages.map((msg, mi) => {
                      const isLast = mi === group.messages.length - 1;
                      return (
                        <div
                          key={msg.id}
                          className={[
                            "msg-thread__bubble",
                            isMine ? "msg-thread__bubble--mine" : "msg-thread__bubble--theirs",
                            mi === 0 ? "msg-thread__bubble--first" : "",
                            isLast ? "msg-thread__bubble--last" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <span className="msg-thread__bubble-text">{msg.body}</span>
                          {isLast && (
                            <span className="msg-thread__bubble-ts">
                              {formatTime(msg.created_at)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

              <div ref={messagesEndRef} aria-hidden />
        </div>

        {/* Members panel */}
        {showMembers && isGroup && (
          <aside className="msg-thread__members-panel" aria-label="Channel members">
            <h2 className="msg-thread__members-title">
              Members · {conversation.members.filter((m) => !m.left_at).length}
            </h2>
            <ul className="msg-thread__members-list">
              {conversation.members
                .filter((m) => !m.left_at)
                .map((m) => (
                  <li key={String(m.user_id)} className="msg-thread__member-item">
                    <div
                      className="msg-thread__member-avatar"
                      style={{ background: avatarColor(m.name) }}
                      aria-hidden
                    >
                      {getInitials(m.name)}
                    </div>
                    <span className="msg-thread__member-name">{m.name}</span>
                  </li>
                ))}
            </ul>
          </aside>
        )}
      </div>

      {/* Input bar */}
      <div className="msg-thread__input-bar">
        <textarea
          ref={inputRef}
          className="msg-thread__input"
          placeholder={`Message ${isGroup ? `#${conversation.display_name}` : conversation.display_name}…`}
          value={inputValue}
          rows={1}
          onChange={(e) => {
            setInputValue(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={handleKeyDown}
          aria-label="Message input"
          disabled={sending}
        />
        <button
          type="button"
          className="msg-thread__send-btn"
          onClick={handleSend}
          disabled={!inputValue.trim() || sending}
          aria-label="Send message"
        >
          <Send size={18} aria-hidden />
        </button>
      </div>

      {/* Group management modal */}
      {isGroup && manageOpen && (
        <GroupManageModal
          isOpen={manageOpen}
          onClose={() => setManageOpen(false)}
          conversation={conversation}
          canDelete={canDelete}
          onUpdated={(updated) => setConversation(updated)}
          onDeleted={() => setConversation(null)}
        />
      )}
    </div>
  );
}
