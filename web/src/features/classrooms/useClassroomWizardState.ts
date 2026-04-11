import { useCallback, useState } from "react";
import type { ClassroomRecord } from "../../lib/api/classrooms";
import { filterToPermittedLabOptions } from "../../lib/permittedLabs";

export type ClassroomWizardStep = 1 | 2 | 3;

export function useClassroomWizardState() {
  const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [wizardStep, setWizardStep] = useState<ClassroomWizardStep>(1);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [instructorId, setInstructorId] = useState("");
  const [includeAdminOwners, setIncludeAdminOwners] = useState(true);
  const [capacity, setCapacity] = useState("20");
  const [deliveryMode, setDeliveryMode] = useState<"online" | "in-person" | "hybrid">("online");
  const [meetingMode, setMeetingMode] = useState<"built_in" | "generate" | "paste">("generate");
  const [meetingProvider, setMeetingProvider] = useState<"zoom" | "meet" | "teams">("zoom");
  const [manualMeetingLink, setManualMeetingLink] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [description, setDescription] = useState("");
  const [contentWindow, setContentWindow] = useState("48");
  const [programId, setProgramId] = useState("");
  const [curriculumId, setCurriculumId] = useState("");
  const [permittedLabs, setPermittedLabs] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [isRecurring, setIsRecurring] = useState(true);
  const [timeZone, setTimeZone] = useState(defaultTz);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [scheduleTouched, setScheduleTouched] = useState(false);
  const [timeTouched, setTimeTouched] = useState(false);

  const resetForCreate = useCallback(() => {
    setWizardStep(1);
    setName("");
    setNameTouched(false);
    setInstructorId("");
    setIncludeAdminOwners(true);
    setCapacity("20");
    setDeliveryMode("online");
    setMeetingMode("generate");
    setMeetingProvider("zoom");
    setManualMeetingLink("");
    setLocationAddress("");
    setDescription("");
    setContentWindow("48");
    setProgramId("");
    setCurriculumId("");
    setPermittedLabs([]);
    setSelectedDays([]);
    setIsRecurring(true);
    setTimeZone(defaultTz);
    setStartTime("");
    setEndTime("");
    setScheduleTouched(false);
    setTimeTouched(false);
  }, [defaultTz]);

  const hydrateFromClassroom = useCallback((c: ClassroomRecord) => {
    const sch = (c.schedule ?? {}) as Record<string, unknown>;
    const daysRaw = sch.days;
    const days = Array.isArray(daysRaw) ? daysRaw.map(String) : [];
    const labsRaw = sch.permitted_labs;
    const labs = Array.isArray(labsRaw) ? labsRaw.map(String) : [];

    setWizardStep(1);
    setName(c.name);
    setNameTouched(false);
    setInstructorId(c.instructor_id ?? "");
    setCapacity(c.max_students != null && c.max_students > 0 ? String(c.max_students) : "0");
    setDeliveryMode(
      c.mode === "in-person" ? "in-person" : c.mode === "hybrid" ? "hybrid" : "online",
    );
    const provRaw = (c.meeting_provider ?? "").toLowerCase();
    if (provRaw === "built_in") {
      setMeetingMode("built_in");
      setMeetingProvider("zoom");
    } else {
      const autoGen = Boolean(c.meeting_auto_generated);
      setMeetingMode(autoGen ? "generate" : "paste");
      const prov = provRaw || "zoom";
      setMeetingProvider(
        prov === "meet" || prov === "teams" || prov === "zoom" ? (prov as "zoom" | "meet" | "teams") : "zoom",
      );
    }
    setManualMeetingLink(c.meeting_link ?? "");
    setLocationAddress(c.location_address ?? "");
    setDescription(String(sch.notes ?? ""));
    setContentWindow(String(sch.content_window_hours ?? "48"));
    setProgramId(c.program_id ?? "");
    setCurriculumId(c.curriculum_id ?? "");
    setPermittedLabs(filterToPermittedLabOptions(labs));
    setSelectedDays(days);
    const rec = c.recurrence_type === "weekly" || sch.recurring === true;
    setIsRecurring(rec);
    setTimeZone(c.timezone ?? defaultTz);
    setStartTime(String(sch.time ?? ""));
    setEndTime(String(sch.end_time ?? ""));
    setScheduleTouched(false);
    setTimeTouched(false);
  }, [defaultTz]);

  return {
    wizardStep,
    setWizardStep,
    name,
    setName,
    nameTouched,
    setNameTouched,
    instructorId,
    setInstructorId,
    includeAdminOwners,
    setIncludeAdminOwners,
    capacity,
    setCapacity,
    deliveryMode,
    setDeliveryMode,
    meetingMode,
    setMeetingMode,
    meetingProvider,
    setMeetingProvider,
    manualMeetingLink,
    setManualMeetingLink,
    locationAddress,
    setLocationAddress,
    description,
    setDescription,
    contentWindow,
    setContentWindow,
    programId,
    setProgramId,
    curriculumId,
    setCurriculumId,
    permittedLabs,
    setPermittedLabs,
    selectedDays,
    setSelectedDays,
    isRecurring,
    setIsRecurring,
    timeZone,
    setTimeZone,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    scheduleTouched,
    setScheduleTouched,
    timeTouched,
    setTimeTouched,
    resetForCreate,
    hydrateFromClassroom,
  };
}

export type ClassroomWizardState = ReturnType<typeof useClassroomWizardState>;
