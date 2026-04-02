import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Lock,
  PanelLeftClose,
  Mail,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { useSidebar } from "../../contexts/SidebarContext";
import { useChildContextStudentId } from "../../lib/childContext";
import { useNavInboxSignals } from "../../hooks/useNavInboxSignals";
import { useGuardianMemberBillingSummary } from "../../hooks/useGuardianMemberBillingSummary";
import { TenantSwitcher } from "./TenantSwitcher";
import { apiFetch } from "../../lib/api/client";
import { ModalDialog } from "../ui";
import "../ui/ui.css";
import "./sidebar.css";

type NavItem = {
  path: string;
  label: string;
  icon?: LucideIcon;
  iconSrc?: string;
  section?: string;
  /** Parent inbox: only active when ``?hub=`` matches (see ``/app/messages`` rows). */
  messagesHub?: string;
};

const STUDENT_NAV: NavItem[] = [
  { path: "/app", label: "Home", iconSrc: "/assets/cartoon-icons/house.png" },
  { path: "/app/classrooms", label: "Classes", iconSrc: "/assets/cartoon-icons/bag.png" },
  { path: "/app/projects", label: "My Projects", iconSrc: "/assets/cartoon-icons/Chest.png" },
  { path: "/app/assignments", label: "Assignments", iconSrc: "/assets/cartoon-icons/Papyrus.png" },
  { path: "/app/labs", label: "Labs", iconSrc: "/assets/cartoon-icons/telescope.png" },
  { path: "/app/achievements", label: "Achievements", iconSrc: "/assets/cartoon-icons/trophy.png" },
  { path: "/app/messages", label: "Messages", iconSrc: "/assets/cartoon-icons/Information.png" },
];

const PARENT_NAV: NavItem[] = [
  { path: "/app", label: "Home", iconSrc: "/assets/cartoon-icons/house.png" },
  {
    path: "/app/children",
    label: "Children",
    iconSrc: "/assets/cartoon-icons/Players.png",
    section: "Your family",
  },
  {
    path: "/app/member-billing/pay",
    label: "Membership",
    iconSrc: "/assets/cartoon-icons/coin.png",
    section: "Your family",
  },
  {
    path: "/app/member-billing/invoices",
    label: "Invoices",
    iconSrc: "/assets/cartoon-icons/Papyrus.png",
    section: "Your family",
  },
  {
    path: "/app/messages",
    label: "Updates & Messages",
    iconSrc: "/assets/cartoon-icons/Information.png",
    section: "Stay in touch",
  },
  {
    path: "/app/messages",
    label: "Attendance",
    iconSrc: "/assets/cartoon-icons/Callendar.png",
    section: "Stay in touch",
    messagesHub: "attendance",
  },
  {
    path: "/app/notifications",
    label: "Notifications",
    iconSrc: "/assets/cartoon-icons/Bell.png",
    section: "Stay in touch",
  },
];

