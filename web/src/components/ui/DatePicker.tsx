import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { CalendarDays, X } from "lucide-react";
import "react-day-picker/src/style.css";
import "./date-picker.css";

export interface DatePickerProps {
  value: string; // YYYY-MM-DD or ""
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  min?: string; // YYYY-MM-DD — earliest selectable date
  max?: string; // YYYY-MM-DD — latest selectable date
  error?: string | null;
}

interface PopoverPos {
  top: number;
  left: number;
  openUp: boolean;
}

const POPOVER_HEIGHT = 320; // estimated calendar height

function parseLocalDate(str: string): Date | undefined {
  if (!str) return undefined;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplay(date: Date): string {
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  id,
  disabled = false,
  min,
  max,
  error,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos>({ top: 0, left: 0, openUp: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = parseLocalDate(value);

  // Compute fixed-position coordinates from the trigger button
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > POPOVER_HEIGHT;
    setPos({
      top: openUp ? rect.top - 8 : rect.bottom + 6,
      left: rect.left,
      openUp,
    });
  }, [open]);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > POPOVER_HEIGHT;
      setPos({ top: openUp ? rect.top - 8 : rect.bottom + 6, left: rect.left, openUp });
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        wrapRef.current &&
        !wrapRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const popover = open
    ? createPortal(
        <div
          ref={wrapRef}
          className={`dp-popover${pos.openUp ? " dp-popover--up" : ""}`}
          style={{
            position: "fixed",
            top: pos.openUp ? undefined : pos.top,
            bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
            left: pos.left,
          }}
          role="dialog"
          aria-label="Date picker calendar"
        >
          <DayPicker
            mode="single"
            selected={selected}
            defaultMonth={selected}
            disabled={[
              ...(min ? [{ before: parseLocalDate(min)! }] : []),
              ...(max ? [{ after: parseLocalDate(max)! }] : []),
            ]}
            onSelect={(date) => {
              onChange(date ? toYMD(date) : "");
              setOpen(false);
            }}
          />
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="dp-wrap" id={id}>
      <button
        ref={triggerRef}
        type="button"
        className={`dp-trigger ${open ? "dp-trigger--open" : ""}${error ? " dp-trigger--error" : ""}`}
        onClick={() => !disabled && setOpen((p) => !p)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays size={15} className="dp-trigger__icon" aria-hidden />
        <span className={`dp-trigger__text ${!selected ? "dp-trigger__text--placeholder" : ""}`}>
          {selected ? formatDisplay(selected) : placeholder}
        </span>
        {selected && (
          <button
            type="button"
            className="dp-clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            aria-label="Clear date"
          >
            <X size={12} aria-hidden />
          </button>
        )}
      </button>
      {error && <span className="dp-error" role="alert">{error}</span>}

      {popover}
    </div>
  );
}
