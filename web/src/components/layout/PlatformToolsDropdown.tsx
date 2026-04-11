import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { AppTooltip } from "../../components/ui";
import "./platform-tools-dropdown.css";

const PLATFORM_TOOLS: {
  path: string;
  label: string;
  iconSrc: string;
  permission: string;
}[] = [
  {
    path: "/app",
    label: "Platform Admin",
    iconSrc: "/assets/cartoon-icons/portal1.png",
    permission: "platform.analytics:view",
  },
  {
    path: "/app/platform/dashboard",
    label: "Analytics",
    iconSrc: "/assets/cartoon-icons/Trail.png",
    permission: "platform.analytics:view",
  },
  {
    path: "/app/platform/roles",
    label: "Role Manager",
    iconSrc: "/assets/cartoon-icons/Players.png",
    permission: "platform.users:view",
  },
  {
    path: "/app/platform/tasks",
    label: "Admin Tasks",
    iconSrc: "/assets/cartoon-icons/portal1.png",
    permission: "platform.tasks:view",
  },
  {
    path: "/app/platform/health",
    label: "Health Check",
    iconSrc: "/assets/cartoon-icons/Heart.png",
    permission: "platform.health:view",
  },
  {
    path: "/app/platform/jobs",
    label: "Job Worker",
    iconSrc: "/assets/cartoon-icons/gear.png",
    permission: "platform.jobs:view",
  },
  {
    path: "/app/platform/entities",
    label: "Entity Browser",
    iconSrc: "/assets/cartoon-icons/Chest.png",
    permission: "platform.entities:view",
  },
  {
    path: "/app/platform/member-billing-fees",
    label: "Member billing fees",
    iconSrc: "/assets/cartoon-icons/coin.png",
    permission: "platform.entities:view",
  },
  {
    path: "/app/platform/growth",
    label: "Growth Ops",
    iconSrc: "/assets/cartoon-icons/Trail.png",
    permission: "platform.growth:view",
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

  if ((!isSuperAdmin && tools.length === 0) || !isPlatformView) return null;

  return (
    <div className="platform-tools-dropdown">
      <AppTooltip
        title="Platform Tools"
        description="Access platform admin shortcuts."
        placement="bottom"
        disabled={open}
      >
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
            <img src="/assets/cartoon-icons/portal1.png" alt="" />
          </div>
        </button>
      </AppTooltip>

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
                  <img src={item.iconSrc} className="platform-tools-dropdown__icon" alt="" aria-hidden />
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
