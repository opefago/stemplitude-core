import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Play,
  Video,
  MessageSquare,
  Gift,
  FlaskConical,
  Share2,
  X,
  UserPlus,
  Pencil,
  BookOpen,
  Upload,
  Plus,
  FlaskConical as LabIcon,
  FileText,
  CheckCircle2,
  Clock,
  ChevronRight,
  Trash2,
  Search,
  Award,
  Sparkles,
} from "lucide-react";
import {
  KidCheckbox,
  KidDropdown,
  ProgressBar,
  DatePicker,
  DateTimePicker,
  SearchableDropdown,
  ModalDialog,
} from "../../components/ui";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import { buildLabLaunchPath, isCurriculumLabUuid } from "../labs/labRouting";
import {
  listStudentLabProjects,
  type StudentLabProject,
} from "../../lib/api/labs";
import {
  createClassroomSession,
  enrollClassroomStudent,
  unenrollClassroomStudent,
  endClassroomSession,
  getClassroom,
  getMyClassroom,
  getClassroomSessionPresence,
  heartbeatClassroomSession,
  listClassroomRoster,
  listMyClassroomSessions,
  listClassroomSessions,
  updateClassroomSessionContent,
  createSessionAssignmentFromTemplate,
  submitAssignment,
  listClassroomAssignments,
  listMySessionSubmissions,
  listSessionSubmissions,
  gradeSubmission,
  type ClassroomRecord,
  type ClassroomRosterStudentRecord,
  type ClassroomSessionRecord,
  type ClassroomAssignment,
  type SubmissionRecord,
  type RubricCriterionPayload,
  type SessionPresenceSummary,
  type SessionTextAssignment,
  type SessionResourceEntry,
} from "../../lib/api/classrooms";
import {
  listAssignmentTemplates,
  type AssignmentTemplate,
} from "../../lib/api/curriculum";
import {
  getAssetById,
  getAssetLibrary,
  getStudentSessionAssetById,
  inferAssetTypeFromFile,
  uploadAsset,
  type GlobalAsset,
  type Asset,
} from "../../lib/api/assets";
import { listStudents, type StudentProfile } from "../../lib/api/students";
import {
  awardBadge,
  awardXP,
  listBadges,
  revokeBadge,
  type BadgeDefinition,
} from "../../lib/api/gamification";
import {
  AttendanceSettings,
  type AttendanceConfig,
} from "./AttendanceSettings";
import {
  calculateSessionAttendance,
  getSessionAttendance,
  updateClassroom,
  type AttendanceRecord,
} from "../../lib/api/classrooms";
import "../../components/ui/ui.css";
import "./classrooms.css";
import { ClassroomFormWizard } from "./ClassroomFormWizard";
import { SubmissionSnapshotViewport } from "./SubmissionSnapshotViewport";
import { useTenantRealtime } from "../../hooks/useTenantRealtime";

type AssignmentWorkbench = SessionTextAssignment & {
  lab_launcher_id?: string | null;
  curriculum_lab_title?: string | null;
};

function resolveAssignmentLabLauncher(assignment: {
  lab_launcher_id?: string | null;
  lab_id?: string | null;
}): string | null {
  const fromApi = assignment.lab_launcher_id?.trim();
  if (fromApi) return fromApi;
  const lid = assignment.lab_id?.trim();
  if (!lid) return null;
  if (isCurriculumLabUuid(lid)) return null;
  return lid;
}

type TabId =
  | "students"
  | "sessions"
  | "attendance"
  | "submissions"
  | "assignments";

function isLiveSession(session: ClassroomSessionRecord): boolean {
  if (session.status === "canceled" || session.status === "completed")
    return false;
  const start = new Date(session.session_start).getTime();
  const end = new Date(session.session_end).getTime();
  return start <= Date.now() && Date.now() <= end;
}

type GradeRubricFormRow = {
  id: string;
  criterion_id: string;
  label: string;
  max_points: string;
  points_awarded: string;
};

function newRubricRowId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildGradeRubricPayload(
  rows: GradeRubricFormRow[],
): RubricCriterionPayload[] | undefined {
  const out: RubricCriterionPayload[] = [];
  for (const row of rows) {
    const cid = row.criterion_id.trim();
    if (!cid) continue;
    const max = parseInt(row.max_points, 10);
    const pts = parseInt(row.points_awarded, 10);
    if (!Number.isFinite(max) || max < 1 || max > 1000) {
      throw new Error(`Rubric "${cid}": max points must be 1–1000.`);
    }
    if (!Number.isFinite(pts) || pts < 0 || pts > max) {
      throw new Error(`Rubric "${cid}": points earned must be 0–${max}.`);
    }
    const label = row.label.trim();
    out.push({
      criterion_id: cid,
      label: label.length ? label : null,
      max_points: max,
      points_awarded: pts,
    });
  }
  return out.length ? out : undefined;
}

