import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ClassroomWizardState } from "./useClassroomWizardState";
import type { NavigateFunction } from "react-router-dom";
import { ModalDialog } from "../../components/ui";
import { useTenant } from "../../providers/TenantProvider";
import {
  checkDuplicateClassroomName,
  checkInstructorScheduleConflict,
  createClassroom,
  getClassroom,
  regenerateClassroomMeeting,
  updateClassroom,
  type ClassroomRecord,
} from "../../lib/api/classrooms";
import {
  assignLessonToClassroom,
  listTenantLessons,
} from "../../lib/api/trackLessons";
import { listPrograms, type Program as ProgramRecord } from "../../lib/api/programs";
import { listCourses, type Course as CurriculumRecord } from "../../lib/api/curriculum";
import { filterToPermittedLabOptions } from "../../lib/permittedLabs";
import { listTenantMembers } from "../../lib/api/tenants";
import { buildMeetingTimeOptions, buildTimeZoneOptions, toMinutes } from "./classroomFormUtils";
import {
  ClassroomWizardBasicsStep,
  ClassroomWizardProgramCurriculumStep,
  ClassroomWizardScheduleStep,
  type ClassroomWizardPanelContext,
} from "./ClassroomWizardStepPanels";
import { useClassroomWizardState } from "./useClassroomWizardState";
import {
  buildClassroomEditUpdatePayload,
  editPayloadSourceFromWizard,
  editScreenSnapshotDiffKeys,
  editScreenSnapshotFromWizard,
  editScreenSnapshotsEqual,
  type EditScreenSnapshot,
} from "./classroomEditPayload";
import { MultiAssignDialog } from "../track_lessons/components";
import "../track_lessons/track-lessons.css";

/** If wizard drifts after capture only on these keys, re-baseline once (late prefill / member list). */
const EDIT_DIRTY_BASELINE_ASYNC_FIELDS = new Set([
  "permittedLabs",
  "curriculumId",
  "programId",
  "instructorId",
]);

function useWizardRef(w: ClassroomWizardState) {
  const ref = useRef(w);
  ref.current = w;
  return ref;
}

export type ClassroomFormWizardProps = {
  mode: "create" | "edit";
  isOpen: boolean;
  onClose: () => void;
  navigate: NavigateFunction;
  /** When mode is edit */
  editClassroomId?: string | null;
  /** Optional snapshot to avoid loading flash (e.g. classroom detail page) */
  initialClassroomSnapshot?: ClassroomRecord | null;
  /** Create: URL prefill */
  initialCurriculumIdFromQuery?: string | null;
  /** After successful create or update */
  onSuccess: (record: ClassroomRecord) => void | Promise<void>;
};

