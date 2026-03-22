import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  PanelLeftClose,
  Home,
  FlaskConical,
  GraduationCap,
  Trophy,
  MessageSquare,
  Users,
  Bell,
  BookOpen,
  CreditCard,
  FileText,
  Shield,
  Plug,
  FolderOpen,
  LayoutDashboard,
  Layers,
  Mail,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { useSidebar } from "../../contexts/SidebarContext";
import { TenantSwitcher } from "./TenantSwitcher";
import "./sidebar.css";

type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  section?: string;
};

const STUDENT_NAV: NavItem[] = [
  { path: "/app", label: "Home", icon: Home },
  { path: "/app/assignments", label: "Assignments", icon: FileText },
  { path: "/app/labs", label: "Labs", icon: FlaskConical },
  { path: "/app/achievements", label: "Achievements", icon: Trophy },
  { path: "/app/messages", label: "Messages", icon: MessageSquare },
];

const PARENT_NAV: NavItem[] = [
  { path: "/app", label: "Home", icon: Home },
  { path: "/app/children", label: "Children", icon: Users },
  { path: "/app/messages", label: "Messages", icon: MessageSquare },
  { path: "/app/notifications", label: "Notifications", icon: Bell },
];

const INSTRUCTOR_NAV: NavItem[] = [
  { path: "/app", label: "Home", icon: Home },
  { path: "/app/classrooms", label: "Classrooms", icon: GraduationCap },
  { path: "/app/students", label: "Students", icon: Users },
  { path: "/app/curriculum", label: "Curriculum", icon: BookOpen },
  { path: "/app/messages", label: "Messages", icon: MessageSquare },
];

const ADMIN_NAV: NavItem[] = [
  { path: "/app", label: "Dashboard", icon: LayoutDashboard },
  { path: "/app/labs", label: "Labs", icon: FlaskConical, section: "Learning" },
  { path: "/app/members", label: "Users", icon: Users, section: "People" },
  { path: "/app/invitations", label: "Invitations", icon: Mail },
  { path: "/app/roles", label: "Roles", icon: Shield },
  { path: "/app/classrooms", label: "Classrooms", icon: GraduationCap },
  { path: "/app/curriculum", label: "Curriculum", icon: BookOpen, section: "Content" },
  { path: "/app/programs", label: "Programs", icon: Layers },
  { path: "/app/assets", label: "Assets", icon: FolderOpen },
  { path: "/app/integrations", label: "Integrations", icon: Plug, section: "Organization" },
  { path: "/app/billing", label: "Billing", icon: CreditCard },
];

/** Platform Administration nav - super admin in platform view.
    Admin Tasks, Health Check, Job Worker, Entity Browser are in TenantSwitcher dropdown only. */
const PLATFORM_NAV: NavItem[] = [
  { path: "/app", label: "Platform Admin", icon: Shield },
  { path: "/app/platform/dashboard", label: "Analytics", icon: LayoutDashboard },
  { path: "/app/platform/users", label: "Users", icon: Users },
  { path: "/app/platform/roles", label: "Roles", icon: Shield },
];

function getNavItems(
  role: string | null,
  isPlatformView: boolean,
  isSuperAdmin: boolean,
  pathname: string,
): NavItem[] {
  const isOnPlatformPage =
    pathname.startsWith("/app/platform/dashboard") ||
    pathname.startsWith("/app/platform/users") ||
    pathname.startsWith("/app/platform/roles");
  if (isSuperAdmin && (isPlatformView || isOnPlatformPage)) return PLATFORM_NAV;
  switch (role ?? "") {
    case "parent":
      return PARENT_NAV;
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

export function Sidebar() {
  const { collapsed, setCollapsed, closed, setClosed } = useSidebar();
  const { user, role, isSuperAdmin } = useAuth();
  const { tenant } = useTenant();
  const { isPlatformView } = useWorkspace();
  const location = useLocation();
  const navItems = getNavItems(role, isPlatformView, isSuperAdmin, location.pathname);
  const isAdmin = isSuperAdmin || role === "admin" || role === "owner";

  useEffect(() => {
    document.documentElement.dataset.sidebarCollapsed = collapsed ? "true" : "";
    document.documentElement.dataset.sidebarClosed = closed ? "true" : "";
    return () => {
      delete document.documentElement.dataset.sidebarCollapsed;
      delete document.documentElement.dataset.sidebarClosed;
    };
  }, [collapsed, closed]);

  const isOnPlatformPage =
    location.pathname.startsWith("/app/platform/dashboard") ||
    location.pathname.startsWith("/app/platform/users") ||
    location.pathname.startsWith("/app/platform/roles");
  const displayName = (isPlatformView || isOnPlatformPage) ? "Platform Admin" : (tenant?.name ?? "Organization");

  if (closed) {
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


  return (
    <aside
      className={`sidebar ${collapsed ? "collapsed" : ""}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="sidebar__header">
        <div className="sidebar__header-row">
          {isAdmin ? (
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

      <nav className="sidebar__nav">
        <ul className="sidebar__nav-list">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const isActive =
              item.path === "/app"
                ? location.pathname === "/app"
                : location.pathname.startsWith(item.path);
            const showSection = item.section && (idx === 0 || navItems[idx - 1]?.section !== item.section);
            return (
              <li key={item.path}>
                {showSection && !collapsed && (
                  <span className="sidebar__section-label">{item.section}</span>
                )}
                <NavLink
                  to={item.path}
                  className={({ isActive: linkActive }) =>
                    `sidebar__nav-link ${linkActive ? "active" : ""}`
                  }
                  end={item.path === "/app"}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="sidebar__nav-icon" aria-hidden />
                  <span>{item.label}</span>
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
  );
}