/** Mini-tenant operator: teach + manage subscription + family overview. */
const HOMESCHOOL_NAV: NavItem[] = [
  { path: "/app", label: "Home", iconSrc: "/assets/cartoon-icons/house.png" },
  { path: "/app/students", label: "Students", iconSrc: "/assets/cartoon-icons/Players.png" },
  { path: "/app/classrooms", label: "Classrooms", iconSrc: "/assets/cartoon-icons/bag.png" },
  { path: "/app/curriculum", label: "Curriculum", iconSrc: "/assets/cartoon-icons/Books.png" },
  { path: "/app/labs", label: "Labs", iconSrc: "/assets/cartoon-icons/telescope.png" },
  {
    path: "/app/children",
    label: "Children",
    iconSrc: "/assets/cartoon-icons/Players.png",
    section: "Your family",
  },
  {
    path: "/app/member-billing/pay",
    label: "Membership",
    iconSrc: "/assets/cartoon-icons/coin.png",
    section: "Your family",
  },
  {
    path: "/app/member-billing/invoices",
    label: "Invoices",
    iconSrc: "/assets/cartoon-icons/Papyrus.png",
    section: "Your family",
  },
  {
    path: "/app/messages",
    label: "Updates & Messages",
    iconSrc: "/assets/cartoon-icons/Information.png",
    section: "Stay in touch",
  },
  {
    path: "/app/messages",
    label: "Attendance",
    iconSrc: "/assets/cartoon-icons/Callendar.png",
    section: "Stay in touch",
    messagesHub: "attendance",
  },
  { path: "/app/billing", label: "Billing", iconSrc: "/assets/cartoon-icons/coin.png" },
  { path: "/app/settings/member-billing", label: "Membership admin", iconSrc: "/assets/cartoon-icons/Papyrus.png" },
  { path: "/app/settings", label: "Settings", iconSrc: "/assets/cartoon-icons/Lock.png" },
  { path: "/app/notifications", label: "Notifications", iconSrc: "/assets/cartoon-icons/Bell.png" },
];

const INSTRUCTOR_NAV: NavItem[] = [
  { path: "/app", label: "Home", iconSrc: "/assets/cartoon-icons/house.png" },
  { path: "/app/classrooms", label: "Classrooms", iconSrc: "/assets/cartoon-icons/bag.png" },
  { path: "/app/students", label: "Students", iconSrc: "/assets/cartoon-icons/Players.png" },
  { path: "/app/curriculum", label: "Curriculum", iconSrc: "/assets/cartoon-icons/Books.png" },
  { path: "/app/gamification", label: "Gamification", iconSrc: "/assets/cartoon-icons/Gift1.png" },
  { path: "/app/settings/member-billing", label: "Membership", iconSrc: "/assets/cartoon-icons/Papyrus.png" },
  { path: "/app/messages", label: "Messages", iconSrc: "/assets/cartoon-icons/Information.png" },
];

const ADMIN_NAV: NavItem[] = [
  { path: "/app", label: "Dashboard", iconSrc: "/assets/cartoon-icons/house.png" },
  { path: "/app/labs", label: "Labs", iconSrc: "/assets/cartoon-icons/telescope.png", section: "Learning" },
  { path: "/app/members", label: "Users", iconSrc: "/assets/cartoon-icons/Players.png", section: "People" },
  { path: "/app/invitations", label: "Invitations", iconSrc: "/assets/cartoon-icons/Papyrus.png" },
  { path: "/app/roles", label: "Roles", iconSrc: "/assets/cartoon-icons/Lock.png" },
  { path: "/app/classrooms", label: "Classrooms", iconSrc: "/assets/cartoon-icons/bag.png" },
  { path: "/app/curriculum", label: "Curriculum", iconSrc: "/assets/cartoon-icons/Books.png", section: "Content" },
  { path: "/app/programs", label: "Programs", iconSrc: "/assets/cartoon-icons/Globe.png" },
  { path: "/app/assets", label: "Assets", iconSrc: "/assets/cartoon-icons/Chest.png" },
  { path: "/app/gamification", label: "Gamification", iconSrc: "/assets/cartoon-icons/Gift1.png", section: "Organization" },
  { path: "/app/analytics", label: "Insights", iconSrc: "/assets/cartoon-icons/Trail.png", section: "Organization" },
  { path: "/app/integrations", label: "Integrations", iconSrc: "/assets/cartoon-icons/Thunder.png", section: "Organization" },
  { path: "/app/billing", label: "Billing", iconSrc: "/assets/cartoon-icons/coin.png" },
  { path: "/app/settings/member-billing", label: "Membership", iconSrc: "/assets/cartoon-icons/Papyrus.png" },
];

/** Platform Administration nav - super admin in platform view.
    Admin Tasks, Health Check, Job Worker, Entity Browser are in TenantSwitcher dropdown only. */
