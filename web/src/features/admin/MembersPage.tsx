import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, EllipsisVertical, Mail, Search, Users, UserPlus } from "lucide-react";
import { listUsers, type UserRecord } from "../../lib/api/users";
import { createStudent, listStudents, type StudentProfile } from "../../lib/api/students";
import {
  addTenantMember,
  listTenantMembers,
  listTenantRoles,
  removeTenantMember,
  updateTenantMemberRole,
  type TenantMemberRecord,
  type TenantRoleRecord,
} from "../../lib/api/tenants";
import {
  createUserInvite,
  createParentInvite,
  type InvitationResponse,
} from "../../lib/api/invitations";
import { KidCheckbox, KidDropdown, ModalDialog } from "../../components/ui";
import { useTenant } from "../../providers/TenantProvider";
import "../../components/ui/ui.css";
import "./members.css";

interface Member {
  id: string;
  userId?: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "instructor" | "user" | "parent" | "student" | "admin";
  roleLabel: string;
  status: "active" | "inactive";
  joined: string | null;
  username?: string | null;
  kind: "adult" | "student";
  isTenantMember?: boolean;
  tenantRoleSlug?: string | null;
  roleBadges: string[];
}

function toRoleBadgeLabel(roleSlug: string): string {
  return roleSlug
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function MembersPage() {
  const { tenant } = useTenant();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("all");
  const [roleFilter, setRoleFilter] = useState<"all" | "instructor" | "user" | "parent" | "student" | "admin">("all");
  const [tenantRoles, setTenantRoles] = useState<TenantRoleRecord[]>([]);
  const [actingOnUserId, setActingOnUserId] = useState<string | null>(null);
  const [openMenuForMemberId, setOpenMenuForMemberId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [manageRoleMember, setManageRoleMember] = useState<Member | null>(null);
  const [removeMembershipMember, setRemoveMembershipMember] = useState<Member | null>(null);
  const [removeMembershipAgreed, setRemoveMembershipAgreed] = useState(false);
  const [selectedManageRoleId, setSelectedManageRoleId] = useState("");
  const [savingManageRole, setSavingManageRole] = useState(false);
  const [showCreateStudentDialog, setShowCreateStudentDialog] = useState(false);
  const [creatingStudent, setCreatingStudent] = useState(false);

  // Invite user state
  const [showInviteUserDialog, setShowInviteUserDialog] = useState(false);
  const [inviteUserEmail, setInviteUserEmail] = useState("");
  const [inviteUserFirstName, setInviteUserFirstName] = useState("");
  const [inviteUserRoleId, setInviteUserRoleId] = useState("");
  const [sendingUserInvite, setSendingUserInvite] = useState(false);
  const [userInviteResult, setUserInviteResult] = useState<InvitationResponse | null>(null);
  const [userInviteLinkCopied, setUserInviteLinkCopied] = useState(false);

  // Invite parent state
  const [showInviteParentDialog, setShowInviteParentDialog] = useState(false);
  const [inviteParentEmail, setInviteParentEmail] = useState("");
  const [inviteParentFirstName, setInviteParentFirstName] = useState("");
  const [inviteParentStudentIds, setInviteParentStudentIds] = useState<string[]>([]);
  const [sendingParentInvite, setSendingParentInvite] = useState(false);
  const [parentInviteResult, setParentInviteResult] = useState<InvitationResponse | null>(null);
  const [parentInviteLinkCopied, setParentInviteLinkCopied] = useState(false);

  const [createStudentFirstName, setCreateStudentFirstName] = useState("");
  const [createStudentLastName, setCreateStudentLastName] = useState("");
  const [createStudentEmail, setCreateStudentEmail] = useState("");
  const [createStudentUsername, setCreateStudentUsername] = useState("");
  const [createStudentPassword, setCreateStudentPassword] = useState("");
  const [createStudentGrade, setCreateStudentGrade] = useState("");

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, studentsRes, tenantMembersRes] = await Promise.all([
        listUsers({ limit: 300 }),
        listStudents({ limit: 300 }).catch(() => [] as StudentProfile[]),
        tenant
          ? listTenantMembers(tenant.id).catch(() => [] as TenantMemberRecord[])
          : Promise.resolve([] as TenantMemberRecord[]),
      ]);

      const roleByUserId = new Map<string, string>(
        tenantMembersRes.map((member) => [member.user_id, member.role_slug ?? ""]),
      );
      const tenantMemberByUserId = new Map<string, TenantMemberRecord>(
        tenantMembersRes.map((member) => [member.user_id, member]),
      );
      if (tenant) {
        const roleRows = await listTenantRoles().catch(() => [] as TenantRoleRecord[]);
        setTenantRoles(roleRows.filter((role) => role.is_active));
      } else {
        setTenantRoles([]);
      }

      const adultMembers: Member[] = usersRes.items.map((u: UserRecord) => {
        const roleSlug = (roleByUserId.get(u.id) ?? "").toLowerCase();
        let role: Member["role"] = "user";
        if (roleSlug.includes("instructor")) role = "instructor";
        else if (roleSlug.includes("parent")) role = "parent";
        else if (roleSlug.includes("owner") || roleSlug.includes("admin")) role = "admin";
        const roleLabel =
          role === "admin"
            ? "Admin"
            : role === "user"
            ? "User"
            : role === "instructor"
              ? "Instructor"
              : "Parent";
        const tenantMember = tenantMemberByUserId.get(u.id);
        return {
          id: `user-${u.id}`,
          userId: u.id,
          firstName: u.first_name,
          lastName: u.last_name,
          email: u.email,
          role,
          roleLabel,
          status: u.is_active ? "active" : "inactive",
          joined: u.created_at,
          username: null,
          kind: "adult",
          isTenantMember: Boolean(tenantMember),
          tenantRoleSlug: tenantMember?.role_slug ?? null,
          roleBadges: [
            ...(u.is_super_admin ? ["Platform Admin"] : []),
            ...(tenantMember?.role_slug ? [toRoleBadgeLabel(tenantMember.role_slug)] : ["User"]),
          ],
        };
      });

      const studentMembers: Member[] = studentsRes.map((s) => ({
        id: `student-${s.id}`,
        firstName: s.first_name,
        lastName: s.last_name,
        email: s.email ?? "",
        role: "student",
        roleLabel: "Student",
        status: s.is_active ? "active" : "inactive",
        joined: null,
        username: s.display_name ?? null,
        kind: "student",
        roleBadges: ["Student"],
      }));

      setMembers([...adultMembers, ...studentMembers]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const matchesSearch =
        !search ||
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        m.email.toLowerCase().includes(search.toLowerCase()) ||
        (m.username ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || m.status === statusFilter;
      const matchesRole = roleFilter === "all" || m.role === roleFilter;
      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [members, search, statusFilter, roleFilter]);

  const managedRoleOptions = useMemo(() => {
    const bySlug = new Map(tenantRoles.map((role) => [role.slug, role]));
    const preferred = ["instructor", "user", "parent", "admin", "owner"];
    const ordered = preferred
      .map((slug) => bySlug.get(slug))
      .filter((role): role is TenantRoleRecord => Boolean(role));
    if (ordered.length > 0) return ordered;
    return tenantRoles;
  }, [tenantRoles]);

  useEffect(() => {
    if (!openMenuForMemberId) return;
    const onClickAway = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".members-page__menu") || target.closest(".members-page__menu-trigger")) return;
      setOpenMenuForMemberId(null);
      setMenuPosition(null);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuForMemberId(null);
        setMenuPosition(null);
      }
    };
    const onViewportChange = () => {
      setOpenMenuForMemberId(null);
      setMenuPosition(null);
    };
    window.addEventListener("mousedown", onClickAway);
    window.addEventListener("keydown", onEscape);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("mousedown", onClickAway);
      window.removeEventListener("keydown", onEscape);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [openMenuForMemberId]);

  function openManageRoleDialog(member: Member) {
    if (member.kind !== "adult") return;
    const defaultRole =
      managedRoleOptions.find((role) => role.slug === (member.tenantRoleSlug ?? "")) ??
      managedRoleOptions[0];
    setManageRoleMember(member);
    setSelectedManageRoleId(defaultRole?.id ?? "");
    setOpenMenuForMemberId(null);
    setMenuPosition(null);
  }

  function openRemoveMembershipDialog(member: Member) {
    if (member.kind !== "adult" || !member.isTenantMember) return;
    setRemoveMembershipMember(member);
    setRemoveMembershipAgreed(false);
    setOpenMenuForMemberId(null);
    setMenuPosition(null);
  }

  async function handleSaveManagedRole(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tenant?.id || !manageRoleMember?.userId || manageRoleMember.kind !== "adult") return;
    const role = managedRoleOptions.find((entry) => entry.id === selectedManageRoleId);
    if (!role) return;
    setSavingManageRole(true);
    setActingOnUserId(manageRoleMember.userId);
    setError(null);
    try {
      if (manageRoleMember.isTenantMember) {
        await updateTenantMemberRole(tenant.id, manageRoleMember.userId, { role_id: role.id });
      } else {
        await addTenantMember(tenant.id, { user_id: manageRoleMember.userId, role_id: role.id });
      }
      await loadMembers();
      setManageRoleMember(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to apply action");
    } finally {
      setActingOnUserId(null);
      setSavingManageRole(false);
    }
  }

  async function handleConfirmRemoveMembership() {
    if (!tenant?.id || !removeMembershipMember?.userId || removeMembershipMember.kind !== "adult") return;
    if (!removeMembershipMember.isTenantMember) return;
    if (!removeMembershipAgreed) return;
    setSavingManageRole(true);
    setActingOnUserId(removeMembershipMember.userId);
    setError(null);
    try {
      await removeTenantMember(tenant.id, removeMembershipMember.userId);
      await loadMembers();
      setRemoveMembershipMember(null);
      setRemoveMembershipAgreed(false);
      if (manageRoleMember?.userId === removeMembershipMember.userId) {
        setManageRoleMember(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove user from tenant");
    } finally {
      setActingOnUserId(null);
      setSavingManageRole(false);
    }
  }

  async function handleCreateStudent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!createStudentFirstName.trim() || !createStudentLastName.trim() || !createStudentPassword.trim()) {
      return;
    }
    setCreatingStudent(true);
    setError(null);
    try {
      await createStudent({
        first_name: createStudentFirstName.trim(),
        last_name: createStudentLastName.trim(),
        email: createStudentEmail.trim() || null,
        username: createStudentUsername.trim() || null,
        password: createStudentPassword.trim(),
        grade_level: createStudentGrade.trim() || null,
      });
      setCreateStudentFirstName("");
      setCreateStudentLastName("");
      setCreateStudentEmail("");
      setCreateStudentUsername("");
      setCreateStudentPassword("");
      setCreateStudentGrade("");
      setShowCreateStudentDialog(false);
      await loadMembers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create student");
    } finally {
      setCreatingStudent(false);
    }
  }

  async function handleSendUserInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!inviteUserEmail.trim() || !inviteUserRoleId) return;
    setSendingUserInvite(true);
    setError(null);
    try {
      const result = await createUserInvite({
        email: inviteUserEmail.trim(),
        role_id: inviteUserRoleId,
        first_name: inviteUserFirstName.trim() || undefined,
      });
      setUserInviteResult(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send invitation");
    } finally {
      setSendingUserInvite(false);
    }
  }

  function handleCloseInviteUserDialog() {
    setShowInviteUserDialog(false);
    setInviteUserEmail("");
    setInviteUserFirstName("");
    setInviteUserRoleId("");
    setUserInviteResult(null);
    setUserInviteLinkCopied(false);
  }

  async function handleSendParentInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!inviteParentEmail.trim() || inviteParentStudentIds.length === 0) return;
    setSendingParentInvite(true);
    setError(null);
    try {
      const result = await createParentInvite({
        email: inviteParentEmail.trim(),
        student_ids: inviteParentStudentIds,
        first_name: inviteParentFirstName.trim() || undefined,
      });
      setParentInviteResult(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send invitation");
    } finally {
      setSendingParentInvite(false);
    }
  }

  function handleCloseInviteParentDialog() {
    setShowInviteParentDialog(false);
    setInviteParentEmail("");
    setInviteParentFirstName("");
    setInviteParentStudentIds([]);
    setParentInviteResult(null);
    setParentInviteLinkCopied(false);
  }

  function toggleParentStudent(studentId: string) {
    setInviteParentStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId],
    );
  }

  async function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text manually
    }
  }

  const studentMembersForParentInvite = useMemo(
    () => members.filter((m) => m.kind === "student"),
    [members],
  );

  return (
    <div className="members-page" role="main" aria-label="Members management">
      <header className="members-page__header">
        <div className="members-page__header-top">
          <h1 className="members-page__title">Users</h1>
          <div className="members-page__header-actions">
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => setShowInviteParentDialog(true)}
              disabled={!tenant?.id}
            >
              <Users size={16} aria-hidden /> Invite Parent
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => setShowInviteUserDialog(true)}
              disabled={!tenant?.id}
            >
              <Mail size={16} aria-hidden /> Invite User
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              onClick={() => setShowCreateStudentDialog(true)}
            >
              <UserPlus size={16} aria-hidden /> Create Student
            </button>
          </div>
        </div>
        <p className="members-page__subtitle">
          Manage tenant users from live backend data
        </p>
        {error && <p className="members-page__subtitle" style={{ color: "var(--color-error, #ef4444)" }}>{error}</p>}
      </header>

      <div className="members-page__content">
        <div className="members-page__panel" role="tabpanel">
          <div className="members-page__toolbar">
            <div className="members-page__count">
              <Users size={16} aria-hidden /> {filteredMembers.length} user{filteredMembers.length !== 1 ? "s" : ""}
            </div>
            <div className="members-page__filters">
              <div className="members-page__search-wrap">
                <Search size={18} className="members-page__search-icon" aria-hidden />
                <input
                  type="search"
                  placeholder="Search by name or email..."
                  className="members-page__search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search users"
                />
              </div>
              <KidDropdown
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as "active" | "inactive" | "all")}
                ariaLabel="Filter by status"
                minWidth={160}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
              <KidDropdown
                value={roleFilter}
                onChange={(v) => setRoleFilter(v as "all" | "instructor" | "user" | "parent" | "student" | "admin")}
                ariaLabel="Filter by user type"
                minWidth={170}
                options={[
                  { value: "all", label: "All types" },
                  { value: "admin", label: "Admin" },
                  { value: "instructor", label: "Instructor" },
                  { value: "user", label: "User" },
                  { value: "parent", label: "Parent" },
                  { value: "student", label: "Student" },
                ]}
              />
            </div>
          </div>
          {loading && <p className="members-page__subtitle">Loading users...</p>}
          <div className="members-page__table-wrap">
            <table className="members-page__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="members-page__table-empty">
                      Loading users...
                    </td>
                  </tr>
                ) : filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="members-page__table-empty">
                      No users found
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <span className="members-page__name">
                          {m.firstName} {m.lastName}
                        </span>
                      </td>
                      <td>{m.email || "—"}</td>
                      <td>
                        <div className="members-page__role-badges">
                          {m.roleBadges.map((badge) => (
                            <span key={`${m.id}-${badge}`} className="members-page__role-pill">
                              {badge}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={`members-page__badge members-page__badge--${m.status}`}>
                          {m.status === "active" ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        {m.joined ? <time dateTime={m.joined}>{new Date(m.joined).toLocaleDateString()}</time> : "—"}
                      </td>
                      <td className="members-page__actions-cell">
                        {m.kind === "adult" ? (
                          <div className="members-page__menu-wrap">
                            <button
                              type="button"
                              className="members-page__menu-trigger"
                              aria-label={`Actions for ${m.firstName} ${m.lastName}`}
                              aria-haspopup="menu"
                              aria-expanded={openMenuForMemberId === m.id}
                              onClick={(event) => {
                                const rect = event.currentTarget.getBoundingClientRect();
                                const nextOpen = openMenuForMemberId === m.id ? null : m.id;
                                setOpenMenuForMemberId(nextOpen);
                                setMenuPosition(
                                  nextOpen
                                    ? {
                                        top: rect.bottom + 6,
                                        left: Math.max(12, rect.right - 180),
                                      }
                                    : null,
                                );
                              }}
                              disabled={!tenant?.id || actingOnUserId === m.userId}
                            >
                              <EllipsisVertical size={16} aria-hidden />
                            </button>
                          </div>
                        ) : (
                          <span className="members-page__muted">No actions</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ModalDialog
        isOpen={showCreateStudentDialog}
        onClose={() => setShowCreateStudentDialog(false)}
        title="Create Student"
        ariaLabel="Create student"
        contentClassName="members-page__dialog"
        closeVariant="neutral"
        disableClose={creatingStudent}
        footer={
          <div className="ui-form-actions">
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => setShowCreateStudentDialog(false)}
              disabled={creatingStudent}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="members-create-student-form"
              className="ui-btn ui-btn--primary"
              disabled={creatingStudent}
            >
              {creatingStudent ? "Creating..." : "Create Student"}
            </button>
          </div>
        }
      >
            <form
              id="members-create-student-form"
              className="members-page__form"
              onSubmit={handleCreateStudent}
            >
              <div className="members-page__form-grid">
                <div className="members-page__field">
                  <label htmlFor="student-first-name">First name</label>
                  <input
                    id="student-first-name"
                    value={createStudentFirstName}
                    onChange={(e) => setCreateStudentFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="members-page__field">
                  <label htmlFor="student-last-name">Last name</label>
                  <input
                    id="student-last-name"
                    value={createStudentLastName}
                    onChange={(e) => setCreateStudentLastName(e.target.value)}
                    required
                  />
                </div>
                <div className="members-page__field">
                  <label htmlFor="student-email">Email (optional)</label>
                  <input
                    id="student-email"
                    type="email"
                    value={createStudentEmail}
                    onChange={(e) => setCreateStudentEmail(e.target.value)}
                  />
                </div>
                <div className="members-page__field">
                  <label htmlFor="student-username">Username (optional)</label>
                  <input
                    id="student-username"
                    value={createStudentUsername}
                    onChange={(e) => setCreateStudentUsername(e.target.value)}
                  />
                </div>
                <div className="members-page__field">
                  <label htmlFor="student-grade">Grade (optional)</label>
                  <input
                    id="student-grade"
                    value={createStudentGrade}
                    onChange={(e) => setCreateStudentGrade(e.target.value)}
                    placeholder="e.g. 5th"
                  />
                </div>
                <div className="members-page__field">
                  <label htmlFor="student-password">Password</label>
                  <input
                    id="student-password"
                    type="password"
                    minLength={8}
                    value={createStudentPassword}
                    onChange={(e) => setCreateStudentPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            </form>
      </ModalDialog>

      <ModalDialog
        isOpen={Boolean(manageRoleMember)}
        onClose={() => setManageRoleMember(null)}
        title="Manage Role"
        ariaLabel="Manage user role"
        contentClassName="members-page__dialog"
        closeVariant="neutral"
        disableClose={savingManageRole}
        footer={
          manageRoleMember ? (
            <div className="ui-form-actions">
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                onClick={() => setManageRoleMember(null)}
                disabled={savingManageRole}
              >
                Cancel
              </button>
              {manageRoleMember.isTenantMember ? (
                <button
                  type="button"
                  className="ui-btn ui-btn--danger"
                  onClick={() => openRemoveMembershipDialog(manageRoleMember)}
                  disabled={savingManageRole}
                >
                  {savingManageRole ? "Removing..." : "Remove Role"}
                </button>
              ) : null}
              <button
                type="submit"
                form="members-manage-role-form"
                className="ui-btn ui-btn--primary"
                disabled={
                  savingManageRole || !selectedManageRoleId || managedRoleOptions.length === 0
                }
              >
                {savingManageRole
                  ? "Saving..."
                  : manageRoleMember.isTenantMember
                    ? "Save Role"
                    : "Add Role"}
              </button>
            </div>
          ) : null
        }
      >
        {manageRoleMember ? (
          <form
            id="members-manage-role-form"
            className="members-page__form"
            onSubmit={handleSaveManagedRole}
          >
            <p className="members-page__subtitle">
              Assign a tenant role for <strong>{manageRoleMember.firstName} {manageRoleMember.lastName}</strong>.
            </p>
            <div className="members-page__field">
              <label>Current roles</label>
              <div className="members-page__role-badges">
                {manageRoleMember.roleBadges.map((badge) => (
                  <span key={`manage-${manageRoleMember.id}-${badge}`} className="members-page__role-pill">
                    {badge}
                  </span>
                ))}
              </div>
            </div>
            <div className="members-page__field">
              <label htmlFor="manage-role-select">Role</label>
              <KidDropdown
                value={selectedManageRoleId}
                onChange={setSelectedManageRoleId}
                ariaLabel="Select role"
                fullWidth
                disabled={managedRoleOptions.length === 0 || savingManageRole}
                options={
                  managedRoleOptions.length > 0
                    ? managedRoleOptions.map((role) => ({
                        value: role.id,
                        label: role.name,
                      }))
                    : [{ value: "", label: "No active roles available", disabled: true }]
                }
              />
            </div>
          </form>
        ) : null}
      </ModalDialog>

      <ModalDialog
        isOpen={Boolean(removeMembershipMember)}
        onClose={() => {
          setRemoveMembershipMember(null);
          setRemoveMembershipAgreed(false);
        }}
        title="Remove User From Tenant"
        ariaLabel="Confirm remove user from tenant"
        contentClassName="members-page__dialog"
        closeVariant="neutral"
        disableClose={savingManageRole}
        footer={
          removeMembershipMember ? (
            <div className="ui-form-actions">
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                onClick={() => {
                  setRemoveMembershipMember(null);
                  setRemoveMembershipAgreed(false);
                }}
                disabled={savingManageRole}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--danger"
                onClick={() => void handleConfirmRemoveMembership()}
                disabled={!removeMembershipAgreed || savingManageRole}
              >
                {savingManageRole ? "Removing..." : "Confirm Remove"}
              </button>
            </div>
          ) : null
        }
      >
        {removeMembershipMember ? (
          <div className="members-page__form">
            <p className="members-page__subtitle">
              This removes <strong>{removeMembershipMember.firstName} {removeMembershipMember.lastName}</strong> from
              this tenant and revokes their tenant-scoped access.
            </p>
            <KidCheckbox
              className="members-page__agreement"
              labelPosition="start"
              checked={removeMembershipAgreed}
              onChange={setRemoveMembershipAgreed}
              disabled={savingManageRole}
            >
              <span>I understand and agree to remove this user from the tenant.</span>
            </KidCheckbox>
          </div>
        ) : null}
      </ModalDialog>

      {/* Invite User Modal */}
      <ModalDialog
        isOpen={showInviteUserDialog}
        onClose={handleCloseInviteUserDialog}
        title="Invite User"
        ariaLabel="Invite user to tenant"
        contentClassName="members-page__dialog"
        closeVariant="neutral"
        disableClose={sendingUserInvite}
        footer={
          userInviteResult ? (
            <div className="ui-form-actions">
              <button
                type="button"
                className="ui-btn ui-btn--primary"
                onClick={handleCloseInviteUserDialog}
              >
                Done
              </button>
            </div>
          ) : (
            <div className="ui-form-actions">
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                onClick={handleCloseInviteUserDialog}
                disabled={sendingUserInvite}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="members-invite-user-form"
                className="ui-btn ui-btn--primary"
                disabled={sendingUserInvite || !inviteUserEmail.trim() || !inviteUserRoleId}
              >
                {sendingUserInvite ? "Sending…" : "Send Invite"}
              </button>
            </div>
          )
        }
      >
        {userInviteResult ? (
          <div className="members-page__invite-success">
            <div className="members-page__invite-success-icon">
              <Check size={28} />
            </div>
            <p className="members-page__invite-success-title">Invitation sent!</p>
            <p className="members-page__subtitle">
              An invite email has been sent to <strong>{userInviteResult.email}</strong>.
              Share the link below if needed:
            </p>
            <div className="members-page__invite-link-row">
              <input
                className="members-page__invite-link-input"
                readOnly
                value={userInviteResult.invite_link}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className="ui-btn ui-btn--ghost members-page__invite-copy-btn"
                onClick={() => void copyToClipboard(userInviteResult.invite_link, setUserInviteLinkCopied)}
              >
                {userInviteLinkCopied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
          </div>
        ) : (
          <form
            id="members-invite-user-form"
            className="members-page__form"
            onSubmit={(e) => void handleSendUserInvite(e)}
          >
            <p className="members-page__subtitle">
              An invitation email will be sent with a secure link. The link expires in 7 days.
            </p>
            <div className="members-page__form-grid">
              <div className="members-page__field members-page__field--full">
                <label htmlFor="invite-user-email">Email address</label>
                <input
                  id="invite-user-email"
                  type="email"
                  value={inviteUserEmail}
                  onChange={(e) => setInviteUserEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  required
                />
              </div>
              <div className="members-page__field members-page__field--full">
                <label htmlFor="invite-user-first-name">First name (optional)</label>
                <input
                  id="invite-user-first-name"
                  value={inviteUserFirstName}
                  onChange={(e) => setInviteUserFirstName(e.target.value)}
                  placeholder="For personalised email"
                />
              </div>
              <div className="members-page__field members-page__field--full">
                <label htmlFor="invite-user-role">Role</label>
                <KidDropdown
                  value={inviteUserRoleId}
                  onChange={setInviteUserRoleId}
                  ariaLabel="Select role"
                  fullWidth
                  disabled={managedRoleOptions.length === 0 || sendingUserInvite}
                  options={
                    managedRoleOptions.length > 0
                      ? managedRoleOptions.map((role) => ({ value: role.id, label: role.name }))
                      : [{ value: "", label: "No active roles available", disabled: true }]
                  }
                />
              </div>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* Invite Parent Modal */}
      <ModalDialog
        isOpen={showInviteParentDialog}
        onClose={handleCloseInviteParentDialog}
        title="Invite Parent"
        ariaLabel="Invite parent to tenant"
        contentClassName="members-page__dialog"
        closeVariant="neutral"
        disableClose={sendingParentInvite}
        footer={
          parentInviteResult ? (
            <div className="ui-form-actions">
              <button
                type="button"
                className="ui-btn ui-btn--primary"
                onClick={handleCloseInviteParentDialog}
              >
                Done
              </button>
            </div>
          ) : (
            <div className="ui-form-actions">
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                onClick={handleCloseInviteParentDialog}
                disabled={sendingParentInvite}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="members-invite-parent-form"
                className="ui-btn ui-btn--primary"
                disabled={
                  sendingParentInvite ||
                  !inviteParentEmail.trim() ||
                  inviteParentStudentIds.length === 0
                }
              >
                {sendingParentInvite ? "Sending…" : "Send Invite"}
              </button>
            </div>
          )
        }
      >
        {parentInviteResult ? (
          <div className="members-page__invite-success">
            <div className="members-page__invite-success-icon">
              <Check size={28} />
            </div>
            <p className="members-page__invite-success-title">Invitation sent!</p>
            <p className="members-page__subtitle">
              An invite email has been sent to <strong>{parentInviteResult.email}</strong>.
              Share the link below if needed:
            </p>
            <div className="members-page__invite-link-row">
              <input
                className="members-page__invite-link-input"
                readOnly
                value={parentInviteResult.invite_link}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className="ui-btn ui-btn--ghost members-page__invite-copy-btn"
                onClick={() => void copyToClipboard(parentInviteResult.invite_link, setParentInviteLinkCopied)}
              >
                {parentInviteLinkCopied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
          </div>
        ) : (
          <form
            id="members-invite-parent-form"
            className="members-page__form"
            onSubmit={(e) => void handleSendParentInvite(e)}
          >
            <p className="members-page__subtitle">
              Select the students this parent will be linked to, then enter their email. They'll
              receive a secure link to register or sign in.
            </p>
            <div className="members-page__form-grid">
              <div className="members-page__field members-page__field--full">
                <label htmlFor="invite-parent-email">Parent email address</label>
                <input
                  id="invite-parent-email"
                  type="email"
                  value={inviteParentEmail}
                  onChange={(e) => setInviteParentEmail(e.target.value)}
                  placeholder="parent@example.com"
                  required
                />
              </div>
              <div className="members-page__field members-page__field--full">
                <label htmlFor="invite-parent-first-name">First name (optional)</label>
                <input
                  id="invite-parent-first-name"
                  value={inviteParentFirstName}
                  onChange={(e) => setInviteParentFirstName(e.target.value)}
                  placeholder="For personalised email"
                />
              </div>
              <div className="members-page__field members-page__field--full">
                <label>Link to students</label>
                {studentMembersForParentInvite.length === 0 ? (
                  <p className="members-page__subtitle">No students enrolled yet.</p>
                ) : (
                  <div className="members-page__student-checklist">
                    {studentMembersForParentInvite.map((s) => {
                      const sid = s.id.replace("student-", "");
                      return (
                        <KidCheckbox
                          key={s.id}
                          checked={inviteParentStudentIds.includes(sid)}
                          onChange={() => toggleParentStudent(sid)}
                          disabled={sendingParentInvite}
                        >
                          <span>
                            {s.firstName} {s.lastName}
                          </span>
                        </KidCheckbox>
                      );
                    })}
                  </div>
                )}
                {inviteParentStudentIds.length === 0 && (
                  <p className="members-page__invite-validation">
                    Select at least one student
                  </p>
                )}
              </div>
            </div>
          </form>
        )}
      </ModalDialog>

      {openMenuForMemberId && menuPosition
        ? createPortal(
            <div
              className="members-page__menu"
              role="menu"
              aria-label="User actions"
              style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left }}
            >
              <button
                type="button"
                className="members-page__menu-item"
                role="menuitem"
                onClick={() => {
                  const member = filteredMembers.find((entry) => entry.id === openMenuForMemberId);
                  if (member) openManageRoleDialog(member);
                }}
              >
                Manage Role
              </button>
              {filteredMembers.find((entry) => entry.id === openMenuForMemberId)?.isTenantMember ? (
                <button
                  type="button"
                  className="members-page__menu-item members-page__menu-item--danger"
                  role="menuitem"
                  onClick={() => {
                    const member = filteredMembers.find((entry) => entry.id === openMenuForMemberId);
                    if (member) openRemoveMembershipDialog(member);
                  }}
                >
                  Remove Membership
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
