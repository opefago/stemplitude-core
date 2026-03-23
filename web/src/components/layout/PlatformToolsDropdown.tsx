import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Shield,
  LayoutDashboard,
  Users,
  Terminal,
  HeartPulse,
  Cog,
  Database,
  Handshake,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import "./platform-tools-dropdown.css";

const PLATFORM_TOOLS: {
  path: string;
  label: string;
  icon: typeof Terminal;
  permission: string;
}[] = [
  {
    path: "/app",
    label: "Platform Admin",
    icon: Shield,
    permission: "platform.analytics:view",
  },
  {
    path: "/app/platform/dashboard",
    label: "Analytics",
    icon: LayoutDashboard,
    permission: "platform.analytics:view",
  },
  {
    path: "/app/platform/roles",
    label: "Role Manager",
    icon: Users,
    permission: "platform.users:view",
  },
  {
    path: "/app/platform/tasks",
    label: "Admin Tasks",
    icon: Terminal,
    permission: "platform.tasks:view",
  },
  {
    path: "/app/platform/health",
    label: "Health Check",
    icon: HeartPulse,
    permission: "platform.health:view",
  },
  {
    path: "/app/platform/jobs",
    label: "Job Worker",
    icon: Cog,
    permission: "platform.jobs:view",
  },
  {
    path: "/app/platform/entities",
    label: "Entity Browser",
    icon: Database,
    permission: "platform.entities:view",
  },
  {
    path: "/app/platform/growth",
    label: "Growth Ops",
    icon: Handshake,
    permission: "platform.analytics:view",
  },
];

export function PlatformToolsDropdown() {
  const { isSuperAdmin, hasGlobalPermission } = useAuth();
  const { isPlatformView } = useWorkspace();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPosition({
      top: rect.bottom + 8,
      left: rect.left,
    });
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      )
        return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const tools = PLATFORM_TOOLS.filter(
    (t) => isSuperAdmin || hasGlobalPermission(t.permission),
  );

  if (!isSuperAdmin || !isPlatformView) return null;

  return (
    <div className="platform-tools-dropdown">
      <button
        ref={triggerRef}
        type="button"
        className="platform-tools-dropdown__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Platform tools"
      >
        <div className="platform-tools-dropdown__shield" aria-hidden>
          <Shield size={20} />
        </div>
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="platform-tools-dropdown__menu"
            role="menu"
            aria-label="Platform tools"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
            }}
          >
            <div className="platform-tools-dropdown__group-label">
              Platform Tools
            </div>
            {tools.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  type="button"
                  role="menuitem"
                  className="platform-tools-dropdown__item"
                  onClick={() => {
                    setOpen(false);
                    navigate(item.path);
                  }}
                >
                  <Icon
                    size={16}
                    className="platform-tools-dropdown__icon"
                    aria-hidden
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