const PLATFORM_NAV: NavItem[] = [
  { path: "/app", label: "Platform Admin", iconSrc: "/assets/cartoon-icons/Lock.png" },
  { path: "/app/platform/dashboard", label: "Analytics", iconSrc: "/assets/cartoon-icons/Trail.png" },
  { path: "/app/platform/email", label: "Email Config", iconSrc: "/assets/cartoon-icons/Information.png" },
  { path: "/app/platform/users", label: "Users", iconSrc: "/assets/cartoon-icons/Players.png" },
  { path: "/app/platform/roles", label: "Roles", iconSrc: "/assets/cartoon-icons/Lock.png" },
  {
    path: "/app/platform/member-billing-fees",
    label: "Member fees",
    iconSrc: "/assets/cartoon-icons/coin.png",
  },
];

function getNavItems(
  role: string | null,
  isPlatformView: boolean,
  isSuperAdmin: boolean,
  pathname: string,
  subType: "user" | "student" | null,
  childContextStudentId: string | null,
): NavItem[] {
  const isOnPlatformPage =
    pathname.startsWith("/app/platform/dashboard") ||
    pathname.startsWith("/app/platform/email") ||
    pathname.startsWith("/app/platform/users") ||
    pathname.startsWith("/app/platform/roles") ||
    pathname.startsWith("/app/platform/member-billing-fees");
  if (isSuperAdmin && (isPlatformView || isOnPlatformPage)) return PLATFORM_NAV;
  const asLearner =
    Boolean(childContextStudentId) && subType === "user";
  switch (role ?? "") {
    case "parent":
      if (asLearner) return STUDENT_NAV;
      return PARENT_NAV;
    case "homeschool_parent":
      if (asLearner) return STUDENT_NAV;
      return HOMESCHOOL_NAV;
    case "instructor":
      return INSTRUCTOR_NAV;
    case "admin":
    case "owner":
      return ADMIN_NAV;
    default:
      return STUDENT_NAV;
  }
}

function getInitials(firstName?: string, lastName?: string, email?: string): string {
  const first = firstName?.charAt(0) ?? "";
  const last = lastName?.charAt(0) ?? "";
  if (first || last) return (first + last).toUpperCase();
  if (email) return email.charAt(0).toUpperCase();
  return "?";
}

function getDisplayName(firstName?: string, lastName?: string, email?: string): string {
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  if (name) return name;
  if (email) return email;
  return "User";
}

type CreateAction = {
  id: string;
  label: string;
  description: string;
  section: string;
  to: string;
  capabilityKey?: string;
  locked?: boolean;
  lockReason?: string | null;
};

function getCreateActions(
  isAdminLike: boolean,
  isInstructor: boolean,
  isHomeschool: boolean,
): CreateAction[] {
  const out: CreateAction[] = [];
  if (isAdminLike) {
    out.push(
      {
        id: "class",
        label: "New class",
        description: "Create a classroom and schedule sessions.",
        section: "Teaching",
        to: "/app/classrooms?create=1",
        capabilityKey: "create_classroom",
      },
      {
        id: "program",
        label: "New program",
        description: "Set term dates and defaults for groups of classes.",
        section: "Teaching",
        to: "/app/programs?create=1",
      },
      {
        id: "curriculum",
        label: "New curriculum",
        description: "Add a new course with modules, lessons, and labs.",
        section: "Curriculum",
        to: "/app/curriculum?create=1",
      },
      {
        id: "rubric",
        label: "New rubric template",
        description: "Define reusable grading criteria.",
        section: "Curriculum",
        to: "/app/curriculum/authoring?tab=rubrics&create=rubric",
      },
      {
        id: "assignment",
        label: "New assignment template",
        description: "Create a reusable assignment for session launch.",
        section: "Curriculum",
        to: "/app/curriculum/authoring?tab=assignments&create=assignment",
      },
      {
        id: "invite",
        label: "Invite users",
        description: "Send invites to staff and instructors.",
        section: "People",
        to: "/app/invitations?create=user",
        capabilityKey: "create_student",
      },
    );
    return out;
  }
  if (isInstructor || isHomeschool) {
    if (isHomeschool) {
      out.push({
        id: "curriculum",
        label: "New curriculum",
        description: "Add a new course with modules, lessons, and labs.",
        section: "Curriculum",
        to: "/app/curriculum?create=1",
      });
    }
    out.push(
      {
        id: "class",
        label: "New class",
        description: "Create a classroom and schedule sessions.",
        section: "Teaching",
        to: "/app/classrooms?create=1",
      },
      {
        id: "rubric",
        label: "New rubric template",
        description: "Define reusable grading criteria.",
        section: "Curriculum",
        to: "/app/curriculum/authoring?tab=rubrics&create=rubric",
      },
      {
        id: "assignment",
        label: "New assignment template",
        description: "Create a reusable assignment for session launch.",
        section: "Curriculum",
        to: "/app/curriculum/authoring?tab=assignments&create=assignment",
      },
    );
  }
  return out;
}

