import { useCallback, useEffect, useMemo, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import {
  createParentExcusalRequest,
  getParentChildrenSessions,
  type SessionResponse,
} from "../../lib/api/students";
import { ApiHttpError } from "../../lib/api/client";
import { ModalDialog } from "../../components/ui";
import "react-day-picker/src/style.css";
import "../../components/ui/ui.css";
import "./guardian-excusal-modal.css";

const KID_CALENDAR_ICON = "/assets/cartoon-icons/Callendar.png";

export type GuardianExcusalPreset = {
  sessionId: string;
  classroomId: string;
  summaryLabel?: string;
};

export type GuardianExcusalSessionChoice = {
  sessionId: string;
  classroomId: string;
  label: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  studentId: string;
  preset: GuardianExcusalPreset | null;
  sessionChoices?: GuardianExcusalSessionChoice[] | null;
  onSuccess?: () => void | Promise<void>;
  /** Opens directly on date-range flow; hides the one-session tab. */
  rangeOnly?: boolean;
};

type Mode = "session" | "range";

const MAX_RANGE_SPAN_DAYS = 90;

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDateInput(ymd: string): Date | null {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function sessionEligibleForExcusal(s: SessionResponse, now: Date): boolean {
  if ((s.status ?? "").toLowerCase() === "canceled") return false;
  const start = new Date(s.session_start).getTime();
  const end = new Date(s.session_end).getTime();
  const nowMs = now.getTime();
  if (end < nowMs - 14 * 24 * 60 * 60 * 1000) return false;
  if (start > nowMs + 180 * 24 * 60 * 60 * 1000) return false;
  return true;
}

function formatSessionLine(s: SessionResponse): string {
  try {
    const a = new Date(s.session_start);
    const dayPart = a.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const t1 = a.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
    const cls = (s.classroom_name ?? "").trim();
    return cls ? `${cls} · ${dayPart} · ${t1}` : `${dayPart} · ${t1}`;
  } catch {
    return "Session";
  }
}

function formatRangeSummary(calRange: DateRange | undefined): string {
  if (!calRange?.from) {
    return "Tap your first day away, then the last day — days in between light up!";
  }
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  const startLabel = calRange.from.toLocaleDateString(undefined, opts);
  if (calRange.to == null) {
    return `${startLabel} — tap the last day you need excused (tap this same day again for just one day).`;
  }
  if (calRange.from.getTime() === calRange.to.getTime()) {
    return `${startLabel} · one day`;
  }
  return `${startLabel} through ${calRange.to.toLocaleDateString(undefined, opts)}`;
}

async function fetchSessionsInLocalDateRange(
  studentId: string,
  startYmd: string,
  endYmd: string,
): Promise<SessionResponse[]> {
  const startLocal = parseLocalDateInput(startYmd);
  const endLocal = parseLocalDateInput(endYmd);
  if (!startLocal || !endLocal || endLocal < startLocal) return [];

  const endExclusive = new Date(endLocal);
  endExclusive.setDate(endExclusive.getDate() + 1);
  endExclusive.setHours(0, 0, 0, 0);

  const [upcoming, past] = await Promise.all([
    getParentChildrenSessions(800, studentId, "upcoming", {
      sessionStartBefore: endExclusive.toISOString(),
      expandMonthSessions: true,
    }),
    getParentChildrenSessions(800, studentId, "past"),
  ]);

  const byId = new Map<string, SessionResponse>();
  for (const s of upcoming) {
    if (!byId.has(s.id)) byId.set(s.id, s);
  }
  for (const s of past) {
    if (!byId.has(s.id)) byId.set(s.id, s);
  }

  const startStr = localYmd(startLocal);
  const endStr = localYmd(endLocal);
  const now = new Date();

  return [...byId.values()]
    .filter((s) => {
      const dStr = localYmd(new Date(s.session_start));
      if (dStr < startStr || dStr > endStr) return false;
      return sessionEligibleForExcusal(s, now);
    })
    .sort(
      (a, b) =>
        new Date(a.session_start).getTime() - new Date(b.session_start).getTime(),
    );
}

export function GuardianExcusalRequestModal({
  open,
  onClose,
  studentId,
  preset,
  sessionChoices,
  onSuccess,
  rangeOnly = false,
}: Props) {
  const [mode, setMode] = useState<Mode>("session");
  const [sessionPick, setSessionPick] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [calRange, setCalRange] = useState<DateRange | undefined>(undefined);
  const [rangeCalendarKey, setRangeCalendarKey] = useState(0);
  const [calendarPickerOpen, setCalendarPickerOpen] = useState(false);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeSessions, setRangeSessions] = useState<SessionResponse[]>([]);
  const [rangeFetchError, setRangeFetchError] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(
    null,
  );

  useEffect(() => {
    if (!open) {
      setCalendarPickerOpen(false);
      return;
    }
    setReason("");
    setSubmitError(null);
    setBulkProgress(null);
    setRangeFetchError(null);
    setMode(rangeOnly ? "range" : "session");
    setRangeCalendarKey((k) => k + 1);
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 6);
    setCalRange({ from, to });
    setCalendarPickerOpen(rangeOnly);
    if (!preset && sessionChoices?.length) {
      const first = sessionChoices[0];
      setSessionPick(`${first.sessionId}|${first.classroomId}`);
    } else {
      setSessionPick("");
    }
  }, [open, preset, sessionChoices, rangeOnly]);

  useEffect(() => {
    if (mode !== "range") setCalendarPickerOpen(false);
  }, [mode]);

  const loadRangeSessions = useCallback(async () => {
    if (mode !== "range") return;
    const fromD = calRange?.from;
    const toD = calRange?.to ?? calRange?.from;
    if (!fromD || !toD || toD < fromD) {
      setRangeSessions([]);
      setRangeFetchError(null);
      return;
    }
    const spanDays =
      Math.ceil((toD.getTime() - fromD.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (spanDays > MAX_RANGE_SPAN_DAYS) {
      setRangeSessions([]);
      setRangeFetchError(null);
      return;
    }
    const rangeStart = localYmd(fromD);
    const rangeEnd = localYmd(toD);
    setRangeLoading(true);
    setRangeFetchError(null);
    try {
      const rows = await fetchSessionsInLocalDateRange(studentId, rangeStart, rangeEnd);
      setRangeSessions(rows);
    } catch (e) {
      setRangeSessions([]);
      setRangeFetchError(e instanceof Error ? e.message : "Could not load sessions");
    } finally {
      setRangeLoading(false);
    }
  }, [mode, calRange, studentId]);

  useEffect(() => {
    if (!open || mode !== "range") return;
    const t = window.setTimeout(() => {
      void loadRangeSessions();
    }, 280);
    return () => window.clearTimeout(t);
  }, [open, mode, calRange, studentId, loadRangeSessions]);

  const showSessionSelect = mode === "session" && !preset && Boolean(sessionChoices?.length);

  const dateInputBounds = useMemo(() => {
    const min = new Date();
    min.setDate(min.getDate() - 14);
    const max = new Date();
    max.setDate(max.getDate() + 180);
    return { min: localYmd(min), max: localYmd(max) };
  }, [open]);

  const boundsMinDate = useMemo(
    () => parseLocalDateInput(dateInputBounds.min)!,
    [dateInputBounds.min],
  );
  const boundsMaxDate = useMemo(
    () => parseLocalDateInput(dateInputBounds.max)!,
    [dateInputBounds.max],
  );

  const submitSession = async () => {
    let sessionId: string;
    let classroomId: string;
    if (preset) {
      sessionId = preset.sessionId;
      classroomId = preset.classroomId;
    } else {
      const parts = sessionPick.split("|");
      sessionId = parts[0] ?? "";
      classroomId = parts[1] ?? "";
    }
    if (!sessionId || !classroomId || !reason.trim()) {
      setSubmitError("Choose a session and describe the reason.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createParentExcusalRequest(studentId, {
        session_id: sessionId,
        classroom_id: classroomId,
        reason: reason.trim(),
      });
      onClose();
      await onSuccess?.();
    } catch (e) {
      if (e instanceof ApiHttpError) {
        setSubmitError(e.message || `Request failed (${e.status})`);
      } else {
        setSubmitError(e instanceof Error ? e.message : "Request failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitRange = async () => {
    if (!reason.trim()) {
      setSubmitError("Describe the reason for the absence.");
      return;
    }
    if (rangeSessions.length === 0) {
      setSubmitError("No eligible class sessions fall in this date range.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    let ok = 0;
    let skipped = 0;
    let failed = 0;
    const r = reason.trim();
    try {
      for (let i = 0; i < rangeSessions.length; i++) {
        const s = rangeSessions[i]!;
        setBulkProgress({ current: i + 1, total: rangeSessions.length });
        try {
          await createParentExcusalRequest(studentId, {
            session_id: s.id,
            classroom_id: s.classroom_id,
            reason: r,
          });
          ok += 1;
        } catch (e) {
          if (e instanceof ApiHttpError && e.status === 409) {
            skipped += 1;
          } else {
            failed += 1;
          }
        }
      }
      setBulkProgress(null);
      if (ok > 0) {
        await onSuccess?.();
        onClose();
        return;
      }
      if (failed > 0) {
        setSubmitError(
          `${failed} session(s) could not be submitted. You can try again or use one session at a time.`,
        );
        return;
      }
      setSubmitError(
        "No new requests were created. Those sessions may already have a pending excusal.",
      );
    } finally {
      setSubmitting(false);
      setBulkProgress(null);
    }
  };

  const submit = () => {
    if (mode === "range") void submitRange();
    else void submitSession();
  };

  const rangeSpanInvalid = (() => {
    if (!calRange?.from) return null;
    const a = calRange.from;
    const b = calRange.to ?? calRange.from;
    if (b < a) return "End date must be on or after start date.";
    const spanDays =
      Math.ceil((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (spanDays > MAX_RANGE_SPAN_DAYS) {
      return `Range cannot exceed ${MAX_RANGE_SPAN_DAYS} days.`;
    }
    return null;
  })();

  const isRangeUi = mode === "range";

  const primaryDisabled =
    submitting ||
    (isRangeUi &&
      (Boolean(rangeSpanInvalid) || rangeLoading || rangeSessions.length === 0));

  const primaryLabel =
    isRangeUi
      ? bulkProgress
        ? `Submitting ${bulkProgress.current}/${bulkProgress.total}…`
        : rangeSessions.length > 0
          ? `Submit for ${rangeSessions.length} session${rangeSessions.length === 1 ? "" : "s"}`
          : "Submit requests"
      : submitting
        ? "Sending…"
        : "Submit request";

  const panelWide = isRangeUi;

  const calendarModalTitle = (
    <span className="g-excusal-calendar-modal__title">
      <img src={KID_CALENDAR_ICON} alt="" width={32} height={32} />
      Pick your days away
    </span>
  );

  const excusalTitle = rangeOnly ? "Excusal by dates" : "Request excusal";

  return (
    <>
      <ModalDialog
        isOpen={open}
        onClose={onClose}
        title={excusalTitle}
        ariaLabel={excusalTitle}
        disableClose={submitting || (mode === "range" && calendarPickerOpen)}
        contentClassName={`g-excusal-modal-dialog${panelWide ? " g-excusal-modal-dialog--wide" : ""}`.trim()}
        footer={
          <div className="ui-form-actions">
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              onClick={submit}
              disabled={primaryDisabled}
            >
              {primaryLabel}
            </button>
          </div>
        }
      >
        <p className="g-excusal-modal__hint">
          {rangeOnly
            ? "Pick a start and end day on the calendar. We’ll request an excusal for each eligible class session in between. Staff may follow up in Messages."
            : "Staff may follow up in Messages. Use one session, or pick a calendar range to request an excusal for every eligible class in that range."}
        </p>

        {!rangeOnly ? (
          <div className="g-excusal-modal__segments" role="tablist" aria-label="Request type">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "session"}
              className={`g-excusal-modal__segment${mode === "session" ? " g-excusal-modal__segment--active" : ""}`}
              onClick={() => setMode("session")}
            >
              One session
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "range"}
              className={`g-excusal-modal__segment${mode === "range" ? " g-excusal-modal__segment--active" : ""}`}
              onClick={() => setMode("range")}
            >
              Date range
            </button>
          </div>
        ) : null}

        {mode === "session" ? (
          <>
            {preset?.summaryLabel ? (
              <p className="g-excusal-modal__session-label">{preset.summaryLabel}</p>
            ) : null}
            {showSessionSelect ? (
              <>
                <label className="g-excusal-modal__label" htmlFor="g-excusal-session">
                  Session
                </label>
                <select
                  id="g-excusal-session"
                  className="g-excusal-modal__select"
                  value={sessionPick}
                  onChange={(e) => setSessionPick(e.target.value)}
                >
                  {sessionChoices!.map((c) => (
                    <option
                      key={`${c.sessionId}|${c.classroomId}`}
                      value={`${c.sessionId}|${c.classroomId}`}
                    >
                      {c.label}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </>
        ) : (
          <div className="g-excusal-modal__range-block g-excusal-modal__range-block--kid">
            <div className="g-excusal-modal__kid-cal-intro">
              <img
                src={KID_CALENDAR_ICON}
                alt=""
                className="g-excusal-modal__kid-cal-mascot"
                width={44}
                height={44}
              />
              <p className="g-excusal-modal__range-hint g-excusal-modal__range-hint--kid">
                Open the calendar to choose dates: first tap starts your range, second tap ends it —
                days in between light up. Canceled classes and sessions outside the school&apos;s
                excusal window are skipped.
              </p>
            </div>
            <button
              type="button"
              className="g-excusal-modal__cal-launch-btn"
              onClick={() => setCalendarPickerOpen(true)}
            >
              <img src={KID_CALENDAR_ICON} alt="" width={28} height={28} />
              <span>Choose dates on the calendar</span>
            </button>
            <p className="g-excusal-modal__range-summary" role="status">
              {formatRangeSummary(calRange)}
            </p>
            {rangeSpanInvalid ? (
              <p className="g-excusal-modal__error" role="status">
                {rangeSpanInvalid}
              </p>
            ) : null}
            {rangeFetchError ? (
              <p className="g-excusal-modal__error" role="alert">
                {rangeFetchError}
              </p>
            ) : null}
            {rangeLoading ? (
              <p className="g-excusal-modal__range-status">Finding sessions…</p>
            ) : !rangeSpanInvalid && !rangeFetchError ? (
              <p className="g-excusal-modal__range-status">
                {rangeSessions.length === 0
                  ? "No eligible sessions in this range."
                  : `${rangeSessions.length} session${rangeSessions.length === 1 ? "" : "s"} will receive this request.`}
              </p>
            ) : null}
            {rangeSessions.length > 0 ? (
              <ul className="g-excusal-modal__range-list" aria-label="Sessions in range">
                {rangeSessions.slice(0, 12).map((s) => (
                  <li key={s.id}>{formatSessionLine(s)}</li>
                ))}
                {rangeSessions.length > 12 ? (
                  <li className="g-excusal-modal__range-list-more">
                    + {rangeSessions.length - 12} more
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        )}

        <label className="g-excusal-modal__label" htmlFor="g-excusal-reason">
          Reason
        </label>
        <textarea
          id="g-excusal-reason"
          className="g-excusal-modal__textarea"
          rows={isRangeUi ? 3 : 4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Medical appointment, family travel…"
          maxLength={2000}
        />
        {submitError ? (
          <p className="g-excusal-modal__error" role="alert">
            {submitError}
          </p>
        ) : null}
      </ModalDialog>

      {mode === "range" ? (
        <ModalDialog
          isOpen={open && calendarPickerOpen}
          onClose={() => setCalendarPickerOpen(false)}
          title={calendarModalTitle}
          ariaLabel="Pick absence date range"
          contentClassName="g-excusal-calendar-modal"
          backdropClassName="ui-modal__backdrop--stack"
          footer={
            <div className="ui-form-actions">
              <button
                type="button"
                className="ui-btn ui-btn--primary"
                onClick={() => setCalendarPickerOpen(false)}
              >
                Done
              </button>
            </div>
          }
        >
          <p className="g-excusal-calendar-modal__hint">
            Tap once for the first day away, again for the last day. You can pick up to{" "}
            {MAX_RANGE_SPAN_DAYS} days total.
          </p>
          <div className="g-excusal-modal__daypicker-wrap g-excusal-modal__daypicker-wrap--in-dialog">
            <DayPicker
              key={rangeCalendarKey}
              mode="range"
              selected={calRange}
              onSelect={setCalRange}
              defaultMonth={calRange?.from ?? new Date()}
              resetOnSelect
              max={MAX_RANGE_SPAN_DAYS}
              disabled={[{ before: boundsMinDate }, { after: boundsMaxDate }]}
              className="g-excusal-modal__daypicker-root"
            />
          </div>
          <p className="g-excusal-calendar-modal__summary" role="status">
            {formatRangeSummary(calRange)}
          </p>
        </ModalDialog>
      ) : null}
    </>
  );
}
