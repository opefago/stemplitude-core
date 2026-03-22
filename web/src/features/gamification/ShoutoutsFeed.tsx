import { useEffect, useState } from "react";
import { Star, Send, Loader2 } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import {
  listShoutouts,
  createShoutout,
  type ShoutoutItem,
  timeAgo,
} from "../../lib/api/gamification";
import "./gamification.css";

interface Props {
  /** If set, shows only shoutouts for this student. */
  studentId?: string;
  /** If true, shows a compose box (instructors/admins). */
  canCreate?: boolean;
  /** Pre-fill recipient for compose (e.g. when opened from a student card). */
  defaultRecipientId?: string;
  limit?: number;
  compact?: boolean;
}

const EMOJIS = ["🌟", "🔥", "💡", "🎉", "🏆", "⚡", "🚀", "💪", "🎯", "👏"];

export function ShoutoutsFeed({
  studentId,
  canCreate = false,
  defaultRecipientId,
  limit = 20,
  compact = false,
}: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<ShoutoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [recipientId, setRecipientId] = useState(defaultRecipientId ?? "");
  const [message, setMessage] = useState("");
  const [emoji, setEmoji] = useState("🌟");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listShoutouts({ student_id: studentId, limit })
      .then((r) => { if (mounted) setItems(r.items); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [studentId, limit]);

  const handleSend = async () => {
    if (!message.trim() || !recipientId.trim()) return;
    setSending(true);
    setError(null);
    try {
      const newShoutout = await createShoutout({
        to_student_id: recipientId,
        message: message.trim(),
        emoji,
      });
      setItems((prev) => [newShoutout, ...prev]);
      setMessage("");
      setComposing(false);
    } catch {
      setError("Couldn't send shoutout. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`shoutouts-feed${compact ? " shoutouts-feed--compact" : ""}`}>
      <div className="shoutouts-feed__header">
        <div className="shoutouts-feed__title-row">
          <Star size={18} className="shoutouts-feed__title-icon" aria-hidden />
          <h2 className="shoutouts-feed__title">Shoutouts</h2>
        </div>
        {canCreate && (
          <button
            type="button"
            className="shoutouts-feed__compose-btn"
            onClick={() => setComposing((v) => !v)}
            aria-expanded={composing}
          >
            <Send size={14} aria-hidden />
            Give shoutout
          </button>
        )}
      </div>

      {/* Compose form */}
      {composing && canCreate && (
        <div className="shoutouts-feed__compose">
          {!defaultRecipientId && (
            <input
              type="text"
              className="shoutouts-feed__input"
              placeholder="Student ID…"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              aria-label="Recipient student ID"
            />
          )}
          <textarea
            className="shoutouts-feed__textarea"
            placeholder="Write an encouraging message…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={500}
            aria-label="Shoutout message"
          />
          <div className="shoutouts-feed__emoji-row">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className={`shoutouts-feed__emoji-btn${emoji === e ? " shoutouts-feed__emoji-btn--active" : ""}`}
                onClick={() => setEmoji(e)}
                aria-label={e}
              >
                {e}
              </button>
            ))}
          </div>
          {error && <p className="shoutouts-feed__error">{error}</p>}
          <div className="shoutouts-feed__compose-actions">
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => { setComposing(false); setError(null); }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              onClick={handleSend}
              disabled={sending || !message.trim() || !recipientId.trim()}
            >
              {sending ? <Loader2 size={14} className="shoutouts-feed__spinner" /> : <Send size={14} />}
              Send
            </button>
          </div>
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <div className="shoutouts-feed__loading" aria-live="polite">
          <div className="shoutouts-feed__dot" /><div className="shoutouts-feed__dot" /><div className="shoutouts-feed__dot" />
        </div>
      ) : items.length === 0 ? (
        <p className="shoutouts-feed__empty">No shoutouts yet. Be the first to celebrate a student! 🎉</p>
      ) : (
        <ul className="shoutouts-feed__list" role="list">
          {items.map((s) => (
            <li key={s.id} className="shoutouts-feed__item" role="listitem">
              <span className="shoutouts-feed__item-emoji">{s.emoji}</span>
              <div className="shoutouts-feed__item-body">
                <p className="shoutouts-feed__item-msg">{s.message}</p>
                <span className="shoutouts-feed__item-meta">
                  <strong>{s.to_student_name}</strong>
                  {" · from "}{s.from_user_name}
                  {" · "}{timeAgo(s.created_at)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
