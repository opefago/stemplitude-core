import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Check,
  Clock,
  Copy,
  LinkIcon,
  Mail,
  RefreshCw,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import {
  createParentInvite,
  createUserInvite,
  listInvitations,
  revokeInvite,
  type InvitationResponse,
} from "../../lib/api/invitations";
import { listStudents, type StudentProfile } from "../../lib/api/students";
import { listTenantRoles, type TenantRoleRecord } from "../../lib/api/tenants";
import { KidCheckbox, KidDropdown, ModalDialog } from "../../components/ui";
import { useTenant } from "../../providers/TenantProvider";
import "../../components/ui/ui.css";
import "./invitations.css";

type StatusFilter = "all" | "pending" | "accepted" | "expired" | "revoked";
type TypeFilter = "all" | "user" | "parent";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  expired: "Expired",
  revoked: "Revoked",
};

export function InvitationsPage() {
  const { tenant } = useTenant();

  const [invites, setInvites] = useState<InvitationResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  // Revoke
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevokeToken, setConfirmRevokeToken] = useState<string | null>(null);

  // Copy link feedback
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Roles + students (for send dialogs)
  const [tenantRoles, setTenantRoles] = useState<TenantRoleRecord[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);

  // Invite user dialog
  const [showInviteUser, setShowInviteUser] = useState(false);
  const [inviteUserEmail, setInviteUserEmail] = useState("");
  const [inviteUserFirstName, setInviteUserFirstName] = useState("");
  const [inviteUserRoleId, setInviteUserRoleId] = useState("");
  const [sendingUser, setSendingUser] = useState(false);
  const [userInviteResult, setUserInviteResult] = useState<InvitationResponse | null>(null);
  const [userResultCopied, setUserResultCopied] = useState(false);

  // Invite parent dialog
  const [showInviteParent, setShowInviteParent] = useState(false);
  const [inviteParentEmail, setInviteParentEmail] = useState("");
  const [inviteParentFirstName, setInviteParentFirstName] = useState("");
  const [inviteParentStudentIds, setInviteParentStudentIds] = useState<string[]>([]);
  const [sendingParent, setSendingParent] = useState(false);
  const [parentInviteResult, setParentInviteResult] = useState<InvitationResponse | null>(null);
  const [parentResultCopied, setParentResultCopied] = useState(false);

  const roleOptions = useMemo(
    () =>
      tenantRoles
        .filter((r) => r.is_active)
        .filter((r) => ["instructor", "user", "parent", "admin", "owner"].includes(r.slug ?? ""))
        .map((r) => ({ value: r.id, label: r.name })),
    [tenantRoles],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invRes, rolesRes, studentsRes] = await Promise.all([
        listInvitations({ limit: 200 }),
        tenant ? listTenantRoles().catch(() => [] as TenantRoleRecord[]) : Promise.resolve([] as TenantRoleRecord[]),
        listStudents({ limit: 300 }).catch(() => [] as StudentProfile[]),
      ]);
      setInvites(invRes.items);
      setTotal(invRes.total);
      setTenantRoles(rolesRes);
      setStudents(studentsRes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load invitations");
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    return invites.filter((inv) => {
      const matchStatus = statusFilter === "all" || inv.status === statusFilter;
      const matchType = typeFilter === "all" || inv.invite_type === typeFilter;
      return matchStatus && matchType;
    });
  }, [invites, statusFilter, typeFilter]);

  async function handleRevoke() {
    if (!confirmRevokeToken) return;
    setRevoking(confirmRevokeToken);
    setError(null);
    try {
      await revokeInvite(confirmRevokeToken);
      setConfirmRevokeToken(null);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to revoke invitation");
    } finally {
      setRevoking(null);
    }
  }

  async function copyLink(token: string, link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // noop
    }
  }

  // -- Invite User --
  async function handleSendUserInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteUserEmail.trim() || !inviteUserRoleId) return;
    setSendingUser(true);
    setError(null);
    try {
      const result = await createUserInvite({
        email: inviteUserEmail.trim(),
        role_id: inviteUserRoleId,
        first_name: inviteUserFirstName.trim() || undefined,
      });
      setUserInviteResult(result);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send invitation");
    } finally {
      setSendingUser(false);
    }
  }

  function closeInviteUser() {
    setShowInviteUser(false);
    setInviteUserEmail("");
    setInviteUserFirstName("");
    setInviteUserRoleId("");
    setUserInviteResult(null);
    setUserResultCopied(false);
  }

  // -- Invite Parent --
  async function handleSendParentInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteParentEmail.trim() || inviteParentStudentIds.length === 0) return;
    setSendingParent(true);
    setError(null);
    try {
      const result = await createParentInvite({
        email: inviteParentEmail.trim(),
        student_ids: inviteParentStudentIds,
        first_name: inviteParentFirstName.trim() || undefined,
      });
      setParentInviteResult(result);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send invitation");
    } finally {
      setSendingParent(false);
    }
  }

  function closeInviteParent() {
    setShowInviteParent(false);
    setInviteParentEmail("");
    setInviteParentFirstName("");
    setInviteParentStudentIds([]);
    setParentInviteResult(null);
    setParentResultCopied(false);
  }

  function toggleParentStudent(id: string) {
    setInviteParentStudentIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  const pendingCount = useMemo(() => invites.filter((i) => i.status === "pending").length, [invites]);
  const acceptedCount = useMemo(() => invites.filter((i) => i.status === "accepted").length, [invites]);

  return (
    <div className="invitations-page" role="main" aria-label="Invitations management">
      <header className="invitations-page__header">
        <div className="invitations-page__header-top">
          <div>
            <h1 className="invitations-page__title">Invitations</h1>
            <p className="invitations-page__subtitle">
              Manage pending and past invitations for your workspace
            </p>
          </div>
          <div className="invitations-page__header-actions">
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => setShowInviteParent(true)}
              disabled={!tenant?.id}
            >
              <Users size={15} aria-hidden /> Invite Parent
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              onClick={() => setShowInviteUser(true)}
              disabled={!tenant?.id}
            >
              <Mail size={15} aria-hidden /> Invite User
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="invitations-page__stats">
          <div className="invitations-page__stat">
            <span className="invitations-page__stat-value">{total}</span>
            <span className="invitations-page__stat-label">Total</span>
          </div>
          <div className="invitations-page__stat invitations-page__stat--pending">
            <span className="invitations-page__stat-value">{pendingCount}</span>
            <span className="invitations-page__stat-label">Pending</span>
          </div>
          <div className="invitations-page__stat invitations-page__stat--accepted">
            <span className="invitations-page__stat-value">{acceptedCount}</span>
            <span className="invitations-page__stat-label">Accepted</span>
          </div>
        </div>

        {error && (
          <p className="invitations-page__error">{error}</p>
        )}
      </header>

      <div className="invitations-page__content">
        {/* Toolbar */}
        <div className="invitations-page__toolbar">
          <div className="invitations-page__filters">
            <KidDropdown
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              ariaLabel="Filter by status"
              minWidth={160}
              options={[
                { value: "all", label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "accepted", label: "Accepted" },
                { value: "expired", label: "Expired" },
                { value: "revoked", label: "Revoked" },
              ]}
            />
            <KidDropdown
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as TypeFilter)}
              ariaLabel="Filter by type"
              minWidth={140}
              options={[
                { value: "all", label: "All types" },
                { value: "user", label: "User" },
                { value: "parent", label: "Parent" },
              ]}
            />
            <button
              type="button"
              className="ui-btn ui-btn--ghost invitations-page__refresh-btn"
              onClick={() => void loadData()}
              disabled={loading}
              aria-label="Refresh"
            >
              <RefreshCw size={15} className={loading ? "invitations-page__spin" : ""} aria-hidden />
            </button>
          </div>
          <span className="invitations-page__count">
            {filtered.length} invitation{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <div className="invitations-page__table-wrap">
          <table className="invitations-page__table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Type</th>
                <th>Details</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="invitations-page__table-empty">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="invitations-page__table-empty">
                    <div className="invitations-page__empty-state">
                      <LinkIcon size={36} className="invitations-page__empty-icon" aria-hidden />
                      <p className="invitations-page__empty-title">No invitations yet</p>
                      <p className="invitations-page__empty-sub">
                        Send your first invite using the buttons above
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => {
                  const isExpired =
                    inv.status === "pending" && new Date(inv.expires_at) < new Date();
                  const effectiveStatus = isExpired ? "expired" : inv.status;

                  return (
                    <tr key={inv.token} className={`invitations-page__row invitations-page__row--${effectiveStatus}`}>
                      <td>
                        <span className="invitations-page__email">{inv.email}</span>
                      </td>
                      <td>
                        <span className={`invitations-page__type-badge invitations-page__type-badge--${inv.invite_type}`}>
                          {inv.invite_type === "parent" ? (
                            <><Users size={12} aria-hidden /> Parent</>
                          ) : (
                            <><UserCheck size={12} aria-hidden /> User</>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className="invitations-page__details">
                          {inv.invite_type === "user" && inv.role_name ? inv.role_name : null}
                          {inv.invite_type === "parent" && inv.student_names
                            ? inv.student_names.join(", ")
                            : null}
                          {!inv.role_name && !inv.student_names ? "—" : null}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={effectiveStatus} />
                      </td>
                      <td>
                        <time
                          className="invitations-page__date"
                          dateTime={inv.created_at}
                          title={new Date(inv.created_at).toLocaleString()}
                        >
                          {new Date(inv.created_at).toLocaleDateString()}
                        </time>
                      </td>
                      <td>
                        {effectiveStatus === "pending" ? (
                          <time
                            className="invitations-page__date"
                            dateTime={inv.expires_at}
                            title={new Date(inv.expires_at).toLocaleString()}
                          >
                            {new Date(inv.expires_at).toLocaleDateString()}
                          </time>
                        ) : (
                          <span className="invitations-page__date invitations-page__date--muted">—</span>
                        )}
                      </td>
                      <td className="invitations-page__actions-cell">
                        <div className="invitations-page__actions">
                          {effectiveStatus === "pending" && (
                            <button
                              type="button"
                              className="invitations-page__action-btn"
                              title={copiedToken === inv.token ? "Copied!" : "Copy invite link"}
                              onClick={() => void copyLink(inv.token, inv.invite_link)}
                            >
                              {copiedToken === inv.token ? (
                                <Check size={15} className="invitations-page__action-icon--success" aria-hidden />
                              ) : (
                                <Copy size={15} aria-hidden />
                              )}
                            </button>
                          )}
                          {effectiveStatus === "pending" && (
                            <button
                              type="button"
                              className="invitations-page__action-btn invitations-page__action-btn--danger"
                              title="Revoke invitation"
                              onClick={() => setConfirmRevokeToken(inv.token)}
                              disabled={revoking === inv.token}
                            >
                              <XCircle size={15} aria-hidden />
                            </button>
                          )}
                          {effectiveStatus !== "pending" && (
                            <span className="invitations-page__no-actions">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revoke confirm dialog */}
      <ModalDialog
        isOpen={Boolean(confirmRevokeToken)}
        onClose={() => setConfirmRevokeToken(null)}
        title="Revoke Invitation"
        ariaLabel="Confirm revoke invitation"
        contentClassName="invitations-page__dialog"
        closeVariant="danger"
        disableClose={Boolean(revoking)}
        footer={
          <div className="ui-form-actions">
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => setConfirmRevokeToken(null)}
              disabled={Boolean(revoking)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--danger"
              onClick={() => void handleRevoke()}
              disabled={Boolean(revoking)}
            >
              {revoking ? "Revoking…" : "Revoke"}
            </button>
          </div>
        }
      >
        <div className="invitations-page__revoke-body">
          <div className="invitations-page__revoke-icon">
            <Trash2 size={28} aria-hidden />
          </div>
          <p className="invitations-page__revoke-text">
            This will permanently invalidate the invite link. The recipient will no longer be able
            to use it.
          </p>
          <p className="invitations-page__revoke-email">
            {invites.find((i) => i.token === confirmRevokeToken)?.email}
          </p>
        </div>
      </ModalDialog>

      {/* Invite User dialog */}
      <ModalDialog
        isOpen={showInviteUser}
        onClose={closeInviteUser}
        title="Invite User"
        ariaLabel="Invite user to workspace"
        contentClassName="invitations-page__dialog"
        closeVariant="neutral"
        disableClose={sendingUser}
        footer={
          userInviteResult ? (
            <div className="ui-form-actions">
              <button type="button" className="ui-btn ui-btn--primary" onClick={closeInviteUser}>
                Done
              </button>
            </div>
          ) : (
            <div className="ui-form-actions">
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                onClick={closeInviteUser}
                disabled={sendingUser}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="inv-page-user-form"
                className="ui-btn ui-btn--primary"
                disabled={sendingUser || !inviteUserEmail.trim() || !inviteUserRoleId}
              >
                {sendingUser ? "Sending…" : "Send Invite"}
              </button>
            </div>
          )
        }
      >
        {userInviteResult ? (
          <InviteSuccess
            email={userInviteResult.email}
            link={userInviteResult.invite_link}
            copied={userResultCopied}
            onCopy={() => void copyLink(userInviteResult!.token, userInviteResult!.invite_link).then(() => setUserResultCopied(true))}
          />
        ) : (
          <form
            id="inv-page-user-form"
            className="invitations-page__form"
            onSubmit={(e) => void handleSendUserInvite(e)}
          >
            <p className="invitations-page__form-hint">
              A secure invitation link will be emailed. It expires in 7 days.
            </p>
            <div className="invitations-page__form-grid">
              <div className="invitations-page__field invitations-page__field--full">
                <label htmlFor="inv-user-email">Email address</label>
                <input
                  id="inv-user-email"
                  type="email"
                  value={inviteUserEmail}
                  onChange={(e) => setInviteUserEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  required
                />
              </div>
              <div className="invitations-page__field invitations-page__field--full">
                <label htmlFor="inv-user-fname">First name (optional)</label>
                <input
                  id="inv-user-fname"
                  value={inviteUserFirstName}
                  onChange={(e) => setInviteUserFirstName(e.target.value)}
                  placeholder="For personalised email"
                />
              </div>
              <div className="invitations-page__field invitations-page__field--full">
                <label>Role</label>
                <KidDropdown
                  value={inviteUserRoleId}
                  onChange={setInviteUserRoleId}
                  ariaLabel="Select role"
                  fullWidth
                  disabled={roleOptions.length === 0 || sendingUser}
                  options={
                    roleOptions.length > 0
                      ? roleOptions
                      : [{ value: "", label: "No active roles", disabled: true }]
                  }
                />
              </div>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* Invite Parent dialog */}
      <ModalDialog
        isOpen={showInviteParent}
        onClose={closeInviteParent}
        title="Invite Parent"
        ariaLabel="Invite parent to workspace"
        contentClassName="invitations-page__dialog"
        closeVariant="neutral"
        disableClose={sendingParent}
        footer={
          parentInviteResult ? (
            <div className="ui-form-actions">
              <button type="button" className="ui-btn ui-btn--primary" onClick={closeInviteParent}>
                Done
              </button>
            </div>
          ) : (
            <div className="ui-form-actions">
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                onClick={closeInviteParent}
                disabled={sendingParent}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="inv-page-parent-form"
                className="ui-btn ui-btn--primary"
                disabled={sendingParent || !inviteParentEmail.trim() || inviteParentStudentIds.length === 0}
              >
                {sendingParent ? "Sending…" : "Send Invite"}
              </button>
            </div>
          )
        }
      >
        {parentInviteResult ? (
          <InviteSuccess
            email={parentInviteResult.email}
            link={parentInviteResult.invite_link}
            copied={parentResultCopied}
            onCopy={() => void copyLink(parentInviteResult!.token, parentInviteResult!.invite_link).then(() => setParentResultCopied(true))}
          />
        ) : (
          <form
            id="inv-page-parent-form"
            className="invitations-page__form"
            onSubmit={(e) => void handleSendParentInvite(e)}
          >
            <p className="invitations-page__form-hint">
              Select the students this parent will be linked to, then enter their email.
            </p>
            <div className="invitations-page__form-grid">
              <div className="invitations-page__field invitations-page__field--full">
                <label htmlFor="inv-parent-email">Parent email address</label>
                <input
                  id="inv-parent-email"
                  type="email"
                  value={inviteParentEmail}
                  onChange={(e) => setInviteParentEmail(e.target.value)}
                  placeholder="parent@example.com"
                  required
                />
              </div>
              <div className="invitations-page__field invitations-page__field--full">
                <label htmlFor="inv-parent-fname">First name (optional)</label>
                <input
                  id="inv-parent-fname"
                  value={inviteParentFirstName}
                  onChange={(e) => setInviteParentFirstName(e.target.value)}
                  placeholder="For personalised email"
                />
              </div>
              <div className="invitations-page__field invitations-page__field--full">
                <label>Link to students</label>
                {students.length === 0 ? (
                  <p className="invitations-page__form-hint">No students enrolled yet.</p>
                ) : (
                  <div className="invitations-page__student-list">
                    {students.map((s) => (
                      <KidCheckbox
                        key={s.id}
                        checked={inviteParentStudentIds.includes(s.id)}
                        onChange={() => toggleParentStudent(s.id)}
                        disabled={sendingParent}
                      >
                        <span>
                          {s.first_name} {s.last_name}
                        </span>
                      </KidCheckbox>
                    ))}
                  </div>
                )}
                {inviteParentStudentIds.length === 0 && students.length > 0 && (
                  <p className="invitations-page__field-hint">Select at least one student</p>
                )}
              </div>
            </div>
          </form>
        )}
      </ModalDialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const icons: Record<string, React.ReactNode> = {
    pending: <Clock size={11} aria-hidden />,
    accepted: <Check size={11} aria-hidden />,
    expired: <XCircle size={11} aria-hidden />,
    revoked: <Trash2 size={11} aria-hidden />,
  };
  return (
    <span className={`invitations-page__status invitations-page__status--${status}`}>
      {icons[status] ?? null}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function InviteSuccess({
  email,
  link,
  copied,
  onCopy,
}: {
  email: string;
  link: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="invitations-page__success">
      <div className="invitations-page__success-icon">
        <UserPlus size={26} aria-hidden />
      </div>
      <p className="invitations-page__success-title">Invitation sent!</p>
      <p className="invitations-page__form-hint">
        Email sent to <strong>{email}</strong>. Copy the link below to share directly:
      </p>
      <div className="invitations-page__link-row">
        <input
          className="invitations-page__link-input"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className="ui-btn ui-btn--ghost invitations-page__copy-btn" onClick={onCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}
