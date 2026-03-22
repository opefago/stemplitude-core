import type { ClassroomRecord, UpdateClassroomPayload } from "../../lib/api/classrooms";
import { filterToPermittedLabOptions } from "../../lib/permittedLabs";
import type { ClassroomWizardState } from "./useClassroomWizardState";

/** Inputs shared by “current form” and “baseline classroom” when building an edit PATCH body. */
export type EditWizardPayloadSource = {
  baselineSchedule: Record<string, unknown>;
  name: string;
  programId: string;
  curriculumId: string;
  instructorId: string;
  deliveryMode: "online" | "in-person";
  meetingMode: "generate" | "paste";
  meetingProvider: "zoom" | "meet" | "teams";
  manualMeetingLink: string;
  locationAddress: string;
  description: string;
  contentWindow: string;
  capacity: string;
  permittedLabs: string[];
  selectedDays: string[];
  isRecurring: boolean;
  timeZone: string;
  startTime: string;
  endTime: string;
};

export function editPayloadSourceFromClassroom(
  c: ClassroomRecord,
  defaultTimeZone: string,
): EditWizardPayloadSource {
  const sch = (c.schedule ?? {}) as Record<string, unknown>;
  const daysRaw = sch.days;
  const days = Array.isArray(daysRaw) ? daysRaw.map(String) : [];
  const labsRaw = sch.permitted_labs;
  const labs = Array.isArray(labsRaw) ? filterToPermittedLabOptions(labsRaw.map(String)) : [];
  const autoGen = Boolean(c.meeting_auto_generated);
  const prov = (c.meeting_provider ?? "zoom").toLowerCase();
  const meetingProvider =
    prov === "meet" || prov === "teams" || prov === "zoom" ? (prov as "zoom" | "meet" | "teams") : "zoom";

  return {
    baselineSchedule: { ...sch },
    name: c.name,
    programId: c.program_id ?? "",
    curriculumId: c.curriculum_id ?? "",
    instructorId: c.instructor_id ?? "",
    deliveryMode: c.mode === "in-person" ? "in-person" : "online",
    meetingMode: autoGen ? "generate" : "paste",
    meetingProvider,
    manualMeetingLink: c.meeting_link ?? "",
    locationAddress: c.location_address ?? "",
    description: String(sch.notes ?? ""),
    contentWindow: String(sch.content_window_hours ?? "48"),
    capacity: c.max_students != null && c.max_students > 0 ? String(c.max_students) : "0",
    permittedLabs: labs,
    selectedDays: days,
    isRecurring: c.recurrence_type === "weekly" || sch.recurring === true,
    timeZone: c.timezone ?? defaultTimeZone,
    startTime: String(sch.time ?? ""),
    endTime: String(sch.end_time ?? ""),
  };
}

/** Wizard-visible fields only (no schedule JSON merge) — compare storage vs form for stable dirty state. */
export type EditScreenSnapshot = Omit<EditWizardPayloadSource, "baselineSchedule">;

export function editScreenSnapshotFromClassroom(
  c: ClassroomRecord,
  defaultTimeZone: string,
): EditScreenSnapshot {
  const full = editPayloadSourceFromClassroom(c, defaultTimeZone);
  const { baselineSchedule: _bs, ...snap } = full;
  return snap;
}

export function editScreenSnapshotFromWizard(w: ClassroomWizardState): EditScreenSnapshot {
  return {
    name: w.name,
    programId: w.programId,
    curriculumId: w.curriculumId,
    instructorId: w.instructorId,
    deliveryMode: w.deliveryMode,
    meetingMode: w.meetingMode,
    meetingProvider: w.meetingProvider,
    manualMeetingLink: w.manualMeetingLink,
    locationAddress: w.locationAddress,
    description: w.description,
    contentWindow: w.contentWindow,
    capacity: w.capacity,
    permittedLabs: [...w.permittedLabs],
    selectedDays: [...w.selectedDays],
    isRecurring: w.isRecurring,
    timeZone: w.timeZone,
    startTime: w.startTime,
    endTime: w.endTime,
  };
}

function sortedJson(arr: string[]): string {
  return JSON.stringify([...arr].map(String).sort());
}