export function ClassroomDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { role, isSuperAdmin, user } = useAuth();
  const { tenant } = useTenant();
  const [activeTab, setActiveTab] = useState<TabId>("sessions");
  const [classroom, setClassroom] = useState<ClassroomRecord | null>(null);
  const [sessions, setSessions] = useState<ClassroomSessionRecord[]>([]);
  const [students, setStudents] = useState<ClassroomRosterStudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState(false);
  const [waitingSessionId, setWaitingSessionId] = useState<string | null>(null);
  const [waitingForClassStart, setWaitingForClassStart] = useState(false);
  const [clockMs, setClockMs] = useState(Date.now());
  const [sessionFilterStart, setSessionFilterStart] = useState("");
  const [sessionFilterEnd, setSessionFilterEnd] = useState("");
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionsPerPage, setSessionsPerPage] = useState("10");
  const [selectedSessionLab, setSelectedSessionLab] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [presenceSummary, setPresenceSummary] =
    useState<SessionPresenceSummary | null>(null);
  const [endingSession, setEndingSession] = useState(false);
  const [openingEndDialog, setOpeningEndDialog] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [forceEndRequired, setForceEndRequired] = useState(false);
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [allStudents, setAllStudents] = useState<StudentProfile[]>([]);
  const [loadingStudentsForEnroll, setLoadingStudentsForEnroll] =
    useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [enrollingStudent, setEnrollingStudent] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [rosterSelectedIds, setRosterSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [rosterBadgeOptions, setRosterBadgeOptions] = useState<
    BadgeDefinition[]
  >([]);
  const [rosterBadgesLoading, setRosterBadgesLoading] = useState(false);
  const [rosterGamifyModal, setRosterGamifyModal] = useState<
    null | "xp" | "assign" | "revoke"
  >(null);
  const [rosterGamifyTargets, setRosterGamifyTargets] = useState<string[]>([]);
  const [rosterGamifyXpAmount, setRosterGamifyXpAmount] = useState("25");
  const [rosterGamifyXpReason, setRosterGamifyXpReason] = useState(
    "Classroom recognition",
  );
  const [rosterGamifyBadgeSlug, setRosterGamifyBadgeSlug] = useState("");
  const [rosterGamifyBusy, setRosterGamifyBusy] = useState(false);
  const [rosterGamifySummary, setRosterGamifySummary] = useState<string | null>(
    null,
  );
  const [rosterGamifyError, setRosterGamifyError] = useState<string | null>(null);
  const [removingStudentId, setRemovingStudentId] = useState<string | null>(
    null,
  );
  const [materialLoadingKey, setMaterialLoadingKey] = useState<string | null>(
    null,
  );

  const [showClassroomEditWizard, setShowClassroomEditWizard] = useState(false);
  /** Prevents duplicate edit-dialog opens (e.g. React Strict Mode or re-entrant effects). */
  const consumedClassroomEditQueryRef = useRef<string | null>(null);

  // ── Attendance settings ─────────────────────────────────────────────────
  const [attendanceCfg, setAttendanceCfg] = useState<AttendanceConfig | null>(
    null,
  );
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceSaved, setAttendanceSaved] = useState(false);
  // Per-session attendance records
  const [attendanceSessionId, setAttendanceSessionId] = useState<string>("");
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceCalcRunning, setAttendanceCalcRunning] = useState(false);
  const [attendanceFilter, setAttendanceFilter] = useState<
    "all" | "present" | "absent"
  >("all");
  // ── Session resources ────────────────────────────────────────────────────
  const [resourcesSession, setResourcesSession] =
    useState<ClassroomSessionRecord | null>(null);
  const [resourcesUploading, setResourcesUploading] = useState(false);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [newAssignmentTitle, setNewAssignmentTitle] = useState("");
  const [newAssignmentInstructions, setNewAssignmentInstructions] =
    useState("");
  const [newAssignmentDueAt, setNewAssignmentDueAt] = useState("");
  const [newAssignmentLabId, setNewAssignmentLabId] = useState("");
  const [newAssignmentRequirement, setNewAssignmentRequirement] = useState<
    "none" | "lab" | "assets" | "both"
  >("none");
  const [
    newAssignmentAllowEditAfterSubmit,
    setNewAssignmentAllowEditAfterSubmit,
  ] = useState(false);
  const [addingAssignment, setAddingAssignment] = useState(false);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [assignmentTemplates, setAssignmentTemplates] = useState<
    AssignmentTemplate[]
  >([]);
  const [assignmentTemplatesLoading, setAssignmentTemplatesLoading] =
    useState(false);
  const [selectedAssignmentTemplateId, setSelectedAssignmentTemplateId] =
    useState("");
  const [resourceUploadedAssets, setResourceUploadedAssets] = useState<Asset[]>(
    [],
  );
  const [resourceNameById, setResourceNameById] = useState<
    Record<string, string>
  >({});
  const [resolvingResourceNames, setResolvingResourceNames] = useState(false);
  const [showAssetLibrary, setShowAssetLibrary] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState<Asset[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryTypeFilter, setLibraryTypeFilter] = useState("all");
  const [selectedLibraryAssetId, setSelectedLibraryAssetId] =
    useState<string>("");
  const [attachingAssetId, setAttachingAssetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Student assignment view ──────────────────────────────────────────────
  const [viewingAssignment, setViewingAssignment] =
    useState<AssignmentWorkbench | null>(null);
  const [viewingAssignmentSession, setViewingAssignmentSession] =
    useState<ClassroomSessionRecord | null>(null);
  const [submissionText, setSubmissionText] = useState("");
  const [submissionAssetId, setSubmissionAssetId] = useState<string | null>(
    null,
  );
  const [submissionAssetName, setSubmissionAssetName] = useState<string | null>(
    null,
  );
  const [savedSubmissions, setSavedSubmissions] = useState<SubmissionRecord[]>(
    [],
  );
  const [loadingSavedSubmissions, setLoadingSavedSubmissions] = useState(false);
  const [submittingWork, setSubmittingWork] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [uploadingSubmissionFile, setUploadingSubmissionFile] = useState(false);
  const submissionFileRef = useRef<HTMLInputElement>(null);
  const [labProjectPickerOpen, setLabProjectPickerOpen] = useState(false);
  const [labProjectPickerRows, setLabProjectPickerRows] = useState<
    StudentLabProject[]
  >([]);

  // ── Assignments tab ──────────────────────────────────────────────────────
  const [classroomAssignments, setClassroomAssignments] = useState<
    ClassroomAssignment[]
  >([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  // Instructor: drill into a specific assignment to see its submissions
  const [selectedAssignment, setSelectedAssignment] =
    useState<ClassroomAssignment | null>(null);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<
    SubmissionRecord[]
  >([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  // Grading modal
  const [gradingSubmission, setGradingSubmission] =
    useState<SubmissionRecord | null>(null);
  const [gradeScore, setGradeScore] = useState("100");
  const [gradeFeedback, setGradeFeedback] = useState("");
  const [savingGrade, setSavingGrade] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [gradeRubricRows, setGradeRubricRows] = useState<GradeRubricFormRow[]>(
    [],
  );
  const [assignDrillExpandedId, setAssignDrillExpandedId] = useState<
    string | null
  >(null);

  // ── Submissions tab ─────────────────────────────────────────────────────
  const [subSessionId, setSubSessionId] = useState<string>("");
  const [sessionSubmissionsBoard, setSessionSubmissionsBoard] = useState<
    SubmissionRecord[]
  >([]);
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [subView, setSubView] = useState<"assignments" | "classwork">(
    "assignments",
  );
  const [subBoardSort, setSubBoardSort] = useState<
    "edited_desc" | "edited_asc" | "student"
  >("edited_desc");
  const [subBoardFilter, setSubBoardFilter] = useState<
    "all" | "with_snapshot" | "text_only"
  >("all");
  const [selectedBoardIds, setSelectedBoardIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [boardAction, setBoardAction] = useState("__noop__");
  const [expandedBoardId, setExpandedBoardId] = useState<string | null>(null);
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [draftAction, setDraftAction] = useState("__noop__");
  const [sessionMessages, setSessionMessages] = useState<
    Array<{
      id: string;
      sender: "instructor" | "student";
      text: string;
      at: string;
    }>
  >([
    {
      id: "m1",
      sender: "instructor",
      text: "Welcome! Please open the starter lab.",
      at: new Date().toISOString(),
    },
  ]);

  const isInstructorView =
    isSuperAdmin ||
    role === "admin" ||
    role === "owner" ||
    role === "instructor";
  const inlineSessionWorkspaceEnabled = false;
  const tabs: { id: TabId; label: string }[] = useMemo(
    () =>
      isInstructorView
        ? [
            { id: "students", label: "Students" },
            { id: "sessions", label: "Sessions" },
            { id: "assignments", label: "Assignments" },
            { id: "submissions", label: "Submissions" },
            { id: "attendance", label: "Attendance" },
          ]
        : [
            { id: "sessions", label: "Sessions" },
            { id: "assignments", label: "Assignments" },
          ],
    [isInstructorView],
  );

  const pointsEnabled = useMemo(() => {
    const settings = tenant?.settings as Record<string, unknown> | undefined;
    const gamification = (settings?.gamification ?? {}) as Record<
      string,
      unknown
    >;
    return Boolean(gamification.points_enabled ?? settings?.points_enabled);
  }, [tenant?.settings]);

  useEffect(() => {
    if (!gradingSubmission) {
      setGradeRubricRows([]);
      return;
    }
    setGradeScore(
      gradingSubmission.grade != null
        ? String(gradingSubmission.grade)
        : "100",
    );
    setGradeFeedback(gradingSubmission.feedback ?? "");
    if (gradingSubmission.rubric?.length) {
      setGradeRubricRows(
        gradingSubmission.rubric.map((r) => ({
          id: newRubricRowId(),
          criterion_id: r.criterion_id,
          label: r.label ?? "",
          max_points: String(r.max_points),
          points_awarded: String(r.points_awarded),
        })),
      );
    } else {
      setGradeRubricRows([]);
    }
  }, [gradingSubmission]);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [klass, classSessions, classStudents] = await Promise.all([
          isInstructorView ? getClassroom(id) : getMyClassroom(id),
          isInstructorView
            ? listClassroomSessions(id)
            : listMyClassroomSessions(id),
          isInstructorView ? listClassroomRoster(id) : Promise.resolve([]),
        ]);
        if (!mounted) return;
        setClassroom(klass);
        setSessions(classSessions);
        setStudents(classStudents);
        // Hydrate attendance config from classroom settings
        const raw = (klass.settings as Record<string, unknown> | undefined)
          ?.attendance;
        setAttendanceCfg(
          raw && typeof raw === "object" ? (raw as AttendanceConfig) : null,
        );
      } catch (e: unknown) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load classroom");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [id, isInstructorView]);

  const refreshSessions = useCallback(async () => {
    if (!id) return;
    try {
      const updated = await (isInstructorView
        ? listClassroomSessions(id)
        : listMyClassroomSessions(id));
      setSessions(updated);
    } catch {
      // silently ignore — stale data is better than a crash
    }
  }, [id, isInstructorView]);

  const tenantId = tenant?.id ?? user?.tenantId;
  useTenantRealtime({
    tenantId,
    enabled: Boolean(user && tenantId),
    onSessionsInvalidate: refreshSessions,
  });

  const handleSaveAttendanceSettings = async () => {
    if (!id || !classroom) return;
    setAttendanceSaving(true);
    try {
      const existingSettings = classroom.settings ?? {};
      const settings = attendanceCfg
        ? { ...existingSettings, attendance: attendanceCfg }
        : { ...existingSettings, attendance: undefined };
      const updated = await updateClassroom(id, { settings });
      setClassroom(updated);
      setAttendanceSaved(true);
      setTimeout(() => setAttendanceSaved(false), 2500);
    } catch {
      // ignore
    } finally {
      setAttendanceSaving(false);
    }
  };

  const handleLoadAttendanceRecords = async (sessionId: string) => {
    if (!id || !sessionId) return;
    setAttendanceLoading(true);
    try {
      const records = await getSessionAttendance(id, sessionId);
      setAttendanceRecords(records);
    } catch {
      setAttendanceRecords([]);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleRecalculateAttendance = async (sessionId: string) => {
    if (!id || !sessionId) return;
    setAttendanceCalcRunning(true);
    try {
      const records = await calculateSessionAttendance(id, sessionId);
      setAttendanceRecords(records);
    } catch {
      // ignore
    } finally {
      setAttendanceCalcRunning(false);
    }
  };

  useEffect(() => {
    if (!waitingSessionId) return;
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waitingSessionId]);

  const chronologicalSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(a.session_start).getTime() -
          new Date(b.session_start).getTime(),
      ),
    [sessions],
  );
  const latestFirstSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(b.session_start).getTime() -
          new Date(a.session_start).getTime(),
      ),
    [sessions],
  );

  const activeSession = useMemo(
    () => chronologicalSessions.find((s) => isLiveSession(s)) ?? null,
    [chronologicalSessions],
  );

  useEffect(() => {
    if (activeSession) {
      setWaitingForClassStart(false);
      setWaitingSessionId(null);
    }
  }, [activeSession]);

  const waitingSession = useMemo(
    () => chronologicalSessions.find((s) => s.id === waitingSessionId) ?? null,
    [chronologicalSessions, waitingSessionId],
  );
  const nextScheduledSession = useMemo(
    () =>
      chronologicalSessions.find(
        (s) =>
          s.status !== "canceled" &&
          s.status !== "completed" &&
          new Date(s.session_start).getTime() > Date.now(),
      ) ?? null,
    [chronologicalSessions],
  );

  const filteredLatestSessions = useMemo(() => {
    const startBoundary = sessionFilterStart
      ? new Date(`${sessionFilterStart}T00:00:00`).getTime()
      : null;
    const endBoundary = sessionFilterEnd
      ? new Date(`${sessionFilterEnd}T23:59:59`).getTime()
      : null;
    return latestFirstSessions.filter((session) => {
      const startMs = new Date(session.session_start).getTime();
      if (startBoundary != null && startMs < startBoundary) return false;
      if (endBoundary != null && startMs > endBoundary) return false;
      return true;
    });
  }, [latestFirstSessions, sessionFilterStart, sessionFilterEnd]);

  const sessionsPerPageValue = useMemo(() => {
    const parsed = Number(sessionsPerPage);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
  }, [sessionsPerPage]);

  const totalSessionPages = Math.max(
    1,
    Math.ceil(filteredLatestSessions.length / sessionsPerPageValue),
  );

  const pagedSessions = useMemo(() => {
    const startIdx = (sessionPage - 1) * sessionsPerPageValue;
    return filteredLatestSessions.slice(
      startIdx,
      startIdx + sessionsPerPageValue,
    );
  }, [filteredLatestSessions, sessionPage, sessionsPerPageValue]);

  useEffect(() => {
    setSessionPage(1);
  }, [sessionFilterStart, sessionFilterEnd, sessionsPerPage]);

  useEffect(() => {
    if (sessionPage > totalSessionPages) {
      setSessionPage(totalSessionPages);
    }
  }, [sessionPage, totalSessionPages]);

  const permittedLabs = useMemo(() => {
    const schedule = (classroom?.schedule ?? {}) as {
      permitted_labs?: string[];
    };
    return schedule.permitted_labs ?? [];
  }, [classroom?.schedule]);

  useEffect(() => {
    if (permittedLabs.length && !selectedSessionLab) {
      setSelectedSessionLab(permittedLabs[0]);
    }
  }, [permittedLabs, selectedSessionLab]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get("tab");
    if (
      (tabParam === "students" ||
        tabParam === "sessions" ||
        tabParam === "submissions" ||
        tabParam === "attendance" ||
        tabParam === "assignments") &&
      tabs.some((tab) => tab.id === tabParam)
    ) {
      setActiveTab(tabParam);
      return;
    }
    setActiveTab("sessions");
  }, [location.search, tabs]);

  // Auto-open edit dialog when navigated here with ?action=edit (once per query)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("action") !== "edit") {
      consumedClassroomEditQueryRef.current = null;
      return;
    }
    if (!classroom || !isInstructorView) return;
    const signature = `${id ?? ""}::${location.search}`;
    if (consumedClassroomEditQueryRef.current === signature) return;
    consumedClassroomEditQueryRef.current = signature;
    setShowClassroomEditWizard(true);
    navigate(location.pathname, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroom, location.search, id, isInstructorView, location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get("sessionAction");
    if (!action) return;
    const clearParams = () => navigate(location.pathname, { replace: true });
    if (action === "start" && isInstructorView) {
      void handleStartSession().finally(clearParams);
      return;
    }
    if (action === "join") {
      setActiveTab("sessions");
      if (activeSession && id) {
        navigate(`/app/classrooms/${id}/live`);
        return;
      } else if (isInstructorView && nextScheduledSession) {
        setWaitingSessionId(nextScheduledSession.id);
        setWaitingForClassStart(false);
      } else if (isInstructorView) {
        setWaitingSessionId(null);
        setWaitingForClassStart(true);
      } else {
        setWaitingSessionId(null);
        setWaitingForClassStart(false);
      }
      clearParams();
      return;
    }
    if (action === "waiting" && isInstructorView) {
      setActiveTab("sessions");
      if (nextScheduledSession) {
        setWaitingSessionId(nextScheduledSession.id);
        setWaitingForClassStart(false);
      } else {
        setWaitingSessionId(null);
        setWaitingForClassStart(true);
      }
      clearParams();
    }
  }, [
    location.search,
    location.pathname,
    navigate,
    isInstructorView,
    activeSession,
    id,
    nextScheduledSession,
  ]);

  useEffect(() => {
    if (
      !inlineSessionWorkspaceEnabled ||
      !isInstructorView ||
      !id ||
      !activeSession
    ) {
      setPresenceSummary(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const summary = await getClassroomSessionPresence(id, activeSession.id);
        if (!cancelled) setPresenceSummary(summary);
      } catch {
        if (!cancelled) setPresenceSummary(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, activeSession?.id, inlineSessionWorkspaceEnabled, isInstructorView]);

  useEffect(() => {
    if (
      !inlineSessionWorkspaceEnabled ||
      !isInstructorView ||
      !id ||
      !activeSession ||
      activeTab !== "sessions"
    )
      return;
    let stopped = false;
    const sendHeartbeat = (status: "active" | "left" = "active") => {
      void heartbeatClassroomSession(id, activeSession.id, status)
        .then((summary) => {
          if (!stopped) setPresenceSummary(summary);
        })
        .catch(() => {
          if (!stopped && status === "active") {
            setPresenceSummary(null);
          }
        });
    };
    sendHeartbeat("active");
    const timer = window.setInterval(() => sendHeartbeat("active"), 30_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      void heartbeatClassroomSession(id, activeSession.id, "left").catch(
        () => {},
      );
    };
  }, [
    id,
    activeSession?.id,
    activeTab,
    inlineSessionWorkspaceEnabled,
    isInstructorView,
  ]);

  useEffect(() => {
    const anyDialogOpen =
      showEndDialog ||
      showEnrollDialog ||
      showClassroomEditWizard ||
      Boolean(resourcesSession) ||
      showAssignmentForm ||
      showAssetLibrary ||
      Boolean(viewingAssignment && viewingAssignmentSession) ||
      Boolean(gradingSubmission) ||
      Boolean(rosterGamifyModal);
    if (!anyDialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (rosterGamifyModal) {
        if (!rosterGamifyBusy) {
          setRosterGamifyModal(null);
          setRosterGamifyTargets([]);
          setRosterGamifyBusy(false);
          setRosterGamifyError(null);
          setRosterGamifySummary(null);
        }
        return;
      }
      if (gradingSubmission) {
        if (!savingGrade) {
          setGradingSubmission(null);
          setGradeError(null);
        }
        return;
      }
      if (showAssetLibrary) {
        if (!attachingAssetId) setShowAssetLibrary(false);
        return;
      }
      if (showAssignmentForm) {
        if (!addingAssignment) setShowAssignmentForm(false);
        return;
      }
      if (viewingAssignment && viewingAssignmentSession) {
        if (!submittingWork) {
          setViewingAssignment(null);
          setViewingAssignmentSession(null);
        }
        return;
      }
      if (resourcesSession) {
        if (!resourcesUploading) setResourcesSession(null);
        return;
      }
      if (showClassroomEditWizard) {
        setShowClassroomEditWizard(false);
        return;
      }
      if (showEnrollDialog) {
        if (!enrollingStudent) setShowEnrollDialog(false);
        return;
      }
      if (showEndDialog) {
        if (!endingSession) setShowEndDialog(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    showEndDialog,
    endingSession,
    showEnrollDialog,
    enrollingStudent,
    showClassroomEditWizard,
    resourcesSession,
    resourcesUploading,
    showAssignmentForm,
    addingAssignment,
    showAssetLibrary,
    attachingAssetId,
    viewingAssignment,
    viewingAssignmentSession,
    submittingWork,
    gradingSubmission,
    savingGrade,
    rosterGamifyModal,
    rosterGamifyBusy,
  ]);

  const enrolledStudentIds = useMemo(
    () => new Set(students.map((s) => s.id)),
    [students],
  );

  useEffect(() => {
    setRosterSelectedIds((prev) => {
      const next = new Set<string>();
      for (const sid of prev) {
        if (enrolledStudentIds.has(sid)) next.add(sid);
      }
      return next;
    });
  }, [enrolledStudentIds]);

  useEffect(() => {
    if (!isInstructorView || activeTab !== "students") return;
    let cancelled = false;
    setRosterBadgesLoading(true);
    listBadges()
      .then((rows) => {
        if (!cancelled) setRosterBadgeOptions(rows);
      })
      .catch(() => {
        if (!cancelled) setRosterBadgeOptions([]);
      })
      .finally(() => {
        if (!cancelled) setRosterBadgesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isInstructorView, activeTab]);

  const openRosterGamifyModal = useCallback(
    (mode: "xp" | "assign" | "revoke", ids: string[]) => {
      const unique = [...new Set(ids)].filter((sid) =>
        enrolledStudentIds.has(sid),
      );
      if (unique.length === 0) return;
      setRosterGamifyError(null);
      setRosterGamifySummary(null);
      setRosterGamifyTargets(unique);
      setRosterGamifyModal(mode);
      if (mode === "assign" || mode === "revoke") {
        setRosterGamifyBadgeSlug((prev) => {
          const match = rosterBadgeOptions.some((b) => b.slug === prev);
          if (match) return prev;
          return rosterBadgeOptions[0]?.slug ?? "";
        });
      }
    },
    [enrolledStudentIds, rosterBadgeOptions],
  );

  const closeRosterGamifyModal = useCallback(() => {
    setRosterGamifyModal(null);
    setRosterGamifyTargets([]);
    setRosterGamifyBusy(false);
    setRosterGamifyError(null);
    setRosterGamifySummary(null);
  }, []);

  const applyRosterXp = useCallback(async () => {
    const amount = Number.parseInt(rosterGamifyXpAmount, 10);
    if (!Number.isFinite(amount) || amount < 1 || amount > 10_000) {
      setRosterGamifyError("Enter a valid XP amount (1–10000).");
      return;
    }
    const reason = rosterGamifyXpReason.trim();
    if (!reason) {
      setRosterGamifyError("Add a short reason for the XP award.");
      return;
    }
    setRosterGamifyBusy(true);
    setRosterGamifyError(null);
    let ok = 0;
    const errors: string[] = [];
    for (const sid of rosterGamifyTargets) {
      try {
        await awardXP({
          student_id: sid,
          amount,
          reason,
          source: "manual",
        });
        ok += 1;
      } catch (e: unknown) {
        errors.push(e instanceof Error ? e.message : "Failed");
      }
    }
    setRosterGamifyBusy(false);
    setRosterGamifySummary(
      `Awarded XP to ${ok} of ${rosterGamifyTargets.length} student(s).`,
    );
    if (errors.length) {
      setRosterGamifyError(
        errors.slice(0, 3).join(" · ") + (errors.length > 3 ? "…" : ""),
      );
    }
  }, [rosterGamifyTargets, rosterGamifyXpAmount, rosterGamifyXpReason]);

  const applyRosterAssignBadges = useCallback(async () => {
    const slug = rosterGamifyBadgeSlug.trim();
    if (!slug) {
      setRosterGamifyError("Choose a badge.");
      return;
    }
    setRosterGamifyBusy(true);
    setRosterGamifyError(null);
    let ok = 0;
    const errors: string[] = [];
    for (const sid of rosterGamifyTargets) {
      try {
        await awardBadge({ student_id: sid, badge_slug: slug });
        ok += 1;
      } catch (e: unknown) {
        errors.push(e instanceof Error ? e.message : "Failed");
      }
    }
    setRosterGamifyBusy(false);
    setRosterGamifySummary(
      `Badge applied for ${ok} of ${rosterGamifyTargets.length} student(s). Others may already have it.`,
    );
    if (errors.length) {
      setRosterGamifyError(errors.slice(0, 2).join(" · "));
    }
  }, [rosterGamifyTargets, rosterGamifyBadgeSlug]);

  const applyRosterRevokeBadges = useCallback(async () => {
    const slug = rosterGamifyBadgeSlug.trim();
    if (!slug) {
      setRosterGamifyError("Choose a badge to remove.");
      return;
    }
    setRosterGamifyBusy(true);
    setRosterGamifyError(null);
    let ok = 0;
    const errors: string[] = [];
    for (const sid of rosterGamifyTargets) {
      try {
        await revokeBadge({ student_id: sid, badge_slug: slug });
        ok += 1;
      } catch (e: unknown) {
        errors.push(e instanceof Error ? e.message : "Failed");
      }
    }
    setRosterGamifyBusy(false);
    setRosterGamifySummary(
      `Removed badge for ${ok} of ${rosterGamifyTargets.length} student(s) (where it existed).`,
    );
    if (errors.length) {
      setRosterGamifyError(errors.slice(0, 2).join(" · "));
    }
  }, [rosterGamifyTargets, rosterGamifyBadgeSlug]);

  useEffect(() => {
    if (activeTab !== "assignments" || !id) return;
    let mounted = true;
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    setClassroomAssignments([]);
    setSelectedAssignment(null);
    listClassroomAssignments(id)
      .then((items) => {
        if (mounted) setClassroomAssignments(items);
      })
      .catch((e: unknown) => {
        if (mounted)
          setAssignmentsError(
            e instanceof Error ? e.message : "Failed to load assignments",
          );
      })
      .finally(() => {
        if (mounted) setAssignmentsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeTab, id]);

  useEffect(() => {
    if (!selectedAssignment || !id) return;
    let mounted = true;
    setSubmissionsLoading(true);
    setAssignmentSubmissions([]);
    listSessionSubmissions(
      id,
      selectedAssignment.session_id,
      selectedAssignment.id,
    )
      .then((items) => {
        if (mounted) setAssignmentSubmissions(items);
      })
      .catch(() => {
        if (mounted) setAssignmentSubmissions([]);
      })
      .finally(() => {
        if (mounted) setSubmissionsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [selectedAssignment, id]);

  useEffect(() => {
    setAssignDrillExpandedId(null);
  }, [selectedAssignment?.id, selectedAssignment?.session_id]);

  useEffect(() => {
    setSelectedDraftIds(new Set());
  }, [viewingAssignment?.id, viewingAssignmentSession?.id]);

  useEffect(() => {
    if (activeTab !== "submissions" || !subSessionId || !id) return;
    let mounted = true;
    setSubLoading(true);
    setSubError(null);
    setSessionSubmissionsBoard([]);
    setSelectedBoardIds(new Set());
    setExpandedBoardId(null);
    void listSessionSubmissions(id, subSessionId)
      .then((rows) => {
        if (mounted) setSessionSubmissionsBoard(rows);
      })
      .catch((e: unknown) => {
        if (mounted)
          setSubError(
            e instanceof Error ? e.message : "Failed to load submissions",
          );
      })
      .finally(() => {
        if (mounted) setSubLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeTab, id, subSessionId]);

  const availableStudents = useMemo(
    () => allStudents.filter((student) => !enrolledStudentIds.has(student.id)),
    [allStudents, enrolledStudentIds],
  );

  const studentDropdownOptions = useMemo(
    () =>
      availableStudents.map((student) => {
        const name =
          student.display_name ||
          `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() ||
          "Unnamed student";
        const subtitle = student.email ? ` - ${student.email}` : "";
        return {
          value: student.id,
          label: `${name}${subtitle}`,
        };
      }),
    [availableStudents],
  );

  const handleStartSession = async () => {
    if (!id || !classroom) return;
    if (!isInstructorView) return;
    if (activeSession) {
      navigate(`/app/classrooms/${id}/live`);
      return;
    }
    setStartingSession(true);
    setError(null);
    try {
      const start = new Date();
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const created = await createClassroomSession(id, {
        session_start: start.toISOString(),
        session_end: end.toISOString(),
        meeting_link: classroom.meeting_link ?? undefined,
        notes: "Started from instructor classroom view",
      });
      const refreshed = await listClassroomSessions(id);
      setSessions(refreshed.length ? refreshed : [created]);
      setActiveTab("sessions");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start session");
    } finally {
      setStartingSession(false);
    }
  };

  const openLab = () => {
    const lab = selectedSessionLab || permittedLabs[0];
    if (!lab) {
      navigate("/app/labs");
      return;
    }
    navigate(
      buildLabLaunchPath(lab, {
        classroomId: id,
        sessionId: activeSession?.id,
        referrer: "classroom_detail_session",
      }),
    );
  };

  const sendMessage = (sender: "instructor" | "student") => {
    const text = messageInput.trim();
    if (!text) return;
    setSessionMessages((prev) => [
      ...prev,
      { id: `m-${Date.now()}`, sender, text, at: new Date().toISOString() },
    ]);
    setMessageInput("");
  };

  const handleOpenEndDialog = async () => {
    if (!id || !activeSession) return;
    if (!isInstructorView) return;
    setOpeningEndDialog(true);
    setError(null);
    try {
      const summary = await getClassroomSessionPresence(id, activeSession.id);
      setPresenceSummary(summary);
      setForceEndRequired(summary.active_students > 0);
      setShowEndDialog(true);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to check session participants",
      );
    } finally {
      setOpeningEndDialog(false);
    }
  };

  const openSessionMaterial = async (sessionId: string, assetId: string) => {
    if (!id) return;
    const key = `${sessionId}:${assetId}`;
    setMaterialLoadingKey(key);
    try {
      const asset = await getStudentSessionAssetById(
        id,
        sessionId,
        assetId,
        900,
      );
      if (!asset.blob_url) throw new Error("Material is not available yet.");
      window.open(asset.blob_url, "_blank", "noopener");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to open material");
    } finally {
      setMaterialLoadingKey(null);
    }
  };

  const handleOpenEnrollDialog = async () => {
    if (!isInstructorView) return;
    setShowEnrollDialog(true);
    setEnrollError(null);
    setSelectedStudentId("");
    setLoadingStudentsForEnroll(true);
    try {
      const studentsList = await listStudents({ limit: 500, is_active: true });
      setAllStudents(studentsList);
      const firstAvailable = studentsList.find(
        (student) => !enrolledStudentIds.has(student.id),
      );
      if (firstAvailable) {
        setSelectedStudentId(firstAvailable.id);
      }
    } catch (e: unknown) {
      setEnrollError(
        e instanceof Error ? e.message : "Failed to load students",
      );
    } finally {
      setLoadingStudentsForEnroll(false);
    }
  };

  const handleConfirmEnrollStudent = async () => {
    if (!id || !selectedStudentId) return;
    if (!isInstructorView) return;
    setEnrollingStudent(true);
    setEnrollError(null);
    try {
      await enrollClassroomStudent(id, selectedStudentId);
      const refreshedRoster = await listClassroomRoster(id);
      setStudents(refreshedRoster);
      setShowEnrollDialog(false);
      setSelectedStudentId("");
    } catch (e: unknown) {
      setEnrollError(e instanceof Error ? e.message : "Failed to add student");
    } finally {
      setEnrollingStudent(false);
    }
  };

  const handleRemoveStudent = async (student: ClassroomRosterStudentRecord) => {
    if (!id) return;
    if (!isInstructorView) return;
    const studentName =
      student.display_name ||
      `${student.first_name} ${student.last_name}`.trim() ||
      "this student";
    const confirmed = window.confirm(
      `Remove ${studentName} from this classroom?`,
    );
    if (!confirmed) return;
    setRemovingStudentId(student.id);
    setEnrollError(null);
    try {
      await unenrollClassroomStudent(id, student.id);
      const refreshedRoster = await listClassroomRoster(id);
      setStudents(refreshedRoster);
    } catch (e: unknown) {
      setEnrollError(
        e instanceof Error ? e.message : "Failed to remove student",
      );
    } finally {
      setRemovingStudentId(null);
    }
  };

  const handleConfirmEndSession = async () => {
    if (!id || !activeSession) return;
    if (!isInstructorView) return;
    setEndingSession(true);
    setError(null);
    try {
      await endClassroomSession(id, activeSession.id, forceEndRequired);
      const refreshed = await listClassroomSessions(id);
      setSessions(refreshed);
      setPresenceSummary(null);
      setShowEndDialog(false);
      setWaitingSessionId(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to end session";
      setError(message);
      if (
        message.includes("student") &&
        message.includes("Confirm end for all")
      ) {
        setForceEndRequired(true);
        setShowEndDialog(true);
      }
    } finally {
      setEndingSession(false);
    }
  };

  const countdownText = useMemo(() => {
    if (!waitingSession) return "";
    const startMs = new Date(waitingSession.session_start).getTime();
    const remaining = Math.max(0, startMs - clockMs);
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  }, [waitingSession, clockMs]);

  // ── Session resources handlers ───────────────────────────────────────────
  const getContentWindowDeadline = (
    session: ClassroomSessionRecord,
  ): Date | null => {
    if (!session.session_end) return null;
    const windowHours = Number(
      ((classroom?.schedule ?? {}) as Record<string, unknown>)
        .content_window_hours ?? 48,
    );
    return new Date(
      new Date(session.session_end).getTime() + windowHours * 3_600_000,
    );
  };

  const isContentWindowOpen = (session: ClassroomSessionRecord): boolean => {
    if (session.status === "active") return true;
    const deadline = getContentWindowDeadline(session);
    if (!deadline) return true;
    return Date.now() < deadline.getTime();
  };

  const handleOpenResources = async (session: ClassroomSessionRecord) => {
    setResourcesSession(session);
    setResourcesError(null);
    setShowAssignmentForm(false);
    setNewAssignmentTitle("");
    setNewAssignmentInstructions("");
    setNewAssignmentDueAt("");
    setSelectedAssignmentTemplateId("");
    setNewAssignmentRequirement("none");
    setNewAssignmentAllowEditAfterSubmit(false);
    setResourceUploadedAssets([]);
    setShowAssetLibrary(false);
    setLibrarySearch("");
    setLibraryTypeFilter("all");
    setSelectedLibraryAssetId("");
    const sharedIds = session.session_content?.shared_asset_ids ?? [];
    const downloadIds = session.session_content?.downloadable_asset_ids ?? [];
    const allIds = Array.from(new Set([...sharedIds, ...downloadIds]));
    if (allIds.length === 0) return;
    setResolvingResourceNames(true);
    const namedEntries = Object.fromEntries(
      (session.session_content?.resource_entries ?? [])
        .filter((entry) => Boolean(entry.asset_id && entry.name))
        .map((entry) => [entry.asset_id, String(entry.name)]),
    );
    if (Object.keys(namedEntries).length > 0) {
      setResourceNameById((prev) => ({ ...prev, ...namedEntries }));
    }
    try {
      const library = await getAssetLibrary();
      const globalAsAssets: Asset[] = (
        library.global_assets as GlobalAsset[]
      ).map((asset) => ({
        ...asset,
        owner_type: "global",
        mime_type: null,
        blob_url: null,
        thumbnail_url: null,
      }));
      const merged = [...library.own, ...library.shared, ...globalAsAssets];
      const byId = new Map(merged.map((asset) => [asset.id, asset]));
      const resolved: Asset[] = allIds
        .map((assetId) => byId.get(assetId))
        .filter((asset): asset is Asset => Boolean(asset));
      const missing = allIds.filter((assetId) => !byId.has(assetId));
      if (missing.length > 0) {
        const fetched = await Promise.all(
          missing.map(async (assetId) => {
            try {
              return await getAssetById(assetId, 300);
            } catch {
              return null;
            }
          }),
        );
        for (const asset of fetched) {
          if (asset) resolved.push(asset);
        }
      }
      setResourceUploadedAssets(
        Array.from(
          new Map(resolved.map((asset) => [asset.id, asset])).values(),
        ),
      );
      const resolvedNames = Object.fromEntries(
        resolved
          .filter((asset) => Boolean(asset.name))
          .map((asset) => [asset.id, asset.name]),
      );
      if (Object.keys(resolvedNames).length > 0) {
        setResourceNameById((prev) => ({ ...prev, ...resolvedNames }));
      }
    } catch {
      // keep best-effort behavior; resources still render via metadata/id fallback
    }
    try {
      const fetchedNames = await Promise.all(
        allIds.map(async (assetId) => {
          try {
            if (isInstructorView) {
              const asset = await getAssetById(assetId, 300);
              return asset?.name ? [assetId, asset.name] : null;
            }
            if (id) {
              const asset = await getStudentSessionAssetById(
                id,
                session.id,
                assetId,
                300,
              );
              return asset?.name ? [assetId, asset.name] : null;
            }
            return null;
          } catch {
            return null;
          }
        }),
      );
      const directNames = Object.fromEntries(
        fetchedNames.filter((item): item is [string, string] => Boolean(item)),
      );
      if (Object.keys(directNames).length > 0) {
        setResourceNameById((prev) => ({ ...prev, ...directNames }));
      }
    } catch {
      // non-fatal resolution path
    } finally {
      setResolvingResourceNames(false);
    }
  };

  const buildResourceEntry = (
    asset: Asset,
    source: "upload" | "library",
  ): SessionResourceEntry => ({
    asset_id: asset.id,
    name: asset.name,
    source,
    attached_by_id: user?.id ?? null,
    attached_by_type: user?.subType ?? "user",
    attached_by_name:
      `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
      user?.email ||
      "Instructor",
    attached_at: new Date().toISOString(),
  });

  const attachAssetToSession = async (
    asset: Asset,
    source: "upload" | "library",
  ) => {
    if (!id || !resourcesSession) return;
    const currentShared =
      resourcesSession.session_content?.shared_asset_ids ?? [];
    const currentResources =
      resourcesSession.session_content?.resource_entries ?? [];
    const nextShared = Array.from(new Set([...currentShared, asset.id]));
    const nextResources = [
      ...currentResources.filter((entry) => entry.asset_id !== asset.id),
      buildResourceEntry(asset, source),
    ];
    const updated = await updateClassroomSessionContent(
      id,
      resourcesSession.id,
      {
        shared_asset_ids: nextShared,
        resource_entries: nextResources,
      },
    );
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setResourcesSession(updated);
    setResourceUploadedAssets((prev) => {
      const dedup = prev.filter((item) => item.id !== asset.id);
      return [...dedup, asset];
    });
    setResourceNameById((prev) => ({ ...prev, [asset.id]: asset.name }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || !resourcesSession) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setResourcesUploading(true);
    setResourcesError(null);
    try {
      const asset = await uploadAsset({
        file,
        name: file.name,
        asset_type: inferAssetTypeFromFile(file),
        owner_type: "tenant",
      });
      await attachAssetToSession(asset, "upload");
    } catch (e: unknown) {
      setResourcesError(
        e instanceof Error ? e.message : "Failed to upload file",
      );
    } finally {
      setResourcesUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpenAssetLibrary = async () => {
    setShowAssetLibrary(true);
    if (libraryAssets.length > 0) return;
    setLibraryLoading(true);
    setResourcesError(null);
    try {
      const library = await getAssetLibrary();
      const globalAsAssets: Asset[] = (
        library.global_assets as GlobalAsset[]
      ).map((asset) => ({
        ...asset,
        owner_type: "global",
        mime_type: null,
        blob_url: null,
        thumbnail_url: null,
      }));
      const tenantAndShared = [
        ...library.own,
        ...library.shared,
        ...globalAsAssets,
      ];
      const deduped = Array.from(
        new Map(tenantAndShared.map((asset) => [asset.id, asset])).values(),
      );
      deduped.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setLibraryAssets(deduped);
    } catch (e: unknown) {
      setResourcesError(
        e instanceof Error ? e.message : "Failed to fetch tenant assets",
      );
    } finally {
      setLibraryLoading(false);
    }
  };

  const handleAttachLibraryAsset = async (asset: Asset) => {
    setAttachingAssetId(asset.id);
    setResourcesError(null);
    try {
      await attachAssetToSession(asset, "library");
    } catch (e: unknown) {
      setResourcesError(
        e instanceof Error ? e.message : "Failed to attach asset",
      );
    } finally {
      setAttachingAssetId(null);
    }
  };

  const handleConfirmAttachLibraryAsset = async () => {
    const selected = libraryAssets.find(
      (asset) => asset.id === selectedLibraryAssetId,
    );
    if (!selected) return;
    await handleAttachLibraryAsset(selected);
    setShowAssetLibrary(false);
    setSelectedLibraryAssetId("");
  };

  const loadAssignmentTemplateOptions = async () => {
    setAssignmentTemplatesLoading(true);
    try {
      const courseId = classroom?.curriculum_id ?? undefined;
      const rows = await listAssignmentTemplates({
        limit: 300,
        ...(courseId ? { course_id: courseId } : {}),
      });
      setAssignmentTemplates(rows);
    } catch {
      // Keep dialog usable for custom assignments even if template fetch fails.
      setAssignmentTemplates([]);
    } finally {
      setAssignmentTemplatesLoading(false);
    }
  };

  const openAssignmentForm = () => {
    setNewAssignmentRequirement("none");
    setNewAssignmentLabId(selectedSessionLab || permittedLabs[0] || "");
    setNewAssignmentAllowEditAfterSubmit(false);
    setNewAssignmentTitle("");
    setNewAssignmentInstructions("");
    setNewAssignmentDueAt("");
    setSelectedAssignmentTemplateId("");
    setShowAssignmentForm(true);
    void loadAssignmentTemplateOptions();
  };

  const handleAddTextAssignment = async () => {
    if (!id || !resourcesSession) return;
    if (selectedAssignmentTemplateId) {
      setAddingAssignment(true);
      setResourcesError(null);
      try {
        await createSessionAssignmentFromTemplate(id, resourcesSession.id, {
          template_id: selectedAssignmentTemplateId,
          due_at: newAssignmentDueAt
            ? new Date(newAssignmentDueAt).toISOString()
            : null,
          title: newAssignmentTitle.trim() || null,
        });
        const refreshed = await listClassroomSessions(id);
        setSessions(refreshed);
        const assignmentRows = await listClassroomAssignments(id);
        setClassroomAssignments(assignmentRows);
        setResourcesSession(
          refreshed.find((s) => s.id === resourcesSession.id) ?? null,
        );
        setShowAssignmentForm(false);
        setSelectedAssignmentTemplateId("");
        setNewAssignmentTitle("");
        setNewAssignmentInstructions("");
        setNewAssignmentDueAt("");
      } catch (e: unknown) {
        setResourcesError(
          e instanceof Error ? e.message : "Failed to add assignment",
        );
      } finally {
        setAddingAssignment(false);
      }
      return;
    }
    if (!isContentWindowOpen(resourcesSession)) {
      setResourcesError(
        "This session is closed for manual edits. Select an existing template to add an assignment.",
      );
      return;
    }
    if (!newAssignmentTitle.trim()) return;
    const requiresLab =
      newAssignmentRequirement === "lab" || newAssignmentRequirement === "both";
    const requiresAssets =
      newAssignmentRequirement === "assets" ||
      newAssignmentRequirement === "both";
    if (requiresLab && !newAssignmentLabId) {
      setResourcesError("Select a lab when this assignment requires lab work.");
      return;
    }
    setAddingAssignment(true);
    setResourcesError(null);
    try {
      const newAssignment: SessionTextAssignment = {
        id: crypto.randomUUID ? crypto.randomUUID() : `assign-${Date.now()}`,
        title: newAssignmentTitle.trim(),
        instructions: newAssignmentInstructions.trim() || null,
        due_at: newAssignmentDueAt
          ? new Date(newAssignmentDueAt).toISOString()
          : null,
        lab_id: newAssignmentLabId || null,
        requires_lab: requiresLab,
        requires_assets: requiresAssets,
        allow_edit_after_submit: newAssignmentAllowEditAfterSubmit,
      };
      const currentAssignments =
        resourcesSession.session_content?.text_assignments ?? [];
      const updated = await updateClassroomSessionContent(
        id,
        resourcesSession.id,
        {
          text_assignments: [...currentAssignments, newAssignment],
        },
      );
      setSessions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
      const assignmentRows = await listClassroomAssignments(id);
      setClassroomAssignments(assignmentRows);
      setResourcesSession(updated);
      setNewAssignmentTitle("");
      setNewAssignmentInstructions("");
      setNewAssignmentDueAt("");
      setNewAssignmentLabId("");
      setNewAssignmentRequirement("none");
      setNewAssignmentAllowEditAfterSubmit(false);
      setShowAssignmentForm(false);
    } catch (e: unknown) {
      setResourcesError(
        e instanceof Error ? e.message : "Failed to add assignment",
      );
    } finally {
      setAddingAssignment(false);
    }
  };

  const handleRemoveTextAssignment = async (assignmentId: string) => {
    if (!id || !resourcesSession) return;
    setResourcesError(null);
    try {
      const remaining = (
        resourcesSession.session_content?.text_assignments ?? []
      ).filter((a) => a.id !== assignmentId);
      const updated = await updateClassroomSessionContent(
        id,
        resourcesSession.id,
        {
          text_assignments: remaining,
        },
      );
      setSessions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
      setResourcesSession(updated);
    } catch (e: unknown) {
      setResourcesError(
        e instanceof Error ? e.message : "Failed to remove assignment",
      );
    }
  };

  // ── Student assignment view handlers ────────────────────────────────────
  const handleOpenAssignment = (
    assignment: AssignmentWorkbench,
    session: ClassroomSessionRecord,
  ) => {
    setViewingAssignment(assignment);
    setViewingAssignmentSession(session);
    setSubmissionText("");
    setSubmissionAssetId(null);
    setSubmissionAssetName(null);
    setSubmitError(null);
    setSubmitSuccess(false);
    setSavedSubmissions([]);
    setLabProjectPickerOpen(false);
    setLabProjectPickerRows([]);
  };

  const parseSubmissionPayload = (
    raw: string,
  ): {
    note: string;
    labId: string | null;
    assetId: string | null;
    assetName: string | null;
  } => {
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      const noteValue = data.note;
      const assetIdValue = data.asset_id ?? data.attached_asset_id;
      const assetNameValue = data.filename ?? data.attached_asset_name;
      const labIdValue = data.lab_id;
      return {
        note: typeof noteValue === "string" ? noteValue : "",
        labId: typeof labIdValue === "string" && labIdValue ? labIdValue : null,
        assetId:
          typeof assetIdValue === "string" && assetIdValue
            ? assetIdValue
            : null,
        assetName:
          typeof assetNameValue === "string" && assetNameValue
            ? assetNameValue
            : null,
      };
    } catch {
      return {
        note: raw,
        labId: null,
        assetId: null,
        assetName: null,
      };
    }
  };

  const runDraftAndLaunch = async (savedProjectId: string | null) => {
    if (!id || !viewingAssignment || !viewingAssignmentSession) return;
    const launcher = resolveAssignmentLabLauncher(viewingAssignment);
    if (!launcher) {
      setSubmitError(
        "This lab is not linked to an app launcher yet. Ask your instructor.",
      );
      setLabProjectPickerOpen(false);
      return;
    }
    const curriculumLabId = isCurriculumLabUuid(viewingAssignment.lab_id ?? "")
      ? viewingAssignment.lab_id!.trim()
      : undefined;

    setLabProjectPickerOpen(false);
    setSubmittingWork(true);
    setSubmitError(null);
    try {
      const content = submissionText.trim()
        ? submissionText.trim()
        : JSON.stringify({
            type: "lab_draft",
            lab_id: viewingAssignment.lab_id,
            saved_project_id: savedProjectId,
            note: "Draft saved before opening lab",
            opened_at: new Date().toISOString(),
            attached_asset_id: submissionAssetId,
            attached_asset_name: submissionAssetName,
          });
      await submitAssignment(
        id,
        viewingAssignmentSession.id,
        viewingAssignment.id,
        content,
        "draft",
        {
          lab_id: viewingAssignment.lab_id ?? undefined,
        },
      );
      navigate(
        buildLabLaunchPath(launcher, {
          classroomId: id,
          sessionId: viewingAssignmentSession.id,
          referrer: "assignment_view",
          assignmentId: viewingAssignment.id,
          curriculumLabId,
          savedProjectId: savedProjectId ?? undefined,
        }),
      );
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to save draft",
      );
    } finally {
      setSubmittingWork(false);
    }
  };

  const handleSaveDraftAndOpenLab = async () => {
    if (!id || !viewingAssignment || !viewingAssignmentSession) return;
    if (!viewingAssignment.lab_id) return;

    const launcher = resolveAssignmentLabLauncher(viewingAssignment);
    if (!launcher) {
      setSubmitError(
        "This lab is not linked to an app launcher yet. Ask your instructor.",
      );
      return;
    }
    const curriculumLabId = isCurriculumLabUuid(viewingAssignment.lab_id ?? "")
      ? viewingAssignment.lab_id!.trim()
      : undefined;

    if (curriculumLabId) {
      setSubmittingWork(true);
      setSubmitError(null);
      try {
        const projects = await listStudentLabProjects({
          lab_id: curriculumLabId,
          limit: 40,
        });
        if (projects.length > 0) {
          setLabProjectPickerRows(projects);
          setLabProjectPickerOpen(true);
          return;
        }
      } catch {
        /* open without picker */
      } finally {
        setSubmittingWork(false);
      }
    }

    await runDraftAndLaunch(null);
  };

  const handleSubmissionFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSubmissionFile(true);
    setSubmitError(null);
    try {
      const asset = await uploadAsset({
        file,
        name: file.name,
        asset_type: inferAssetTypeFromFile(file),
      });
      setSubmissionAssetId(asset.id);
      setSubmissionAssetName(asset.name);
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to upload file",
      );
    } finally {
      setUploadingSubmissionFile(false);
      if (submissionFileRef.current) submissionFileRef.current.value = "";
    }
  };

  const handleSubmitWork = async (status: "draft" | "submitted") => {
    if (!id || !viewingAssignment || !viewingAssignmentSession) return;
    if (submissionLocked) {
      setSubmitError(
        "This assignment is locked after submission. You can no longer edit this work.",
      );
      return;
    }
    if (
      status === "submitted" &&
      viewingAssignment.requires_assets &&
      !submissionAssetId
    ) {
      setSubmitError(
        "This assignment requires an attached file or asset before submitting.",
      );
      return;
    }
    if (!submissionText.trim() && !submissionAssetId) {
      setSubmitError("Add a note or attach a file before submitting.");
      return;
    }
    setSubmittingWork(true);
    setSubmitError(null);
    try {
      const content = submissionAssetId
        ? JSON.stringify({
            type: "file",
            asset_id: submissionAssetId,
            filename: submissionAssetName,
            note: submissionText.trim(),
          })
        : submissionText.trim();
      await submitAssignment(
        id,
        viewingAssignmentSession.id,
        viewingAssignment.id,
        content,
        status,
      );
      setSubmitSuccess(true);
      if (status === "submitted") {
        setTimeout(() => {
          setViewingAssignment(null);
          setViewingAssignmentSession(null);
          setSubmitSuccess(false);
        }, 2000);
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmittingWork(false);
    }
  };

  useEffect(() => {
    if (
      isInstructorView ||
      !id ||
      !viewingAssignment ||
      !viewingAssignmentSession
    ) {
      setSavedSubmissions([]);
      setLoadingSavedSubmissions(false);
      return;
    }
    let cancelled = false;
    setLoadingSavedSubmissions(true);
    listMySessionSubmissions(
      id,
      viewingAssignmentSession.id,
      viewingAssignment.id,
    )
      .then((items) => {
        if (!cancelled) setSavedSubmissions(items);
      })
      .catch(() => {
        if (!cancelled) setSavedSubmissions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSavedSubmissions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    id,
    isInstructorView,
    viewingAssignment?.id,
    viewingAssignmentSession?.id,
  ]);

  const latestSubmittedSubmission = useMemo(() => {
    const submitted = savedSubmissions.filter(
      (sub) => sub.status === "submitted",
    );
    if (submitted.length === 0) return null;
    return [...submitted].sort(
      (a, b) =>
        new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
    )[0];
  }, [savedSubmissions]);

  const latestFeedbackSubmission = useMemo(() => {
    const graded = savedSubmissions.filter(
      (sub) =>
        sub.grade != null || (sub.feedback && sub.feedback.trim().length > 0),
    );
    if (graded.length === 0) return null;
    return [...graded].sort(
      (a, b) =>
        new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
    )[0];
  }, [savedSubmissions]);

  const submissionLocked =
    Boolean(
      viewingAssignment &&
        !viewingAssignment.allow_edit_after_submit &&
        latestSubmittedSubmission,
    ) && !isInstructorView;

  const submissionBoardFiltered = useMemo(() => {
    let rows = [...sessionSubmissionsBoard];
    if (subBoardFilter === "with_snapshot") {
      rows = rows.filter((r) => Boolean(r.preview_image?.trim()));
    } else if (subBoardFilter === "text_only") {
      rows = rows.filter((r) => !r.preview_image?.trim());
    }
    const nameOf = (r: SubmissionRecord) =>
      (r.student_display_name ?? r.student_id).toLowerCase();
    rows.sort((a, b) => {
      if (subBoardSort === "student") {
        return nameOf(a).localeCompare(nameOf(b));
      }
      const ta = new Date(a.submitted_at).getTime();
      const tb = new Date(b.submitted_at).getTime();
      return subBoardSort === "edited_desc" ? tb - ta : ta - tb;
    });
    return rows;
  }, [sessionSubmissionsBoard, subBoardFilter, subBoardSort]);

  const getBoardSelectionRows = useCallback(() => {
    return submissionBoardFiltered.filter((r) => selectedBoardIds.has(r.event_id));
  }, [submissionBoardFiltered, selectedBoardIds]);

  const runBoardBulkExportJson = useCallback(() => {
    const rows = getBoardSelectionRows();
    if (rows.length === 0) return;
    const payload = rows.map((r) => ({
      event_id: r.event_id,
      student: r.student_display_name ?? r.student_id,
      assignment_id: r.assignment_id,
      status: r.status,
      submitted_at: r.submitted_at,
      lab_id: r.lab_id,
      content: r.content,
      has_preview: Boolean(r.preview_image),
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `submissions-${subSessionId || "session"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getBoardSelectionRows, subSessionId]);

  const runBoardBulkDownloadSnapshots = useCallback(async () => {
    const rows = getBoardSelectionRows().filter((r) => r.preview_image);
    for (const r of rows) {
      try {
        const res = await fetch(r.preview_image!);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const safe = (r.student_display_name ?? r.student_id).replace(
          /[^\w\-]+/g,
          "_",
        );
        a.download = `snapshot-${safe}-${r.event_id.slice(0, 8)}.${blob.type.includes("png") ? "png" : "jpg"}`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        /* ignore per row */
      }
    }
  }, [getBoardSelectionRows]);

  const getDraftSelectionRows = useCallback(() => {
    return savedSubmissions.filter((r) => selectedDraftIds.has(r.event_id));
  }, [savedSubmissions, selectedDraftIds]);

  const runDraftBulkExportJson = useCallback(() => {
    const rows = getDraftSelectionRows();
    if (rows.length === 0) return;
    const payload = rows.map((r) => ({
      event_id: r.event_id,
      status: r.status,
      submitted_at: r.submitted_at,
      lab_id: r.lab_id,
      content: r.content,
      has_preview: Boolean(r.preview_image),
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-submissions-${viewingAssignment?.id ?? "assignment"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getDraftSelectionRows, viewingAssignment?.id]);

  const runDraftBulkDownloadSnapshots = useCallback(async () => {
    const rows = getDraftSelectionRows().filter((r) => r.preview_image);
    for (const r of rows) {
      try {
        const res = await fetch(r.preview_image!);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `my-snapshot-${r.event_id.slice(0, 8)}.${blob.type.includes("png") ? "png" : "jpg"}`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }
  }, [getDraftSelectionRows]);

  const filteredLibraryAssets = useMemo(() => {
    const search = librarySearch.trim().toLowerCase();
    return libraryAssets.filter((asset) => {
      if (libraryTypeFilter !== "all" && asset.asset_type !== libraryTypeFilter)
        return false;
      if (!search) return true;
      return (
        asset.name.toLowerCase().includes(search) ||
        asset.asset_type.toLowerCase().includes(search)
      );
    });
  }, [libraryAssets, librarySearch, libraryTypeFilter]);

  const recentlyUsedAssets = useMemo(() => {
    const entries = resourcesSession?.session_content?.resource_entries ?? [];
    const byId = new Map(libraryAssets.map((asset) => [asset.id, asset]));
    return entries
      .map((entry) => byId.get(entry.asset_id))
      .filter((asset): asset is Asset => Boolean(asset))
      .slice(0, 6);
  }, [resourcesSession?.session_content?.resource_entries, libraryAssets]);

  const assetTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(libraryAssets.map((asset) => asset.asset_type).filter(Boolean)),
      ).sort(),
    [libraryAssets],
  );
  const assetTypeDropdownOptions = useMemo(() => {
    const canonical = [
      { value: "all", label: "All assets" },
      { value: "video", label: "Video" },
      { value: "sheet", label: "Spreadsheet" },
      { value: "presentation", label: "Presentation" },
      { value: "text", label: "Text" },
    ];
    const seen = new Set(canonical.map((item) => item.value));
    const extras = assetTypeOptions
      .filter((type) => !seen.has(type))
      .map((type) => ({
        value: type,
        label: type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      }));
    return [...canonical, ...extras];
  }, [assetTypeOptions]);

  return (
    <div
      className="classroom-detail"
      role="main"
      aria-label={`Classroom: ${classroom?.name ?? "Classroom"}`}
    >
      <Link
        to="/app/classrooms"
        className="classroom-detail__back"
        aria-label="Back to classrooms"
      >
        <ArrowLeft size={18} aria-hidden />
        {isInstructorView ? "Back to Classrooms" : "Back to My Classes"}
      </Link>

      {error && <p className="classroom-list__empty">{error}</p>}
      {loading ? (
        <p className="classroom-list__empty">Loading classroom...</p>
      ) : (
        <>
          <header className="classroom-detail__header">
            <div className="classroom-detail__header-row">
              <h1 className="classroom-detail__name">
                {classroom?.name ?? "Classroom"}
              </h1>
              {isInstructorView && (
                <button
                  type="button"
                  className="classroom-detail__icon-btn"
                  onClick={() => setShowClassroomEditWizard(true)}
                  aria-label="Edit classroom"
                >
                  <Pencil size={16} aria-hidden />
                </button>
              )}
            </div>
            <p className="classroom-detail__description">
              {((classroom?.schedule ?? {}) as { notes?: string }).notes ??
                "No description yet."}
            </p>
            <p className="classroom-detail__session">
              Mode: {classroom?.mode === "in-person" ? "In person" : "Remote"} ·{" "}
              {sessions.length} sessions
            </p>
            {isInstructorView && (
              <button
                type="button"
                className="classroom-list__create-btn"
                onClick={handleStartSession}
                disabled={startingSession}
              >
                {activeSession ? (
                  <Video size={16} aria-hidden />
                ) : (
                  <Play size={16} aria-hidden />
                )}
                {startingSession
                  ? "Starting..."
                  : activeSession
                    ? "Join active session"
                    : "Start Session"}
              </button>
            )}
          </header>

          <div
            className="classroom-detail__tabs"
            role="tablist"
            aria-label="Classroom sections"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                id={`tab-${tab.id}`}
                className={`classroom-detail__tab ${
                  activeTab === tab.id ? "classroom-detail__tab--active" : ""
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {isInstructorView && (
            <div
              id="panel-students"
              role="tabpanel"
              aria-labelledby="tab-students"
              hidden={activeTab !== "students"}
              className="classroom-detail__panel"
            >
              <div className="classroom-detail__panel-header">
                <h2 className="classroom-detail__panel-title">Students</h2>
                {isInstructorView && (
                  <button
                    type="button"
                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                    onClick={handleOpenEnrollDialog}
                  >
                    <UserPlus size={16} aria-hidden />
                    Add student
                  </button>
                )}
              </div>
              {students.length === 0 ? (
                <p className="classroom-list__empty">
                  No students enrolled yet.
                </p>
              ) : (
                <>
                  <div className="classroom-detail__roster-toolbar">
                    <div className="classroom-detail__roster-toolbar-left">
                      <KidCheckbox
                        compact
                        ariaLabel="Select all students in this class"
                        checked={
                          students.length > 0 &&
                          students.every((s) => rosterSelectedIds.has(s.id))
                        }
                        onChange={(on) => {
                          if (on) {
                            setRosterSelectedIds(
                              new Set(students.map((s) => s.id)),
                            );
                          } else {
                            setRosterSelectedIds(new Set());
                          }
                        }}
                      />
                      <span className="classroom-detail__roster-count">
                        {rosterSelectedIds.size} selected
                      </span>
                    </div>
                    <div className="classroom-detail__roster-toolbar-actions">
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--ghost"
                        disabled={rosterSelectedIds.size === 0}
                        onClick={() =>
                          openRosterGamifyModal(
                            "assign",
                            Array.from(rosterSelectedIds),
                          )
                        }
                      >
                        <Award size={14} aria-hidden />
                        Award badge
                      </button>
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--ghost"
                        disabled={rosterSelectedIds.size === 0}
                        onClick={() =>
                          openRosterGamifyModal(
                            "xp",
                            Array.from(rosterSelectedIds),
                          )
                        }
                      >
                        <Sparkles size={14} aria-hidden />
                        Give XP
                      </button>
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--ghost"
                        disabled={rosterSelectedIds.size === 0}
                        onClick={() =>
                          openRosterGamifyModal(
                            "revoke",
                            Array.from(rosterSelectedIds),
                          )
                        }
                      >
                        Remove badge
                      </button>
                    </div>
                  </div>
                  {rosterBadgesLoading && (
                    <p className="classroom-detail__resources-label">
                      Loading badge list…
                    </p>
                  )}
                  {!rosterBadgesLoading && rosterBadgeOptions.length === 0 && (
                    <p className="classroom-detail__resources-label">
                      No badges are defined for this organization yet. Ask an
                      admin to add badges in gamification settings.
                    </p>
                  )}
                  <ul className="classroom-detail__student-list" role="list">
                    {students.map((student, index) => {
                      const studentName =
                        student.display_name ||
                        `${student.first_name} ${student.last_name}`.trim() ||
                        `Student #${index + 1}`;
                      const picked = rosterSelectedIds.has(student.id);
                      return (
                        <li
                          key={student.id}
                          className="classroom-detail__student-item classroom-detail__student-item--roster"
                          role="listitem"
                        >
                          <div className="classroom-detail__student-item-main">
                            <KidCheckbox
                              compact
                              ariaLabel={`Select ${studentName}`}
                              checked={picked}
                              onChange={(on) => {
                                setRosterSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (on) next.add(student.id);
                                  else next.delete(student.id);
                                  return next;
                                });
                              }}
                            />
                            <span className="classroom-detail__student-name">
                              {studentName}
                            </span>
                          </div>
                          <ProgressBar
                            value={Math.min(100, 45 + index * 7)}
                            showPercent
                            variant="default"
                          />
                          <div className="classroom-detail__student-item-actions">
                            <div className="classroom-detail__roster-inline-actions">
                              <button
                                type="button"
                                className="classroom-detail__roster-link-btn"
                                onClick={() =>
                                  openRosterGamifyModal("assign", [
                                    student.id,
                                  ])
                                }
                              >
                                Badge
                              </button>
                              <button
                                type="button"
                                className="classroom-detail__roster-link-btn"
                                onClick={() =>
                                  openRosterGamifyModal("xp", [student.id])
                                }
                              >
                                XP
                              </button>
                              <button
                                type="button"
                                className="classroom-detail__roster-link-btn"
                                onClick={() =>
                                  openRosterGamifyModal("revoke", [
                                    student.id,
                                  ])
                                }
                              >
                                Strip badge
                              </button>
                            </div>
                            <button
                              type="button"
                              className="classroom-list__create-btn classroom-list__create-btn--ghost classroom-list__create-btn--danger classroom-detail__student-remove-btn"
                              onClick={() => {
                                void handleRemoveStudent(student);
                              }}
                              disabled={removingStudentId === student.id}
                            >
                              <Trash2 size={14} aria-hidden />
                              {removingStudentId === student.id
                                ? "Removing..."
                                : "Remove"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {enrollError && (
                <p className="classroom-list__empty">{enrollError}</p>
              )}
            </div>
          )}

          <div
            id="panel-sessions"
            role="tabpanel"
            aria-labelledby="tab-sessions"
            hidden={activeTab !== "sessions"}
            className="classroom-detail__panel"
          >
            <h2 className="classroom-detail__panel-title">Sessions</h2>
            {activeSession && (
              <div
                className="classroom-detail__waiting-room"
                role="status"
                aria-live="polite"
              >
                <h3>Active session in progress</h3>
                <p>
                  {isInstructorView
                    ? "Join now to manage your live class, content, and student engagement tools."
                    : "Join now to view your class content and follow the instructor live."}
                </p>
                <button
                  type="button"
                  className="classroom-list__create-btn"
                  onClick={() => navigate(`/app/classrooms/${id}/live`)}
                >
                  <Video size={16} aria-hidden />
                  Join session
                </button>
              </div>
            )}
            {isInstructorView ? (
              <>
                <div className="classroom-detail__session-filters">
                  <div className="classroom-list__create-field">
                    <label htmlFor="session-filter-start">Start date</label>
                    <DatePicker
                      id="session-filter-start"
                      value={sessionFilterStart}
                      onChange={setSessionFilterStart}
                      placeholder="Start date"
                    />
                  </div>
                  <div className="classroom-list__create-field">
                    <label htmlFor="session-filter-end">End date</label>
                    <DatePicker
                      id="session-filter-end"
                      value={sessionFilterEnd}
                      onChange={setSessionFilterEnd}
                      placeholder="End date"
                    />
                  </div>
                  <div className="classroom-list__create-field">
                    <label htmlFor="session-per-page">Per page</label>
                    <KidDropdown
                      value={sessionsPerPage}
                      onChange={setSessionsPerPage}
                      ariaLabel="Sessions per page"
                      options={[
                        { value: "10", label: "10 per page" },
                        { value: "20", label: "20 per page" },
                        { value: "50", label: "50 per page" },
                        { value: "100", label: "100 per page" },
                      ]}
                    />
                  </div>
                </div>
                {filteredLatestSessions.length === 0 ? (
                  <p className="classroom-list__empty">
                    {sessions.length === 0
                      ? "No sessions yet. Use Start Session to begin."
                      : "No sessions match these filters."}
                  </p>
                ) : (
                  <div className="classroom-detail__session-list">
                    {pagedSessions.map((session) => {
                      const start = new Date(session.session_start);
                      const end = new Date(session.session_end);
                      const isActive = isLiveSession(session);
                      const notStarted =
                        start.getTime() > Date.now() &&
                        session.status !== "canceled" &&
                        session.status !== "completed";
                      const canShowJoin = session.status !== "completed";
                      const windowOpen = isContentWindowOpen(session);
                      const deadline = getContentWindowDeadline(session);
                      return (
                        <div
                          key={session.id}
                          className="classroom-detail__session-card"
                        >
                          <div className="classroom-detail__session-info">
                            <p className="classroom-detail__session-time">
                              {start.toLocaleString()} -{" "}
                              {end.toLocaleTimeString()}
                            </p>
                            <p className="classroom-detail__session-status">
                              {isActive
                                ? "Active now"
                                : notStarted
                                  ? "Scheduled"
                                  : session.status}
                            </p>
                            {session.status === "completed" && deadline && (
                              <p
                                className={`classroom-detail__session-window ${windowOpen ? "classroom-detail__session-window--open" : "classroom-detail__session-window--closed"}`}
                              >
                                {windowOpen
                                  ? `Edit window closes ${deadline.toLocaleString()}`
                                  : "Edit window closed"}
                              </p>
                            )}
                          </div>
                          <div className="classroom-detail__session-card-actions">
                            {canShowJoin ? (
                              <button
                                type="button"
                                className="classroom-list__create-btn classroom-list__create-btn--ghost"
                                onClick={() => {
                                  if (isActive && id) {
                                    navigate(`/app/classrooms/${id}/live`);
                                    return;
                                  }
                                  if (session.meeting_link)
                                    window.open(
                                      session.meeting_link,
                                      "_blank",
                                      "noopener",
                                    );
                                }}
                              >
                                <Video size={16} aria-hidden />
                                {isActive ? "Join session" : "Join meeting"}
                              </button>
                            ) : null}
                            {(session.status === "completed" || isActive) && (
                              <button
                                type="button"
                                className="classroom-list__create-btn classroom-list__create-btn--ghost"
                                onClick={() => {
                                  setSubSessionId(session.id);
                                  setExpandedBoardId(null);
                                  setActiveTab("submissions");
                                }}
                              >
                                View submissions
                              </button>
                            )}
                            {windowOpen && (
                              <button
                                type="button"
                                className="classroom-list__create-btn classroom-list__create-btn--ghost"
                                onClick={() => {
                                  void handleOpenResources(session);
                                }}
                              >
                                <BookOpen size={16} aria-hidden />
                                Resources
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {filteredLatestSessions.length > 0 && (
                  <div className="classroom-detail__session-pagination">
                    <span>
                      Showing {(sessionPage - 1) * sessionsPerPageValue + 1}-
                      {Math.min(
                        sessionPage * sessionsPerPageValue,
                        filteredLatestSessions.length,
                      )}{" "}
                      of {filteredLatestSessions.length}
                    </span>
                    <div>
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--ghost"
                        onClick={() =>
                          setSessionPage((prev) => Math.max(1, prev - 1))
                        }
                        disabled={sessionPage <= 1}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--ghost"
                        onClick={() =>
                          setSessionPage((prev) =>
                            Math.min(totalSessionPages, prev + 1),
                          )
                        }
                        disabled={sessionPage >= totalSessionPages}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {latestFirstSessions.length === 0 ? (
                  <p className="classroom-list__empty">
                    No sessions for this classroom yet.
                  </p>
                ) : (
                  <div className="classroom-detail__student-session-list">
                    {latestFirstSessions.slice(0, 20).map((session) => {
                      const start = new Date(session.session_start);
                      const end = new Date(session.session_end);
                      const isActive = isLiveSession(session);
                      const sharedIds =
                        session.session_content?.shared_asset_ids ?? [];
                      const downloadIds =
                        session.session_content?.downloadable_asset_ids ?? [];
                      const fileIds = Array.from(
                        new Set([...sharedIds, ...downloadIds]),
                      );
                      const assignments =
                        session.session_content?.text_assignments ?? [];
                      const hasContent =
                        fileIds.length > 0 || assignments.length > 0;
                      return (
                        <div
                          key={session.id}
                          className="classroom-detail__student-session-card"
                        >
                          {/* Session header */}
                          <div className="classroom-detail__student-session-header">
                            <div className="classroom-detail__student-session-meta">
                              <span
                                className={`classroom-detail__student-session-badge ${isActive ? "classroom-detail__student-session-badge--active" : ""}`}
                              >
                                {isActive
                                  ? "Live now"
                                  : session.status === "completed"
                                    ? "Completed"
                                    : "Upcoming"}
                              </span>
                              <span className="classroom-detail__student-session-date">
                                {start.toLocaleDateString(undefined, {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })}
                                {" · "}
                                {start.toLocaleTimeString(undefined, {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                                {" – "}
                                {end.toLocaleTimeString(undefined, {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            {(isActive || session.meeting_link) && (
                              <button
                                type="button"
                                className="classroom-list__create-btn classroom-list__create-btn--ghost classroom-detail__student-join-btn"
                                onClick={() => {
                                  if (isActive && id) {
                                    navigate(`/app/classrooms/${id}/live`);
                                    return;
                                  }
                                  if (session.meeting_link)
                                    window.open(
                                      session.meeting_link,
                                      "_blank",
                                      "noopener",
                                    );
                                }}
                              >
                                <Video size={14} aria-hidden />
                                {isActive ? "Join live" : "Connect"}
                              </button>
                            )}
                          </div>

                          {hasContent && (
                            <div className="classroom-detail__student-session-body">
                              {/* Assignments */}
                              {assignments.length > 0 && (
                                <div className="classroom-detail__student-assignments">
                                  <p className="classroom-detail__student-section-label">
                                    Assignments
                                  </p>
                                  {assignments.map((a) => (
                                    <button
                                      key={a.id}
                                      type="button"
                                      className="classroom-detail__student-assign-card"
                                      onClick={() =>
                                        handleOpenAssignment(a, session)
                                      }
                                    >
                                      <FileText
                                        size={16}
                                        className="classroom-detail__student-assign-icon"
                                        aria-hidden
                                      />
                                      <div className="classroom-detail__student-assign-text">
                                        <span className="classroom-detail__student-assign-title">
                                          {a.title}
                                        </span>
                                        {a.due_at && (
                                          <span className="classroom-detail__student-assign-due">
                                            <Clock size={11} aria-hidden />
                                            Due{" "}
                                            {new Date(
                                              a.due_at,
                                            ).toLocaleDateString()}
                                          </span>
                                        )}
                                      </div>
                                      {a.lab_id && (
                                        <span className="classroom-detail__student-assign-lab-badge">
                                          <LabIcon size={11} aria-hidden />
                                          {a.lab_id.replace(/-/g, " ")}
                                        </span>
                                      )}
                                      <ChevronRight
                                        size={16}
                                        className="classroom-detail__student-assign-chevron"
                                        aria-hidden
                                      />
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Session files */}
                              {fileIds.length > 0 && (
                                <div className="classroom-detail__student-resources">
                                  <p className="classroom-detail__student-section-label">
                                    Resources
                                  </p>
                                  <div className="classroom-detail__student-resource-list">
                                    {fileIds.map((assetId, idx) => {
                                      const key = `${session.id}:${assetId}`;
                                      const loading =
                                        materialLoadingKey === key;
                                      return (
                                        <button
                                          key={assetId}
                                          type="button"
                                          className="classroom-detail__student-resource-btn"
                                          onClick={() =>
                                            void openSessionMaterial(
                                              session.id,
                                              assetId,
                                            )
                                          }
                                          disabled={loading}
                                        >
                                          <BookOpen size={13} aria-hidden />
                                          {loading
                                            ? "Opening…"
                                            : `File ${idx + 1}`}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {isInstructorView && waitingSession && (
              <div
                className="classroom-detail__waiting-room"
                role="status"
                aria-live="polite"
              >
                <h3>Waiting room</h3>
                <p>
                  Session starts at{" "}
                  {new Date(waitingSession.session_start).toLocaleTimeString()}.
                </p>
                <p className="classroom-detail__waiting-countdown">
                  Starting in {countdownText}
                </p>
              </div>
            )}

            {isInstructorView &&
              !activeSession &&
              waitingForClassStart &&
              !waitingSession && (
                <div
                  className="classroom-detail__waiting-room"
                  role="status"
                  aria-live="polite"
                >
                  <h3>Waiting room</h3>
                  <p>Waiting for class to start.</p>
                  <p className="classroom-detail__waiting-countdown">
                    Your instructor has not started a session yet.
                  </p>
                </div>
              )}

            {activeSession && inlineSessionWorkspaceEnabled && (
              <div className="classroom-detail__session-workspace">
                {isInstructorView ? (
                  <>
                    <h3>Live instructor controls</h3>
                    <div className="classroom-detail__workspace-actions">
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--ghost"
                      >
                        <Share2 size={16} /> Share content
                      </button>
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--ghost"
                      >
                        <FlaskConical size={16} /> Add lab
                      </button>
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--ghost"
                      >
                        <MessageSquare size={16} /> Send message
                      </button>
                      {pointsEnabled && (
                        <button
                          type="button"
                          className="classroom-list__create-btn classroom-list__create-btn--ghost"
                        >
                          <Gift size={16} /> Give points
                        </button>
                      )}
                      {activeSession.meeting_link && (
                        <button
                          type="button"
                          className="classroom-list__create-btn"
                          onClick={() =>
                            window.open(
                              activeSession.meeting_link!,
                              "_blank",
                              "noopener",
                            )
                          }
                        >
                          <Video size={16} /> Join meeting
                        </button>
                      )}
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--danger"
                        onClick={handleOpenEndDialog}
                        disabled={openingEndDialog || endingSession}
                      >
                        {openingEndDialog
                          ? "Checking..."
                          : endingSession
                            ? "Ending..."
                            : "End Session"}
                      </button>
                    </div>
                    {permittedLabs.length > 0 && (
                      <div className="classroom-detail__lab-picker">
                        <KidDropdown
                          value={selectedSessionLab}
                          onChange={setSelectedSessionLab}
                          ariaLabel="Current session lab"
                          minWidth={220}
                          options={permittedLabs.map((lab) => ({
                            value: lab,
                            label: lab,
                          }))}
                        />
                        <button
                          type="button"
                          className="classroom-list__create-btn classroom-list__create-btn--ghost"
                          onClick={openLab}
                        >
                          <FlaskConical size={16} /> Start lab
                        </button>
                      </div>
                    )}
                    <p className="classroom-detail__resources-label">
                      Permitted labs for this classroom:{" "}
                      {permittedLabs.length
                        ? permittedLabs.join(", ")
                        : "No labs configured yet."}
                    </p>
                  </>
                ) : (
                  <>
                    <h3>Live class session</h3>
                    <div className="classroom-detail__workspace-actions">
                      {activeSession.meeting_link && (
                        <button
                          type="button"
                          className="classroom-list__create-btn"
                          onClick={() =>
                            window.open(
                              activeSession.meeting_link!,
                              "_blank",
                              "noopener",
                            )
                          }
                        >
                          <Video size={16} /> Join meeting
                        </button>
                      )}
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--ghost"
                      >
                        <MessageSquare size={16} /> Open messages
                      </button>
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--ghost"
                        onClick={openLab}
                      >
                        <FlaskConical size={16} /> Open lab
                      </button>
                    </div>
                    <p className="classroom-detail__resources-label">
                      Resources and shared labs are available while the session
                      is active.
                    </p>
                  </>
                )}

                <div className="classroom-detail__session-columns">
                  <section className="classroom-detail__session-panel">
                    <h4>Session messages</h4>
                    <div className="classroom-detail__message-thread">
                      {sessionMessages.length === 0 ? (
                        <p className="classroom-detail__message-empty">
                          No messages yet.
                        </p>
                      ) : (
                        sessionMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`classroom-detail__message ${msg.sender === "instructor" ? "classroom-detail__message--instructor" : "classroom-detail__message--student"}`}
                          >
                            <strong>
                              {msg.sender === "instructor"
                                ? "Instructor"
                                : "Student"}
                            </strong>
                            <span>{msg.text}</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="classroom-detail__message-compose">
                      <input
                        type="text"
                        className="classroom-list__create-input"
                        placeholder={
                          isInstructorView
                            ? "Send message to class..."
                            : "Reply to class..."
                        }
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                      />
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--ghost"
                        onClick={() =>
                          sendMessage(
                            isInstructorView ? "instructor" : "student",
                          )
                        }
                      >
                        Send
                      </button>
                    </div>
                  </section>

                  <section className="classroom-detail__session-panel">
                    <h4>Session resources</h4>
                    {permittedLabs.length > 0 && (
                      <>
                        <h4>Labs for this session</h4>
                        <ul className="classroom-detail__resource-list">
                          {permittedLabs.map((lab) => (
                            <li key={lab}>
                              <button
                                type="button"
                                className="classroom-detail__resource-btn"
                                onClick={() =>
                                  navigate(
                                    buildLabLaunchPath(lab, {
                                      classroomId: id,
                                      sessionId: activeSession?.id,
                                      referrer: "classroom_detail_resources",
                                    }),
                                  )
                                }
                              >
                                Open {lab}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </section>
                </div>
              </div>
            )}
          </div>

          {isInstructorView && (
            <div
              id="panel-attendance"
              role="tabpanel"
              aria-labelledby="tab-attendance"
              hidden={activeTab !== "attendance"}
              className="classroom-detail__panel"
            >
              <h2 className="classroom-detail__panel-title">Attendance</h2>

              {/* ── Session attendance records ─── */}
              <div className="classroom-detail__attendance-section">
                <h3 className="classroom-detail__subsection-title">
                  Session Attendance
                </h3>
                <div className="classroom-detail__attendance-controls">
                  <KidDropdown
                    value={attendanceSessionId}
                    onChange={(v) => {
                      setAttendanceSessionId(v);
                      setAttendanceFilter("all");
                      void handleLoadAttendanceRecords(v);
                    }}
                    ariaLabel="Select session"
                    placeholder="— Select a session —"
                    fullWidth
                    options={[
                      ...sessions
                        .filter((s) => s.status === "completed")
                        .sort(
                          (a, b) =>
                            new Date(b.session_start).getTime() -
                            new Date(a.session_start).getTime(),
                        )
                        .map((s) => ({
                          value: s.id,
                          label: new Date(s.session_start).toLocaleString(),
                        })),
                    ]}
                  />
                  {attendanceSessionId && (
                    <button
                      type="button"
                      className="ui-btn ui-btn--secondary"
                      onClick={() =>
                        void handleRecalculateAttendance(attendanceSessionId)
                      }
                      disabled={attendanceCalcRunning}
                    >
                      {attendanceCalcRunning ? "Calculating…" : "Recalculate"}
                    </button>
                  )}
                </div>

                {attendanceLoading && (
                  <p className="classroom-list__empty">Loading attendance…</p>
                )}

                {!attendanceLoading &&
                  attendanceSessionId &&
                  attendanceRecords.length === 0 && (
                    <p className="classroom-list__empty">
                      No attendance records yet. Click Recalculate to compute
                      from presence data.
                    </p>
                  )}

                {!attendanceLoading &&
                  attendanceRecords.length > 0 &&
                  (() => {
                    const presentCount = attendanceRecords.filter(
                      (r) => r.status === "present",
                    ).length;
                    const absentCount = attendanceRecords.filter(
                      (r) => r.status === "absent",
                    ).length;
                    const filtered =
                      attendanceFilter === "all"
                        ? attendanceRecords
                        : attendanceRecords.filter(
                            (r) => r.status === attendanceFilter,
                          );
                    return (
                      <>
                        <div className="classroom-detail__attendance-filter">
                          {(["all", "present", "absent"] as const).map((f) => {
                            const label =
                              f === "all"
                                ? `All (${attendanceRecords.length})`
                                : f === "present"
                                  ? `Present (${presentCount})`
                                  : `Absent (${absentCount})`;
                            return (
                              <button
                                key={f}
                                type="button"
                                className={`classroom-detail__sub-pill${attendanceFilter === f ? " classroom-detail__sub-pill--active" : ""}`}
                                onClick={() => setAttendanceFilter(f)}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        <table className="classroom-detail__attendance-table">
                          <thead>
                            <tr>
                              <th>Student</th>
                              <th>Status</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((rec) => {
                              const student = students.find(
                                (s) => s.id === rec.student_id,
                              );
                              const name = student
                                ? student.display_name ||
                                  `${student.first_name} ${student.last_name}`.trim()
                                : rec.student_id;
                              return (
                                <tr key={rec.id}>
                                  <td>{name}</td>
                                  <td>
                                    <span
                                      className={`classroom-detail__attendance-badge classroom-detail__attendance-badge--${rec.status}`}
                                    >
                                      {rec.status}
                                    </span>
                                  </td>
                                  <td>{rec.notes ?? "—"}</td>
                                </tr>
                              );
                            })}
                            {filtered.length === 0 && (
                              <tr>
                                <td
                                  colSpan={3}
                                  style={{
                                    textAlign: "center",
                                    color:
                                      "var(--color-text-secondary, #64748b)",
                                    padding: "16px",
                                  }}
                                >
                                  No {attendanceFilter} records for this
                                  session.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </>
                    );
                  })()}
              </div>

              {/* ── Classroom-level attendance policy ─── */}
              <div
                className="classroom-detail__attendance-section"
                style={{ marginTop: 32 }}
              >
                <h3 className="classroom-detail__subsection-title">
                  Attendance Policy
                </h3>
                <p className="classroom-detail__section-desc">
                  Override the attendance policy for this classroom. Leave unset
                  to inherit from the program or tenant.
                </p>
                <AttendanceSettings
                  value={attendanceCfg}
                  onChange={setAttendanceCfg}
                  allowInherit
                  inheritLabel="Inherit from program / tenant"
                  saving={attendanceSaving}
                />
                <div className="ui-form-actions" style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className="ui-btn ui-btn--primary"
                    onClick={() => void handleSaveAttendanceSettings()}
                    disabled={attendanceSaving}
                  >
                    {attendanceSaving
                      ? "Saving…"
                      : attendanceSaved
                        ? "Saved!"
                        : "Save Policy"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {isInstructorView && (
            <div
              id="panel-submissions"
              role="tabpanel"
              aria-labelledby="tab-submissions"
              hidden={activeTab !== "submissions"}
              className="classroom-detail__panel"
            >
              <div className="classroom-detail__panel-header">
                <h2 className="classroom-detail__panel-title">Submissions</h2>
              </div>

              {/* Session picker + board tools */}
              <div className="classroom-detail__sub-controls">
                <span className="classroom-detail__sub-label">Session</span>
                <div className="classroom-detail__sub-dropdown">
                  <KidDropdown
                    value={subSessionId}
                    onChange={(v) => {
                      setSubSessionId(v);
                      setExpandedBoardId(null);
                    }}
                    ariaLabel="Select session"
                    placeholder="— Select a session —"
                    fullWidth
                    options={[
                      ...latestFirstSessions
                        .filter(
                          (s) => s.status === "completed" || isLiveSession(s),
                        )
                        .map((s) => ({
                          value: s.id,
                          label: `${new Date(s.session_start).toLocaleString()}${isLiveSession(s) ? " (live)" : ""}`,
                        })),
                    ]}
                  />
                </div>

                {subSessionId && (
                  <>
                    <div
                      className="classroom-detail__sub-pills"
                      role="group"
                      aria-label="Submission view"
                    >
                      <button
                        type="button"
                        className={`classroom-detail__sub-pill ${subView === "assignments" ? "classroom-detail__sub-pill--active" : ""}`}
                        onClick={() => {
                          setSubView("assignments");
                          setExpandedBoardId(null);
                        }}
                      >
                        By Assignment
                      </button>
                      <button
                        type="button"
                        className={`classroom-detail__sub-pill ${subView === "classwork" ? "classroom-detail__sub-pill--active" : ""}`}
                        onClick={() => {
                          setSubView("classwork");
                          setExpandedBoardId(null);
                        }}
                      >
                        All Work
                      </button>
                    </div>
                    <div
                      className="classroom-detail__sub-board-toolbar"
                      role="toolbar"
                      aria-label="Filter and sort submissions"
                    >
                      <div
                        className="classroom-detail__sub-pills classroom-detail__sub-pills--dense"
                        role="group"
                        aria-label="Filter by snapshot"
                      >
                        <button
                          type="button"
                          className={`classroom-detail__sub-pill ${subBoardFilter === "all" ? "classroom-detail__sub-pill--active" : ""}`}
                          onClick={() => setSubBoardFilter("all")}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          className={`classroom-detail__sub-pill ${subBoardFilter === "with_snapshot" ? "classroom-detail__sub-pill--active" : ""}`}
                          onClick={() => setSubBoardFilter("with_snapshot")}
                        >
                          With snapshot
                        </button>
                        <button
                          type="button"
                          className={`classroom-detail__sub-pill ${subBoardFilter === "text_only" ? "classroom-detail__sub-pill--active" : ""}`}
                          onClick={() => setSubBoardFilter("text_only")}
                        >
                          Text only
                        </button>
                      </div>
                      <KidDropdown
                        value={subBoardSort}
                        onChange={(v) =>
                          setSubBoardSort(
                            v as "edited_desc" | "edited_asc" | "student",
                          )
                        }
                        ariaLabel="Sort submissions"
                        placeholder="Sort"
                        minWidth={160}
                        options={[
                          { value: "edited_desc", label: "Edited (newest)" },
                          { value: "edited_asc", label: "Edited (oldest)" },
                          { value: "student", label: "Student name" },
                        ]}
                      />
                      <div className="classroom-detail__sub-board-select-row">
                        <KidCheckbox
                          compact
                          ariaLabel="Select all visible submissions"
                          checked={
                            submissionBoardFiltered.length > 0 &&
                            submissionBoardFiltered.every((r) =>
                              selectedBoardIds.has(r.event_id),
                            )
                          }
                          onChange={(on) => {
                            if (on) {
                              setSelectedBoardIds(
                                new Set(
                                  submissionBoardFiltered.map((r) => r.event_id),
                                ),
                              );
                            } else {
                              setSelectedBoardIds(new Set());
                            }
                          }}
                        />
                        <span className="classroom-detail__sub-board-select-label">
                          Select all
                        </span>
                        <KidDropdown
                          value={boardAction}
                          onChange={(v) => {
                            if (v === "__noop__") return;
                            if (v === "export_json") runBoardBulkExportJson();
                            if (v === "download_snaps")
                              void runBoardBulkDownloadSnapshots();
                            if (v === "clear_sel")
                              setSelectedBoardIds(new Set());
                            setBoardAction("__noop__");
                          }}
                          ariaLabel="Group actions"
                          placeholder="Actions…"
                          minWidth={200}
                          disabled={selectedBoardIds.size === 0}
                          options={[
                            {
                              value: "export_json",
                              label: "Export selected (JSON)",
                            },
                            {
                              value: "download_snaps",
                              label: "Download snapshots",
                            },
                            {
                              value: "clear_sel",
                              label: "Clear selection",
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {!subSessionId && (
                <p className="classroom-list__empty">
                  Select a session above to view its submissions.
                </p>
              )}

              {subSessionId && subLoading && (
                <p className="classroom-list__empty">Loading submissions…</p>
              )}

              {subSessionId && subError && (
                <p className="classroom-list__empty">{subError}</p>
              )}

              {subSessionId &&
                !subLoading &&
                !subError &&
                submissionBoardFiltered.length === 0 && (
                  <p className="classroom-list__empty">
                    No submissions match this filter for this session.
                  </p>
                )}

              {subSessionId &&
                !subLoading &&
                !subError &&
                submissionBoardFiltered.length > 0 &&
                (() => {
                  const renderDesignCard = (sub: SubmissionRecord) => {
                    const checked = selectedBoardIds.has(sub.event_id);
                    const isExpanded = expandedBoardId === sub.event_id;
                    const statusLabel =
                      sub.status === "submitted" ? "Submitted" : "Draft";
                    return (
                      <div
                        key={sub.event_id}
                        className="classroom-detail__sub-design-card"
                      >
                        <div className="classroom-detail__sub-design-card__chrome">
                          <KidCheckbox
                            compact
                            ariaLabel={`Select submission from ${sub.student_display_name ?? sub.student_id}`}
                            checked={checked}
                            onChange={(on) => {
                              setSelectedBoardIds((prev) => {
                                const next = new Set(prev);
                                if (on) next.add(sub.event_id);
                                else next.delete(sub.event_id);
                                return next;
                              });
                            }}
                          />
                        </div>
                        <SubmissionSnapshotViewport
                          imageSrc={sub.preview_image}
                          label={`${sub.student_display_name ?? "Student"} lab snapshot`}
                        />
                        <div className="classroom-detail__sub-design-card__meta">
                          <div className="classroom-detail__sub-design-card__title-row">
                            <span className="classroom-detail__sub-design-card__student">
                              {sub.student_display_name ?? sub.student_id}
                            </span>
                            <span
                              className={`classroom-detail__assign-status-badge classroom-detail__assign-status-badge--${sub.status === "submitted" ? "submitted" : "draft"}`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <p className="classroom-detail__sub-design-card__edited">
                            {new Date(sub.submitted_at).toLocaleString()}
                          </p>
                          {sub.lab_id && (
                            <span className="classroom-detail__sub-design-card__lab">
                              {sub.lab_id}
                            </span>
                          )}
                          {sub.assignment_id && (
                            <p className="classroom-detail__sub-design-card__assign">
                              Assignment: {sub.assignment_id}
                            </p>
                          )}
                          <button
                            type="button"
                            className="classroom-list__create-btn classroom-list__create-btn--ghost classroom-detail__sub-toggle"
                            onClick={() =>
                              setExpandedBoardId(isExpanded ? null : sub.event_id)
                            }
                          >
                            {isExpanded ? "Hide details" : "View details"}
                          </button>
                          {isExpanded && (
                            <pre className="classroom-detail__sub-content classroom-detail__sub-content--in-card">
                              {sub.content || "(no text payload)"}
                            </pre>
                          )}
                        </div>
                      </div>
                    );
                  };

                  if (subView === "assignments") {
                    const grouped = new Map<string, SubmissionRecord[]>();
                    for (const sub of submissionBoardFiltered) {
                      const key = sub.assignment_id ?? "(no assignment)";
                      if (!grouped.has(key)) grouped.set(key, []);
                      grouped.get(key)!.push(sub);
                    }
                    return (
                      <div className="classroom-detail__sub-groups">
                        {Array.from(grouped.entries()).map(
                          ([assignmentId, subs]) => (
                            <div
                              key={assignmentId}
                              className="classroom-detail__sub-group"
                            >
                              <h3 className="classroom-detail__sub-group-title">
                                {assignmentId === "(no assignment)"
                                  ? "Unassigned work"
                                  : `Assignment: ${assignmentId}`}
                                <span className="classroom-detail__sub-count">
                                  {subs.length} submission
                                  {subs.length !== 1 ? "s" : ""}
                                </span>
                              </h3>
                              <div className="classroom-detail__sub-design-grid">
                                {subs.map((s) => renderDesignCard(s))}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="classroom-detail__sub-design-grid">
                      {submissionBoardFiltered.map((s) => renderDesignCard(s))}
                    </div>
                  );
                })()}
            </div>
          )}

          {/* ── Assignments tab panel ─────────────────────────────────────── */}
          <div
            id="panel-assignments"
            role="tabpanel"
            aria-labelledby="tab-assignments"
            hidden={activeTab !== "assignments"}
            className="classroom-detail__panel"
          >
            {isInstructorView ? (
              /* ─── Instructor: list all assignments + drill into submissions ─── */
              <>
                {selectedAssignment ? (
                  /* ── Submission drill-down view ── */
                  <div className="classroom-detail__assign-drilldown">
                    <button
                      type="button"
                      className="classroom-detail__assign-back"
                      onClick={() => {
                        setSelectedAssignment(null);
                        setAssignmentSubmissions([]);
                        setAssignDrillExpandedId(null);
                      }}
                    >
                      <ArrowLeft size={14} aria-hidden /> All assignments
                    </button>
                    <div className="classroom-detail__assign-drilldown-header">
                      <h2 className="classroom-detail__panel-title">
                        {selectedAssignment.title}
                      </h2>
                      <div className="classroom-detail__assign-meta-row">
                        {selectedAssignment.due_at && (
                          <span className="classroom-detail__assign-meta-chip">
                            Due{" "}
                            {new Date(
                              selectedAssignment.due_at,
                            ).toLocaleString()}
                          </span>
                        )}
                        {selectedAssignment.lab_id && (
                          <span className="classroom-detail__assign-meta-chip classroom-detail__assign-meta-chip--lab">
                            <LabIcon size={12} aria-hidden />{" "}
                            {selectedAssignment.lab_id}
                          </span>
                        )}
                        <span className="classroom-detail__assign-meta-chip">
                          Session:{" "}
                          {new Date(
                            selectedAssignment.session_start,
                          ).toLocaleDateString()}
                        </span>
                      </div>
                      {selectedAssignment.instructions && (
                        <p className="classroom-detail__assign-instructions">
                          {selectedAssignment.instructions}
                        </p>
                      )}
                    </div>

                    {submissionsLoading ? (
                      <p className="classroom-list__empty">
                        Loading submissions…
                      </p>
                    ) : assignmentSubmissions.length === 0 ? (
                      <p className="classroom-list__empty">
                        No submissions yet for this assignment.
                      </p>
                    ) : (
                      <div className="classroom-detail__sub-design-grid">
                        {assignmentSubmissions.map((sub) => {
                          const ex = assignDrillExpandedId === sub.event_id;
                          return (
                            <div
                              key={sub.event_id}
                              className="classroom-detail__sub-design-card"
                            >
                              <SubmissionSnapshotViewport
                                imageSrc={sub.preview_image}
                                label={`${sub.student_display_name ?? "Student"} snapshot`}
                              />
                              <div className="classroom-detail__sub-design-card__meta">
                                <div className="classroom-detail__sub-design-card__title-row">
                                  <span className="classroom-detail__sub-design-card__student">
                                    {sub.student_display_name ?? sub.student_id}
                                  </span>
                                  <span
                                    className={`classroom-detail__assign-status-badge classroom-detail__assign-status-badge--${sub.status === "submitted" ? "submitted" : "draft"}`}
                                  >
                                    {sub.status === "submitted"
                                      ? "Submitted"
                                      : "Draft"}
                                  </span>
                                </div>
                                <p className="classroom-detail__sub-design-card__edited">
                                  {new Date(sub.submitted_at).toLocaleString()}
                                </p>
                                <div className="classroom-detail__sub-design-card__actions">
                                  {sub.grade != null ? (
                                    <span className="classroom-detail__grade-badge">
                                      {sub.grade}/100
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="classroom-list__create-btn classroom-list__create-btn--ghost classroom-detail__sub-toggle"
                                      onClick={() => {
                                        setGradingSubmission(sub);
                                        setGradeError(null);
                                      }}
                                    >
                                      Grade
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="classroom-list__create-btn classroom-list__create-btn--ghost classroom-detail__sub-toggle"
                                    onClick={() =>
                                      setAssignDrillExpandedId(
                                        ex ? null : sub.event_id,
                                      )
                                    }
                                  >
                                    {ex ? "Hide details" : "Details"}
                                  </button>
                                </div>
                                {ex && (
                                  <pre className="classroom-detail__sub-content classroom-detail__sub-content--in-card">
                                    {sub.content || "(no content)"}
                                  </pre>
                                )}
                                {sub.feedback && (
                                  <p className="classroom-detail__grade-feedback">
                                    <strong>Feedback:</strong> {sub.feedback}
                                  </p>
                                )}
                                {sub.rubric && sub.rubric.length > 0 ? (
                                  <ul className="classroom-detail__rubric-readout">
                                    {sub.rubric.map((rc) => (
                                      <li key={rc.criterion_id}>
                                        <strong>{rc.label || rc.criterion_id}:</strong>{" "}
                                        {rc.points_awarded}/{rc.max_points}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Assignment list ── */
                  <>
                    <div className="classroom-detail__panel-header">
                      <h2 className="classroom-detail__panel-title">
                        Assignments
                      </h2>
                    </div>
                    {assignmentsLoading ? (
                      <p className="classroom-list__empty">
                        Loading assignments…
                      </p>
                    ) : assignmentsError ? (
                      <p className="classroom-list__empty">
                        {assignmentsError}
                      </p>
                    ) : classroomAssignments.length === 0 ? (
                      <p className="classroom-list__empty">
                        No assignments have been posted yet. Add them via
                        session resources.
                      </p>
                    ) : (
                      <div className="classroom-detail__assign-list">
                        {classroomAssignments.map((a) => (
                          <button
                            key={`${a.session_id}:${a.id}`}
                            type="button"
                            className="classroom-detail__assign-card"
                            onClick={() => setSelectedAssignment(a)}
                          >
                            <div className="classroom-detail__assign-card-main">
                              <span className="classroom-detail__assign-card-title">
                                {a.title}
                              </span>
                              <div className="classroom-detail__assign-card-meta">
                                <span>
                                  Session{" "}
                                  {new Date(
                                    a.session_start,
                                  ).toLocaleDateString()}
                                </span>
                                {a.due_at && (
                                  <span>
                                    Due{" "}
                                    {new Date(a.due_at).toLocaleDateString()}
                                  </span>
                                )}
                                {a.lab_id && (
                                  <span className="classroom-detail__assign-meta-chip--lab">
                                    <LabIcon size={11} aria-hidden /> {a.lab_id}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="classroom-detail__assign-card-right">
                              <span className="classroom-detail__sub-count">
                                {a.submission_count} submission
                                {a.submission_count !== 1 ? "s" : ""}
                              </span>
                              <ChevronRight size={16} aria-hidden />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              /* ─── Student: all assignments with status + click to submit ─── */
              <>
                <div className="classroom-detail__panel-header">
                  <h2 className="classroom-detail__panel-title">Assignments</h2>
                </div>
                {assignmentsLoading ? (
                  <p className="classroom-list__empty">Loading assignments…</p>
                ) : assignmentsError ? (
                  <p className="classroom-list__empty">{assignmentsError}</p>
                ) : classroomAssignments.length === 0 ? (
                  <p className="classroom-list__empty">
                    No assignments posted yet.
                  </p>
                ) : (
                  <div className="classroom-detail__assign-list">
                    {classroomAssignments
                      .sort((a, b) => {
                        if (!a.due_at && !b.due_at) return 0;
                        if (!a.due_at) return 1;
                        if (!b.due_at) return -1;
                        return (
                          new Date(a.due_at).getTime() -
                          new Date(b.due_at).getTime()
                        );
                      })
                      .map((item) => (
                        <button
                          key={`${item.session_id}:${item.id}`}
                          type="button"
                          className="classroom-detail__assign-card classroom-detail__assign-card--student"
                          onClick={() => {
                            const matchedSession =
                              sessions.find((s) => s.id === item.session_id) ??
                              ({
                                id: item.session_id,
                                classroom_id: id ?? "",
                                tenant_id: tenant?.id ?? "",
                                session_start: item.session_start,
                                session_end: item.session_end,
                                status: item.session_status,
                                meeting_link: null,
                                external_meeting_id: null,
                                notes: null,
                                session_content: null,
                                canceled_at: null,
                              } satisfies ClassroomSessionRecord);
                            handleOpenAssignment(item, matchedSession);
                          }}
                        >
                          <div className="classroom-detail__assign-card-main">
                            <span className="classroom-detail__assign-card-title">
                              {item.title}
                            </span>
                            <div className="classroom-detail__assign-card-meta">
                              <span>
                                Session{" "}
                                {new Date(
                                  item.session_start,
                                ).toLocaleDateString()}
                              </span>
                              {item.due_at && (
                                <span>
                                  Due{" "}
                                  {new Date(item.due_at).toLocaleDateString()}
                                </span>
                              )}
                              {item.lab_id && (
                                <span className="classroom-detail__assign-meta-chip--lab">
                                  <LabIcon size={11} aria-hidden />{" "}
                                  {item.lab_id}
                                </span>
                              )}
                              {(item.requires_lab || item.requires_assets) && (
                                <span>
                                  Requires{" "}
                                  {item.requires_lab && item.requires_assets
                                    ? "lab + assets"
                                    : item.requires_lab
                                      ? "lab"
                                      : "assets"}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={16} aria-hidden />
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Roster gamification (badges / XP) ───────────────────────── */}
          <ModalDialog
            isOpen={rosterGamifyModal === "xp"}
            onClose={() => !rosterGamifyBusy && closeRosterGamifyModal()}
            title="Give XP"
            ariaLabel="Give XP to students"
            contentClassName="classroom-list__create-form classroom-list__create-form--dialog classroom-detail__end-dialog"
            closeVariant="neutral"
            disableClose={rosterGamifyBusy}
            footer={
              <div className="classroom-list__create-actions">
                <button
                  type="button"
                  className="classroom-list__create-btn classroom-list__create-btn--ghost"
                  onClick={closeRosterGamifyModal}
                  disabled={rosterGamifyBusy}
                >
                  {rosterGamifySummary ? "Close" : "Cancel"}
                </button>
                {!rosterGamifySummary ? (
                  <button
                    type="button"
                    className="classroom-list__create-btn"
                    disabled={rosterGamifyBusy}
                    onClick={() => void applyRosterXp()}
                  >
                    {rosterGamifyBusy ? "Applying…" : "Award XP"}
                  </button>
                ) : null}
              </div>
            }
          >
            <p className="classroom-detail__end-dialog-copy">
              <strong>{rosterGamifyTargets.length}</strong> student
              {rosterGamifyTargets.length !== 1 ? "s" : ""} selected.
            </p>
            {rosterGamifySummary && (
              <p className="classroom-detail__roster-gamify-summary">
                {rosterGamifySummary}
              </p>
            )}
            {rosterGamifyError && (
              <p
                className="classroom-list__empty"
                style={{ color: "var(--color-error, red)" }}
              >
                {rosterGamifyError}
              </p>
            )}
            {!rosterGamifySummary && (
              <>
                <div className="classroom-list__create-field">
                  <label htmlFor="roster-xp-amount">XP amount</label>
                  <input
                    id="roster-xp-amount"
                    type="number"
                    min={1}
                    max={10_000}
                    className="classroom-list__create-input"
                    value={rosterGamifyXpAmount}
                    onChange={(e) => setRosterGamifyXpAmount(e.target.value)}
                  />
                </div>
                <div className="classroom-list__create-field">
                  <label htmlFor="roster-xp-reason">Reason</label>
                  <input
                    id="roster-xp-reason"
                    type="text"
                    className="classroom-list__create-input"
                    value={rosterGamifyXpReason}
                    onChange={(e) => setRosterGamifyXpReason(e.target.value)}
                    placeholder="Shown on the student timeline"
                  />
                </div>
              </>
            )}
          </ModalDialog>

          <ModalDialog
            isOpen={rosterGamifyModal === "assign"}
            onClose={() => !rosterGamifyBusy && closeRosterGamifyModal()}
            title="Award badge"
            ariaLabel="Award badge to students"
            contentClassName="classroom-list__create-form classroom-list__create-form--dialog classroom-detail__end-dialog"
            closeVariant="neutral"
            disableClose={rosterGamifyBusy}
            footer={
              <div className="classroom-list__create-actions">
                <button
                  type="button"
                  className="classroom-list__create-btn classroom-list__create-btn--ghost"
                  onClick={closeRosterGamifyModal}
                  disabled={rosterGamifyBusy}
                >
                  {rosterGamifySummary ? "Close" : "Cancel"}
                </button>
                {!rosterGamifySummary ? (
                  <button
                    type="button"
                    className="classroom-list__create-btn"
                    disabled={
                      rosterGamifyBusy || rosterBadgeOptions.length === 0
                    }
                    onClick={() => void applyRosterAssignBadges()}
                  >
                    {rosterGamifyBusy ? "Applying…" : "Award badge"}
                  </button>
                ) : null}
              </div>
            }
          >
            <p className="classroom-detail__end-dialog-copy">
              <strong>{rosterGamifyTargets.length}</strong> student
              {rosterGamifyTargets.length !== 1 ? "s" : ""}. Students who
              already have this badge are skipped.
            </p>
            {rosterGamifySummary && (
              <p className="classroom-detail__roster-gamify-summary">
                {rosterGamifySummary}
              </p>
            )}
            {rosterGamifyError && (
              <p
                className="classroom-list__empty"
                style={{ color: "var(--color-error, red)" }}
              >
                {rosterGamifyError}
              </p>
            )}
            {!rosterGamifySummary && rosterBadgeOptions.length > 0 && (
              <div className="classroom-list__create-field">
                <label htmlFor="roster-badge-assign">Badge</label>
                <KidDropdown
                  value={rosterGamifyBadgeSlug}
                  onChange={setRosterGamifyBadgeSlug}
                  ariaLabel="Select badge to award"
                  placeholder="Choose a badge"
                  fullWidth
                  options={rosterBadgeOptions.map((b) => ({
                    value: b.slug,
                    label: `${b.name} (+${b.xp_reward} XP)`,
                  }))}
                />
              </div>
            )}
            {!rosterGamifySummary && rosterBadgeOptions.length === 0 && (
              <p className="classroom-list__empty">
                No badges available. Create badge definitions for your tenant
                first.
              </p>
            )}
          </ModalDialog>

          <ModalDialog
            isOpen={rosterGamifyModal === "revoke"}
            onClose={() => !rosterGamifyBusy && closeRosterGamifyModal()}
            title="Remove badge"
            ariaLabel="Remove badge from students"
            contentClassName="classroom-list__create-form classroom-list__create-form--dialog classroom-detail__end-dialog"
            closeVariant="neutral"
            disableClose={rosterGamifyBusy}
            footer={
              <div className="classroom-list__create-actions">
                <button
                  type="button"
                  className="classroom-list__create-btn classroom-list__create-btn--ghost"
                  onClick={closeRosterGamifyModal}
                  disabled={rosterGamifyBusy}
                >
                  {rosterGamifySummary ? "Close" : "Cancel"}
                </button>
                {!rosterGamifySummary ? (
                  <button
                    type="button"
                    className="classroom-list__create-btn classroom-list__create-btn--danger"
                    disabled={
                      rosterGamifyBusy || rosterBadgeOptions.length === 0
                    }
                    onClick={() => void applyRosterRevokeBadges()}
                  >
                    {rosterGamifyBusy ? "Removing…" : "Remove badge"}
                  </button>
                ) : null}
              </div>
            }
          >
            <p className="classroom-detail__end-dialog-copy">
              Removes the badge from the profile for{" "}
              <strong>{rosterGamifyTargets.length}</strong> student
              {rosterGamifyTargets.length !== 1 ? "s" : ""}. XP already earned
              from that badge is not taken back.
            </p>
            {rosterGamifySummary && (
              <p className="classroom-detail__roster-gamify-summary">
                {rosterGamifySummary}
              </p>
            )}
            {rosterGamifyError && (
              <p
                className="classroom-list__empty"
                style={{ color: "var(--color-error, red)" }}
              >
                {rosterGamifyError}
              </p>
            )}
            {!rosterGamifySummary && rosterBadgeOptions.length > 0 && (
              <div className="classroom-list__create-field">
                <label htmlFor="roster-badge-revoke">Badge to remove</label>
                <KidDropdown
                  value={rosterGamifyBadgeSlug}
                  onChange={setRosterGamifyBadgeSlug}
                  ariaLabel="Select badge to remove"
                  placeholder="Choose a badge"
                  fullWidth
                  options={rosterBadgeOptions.map((b) => ({
                    value: b.slug,
                    label: b.name,
                  }))}
                />
              </div>
            )}
            {!rosterGamifySummary && rosterBadgeOptions.length === 0 && (
              <p className="classroom-list__empty">
                No badges in the catalogue to remove.
              </p>
            )}
          </ModalDialog>

          {/* ── Grading Modal ──────────────────────────────────────────────── */}
          <ModalDialog
            isOpen={Boolean(gradingSubmission)}
            onClose={() => setGradingSubmission(null)}
            title="Grade submission"
            ariaLabel="Grade submission"
            contentClassName="classroom-list__create-form classroom-list__create-form--dialog classroom-detail__end-dialog"
            closeVariant="neutral"
            disableClose={savingGrade}
            footer={
              gradingSubmission ? (
                <div className="classroom-list__create-actions">
                  <button
                    type="button"
                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                    onClick={() => setGradingSubmission(null)}
                    disabled={savingGrade}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="classroom-list__create-btn"
                    disabled={savingGrade || !gradeScore}
                    onClick={() => {
                      if (!id || !selectedAssignment) return;
                      setSavingGrade(true);
                      setGradeError(null);
                      let rubricPayload: RubricCriterionPayload[] | undefined;
                      try {
                        rubricPayload = buildGradeRubricPayload(gradeRubricRows);
                      } catch (e: unknown) {
                        setGradeError(
                          e instanceof Error ? e.message : "Invalid rubric",
                        );
                        setSavingGrade(false);
                        return;
                      }
                      void gradeSubmission(
                        id,
                        selectedAssignment.session_id,
                        gradingSubmission.event_id,
                        {
                          score: Number(gradeScore),
                          feedback: gradeFeedback || null,
                          assignment_id: gradingSubmission.assignment_id,
                          ...(rubricPayload?.length
                            ? { rubric: rubricPayload }
                            : {}),
                        },
                      )
                        .then(() => {
                          setAssignmentSubmissions((prev) =>
                            prev.map((s) =>
                              s.event_id === gradingSubmission.event_id
                                ? {
                                    ...s,
                                    grade: Number(gradeScore),
                                    feedback: gradeFeedback || null,
                                    rubric: rubricPayload ?? null,
                                  }
                                : s,
                            ),
                          );
                          setGradingSubmission(null);
                        })
                        .catch((e: unknown) => {
                          setGradeError(
                            e instanceof Error
                              ? e.message
                              : "Failed to save grade",
                          );
                        })
                        .finally(() => setSavingGrade(false));
                    }}
                  >
                    {savingGrade ? "Saving..." : "Save grade"}
                  </button>
                </div>
              ) : null
            }
          >
            {gradingSubmission ? (
              <>
                <p
                  className="classroom-detail__end-dialog-copy"
                  style={{ marginBottom: 8 }}
                >
                  Student:{" "}
                  <strong>
                    {gradingSubmission.student_display_name ??
                      gradingSubmission.student_id}
                  </strong>
                </p>
                <pre
                  className="classroom-detail__sub-content"
                  style={{ marginBottom: 16 }}
                >
                  {gradingSubmission.content || "(no content)"}
                </pre>
                {gradeError && (
                  <p
                    className="classroom-list__empty"
                    style={{ color: "var(--color-error, red)" }}
                  >
                    {gradeError}
                  </p>
                )}
                <div className="classroom-list__create-field">
                  <label htmlFor="grade-score">Score (0-100)</label>
                  <input
                    id="grade-score"
                    type="number"
                    min={0}
                    max={100}
                    className="classroom-list__create-input"
                    value={gradeScore}
                    onChange={(e) => setGradeScore(e.target.value)}
                  />
                </div>
                <div className="classroom-list__create-field">
                  <label htmlFor="grade-feedback">Feedback (optional)</label>
                  <textarea
                    id="grade-feedback"
                    className="classroom-list__create-input classroom-detail__textarea"
                    rows={3}
                    value={gradeFeedback}
                    onChange={(e) => setGradeFeedback(e.target.value)}
                    placeholder="Leave feedback for the student..."
                  />
                </div>
                <div className="classroom-detail__grade-rubric">
                  <div className="classroom-detail__grade-rubric-header">
                    <span id="grade-rubric-heading">Rubric breakdown (optional)</span>
                    <button
                      type="button"
                      className="classroom-list__create-btn classroom-list__create-btn--ghost"
                      onClick={() =>
                        setGradeRubricRows((prev) => [
                          ...prev,
                          {
                            id: newRubricRowId(),
                            criterion_id: "",
                            label: "",
                            max_points: "10",
                            points_awarded: "10",
                          },
                        ])
                      }
                    >
                      Add criterion
                    </button>
                  </div>
                  <p
                    className="classroom-detail__grade-rubric-hint"
                    id="grade-rubric-desc"
                  >
                    Rows with an id feed organization analytics (compliance vs max points). Leave empty to grade with
                    score only.
                  </p>
                  {gradeRubricRows.length === 0 ? (
                    <p className="classroom-list__empty" style={{ marginTop: 8 }}>
                      No rubric rows — holistic score only.
                    </p>
                  ) : (
                    <ul
                      className="classroom-detail__grade-rubric-list"
                      aria-labelledby="grade-rubric-heading"
                      aria-describedby="grade-rubric-desc"
                    >
                      {gradeRubricRows.map((row, idx) => (
                        <li key={row.id} className="classroom-detail__grade-rubric-row">
                          <div className="classroom-list__create-field">
                            <label htmlFor={`rubric-id-${row.id}`}>Criterion id</label>
                            <input
                              id={`rubric-id-${row.id}`}
                              type="text"
                              className="classroom-list__create-input"
                              value={row.criterion_id}
                              onChange={(e) =>
                                setGradeRubricRows((prev) =>
                                  prev.map((r) =>
                                    r.id === row.id
                                      ? { ...r, criterion_id: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                              placeholder="e.g. clarity"
                              autoComplete="off"
                            />
                          </div>
                          <div className="classroom-list__create-field">
                            <label htmlFor={`rubric-label-${row.id}`}>Label (optional)</label>
                            <input
                              id={`rubric-label-${row.id}`}
                              type="text"
                              className="classroom-list__create-input"
                              value={row.label}
                              onChange={(e) =>
                                setGradeRubricRows((prev) =>
                                  prev.map((r) =>
                                    r.id === row.id ? { ...r, label: e.target.value } : r,
                                  ),
                                )
                              }
                              placeholder="Display name"
                              autoComplete="off"
                            />
                          </div>
                          <div className="classroom-detail__grade-rubric-points">
                            <div className="classroom-list__create-field">
                              <label htmlFor={`rubric-max-${row.id}`}>Max</label>
                              <input
                                id={`rubric-max-${row.id}`}
                                type="number"
                                min={1}
                                max={1000}
                                className="classroom-list__create-input"
                                value={row.max_points}
                                onChange={(e) =>
                                  setGradeRubricRows((prev) =>
                                    prev.map((r) =>
                                      r.id === row.id
                                        ? { ...r, max_points: e.target.value }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </div>
                            <div className="classroom-list__create-field">
                              <label htmlFor={`rubric-pts-${row.id}`}>Earned</label>
                              <input
                                id={`rubric-pts-${row.id}`}
                                type="number"
                                min={0}
                                className="classroom-list__create-input"
                                value={row.points_awarded}
                                onChange={(e) =>
                                  setGradeRubricRows((prev) =>
                                    prev.map((r) =>
                                      r.id === row.id
                                        ? { ...r, points_awarded: e.target.value }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            className="classroom-list__create-btn classroom-list__create-btn--ghost classroom-detail__grade-rubric-remove"
                            onClick={() =>
                              setGradeRubricRows((prev) =>
                                prev.filter((r) => r.id !== row.id),
                              )
                            }
                            aria-label={`Remove rubric row ${idx + 1}`}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : null}
          </ModalDialog>

          <ModalDialog
            isOpen={showEndDialog && Boolean(activeSession)}
            onClose={() => setShowEndDialog(false)}
            title="End active session"
            ariaLabel="End session confirmation"
            contentClassName="classroom-list__create-form classroom-list__create-form--dialog classroom-detail__end-dialog"
            closeVariant="neutral"
            disableClose={endingSession}
            footer={
              <div className="classroom-list__create-actions">
                <button
                  type="button"
                  className="classroom-list__create-btn classroom-list__create-btn--ghost"
                  onClick={() => setShowEndDialog(false)}
                  disabled={endingSession}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="classroom-list__create-btn classroom-list__create-btn--danger"
                  onClick={handleConfirmEndSession}
                  disabled={endingSession}
                >
                  {endingSession
                    ? "Ending..."
                    : forceEndRequired
                      ? "End for all"
                      : "End session"}
                </button>
              </div>
            }
          >
            {forceEndRequired ? (
              <p className="classroom-detail__end-dialog-copy">
                {presenceSummary?.active_students ?? 0} student(s) are still in
                the session. Ending now will end the meeting for everyone.
              </p>
            ) : (
              <p className="classroom-detail__end-dialog-copy">
                No students are currently active in this session. Confirm to end
                it now.
              </p>
            )}
          </ModalDialog>

          {classroom && id ? (
            <ClassroomFormWizard
              mode="edit"
              isOpen={showClassroomEditWizard}
              onClose={() => setShowClassroomEditWizard(false)}
              navigate={navigate}
              editClassroomId={id}
              initialClassroomSnapshot={classroom}
              onSuccess={(updated) => {
                setClassroom(updated);
              }}
            />
          ) : null}

          {/* ── Session Resources Panel ───────────────────────────────────────── */}
          {resourcesSession && (
            <div
              className="classroom-list__dialog-overlay"
              onClick={() => setResourcesSession(null)}
            >
              <div
                className="classroom-list__create-form classroom-list__create-form--dialog classroom-detail__resources-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Session resources"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="classroom-list__dialog-close classroom-detail__dialog-close--neutral"
                  onClick={() => setResourcesSession(null)}
                  aria-label="Close"
                >
                  <X size={28} aria-hidden />
                </button>
                <h3 className="classroom-list__create-title">
                  Session resources
                  <span className="classroom-detail__resources-date">
                    {" — "}
                    {new Date(
                      resourcesSession.session_start,
                    ).toLocaleDateString()}
                  </span>
                </h3>

                {!isContentWindowOpen(resourcesSession) && (
                  <p className="classroom-detail__window-warning">
                    The edit window for this session has closed. You can no
                    longer add resources.
                  </p>
                )}

                {resourcesError && (
                  <p className="classroom-list__empty classroom-detail__dialog-error">
                    {resourcesError}
                  </p>
                )}

                {/* Files section */}
                <div className="classroom-detail__resources-section">
                  <div className="classroom-detail__resources-section-header">
                    <h4>Files</h4>
                    {isContentWindowOpen(resourcesSession) && (
                      <div className="classroom-detail__resources-header-actions">
                        <button
                          type="button"
                          className="classroom-list__create-btn classroom-list__create-btn--ghost classroom-detail__resources-add-btn"
                          onClick={() => void handleOpenAssetLibrary()}
                          disabled={libraryLoading}
                        >
                          <FileText size={14} aria-hidden />
                          Add from assets
                        </button>
                        <button
                          type="button"
                          className="classroom-list__create-btn classroom-list__create-btn--ghost classroom-detail__resources-add-btn"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={resourcesUploading}
                        >
                          <Upload size={14} aria-hidden />
                          {resourcesUploading ? "Uploading..." : "Upload file"}
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: "none" }}
                    onChange={(e) => void handleFileUpload(e)}
                  />
                  {(() => {
                    const sharedIds =
                      resourcesSession.session_content?.shared_asset_ids ?? [];
                    const downloadIds =
                      resourcesSession.session_content
                        ?.downloadable_asset_ids ?? [];
                    const allIds = Array.from(
                      new Set([...sharedIds, ...downloadIds]),
                    );
                    const entriesByAsset = new Map(
                      (
                        resourcesSession.session_content?.resource_entries ?? []
                      ).map((entry) => [entry.asset_id, entry]),
                    );
                    return allIds.length === 0 ? (
                      <p className="classroom-list__empty">
                        No files attached yet.
                      </p>
                    ) : (
                      <ul className="classroom-detail__resources-list">
                        {allIds.map((assetId) => (
                          <li
                            key={assetId}
                            className="classroom-detail__resource-file-item"
                          >
                            <div className="classroom-detail__resource-file-meta">
                              <span className="classroom-detail__resource-file-name">
                                {entriesByAsset.get(assetId)?.name ??
                                  resourceNameById[assetId] ??
                                  resourceUploadedAssets.find(
                                    (a) => a.id === assetId,
                                  )?.name ??
                                  (resolvingResourceNames
                                    ? "Loading filename..."
                                    : "Filename unavailable")}
                              </span>
                              <span className="classroom-detail__resource-file-byline">
                                {entriesByAsset.get(assetId)?.attached_by_name
                                  ? `Added by ${entriesByAsset.get(assetId)?.attached_by_name}`
                                  : "Added to session"}
                                {entriesByAsset.get(assetId)?.attached_at
                                  ? ` • ${new Date(entriesByAsset.get(assetId)!.attached_at!).toLocaleString()}`
                                  : ""}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>

                {/* Assignments section */}
                <div className="classroom-detail__resources-section">
                  <div className="classroom-detail__resources-section-header">
                    <h4>Assignments</h4>
                    {!showAssignmentForm && (
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--ghost classroom-detail__resources-add-btn"
                        onClick={openAssignmentForm}
                      >
                        <Plus size={14} aria-hidden />
                        Add assignment
                      </button>
                    )}
                  </div>

                  {(() => {
                    const assignments =
                      resourcesSession.session_content?.text_assignments ?? [];
                    return assignments.length === 0 ? (
                      <p className="classroom-list__empty">
                        No assignments for this session.
                      </p>
                    ) : (
                      <ul className="classroom-detail__resources-list">
                        {assignments.map((a) => (
                          <li
                            key={a.id}
                            className="classroom-detail__resource-assign-item"
                          >
                            <div className="classroom-detail__resource-assign-info">
                              <strong>{a.title}</strong>
                              {a.instructions && <p>{a.instructions}</p>}
                              {a.due_at && (
                                <span className="classroom-detail__resource-assign-due">
                                  Due: {new Date(a.due_at).toLocaleDateString()}
                                </span>
                              )}
                              {a.created_by_name && (
                                <span className="classroom-detail__resource-assign-due">
                                  Added by {a.created_by_name}
                                </span>
                              )}
                              {(a.requires_lab || a.requires_assets) && (
                                <span className="classroom-detail__resource-assign-due">
                                  Requirement:{" "}
                                  {a.requires_lab && a.requires_assets
                                    ? "Lab + assets"
                                    : a.requires_lab
                                      ? "Lab"
                                      : "Assets"}
                                </span>
                              )}
                              {!a.allow_edit_after_submit && (
                                <span className="classroom-detail__resource-assign-due">
                                  Submitted work is locked for edits
                                </span>
                              )}
                            </div>
                            {isContentWindowOpen(resourcesSession) && (
                              <button
                                type="button"
                                className="classroom-detail__icon-btn classroom-detail__icon-btn--danger"
                                onClick={() =>
                                  void handleRemoveTextAssignment(a.id)
                                }
                                aria-label={`Remove assignment ${a.title}`}
                              >
                                <Trash2 size={14} aria-hidden />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          <ModalDialog
            isOpen={showAssignmentForm && Boolean(resourcesSession)}
            onClose={() => !addingAssignment && setShowAssignmentForm(false)}
            title="Add assignment"
            ariaLabel="Add assignment"
            contentClassName="classroom-list__create-form classroom-list__create-form--dialog classroom-detail__assignment-create-dialog"
            closeVariant="neutral"
            disableClose={addingAssignment}
            footer={
              <div className="classroom-list__create-actions">
                <button
                  type="button"
                  className="classroom-list__create-btn classroom-list__create-btn--ghost"
                  onClick={() => {
                    setShowAssignmentForm(false);
                    setNewAssignmentTitle("");
                    setNewAssignmentInstructions("");
                    setNewAssignmentDueAt("");
                    setNewAssignmentLabId("");
                    setNewAssignmentRequirement("none");
                    setNewAssignmentAllowEditAfterSubmit(false);
                    setSelectedAssignmentTemplateId("");
                  }}
                  disabled={addingAssignment}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="classroom-list__create-btn"
                  onClick={() => void handleAddTextAssignment()}
                  disabled={
                    addingAssignment ||
                    (!selectedAssignmentTemplateId && !newAssignmentTitle.trim())
                  }
                >
                  {addingAssignment ? "Adding..." : "Add assignment"}
                </button>
              </div>
            }
          >
            {resourcesSession ? (
              <>
                <p className="classroom-detail__resources-date">
                  Session: {new Date(resourcesSession.session_start).toLocaleDateString()}
                </p>
                {!isContentWindowOpen(resourcesSession) && (
                  <p className="classroom-detail__window-warning">
                    This session is closed for manual edits. You can still add an assignment from an existing template.
                  </p>
                )}
                <div className="classroom-list__create-field">
                  <label>Existing assignment template (optional)</label>
                  <SearchableDropdown
                    value={selectedAssignmentTemplateId}
                    onChange={setSelectedAssignmentTemplateId}
                    ariaLabel="Choose assignment template"
                    placeholder={
                      assignmentTemplatesLoading
                        ? "Loading templates..."
                        : "Select an existing template"
                    }
                    searchPlaceholder="Search templates..."
                    emptyLabel="No templates found"
                    fullWidth
                    options={assignmentTemplates.map((template) => ({
                      value: template.id,
                      label: template.title,
                      searchText: `${template.instructions ?? ""} ${template.course_id ?? ""} ${template.lesson_id ?? ""}`,
                    }))}
                  />
                </div>
                <div className="classroom-list__create-field">
                  <label htmlFor="new-assign-title">Title</label>
                  <input
                    id="new-assign-title"
                    type="text"
                    className="classroom-list__create-input"
                    value={newAssignmentTitle}
                    onChange={(e) => setNewAssignmentTitle(e.target.value)}
                    placeholder={
                      selectedAssignmentTemplateId
                        ? "Optional title override"
                        : "Assignment title"
                    }
                    autoFocus
                    disabled={
                      !isContentWindowOpen(resourcesSession) &&
                      !selectedAssignmentTemplateId
                    }
                  />
                </div>
                {isContentWindowOpen(resourcesSession) && (
                  <>
                    <div className="classroom-list__create-field">
                      <label>Submission requirement</label>
                      <KidDropdown
                        value={newAssignmentRequirement}
                        onChange={(value) => {
                          const next =
                            value as "none" | "lab" | "assets" | "both";
                          setNewAssignmentRequirement(next);
                          if (
                            (next === "lab" || next === "both") &&
                            !newAssignmentLabId
                          ) {
                            setNewAssignmentLabId(
                              selectedSessionLab || permittedLabs[0] || "",
                            );
                          }
                        }}
                        ariaLabel="Assignment requirement type"
                        minWidth={240}
                        options={[
                          { value: "none", label: "Flexible (no requirement)" },
                          { value: "lab", label: "Requires lab" },
                          { value: "assets", label: "Requires assets/files" },
                          { value: "both", label: "Requires lab + assets" },
                        ]}
                      />
                    </div>
                    <div className="classroom-list__create-field">
                      <KidCheckbox
                        checked={newAssignmentAllowEditAfterSubmit}
                        onChange={setNewAssignmentAllowEditAfterSubmit}
                      >
                        Allow edits after student submits
                      </KidCheckbox>
                    </div>
                    {permittedLabs.length > 0 &&
                      (newAssignmentRequirement === "lab" ||
                        newAssignmentRequirement === "both") && (
                        <div className="classroom-list__create-field">
                          <label>Linked lab</label>
                          <KidDropdown
                            value={newAssignmentLabId}
                            onChange={setNewAssignmentLabId}
                            ariaLabel="Select a lab for this assignment"
                            minWidth={240}
                            options={[
                              { value: "", label: "No lab" },
                              ...permittedLabs.map((lab) => ({
                                value: lab,
                                label: lab
                                  .replace(/-/g, " ")
                                  .replace(/\b\w/g, (c) => c.toUpperCase()),
                              })),
                            ]}
                          />
                        </div>
                      )}
                    <div className="classroom-list__create-field">
                      <label htmlFor="new-assign-instructions">Instructions</label>
                      <textarea
                        id="new-assign-instructions"
                        className="classroom-list__create-input classroom-detail__textarea"
                        value={newAssignmentInstructions}
                        onChange={(e) =>
                          setNewAssignmentInstructions(e.target.value)
                        }
                        placeholder="Describe what students need to do"
                        rows={3}
                      />
                    </div>
                  </>
                )}
                <div className="classroom-list__create-field">
                  <label htmlFor="new-assign-due">Due date & time (optional)</label>
                  <DateTimePicker
                    id="new-assign-due"
                    value={newAssignmentDueAt}
                    onChange={setNewAssignmentDueAt}
                    datePlaceholder="Pick due date"
                    timePlaceholder="Pick due time"
                  />
                </div>
              </>
            ) : null}
          </ModalDialog>

          {showAssetLibrary && resourcesSession && (
            <div
              className="classroom-list__dialog-overlay"
              onClick={() => setShowAssetLibrary(false)}
            >
              <div
                className="classroom-detail__asset-search-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Select asset"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="classroom-detail__asset-search-header">
                  <div className="classroom-detail__asset-search-title">
                    <FileText size={20} aria-hidden />
                    <span>Select Asset</span>
                  </div>
                  <button
                    type="button"
                    className="classroom-detail__asset-search-close"
                    onClick={() => setShowAssetLibrary(false)}
                    aria-label="Close search dialog"
                  >
                    <X size={20} aria-hidden />
                  </button>
                </header>

                <div className="classroom-detail__asset-search-controls">
                  <KidDropdown
                    value={libraryTypeFilter}
                    onChange={setLibraryTypeFilter}
                    ariaLabel="Filter by asset type"
                    minWidth={180}
                    options={assetTypeDropdownOptions}
                  />
                  <input
                    type="text"
                    className="classroom-list__create-input"
                    placeholder="Enter search keyword(s)"
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    aria-label="Search assets"
                  />
                  <button
                    type="button"
                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                    aria-label="Search assets"
                  >
                    <Search size={16} aria-hidden />
                    Search
                  </button>
                </div>

                <div className="classroom-detail__asset-search-body">
                  <section>
                    <h4>Recently Used</h4>
                    {recentlyUsedAssets.length === 0 ? (
                      <p className="classroom-list__empty">
                        No recently used assets for this session.
                      </p>
                    ) : (
                      <ul
                        className="classroom-detail__asset-search-list"
                        role="list"
                      >
                        {recentlyUsedAssets.map((asset) => (
                          <li
                            key={`recent-${asset.id}`}
                            className={`classroom-detail__asset-search-item ${selectedLibraryAssetId === asset.id ? "is-selected" : ""}`}
                            onClick={() => setSelectedLibraryAssetId(asset.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedLibraryAssetId(asset.id);
                              }
                            }}
                          >
                            <span
                              className="classroom-detail__asset-search-radio"
                              aria-hidden
                            />
                            <div className="classroom-detail__asset-search-meta">
                              <strong>{asset.name}</strong>
                              <span>{asset.asset_type}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <h4>Asset Library</h4>
                    {libraryLoading ? (
                      <p className="classroom-list__empty">Loading assets...</p>
                    ) : filteredLibraryAssets.length === 0 ? (
                      <p className="classroom-list__empty">
                        No assets match your search.
                      </p>
                    ) : (
                      <ul
                        className="classroom-detail__asset-search-list"
                        role="list"
                      >
                        {filteredLibraryAssets.slice(0, 30).map((asset) => (
                          <li
                            key={asset.id}
                            className={`classroom-detail__asset-search-item ${selectedLibraryAssetId === asset.id ? "is-selected" : ""}`}
                            onClick={() => setSelectedLibraryAssetId(asset.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedLibraryAssetId(asset.id);
                              }
                            }}
                          >
                            <span
                              className="classroom-detail__asset-search-radio"
                              aria-hidden
                            />
                            <div className="classroom-detail__asset-search-meta">
                              <strong>{asset.name}</strong>
                              <span>{asset.asset_type}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>

                <footer className="classroom-detail__asset-search-footer">
                  <button
                    type="button"
                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                    onClick={() => setShowAssetLibrary(false)}
                    disabled={Boolean(attachingAssetId)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="classroom-list__create-btn"
                    onClick={() => void handleConfirmAttachLibraryAsset()}
                    disabled={
                      !selectedLibraryAssetId || Boolean(attachingAssetId)
                    }
                  >
                    {attachingAssetId ? "Attaching..." : "Select"}
                  </button>
                </footer>
              </div>
            </div>
          )}

          {/* ── Student Assignment View ───────────────────────────────────────── */}
          {viewingAssignment && viewingAssignmentSession && (
            <div
              className="classroom-list__dialog-overlay"
              onClick={() => {
                setViewingAssignment(null);
                setViewingAssignmentSession(null);
                setLabProjectPickerOpen(false);
                setLabProjectPickerRows([]);
              }}
            >
              <div
                className="classroom-detail__assignment-view"
                role="dialog"
                aria-modal="true"
                aria-label={viewingAssignment.title}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="classroom-detail__av-header">
                  <div className="classroom-detail__av-header-top">
                    <div>
                      <h2 className="classroom-detail__av-title">
                        {viewingAssignment.title}
                      </h2>
                      <p className="classroom-detail__av-session-date">
                        {new Date(
                          viewingAssignmentSession.session_start,
                        ).toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="classroom-list__dialog-close classroom-detail__av-close"
                      onClick={() => {
                        setViewingAssignment(null);
                        setViewingAssignmentSession(null);
                        setLabProjectPickerOpen(false);
                        setLabProjectPickerRows([]);
                      }}
                      aria-label="Close"
                    >
                      <X size={24} aria-hidden />
                    </button>
                  </div>
                  {viewingAssignment.due_at && (
                    <div className="classroom-detail__av-due">
                      <Clock size={14} aria-hidden />
                      Due{" "}
                      {new Date(viewingAssignment.due_at).toLocaleDateString(
                        undefined,
                        { weekday: "short", month: "short", day: "numeric" },
                      )}
                    </div>
                  )}
                </div>

                <div className="classroom-detail__av-body">
                  {/* Instructions */}
                  {viewingAssignment.instructions && (
                    <section className="classroom-detail__av-section">
                      <h3 className="classroom-detail__av-section-title">
                        Instructions
                      </h3>
                      <p className="classroom-detail__av-instructions">
                        {viewingAssignment.instructions}
                      </p>
                    </section>
                  )}

                  {/* Lab link */}
                  {viewingAssignment.lab_id && (
                    <section className="classroom-detail__av-section classroom-detail__av-lab-section">
                      <h3 className="classroom-detail__av-section-title">
                        Lab
                      </h3>
                      {viewingAssignment.requires_lab && (
                        <p className="classroom-detail__resources-label">
                          This assignment requires lab work. We save a draft
                          before opening the lab so you can continue and submit
                          later.
                        </p>
                      )}
                      <button
                        type="button"
                        className="classroom-detail__av-lab-btn"
                        onClick={() => {
                          void handleSaveDraftAndOpenLab();
                        }}
                        disabled={submittingWork}
                      >
                        <LabIcon size={18} aria-hidden />
                        {submittingWork
                          ? "Saving draft..."
                          : "Save draft & open"}{" "}
                        {(viewingAssignment.curriculum_lab_title?.trim() ||
                          viewingAssignment.lab_launcher_id?.trim() ||
                          (!isCurriculumLabUuid(viewingAssignment.lab_id)
                            ? viewingAssignment.lab_id
                            : "lab")) ?? "lab"}
                        <ChevronRight size={16} aria-hidden />
                      </button>
                    </section>
                  )}

                  {/* Session resources */}
                  {(() => {
                    const sharedIds =
                      viewingAssignmentSession.session_content
                        ?.shared_asset_ids ?? [];
                    const dlIds =
                      viewingAssignmentSession.session_content
                        ?.downloadable_asset_ids ?? [];
                    const fileIds = Array.from(
                      new Set([...sharedIds, ...dlIds]),
                    );
                    if (fileIds.length === 0) return null;
                    return (
                      <section className="classroom-detail__av-section">
                        <h3 className="classroom-detail__av-section-title">
                          Session resources
                        </h3>
                        <div className="classroom-detail__av-resource-list">
                          {fileIds.map((assetId, idx) => {
                            const key = `${viewingAssignmentSession.id}:${assetId}`;
                            const loading = materialLoadingKey === key;
                            return (
                              <button
                                key={assetId}
                                type="button"
                                className="classroom-detail__av-resource-btn"
                                onClick={() =>
                                  void openSessionMaterial(
                                    viewingAssignmentSession.id,
                                    assetId,
                                  )
                                }
                                disabled={loading}
                              >
                                <BookOpen size={14} aria-hidden />
                                <span>
                                  {loading ? "Opening…" : `Resource ${idx + 1}`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })()}

                  {!isInstructorView && (
                    <section className="classroom-detail__av-section">
                      <h3 className="classroom-detail__av-section-title">
                        Saved drafts
                      </h3>
                      {loadingSavedSubmissions ? (
                        <p className="classroom-detail__resources-label">
                          Loading drafts...
                        </p>
                      ) : savedSubmissions.length === 0 ? (
                        <p className="classroom-detail__resources-label">
                          No saved drafts yet.
                        </p>
                      ) : (
                        <>
                          <div className="classroom-detail__sub-board-toolbar classroom-detail__sub-board-toolbar--student">
                            <div className="classroom-detail__sub-board-select-row">
                              <KidCheckbox
                                compact
                                ariaLabel="Select all my drafts"
                                checked={
                                  savedSubmissions.length > 0 &&
                                  savedSubmissions.every((r) =>
                                    selectedDraftIds.has(r.event_id),
                                  )
                                }
                                onChange={(on) => {
                                  if (on) {
                                    setSelectedDraftIds(
                                      new Set(
                                        savedSubmissions.map((r) => r.event_id),
                                      ),
                                    );
                                  } else {
                                    setSelectedDraftIds(new Set());
                                  }
                                }}
                              />
                              <span className="classroom-detail__sub-board-select-label">
                                Select all
                              </span>
                              <KidDropdown
                                value={draftAction}
                                onChange={(v) => {
                                  if (v === "__noop__") return;
                                  if (v === "export_json")
                                    runDraftBulkExportJson();
                                  if (v === "download_snaps")
                                    void runDraftBulkDownloadSnapshots();
                                  if (v === "clear_sel")
                                    setSelectedDraftIds(new Set());
                                  setDraftAction("__noop__");
                                }}
                                ariaLabel="Actions on selected drafts"
                                placeholder="Actions…"
                                minWidth={200}
                                disabled={selectedDraftIds.size === 0}
                                options={[
                                  {
                                    value: "export_json",
                                    label: "Export selected (JSON)",
                                  },
                                  {
                                    value: "download_snaps",
                                    label: "Download snapshots",
                                  },
                                  {
                                    value: "clear_sel",
                                    label: "Clear selection",
                                  },
                                ]}
                              />
                            </div>
                          </div>
                          <div className="classroom-detail__sub-design-grid classroom-detail__sub-design-grid--student">
                            {savedSubmissions.map((sub) => {
                              const parsed = parseSubmissionPayload(sub.content);
                              const labToOpen =
                                parsed.labId || viewingAssignment.lab_id;
                              const picked = selectedDraftIds.has(sub.event_id);
                              return (
                                <div
                                  key={sub.event_id}
                                  className="classroom-detail__sub-design-card"
                                >
                                  <div className="classroom-detail__sub-design-card__chrome">
                                    <KidCheckbox
                                      compact
                                      ariaLabel="Select this draft"
                                      checked={picked}
                                      onChange={(on) => {
                                        setSelectedDraftIds((prev) => {
                                          const next = new Set(prev);
                                          if (on) next.add(sub.event_id);
                                          else next.delete(sub.event_id);
                                          return next;
                                        });
                                      }}
                                    />
                                  </div>
                                  <SubmissionSnapshotViewport
                                    imageSrc={sub.preview_image}
                                    label="My lab snapshot"
                                  />
                                  <div className="classroom-detail__sub-design-card__meta">
                                    <div className="classroom-detail__sub-design-card__title-row">
                                      <span className="classroom-detail__sub-design-card__student">
                                        {sub.status === "submitted"
                                          ? "Submitted"
                                          : "Draft"}
                                      </span>
                                    </div>
                                    <p className="classroom-detail__sub-design-card__edited">
                                      {new Date(
                                        sub.submitted_at,
                                      ).toLocaleString()}
                                    </p>
                                    {(sub.grade != null || sub.feedback) && (
                                      <p className="classroom-detail__resources-label">
                                        {sub.grade != null
                                          ? `Grade: ${sub.grade}/100`
                                          : ""}
                                        {sub.grade != null && sub.feedback
                                          ? " — "
                                          : ""}
                                        {sub.feedback
                                          ? `Feedback: ${sub.feedback}`
                                          : ""}
                                      </p>
                                    )}
                                    <div className="classroom-detail__resources-header-actions">
                                      <button
                                        type="button"
                                        className="classroom-list__create-btn classroom-list__create-btn--ghost classroom-detail__resources-add-btn"
                                        onClick={() => {
                                          setSubmissionText(parsed.note);
                                          setSubmissionAssetId(parsed.assetId);
                                          setSubmissionAssetName(
                                            parsed.assetName,
                                          );
                                        }}
                                        disabled={
                                          submissionLocked &&
                                          sub.status === "submitted"
                                        }
                                      >
                                        {submissionLocked &&
                                        sub.status === "submitted"
                                          ? "Locked"
                                          : "Load"}
                                      </button>
                                      {labToOpen &&
                                        (() => {
                                          const ln = resolveAssignmentLabLauncher({
                                            lab_launcher_id:
                                              viewingAssignment.lab_launcher_id,
                                            lab_id: labToOpen,
                                          });
                                          return ln ? (
                                            <button
                                              type="button"
                                              className="classroom-list__create-btn classroom-list__create-btn--ghost classroom-detail__resources-add-btn"
                                              onClick={() =>
                                                navigate(
                                                  buildLabLaunchPath(ln, {
                                                    classroomId: id!,
                                                    sessionId:
                                                      viewingAssignmentSession.id,
                                                    referrer: "assignment_view",
                                                    assignmentId:
                                                      viewingAssignment.id,
                                                    curriculumLabId:
                                                      isCurriculumLabUuid(labToOpen)
                                                        ? labToOpen
                                                        : undefined,
                                                  }),
                                                )
                                              }
                                            >
                                              Open lab
                                            </button>
                                          ) : null;
                                        })()}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </section>
                  )}

                  {/* Submission area */}
                  <section className="classroom-detail__av-section classroom-detail__av-submit-section">
                    <div className="classroom-detail__av-submit-header">
                      <h3 className="classroom-detail__av-section-title">
                        Your work
                      </h3>
                      {submitSuccess && (
                        <span className="classroom-detail__av-submit-success">
                          <CheckCircle2 size={14} aria-hidden /> Submitted!
                        </span>
                      )}
                    </div>
                    {(viewingAssignment.requires_lab ||
                      viewingAssignment.requires_assets) && (
                      <p className="classroom-detail__resources-label">
                        Requirement:{" "}
                        {viewingAssignment.requires_lab &&
                        viewingAssignment.requires_assets
                          ? "Lab + asset upload"
                          : viewingAssignment.requires_lab
                            ? "Lab work"
                            : "Asset upload"}
                      </p>
                    )}
                    {!viewingAssignment.allow_edit_after_submit && (
                      <p className="classroom-detail__resources-label">
                        Submitted work is locked. You can continue editing only
                        while it is in draft.
                      </p>
                    )}
                    {latestFeedbackSubmission && (
                      <div className="classroom-detail__teacher-feedback">
                        <strong>Teacher feedback</strong>
                        <p style={{ margin: "6px 0 0" }}>
                          {latestFeedbackSubmission.grade != null
                            ? `Grade: ${latestFeedbackSubmission.grade}/100`
                            : "Grade pending"}
                          {latestFeedbackSubmission.feedback
                            ? ` - ${latestFeedbackSubmission.feedback}`
                            : ""}
                        </p>
                      </div>
                    )}
                    {submissionLocked && latestSubmittedSubmission && (
                      <p className="classroom-detail__resources-label">
                        This submission was finalized on{" "}
                        {new Date(
                          latestSubmittedSubmission.submitted_at,
                        ).toLocaleString()}
                        . Editing is disabled for this assignment.
                      </p>
                    )}

                    {submissionAssetId ? (
                      <div className="classroom-detail__av-file-attached">
                        <BookOpen size={14} aria-hidden />
                        <span>{submissionAssetName ?? "File attached"}</span>
                        <button
                          type="button"
                          className="classroom-detail__av-remove-file"
                          onClick={() => {
                            setSubmissionAssetId(null);
                            setSubmissionAssetName(null);
                          }}
                          disabled={submissionLocked}
                        >
                          <X size={12} aria-hidden />
                        </button>
                      </div>
                    ) : null}

                    <textarea
                      className="classroom-detail__av-submit-textarea"
                      placeholder="Add a note, explain your approach, or paste a link…"
                      value={submissionText}
                      onChange={(e) => setSubmissionText(e.target.value)}
                      rows={4}
                      disabled={submissionLocked}
                    />

                    {submitError && (
                      <p className="classroom-detail__dialog-error">
                        {submitError}
                      </p>
                    )}

                    <input
                      ref={submissionFileRef}
                      type="file"
                      accept="video/*,image/*,.pdf,.zip,.py,.js,.ts,.txt"
                      style={{ display: "none" }}
                      onChange={(e) => void handleSubmissionFileUpload(e)}
                    />

                    <div className="classroom-detail__av-submit-actions">
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--ghost classroom-detail__av-attach-btn"
                        onClick={() => submissionFileRef.current?.click()}
                        disabled={
                          uploadingSubmissionFile ||
                          submittingWork ||
                          submissionLocked
                        }
                      >
                        <Upload size={14} aria-hidden />
                        {uploadingSubmissionFile
                          ? "Uploading…"
                          : "Attach file / video"}
                      </button>
                      <div className="classroom-detail__av-submit-btns">
                        <button
                          type="button"
                          className="classroom-list__create-btn classroom-list__create-btn--ghost"
                          onClick={() => void handleSubmitWork("draft")}
                          disabled={
                            submittingWork || submitSuccess || submissionLocked
                          }
                        >
                          {submittingWork ? "Saving…" : "Save draft"}
                        </button>
                        <button
                          type="button"
                          className="classroom-list__create-btn"
                          onClick={() => void handleSubmitWork("submitted")}
                          disabled={
                            submittingWork || submitSuccess || submissionLocked
                          }
                        >
                          {submittingWork ? "Submitting…" : "Submit"}
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}

          <ModalDialog
            isOpen={labProjectPickerOpen}
            onClose={() => {
              if (!submittingWork) {
                setLabProjectPickerOpen(false);
                setLabProjectPickerRows([]);
              }
            }}
            title="Use a saved project?"
            ariaLabel="Choose saved lab project"
            backdropClassName="ui-modal__backdrop--stack"
            contentClassName="classroom-list__create-form classroom-list__create-form--dialog"
            disableClose={submittingWork}
            footer={
              <div className="classroom-list__create-actions">
                <button
                  type="button"
                  className="classroom-list__create-btn classroom-list__create-btn--ghost"
                  disabled={submittingWork}
                  onClick={() => {
                    setLabProjectPickerOpen(false);
                    setLabProjectPickerRows([]);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="classroom-list__create-btn"
                  disabled={submittingWork}
                  onClick={() => void runDraftAndLaunch(null)}
                >
                  Start fresh
                </button>
              </div>
            }
          >
            <p className="classroom-detail__resources-label">
              Pick an existing submission for this lab, or start fresh.
            </p>
            <ul className="classroom-detail__lab-project-pick-list" role="list">
              {labProjectPickerRows.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="classroom-detail__lab-project-pick-btn"
                    disabled={submittingWork}
                    onClick={() => void runDraftAndLaunch(p.id)}
                  >
                    <strong>{p.title}</strong>
                    <span>
                      {new Date(p.submitted_at).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ModalDialog>

          <ModalDialog
            isOpen={showEnrollDialog}
            onClose={() => setShowEnrollDialog(false)}
            title="Add student to classroom"
            ariaLabel="Add student to classroom"
            contentClassName="classroom-list__create-form classroom-list__create-form--dialog classroom-detail__enroll-modal"
            closeVariant="neutral"
            disableClose={enrollingStudent}
          >
            <p className="classroom-detail__enroll-copy">
              Select a student to enroll in this classroom.
            </p>

            {loadingStudentsForEnroll ? (
              <p className="classroom-list__empty">Loading students...</p>
            ) : availableStudents.length === 0 ? (
              <p className="classroom-list__empty">
                All active students are already enrolled in this classroom.
              </p>
            ) : (
              <div className="classroom-list__create-field">
                <label htmlFor="classroom-enroll-student">Student</label>
                <KidDropdown
                  value={selectedStudentId}
                  onChange={setSelectedStudentId}
                  ariaLabel="Select student to enroll"
                  minWidth={360}
                  options={studentDropdownOptions}
                />
              </div>
            )}

            {enrollError && (
              <p className="classroom-list__empty">{enrollError}</p>
            )}

            <div className="classroom-list__create-actions">
              <button
                type="button"
                className="classroom-list__create-btn classroom-list__create-btn--ghost"
                onClick={() => setShowEnrollDialog(false)}
                disabled={enrollingStudent}
              >
                Cancel
              </button>
              <button
                type="button"
                className="classroom-list__create-btn"
                onClick={handleConfirmEnrollStudent}
                disabled={
                  enrollingStudent ||
                  loadingStudentsForEnroll ||
                  !selectedStudentId
                }
              >
                {enrollingStudent ? "Adding..." : "Add student"}
              </button>
            </div>
          </ModalDialog>
        </>
      )}
    </div>
  );
}