export function ClassroomFormWizard({
  mode,
  isOpen,
  onClose,
  navigate,
  editClassroomId,
  initialClassroomSnapshot,
  initialCurriculumIdFromQuery,
  onSuccess,
}: ClassroomFormWizardProps) {
  const w = useClassroomWizardState();
  const wRef = useWizardRef(w);
  const { tenant } = useTenant();
  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [curricula, setCurricula] = useState<CurriculumRecord[]>([]);
  const [lessonOptions, setLessonOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);
  const [lessonPickerOpen, setLessonPickerOpen] = useState(false);
  /** After programs/curricula fetch settles (even on error) — avoids clearing hydrated ids while options are still empty. */
  const [catalogReady, setCatalogReady] = useState(false);
  const [availableInstructors, setAvailableInstructors] = useState<
    Array<{ id: string; label: string; email: string; roleSlug?: string | null }>
  >([]);
  const [loadingInstructors, setLoadingInstructors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
  const [editBaseline, setEditBaseline] = useState<ClassroomRecord | null>(null);
  /** Wizard snapshot after hydrate + catalog/prefill — dirty compare uses this, not raw API fields. */
  const [editDirtyBaseline, setEditDirtyBaseline] = useState<EditScreenSnapshot | null>(null);
  const editDirtyBaselineCapturedKeyRef = useRef<string>("");
  const editDirtyStabilizeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nameDuplicateCheckSeqRef = useRef(0);
  const [duplicateNameExists, setDuplicateNameExists] = useState(false);
  const [checkingDuplicateName, setCheckingDuplicateName] = useState(false);
  const [hasInstructorScheduleConflict, setHasInstructorScheduleConflict] = useState(false);
  const [checkingInstructorConflict, setCheckingInstructorConflict] = useState(false);
  const prefillLabsForCurriculumRef = useRef("");

  const meetingTimeOptions = useMemo(() => buildMeetingTimeOptions(), []);
  const timeZoneOptions = useMemo(() => buildTimeZoneOptions(), []);

  const selectableInstructors = useMemo(() => {
    return availableInstructors.filter((item) => {
      const roleSlug = (item.roleSlug ?? "").toLowerCase();
      if (roleSlug.includes("instructor")) return true;
      if (!w.includeAdminOwners) return false;
      return roleSlug.includes("owner") || roleSlug.includes("admin");
    });
  }, [availableInstructors, w.includeAdminOwners]);

  const curriculumOptions = useMemo(() => {
    const filtered = w.programId
      ? curricula.filter((course) => course.program_id === w.programId)
      : curricula;
    return filtered.map((course) => ({
      value: course.id,
      label: course.title,
      searchText: `${course.title} ${course.description ?? ""}`,
    }));
  }, [curricula, w.programId]);

  const meetingStartMinutes = toMinutes(w.startTime);
  const meetingEndMinutes = toMinutes(w.endTime);
  const invalidTimeRange =
    meetingStartMinutes != null && meetingEndMinutes != null && meetingEndMinutes <= meetingStartMinutes;
  const missingStepOneRequired = !w.name.trim() || !w.instructorId;
  const missingScheduleRequired =
    !w.timeZone || w.selectedDays.length === 0 || !w.startTime || !w.endTime;

  const idPrefix = mode === "create" ? "create-class" : "edit-class";

  const programLockedByCurriculum = (() => {
    if (!w.curriculumId) return false;
    const course = curricula.find((c) => c.id === w.curriculumId);
    return Boolean(course?.program_id);
  })();

  const panelCtx: ClassroomWizardPanelContext = {
    mode,
    idPrefix,
    selectableInstructors,
    availableInstructorCount: availableInstructors.length,
    loadingInstructors,
    programs,
    curriculumOptions,
    meetingTimeOptions,
    timeZoneOptions,
    duplicateNameExists,
    checkingDuplicateName,
    hasInstructorScheduleConflict,
    missingScheduleRequired,
    invalidTimeRange,
    programLockedByCurriculum,
    lessonOptions,
    selectedLessonIds,
    onOpenLessonPicker: () => setLessonPickerOpen(true),
    onInviteInstructors: () => {
      onClose();
      if (mode === "create") wRef.current.resetForCreate();
      navigate("/app/members");
    },
  };

  useEffect(() => {
    if (!isOpen || !tenant?.id) return;
    let mounted = true;
    setLoadingInstructors(true);
    listTenantMembers(tenant.id)
      .then((members) => {
        if (!mounted) return;
        const instructors = members
          .filter((member) => {
            if (!member.is_active) return false;
            const roleSlug = (member.role_slug ?? "").toLowerCase();
            return (
              roleSlug.includes("instructor") ||
              roleSlug.includes("owner") ||
              roleSlug.includes("admin")
            );
          })
          .map((member) => ({
            id: member.user_id,
            label: `${member.first_name} ${member.last_name}`.trim() || member.email,
            email: member.email,
            roleSlug: member.role_slug ?? null,
          }));
        setAvailableInstructors(instructors);
      })
      .catch(() => {
        if (!mounted) return;
        setAvailableInstructors([]);
      })
      .finally(() => {
        if (mounted) setLoadingInstructors(false);
      });
    return () => {
      mounted = false;
    };
  }, [isOpen, tenant?.id]);

  useEffect(() => {
    if (!isOpen) {
      setCatalogReady(false);
      return;
    }
    let mounted = true;
    setCatalogReady(false);
    void Promise.all([listPrograms({ limit: 300 }), listCourses({ limit: 300 }), listTenantLessons(true)])
      .then(([programRows, courseRows, lessonRows]) => {
        if (!mounted) return;
        setPrograms(programRows);
        setCurricula(courseRows);
        setLessonOptions(lessonRows.map((row) => ({ id: row.id, label: row.title })));
      })
      .catch(() => {
        if (!mounted) return;
        setPrograms([]);
        setCurricula([]);
        setLessonOptions([]);
      })
      .finally(() => {
        if (mounted) setCatalogReady(true);
      });
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || mode !== "edit" || !editClassroomId) return;
    const snap = initialClassroomSnapshot;
    if (snap && snap.id === editClassroomId) {
      wRef.current.hydrateFromClassroom(snap);
      setEditBaseline(snap);
      setEditLoadError(null);
      setEditLoading(false);
      prefillLabsForCurriculumRef.current = snap.curriculum_id ?? "";
      return;
    }
    let mounted = true;
    setEditLoading(true);
    setEditLoadError(null);
    setEditBaseline(null);
    void getClassroom(editClassroomId)
      .then((full) => {
        if (!mounted) return;
        wRef.current.hydrateFromClassroom(full);
        setEditBaseline(full);
        prefillLabsForCurriculumRef.current = full.curriculum_id ?? "";
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setEditLoadError(err instanceof Error ? err.message : "Failed to load classroom");
      })
      .finally(() => {
        if (mounted) setEditLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [isOpen, mode, editClassroomId, initialClassroomSnapshot?.id, initialClassroomSnapshot?.updated_at]);

  useEffect(() => {
    if (!isOpen || mode !== "create") return;
    wRef.current.resetForCreate();
    wRef.current.setWizardStep(1);
    prefillLabsForCurriculumRef.current = "";
    setFormError(null);
    setEditLoadError(null);
    setEditBaseline(null);
    setSelectedLessonIds([]);
    setLessonPickerOpen(false);
    if (initialCurriculumIdFromQuery) wRef.current.setCurriculumId(initialCurriculumIdFromQuery);
  }, [isOpen, mode, initialCurriculumIdFromQuery]);

  useEffect(() => {
    if (!isOpen || mode !== "edit") return;
    setSelectedLessonIds([]);
    setLessonPickerOpen(false);
  }, [isOpen, mode, editClassroomId]);

  useEffect(() => {
    if (!isOpen) return;
    const curriculumId = wRef.current.curriculumId;
    if (!curriculumId) {
      prefillLabsForCurriculumRef.current = "";
      return;
    }
    if (prefillLabsForCurriculumRef.current === curriculumId) return;
    const course = curricula.find((c) => c.id === curriculumId);
    if (!course) return;
    prefillLabsForCurriculumRef.current = curriculumId;
    wRef.current.setPermittedLabs(filterToPermittedLabOptions(course.default_permitted_labs ?? []));
  }, [isOpen, w.curriculumId, curricula]);

  useEffect(() => {
    if (!catalogReady) return;
    const curriculumId = wRef.current.curriculumId;
    if (!curriculumId) return;
    if (curriculumOptions.some((option) => option.value === curriculumId)) return;
    wRef.current.setCurriculumId("");
  }, [w.curriculumId, curriculumOptions, catalogReady]);

  /** When a curriculum with a program_id is selected, auto-assign and lock the program dropdown. */
  useEffect(() => {
    if (!catalogReady) return;
    const curriculumId = w.curriculumId;
    if (!curriculumId) return;
    const course = curricula.find((c) => c.id === curriculumId);
    if (!course?.program_id) return;
    if (w.programId !== course.program_id) {
      w.setProgramId(course.program_id);
    }
  }, [w.curriculumId, catalogReady, curricula]);

  useEffect(() => {
    if (loadingInstructors) return;
    const id = wRef.current.instructorId;
    if (!id) return;
    if (!selectableInstructors.some((item) => item.id === id)) {
      wRef.current.setInstructorId("");
    }
  }, [selectableInstructors, w.instructorId, loadingInstructors]);

  useEffect(() => {
    if (!w.nameTouched) {
      setDuplicateNameExists(false);
      setCheckingDuplicateName(false);
      return;
    }
    const name = w.name.trim();
    if (!name) {
      setDuplicateNameExists(false);
      return;
    }
    const excludeId =
      mode === "edit" ? (editBaseline?.id ?? editClassroomId ?? undefined) : undefined;
    const seq = ++nameDuplicateCheckSeqRef.current;
    setCheckingDuplicateName(true);
    void checkDuplicateClassroomName(name, excludeId)
      .then((res) => {
        if (seq !== nameDuplicateCheckSeqRef.current) return;
        setDuplicateNameExists(Boolean(res.exists));
      })
      .catch(() => {
        if (seq !== nameDuplicateCheckSeqRef.current) return;
        setDuplicateNameExists(false);
      })
      .finally(() => {
        if (seq === nameDuplicateCheckSeqRef.current) setCheckingDuplicateName(false);
      });
  }, [w.nameTouched, w.name, mode, editClassroomId, editBaseline?.id]);

  const instructorConflictSeqRef = useRef(0);
  useEffect(() => {
    if (w.wizardStep !== 3 || !w.scheduleTouched) {
      setCheckingInstructorConflict(false);
      return;
    }
    if (!w.instructorId || w.selectedDays.length === 0 || !w.startTime || !w.endTime) {
      setHasInstructorScheduleConflict(false);
      setCheckingInstructorConflict(false);
      return;
    }
    const seq = ++instructorConflictSeqRef.current;
    setCheckingInstructorConflict(true);
    void checkInstructorScheduleConflict({
      instructor_id: w.instructorId,
      selected_days: w.selectedDays,
      start_time: w.startTime,
      end_time: w.endTime,
      exclude_classroom_id:
        mode === "edit" ? (editBaseline?.id ?? editClassroomId ?? null) : null,
    })
      .then((res) => {
        if (seq !== instructorConflictSeqRef.current) return;
        setHasInstructorScheduleConflict(Boolean(res.has_conflict));
      })
      .catch(() => {
        if (seq !== instructorConflictSeqRef.current) return;
        setHasInstructorScheduleConflict(false);
      })
      .finally(() => {
        if (seq === instructorConflictSeqRef.current) setCheckingInstructorConflict(false);
      });
  }, [
    w.wizardStep,
    w.scheduleTouched,
    w.instructorId,
    w.selectedDays,
    w.startTime,
    w.endTime,
    mode,
    editClassroomId,
    editBaseline?.id,
  ]);

  /** Capture “clean” wizard state once per loaded class after catalog + prefill effects flush (double tick). */
  useEffect(() => {
    if (!isOpen || mode !== "edit") {
      editDirtyBaselineCapturedKeyRef.current = "";
      setEditDirtyBaseline(null);
      return;
    }
    if (editLoading || !editBaseline || !catalogReady) {
      setEditDirtyBaseline(null);
      return;
    }
    const key = `${editBaseline.id}:${editBaseline.updated_at ?? ""}`;
    if (editDirtyBaselineCapturedKeyRef.current === key) return;

    let innerTid: ReturnType<typeof setTimeout> | undefined;
    const outerTid = window.setTimeout(() => {
      innerTid = window.setTimeout(() => {
        if (editDirtyStabilizeTimerRef.current != null) {
          window.clearTimeout(editDirtyStabilizeTimerRef.current);
          editDirtyStabilizeTimerRef.current = undefined;
        }
        editDirtyBaselineCapturedKeyRef.current = key;
        const first = editScreenSnapshotFromWizard(wRef.current);
        setEditDirtyBaseline(first);
        editDirtyStabilizeTimerRef.current = window.setTimeout(() => {
          editDirtyStabilizeTimerRef.current = undefined;
          const next = editScreenSnapshotFromWizard(wRef.current);
          if (editScreenSnapshotsEqual(first, next)) return;
          const drift = editScreenSnapshotDiffKeys(first, next);
          if (drift.length > 0 && drift.every((k) => EDIT_DIRTY_BASELINE_ASYNC_FIELDS.has(k))) {
            setEditDirtyBaseline(next);
          }
        }, 320);
      }, 0);
    }, 0);
    return () => {
      window.clearTimeout(outerTid);
      if (innerTid != null) window.clearTimeout(innerTid);
      if (editDirtyStabilizeTimerRef.current != null) {
        window.clearTimeout(editDirtyStabilizeTimerRef.current);
        editDirtyStabilizeTimerRef.current = undefined;
      }
    };
  }, [isOpen, mode, editLoading, editBaseline?.id, editBaseline?.updated_at, catalogReady]);

  /** Current wizard — explicit field deps so dirty state updates on every controlled change. */
  const wizardEditScreenSnapshot = useMemo(
    () => editScreenSnapshotFromWizard(w),
    [
      w.name,
      w.programId,
      w.curriculumId,
      w.instructorId,
      w.deliveryMode,
      w.meetingMode,
      w.meetingProvider,
      w.manualMeetingLink,
      w.locationAddress,
      w.description,
      w.contentWindow,
      w.capacity,
      w.permittedLabs,
      w.selectedDays,
      w.isRecurring,
      w.timeZone,
      w.startTime,
      w.endTime,
    ],
  );

  /**
   * True when form matches the post-load wizard baseline (not raw API — prefill/labs differ from schedule JSON).
   * Until baseline is captured, true so Save on step 3 stays off.
   */
  const editScreenMatchesStorage =
    mode !== "edit" || editLoading || !editBaseline || editDirtyBaseline == null
      ? true
      : editScreenSnapshotsEqual(editDirtyBaseline, wizardEditScreenSnapshot);

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
    wRef.current.resetForCreate();
    wRef.current.setWizardStep(1);
    setFormError(null);
    setEditLoadError(null);
    setEditBaseline(null);
    setSelectedLessonIds([]);
    setLessonPickerOpen(false);
    editDirtyBaselineCapturedKeyRef.current = "";
    if (editDirtyStabilizeTimerRef.current != null) {
      window.clearTimeout(editDirtyStabilizeTimerRef.current);
      editDirtyStabilizeTimerRef.current = undefined;
    }
    setEditDirtyBaseline(null);
    prefillLabsForCurriculumRef.current = "";
    setDuplicateNameExists(false);
    setCheckingDuplicateName(false);
  }, [submitting, onClose, wRef]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (w.wizardStep === 1) {
      if (missingStepOneRequired) return;
      if (duplicateNameExists) return;
      if (checkingDuplicateName) return;
      w.setWizardStep(2);
      return;
    }
    if (w.wizardStep === 2) {
      w.setWizardStep(3);
      return;
    }
    if (missingStepOneRequired) return;
    if (missingScheduleRequired) return;
    if (duplicateNameExists) return;
    if (checkingDuplicateName) return;
    if (invalidTimeRange) return;
    if (hasInstructorScheduleConflict) return;
    if (checkingInstructorConflict) return;
    if (mode === "edit" && editScreenMatchesStorage) return;

    void (async () => {
      setSubmitting(true);
      try {
        const selectedInstructor = availableInstructors.find((i) => i.id === w.instructorId);
        const selectedCurriculum = curricula.find((entry) => entry.id === w.curriculumId);
        const baseSchedule =
          mode === "edit" && editBaseline
            ? { ...((editBaseline.schedule as Record<string, unknown>) ?? {}) }
            : {};
        const schedule = {
          ...baseSchedule,
          recurring: w.isRecurring,
          days: w.selectedDays,
          time: w.startTime,
          end_time: w.endTime,
          instructor_label: selectedInstructor?.label ?? null,
          permitted_labs: w.permittedLabs,
          notes: w.description.trim() || null,
          delivery: w.deliveryMode,
          content_window_hours: Number(w.contentWindow) || 48,
        };

        if (mode === "create") {
          const needsExternalMeeting = w.deliveryMode !== "in-person" && w.meetingMode === "generate";
          const created = await createClassroom({
            name: w.name.trim(),
            program_id: w.programId || selectedCurriculum?.program_id || null,
            curriculum_id: w.curriculumId || null,
            instructor_id: w.instructorId || null,
            mode: w.deliveryMode,
            recurrence_type: w.isRecurring ? "weekly" : "one_time",
            meeting_provider:
              w.deliveryMode === "in-person"
                ? null
                : w.meetingMode === "built_in"
                  ? "built_in"
                  : w.meetingMode === "generate"
                    ? w.meetingProvider
                    : null,
            meeting_link:
              w.deliveryMode !== "in-person" && w.meetingMode === "paste"
                ? w.manualMeetingLink || null
                : null,
            location_address:
              w.deliveryMode === "in-person" || w.deliveryMode === "hybrid"
                ? w.locationAddress || null
                : null,
            schedule,
            timezone: w.timeZone,
            max_students: (() => {
              const n = parseInt(String(w.capacity).trim(), 10);
              return Number.isFinite(n) && n > 0 ? n : null;
            })(),
            is_active: true,
          });
          if (needsExternalMeeting) {
            try {
              await regenerateClassroomMeeting(created.id, w.meetingProvider);
            } catch {
              /* classroom still created */
            }
          }
          if (selectedLessonIds.length > 0) {
            await Promise.all(
              selectedLessonIds.map((lessonId) => assignLessonToClassroom(created.id, lessonId)),
            );
          }
          await onSuccess(created);
          handleClose();
          return;
        }

        if (!editClassroomId || !editBaseline) {
          setFormError("Missing classroom to update.");
          return;
        }
        const editSrc = editPayloadSourceFromWizard(w, editBaseline);
        const patch = buildClassroomEditUpdatePayload(editSrc, {
          availableInstructors,
          curricula,
          recordName: editBaseline.name,
        });
        const updated = await updateClassroom(editClassroomId, patch);
        if (w.deliveryMode !== "in-person" && w.meetingMode === "generate") {
          try {
            await regenerateClassroomMeeting(updated.id, w.meetingProvider);
          } catch {
            /* ignore */
          }
        }
        if (selectedLessonIds.length > 0) {
          await Promise.all(
            selectedLessonIds.map((lessonId) => assignLessonToClassroom(updated.id, lessonId)),
          );
        }
        await onSuccess(updated);
        handleClose();
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setSubmitting(false);
      }
    })();
  };

  const title =
    mode === "create"
      ? w.wizardStep === 1
        ? "Create Classroom — Class basics"
        : w.wizardStep === 2
          ? "Create Classroom — Program & materials"
          : "Create Classroom — Schedule"
      : w.wizardStep === 1
        ? "Edit Classroom — Class basics"
        : w.wizardStep === 2
          ? "Edit Classroom — Program & materials"
          : "Edit Classroom — Schedule";

  const editNothingChanged = mode === "edit" && editScreenMatchesStorage;

  const disablePrimary =
    w.wizardStep === 1
      ? missingStepOneRequired ||
        duplicateNameExists ||
        checkingDuplicateName
      : w.wizardStep === 2
        ? false
        : missingStepOneRequired ||
          missingScheduleRequired ||
          duplicateNameExists ||
          checkingDuplicateName ||
          invalidTimeRange ||
          hasInstructorScheduleConflict ||
          checkingInstructorConflict ||
          editNothingChanged;

  return (
    <>
    <ModalDialog
      isOpen={isOpen}
      onClose={handleClose}
      ariaLabel={mode === "create" ? "Create classroom" : "Edit classroom"}
      contentClassName="classroom-list__create-form classroom-list__create-form--dialog"
      closeVariant="neutral"
      disableClose={submitting || (mode === "edit" && editLoading)}
    >
      <form onSubmit={handleSubmit} className="classroom-list__dialog-form-shell" noValidate>
        <div className="classroom-list__dialog-header">
          <div className="classroom-list__dialog-header-row">
            <h2 className="classroom-list__create-title">{title}</h2>
            <span className="classroom-list__step-pill">{`Step ${w.wizardStep} of 3`}</span>
          </div>
        </div>
        <div className="classroom-list__dialog-body">
          {mode === "edit" && editLoadError && !editLoading ? (
            <p className="classroom-list__empty classroom-detail__dialog-error">{editLoadError}</p>
          ) : null}
          {mode === "edit" && editLoading ? (
            <p className="classroom-list__empty">Loading classroom…</p>
          ) : null}
          {formError ? <p className="classroom-list__empty classroom-detail__dialog-error">{formError}</p> : null}
          {w.nameTouched && duplicateNameExists ? (
            <p className="classroom-list__validation">
              A classroom with this name already exists. Please choose a different name.
            </p>
          ) : null}
          {w.wizardStep === 3 && !missingScheduleRequired && hasInstructorScheduleConflict ? (
            <p className="classroom-list__validation">
              This instructor already has a class at the selected day/time.
            </p>
          ) : null}
          {mode === "edit" && editBaseline && editScreenMatchesStorage && !editLoading ? (
            <p className="classroom-list__helper-copy" role="status">
              {w.wizardStep === 3
                ? "Change something on any step to enable Save — nothing is different from the saved class yet."
                : "No changes yet — use Next to review other steps, then Save on the final step."}
            </p>
          ) : null}
          {!(mode === "edit" && editLoading) && !(mode === "edit" && editLoadError && !editBaseline) ? (
            <div className="classroom-list__create-grid">
              {w.wizardStep === 1 ? (
                <ClassroomWizardBasicsStep w={w} ctx={panelCtx} />
              ) : w.wizardStep === 2 ? (
                <ClassroomWizardProgramCurriculumStep w={w} ctx={panelCtx} />
              ) : (
                <ClassroomWizardScheduleStep w={w} ctx={panelCtx} />
              )}
            </div>
          ) : null}
        </div>
        <div className="classroom-list__dialog-footer">
          <div className="classroom-list__create-actions">
            <button
              type="button"
              className="classroom-list__create-btn classroom-list__create-btn--cancel"
              onClick={() => {
                if (w.wizardStep === 3) {
                  w.setWizardStep(2);
                  return;
                }
                if (w.wizardStep === 2) {
                  w.setWizardStep(1);
                  return;
                }
                handleClose();
              }}
              disabled={submitting || (mode === "edit" && editLoading)}
            >
              {w.wizardStep === 1 ? "Cancel" : "Back"}
            </button>
            {w.wizardStep === 1 ? (
              <button
                type="submit"
                className="classroom-list__create-btn"
                disabled={disablePrimary || (mode === "edit" && !!editLoadError)}
              >
                Next
              </button>
            ) : w.wizardStep === 2 ? (
              <button
                type="submit"
                className="classroom-list__create-btn"
                disabled={disablePrimary || (mode === "edit" && !!editLoadError)}
              >
                Next
              </button>
            ) : (
              <button type="submit" className="classroom-list__create-btn" disabled={disablePrimary || submitting}>
                {submitting
                  ? mode === "create"
                    ? "Creating..."
                    : "Saving..."
                  : mode === "create"
                    ? "Create Classroom"
                    : "Save changes"}
              </button>
            )}
          </div>
        </div>
      </form>
    </ModalDialog>
    <MultiAssignDialog
      isOpen={lessonPickerOpen}
      title={
        mode === "create"
          ? "Select lessons to assign after creation"
          : "Select lessons to assign to this classroom"
      }
      items={lessonOptions}
      selectedIds={selectedLessonIds}
      onSelectedIdsChange={setSelectedLessonIds}
      searchPlaceholder="Search lessons"
      emptyLabel="No lessons available."
      confirmLabel="Use selected lessons"
      isSubmitting={submitting}
      onClose={() => setLessonPickerOpen(false)}
      onConfirm={() => setLessonPickerOpen(false)}
    />
    </>
  );
}
