import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, KeyRound, UserPlus } from "lucide-react";
import { ModalDialog } from "../ui/ModalDialog";
import { createUserInvite, listInvitations } from "../../lib/api/invitations";
import { listSeatUsage, type SeatUsageRecord } from "../../lib/api/licenses";
import { listTenantRoles, type TenantRoleRecord } from "../../lib/api/tenants";
import { ensureFreshAccessToken } from "../../lib/api/client";
import "./tenant-invite-modal.css";

const EMAIL_CHUNK = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/gi;

function extractEmailsFromText(raw: string): string[] {
  const matches = raw.match(EMAIL_CHUNK) ?? [];
  return matches.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner:
    "Full control of workspace settings, billing, and who can join.",
  admin: "Manage members, classes, and most workspace settings.",
  instructor:
    "Teach classes and support students. Counts toward instructor seats on your plan when they accept.",
  user: "Member access without full admin controls.",
  parent: "Sees linked students’ progress and reports after they accept.",
};

function describeRole(slug: string): string {
  const key = slug.toLowerCase();
  if (ROLE_DESCRIPTIONS[key]) return ROLE_DESCRIPTIONS[key];
  return "Workspace role assigned when they accept the invite.";
}

interface TenantInviteMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName: string;
}

export function TenantInviteMembersModal({
  isOpen,
  onClose,
  tenantId,
  tenantName,
}: TenantInviteMembersModalProps) {
  const onCloseModal = onClose;

  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [roleId, setRoleId] = useState("");
  const [roles, setRoles] = useState<TenantRoleRecord[]>([]);
  const [seats, setSeats] = useState<SeatUsageRecord[] | null>(null);
  const [pendingByRoleId, setPendingByRoleId] = useState<Record<string, number>>({});
  const [personalMessage, setPersonalMessage] = useState("");
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendErrors, setSendErrors] = useState<string[]>([]);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const roleWrapRef = useRef<HTMLDivElement>(null);
  const chipInputRef = useRef<HTMLInputElement>(null);

  const managedRoles = useMemo(() => {
    const bySlug = new Map(roles.map((r) => [r.slug, r]));
    const preferred = ["instructor", "user", "parent", "admin", "owner"];
    const ordered = preferred
      .map((slug) => bySlug.get(slug))
      .filter((r): r is TenantRoleRecord => Boolean(r));
    return ordered.length > 0 ? ordered : roles.filter((r) => r.is_active);
  }, [roles]);

  const selectedRole = managedRoles.find((r) => r.id === roleId) ?? null;

  const instructorSeat = useMemo(
    () => seats?.find((s) => s.seat_type === "instructor") ?? null,
    [seats],
  );

  const pendingForSelectedRole = selectedRole ? (pendingByRoleId[selectedRole.id] ?? 0) : 0;

  const instructorSeatPreview = useMemo(() => {
    if (!selectedRole || !instructorSeat) return null;
    const slug = selectedRole.slug.toLowerCase();
    if (!slug.includes("instructor")) return null;
    const used = instructorSeat.current_count + pendingForSelectedRole;
    const remaining = instructorSeat.max_count - used;
    return { used, max: instructorSeat.max_count, remaining, pending: pendingForSelectedRole };
  }, [selectedRole, instructorSeat, pendingForSelectedRole]);

  const draftEmails = useMemo(
    () =>
      Array.from(
        new Set(
          [...emails, ...extractEmailsFromText(draft)]
            .map((e) => e.trim().toLowerCase())
            .filter(isValidEmail),
        ),
      ),
    [emails, draft],
  );

  const seatBlocked =
    instructorSeatPreview !== null &&
    draftEmails.length > 0 &&
    instructorSeatPreview.remaining < draftEmails.length;

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const ok = await ensureFreshAccessToken(60);
      if (!ok) {
        setError("Sign in again to send invitations.");
        return;
      }
      const [roleRows, seatRows, invPage] = await Promise.all([
        listTenantRoles(),
        listSeatUsage().catch(() => [] as SeatUsageRecord[]),
        listInvitations({ limit: 200 }).catch(() => ({ items: [], total: 0 })),
      ]);
      setRoles(roleRows.filter((r) => r.is_active));
      setSeats(seatRows);

      const pending: Record<string, number> = {};
      for (const inv of invPage.items) {
        if (inv.invite_type !== "user" || inv.status !== "pending" || !inv.role_id) continue;
        pending[inv.role_id] = (pending[inv.role_id] ?? 0) + 1;
      }
      setPendingByRoleId(pending);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load invite options.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!isOpen) return;
    void loadData();
  }, [isOpen, loadData]);

  useEffect(() => {
    if (!isOpen) return;
    if (managedRoles.length && !roleId) {
      const first = managedRoles.find((r) => r.slug === "instructor") ?? managedRoles[0];
      setRoleId(first.id);
    }
  }, [isOpen, managedRoles, roleId]);

  useEffect(() => {
    if (!isOpen) {
      setEmails([]);
      setDraft("");
      setPersonalMessage("");
      setRoleMenuOpen(false);
      setError(null);
      setSendErrors([]);
      setSuccessCount(null);
      setRoleId("");
    }
  }, [isOpen]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (roleWrapRef.current?.contains(t)) return;
      setRoleMenuOpen(false);
    }
    if (roleMenuOpen) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [roleMenuOpen]);

  function commitDraftAsEmails() {
    const parsed = extractEmailsFromText(draft);
    if (parsed.length === 0) {
      const one = draft.trim().toLowerCase();
      if (one && isValidEmail(one)) {
        setEmails((prev) => Array.from(new Set([...prev, one])));
        setDraft("");
      }
      return;
    }
    setEmails((prev) => Array.from(new Set([...prev, ...parsed])));
    setDraft("");
  }

  function removeEmail(email: string) {
    setEmails((prev) => prev.filter((e) => e !== email));
  }

  async function handleSend() {
    setError(null);
    setSendErrors([]);
    setSuccessCount(null);
    const fromDraft = extractEmailsFromText(draft);
    const merged = Array.from(
      new Set([...emails, ...fromDraft].map((e) => e.trim().toLowerCase()).filter(isValidEmail)),
    );
    if (merged.length === 0) {
      setError("Add at least one valid email address.");
      return;
    }
    setEmails(merged);
    setDraft("");
    const unique = merged;
    if (!roleId) {
      setError("Select a role.");
      return;
    }
    if (
      selectedRole &&
      instructorSeat &&
      selectedRole.slug.toLowerCase().includes("instructor")
    ) {
      const used = instructorSeat.current_count + pendingForSelectedRole;
      if (used + unique.length > instructorSeat.max_count) {
        setError(
          `Not enough instructor seats (${used}/${instructorSeat.max_count} in use including pending invites). ` +
            `Invite fewer people, revoke a pending invite, or upgrade your plan.`,
        );
        return;
      }
    }

    setSending(true);
    const failures: string[] = [];
    let ok = 0;
    const msg = personalMessage.trim() || undefined;
    try {
      for (const email of unique) {
        try {
          await createUserInvite({
            email,
            role_id: roleId,
            personal_message: msg,
          });
          ok += 1;
        } catch (e: unknown) {
          const detail =
            e instanceof Error ? e.message : "Failed";
          failures.push(`${email}: ${detail}`);
        }
      }
      if (ok > 0) setSuccessCount(ok);
      if (failures.length) setSendErrors(failures);
      if (ok > 0 && failures.length === 0) {
        setEmails([]);
        setDraft("");
        setPersonalMessage("");
      }
      void loadData();
    } finally {
      setSending(false);
    }
  }

  const showSuccess = successCount !== null && successCount > 0 && sendErrors.length === 0;

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onCloseModal}
      ariaLabel="Invite members"
      contentClassName="tenant-invite-modal"
      disableClose={sending}
      footer={
        showSuccess ? (
          <div className="ui-form-actions">
            <button type="button" className="ui-btn ui-btn--primary" onClick={onCloseModal}>
              Done
            </button>
          </div>
        ) : (
          <div className="ui-form-actions">
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={onCloseModal}
              disabled={sending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              disabled={sending || loading || !roleId || seatBlocked || draftEmails.length === 0}
              onClick={() => void handleSend()}
            >
              {sending ? "Sending…" : "Send invite"}
            </button>
          </div>
        )
      }
    >
      {showSuccess ? (
        <div className="tenant-invite-modal__success">
          <div className="tenant-invite-modal__hero-icon" aria-hidden>
            <Check size={22} strokeWidth={2.5} />
          </div>
          <p className="tenant-invite-modal__success-title">Invitations sent</p>
          <p className="tenant-invite-modal__success-detail">
            We sent {successCount} invitation{successCount === 1 ? "" : "s"} to join{" "}
            <strong>{tenantName}</strong>. Each person gets a secure link (valid 7 days).
          </p>
        </div>
      ) : (
        <>
          <div className="tenant-invite-modal__hero">
            <div className="tenant-invite-modal__hero-icon" aria-hidden>
              <UserPlus size={22} strokeWidth={2.2} />
            </div>
            <h3 className="tenant-invite-modal__title">Add members</h3>
            <p className="tenant-invite-modal__hint">
              Type or paste emails below — use commas or spaces between addresses.
            </p>
          </div>

          {loading ? (
            <p className="tenant-invite-modal__hint">Loading…</p>
          ) : (
            <>
              <label className="tenant-invite-modal__field-label" htmlFor="tenant-invite-emails">
                Email addresses
              </label>
              <div
                className="tenant-invite-modal__chips"
                onClick={() => chipInputRef.current?.focus()}
              >
                {emails.map((email) => (
                  <span key={email} className="tenant-invite-modal__chip">
                    {email}
                    <button
                      type="button"
                      className="tenant-invite-modal__chip-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeEmail(email);
                      }}
                      aria-label={`Remove ${email}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  id="tenant-invite-emails"
                  ref={chipInputRef}
                  className="tenant-invite-modal__chip-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === ";") {
                      e.preventDefault();
                      commitDraftAsEmails();
                    } else if (e.key === "Backspace" && !draft && emails.length) {
                      removeEmail(emails[emails.length - 1]);
                    }
                  }}
                  onBlur={() => commitDraftAsEmails()}
                  placeholder={emails.length ? "Add another…" : "name@school.org"}
                  autoComplete="off"
                  disabled={sending}
                />
              </div>

              <div style={{ marginTop: 14 }}>
                <span className="tenant-invite-modal__field-label">Select role</span>
                <div className="tenant-invite-modal__role-wrap" ref={roleWrapRef}>
                  <button
                    type="button"
                    className="tenant-invite-modal__role-trigger"
                    aria-expanded={roleMenuOpen}
                    aria-haspopup="listbox"
                    onClick={() => setRoleMenuOpen((o) => !o)}
                    disabled={sending || managedRoles.length === 0}
                  >
                    <span className="tenant-invite-modal__role-trigger-icon" aria-hidden>
                      <KeyRound size={16} />
                    </span>
                    <span className="tenant-invite-modal__role-trigger-body">
                      <div className="tenant-invite-modal__role-trigger-title">
                        {selectedRole?.name ?? "Choose a role"}
                      </div>
                      <div className="tenant-invite-modal__role-trigger-desc">
                        {selectedRole
                          ? describeRole(selectedRole.slug)
                          : "Roles load from your workspace."}
                      </div>
                      {instructorSeatPreview ? (
                        <span className="tenant-invite-modal__role-badge">
                          Instructor seats {instructorSeatPreview.used}/{instructorSeatPreview.max}
                          {instructorSeatPreview.pending > 0
                            ? ` (${instructorSeatPreview.pending} pending)`
                            : ""}
                        </span>
                      ) : null}
                    </span>
                    <ChevronDown size={18} className="tenant-invite-modal__role-trigger-chevron" />
                  </button>
                  {roleMenuOpen ? (
                    <div className="tenant-invite-modal__role-menu" role="listbox">
                      {managedRoles.map((role) => {
                        const active = role.id === roleId;
                        return (
                          <button
                            key={role.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={`tenant-invite-modal__role-option${active ? " tenant-invite-modal__role-option--active" : ""}`}
                            onClick={() => {
                              setRoleId(role.id);
                              setRoleMenuOpen(false);
                            }}
                          >
                            {active ? (
                              <Check size={16} className="tenant-invite-modal__role-option-check" />
                            ) : (
                              <span style={{ width: 16 }} aria-hidden />
                            )}
                            <span className="tenant-invite-modal__role-trigger-body">
                              <div className="tenant-invite-modal__role-trigger-title">{role.name}</div>
                              <div className="tenant-invite-modal__role-trigger-desc">
                                {describeRole(role.slug)}
                              </div>
                              {role.slug.toLowerCase().includes("instructor") && instructorSeat ? (
                                <span className="tenant-invite-modal__role-badge">Uses instructor seat</span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>

              {instructorSeatPreview && draftEmails.length > 0 ? (
                <div
                  className={`tenant-invite-modal__seat-banner${seatBlocked ? " tenant-invite-modal__seat-banner--error" : ""}`}
                >
                  {seatBlocked
                    ? `You are inviting ${draftEmails.length} people but only ${Math.max(0, instructorSeatPreview.remaining)} instructor seat(s) remain. Reduce recipients or pick another role.`
                    : `${instructorSeatPreview.remaining} instructor seat(s) left for this batch (${instructorSeatPreview.used}/${instructorSeatPreview.max} used including pending).`}
                </div>
              ) : null}

              <div style={{ marginTop: 14 }}>
                <label className="tenant-invite-modal__field-label" htmlFor="tenant-invite-message">
                  Message <span style={{ fontWeight: 600 }}>(optional)</span>
                </label>
                <textarea
                  id="tenant-invite-message"
                  className="tenant-invite-modal__textarea"
                  value={personalMessage}
                  onChange={(e) => setPersonalMessage(e.target.value)}
                  placeholder="Add a short note to your invite…"
                  maxLength={2000}
                  disabled={sending}
                />
              </div>

              {error ? (
                <p className="tenant-invite-modal__errors" role="alert">
                  {error}
                </p>
              ) : null}
              {sendErrors.length > 0 ? (
                <div className="tenant-invite-modal__errors" role="status">
                  Some invites failed:
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {sendErrors.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {successCount !== null && successCount > 0 && sendErrors.length > 0 ? (
                <p className="tenant-invite-modal__hint" style={{ marginTop: 10 }}>
                  {successCount} sent successfully; fix the errors above to retry the rest from the
                  members page if needed.
                </p>
              ) : null}
            </>
          )}
        </>
      )}
    </ModalDialog>
  );
}