/** HH:mm / H:mm from API vs padded options — compare semantically. */
function normTime24(t: string): string {
  const s = t.trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  const h = Number(m[1]);
  const mm = m[2];
  if (Number.isNaN(h)) return s;
  return `${String(h).padStart(2, "0")}:${mm}`;
}

function normContentWindow(s: string): string {
  const n = Number(String(s).trim());
  return String(Number.isFinite(n) ? Math.trunc(n) : 48);
}

function normCapacity(s: string): string {
  const n = parseInt(String(s).trim(), 10);
  return Number.isFinite(n) && n > 0 ? String(n) : "0";
}

/** Canonical form for dirty checks (inputs vs API strings). */
export function normalizeEditScreenSnapshotForCompare(s: EditScreenSnapshot): EditScreenSnapshot {
  return {
    ...s,
    name: s.name.trim(),
    description: s.description.trim(),
    manualMeetingLink: s.manualMeetingLink.trim(),
    locationAddress: s.locationAddress.trim(),
    contentWindow: normContentWindow(s.contentWindow),
    capacity: normCapacity(s.capacity),
    startTime: normTime24(s.startTime),
    endTime: normTime24(s.endTime),
    permittedLabs: [...s.permittedLabs],
    selectedDays: [...s.selectedDays],
  };
}

/** True when every wizard field matches the snapshot taken from the API record (order-independent days/labs). */
export function editScreenSnapshotsEqual(a: EditScreenSnapshot, b: EditScreenSnapshot): boolean {
  const A = normalizeEditScreenSnapshotForCompare(a);
  const B = normalizeEditScreenSnapshotForCompare(b);
  return (
    A.name === B.name &&
    A.programId === B.programId &&
    A.curriculumId === B.curriculumId &&
    A.instructorId === B.instructorId &&
    A.deliveryMode === B.deliveryMode &&
    A.meetingMode === B.meetingMode &&
    A.meetingProvider === B.meetingProvider &&
    A.manualMeetingLink === B.manualMeetingLink &&
    A.locationAddress === B.locationAddress &&
    A.description === B.description &&
    A.contentWindow === B.contentWindow &&
    A.capacity === B.capacity &&
    sortedJson(A.permittedLabs) === sortedJson(B.permittedLabs) &&
    sortedJson(A.selectedDays) === sortedJson(B.selectedDays) &&
    A.isRecurring === B.isRecurring &&
    A.timeZone === B.timeZone &&
    A.startTime === B.startTime &&
    A.endTime === B.endTime
  );
}

/** For debugging: field names where saved vs wizard snapshots differ (same rules as editScreenSnapshotsEqual). */
export function editScreenSnapshotDiffKeys(
  saved: EditScreenSnapshot,
  wizard: EditScreenSnapshot,
): string[] {
  const a = normalizeEditScreenSnapshotForCompare(saved);
  const b = normalizeEditScreenSnapshotForCompare(wizard);
  const diff: string[] = [];
  if (a.name !== b.name) diff.push("name");
  if (a.programId !== b.programId) diff.push("programId");
  if (a.curriculumId !== b.curriculumId) diff.push("curriculumId");
  if (a.instructorId !== b.instructorId) diff.push("instructorId");
  if (a.deliveryMode !== b.deliveryMode) diff.push("deliveryMode");
  if (a.meetingMode !== b.meetingMode) diff.push("meetingMode");
  if (a.meetingProvider !== b.meetingProvider) diff.push("meetingProvider");
  if (a.manualMeetingLink !== b.manualMeetingLink) diff.push("manualMeetingLink");
  if (a.locationAddress !== b.locationAddress) diff.push("locationAddress");
  if (a.description !== b.description) diff.push("description");
  if (a.contentWindow !== b.contentWindow) diff.push("contentWindow");
  if (a.capacity !== b.capacity) diff.push("capacity");
  if (sortedJson(a.permittedLabs) !== sortedJson(b.permittedLabs)) diff.push("permittedLabs");
  if (sortedJson(a.selectedDays) !== sortedJson(b.selectedDays)) diff.push("selectedDays");
  if (a.isRecurring !== b.isRecurring) diff.push("isRecurring");
  if (a.timeZone !== b.timeZone) diff.push("timeZone");
  if (a.startTime !== b.startTime) diff.push("startTime");
  if (a.endTime !== b.endTime) diff.push("endTime");
  return diff;
}

