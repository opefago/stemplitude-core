import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider";
import { Check, Loader2, Pencil, Search, Trash2, UserPlus, X } from "lucide-react";
import { ModalDialog } from "../../components/ui/ModalDialog";
import { listUsers, type UserRecord } from "../../lib/api/users";
import {
  addGroupMembers,
  deleteConversation,
  removeGroupMember,
  updateConversationName,
  type Conversation,
  type MemberInfo,
} from "../../lib/api/messaging";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  conversation: Conversation;
  canDelete: boolean;
  onUpdated: (conv: Conversation) => void;
  onDeleted: () => void;
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = ["#1cb0f6","#58cc02","#ff9600","#ff4b4b","#a560f0","#235390"];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function GroupManageModal({
  isOpen,
  onClose,
  conversation,
  canDelete,
  onUpdated,
  onDeleted,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Rename
  const [nameEdit, setNameEdit] = useState(conversation.name ?? "");
  const [renamingState, setRenamingState] = useState<"idle" | "busy" | "saved">("idle");

  // Add member search
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Remove member
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNameEdit(conversation.name ?? "");
      setSearch("");
      setSearchResults([]);
      setConfirmDelete(false);
      setError(null);
      setRenamingState("idle");
    }
  }, [isOpen, conversation]);

  // Debounced user search
  const doSearch = useCallback((q: string) => {
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await listUsers({ search: q, limit: 20 });
        // Filter out already-active members and the current user
        const activeIds = new Set(
          conversation.members.filter((m) => !m.left_at).map((m) => String(m.user_id))
        );
        setSearchResults(
          res.items.filter((u) => !activeIds.has(u.id) && u.id !== user?.id)
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
  }, [conversation.members]);

  useEffect(() => {
    doSearch(search);
    return () => clearTimeout(debounceRef.current);
  }, [search, doSearch]);

  const handleRename = async () => {
    if (!nameEdit.trim() || nameEdit === conversation.name) return;
    setRenamingState("busy");
    setError(null);
    try {
      const updated = await updateConversationName(conversation.id, nameEdit.trim());
      onUpdated(updated as unknown as Conversation);
      setRenamingState("saved");
      setTimeout(() => setRenamingState("idle"), 1500);
    } catch {
      setError("Could not rename group.");
      setRenamingState("idle");
    }
  };

  const handleAddMember = async (user: UserRecord) => {
    setAddingIds((s) => new Set(s).add(user.id));
    setError(null);
    try {
      const updated = await addGroupMembers(conversation.id, [user.id]);
      onUpdated(updated as unknown as Conversation);
      setSearch("");
      setSearchResults([]);
    } catch {
      setError("Could not add member.");
    } finally {
      setAddingIds((s) => { const n = new Set(s); n.delete(user.id); return n; });
    }
  };

  const handleRemoveMember = async (member: MemberInfo) => {
    const uid = String(member.user_id);
    setRemovingIds((s) => new Set(s).add(uid));
    setError(null);
    try {
      await removeGroupMember(conversation.id, uid);
      // Reflect locally; parent should re-fetch on next open
      onUpdated({
        ...conversation,
        members: conversation.members.map((m) =>
          String(m.user_id) === uid
            ? { ...m, left_at: new Date().toISOString() }
            : m
        ),
      });
    } catch {
      setError("Could not remove member.");
    } finally {
      setRemovingIds((s) => { const n = new Set(s); n.delete(uid); return n; });
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteConversation(conversation.id);
      onDeleted();
      onClose();
      navigate("/app/messages");
    } catch {
      setError("Could not delete group.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const activeMembers = conversation.members.filter((m) => !m.left_at);

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Manage group"
      contentClassName="msg-manage__modal"
    >
      <div className="msg-manage__header">
        <h3 className="msg-manage__title">Manage Group</h3>
      </div>

      {/* ── Rename ───────────────────────────────────────────────────── */}
      <section className="msg-manage__section">
        <h4 className="msg-manage__section-title">Group Name</h4>
        <div className="msg-manage__rename-row">
          <input
            type="text"
            className="msg-manage__name-input"
            value={nameEdit}
            onChange={(e) => setNameEdit(e.target.value)}
            maxLength={200}
            aria-label="Group name"
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
          <button
            type="button"
            className={`ui-btn ui-btn--secondary msg-manage__rename-btn ${renamingState === "saved" ? "msg-manage__rename-btn--saved" : ""}`}
            onClick={handleRename}
            disabled={renamingState === "busy" || !nameEdit.trim() || nameEdit === conversation.name}
          >
            {renamingState === "busy" ? (
              <Loader2 size={14} className="msg-compose__spinner" aria-hidden />
            ) : renamingState === "saved" ? (
              <><Check size={14} aria-hidden /> Saved</>
            ) : (
              <><Pencil size={14} aria-hidden /> Rename</>
            )}
          </button>
        </div>
      </section>

      {/* ── Members ──────────────────────────────────────────────────── */}
      <section className="msg-manage__section">
        <h4 className="msg-manage__section-title">
          Members <span className="msg-manage__member-count">{activeMembers.length}</span>
        </h4>
        <ul className="msg-manage__member-list">
          {activeMembers.map((m) => {
            const uid = String(m.user_id);
            const removing = removingIds.has(uid);
            return (
              <li key={uid} className="msg-manage__member-row">
                <div
                  className="msg-manage__member-avatar"
                  style={{ background: avatarColor(m.name) }}
                  aria-hidden
                >
                  {getInitials(m.name)}
                </div>
                <span className="msg-manage__member-name">{m.name}</span>
                <button
                  type="button"
                  className="msg-manage__remove-btn"
                  onClick={() => handleRemoveMember(m)}
                  disabled={removing}
                  aria-label={`Remove ${m.name}`}
                  title={`Remove ${m.name}`}
                >
                  {removing ? (
                    <Loader2 size={13} className="msg-compose__spinner" />
                  ) : (
                    <X size={13} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Add Members ──────────────────────────────────────────────── */}
      <section className="msg-manage__section">
        <h4 className="msg-manage__section-title">Add Members</h4>
        <div className="msg-compose__search-wrap">
          <Search size={14} className="msg-compose__search-icon" aria-hidden />
          <input
            type="search"
            className="msg-compose__search"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search users to add"
          />
          {searching && <Loader2 size={14} className="msg-compose__spinner" aria-hidden />}
        </div>

        {searchResults.length > 0 && (
          <ul className="msg-manage__add-list">
            {searchResults.map((u) => {
              const adding = addingIds.has(u.id);
              return (
                <li key={u.id} className="msg-manage__add-row">
                  <div
                    className="msg-manage__member-avatar"
                    style={{ background: avatarColor(`${u.first_name} ${u.last_name}`) }}
                    aria-hidden
                  >
                    {getInitials(`${u.first_name} ${u.last_name}`)}
                  </div>
                  <div className="msg-compose__user-info">
                    <span className="msg-compose__user-name">{u.first_name} {u.last_name}</span>
                    <span className="msg-compose__user-email">{u.email}</span>
                  </div>
                  <button
                    type="button"
                    className="ui-btn ui-btn--secondary msg-manage__add-btn"
                    onClick={() => handleAddMember(u)}
                    disabled={adding}
                    aria-label={`Add ${u.first_name}`}
                  >
                    {adding ? (
                      <Loader2 size={13} className="msg-compose__spinner" />
                    ) : (
                      <><UserPlus size={13} aria-hidden /> Add</>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {search && !searching && searchResults.length === 0 && (
          <p className="msg-compose__empty">No users found for "{search}"</p>
        )}
      </section>

      {error && <p className="msg-compose__error">{error}</p>}

      {/* ── Delete Group ─────────────────────────────────────────────── */}
      {canDelete && (
        <section className="msg-manage__section msg-manage__section--danger">
          <h4 className="msg-manage__section-title msg-manage__section-title--danger">
            Danger Zone
          </h4>
          {!confirmDelete ? (
            <button
              type="button"
              className="ui-btn ui-btn--danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} aria-hidden /> Delete Group
            </button>
          ) : (
            <div className="msg-manage__confirm-delete">
              <p className="msg-manage__confirm-text">
                This will permanently delete <strong>{conversation.name}</strong> and all its messages. This cannot be undone.
              </p>
              <div className="msg-manage__confirm-actions">
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn--danger"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? (
                    <><Loader2 size={14} className="msg-compose__spinner" /> Deleting…</>
                  ) : (
                    <><Trash2 size={14} aria-hidden /> Yes, Delete</>
                  )}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </ModalDialog>
  );
}
