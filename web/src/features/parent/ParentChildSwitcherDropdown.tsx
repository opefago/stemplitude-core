import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Check, ChevronDown, LogIn, Settings, UserPlus } from "lucide-react";
import type { StudentProfile } from "../../lib/api/students";
import "./parent-child-switcher.css";

function labelFor(s: StudentProfile): string {
  const dn = (s.display_name ?? "").trim();
  if (dn) return dn;
  return [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || "Student";
}

type ParentChildSwitcherDropdownProps = {
  childrenList: StudentProfile[];
  activeChildId: string | null;
  onSelectChild: (id: string) => void;
  loading?: boolean;
  errorText?: string | null;
};

export function ParentChildSwitcherDropdown({
  childrenList,
  activeChildId,
  onSelectChild,
  loading,
  errorText,
}: ParentChildSwitcherDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const active =
    childrenList.find((c) => c.id === activeChildId) ?? childrenList[0] ?? null;
  const triggerLabel = loading
    ? "Loading learners…"
    : errorText
      ? "Could not load"
      : active
        ? labelFor(active)
        : "No learners yet";

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setMenuPos({
      top: r.bottom + 8,
      left: r.left,
      width: Math.max(r.width, 260),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
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

  const learnerHref =
    activeChildId != null
      ? `/app/child?studentId=${encodeURIComponent(activeChildId)}`
      : "/app/child";

  const settingsHref =
    activeChildId != null
      ? `/app/children/settings?student=${encodeURIComponent(activeChildId)}`
      : "/app/children/settings";

  return (
    <div className="parent-child-switcher" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="parent-child-switcher__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="parent-child-switcher__trigger-label">{triggerLabel}</span>
        <ChevronDown
          size={18}
          strokeWidth={2.5}
          className={`parent-child-switcher__chevron ${open ? "parent-child-switcher__chevron--open" : ""}`}
          aria-hidden
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="parent-child-switcher__menu"
            role="menu"
            aria-label="Learner menu"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              minWidth: menuPos.width,
            }}
          >
            <div className="parent-child-switcher__menu-kicker">Your learners</div>
            {errorText ? (
              <p className="parent-child-switcher__menu-error" role="alert">
                {errorText}
              </p>
            ) : null}
            {!loading &&
              childrenList.map((c) => {
                const sel = c.id === activeChildId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="menuitem"
                    className={`parent-child-switcher__row ${sel ? "parent-child-switcher__row--active" : ""}`}
                    onClick={() => {
                      onSelectChild(c.id);
                      setOpen(false);
                    }}
                  >
                    <span className="parent-child-switcher__row-name">{labelFor(c)}</span>
                    {sel ? (
                      <Check size={16} className="parent-child-switcher__check" aria-hidden />
                    ) : null}
                  </button>
                );
              })}

            <div className="parent-child-switcher__divider" />

            <Link
              to={settingsHref}
              className="parent-child-switcher__action"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <Settings size={16} strokeWidth={2.25} aria-hidden />
              Parent &amp; learner settings
            </Link>

            <Link
              to="/app/children"
              className="parent-child-switcher__action"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <UserPlus size={16} strokeWidth={2.25} aria-hidden />
              Add a learner
            </Link>

            <Link
              to={learnerHref}
              className="parent-child-switcher__action parent-child-switcher__action--primary"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <LogIn size={16} strokeWidth={2.25} aria-hidden />
              Enter learner view
            </Link>
          </div>,
          document.body,
        )}
    </div>
  );
}
