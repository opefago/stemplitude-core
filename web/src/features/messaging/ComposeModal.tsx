import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Hash, Loader2, Search, UserPlus, Users, X } from "lucide-react";
import { ModalDialog } from "../../components/ui/ModalDialog";
import { useAuth } from "../../providers/AuthProvider";
import { listUsers, type UserRecord } from "../../lib/api/users";
import {
  createGroupConversation,
  getOrCreateDm,
} from "../../lib/api/messaging";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "dm" | "group";

function getInitials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

const AVATAR_COLORS = [
  "#1cb0f6", "#58cc02", "#ff9600", "#ff4b4b", "#a560f0", "#235390",
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

interface UserRowProps {
  user: UserRecord;
  selected?: boolean;
  onClick: () => void;
  mode: "select" | "check";
}

function UserRow({ user, selected, onClick, mode }: UserRowProps) {
  const name = `${user.first_name} ${user.last_name}`;
  const color = avatarColor(name);
  return (
    <button
      type="button"
      className={`msg-compose__user-row ${selected ? "msg-compose__user-row--selected" : ""}`}
      onClick={onClick}
    >
      <div className="msg-compose__user-avatar" style={{ background: color }} aria-hidden>
        {getInitials(user.first_name, user.last_name)}
      </div>
      <div className="msg-compose__user-info">
        <span className="msg-compose__user-name">{name}</span>
        <span className="msg-compose__user-email">{user.email}</span>
      </div>
      {mode === "check" && (
        <div className={`msg-compose__check ${selected ? "msg-compose__check--on" : ""}`} aria-hidden>
          {selected && <Check size={12} />}
        </div>
      )}
      {mode === "select" && (
        <UserPlus size={14} className="msg-compose__user-arrow" aria-hidden />
      )}
    </button>
  );
}

export function ComposeModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("dm");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<UserRecord[]>([]);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelected([]);
      setGroupName("");
      setError(null);
      setUsers([]);
      setTimeout(() => searchRef.current?.focus(), 60);
    }
  }, [isOpen, tab]);

  // Debounced user search
  const doSearch = useCallback((q: string) => {
    clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setUsers([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await listUsers({ search: q, limit: 20 });
        setUsers(res.items.filter((u) => u.id !== user?.id));
      } catch {
        setUsers([]);
      } finally {
        setSearching(false);
      }
    }, 280);
  }, []);

  useEffect(() => {
    doSearch(search);
    return () => clearTimeout(debounceRef.current);
  }, [search, doSearch]);

  const toggleSelect = (user: UserRecord) => {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user]
    );
  };

  const startDm = async (user: UserRecord) => {
    setCreating(true);
    setError(null);
    try {
      const conv = await getOrCreateDm(user.id);
      onClose();
      navigate(`/app/messages/${conv.id}`);
    } catch {
      setError("Could not open conversation. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const createGroup = async () => {
    if (!groupName.trim()) {
      setError("Please enter a group name.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const conv = await createGroupConversation({
        name: groupName.trim(),
        member_ids: selected.map((u) => u.id),
      });
      onClose();
      navigate(`/app/messages/${conv.id}`);
    } catch {
      setError("Could not create group. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="New message"
      contentClassName="msg-compose__modal"
    >
      {/* Tab switcher */}
      <div className="msg-compose__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "dm"}
          className={`msg-compose__tab ${tab === "dm" ? "msg-compose__tab--active" : ""}`}
          onClick={() => { setTab("dm"); setSearch(""); setSelected([]); setError(null); }}
        >
          <UserPlus size={15} aria-hidden />
          Direct Message
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "group"}
          className={`msg-compose__tab ${tab === "group" ? "msg-compose__tab--active" : ""}`}
          onClick={() => { setTab("group"); setSearch(""); setError(null); }}
        >
          <Hash size={15} aria-hidden />
          New Group
        </button>
      </div>

      {/* DM tab */}
      {tab === "dm" && (
        <div className="msg-compose__pane" role="tabpanel">
          <h3 className="msg-compose__heading">Send a direct message</h3>
          <div className="msg-compose__search-wrap">
            <Search size={14} className="msg-compose__search-icon" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              className="msg-compose__search"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search users"
            />
            {searching && <Loader2 size={14} className="msg-compose__spinner" aria-hidden />}
          </div>

          <div className="msg-compose__user-list" role="listbox" aria-label="Users">
            {users.length === 0 && !searching && search && (
              <p className="msg-compose__empty">No users found for "{search}"</p>
            )}
            {users.length === 0 && !search && (
              <p className="msg-compose__empty">Type a name or email to search your team.</p>
            )}
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                mode="select"
                onClick={() => startDm(u)}
              />
            ))}
          </div>

          {error && <p className="msg-compose__error">{error}</p>}
        </div>
      )}

      {/* Group tab */}
      {tab === "group" && (
        <div className="msg-compose__pane" role="tabpanel">
          <h3 className="msg-compose__heading">Create a group</h3>

          <div className="msg-compose__field">
            <label htmlFor="compose-group-name" className="msg-compose__label">
              Group name
            </label>
            <input
              id="compose-group-name"
              type="text"
              className="msg-compose__input"
              placeholder="e.g. Spring Instructors, Parent Committee…"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="msg-compose__field">
            <label className="msg-compose__label">
              Add members
              {selected.length > 0 && (
                <span className="msg-compose__label-count">{selected.length} selected</span>
              )}
            </label>
            <div className="msg-compose__search-wrap">
              <Search size={14} className="msg-compose__search-icon" aria-hidden />
              <input
                type="search"
                className="msg-compose__search"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search users"
              />
              {searching && <Loader2 size={14} className="msg-compose__spinner" aria-hidden />}
            </div>
          </div>

          {/* Selected chips */}
          {selected.length > 0 && (
            <div className="msg-compose__chips" aria-label="Selected members">
              {selected.map((u) => (
                <span key={u.id} className="msg-compose__chip">
                  {u.first_name} {u.last_name}
                  <button
                    type="button"
                    className="msg-compose__chip-remove"
                    onClick={() => toggleSelect(u)}
                    aria-label={`Remove ${u.first_name}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="msg-compose__user-list" role="listbox" aria-label="Users">
            {users.length === 0 && !searching && search && (
              <p className="msg-compose__empty">No users found for "{search}"</p>
            )}
            {users.length === 0 && !search && (
              <p className="msg-compose__empty">Search to add members to this group.</p>
            )}
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                mode="check"
                selected={selected.some((s) => s.id === u.id)}
                onClick={() => toggleSelect(u)}
              />
            ))}
          </div>

          {error && <p className="msg-compose__error">{error}</p>}

          <div className="ui-form-actions">
            <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              onClick={createGroup}
              disabled={creating || !groupName.trim()}
            >
              {creating ? (
                <><Loader2 size={15} className="msg-compose__spinner" aria-hidden /> Creating…</>
              ) : (
                <><Users size={15} aria-hidden /> Create Group</>
              )}
            </button>
          </div>
        </div>
      )}
    </ModalDialog>
  );
}