export function editPayloadSourceFromWizard(
  w: ClassroomWizardState,
  editBaseline: ClassroomRecord,
): EditWizardPayloadSource {
  const sch = (editBaseline.schedule ?? {}) as Record<string, unknown>;
  return {
    baselineSchedule: { ...sch },
    name: w.name,
    programId: w.programId,
    curriculumId: w.curriculumId,
    instructorId: w.instructorId,
    deliveryMode: w.deliveryMode,
    meetingMode: w.meetingMode,
    meetingProvider: w.meetingProvider,
    manualMeetingLink: w.manualMeetingLink,
    locationAddress: w.locationAddress,
    description: w.description,
    contentWindow: w.contentWindow,
    capacity: w.capacity,
    permittedLabs: w.permittedLabs,
    selectedDays: w.selectedDays,
    isRecurring: w.isRecurring,
    timeZone: w.timeZone,
    startTime: w.startTime,
    endTime: w.endTime,
  };
}

export function buildClassroomEditUpdatePayload(
  src: EditWizardPayloadSource,
  ctx: {
    availableInstructors: Array<{ id: string; label: string }>;
    curricula: Array<{ id: string; program_id?: string | null }>;
    recordName: string;
  },
): UpdateClassroomPayload {
  const selectedInstructor = ctx.availableInstructors.find((i) => i.id === src.instructorId);
  const selectedCurriculum = ctx.curricula.find((e) => e.id === src.curriculumId);
  const schedule: Record<string, unknown> = {
    ...src.baselineSchedule,
    recurring: src.isRecurring,
    days: src.selectedDays,
    time: src.startTime,
    end_time: src.endTime,
    instructor_label: selectedInstructor?.label ?? null,
    permitted_labs: src.permittedLabs,
    notes: src.description.trim() || null,
    delivery: src.deliveryMode,
    content_window_hours: Number(src.contentWindow) || 48,
  };

  return {
    name: src.name.trim() || ctx.recordName,
    program_id: src.programId || selectedCurriculum?.program_id || null,
    curriculum_id: src.curriculumId || null,
    instructor_id: src.instructorId || null,
    mode: src.deliveryMode,
    recurrence_type: src.isRecurring ? "weekly" : "one_time",
    meeting_provider:
      src.deliveryMode === "online" && src.meetingMode === "generate" ? src.meetingProvider : null,
    meeting_link:
      src.deliveryMode === "online" && src.meetingMode === "paste"
        ? src.manualMeetingLink.trim() || null
        : null,
    location_address: src.deliveryMode === "in-person" ? src.locationAddress || null : null,
    schedule,
    timezone: src.timeZone,
    max_students: (() => {
      const n = parseInt(String(src.capacity).trim(), 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    })(),
  };
}

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysDeep(obj[key]);
  }
  return sorted;
}

/** Normalize schedule for comparison (order-independent day/lab lists, stable key order). */
function normalizeScheduleForCompare(sched: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...sched };
  if (Array.isArray(copy.days)) {
    copy.days = [...(copy.days as string[])].map(String).sort();
  }
  if (Array.isArray(copy.permitted_labs)) {
    copy.permitted_labs = [...(copy.permitted_labs as string[])].map(String).sort();
  }
  return sortKeysDeep(copy) as Record<string, unknown>;
}

export function normalizeUpdatePayloadForCompare(payload: UpdateClassroomPayload): unknown {
  const schedule = payload.schedule
    ? normalizeScheduleForCompare(payload.schedule as Record<string, unknown>)
    : null;
  return sortKeysDeep({
    ...payload,
    schedule,
  });
}

export function classroomEditPayloadsEqual(a: UpdateClassroomPayload, b: UpdateClassroomPayload): boolean {
  return (
    JSON.stringify(normalizeUpdatePayloadForCompare(a)) ===
    JSON.stringify(normalizeUpdatePayloadForCompare(b))
  );
}
