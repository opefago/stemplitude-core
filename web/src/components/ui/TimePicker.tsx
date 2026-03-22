import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";
import "./time-picker.css";

const ITEM_H = 44; // px per drum item
const VISIBLE = 5; // visible items in drum
const DRUM_H = ITEM_H * VISIBLE; // 220px
const PADDING = ITEM_H * Math.floor(VISIBLE / 2); // 88px — centers first/last item

export interface TimePickerProps {
  value: string; // "HH:MM" (24h) or ""
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  minuteStep?: number; // default 5
  min?: string; // "HH:MM" — earliest allowed time
  max?: string; // "HH:MM" — latest allowed time
  error?: string | null;
}

function makeHours() {
  return Array.from({ length: 24 }, (_, i) => i);
}

function makeMinutes(step: number) {
  const arr: number[] = [];
  for (let m = 0; m < 60; m += step) arr.push(m);
  return arr;
}

function parseTime(s: string): { h: number; m: number } | null {
  if (!s) return null;
  const [hh, mm] = s.split(":");
  const h = Number(hh);
  const m = Number(mm);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h: Math.min(23, Math.max(0, h)), m: Math.min(59, Math.max(0, m)) };
}

function formatValue(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDisplay(h: number, m: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// ── Drum Column ──────────────────────────────────────────────────────────────

interface DrumProps {
  items: number[];
  selected: number;
  label: (v: number) => string;
  onChange: (v: number) => void;
  ariaLabel: string;
}

function Drum({ items, selected, label, onChange, ariaLabel }: DrumProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Scroll to item (instant = no animation, smooth = animation)
  const scrollToItem = (idx: number, smooth = false) => {
    if (!listRef.current) return;
    isSyncingRef.current = true;
    listRef.current.scrollTo({
      top: idx * ITEM_H,
      behavior: smooth ? "smooth" : "instant",
    });
    setTimeout(() => {
      isSyncingRef.current = false;
    }, smooth ? 300 : 0);
  };

  // Jump to selected on open / external change
  useLayoutEffect(() => {
    const idx = items.indexOf(selected);
    if (idx < 0 || isSyncingRef.current) return;
    scrollToItem(idx, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const handleScroll = () => {
    if (isSyncingRef.current) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!listRef.current) return;
      const raw = listRef.current.scrollTop;
      const idx = Math.min(Math.max(Math.round(raw / ITEM_H), 0), items.length - 1);
      // Snap
      scrollToItem(idx, true);
      onChange(items[idx]);
    }, 80);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const idx = items.indexOf(selected);
    if (e.key === "ArrowDown" && idx < items.length - 1) {
      e.preventDefault();
      onChange(items[idx + 1]);
      scrollToItem(idx + 1, true);
    } else if (e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      onChange(items[idx - 1]);
      scrollToItem(idx - 1, true);
    }
  };

  return (
    <div className="tp-drum-wrap" role="group" aria-label={ariaLabel}>
      {/* Selection band — sits behind the list */}
      <div className="tp-drum-band" />
      {/* Top / bottom fade */}
      <div className="tp-drum-fade tp-drum-fade--top" />
      <div className="tp-drum-fade tp-drum-fade--bottom" />
      {/* Scrollable list */}
      <div
        ref={listRef}
        className="tp-drum"
        role="listbox"
        aria-label={ariaLabel}
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        style={{ paddingTop: PADDING, paddingBottom: PADDING }}
      >
        {items.map((v) => (
          <div
            key={v}
            role="option"
            aria-selected={v === selected}
            className={`tp-drum-item${v === selected ? " tp-drum-item--sel" : ""}`}
            onClick={() => {
              const idx = items.indexOf(v);
              onChange(v);
              scrollToItem(idx, true);
            }}
          >
            {label(v)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main TimePicker ──────────────────────────────────────────────────────────

interface PopoverPos {
  top?: number;
  bottom?: number;
  left: number;
}

const POPOVER_H = 340;

export function TimePicker({
  value,
  onChange,
  placeholder = "Pick a time",
  id,
  disabled = false,
  minuteStep = 5,
  error,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos>({ left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const parsed = parseTime(value);
  const hours = makeHours();
  const minutes = makeMinutes(minuteStep);

  // Snap minutes value to nearest step
  const snapMinute = (m: number) => {
    const snapped = Math.round(m / minuteStep) * minuteStep;
    return minutes.includes(snapped) ? snapped : (minutes[0] ?? 0);
  };

  const selectedH = parsed?.h ?? 12;
  const selectedM = snapMinute(parsed?.m ?? 0);

  const computePos = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < POPOVER_H + 8 && r.top > POPOVER_H;
    setPos({
      top: openUp ? undefined : r.bottom + 6,
      bottom: openUp ? window.innerHeight - r.top + 6 : undefined,
      left: r.left,
    });
  };

  useLayoutEffect(() => {
    if (open) computePos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const update = () => computePos();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const setHour = (h: number) => onChange(formatValue(h, selectedM));
  const setMinute = (m: number) => onChange(formatValue(selectedH, m));

  const popover = open
    ? createPortal(
        <div
          ref={popoverRef}
          className="tp-popover"
          style={{
            position: "fixed",
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
          }}
          role="dialog"
          aria-label="Time picker"
        >
          <div className="tp-drums">
            <Drum
              items={hours}
              selected={selectedH}
              label={(v) => String(v).padStart(2, "0")}
              onChange={setHour}
              ariaLabel="Hour"
            />
            <div className="tp-colon" aria-hidden>:</div>
            <Drum
              items={minutes}
              selected={selectedM}
              label={(v) => String(v).padStart(2, "0")}
              onChange={setMinute}
              ariaLabel="Minute"
            />
          </div>
          <div className="tp-meridiem">
            <span className={`tp-meridiem-chip${selectedH < 12 ? " tp-meridiem-chip--active" : ""}`}
              onClick={() => { if (selectedH >= 12) onChange(formatValue(selectedH - 12, selectedM)); }}
              role="button" tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && selectedH >= 12 && onChange(formatValue(selectedH - 12, selectedM))}
            >
              AM
            </span>
            <span className={`tp-meridiem-chip${selectedH >= 12 ? " tp-meridiem-chip--active" : ""}`}
              onClick={() => { if (selectedH < 12) onChange(formatValue(selectedH + 12, selectedM)); }}
              role="button" tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && selectedH < 12 && onChange(formatValue(selectedH + 12, selectedM))}
            >
              PM
            </span>
          </div>
          <button
            type="button"
            className="tp-done"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="tp-wrap" id={id}>
      <button
        ref={triggerRef}
        type="button"
        className={`tp-trigger${open ? " tp-trigger--open" : ""}${error ? " tp-trigger--error" : ""}`}
        onClick={() => !disabled && setOpen((p) => !p)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Clock size={15} className="tp-trigger__icon" aria-hidden />
        <span className={`tp-trigger__text${!parsed ? " tp-trigger__text--placeholder" : ""}`}>
          {parsed ? formatDisplay(selectedH, selectedM) : placeholder}
        </span>
      </button>
      {error && <span className="tp-error" role="alert">{error}</span>}
      {popover}
    </div>
  );
}
