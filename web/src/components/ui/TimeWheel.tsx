import { useLayoutEffect, useRef } from "react";
import "./time-picker.css";

const ITEM_H = 44;
const VISIBLE = 5;
const PADDING = ITEM_H * Math.floor(VISIBLE / 2);

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const scrollToItem = (idx: number, smooth = false) => {
    if (!listRef.current) return;
    isSyncingRef.current = true;
    listRef.current.scrollTo({
      top: idx * ITEM_H,
      behavior: smooth ? "smooth" : "instant",
    });
    setTimeout(
      () => {
        isSyncingRef.current = false;
      },
      smooth ? 300 : 0,
    );
  };

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
      const idx = Math.min(
        Math.max(Math.round(raw / ITEM_H), 0),
        items.length - 1,
      );
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
      <div className="tp-drum-band" />
      <div className="tp-drum-fade tp-drum-fade--top" />
      <div className="tp-drum-fade tp-drum-fade--bottom" />
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

export interface TimeWheelProps {
  hours: number[];
  minutes: number[];
  selectedH: number;
  selectedM: number;
  onHourChange: (hour: number) => void;
  onMinuteChange: (minute: number) => void;
  onSetMeridiem: (period: "AM" | "PM") => void;
  onDone: () => void;
}

export function TimeWheel({
  hours,
  minutes,
  selectedH,
  selectedM,
  onHourChange,
  onMinuteChange,
  onSetMeridiem,
  onDone,
}: TimeWheelProps) {
  return (
    <>
      <div className="tp-drums">
        <Drum
          items={hours}
          selected={selectedH}
          label={(v) => String(v).padStart(2, "0")}
          onChange={onHourChange}
          ariaLabel="Hour"
        />
        <div className="tp-colon" aria-hidden>
          :
        </div>
        <Drum
          items={minutes}
          selected={selectedM}
          label={(v) => String(v).padStart(2, "0")}
          onChange={onMinuteChange}
          ariaLabel="Minute"
        />
      </div>
      <div className="tp-meridiem">
        <span
          className={`tp-meridiem-chip${selectedH < 12 ? " tp-meridiem-chip--active" : ""}`}
          onClick={() => onSetMeridiem("AM")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onSetMeridiem("AM")}
        >
          AM
        </span>
        <span
          className={`tp-meridiem-chip${selectedH >= 12 ? " tp-meridiem-chip--active" : ""}`}
          onClick={() => onSetMeridiem("PM")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onSetMeridiem("PM")}
        >
          PM
        </span>
      </div>
      <button type="button" className="tp-done" onClick={onDone}>
        Done
      </button>
    </>
  );
}