function SidebarCreateMenu({
  actions,
  collapsed,
  onNavigate,
  canUpgrade,
}: {
  actions: CreateAction[];
  collapsed: boolean;
  onNavigate: () => void;
  canUpgrade: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [paywallAction, setPaywallAction] = useState<CreateAction | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const grouped = actions.reduce<Record<string, CreateAction[]>>((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div className="sidebar__create-wrap" ref={wrapRef}>
      <button
        type="button"
        className="sidebar__create-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={collapsed ? "Create" : undefined}
        title={collapsed ? "Create" : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Plus size={18} strokeWidth={2.5} aria-hidden className="sidebar__create-plus" />
        <span className="sidebar__create-label">Create</span>
      </button>
      {open && (
        <div className="sidebar__create-menu" role="menu" aria-label="Create menu">
          <div className="sidebar__create-menu-header">
            <h3 className="sidebar__create-menu-title">Create new</h3>
            <p className="sidebar__create-menu-subtitle">
              Start a new workflow quickly.
            </p>
          </div>
          <div className="sidebar__create-menu-body">
            {Object.entries(grouped).map(([section, rows]) => (
              <div key={section} className="sidebar__create-section">
                <p className="sidebar__create-section-title">{section}</p>
                <ul className="sidebar__create-section-list" role="none">
                  {rows.map((a) => (
                    <li key={a.id} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className={`sidebar__create-menu-item${a.locked ? " sidebar__create-menu-item--locked" : ""}`}
                        onClick={() => {
                          if (a.locked) {
                            setPaywallAction(a);
                            return;
                          }
                          navigate(a.to);
                          setOpen(false);
                          onNavigate();
                        }}
                        aria-disabled={a.locked ? true : undefined}
                      >
                        <span className="sidebar__create-menu-item-label">
                          {a.locked && <Lock size={14} aria-hidden className="sidebar__create-menu-item-lock" />}
                          {a.label}
                        </span>
                        <span className="sidebar__create-menu-item-desc">
                          {a.locked ? (a.lockReason ?? "Not available on your current plan.") : a.description}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="sidebar__create-menu-footer">
            Pick an action to open its creation flow.
          </div>
        </div>
      )}
      <ModalDialog
        isOpen={Boolean(paywallAction)}
        onClose={() => setPaywallAction(null)}
        title="Feature not available on your plan"
        ariaLabel="Upgrade required"
        contentClassName="sidebar__upgrade-modal"
        closeVariant="neutral"
        footer={
          <div className="ui-form-actions">
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setPaywallAction(null)}>
              Not now
            </button>
            {canUpgrade ? (
              <button
                type="button"
                className="ui-btn ui-btn--primary"
                onClick={() => {
                  setPaywallAction(null);
                  setOpen(false);
                  navigate("/app/billing");
                  onNavigate();
                }}
              >
                Upgrade now
              </button>
            ) : null}
          </div>
        }
      >
        <p className="sidebar__upgrade-copy">
          <strong>{paywallAction?.label}</strong> is currently locked for your subscription.
        </p>
        <p className="sidebar__upgrade-copy">
          {canUpgrade
            ? "Upgrade your plan to unlock this action."
            : "Ask your organization owner/admin to upgrade the plan."}
        </p>
      </ModalDialog>
    </div>
  );
}

function membershipNavPill(
  path: string,
  mb: ReturnType<typeof useGuardianMemberBillingSummary>,
): ReactNode {
  if (path !== "/app/member-billing/pay") return null;
  if (mb.loading) {
    return (
      <span className="sidebar__mb-pill sidebar__mb-pill--loading" aria-hidden>
        ···
      </span>
    );
  }
  const s = mb.status;
  if (!s) return null;
  if (!s.member_billing_enabled) {
    return (
      <span className="sidebar__mb-pill sidebar__mb-pill--included" title="No paid membership required">
        Included
      </span>
    );
  }
  if (s.children.length > 0 && mb.allChildrenHaveActiveMembership) {
    return (
      <span className="sidebar__mb-pill sidebar__mb-pill--active" title="All linked learners are covered">
        Active
      </span>
    );
  }
  if (s.children.length > 0 && mb.anyChildNeedsMembership) {
    return (
      <span className="sidebar__mb-pill sidebar__mb-pill--due" title="A learner needs membership">
        Payment
      </span>
    );
  }
  if (s.member_billing_enabled && s.children.length === 0) {
    return (
      <span className="sidebar__mb-pill sidebar__mb-pill--muted" title="Link a learner to pay">
        Add learner
      </span>
    );
  }
  return null;
}

export function Sidebar() {
  const { collapsed, setCollapsed, closed, setClosed } = useSidebar();
  const { user, role, isSuperAdmin, subType } = useAuth();
  const childCtx = useChildContextStudentId();
  const { tenant } = useTenant();
  const { isPlatformView } = useWorkspace();
  const location = useLocation();
  const navItems = getNavItems(
    role,
    isPlatformView,
    isSuperAdmin,
    location.pathname,
    subType,
    childCtx,
  );
  const isAdmin = isSuperAdmin || role === "admin" || role === "owner";
  const isParentLike = role === "parent" || role === "homeschool_parent";
  const isInstructor = role === "instructor";
  const isHomeschool = role === "homeschool_parent";
  const isAdminLike = role === "admin" || role === "owner";
  const showTenantSwitcher = isAdmin || isParentLike || isInstructor;
  const [isMobile, setIsMobile] = useState(false);
  const { unreadChatThreads, unreadNotifications } = useNavInboxSignals();
  const guardianMemberBilling = useGuardianMemberBillingSummary();

  useEffect(() => {
    document.documentElement.dataset.sidebarCollapsed = collapsed ? "true" : "";
    document.documentElement.dataset.sidebarClosed = closed ? "true" : "";
    return () => {
      delete document.documentElement.dataset.sidebarCollapsed;
      delete document.documentElement.dataset.sidebarClosed;
    };
  }, [collapsed, closed]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");
    const applyMode = (mobile: boolean) => {
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(false);
        setClosed(true);
      } else {
        setClosed(false);
      }
    };
    applyMode(media.matches);
    const handler = (event: MediaQueryListEvent) => applyMode(event.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [setClosed, setCollapsed]);

  useEffect(() => {
    if (isMobile) setClosed(true);
  }, [location.pathname, isMobile, setClosed]);

  const isOnPlatformPage =
    location.pathname.startsWith("/app/platform/dashboard") ||
    location.pathname.startsWith("/app/platform/email") ||
    location.pathname.startsWith("/app/platform/users") ||
    location.pathname.startsWith("/app/platform/roles") ||
    location.pathname.startsWith("/app/platform/member-billing-fees");
  const showSidebarCreate =
    !isPlatformView &&
    !isOnPlatformPage &&
    (isAdminLike || isInstructor || isHomeschool);
  const createActionsBase = useMemo(
    () => (showSidebarCreate ? getCreateActions(isAdminLike, isInstructor, isHomeschool) : []),
    [showSidebarCreate, isAdminLike, isInstructor, isHomeschool],
  );
  const [capabilityChecks, setCapabilityChecks] = useState<
    Record<string, { allowed: boolean; reason?: string | null }>
  >({});
  useEffect(() => {
    let cancelled = false;
    if (!showSidebarCreate || !isAdminLike) {
      setCapabilityChecks((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const keys = Array.from(
      new Set(
        createActionsBase
          .map((a) => a.capabilityKey)
          .filter((k): k is string => Boolean(k)),
      ),
    );
    if (keys.length === 0) {
      setCapabilityChecks((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    void Promise.all(
      keys.map(async (key) => {
        try {
          const res = await apiFetch<{ allowed: boolean; reason?: string | null }>(
            "/capabilities/check",
            { method: "POST", body: { capability_key: key } },
          );
          return [key, res] as const;
        } catch {
          return [key, { allowed: true, reason: null }] as const;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      setCapabilityChecks(Object.fromEntries(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [showSidebarCreate, isAdminLike, createActionsBase]);
  const createActions = useMemo(() => {
    if (!isAdminLike) return createActionsBase;
    return createActionsBase.map((action) => {
      const key = action.capabilityKey;
      if (!key) return action;
      const cap = capabilityChecks[key];
      if (!cap || cap.allowed) return action;
      return {
        ...action,
        locked: true,
        lockReason: cap.reason ?? "Not available on your current plan.",
      };
    });
  }, [isAdminLike, createActionsBase, capabilityChecks]);
  const displayName = (isPlatformView || isOnPlatformPage) ? "Platform Admin" : (tenant?.name ?? "Organization");

  if (closed && !isMobile) {
    return (
      <button
        type="button"
        className="sidebar__open-tab"
        onClick={() => setClosed(false)}
        aria-label="Open sidebar"
      >
        <PanelLeftClose size={20} aria-hidden />
        <span className="sidebar__open-tab-label">Open</span>
      </button>
    );
  }

  if (closed && isMobile) return null;


  return (
    <>
      {isMobile && (
        <button
          type="button"
          className="sidebar__mobile-backdrop"
          aria-label="Close sidebar"
          onClick={() => setClosed(true)}
        />
      )}
      <aside
        className={`sidebar ${collapsed ? "collapsed" : ""} ${isMobile ? "sidebar--mobile" : ""}`}
        role="navigation"
        aria-label="Main navigation"
      >
      <div className="sidebar__header">
        <div className="sidebar__header-row">
          {showTenantSwitcher ? (
            <TenantSwitcher />
          ) : (
          <div className="sidebar__tenant-display">
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} alt="" className="sidebar__logo" aria-hidden />
            ) : (
              <div
                className="sidebar__logo"
                style={{
                  background: "var(--color-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                }}
                aria-hidden
              >
                {displayName.charAt(0)}
              </div>
            )}
            <span className="sidebar__tenant-name">{displayName}</span>
          </div>
          )}
        </div>
      </div>

      {createActions.length > 0 && (
        <SidebarCreateMenu
          actions={createActions}
          collapsed={collapsed}
          canUpgrade={isAdminLike}
          onNavigate={() => {
            if (isMobile) setClosed(true);
          }}
        />
      )}

      <nav
        className="sidebar__nav"
        onClick={(event) => {
          const target = event.target;
          if (!isMobile || !(target instanceof HTMLElement)) return;
          if (target.closest(".sidebar__nav-link")) setClosed(true);
        }}
      >
        <ul className="sidebar__nav-list">
          {navItems.map((item, idx) => {
            const hub = new URLSearchParams(location.search).get("hub");
            const isActive =
              item.path === "/app"
                ? location.pathname === "/app"
                : item.path === "/app/messages"
                  ? item.messagesHub != null
                    ? location.pathname === "/app/messages" && hub === item.messagesHub
                    : location.pathname === "/app/messages" &&
                      hub !== "attendance" &&
                      hub !== "events"
                  : location.pathname.startsWith(item.path);
            const showSection = item.section && (idx === 0 || navItems[idx - 1]?.section !== item.section);
            const toPath =
              item.messagesHub != null
                ? `${item.path}?hub=${encodeURIComponent(item.messagesHub)}`
                : item.path;
            return (
              <li key={`${item.path}-${item.label}-${item.messagesHub ?? ""}`}>
                {showSection && !collapsed && (
                  <span className="sidebar__section-label">{item.section}</span>
                )}
                <NavLink
                  to={toPath}
                  className={({ isPending, isTransitioning }) =>
                    [
                      "sidebar__nav-link",
                      isActive ? "active" : "",
                      isPending ? "pending" : "",
                      isTransitioning ? "transitioning" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                  end={item.path === "/app"}
                  aria-current={isActive ? "page" : undefined}
                >
                  {item.iconSrc ? (
                    <div
                      className={`sidebar__nav-icon-wrap${
                        (item.path === "/app/messages" && item.messagesHub == null) ||
                        item.path === "/app/notifications"
                          ? " sidebar__nav-icon-wrap--badges"
                          : ""
                      }`}
                    >
                      <img
                        src={item.iconSrc}
                        alt=""
                        className="sidebar__nav-icon sidebar__nav-icon--img"
                        aria-hidden
                      />
                      {item.path === "/app/messages" &&
                      item.messagesHub == null &&
                      unreadChatThreads > 0 ? (
                        <span
                          className="sidebar__nav-ping"
                          aria-label={`${unreadChatThreads} conversation${unreadChatThreads === 1 ? "" : "s"} with new messages`}
                        />
                      ) : null}
                      {item.path === "/app/messages" &&
                      item.messagesHub == null &&
                      isParentLike &&
                      unreadNotifications > 0 ? (
                        <span
                          className="sidebar__nav-mail-hint"
                          title="Unread announcements (may include email)"
                          aria-label="Unread announcements"
                        >
                          <Mail size={11} strokeWidth={2.5} aria-hidden />
                        </span>
                      ) : null}
                      {item.path === "/app/notifications" && unreadNotifications > 0 ? (
                        <span className="sidebar__nav-count" aria-hidden>
                          {unreadNotifications > 99 ? "99+" : unreadNotifications}
                        </span>
                      ) : null}
                    </div>
                  ) : item.icon ? (
                    <item.icon className="sidebar__nav-icon" aria-hidden />
                  ) : null}
                  {item.path === "/app/member-billing/pay" ? (
                    <span className="sidebar__nav-link-label-wrap">
                      <span>{item.label}</span>
                      {membershipNavPill(item.path, guardianMemberBilling)}
                    </span>
                  ) : (
                    <span>{item.label}</span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__user">
          <div className="sidebar__avatar">
            {user ? getInitials(user.firstName, user.lastName, user.email) : "?"}
          </div>
          <div className="sidebar__user-info">
            <span className="sidebar__user-name">
              {user ? getDisplayName(user.firstName, user.lastName, user.email) : "User"}
            </span>
          </div>
        </div>
      </div>

      <div className="sidebar__toggle-group">
        <button
          type="button"
          className="sidebar__toggle sidebar__toggle--close"
          onClick={() => setClosed(true)}
          aria-label="Close sidebar"
        >
          <PanelLeftClose size={14} aria-hidden />
        </button>
      </div>
      </aside>
    </>
  );
}
