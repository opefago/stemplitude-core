import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export interface KidDropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface KidDropdownProps {
  value: string;
  options: KidDropdownOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  minWidth?: number;
  subtle?: boolean;
}

export function KidDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "Select...",
  disabled = false,
  fullWidth = false,
  minWidth,
  subtle = true,
}: KidDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | undefined>(undefined);

  const selected = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function updateMenuPosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPad = 8;
      const desiredWidth = Math.max(rect.width, minWidth ?? 0);

      let left = rect.left;
      if (left + desiredWidth > window.innerWidth - viewportPad) {
        left = window.innerWidth - desiredWidth - viewportPad;
      }
      left = Math.max(viewportPad, left);

      const gap = 6;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPad;
      const spaceAbove = rect.top - viewportPad;
      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;

      // Down: anchor top edge just below trigger. Up: anchor bottom edge just above trigger
      // (do not use top = rect.top - maxHeight when opening up — that assumes full maxHeight
      // and pushes short menus hundreds of px away from the trigger).
      if (openUp) {
        const spaceForMenu = Math.max(0, rect.top - viewportPad - gap);
        const maxHeight = Math.max(80, Math.min(300, spaceForMenu));
        setMenuStyle({
          position: "fixed",
          left,
          width: desiredWidth,
          maxHeight,
          bottom: window.innerHeight - rect.top + gap,
          top: "auto",
        });
      } else {
        const maxHeight = Math.max(80, Math.min(300, spaceBelow - gap));
        setMenuStyle({
          position: "fixed",
          left,
          width: desiredWidth,
          maxHeight,
          top: rect.bottom + gap,
          bottom: "auto",
        });
      }
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, minWidth]);

  return (
    <div
      ref={wrapRef}
      className={`kid-dropdown ${fullWidth ? "kid-dropdown--full" : ""} ${subtle ? "kid-dropdown--subtle" : ""}`.trim()}
      style={minWidth ? { minWidth } : undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        className="kid-dropdown__trigger"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="kid-dropdown__value">{selected?.label ?? placeholder}</span>
        <ChevronDown
          size={16}
          className={`kid-dropdown__chevron ${open ? "kid-dropdown__chevron--open" : ""}`}
          aria-hidden
        />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="kid-dropdown__menu"
          role="listbox"
          aria-label={ariaLabel}
          style={menuStyle}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`kid-dropdown__option ${isSelected ? "kid-dropdown__option--selected" : ""}`}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
