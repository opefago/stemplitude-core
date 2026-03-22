/**
 * DateTimePicker
 *
 * A combined date + time picker that stores its value as "YYYY-MM-DDTHH:MM"
 * or "" when empty.  Renders two adjacent custom pickers (DatePicker +
 * TimePicker) and exposes cross-field validation via min/max props.
 */
import { CalendarDays, Clock } from "lucide-react";
import { DatePicker } from "./DatePicker";
import { TimePicker } from "./TimePicker";
import "./date-time-picker.css";

export interface DateTimePickerProps {
  /** ISO-like string "YYYY-MM-DDTHH:MM" or "" */
  value: string;
  onChange: (value: string) => void;
  datePlaceholder?: string;
  timePlaceholder?: string;
  id?: string;
  disabled?: boolean;
  /** Earliest allowed datetime "YYYY-MM-DDTHH:MM" */
  min?: string;
  /** Latest allowed datetime "YYYY-MM-DDTHH:MM" */
  max?: string;
  /** Explicit external error (overrides internal validation message) */
  error?: string | null;
  minuteStep?: number;
  label?: string;
}

function splitDateTime(v: string): { date: string; time: string } {
  if (!v) return { date: "", time: "" };
  const idx = v.indexOf("T");
  if (idx < 0) return { date: v, time: "" };
  return { date: v.slice(0, idx), time: v.slice(idx + 1, idx + 6) };
}

function combineDateTime(date: string, time: string): string {
  if (!date && !time) return "";
  return `${date || ""}T${time || "00:00"}`;
}

/** Compare two "HH:MM" strings. Returns negative / 0 / positive. */
function cmpTime(a: string, b: string): number {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return ah * 60 + am - (bh * 60 + bm);
}

/** Compare two "YYYY-MM-DD" strings. */
function cmpDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compare two "YYYY-MM-DDTHH:MM" strings. */
function cmpDatetime(a: string, b: string): number {
  const { date: ad, time: at } = splitDateTime(a);
  const { date: bd, time: bt } = splitDateTime(b);
  const d = cmpDate(ad, bd);
  if (d !== 0) return d;
  return cmpTime(at || "00:00", bt || "00:00");
}

export function DateTimePicker({
  value,
  onChange,
  datePlaceholder = "Pick a date",
  timePlaceholder = "Pick a time",
  id,
  disabled = false,
  min,
  max,
  error,
  minuteStep = 5,
  label,
}: DateTimePickerProps) {
  const { date, time } = splitDateTime(value);
  const { date: minDate, time: minTime } = splitDateTime(min ?? "");
  const { date: maxDate, time: maxTime } = splitDateTime(max ?? "");

  const handleDateChange = (d: string) => onChange(combineDateTime(d, time));
  const handleTimeChange = (t: string) => onChange(combineDateTime(date, t));

  // Determine whether the current value violates min/max
  let internalError: string | null = null;
  if (!error && value) {
    if (min && cmpDatetime(value, min) < 0) {
      internalError = `Must be on or after ${formatDateTimeDisplay(min)}`;
    } else if (max && cmpDatetime(value, max) > 0) {
      internalError = `Must be on or before ${formatDateTimeDisplay(max)}`;
    }
  }

  const displayError = error ?? internalError;

  // Compute effective min/max for each sub-picker based on current selections
  const timeMin = date && minDate && cmpDate(date, minDate) === 0 ? minTime : undefined;
  const timeMax = date && maxDate && cmpDate(date, maxDate) === 0 ? maxTime : undefined;

  return (
    <div className="dtp-wrap" id={id}>
      {label && <span className="dtp-label">{label}</span>}
      <div className="dtp-fields">
        <div className="dtp-field">
          <CalendarDays size={13} className="dtp-field__icon" aria-hidden />
          <DatePicker
            value={date}
            onChange={handleDateChange}
            placeholder={datePlaceholder}
            disabled={disabled}
            min={minDate || undefined}
            max={maxDate || undefined}
          />
        </div>
        <div className="dtp-sep" aria-hidden>at</div>
        <div className="dtp-field">
          <Clock size={13} className="dtp-field__icon" aria-hidden />
          <TimePicker
            value={time}
            onChange={handleTimeChange}
            placeholder={timePlaceholder}
            disabled={disabled}
            minuteStep={minuteStep}
            min={timeMin}
            max={timeMax}
          />
        </div>
      </div>
      {displayError && (
        <span className="dtp-error" role="alert">{displayError}</span>
      )}
    </div>
  );
}

function formatDateTimeDisplay(dt: string): string {
  const { date, time } = splitDateTime(dt);
  if (!date) return dt;
  const d = new Date(`${date}T${time || "00:00"}`);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Re-export helpers so consumers can build range-validation messages easily
export { cmpDatetime, cmpDate, cmpTime, splitDateTime };
