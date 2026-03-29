import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  ArrowLeft,
  Video,
  MessageSquare,
  Gift,
  AlertCircle,
  Eye,
  FlaskConical,
  Share2,
  Upload,
  Users,
  ChevronDown,
  ChevronUp,
  Download,
  Trophy,
  FileText,
  Presentation,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  Pencil,
  Plus,
  Maximize2,
  Minimize2,
  Search,
} from "lucide-react";
import { DateTimePicker, KidDropdown, ModalDialog } from "../../components/ui";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import {
  ClassroomRealtimeClient,
  createClassroomSessionActivity,
  createClassroomSessionChat,
  createMySessionChat,
  createMySessionSubmission,
  endClassroomSession,
  getClassroom,
  getMyClassroom,
  getMySessionParticipants,
  getMySessionPresence,
  getMySessionRealtimeSnapshot,
  getClassroomSessionParticipants,
  getClassroomSessionPresence,
  heartbeatMySession,
  heartbeatClassroomSession,
  leaveClassroomSessionKeepalive,
  listClassroomSessionEvents,
  listMySessionRealtimeEvents,
  listMyClassroomSessions,
  listClassroomSessions,
  type RealtimeEventEnvelope,
  type RealtimeSnapshot,
  updateClassroomSessionContent,
  type ClassroomSessionEventRecord,
  type ClassroomRecord,
  type ClassroomSessionRecord,
  type SessionPresenceParticipant,
  type SessionPresenceSummary,
} from "../../lib/api/classrooms";
import {
  getAssetById,
  getAssetLibrary,
  getStudentSessionAssetById,
  inferAssetTypeFromFile,
  uploadAsset,
  type Asset as LibraryAsset,
} from "../../lib/api/assets";
import { buildLabLaunchPath, resolveLabRoute } from "../labs/labRouting";
import "../../components/ui/ui.css";
import "./classrooms.css";
import { RecognitionToast, type RecognitionEvent } from "./RecognitionToast";
import { playAwardSound } from "../labs/labSounds";
import { ApiHttpError } from "../../lib/api/client";
import { rewardEngine } from "../../rewards";
import { useChildContextStudentId } from "../../lib/childContext";

const RECOGNITION_TOAST_TIMEOUT_MS = 12000;

function isLiveSession(session: ClassroomSessionRecord): boolean {
  if (session.status === "canceled" || session.status === "completed") return false;
  const start = new Date(session.session_start).getTime();
  const end = new Date(session.session_end).getTime();
  return start <= Date.now() && Date.now() <= end;
}

type SessionContentKind = "lab" | "pdf" | "slides" | "video" | "document";
type SessionContentSource = "preset" | "library" | "upload";

interface SessionSharedResource {
  id: string;
  title: string;
  kind: SessionContentKind;
  source: SessionContentSource;
  assetType?: string;
}

interface SessionAssignment {
  id: string;
  title: string;
  instructions: string;
  dueAt: string;
}

interface StudentSubmissionState {
  assignmentId: string;
  content: string;
  status: "draft" | "submitted";
  updatedAt: string;
}

function detectContentKind(asset: LibraryAsset): SessionContentKind {
  const type = asset.asset_type.toLowerCase();
  const name = asset.name.toLowerCase();
  if (type.includes("video") || /\.(mp4|mov|webm|mkv)$/i.test(name)) return "video";
  if (name.endsWith(".pdf")) return "pdf";
  if (type.includes("presentation") || /\.(ppt|pptx|key)$/i.test(name)) return "slides";
  return "document";
}

function isOfficePresentation(title: string): boolean {
  return /\.(ppt|pptx|key)$/i.test(title);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function ClassroomLiveSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role, isSuperAdmin, isAuthenticated } = useAuth();
  const { tenant } = useTenant();

  const [classroom, setClassroom] = useState<ClassroomRecord | null>(null);
  const [sessions, setSessions] = useState<ClassroomSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [presenceSummary, setPresenceSummary] = useState<SessionPresenceSummary | null>(null);
  const [participants, setParticipants] = useState<SessionPresenceParticipant[]>([]);
  const [helpRequests, setHelpRequests] = useState<Record<string, { note: string; ts: string }>>({});
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantBonusPreset, setParticipantBonusPreset] = useState("5");
  const [selectedSessionLab, setSelectedSessionLab] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showResourceDialog, setShowResourceDialog] = useState(false);
  const [showSharedListDialog, setShowSharedListDialog] = useState(false);
  const [assetOptions, setAssetOptions] = useState<LibraryAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [selectedDownloadAssetId, setSelectedDownloadAssetId] = useState("");
  const [uploadTarget, setUploadTarget] = useState<"shared" | "downloads">("shared");
  const [sharedResources, setSharedResources] = useState<SessionSharedResource[]>([]);
  const [downloadableResources, setDownloadableResources] = useState<SessionSharedResource[]>([]);
  const [selectedSharedResourceId, setSelectedSharedResourceId] = useState("");
  const [contentView, setContentView] = useState<"shared" | "lab">("shared");
  const [showFloatingChat, setShowFloatingChat] = useState(false);
  const [railPanels, setRailPanels] = useState({
    participants: false,
    activities: false,
    badges: false,
    resources: false,
    assignments: false,
  });
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentInstructions, setAssignmentInstructions] = useState("");
  const [assignmentDueAt, setAssignmentDueAt] = useState("");
  const [sessionAssignments, setSessionAssignments] = useState<SessionAssignment[]>([
    {
      id: "a-1",
      title: "Reflection: Human-Computer Interaction",
      instructions: "Summarize one design principle from today's session and give one real-world example.",
      dueAt: "",
    },
    {
      id: "a-2",
      title: "Lab Follow-up",
      instructions: "Upload your lab outcome screenshot and explain one challenge you solved.",
      dueAt: "",
    },
  ]);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [viewerAssetUrl, setViewerAssetUrl] = useState<string | null>(null);
  const [viewerAssetMimeType, setViewerAssetMimeType] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerLoadError, setViewerLoadError] = useState<string | null>(null);
  const [downloadingResourceId, setDownloadingResourceId] = useState<string | null>(null);
  const [isViewerFullscreen, setIsViewerFullscreen] = useState(false);
  const [sessionEvents, setSessionEvents] = useState<ClassroomSessionEventRecord[]>([]);
  const [sendingChatMessage, setSendingChatMessage] = useState(false);
  const [lastReadChatAt, setLastReadChatAt] = useState<string | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [showRecognitionDialog, setShowRecognitionDialog] = useState(false);
  const [recognitionType, setRecognitionType] = useState<"points_awarded" | "high_five" | "callout">("high_five");
  const [recognitionStudentId, setRecognitionStudentId] = useState("");
  const [recognitionMessage, setRecognitionMessage] = useState("");
  const [recognitionPoints, setRecognitionPoints] = useState("5");
  const [savingRecognition, setSavingRecognition] = useState(false);
  const [recognitionNotice, setRecognitionNotice] = useState<string | null>(null);
  const [studentSubmissionAssignmentId, setStudentSubmissionAssignmentId] = useState("");
  const [studentSubmissionContent, setStudentSubmissionContent] = useState("");
  const [studentSubmissionSaving, setStudentSubmissionSaving] = useState(false);
  const [studentSubmissionStatus, setStudentSubmissionStatus] = useState<string | null>(null);
  const [studentSubmissionByAssignment, setStudentSubmissionByAssignment] = useState<
    Record<string, StudentSubmissionState>
  >({});
  const [openingEndDialog, setOpeningEndDialog] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [forceEndRequired, setForceEndRequired] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const contentViewerRef = useRef<HTMLDivElement>(null);
  const sharedVideoRef = useRef<HTMLVideoElement>(null);
  const liveRootRef = useRef<HTMLDivElement>(null);
  const leaveSentForSessionRef = useRef<string | null>(null);
  const realtimeRef = useRef<ClassroomRealtimeClient | null>(null);
  const lastRealtimeSequenceRef = useRef(0);
  const realtimeIndicatorRef = useRef<HTMLSpanElement>(null);
  const realtimeTooltipRef = useRef<TippyInstance | null>(null);
  const suppressVideoBroadcastRef = useRef(false);
  const suppressScrollBroadcastRef = useRef(false);
  const sessionEndedRedirectedRef = useRef(false);
  const navigatingToLabRef = useRef<{ active: boolean; labType: string }>({ active: false, labType: "" });
  // Tracks whether any WebSocket data has updated participants for the current session.
  // Used to prevent the REST fallback from overwriting live in_lab state.
  const wsParticipantsReceivedRef = useRef(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [recognitionEvent, setRecognitionEvent] = useState<RecognitionEvent | null>(null);
  const [sharedContentPage, setSharedContentPage] = useState(1);
  const [pendingMediaControl, setPendingMediaControl] = useState<{
    action: "play" | "pause";
    at?: number;
  } | null>(null);

  const isInstructorView =
    isSuperAdmin || role === "admin" || role === "owner" || role === "instructor";

  const childContextStudentId = useChildContextStudentId();

  const pointsEnabled = useMemo(() => {
    const settings = tenant?.settings as Record<string, unknown> | undefined;
    const gamification = (settings?.gamification ?? {}) as Record<string, unknown>;
    return Boolean(gamification.points_enabled ?? settings?.points_enabled);
  }, [tenant?.settings]);

  // Failsafe timeout at parent state level so toast always clears.
  useEffect(() => {
    if (!recognitionEvent) return;
    const timer = window.setTimeout(() => {
      setRecognitionEvent(null);
    }, RECOGNITION_TOAST_TIMEOUT_MS + 400);
    return () => window.clearTimeout(timer);
  }, [recognitionEvent]);

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) => new Date(a.session_start).getTime() - new Date(b.session_start).getTime(),
      ),
    [sessions],
  );

  const activeSession = useMemo(
    () => sortedSessions.find((s) => isLiveSession(s)) ?? null,
    [sortedSessions],
  );
  const liveCallLink = activeSession?.meeting_link ?? classroom?.meeting_link ?? null;
  const canJoinLiveCall = classroom?.mode !== "in-person" && Boolean(liveCallLink);

  const permittedLabs = useMemo(() => {
    const schedule = (classroom?.schedule ?? {}) as { permitted_labs?: string[] };
    return schedule.permitted_labs ?? [];
  }, [classroom?.schedule]);

  useEffect(() => {
    if (permittedLabs.length && !selectedSessionLab) {
      setSelectedSessionLab(permittedLabs[0]);
    }
  }, [permittedLabs, selectedSessionLab]);

  useEffect(() => {
    if (sharedResources.length === 0) {
      setSelectedSharedResourceId("");
      return;
    }
    if (!sharedResources.some((resource) => resource.id === selectedSharedResourceId)) {
      setSelectedSharedResourceId(sharedResources[0].id);
    }
  }, [sharedResources, selectedSharedResourceId]);

  useEffect(() => {
    const handler = () => {
      setIsViewerFullscreen(document.fullscreenElement === viewerContainerRef.current);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    const appContent = liveRootRef.current?.closest(".app-content");
    if (!(appContent instanceof HTMLElement)) return;
    appContent.classList.add("app-content--classroom-live-lock");
    return () => {
      appContent.classList.remove("app-content--classroom-live-lock");
    };
  }, []);

  useEffect(() => {
    const hasOpenDialog =
      showShareDialog ||
      showResourceDialog ||
      showSharedListDialog ||
      showRecognitionDialog ||
      showAssignmentDialog ||
      showEndDialog;
    if (!hasOpenDialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (!endingSession) setShowEndDialog(false);
      if (!savingRecognition) setShowRecognitionDialog(false);
      setShowShareDialog(false);
      setShowResourceDialog(false);
      setShowSharedListDialog(false);
      setShowAssignmentDialog(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    showShareDialog,
    showResourceDialog,
    showSharedListDialog,
    showRecognitionDialog,
    showAssignmentDialog,
    showEndDialog,
    endingSession,
    savingRecognition,
  ]);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [klass, classSessions] = await Promise.all([
          isInstructorView ? getClassroom(id) : getMyClassroom(id),
          isInstructorView ? listClassroomSessions(id) : listMyClassroomSessions(id),
        ]);
        if (!mounted) return;
        setClassroom(klass);
        setSessions(classSessions);
      } catch (e: unknown) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load live session");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [id, isInstructorView]);

  const selectedSharedResource = useMemo(
    () => sharedResources.find((resource) => resource.id === selectedSharedResourceId) ?? null,
    [sharedResources, selectedSharedResourceId],
  );
  const visibleSharedResources = useMemo(() => sharedResources.slice(0, 3), [sharedResources]);
  const hiddenSharedResourcesCount = Math.max(0, sharedResources.length - visibleSharedResources.length);
  const selectedStudentSubmission =
    studentSubmissionByAssignment[studentSubmissionAssignmentId] ??
    (studentSubmissionByAssignment.__general__ ?? null);

  const sendGenericRealtimeEvent = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      if (!isInstructorView) return false;
      return realtimeRef.current?.send(type, { payload }) ?? false;
    },
    [isInstructorView],
  );

  const normalizedViewerUrl = useMemo(() => {
    if (!viewerAssetUrl) return null;
    const isPdfLike =
      selectedSharedResource?.kind === "pdf" ||
      viewerAssetMimeType?.toLowerCase().includes("pdf");
    if (!isPdfLike) return viewerAssetUrl;
    const [base] = viewerAssetUrl.split("#");
    return `${base}#page=${Math.max(1, sharedContentPage)}`;
  }, [viewerAssetMimeType, viewerAssetUrl, selectedSharedResource?.kind, sharedContentPage]);

  const applyIncomingMediaControl = useCallback(
    (action: "play" | "pause", at?: number) => {
      const video = sharedVideoRef.current;
      if (!video) {
        setPendingMediaControl({ action, at });
        return;
      }
      suppressVideoBroadcastRef.current = true;
      if (typeof at === "number" && Number.isFinite(at) && at >= 0) {
        video.currentTime = at;
      }
      if (action === "play") {
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
      window.setTimeout(() => {
        suppressVideoBroadcastRef.current = false;
      }, 250);
      setPendingMediaControl(null);
    },
    [],
  );

  const applyLiveSyncState = useCallback(
    (syncRaw: Record<string, unknown> | null | undefined) => {
      if (!syncRaw) return;
      const view = syncRaw.view;
      if (view === "shared" || view === "lab") {
        setContentView(view);
      }
      const resourceId = syncRaw.selected_resource_id;
      if (typeof resourceId === "string" && resourceId) {
        setSelectedSharedResourceId(resourceId);
      }
      const page = Number(syncRaw.page);
      if (Number.isFinite(page) && page >= 1) {
        setSharedContentPage(Math.floor(page));
      }
      const media = syncRaw.media;
      if (media && typeof media === "object") {
        const mediaObj = media as Record<string, unknown>;
        const action = mediaObj.action;
        const at = Number(mediaObj.at);
        if (action === "play" || action === "pause") {
          applyIncomingMediaControl(action, Number.isFinite(at) ? at : undefined);
        }
      }
      const scroll = syncRaw.scroll;
      if (scroll && typeof scroll === "object") {
        const scrollObj = scroll as Record<string, unknown>;
        const x = Number(scrollObj.x);
        const y = Number(scrollObj.y);
        const viewer = contentViewerRef.current;
        if (viewer && Number.isFinite(x) && Number.isFinite(y)) {
          suppressScrollBroadcastRef.current = true;
          viewer.scrollTo({ left: x, top: y, behavior: "auto" });
          window.setTimeout(() => {
            suppressScrollBroadcastRef.current = false;
          }, 200);
        }
      }
    },
    [applyIncomingMediaControl],
  );

  const toSessionEvent = useCallback((envelope: RealtimeEventEnvelope): ClassroomSessionEventRecord | null => {
    const payload = envelope.payload ?? {};
    if (
      envelope.event_type !== "chat" &&
      envelope.event_type !== "points_awarded" &&
      envelope.event_type !== "high_five" &&
      envelope.event_type !== "callout"
    ) {
      return null;
    }
    return {
      id: envelope.event_id,
      session_id: envelope.session_id,
      classroom_id: envelope.classroom_id,
      tenant_id: envelope.tenant_id,
      event_type: envelope.event_type,
      sequence: envelope.sequence,
      correlation_id: envelope.correlation_id ?? null,
      actor_id: envelope.actor?.id ?? "",
      actor_type: envelope.actor?.type ?? "user",
      actor_display_name: envelope.actor?.display_name ?? "Participant",
      student_id: typeof payload.student_id === "string" ? payload.student_id : null,
      student_display_name: typeof payload.student_display_name === "string" ? payload.student_display_name : null,
      message: typeof payload.message === "string" ? payload.message : null,
      points_delta: typeof payload.points_delta === "number" ? payload.points_delta : null,
      metadata: payload.metadata as Record<string, unknown> | null,
      created_at: envelope.occurred_at,
    };
  }, []);

  const upsertSessionEvent = useCallback((nextEvent: ClassroomSessionEventRecord) => {
    setSessionEvents((prev) => {
      const existing = prev.findIndex((ev) => ev.id === nextEvent.id);
      if (existing >= 0) {
        const copy = [...prev];
        copy[existing] = nextEvent;
        return copy;
      }
      return [...prev, nextEvent];
    });
  }, []);

  const applyRealtimeEvent = useCallback((envelope: RealtimeEventEnvelope) => {
    if (typeof envelope.sequence === "number") {
      lastRealtimeSequenceRef.current = Math.max(lastRealtimeSequenceRef.current, envelope.sequence);
    }
    const payload = envelope.payload ?? {};
    if (envelope.event_type === "presence.updated") {
      const summary = payload.summary as SessionPresenceSummary | undefined;
      const people = payload.participants as SessionPresenceParticipant[] | undefined;
      if (summary) setPresenceSummary(summary);
      if (people) {
        wsParticipantsReceivedRef.current = true;
        setParticipants(people);
      }
      return;
    }

    if (envelope.event_type === "help_request") {
      const actorId = envelope.actor?.id ?? "";
      if (actorId) {
        const note = typeof payload.note === "string" ? payload.note : "";
        setHelpRequests((prev) => ({
          ...prev,
          [actorId]: { note, ts: envelope.created_at ?? new Date().toISOString() },
        }));
      }
      return;
    }

    if (envelope.event_type === "session.lab.selected") {
      const lab = typeof payload.active_lab === "string" ? payload.active_lab : "";
      if (lab) setSelectedSessionLab(lab);
      return;
    }

    if (envelope.event_type === "session.view.changed") {
      const nextView = payload.view;
      if (nextView === "shared" || nextView === "lab") {
        setContentView(nextView);
      }
      return;
    }

    if (envelope.event_type === "session.content.selected") {
      const resourceId = payload.resource_id;
      if (typeof resourceId === "string" && resourceId) {
        setSelectedSharedResourceId(resourceId);
        setContentView("shared");
        const page = Number(payload.page);
        if (Number.isFinite(page) && page >= 1) {
          setSharedContentPage(Math.floor(page));
        } else {
          setSharedContentPage(1);
        }
      }
      return;
    }

    if (envelope.event_type === "session.content.updated") {
      const shared = payload.shared_resources;
      const downloads = payload.downloadable_resources;
      if (Array.isArray(shared)) {
        setSharedResources(
          shared
            .map((row) => row as Record<string, unknown>)
            .map((row) => ({
              id: String(row.id ?? ""),
              title: String(row.title ?? ""),
              kind: String(row.kind ?? "document") as SessionContentKind,
              source: String(row.source ?? "library") as SessionContentSource,
              assetType: typeof row.assetType === "string" ? row.assetType : undefined,
            }))
            .filter((row) => row.id),
        );
      }
      if (Array.isArray(downloads)) {
        setDownloadableResources(
          downloads
            .map((row) => row as Record<string, unknown>)
            .map((row) => ({
              id: String(row.id ?? ""),
              title: String(row.title ?? ""),
              kind: String(row.kind ?? "document") as SessionContentKind,
              source: String(row.source ?? "library") as SessionContentSource,
              assetType: typeof row.assetType === "string" ? row.assetType : undefined,
            }))
            .filter((row) => row.id),
        );
      }
      const selectedId = payload.selected_resource_id;
      if (typeof selectedId === "string" && selectedId) {
        setSelectedSharedResourceId(selectedId);
      }
      return;
    }

    if (envelope.event_type === "session.page.changed") {
      const page = Number(payload.page);
      if (Number.isFinite(page) && page >= 1) {
        setSharedContentPage(Math.floor(page));
      }
      return;
    }

    if (envelope.event_type === "session.scroll.changed") {
      const x = Number(payload.x);
      const y = Number(payload.y);
      const viewer = contentViewerRef.current;
      if (viewer && Number.isFinite(x) && Number.isFinite(y)) {
        suppressScrollBroadcastRef.current = true;
        viewer.scrollTo({ left: x, top: y, behavior: "auto" });
        window.setTimeout(() => {
          suppressScrollBroadcastRef.current = false;
        }, 200);
      }
      return;
    }

    if (envelope.event_type === "session.media.control") {
      const action = String(payload.action ?? "");
      const at = Number(payload.at);
      if (action === "play" || action === "pause") {
        applyIncomingMediaControl(action, Number.isFinite(at) ? at : undefined);
      }
      return;
    }

    if (envelope.event_type === "session.ended") {
      const endedSessionId =
        typeof payload.session_id === "string" && payload.session_id
          ? payload.session_id
          : envelope.session_id;
      setSessions((prev) =>
        prev.map((session) =>
          session.id === endedSessionId ? { ...session, status: "completed" } : session,
        ),
      );
      if (!isInstructorView && id && !sessionEndedRedirectedRef.current) {
        sessionEndedRedirectedRef.current = true;
        setError("Class session has ended.");
        navigate(`/app/classrooms/${id}?tab=sessions`);
      }
      return;
    }

    if (envelope.event_type === "session.sync.updated") {
      const sync = payload.sync;
      if (sync && typeof sync === "object") {
        applyLiveSyncState(sync as Record<string, unknown>);
      }
      return;
    }

    if (
      envelope.event_type === "assignment.created" ||
      envelope.event_type === "assignment.updated" ||
      envelope.event_type === "assignment.deleted"
    ) {
      const assignments = payload.assignments;
      if (Array.isArray(assignments)) {
        setSessionAssignments(
          assignments.map((row) => {
            const r = row as Record<string, unknown>;
            return {
              id: String(r.id ?? ""),
              title: String(r.title ?? ""),
              instructions: String(r.instructions ?? ""),
              dueAt: String(r.due_at ?? ""),
            };
          }),
        );
      }
      return;
    }

    if (
      envelope.event_type === "student.submission.saved" ||
      envelope.event_type === "student.submission.submitted"
    ) {
      const studentId = typeof payload.student_id === "string" ? payload.student_id : "";
      if (studentId && studentId === user?.id) {
        const assignmentId =
          typeof payload.assignment_id === "string" && payload.assignment_id.trim().length > 0
            ? payload.assignment_id
            : "__general__";
        const content = typeof payload.content === "string" ? payload.content : "";
        setStudentSubmissionByAssignment((prev) => ({
          ...prev,
          [assignmentId]: {
            assignmentId,
            content,
            status:
              envelope.event_type === "student.submission.submitted"
                ? "submitted"
                : "draft",
            updatedAt: envelope.occurred_at,
          },
        }));
      }
      return;
    }

    const mapped = toSessionEvent(envelope);
    if (!mapped) return;
    upsertSessionEvent(mapped);

    const isAwardEvent =
      mapped.event_type === "points_awarded" ||
      mapped.event_type === "high_five" ||
      mapped.event_type === "callout";

    if (isAwardEvent) {
      // Play sound for everyone in the session (students and instructor).
      playAwardSound(mapped.event_type as "points_awarded" | "high_five" | "callout");

      // Show the recognition toast for everyone.
      const studentName =
        (envelope.payload as Record<string, unknown> | undefined)?.["student_display_name"] as
          | string
          | undefined ?? "A student";
      const points =
        mapped.event_type === "points_awarded"
          ? ((envelope.payload as Record<string, unknown> | undefined)?.["points_delta"] as
              | number
              | undefined)
          : undefined;
      const message =
        (envelope.payload as Record<string, unknown> | undefined)?.["message"] as
          | string
          | undefined;

      const normalizedPoints =
        typeof points === "number" && Number.isFinite(points)
          ? points
          : typeof points === "string"
            ? Number(points)
            : 0;
      const animationType =
        mapped.event_type === "points_awarded"
          ? "trophy"
          : mapped.event_type === "high_five"
            ? "rocket"
            : "stars";
      const animationIntensity =
        mapped.event_type === "points_awarded"
          ? normalizedPoints >= 25
            ? "high"
            : normalizedPoints >= 10
              ? "medium"
              : "low"
          : mapped.event_type === "callout"
            ? "medium"
            : "low";
      rewardEngine.trigger({
        type: animationType,
        intensity: animationIntensity,
        metadata: {
          studentName,
          points: Number.isFinite(normalizedPoints) ? normalizedPoints : undefined,
          message,
          rewardName: mapped.event_type,
          classroomId: id,
        },
      });

      const nextRecognitionEvent: RecognitionEvent = {
        eventId: mapped.id || `${mapped.sequence ?? "na"}-${mapped.created_at}-${mapped.event_type}`,
        eventType: mapped.event_type as "points_awarded" | "high_five" | "callout",
        studentName,
        points,
        message,
      };
      setRecognitionEvent(nextRecognitionEvent);
    }

  }, [
    isInstructorView,
    toSessionEvent,
    upsertSessionEvent,
    applyIncomingMediaControl,
    applyLiveSyncState,
    id,
    navigate,
  ]);

  useEffect(() => {
    if (!studentSubmissionStatus) return;
    const timer = window.setTimeout(() => setStudentSubmissionStatus(null), 2800);
    return () => window.clearTimeout(timer);
  }, [studentSubmissionStatus]);

  useEffect(() => {
    setSharedContentPage(1);
  }, [selectedSharedResourceId]);

  useEffect(() => {
    if (!pendingMediaControl) return;
    if (selectedSharedResource?.kind !== "video") return;
    applyIncomingMediaControl(pendingMediaControl.action, pendingMediaControl.at);
  }, [pendingMediaControl, selectedSharedResource?.kind, applyIncomingMediaControl]);

  const markPresenceLeft = useCallback(
    (mode: "normal" | "bestEffort" = "normal") => {
      if (!id || !activeSession) return;
      if (!isInstructorView) {
        // Student sessions use websocket presence and should not hit
        // instructor-protected REST presence endpoints.
        const sent = realtimeRef.current?.send("presence.leave") ?? false;
        if (!sent) {
          void heartbeatMySession(id, activeSession.id, "left").catch(() => {});
        }
        return;
      }
      const key = `${id}:${activeSession.id}`;
      if (leaveSentForSessionRef.current === key) return;
      leaveSentForSessionRef.current = key;
      if (mode === "bestEffort") {
        leaveClassroomSessionKeepalive(id, activeSession.id);
        return;
      }
      void heartbeatClassroomSession(id, activeSession.id, "left")
        .catch(() => {
          leaveClassroomSessionKeepalive(id, activeSession.id);
        });
    },
    [id, activeSession?.id, isInstructorView],
  );

  useEffect(() => {
    leaveSentForSessionRef.current = null;
    sessionEndedRedirectedRef.current = false;
  }, [id, activeSession?.id]);

  const mapAssetIdsToResources = (
    assetIds: string[],
    assets: Array<LibraryAsset>,
  ): SessionSharedResource[] => {
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const resources: SessionSharedResource[] = [];
    for (const assetId of assetIds) {
      const asset = byId.get(assetId);
      if (!asset) continue;
      resources.push({
        id: asset.id,
        title: asset.name,
        kind: detectContentKind(asset),
        source: "library",
        assetType: asset.asset_type,
      });
    }
    return resources;
  };

  useEffect(() => {
    if (contentView !== "shared") {
      setViewerAssetUrl(null);
      setViewerAssetMimeType(null);
      setViewerLoadError(null);
      setViewerLoading(false);
      return;
    }
    if (!selectedSharedResource || selectedSharedResource.source === "preset") {
      setViewerAssetUrl(null);
      setViewerAssetMimeType(null);
      setViewerLoadError(null);
      setViewerLoading(false);
      return;
    }
    let cancelled = false;
    setViewerLoading(true);
    setViewerLoadError(null);
    const loadAsset = isInstructorView
      ? getAssetById(selectedSharedResource.id)
      : id && activeSession
        ? getStudentSessionAssetById(id, activeSession.id, selectedSharedResource.id)
        : Promise.reject(new Error("Session context unavailable"));
    void loadAsset
      .then((asset) => {
        if (cancelled) return;
        setViewerAssetUrl(asset.blob_url ?? null);
        setViewerAssetMimeType(asset.mime_type ?? null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setViewerAssetUrl(null);
        setViewerAssetMimeType(null);
        setViewerLoadError(e instanceof Error ? e.message : "Unable to load content preview");
      })
      .finally(() => {
        if (!cancelled) setViewerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    contentView,
    selectedSharedResource?.id,
    selectedSharedResource?.source,
    isInstructorView,
    id,
    activeSession?.id,
  ]);

  useEffect(() => {
    if (!activeSession) {
      setSharedResources([]);
      setDownloadableResources([]);
      setSelectedSharedResourceId("");
      return;
    }
    const content = activeSession.session_content ?? {};
    const sharedAssetIds = content.shared_asset_ids ?? [];
    const downloadableAssetIds = content.downloadable_asset_ids ?? [];
    if (sharedAssetIds.length === 0 && downloadableAssetIds.length === 0) {
      setSharedResources([]);
      setDownloadableResources([]);
      setSelectedSharedResourceId("");
      return;
    }
    let cancelled = false;
    void getAssetLibrary()
      .then((library) => {
        if (cancelled) return;
        const all: LibraryAsset[] = [
          ...library.own,
          ...library.shared,
          ...library.global_assets.map((asset) => ({ ...asset, owner_type: "global" as const })),
        ];
        setAssetOptions(all);
        const nextShared = mapAssetIdsToResources(sharedAssetIds, all);
        const nextDownloadable = mapAssetIdsToResources(downloadableAssetIds, all);
        setSharedResources(nextShared);
        setDownloadableResources(nextDownloadable);
        setSelectedSharedResourceId((prev) =>
          prev && nextShared.some((item) => item.id === prev) ? prev : (nextShared[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSharedResources([]);
        setDownloadableResources([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSession?.id, activeSession?.session_content]);

  useEffect(() => {
    if (!id || !activeSession || !tenant?.id) {
      setPresenceSummary(null);
      setParticipants([]);
      setSessionEvents([]);
      setRealtimeConnected(false);
      realtimeRef.current?.disconnect();
      realtimeRef.current = null;
      return;
    }

    let cancelled = false;
    wsParticipantsReceivedRef.current = false; // reset for this session
    const client = new ClassroomRealtimeClient({
      classroomId: id,
      sessionId: activeSession.id,
      tenantId: tenant.id,
      childContextStudentId: !isInstructorView ? childContextStudentId : null,
      onConnected: () => {
        if (!cancelled) setRealtimeConnected(true);
      },
      onDisconnected: () => {
        if (!cancelled) setRealtimeConnected(false);
      },
      onError: (message) => {
        if (!cancelled) setError(message);
      },
      onSnapshot: (snapshot: RealtimeSnapshot) => {
        if (cancelled) return;
        wsParticipantsReceivedRef.current = true;
        lastRealtimeSequenceRef.current = Math.max(
          lastRealtimeSequenceRef.current,
          snapshot.latest_sequence ?? 0,
        );
        setPresenceSummary(snapshot.presence ?? null);
        setParticipants(snapshot.participants ?? []);
        setSessionEvents((snapshot.events ?? []).map(toSessionEvent).filter(Boolean) as ClassroomSessionEventRecord[]);
        const activeLab = snapshot.state?.active_lab;
        if (typeof activeLab === "string" && activeLab) {
          setSelectedSessionLab(activeLab);
        }
        const assignments = snapshot.state?.assignments;
        if (Array.isArray(assignments)) {
          setSessionAssignments(
            assignments.map((row) => {
              const r = row as Record<string, unknown>;
              return {
                id: String(r.id ?? ""),
                title: String(r.title ?? ""),
                instructions: String(r.instructions ?? ""),
                dueAt: String(r.due_at ?? ""),
              };
            }),
          );
        }
        const metadata = snapshot.state?.metadata as Record<string, unknown> | undefined;
        const sync = metadata?.live_sync;
        if (sync && typeof sync === "object") {
          applyLiveSyncState(sync as Record<string, unknown>);
        }
      },
      onEvent: applyRealtimeEvent,
      onReplay: (events) => {
        if (cancelled) return;
        for (const event of events) applyRealtimeEvent(event);
      },
    });

    realtimeRef.current?.disconnect();
    realtimeRef.current = client;
    client.connect();

    // Fallback baseline while websocket handshakes.
    if (isInstructorView) {
      void Promise.all([
        getClassroomSessionPresence(id, activeSession.id).catch(() => null),
        getClassroomSessionParticipants(id, activeSession.id).catch(
          () => [] as SessionPresenceParticipant[],
        ),
        listClassroomSessionEvents(id, activeSession.id, { limit: 300 }).catch(
          () => [] as ClassroomSessionEventRecord[],
        ),
      ]).then(([summary, people, events]) => {
        if (cancelled) return;
        if (summary) setPresenceSummary(summary);
        // Only apply REST participants if no WebSocket data has arrived yet.
        // The WS snapshot/events are always more current than this fallback call.
        if (!wsParticipantsReceivedRef.current) {
          setParticipants(people);
        }
        setSessionEvents(events);
      });
    } else {
      void getMySessionRealtimeSnapshot(id, activeSession.id, {
        after_sequence: 0,
        replay_limit: 300,
      })
        .then((snapshot) => {
          if (cancelled) return;
          lastRealtimeSequenceRef.current = Math.max(
            lastRealtimeSequenceRef.current,
            snapshot.latest_sequence ?? 0,
          );
          setPresenceSummary(snapshot.presence ?? null);
          setParticipants(snapshot.participants ?? []);
          setSessionEvents(
            (snapshot.events ?? []).map(toSessionEvent).filter(Boolean) as ClassroomSessionEventRecord[],
          );
          const activeLab = snapshot.state?.active_lab;
          if (typeof activeLab === "string" && activeLab) {
            setSelectedSessionLab(activeLab);
          }
          const assignments = snapshot.state?.assignments;
          if (Array.isArray(assignments)) {
            setSessionAssignments(
              assignments.map((row) => {
                const r = row as Record<string, unknown>;
                return {
                  id: String(r.id ?? ""),
                  title: String(r.title ?? ""),
                  instructions: String(r.instructions ?? ""),
                  dueAt: String(r.due_at ?? ""),
                };
              }),
            );
          }
          const metadata = snapshot.state?.metadata as Record<string, unknown> | undefined;
          const sync = metadata?.live_sync;
          if (sync && typeof sync === "object") {
            applyLiveSyncState(sync as Record<string, unknown>);
          }
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      if (navigatingToLabRef.current.active) {
        client.send("presence.in_lab", { lab_type: navigatingToLabRef.current.labType });
        navigatingToLabRef.current = { active: false, labType: "" };
      } else {
        client.send("presence.leave");
      }
      client.disconnect();
      if (realtimeRef.current === client) {
        realtimeRef.current = null;
      }
      setRealtimeConnected(false);
    };
  }, [
    id,
    activeSession?.id,
    tenant?.id,
    applyRealtimeEvent,
    toSessionEvent,
    isInstructorView,
    applyLiveSyncState,
    childContextStudentId,
  ]);

  useEffect(() => {
    if (!id || !activeSession || isInstructorView || realtimeConnected || !isAuthenticated) return;
    let cancelled = false;
    let timer: number | null = null;

    const stop = () => {
      cancelled = true;
      if (timer != null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    const shouldHaltFallbackPoll = (err: unknown): boolean =>
      err instanceof ApiHttpError &&
      (err.status === 401 || err.status === 403 || err.status === 409);

    const poll = async () => {
      if (cancelled) return;
      try {
        const events = await listMySessionRealtimeEvents(id, activeSession.id, {
          after_sequence: lastRealtimeSequenceRef.current,
          limit: 200,
        });
        if (cancelled) return;
        for (const event of events) {
          applyRealtimeEvent(event);
        }
      } catch (e) {
        if (shouldHaltFallbackPoll(e)) {
          stop();
          return;
        }
      }
      if (cancelled) return;
      try {
        await heartbeatMySession(id, activeSession.id, "active");
      } catch (e) {
        if (shouldHaltFallbackPoll(e)) {
          stop();
        }
      }
    };

    timer = window.setInterval(() => {
      void poll();
    }, 3000);
    void poll();
    return () => {
      stop();
    };
  }, [id, activeSession?.id, isInstructorView, realtimeConnected, applyRealtimeEvent, isAuthenticated]);

  useEffect(() => {
    if (!id || !activeSession) return;
    const handlePageExit = () => markPresenceLeft("bestEffort");
    window.addEventListener("pagehide", handlePageExit);
    window.addEventListener("beforeunload", handlePageExit);
    return () => {
      window.removeEventListener("pagehide", handlePageExit);
      window.removeEventListener("beforeunload", handlePageExit);
    };
  }, [id, activeSession?.id, markPresenceLeft]);

  useEffect(() => {
    if (!recognitionNotice) return;
    const timer = window.setTimeout(() => setRecognitionNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [recognitionNotice]);

  useEffect(() => {
    if (isInstructorView) return;
    if (sessionAssignments.length > 0) {
      setStudentSubmissionAssignmentId((prev) =>
        prev && sessionAssignments.some((assignment) => assignment.id === prev)
          ? prev
          : sessionAssignments[0].id,
      );
      return;
    }
    setStudentSubmissionAssignmentId("__general__");
  }, [isInstructorView, sessionAssignments]);

  useEffect(() => {
    if (isInstructorView) return;
    const selected =
      studentSubmissionByAssignment[studentSubmissionAssignmentId] ??
      studentSubmissionByAssignment.__general__;
    setStudentSubmissionContent(selected?.content ?? "");
  }, [isInstructorView, studentSubmissionAssignmentId, studentSubmissionByAssignment]);

  useEffect(() => {
    const node = realtimeIndicatorRef.current;
    if (!node) return;
    const tooltip =
      realtimeTooltipRef.current ??
      tippy(node, {
        content: "",
        placement: "top",
        delay: [120, 40],
      });
    realtimeTooltipRef.current = tooltip;
    tooltip.setContent(
      realtimeConnected
        ? "Realtime connected: classroom updates are live."
        : "Realtime reconnecting: updates will resume automatically.",
    );
    return () => {
      tooltip.destroy();
      realtimeTooltipRef.current = null;
    };
  }, [realtimeConnected]);

  useEffect(() => {
    if (!activeSession) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeSession?.id]);

  useEffect(() => {
    if (!id || !activeSession) {
      setLastReadChatAt(null);
      setUnreadChatCount(0);
      return;
    }
    setLastReadChatAt((prev) => prev ?? new Date().toISOString());
  }, [id, activeSession?.id]);

  const chatEvents = useMemo(
    () => sessionEvents.filter((event) => event.event_type === "chat"),
    [sessionEvents],
  );
  const activityEvents = useMemo(
    () => sessionEvents.filter((event) => event.event_type !== "chat"),
    [sessionEvents],
  );

  useEffect(() => {
    if (showFloatingChat) {
      const chatRows = sessionEvents.filter((event) => event.event_type === "chat");
      const latestChat = [...chatRows]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      if (latestChat) {
        setLastReadChatAt(latestChat.created_at);
      }
      setUnreadChatCount(0);
      return;
    }
    if (!lastReadChatAt) {
      setUnreadChatCount(0);
      return;
    }
    const unread = sessionEvents.filter(
      (event) =>
        event.event_type === "chat" &&
        event.actor_id !== user?.id &&
        new Date(event.created_at).getTime() > new Date(lastReadChatAt).getTime(),
    ).length;
    setUnreadChatCount(unread);
  }, [showFloatingChat, sessionEvents, lastReadChatAt, user?.id]);

  const activeStudents = useMemo(
    () => participants.filter((p) => p.actor_type === "student"),
    [participants],
  );
  const visibleStudents = activeStudents;
  const filteredStudents = useMemo(() => {
    const query = participantSearch.trim().toLowerCase();
    if (!query) return visibleStudents;
    return visibleStudents.filter((student) => {
      const haystack = `${student.display_name} ${student.email ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [visibleStudents, participantSearch]);

  const sessionElapsed = useMemo(() => {
    if (!activeSession) return "00:00";
    const start = new Date(activeSession.session_start).getTime();
    const secs = Math.max(0, Math.floor((nowMs - start) / 1000));
    const mm = Math.floor(secs / 60).toString().padStart(2, "0");
    const ss = (secs % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  }, [activeSession?.session_start, nowMs]);

  const loadAssets = async () => {
    const library = await getAssetLibrary();
    const all: LibraryAsset[] = [
      ...library.own,
      ...library.shared,
      ...library.global_assets.map((asset) => ({ ...asset, owner_type: "global" as const })),
    ];
    setAssetOptions(all);
    if (!selectedAssetId && all.length > 0) {
      setSelectedAssetId(all[0].id);
    }
    if (!selectedDownloadAssetId && all.length > 0) {
      setSelectedDownloadAssetId(all[0].id);
    }
    return all;
  };

  const openLab = () => {
    const lab = selectedSessionLab || permittedLabs[0];
    if (!lab) {
      navigate("/app/labs");
      return;
    }
    const labType = resolveLabRoute(lab)?.id ?? lab;
    navigatingToLabRef.current = { active: true, labType };
    // Fire a REST heartbeat immediately so the DB is updated before this component
    // unmounts. The WebSocket send in the cleanup effect is unreliable because
    // disconnect() runs right after send(), potentially closing the socket first.
    if (!isInstructorView && activeSession?.id) {
      heartbeatMySession(id, activeSession.id, "in_lab", labType).catch(() => {});
    }
    navigate(
      buildLabLaunchPath(lab, {
        classroomId: id,
        sessionId: activeSession?.id,
        referrer: "classroom_live_session",
      }),
    );
  };

  const sendMessage = () => {
    if (!id || !activeSession) return;
    const text = messageInput.trim();
    if (!text) return;
    setSendingChatMessage(true);
    setError(null);
    const sentViaRealtime = realtimeRef.current?.send("chat.send", { message: text }) ?? false;
    if (sentViaRealtime) {
      setMessageInput("");
      setSendingChatMessage(false);
      return;
    }
    const sendChat = isInstructorView
      ? createClassroomSessionChat(id, activeSession.id, text)
      : createMySessionChat(id, activeSession.id, text);
    void sendChat
      .then((event) => {
        setSessionEvents((prev) => [...prev, event]);
        setMessageInput("");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to send message");
      })
      .finally(() => {
        setSendingChatMessage(false);
      });
  };

  const openRecognitionDialog = () => {
    const firstStudent = activeStudents[0]?.actor_id ?? "";
    setRecognitionStudentId(firstStudent);
    setRecognitionType("high_five");
    setRecognitionMessage("");
    setRecognitionPoints("5");
    setShowRecognitionDialog(true);
  };

  const handleCreateRecognition = async () => {
    if (!id || !activeSession) return;
    if (!recognitionStudentId) {
      setError("Select a student for recognition.");
      return;
    }
    setSavingRecognition(true);
    setError(null);
    try {
      const payload: {
        activity_type: "points_awarded" | "high_five" | "callout";
        student_id: string;
        message?: string;
        points_delta?: number;
      } = {
        activity_type: recognitionType,
        student_id: recognitionStudentId,
      };
      const note = recognitionMessage.trim();
      if (note) payload.message = note;
      if (recognitionType === "points_awarded") {
        const parsed = Number(recognitionPoints);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          setError("Points must be a positive number.");
          setSavingRecognition(false);
          return;
        }
        payload.points_delta = Math.floor(parsed);
      }
      const sentViaRealtime =
        realtimeRef.current?.send("recognition.award", {
          ...payload,
        }) ?? false;
      if (!sentViaRealtime) {
        const event = await createClassroomSessionActivity(id, activeSession.id, payload);
        setSessionEvents((prev) => [...prev, event]);
      }
      setRecognitionNotice(
        recognitionType === "callout"
          ? "Callout sent to student."
          : recognitionType === "high_five"
            ? "High five sent."
            : "Points sent.",
      );
      setShowRecognitionDialog(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save recognition.");
    } finally {
      setSavingRecognition(false);
    }
  };

  const runParticipantAction = async (
    student: SessionPresenceParticipant,
    action: "high_five" | "points_awarded" | "callout",
    options?: { points?: number; message?: string },
  ) => {
    if (!id || !activeSession) return;
    const points = options?.points;
    const message = options?.message;

    if (!isUuid(student.actor_id)) {
      const synthetic: ClassroomSessionEventRecord = {
        id: `demo-${Date.now()}-${student.actor_id}-${action}`,
        session_id: activeSession.id,
        classroom_id: id,
        tenant_id: classroom?.tenant_id ?? "",
        event_type: action,
        actor_id: user?.id ?? "demo-actor",
        actor_type: isInstructorView ? "instructor" : "student",
        actor_display_name: user ? `${user.firstName} ${user.lastName}`.trim() || "Instructor" : "Instructor",
        student_id: student.actor_id,
        student_display_name: student.display_name,
        message:
          message ??
          (action === "callout"
            ? "Awarded Classroom Contributor sticker"
            : action === "high_five"
              ? "Great participation in class!"
              : undefined),
        points_delta: action === "points_awarded" ? points ?? 0 : null,
        metadata: { source: "demo_participant_action" },
        created_at: new Date().toISOString(),
      };
      setSessionEvents((prev) => [...prev, synthetic]);
      return;
    }

    try {
      const payload = {
        activity_type: action,
        student_id: student.actor_id,
        points_delta: action === "points_awarded" ? points : undefined,
        message,
      };
      const sentViaRealtime = realtimeRef.current?.send("recognition.award", payload) ?? false;
      if (!sentViaRealtime) {
        const event = await createClassroomSessionActivity(id, activeSession.id, payload);
        setSessionEvents((prev) => [...prev, event]);
      }
      setRecognitionNotice(
        action === "callout"
          ? `Callout sent to ${student.display_name}.`
          : action === "high_five"
            ? `High five sent to ${student.display_name}.`
            : `${points ?? 0} points sent to ${student.display_name}.`,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to apply participant action.");
    }
  };

  const openShareDialog = () => {
    setUploadTarget("shared");
    setShowShareDialog(true);
    void loadAssets().catch(() => {});
  };

  const openResourceDialog = () => {
    setUploadTarget("downloads");
    setShowResourceDialog(true);
    void loadAssets().catch(() => {});
  };

  const persistSessionContent = async (
    nextShared: SessionSharedResource[],
    nextDownloads: SessionSharedResource[],
  ) => {
    if (!id || !activeSession) return;
    try {
      const updated = await updateClassroomSessionContent(id, activeSession.id, {
        shared_asset_ids: nextShared.map((item) => item.id),
        downloadable_asset_ids: nextDownloads.map((item) => item.id),
      });
      setSessions((prev) => prev.map((session) => (session.id === updated.id ? updated : session)));
      if (isInstructorView) {
        const selectedId =
          selectedSharedResourceId && nextShared.some((item) => item.id === selectedSharedResourceId)
            ? selectedSharedResourceId
            : (nextShared[0]?.id ?? "");
        sendGenericRealtimeEvent("session.content.updated", {
          shared_resources: nextShared,
          downloadable_resources: nextDownloads,
          selected_resource_id: selectedId,
        });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to persist session content");
    }
  };

  const handleShareSelectedAsset = () => {
    const selected = assetOptions.find((asset) => asset.id === selectedAssetId);
    if (!selected) return;
    const nextResource: SessionSharedResource = {
      id: selected.id,
      title: selected.name,
      kind: detectContentKind(selected),
      source: "library",
      assetType: selected.asset_type,
    };
    let nextShared = sharedResources;
    if (!sharedResources.some((r) => r.id === selected.id)) {
      nextShared = [...sharedResources, nextResource];
      setSharedResources(nextShared);
    }
    setSelectedSharedResourceId(selected.id);
    setContentView("shared");
    sendGenericRealtimeEvent("session.content.selected", {
      resource_id: selected.id,
      page: 1,
    });
    sendGenericRealtimeEvent("session.view.changed", { view: "shared" });
    setShowShareDialog(false);
    void persistSessionContent(nextShared, downloadableResources);
  };

  const handleRemoveSharedResource = (resourceId: string) => {
    const nextShared = sharedResources.filter((resource) => resource.id !== resourceId);
    setSharedResources(nextShared);
    if (selectedSharedResourceId === resourceId) {
      setSelectedSharedResourceId(nextShared[0]?.id ?? "");
    }
    void persistSessionContent(nextShared, downloadableResources);
  };

  const handleAddDownloadableResource = () => {
    const selected = assetOptions.find((asset) => asset.id === selectedDownloadAssetId);
    if (!selected) return;
    const nextResource: SessionSharedResource = {
      id: selected.id,
      title: selected.name,
      kind: detectContentKind(selected),
      source: "library",
      assetType: selected.asset_type,
    };
    let nextDownloads = downloadableResources;
    if (!downloadableResources.some((resource) => resource.id === selected.id)) {
      nextDownloads = [...downloadableResources, nextResource];
      setDownloadableResources(nextDownloads);
    }
    setShowResourceDialog(false);
    void persistSessionContent(sharedResources, nextDownloads);
  };

  const handleUploadAssetFromComputer = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingAsset(true);
    try {
      const uploaded = await uploadAsset({
        file,
        name: file.name,
        asset_type: inferAssetTypeFromFile(file),
        owner_type: "tenant",
      });
      await loadAssets();
      setSelectedAssetId(uploaded.id);
      const uploadedResource: SessionSharedResource = {
        id: uploaded.id,
        title: uploaded.name,
        kind: detectContentKind(uploaded),
        source: "upload",
        assetType: uploaded.asset_type,
      };
      if (uploadTarget === "downloads") {
        const nextDownloads = [...downloadableResources, uploadedResource];
        setDownloadableResources(nextDownloads);
        setShowResourceDialog(false);
        void persistSessionContent(sharedResources, nextDownloads);
      } else {
        const nextShared = [...sharedResources, uploadedResource];
        setSharedResources(nextShared);
        setSelectedSharedResourceId(uploaded.id);
        setContentView("shared");
        sendGenericRealtimeEvent("session.content.selected", {
          resource_id: uploaded.id,
          page: 1,
        });
        sendGenericRealtimeEvent("session.view.changed", { view: "shared" });
        setShowShareDialog(false);
        void persistSessionContent(nextShared, downloadableResources);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to upload asset");
    } finally {
      setUploadingAsset(false);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    }
  };

  const handleOpenEndDialog = async () => {
    if (!id || !activeSession) return;
    setOpeningEndDialog(true);
    setError(null);
    try {
      const summary = await getClassroomSessionPresence(id, activeSession.id);
      setPresenceSummary(summary);
      setForceEndRequired(summary.active_students > 0);
      setShowEndDialog(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to check session participants");
    } finally {
      setOpeningEndDialog(false);
    }
  };

  const handleConfirmEndSession = async () => {
    if (!id || !activeSession) return;
    setEndingSession(true);
    setError(null);
    try {
      await endClassroomSession(id, activeSession.id, forceEndRequired);
      setShowEndDialog(false);
      navigate(`/app/classrooms/${id}?tab=sessions`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to end session";
      setError(message);
      if (message.includes("student") && message.includes("Confirm end for all")) {
        setForceEndRequired(true);
        setShowEndDialog(true);
      }
    } finally {
      setEndingSession(false);
    }
  };

  const openCreateAssignmentDialog = () => {
    setEditingAssignmentId(null);
    setAssignmentTitle("");
    setAssignmentInstructions("");
    setAssignmentDueAt("");
    setShowAssignmentDialog(true);
  };

  const openEditAssignmentDialog = (assignment: SessionAssignment) => {
    setEditingAssignmentId(assignment.id);
    setAssignmentTitle(assignment.title);
    setAssignmentInstructions(assignment.instructions);
    setAssignmentDueAt(assignment.dueAt);
    setShowAssignmentDialog(true);
  };

  const handleSaveAssignment = () => {
    if (!id || !activeSession) return;
    const title = assignmentTitle.trim();
    const instructions = assignmentInstructions.trim();
    if (!title || !instructions) {
      setError("Assignment title and instructions are required.");
      return;
    }
    setError(null);
    const assignment = {
      id: editingAssignmentId ?? `a-${Date.now()}`,
      title,
      instructions,
      due_at: assignmentDueAt || null,
    };
    const sentViaRealtime = realtimeRef.current?.send("assignment.upsert", { assignment }) ?? false;
    if (!sentViaRealtime) {
      if (editingAssignmentId) {
        setSessionAssignments((prev) =>
          prev.map((item) =>
            item.id === editingAssignmentId
              ? {
                  ...item,
                  title,
                  instructions,
                  dueAt: assignmentDueAt,
                }
              : item,
          ),
        );
      } else {
        setSessionAssignments((prev) => [
          {
            id: assignment.id,
            title,
            instructions,
            dueAt: assignmentDueAt,
          },
          ...prev,
        ]);
      }
    }
    setShowAssignmentDialog(false);
  };

  const handleStudentSubmission = async (status: "draft" | "submitted") => {
    if (!id || !activeSession || isInstructorView) return;
    const content = studentSubmissionContent.trim();
    if (!content) {
      setError("Write your lab work before saving.");
      return;
    }
    setStudentSubmissionSaving(true);
    setError(null);
    try {
      await createMySessionSubmission(id, activeSession.id, {
        assignment_id:
          studentSubmissionAssignmentId && studentSubmissionAssignmentId !== "__general__"
            ? studentSubmissionAssignmentId
            : null,
        content,
        status,
      });
      setStudentSubmissionStatus(
        status === "submitted"
          ? "Submission sent to your instructor."
          : "Draft saved for this classroom session.",
      );
      const localAssignmentId =
        studentSubmissionAssignmentId && studentSubmissionAssignmentId !== "__general__"
          ? studentSubmissionAssignmentId
          : "__general__";
      setStudentSubmissionByAssignment((prev) => ({
        ...prev,
        [localAssignmentId]: {
          assignmentId: localAssignmentId,
          content,
          status,
          updatedAt: new Date().toISOString(),
        },
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save your submission.");
    } finally {
      setStudentSubmissionSaving(false);
    }
  };

  const toggleRailPanel = (panel: keyof typeof railPanels) => {
    setRailPanels((prev) => ({ ...prev, [panel]: !prev[panel] }));
  };

  const toggleViewerFullscreen = () => {
    const node = viewerContainerRef.current;
    if (!node) return;
    if (document.fullscreenElement === node) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    void node.requestFullscreen().catch(() => {});
  };

  const handleDownloadResource = async (resource: SessionSharedResource) => {
    if (resource.source === "preset") {
      setError("This item is a demo placeholder and cannot be downloaded.");
      return;
    }
    setDownloadingResourceId(resource.id);
    setError(null);
    try {
      const asset = isInstructorView
        ? await getAssetById(resource.id, 900)
        : id && activeSession
          ? await getStudentSessionAssetById(id, activeSession.id, resource.id, 900)
          : null;
      if (!asset) {
        setError("Session context is unavailable for download.");
        return;
      }
      if (!asset.blob_url) {
        setError("Download URL is unavailable for this resource.");
        return;
      }
      window.open(asset.blob_url, "_blank", "noopener");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to open resource download.");
    } finally {
      setDownloadingResourceId(null);
    }
  };

  const playSharedVideo = () => {
    void sharedVideoRef.current?.play().catch(() => {});
  };

  const pauseSharedVideo = () => {
    sharedVideoRef.current?.pause();
  };

  const emitVideoControl = useCallback(
    (action: "play" | "pause") => {
      if (!isInstructorView || suppressVideoBroadcastRef.current) return;
      const video = sharedVideoRef.current;
      sendGenericRealtimeEvent("session.media.control", {
        action,
        at: video?.currentTime ?? 0,
        resource_id: selectedSharedResourceId,
      });
    },
    [isInstructorView, selectedSharedResourceId, sendGenericRealtimeEvent],
  );

  const goToSharedPage = (delta: number) => {
    if (!isInstructorView) return;
    setSharedContentPage((prev) => {
      const next = Math.max(1, prev + delta);
      sendGenericRealtimeEvent("session.page.changed", {
        page: next,
        resource_id: selectedSharedResourceId,
      });
      return next;
    });
  };

  return (
    <div ref={liveRootRef} className="classroom-live" role="main" aria-label="Live classroom session">
      <RecognitionToast event={recognitionEvent} onDismiss={() => setRecognitionEvent(null)} />
      <Link
        to={`/app/classrooms/${id}?tab=sessions`}
        className="classroom-detail__back"
        aria-label="Back to classroom sessions"
        onClick={() => markPresenceLeft("normal")}
      >
        <ArrowLeft size={18} aria-hidden />
        Back to Classroom
      </Link>

      {error && <p className="classroom-list__empty">{error}</p>}

      {loading ? (
        <p className="classroom-list__empty">Loading live session...</p>
      ) : !activeSession ? (
        <div className="classroom-live__empty-card">
          <h2>No active session right now</h2>
          <p>Go back to the classroom page to view the active session card and join when a session starts.</p>
          <Link to={`/app/classrooms/${id}?tab=sessions`} className="classroom-list__create-btn">
            Return to Sessions
          </Link>
        </div>
      ) : (
        <>
          <header className="classroom-live__header">
            <h1>{classroom?.name ?? "Classroom"} Live Session</h1>
            <p className="classroom-live__timer">
              Session time: {sessionElapsed}
              <span
                ref={realtimeIndicatorRef}
                className="classroom-live__realtime-indicator"
                role="status"
                aria-live="polite"
                aria-label={realtimeConnected ? "Realtime connected" : "Realtime reconnecting"}
              >
                <span
                  className={`classroom-live__realtime-bulb ${realtimeConnected ? "is-online" : "is-offline"}`}
                  aria-hidden
                />
              </span>
            </p>
          </header>

          <div className="classroom-live__top-controls">
            {isInstructorView ? (
              <>
                {permittedLabs.length > 0 && (
                  <div className="classroom-detail__lab-picker">
                    <KidDropdown
                      value={selectedSessionLab}
                      onChange={(lab) => {
                        setSelectedSessionLab(lab);
                        realtimeRef.current?.send("lab.select", { active_lab: lab });
                        sendGenericRealtimeEvent("session.view.changed", { view: "lab" });
                      }}
                      ariaLabel="Current session lab"
                      minWidth={220}
                      options={permittedLabs.map((lab) => ({ value: lab, label: lab }))}
                    />
                    <button
                      type="button"
                      className="classroom-list__create-btn"
                      onClick={openLab}
                    >
                      <FlaskConical size={16} /> Start lab
                    </button>
                  </div>
                )}
                <button type="button" className="classroom-list__create-btn" onClick={openShareDialog}>
                  <Share2 size={16} />
                  Share content
                </button>
                {canJoinLiveCall && (
                  <button
                    type="button"
                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                    onClick={() => window.open(liveCallLink!, "_blank", "noopener")}
                  >
                    <Video size={16} /> Join Call
                  </button>
                )}
                {pointsEnabled && (
                  <button
                    type="button"
                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                    onClick={openRecognitionDialog}
                  >
                    <Gift size={16} /> Give points
                  </button>
                )}
                <button
                  type="button"
                  className="classroom-list__create-btn classroom-list__create-btn--danger classroom-live__end-btn"
                  onClick={handleOpenEndDialog}
                  disabled={openingEndDialog || endingSession}
                >
                  {openingEndDialog ? "Checking..." : endingSession ? "Ending..." : "End Session"}
                </button>
              </>
            ) : (
              <>
                {canJoinLiveCall && (
                  <button
                    type="button"
                    className="classroom-list__create-btn"
                    onClick={() => window.open(liveCallLink!, "_blank", "noopener")}
                  >
                    <Video size={16} /> Join Call
                  </button>
                )}
                <button type="button" className="classroom-list__create-btn classroom-list__create-btn--ghost" onClick={openLab}><FlaskConical size={16} /> Start lab</button>
              </>
            )}
            {isInstructorView && (
              <div className="classroom-live__view-switch" role="group" aria-label="Session content view">
                <button
                  type="button"
                  className={`classroom-list__create-btn classroom-list__create-btn--ghost ${contentView === "shared" ? "classroom-live__view-switch-btn--active" : ""}`}
                  onClick={() => {
                    setContentView("shared");
                    sendGenericRealtimeEvent("session.view.changed", { view: "shared" });
                  }}
                >
                  <Presentation size={16} />
                  Shared content
                </button>
                <button
                  type="button"
                  className={`classroom-list__create-btn classroom-list__create-btn--ghost ${contentView === "lab" ? "classroom-live__view-switch-btn--active" : ""}`}
                  onClick={() => {
                    setContentView("lab");
                    sendGenericRealtimeEvent("session.view.changed", { view: "lab" });
                  }}
                >
                  <FlaskConical size={16} />
                  Lab view
                </button>
              </div>
            )}
            <button
              type="button"
              className={`classroom-list__create-btn classroom-list__create-btn--ghost classroom-live__chat-toggle ${!isInstructorView ? "classroom-live__chat-toggle--student" : ""}`}
              onClick={() => setShowFloatingChat((prev) => !prev)}
            >
              <MessageSquare size={16} />
              {showFloatingChat ? "Hide chat" : "Open chat"}
              {!showFloatingChat && unreadChatCount > 0 ? (
                <span className="classroom-live__chat-unread-badge">
                  {unreadChatCount > 99 ? "99+" : unreadChatCount}
                </span>
              ) : null}
            </button>
          </div>

          <div className="classroom-live__main">
            <div className="classroom-live__workspace">
              <section className="classroom-live__content-stage">
                <div className={`classroom-live__content-card classroom-live__content-card--${contentView}`}>
                  <header className="classroom-live__content-header">
                    <h3>{contentView === "lab" ? "Lab content" : "Shared class content"}</h3>
                    <div className="classroom-live__content-actions">
                      {contentView === "lab" ? (
                        <>
                          <button type="button" className="classroom-list__create-btn classroom-list__create-btn--ghost" onClick={openLab}>
                            <FlaskConical size={15} />
                            {isInstructorView ? "Open lab" : "Start lab"}
                          </button>
                          {isInstructorView && (
                            <button type="button" className="classroom-list__create-btn classroom-list__create-btn--ghost" onClick={openShareDialog}>
                              <Share2 size={15} />
                              Share content
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          {isInstructorView && selectedSharedResource?.kind === "video" && (
                            <>
                              <button type="button" className="classroom-list__create-btn classroom-list__create-btn--ghost" onClick={playSharedVideo}>
                                <Play size={15} />
                                Play
                              </button>
                              <button type="button" className="classroom-list__create-btn classroom-list__create-btn--ghost" onClick={pauseSharedVideo}>
                                <Pause size={15} />
                                Pause
                              </button>
                            </>
                          )}
                          {isInstructorView && (selectedSharedResource?.kind === "pdf" || selectedSharedResource?.kind === "slides") && (
                            <>
                              <button
                                type="button"
                                className="classroom-list__create-btn classroom-list__create-btn--ghost"
                                onClick={() => goToSharedPage(-1)}
                              >
                                <SkipBack size={15} />
                                Prev
                              </button>
                              <button
                                type="button"
                                className="classroom-list__create-btn classroom-list__create-btn--ghost"
                                onClick={() => goToSharedPage(1)}
                              >
                                <SkipForward size={15} />
                                Next
                              </button>
                            </>
                          )}
                          {isInstructorView && (
                            <button type="button" className="classroom-list__create-btn classroom-list__create-btn--ghost" onClick={openShareDialog}>
                              <Share2 size={15} />
                              Share content
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </header>

                  {contentView === "lab" ? (
                    <>
                      <p>
                        {selectedSessionLab
                          ? `Current lab: ${selectedSessionLab}`
                          : "No active lab selected yet."}
                      </p>
                      <div ref={viewerContainerRef} className="classroom-live__viewer-frame classroom-live__viewer-frame--lab">
                        <div className="classroom-live__viewer-overlay-controls" aria-hidden={!isViewerFullscreen}>
                              <button
                                type="button"
                                className="classroom-list__create-btn classroom-list__create-btn--ghost"
                                onClick={openLab}
                              >
                                <FlaskConical size={15} />
                                {isInstructorView ? "Open lab" : "Start lab"}
                              </button>
                        </div>
                        <button
                          type="button"
                          className="classroom-live__viewer-fullscreen-btn"
                          onClick={toggleViewerFullscreen}
                          aria-label={isViewerFullscreen ? "Exit fullscreen content viewer" : "Open fullscreen content viewer"}
                          title={isViewerFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
                        >
                          {isViewerFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        </button>
                        <div className="classroom-live__lab-thumb">
                          <FlaskConical size={42} aria-hidden />
                          <span>{selectedSessionLab || "Lab thumbnail placeholder"}</span>
                        </div>
                      </div>
                      {permittedLabs.length > 0 && (
                        <div className="classroom-live__lab-thumbs" role="list" aria-label="Available lab thumbnails">
                          {permittedLabs.map((lab) => (
                            <button
                              key={lab}
                              type="button"
                              className={`classroom-live__lab-chip ${lab === selectedSessionLab ? "classroom-live__lab-chip--active" : ""}`}
                              onClick={() => {
                                if (!isInstructorView) return;
                                setSelectedSessionLab(lab);
                                realtimeRef.current?.send("lab.select", { active_lab: lab });
                                sendGenericRealtimeEvent("session.view.changed", { view: "lab" });
                              }}
                              disabled={!isInstructorView}
                            >
                              <FlaskConical size={14} />
                              {lab}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {selectedSharedResource ? (
                        <>
                          <p className="classroom-live__content-meta">
                            Showing: {selectedSharedResource.title} ({selectedSharedResource.kind})
                            {(selectedSharedResource.kind === "pdf" || selectedSharedResource.kind === "slides") && (
                              <> · Page {sharedContentPage}</>
                            )}
                          </p>
                          <div
                            ref={viewerContainerRef}
                            className={`classroom-live__viewer-frame ${selectedSharedResource.kind === "video" ? "classroom-live__viewer-frame--video" : ""}`}
                          >
                            <div className="classroom-live__viewer-overlay-controls" aria-hidden={!isViewerFullscreen}>
                              {isInstructorView && selectedSharedResource.kind === "video" && (
                                <>
                                  <button
                                    type="button"
                                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                                    onClick={playSharedVideo}
                                  >
                                    <Play size={15} />
                                    Play
                                  </button>
                                  <button
                                    type="button"
                                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                                    onClick={pauseSharedVideo}
                                  >
                                    <Pause size={15} />
                                    Pause
                                  </button>
                                </>
                              )}
                              {isInstructorView && (selectedSharedResource.kind === "pdf" || selectedSharedResource.kind === "slides") && (
                                <>
                                  <button
                                    type="button"
                                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                                    onClick={() => goToSharedPage(-1)}
                                  >
                                    <SkipBack size={15} />
                                    Prev
                                  </button>
                                  <button
                                    type="button"
                                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                                    onClick={() => goToSharedPage(1)}
                                  >
                                    <SkipForward size={15} />
                                    Next
                                  </button>
                                </>
                              )}
                            </div>
                            <button
                              type="button"
                              className="classroom-live__viewer-fullscreen-btn"
                              onClick={toggleViewerFullscreen}
                              aria-label={isViewerFullscreen ? "Exit fullscreen content viewer" : "Open fullscreen content viewer"}
                              title={isViewerFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
                            >
                              {isViewerFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                            </button>
                            <div
                              ref={contentViewerRef}
                              className="classroom-live__content-viewer"
                              onScroll={() => {
                                if (!isInstructorView || suppressScrollBroadcastRef.current) return;
                                const node = contentViewerRef.current;
                                if (!node) return;
                                sendGenericRealtimeEvent("session.scroll.changed", {
                                  x: node.scrollLeft,
                                  y: node.scrollTop,
                                  resource_id: selectedSharedResourceId,
                                });
                              }}
                            >
                              {viewerLoading ? (
                                <p className="classroom-live__viewer-state">Loading content...</p>
                              ) : viewerLoadError ? (
                                <div className="classroom-live__viewer-state">
                                  <span>{viewerLoadError}</span>
                                </div>
                              ) : selectedSharedResource.source === "preset" || !viewerAssetUrl ? (
                                <>
                                  {selectedSharedResource.kind === "slides" && <Presentation size={56} aria-hidden />}
                                  {selectedSharedResource.kind === "pdf" && <FileText size={56} aria-hidden />}
                                  {selectedSharedResource.kind === "video" && <Video size={56} aria-hidden />}
                                  {selectedSharedResource.kind === "document" && <FileText size={56} aria-hidden />}
                                  <span>Content viewer area for {selectedSharedResource.kind} goes here</span>
                                </>
                              ) : selectedSharedResource.kind === "video" ? (
                                <video
                                  ref={sharedVideoRef}
                                  src={normalizedViewerUrl ?? viewerAssetUrl}
                                  className="classroom-live__viewer-video"
                                  controls={isInstructorView}
                                  preload="metadata"
                                  onPlay={() => emitVideoControl("play")}
                                  onPause={() => emitVideoControl("pause")}
                                  onSeeked={() => {
                                    if (!isInstructorView) return;
                                    const video = sharedVideoRef.current;
                                    if (!video) return;
                                    sendGenericRealtimeEvent("session.media.control", {
                                      action: video.paused ? "pause" : "play",
                                      at: video.currentTime,
                                      resource_id: selectedSharedResourceId,
                                    });
                                  }}
                                />
                              ) : selectedSharedResource.kind === "pdf" ? (
                                <iframe
                                  src={normalizedViewerUrl ?? viewerAssetUrl}
                                  className="classroom-live__viewer-embed"
                                  title={`PDF viewer - ${selectedSharedResource.title}`}
                                />
                              ) : selectedSharedResource.kind === "slides" ? (
                                <iframe
                                  src={
                                    isOfficePresentation(selectedSharedResource.title)
                                      ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(normalizedViewerUrl ?? viewerAssetUrl ?? "")}`
                                      : (normalizedViewerUrl ?? viewerAssetUrl ?? "")
                                  }
                                  className="classroom-live__viewer-embed"
                                  title={`Presentation viewer - ${selectedSharedResource.title}`}
                                />
                              ) : viewerAssetMimeType?.toLowerCase().includes("pdf") ? (
                                <iframe
                                  src={normalizedViewerUrl ?? viewerAssetUrl}
                                  className="classroom-live__viewer-embed"
                                  title={`PDF document viewer - ${selectedSharedResource.title}`}
                                />
                              ) : (
                                <iframe
                                  src={normalizedViewerUrl ?? viewerAssetUrl}
                                  className="classroom-live__viewer-embed"
                                  title={`Document viewer - ${selectedSharedResource.title}`}
                                />
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="classroom-live__content-empty" role="status" aria-live="polite">
                          <p className="classroom-live__content-empty-text">
                            {isInstructorView
                              ? "No shared content yet. Use Share content to present slides, videos, or PDFs."
                              : "No shared content yet. Waiting for your instructor to present content."}
                          </p>
                        </div>
                      )}
                      {sharedResources.length > 0 && (
                        <ul className="classroom-live__shared-list">
                          {visibleSharedResources.map((item) => (
                            <li key={item.id}>
                              <div className="classroom-live__shared-item-wrap">
                                <button
                                  type="button"
                                  className={`classroom-live__shared-item ${selectedSharedResourceId === item.id ? "classroom-live__shared-item--active" : ""}`}
                                  onClick={() => {
                                    if (!isInstructorView) return;
                                    setSelectedSharedResourceId(item.id);
                                    setContentView("shared");
                                    sendGenericRealtimeEvent("session.content.selected", {
                                      resource_id: item.id,
                                      page: 1,
                                    });
                                    sendGenericRealtimeEvent("session.view.changed", { view: "shared" });
                                  }}
                                  title={item.title}
                                  disabled={!isInstructorView}
                                >
                                  {item.title}
                                </button>
                                {isInstructorView && (
                                  <button
                                    type="button"
                                    className="classroom-live__shared-item-remove"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      handleRemoveSharedResource(item.id);
                                    }}
                                    aria-label={`Remove ${item.title} from shared content`}
                                    title="Remove from shared content"
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                          {hiddenSharedResourcesCount > 0 && (
                            <li>
                              <button
                                type="button"
                                className="classroom-live__shared-item classroom-live__shared-item--more"
                                onClick={() => setShowSharedListDialog(true)}
                              >
                                Show more ({hiddenSharedResourcesCount})
                              </button>
                            </li>
                          )}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </section>

              <aside className="classroom-live__right-rail">
                <section
                  className={`classroom-live__participants-panel ${railPanels.participants ? "" : "classroom-live__participants-panel--collapsed"}`}
                >
                  <button
                    type="button"
                    className="classroom-live__participants-toggle"
                    onClick={() => toggleRailPanel("participants")}
                    aria-expanded={railPanels.participants}
                  >
                    <span>
                      <Users size={16} />
                      Participants ({visibleStudents.length})
                    </span>
                    {railPanels.participants ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {railPanels.participants && (
                    <>
                      <div className="classroom-live__participants-tools">
                        <div className="classroom-live__participants-search-wrap">
                          <Search size={14} aria-hidden className="classroom-live__participants-search-icon" />
                          <input
                            type="search"
                            className="classroom-list__create-input classroom-live__participants-search"
                            placeholder="Search participants..."
                            value={participantSearch}
                            onChange={(e) => setParticipantSearch(e.target.value)}
                          />
                        </div>
                        {isInstructorView && (
                          <div className="classroom-live__participants-bonus">
                            <KidDropdown
                              value={participantBonusPreset}
                              onChange={setParticipantBonusPreset}
                              ariaLabel="Bonus points preset"
                              minWidth={90}
                              options={[
                                { value: "5", label: "+5 pts" },
                                { value: "10", label: "+10 pts" },
                                { value: "20", label: "+20 pts" },
                              ]}
                            />
                          </div>
                        )}
                      </div>
                      {filteredStudents.length === 0 ? (
                        <p className="classroom-detail__message-empty">No participants match your search.</p>
                      ) : (
                        <ul className="classroom-live__participants-list" role="list">
                          {filteredStudents.map((student) => (
                            <li key={student.actor_id} className="classroom-live__participants-item" role="listitem">
                              <div className="classroom-live__participants-meta">
                                <strong>{student.display_name}</strong>
                                <div className="classroom-live__participants-badges">
                                  {student.in_lab && (
                                    <span className="classroom-live__in-lab-badge" title={`In Lab${student.lab_type ? `: ${student.lab_type}` : ""}`}>
                                      <FlaskConical size={11} /> In Lab
                                    </span>
                                  )}
                                  {helpRequests[student.actor_id] && (
                                    <span
                                      className="classroom-live__help-badge"
                                      title={helpRequests[student.actor_id].note || "Needs help"}
                                    >
                                      <AlertCircle size={11} /> Help
                                    </span>
                                  )}
                                </div>
                                {student.email ? <span>{student.email}</span> : null}
                              </div>
                              {isInstructorView && (
                                <div className="classroom-live__participants-actions">
                                {student.in_lab && activeSession && (
                                  <button
                                    type="button"
                                    className="classroom-live__participant-action classroom-live__participant-action--join"
                                    onClick={() =>
                                      navigate(
                                        `/app/classrooms/${id}/observe-lab/${student.actor_id}` +
                                          `?session_id=${activeSession.id}&lab=${student.lab_type ?? ""}`,
                                      )
                                    }
                                    title="Observe this student's lab"
                                  >
                                    <Eye size={12} /> Join
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="classroom-live__participant-action"
                                  onClick={() => {
                                    setHelpRequests((prev) => {
                                      const next = { ...prev };
                                      delete next[student.actor_id];
                                      return next;
                                    });
                                    void runParticipantAction(student, "high_five");
                                  }}
                                >
                                  High 5
                                </button>
                                <button
                                  type="button"
                                  className="classroom-live__participant-action"
                                  onClick={() =>
                                    void runParticipantAction(student, "points_awarded", {
                                      points: Number(participantBonusPreset),
                                    })
                                  }
                                >
                                  +{participantBonusPreset}
                                </button>
                                <button
                                  type="button"
                                  className="classroom-live__participant-action"
                                  onClick={() =>
                                    void runParticipantAction(student, "callout", {
                                      message: "Awarded Classroom Contributor sticker",
                                    })
                                  }
                                >
                                  Sticker
                                </button>
                              </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </section>

                <section className="classroom-live__activity-card">
                  <button
                    type="button"
                    className="classroom-live__accordion-toggle"
                    onClick={() => toggleRailPanel("activities")}
                    aria-expanded={railPanels.activities}
                  >
                    <span>After-class activities</span>
                    {railPanels.activities ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {railPanels.activities && (
                    <ul className="classroom-live__activity-list classroom-live__accordion-body">
                      <li>Complete quick reflection</li>
                      <li>Upload one lab screenshot</li>
                      <li>Peer review one submission</li>
                    </ul>
                  )}
                </section>

                <section className="classroom-live__badge-card">
                  <button
                    type="button"
                    className="classroom-live__accordion-toggle"
                    onClick={() => toggleRailPanel("badges")}
                    aria-expanded={railPanels.badges}
                  >
                    <span>Stickers & points</span>
                    {railPanels.badges ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {railPanels.badges && (
                    <div className="classroom-live__accordion-body">
                      <p className="classroom-live__badge-copy">
                        Students can earn a session sticker after finishing activities and assignments.
                      </p>
                      <div className="classroom-live__badge-row">
                        <Trophy size={18} />
                        <span>Current sticker: Classroom Contributor</span>
                      </div>
                      {isInstructorView && pointsEnabled && (
                        <button
                          type="button"
                          className="classroom-list__create-btn classroom-list__create-btn--ghost"
                          onClick={openRecognitionDialog}
                        >
                          <Gift size={16} />
                          Assign sticker / points
                        </button>
                      )}
                      {recognitionNotice ? (
                        <p className="classroom-live__recognition-notice" role="status" aria-live="polite">
                          {recognitionNotice}
                        </p>
                      ) : null}
                      <ul className="classroom-live__event-list">
                        {activityEvents.length === 0 ? (
                          <li className="classroom-live__event-item">
                            <span>No recognition activity yet.</span>
                          </li>
                        ) : (
                          activityEvents
                            .slice(-5)
                            .reverse()
                            .map((event) => (
                              <li key={event.id} className="classroom-live__event-item">
                                <strong>{event.student_display_name ?? "Student"}</strong>
                                <span>
                                  {event.event_type === "points_awarded"
                                    ? `${event.points_delta ?? 0} pts awarded`
                                    : event.event_type === "high_five"
                                      ? "Received a high five"
                                      : "Received a callout"}
                                </span>
                                {event.message ? <small>{event.message}</small> : null}
                              </li>
                            ))
                        )}
                      </ul>
                    </div>
                  )}
                </section>

                <section className="classroom-live__resources-card">
                  <div className="classroom-live__resources-header">
                    <button
                      type="button"
                      className="classroom-live__accordion-toggle"
                      onClick={() => toggleRailPanel("resources")}
                      aria-expanded={railPanels.resources}
                    >
                      <span>Resource downloads</span>
                      {railPanels.resources ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {isInstructorView && (
                      <button
                        type="button"
                        className="classroom-list__create-btn classroom-list__create-btn--ghost"
                        onClick={openResourceDialog}
                      >
                        <Plus size={14} />
                        Add
                      </button>
                    )}
                  </div>
                  {railPanels.resources && (
                    <ul className="classroom-live__resource-list classroom-live__accordion-body">
                      {downloadableResources.length === 0 ? (
                        <li>
                          <p className="classroom-detail__message-empty">
                            No downloadable resources yet.
                          </p>
                        </li>
                      ) : (
                        downloadableResources.map((resource) => (
                          <li key={resource.id}>
                            <div className="classroom-live__resource-row">
                              <button
                                type="button"
                                className="classroom-live__resource-btn"
                                onClick={() => void handleDownloadResource(resource)}
                                disabled={downloadingResourceId === resource.id}
                                title={resource.title}
                              >
                                <Download size={14} />
                                {downloadingResourceId === resource.id ? "Opening..." : resource.title}
                              </button>
                              {isInstructorView && (
                                <button
                                  type="button"
                                  className="classroom-live__resource-remove"
                                  onClick={() => {
                                    const nextDownloads = downloadableResources.filter(
                                      (item) => item.id !== resource.id,
                                    );
                                    setDownloadableResources(nextDownloads);
                                    void persistSessionContent(sharedResources, nextDownloads);
                                  }}
                                  aria-label={`Remove ${resource.title} from downloads`}
                                  title="Remove from downloads"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </section>

                <section className="classroom-live__assignment-card">
                  <div className="classroom-live__assignment-header">
                    <button
                      type="button"
                      className="classroom-live__accordion-toggle"
                      onClick={() => toggleRailPanel("assignments")}
                      aria-expanded={railPanels.assignments}
                    >
                      <span>Assignments</span>
                      {railPanels.assignments ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {isInstructorView && (
                      <button type="button" className="classroom-list__create-btn classroom-list__create-btn--ghost" onClick={openCreateAssignmentDialog}>
                        <Plus size={14} />
                        Create
                      </button>
                    )}
                  </div>
                  {railPanels.assignments && (
                    <div className="classroom-live__accordion-body">
                      <ul className="classroom-live__assignment-list">
                        {sessionAssignments.map((assignment) => (
                          <li key={assignment.id} className="classroom-live__assignment-item">
                            <div>
                              <strong>{assignment.title}</strong>
                              <p>{assignment.instructions}</p>
                              {assignment.dueAt ? <span>Due {new Date(assignment.dueAt).toLocaleString()}</span> : null}
                            </div>
                            {isInstructorView && (
                              <button
                                type="button"
                                className="classroom-list__create-btn classroom-list__create-btn--ghost"
                                onClick={() => openEditAssignmentDialog(assignment)}
                              >
                                <Pencil size={14} />
                                Update
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                      {!isInstructorView && (
                        <div className="classroom-live__submission-card">
                          <label htmlFor="student-submission-assignment">Save under</label>
                          <select
                            id="student-submission-assignment"
                            className="classroom-list__create-input"
                            value={studentSubmissionAssignmentId}
                            onChange={(event) => setStudentSubmissionAssignmentId(event.target.value)}
                          >
                            {sessionAssignments.length === 0 && (
                              <option value="__general__">General session work</option>
                            )}
                            {sessionAssignments.map((assignment) => (
                              <option key={assignment.id} value={assignment.id}>
                                {assignment.title}
                              </option>
                            ))}
                          </select>
                          <label htmlFor="student-submission-content">Your lab work</label>
                          <textarea
                            id="student-submission-content"
                            className="classroom-list__create-input classroom-live__assignment-textarea"
                            value={studentSubmissionContent}
                            onChange={(event) => setStudentSubmissionContent(event.target.value)}
                            placeholder="Write what you completed, links, or notes from your lab."
                            rows={5}
                          />
                          <div className="classroom-live__submission-actions">
                            <button
                              type="button"
                              className="classroom-list__create-btn classroom-list__create-btn--ghost"
                              onClick={() => void handleStudentSubmission("draft")}
                              disabled={studentSubmissionSaving}
                            >
                              Save draft
                            </button>
                            <button
                              type="button"
                              className="classroom-list__create-btn"
                              onClick={() => void handleStudentSubmission("submitted")}
                              disabled={studentSubmissionSaving}
                            >
                              {studentSubmissionSaving ? "Saving..." : "Submit"}
                            </button>
                          </div>
                          {(studentSubmissionStatus || selectedStudentSubmission) && (
                            <p className="classroom-live__submission-status" role="status" aria-live="polite">
                              {studentSubmissionStatus ??
                                `Last ${selectedStudentSubmission?.status === "submitted" ? "submitted" : "saved"} ${new Date(selectedStudentSubmission?.updatedAt ?? "").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </aside>
            </div>
          </div>

          {showFloatingChat && (
            <section className="classroom-live__floating-chat" aria-label="Floating class chat">
              <header className="classroom-live__chat-header">
                <h3>Class Chat</h3>
                <button
                  type="button"
                  className="classroom-live__chat-close"
                  onClick={() => setShowFloatingChat(false)}
                  aria-label="Close chat"
                >
                  <X size={16} />
                </button>
              </header>
              <div className="classroom-live__chat-thread">
                {chatEvents.length === 0 ? (
                  <p className="classroom-detail__message-empty">No messages yet.</p>
                ) : (
                  chatEvents.map((msg) => {
                    const isOwnMessage = user?.id === msg.actor_id;
                    return (
                      <div
                        key={msg.id}
                        className={`classroom-live__chat-bubble ${isOwnMessage ? "classroom-live__chat-bubble--own" : "classroom-live__chat-bubble--other"}`}
                      >
                        <strong>{msg.actor_display_name}</strong>
                        <span>{msg.message ?? ""}</span>
                        <small>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="classroom-live__chat-composer">
                <input
                  type="text"
                  className="classroom-list__create-input"
                  placeholder={isInstructorView ? "Message class..." : "Type a message..."}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                <button
                  type="button"
                  className="classroom-list__create-btn"
                  onClick={() => sendMessage()}
                  disabled={sendingChatMessage}
                >
                  <MessageSquare size={16} />
                  {sendingChatMessage ? "Sending..." : "Send"}
                </button>
              </div>
            </section>
          )}

          <input
            ref={uploadInputRef}
            type="file"
            className="classroom-live__hidden-upload"
            onChange={handleUploadAssetFromComputer}
          />

          {showShareDialog && (
            <div className="classroom-list__dialog-overlay" onClick={() => setShowShareDialog(false)}>
              <div
                className="classroom-list__create-form classroom-list__create-form--dialog classroom-live__share-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Share content"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="classroom-list__dialog-close"
                  onClick={() => setShowShareDialog(false)}
                  aria-label="Close dialog"
                >
                  <X size={28} aria-hidden />
                </button>
                <h3 className="classroom-list__create-title">Share content</h3>
                <p className="classroom-detail__resources-label">
                  Pick from your Assets library or upload from your computer.
                </p>
                <div className="classroom-live__share-actions">
                  <button
                    type="button"
                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={uploadingAsset}
                  >
                    <Upload size={16} />
                    {uploadingAsset ? "Uploading..." : "Upload from computer"}
                  </button>
                </div>
                <div className="classroom-live__asset-list">
                  {assetOptions.length === 0 ? (
                    <p className="classroom-detail__message-empty">No assets available yet.</p>
                  ) : (
                    assetOptions.slice(0, 20).map((asset) => (
                      <label key={asset.id} className="classroom-live__asset-option">
                        <input
                          type="radio"
                          name="share-asset"
                          value={asset.id}
                          checked={selectedAssetId === asset.id}
                          onChange={(e) => setSelectedAssetId(e.target.value)}
                        />
                        <span>{asset.name}</span>
                      </label>
                    ))
                  )}
                </div>
                <div className="classroom-list__create-actions">
                  <button
                    type="button"
                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                    onClick={() => setShowShareDialog(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="classroom-list__create-btn"
                    onClick={handleShareSelectedAsset}
                    disabled={!selectedAssetId}
                  >
                    Share selected asset
                  </button>
                </div>
              </div>
            </div>
          )}

          {showResourceDialog && (
            <div className="classroom-list__dialog-overlay" onClick={() => setShowResourceDialog(false)}>
              <div
                className="classroom-list__create-form classroom-list__create-form--dialog classroom-live__share-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Add downloadable resource"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="classroom-list__dialog-close"
                  onClick={() => setShowResourceDialog(false)}
                  aria-label="Close dialog"
                >
                  <X size={28} aria-hidden />
                </button>
                <h3 className="classroom-list__create-title">Add downloadable resource</h3>
                <p className="classroom-detail__resources-label">
                  Select an asset to add to student downloads.
                </p>
                <div className="classroom-live__share-actions">
                  <button
                    type="button"
                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={uploadingAsset}
                  >
                    <Upload size={16} />
                    {uploadingAsset ? "Uploading..." : "Upload from computer"}
                  </button>
                </div>
                <div className="classroom-live__asset-list">
                  {assetOptions.length === 0 ? (
                    <p className="classroom-detail__message-empty">No assets available yet.</p>
                  ) : (
                    assetOptions.slice(0, 40).map((asset) => (
                      <label key={asset.id} className="classroom-live__asset-option">
                        <input
                          type="radio"
                          name="download-asset"
                          value={asset.id}
                          checked={selectedDownloadAssetId === asset.id}
                          onChange={(e) => setSelectedDownloadAssetId(e.target.value)}
                        />
                        <span>{asset.name}</span>
                      </label>
                    ))
                  )}
                </div>
                <div className="classroom-list__create-actions">
                  <button
                    type="button"
                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                    onClick={() => setShowResourceDialog(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="classroom-list__create-btn"
                    onClick={handleAddDownloadableResource}
                    disabled={!selectedDownloadAssetId}
                  >
                    Add to downloads
                  </button>
                </div>
              </div>
            </div>
          )}

          {showSharedListDialog && (
            <div className="classroom-list__dialog-overlay" onClick={() => setShowSharedListDialog(false)}>
              <div
                className="classroom-list__create-form classroom-list__create-form--dialog classroom-live__shared-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="All shared content"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="classroom-list__dialog-close"
                  onClick={() => setShowSharedListDialog(false)}
                  aria-label="Close dialog"
                >
                  <X size={28} aria-hidden />
                </button>
                <h3 className="classroom-list__create-title">All shared content</h3>
                <p className="classroom-detail__resources-label">
                  {isInstructorView
                    ? "Select content to present in the main viewer."
                    : "These are the items your instructor can present in the main viewer."}
                </p>
                <div className="classroom-live__asset-list">
                  {sharedResources.length === 0 ? (
                    <p className="classroom-detail__message-empty">No shared content yet.</p>
                  ) : (
                    sharedResources.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`classroom-live__shared-dialog-item ${selectedSharedResourceId === item.id ? "classroom-live__shared-dialog-item--active" : ""}`}
                        onClick={() => {
                          if (!isInstructorView) return;
                          setSelectedSharedResourceId(item.id);
                          setContentView("shared");
                          sendGenericRealtimeEvent("session.content.selected", {
                            resource_id: item.id,
                            page: 1,
                          });
                          sendGenericRealtimeEvent("session.view.changed", { view: "shared" });
                          setShowSharedListDialog(false);
                        }}
                        disabled={!isInstructorView}
                      >
                        <span>{item.title}</span>
                        <small>{item.kind}</small>
                      </button>
                    ))
                  )}
                </div>
                <div className="classroom-list__create-actions">
                  <button
                    type="button"
                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                    onClick={() => setShowSharedListDialog(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {showRecognitionDialog && (
            <div className="classroom-list__dialog-overlay" onClick={() => setShowRecognitionDialog(false)}>
              <div
                className="classroom-list__create-form classroom-list__create-form--dialog classroom-live__assignment-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Recognize student activity"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="classroom-list__dialog-close"
                  onClick={() => setShowRecognitionDialog(false)}
                  aria-label="Close dialog"
                  disabled={savingRecognition}
                >
                  <X size={28} aria-hidden />
                </button>
                <h3 className="classroom-list__create-title">Recognize student</h3>
                <div className="classroom-list__create-field">
                  <label htmlFor="recognition-student">Student</label>
                  <select
                    id="recognition-student"
                    className="classroom-list__create-input"
                    value={recognitionStudentId}
                    onChange={(e) => setRecognitionStudentId(e.target.value)}
                  >
                    <option value="">Select student</option>
                    {activeStudents.map((student) => (
                      <option key={student.actor_id} value={student.actor_id}>
                        {student.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="classroom-list__create-field">
                  <label htmlFor="recognition-type">Recognition type</label>
                  <select
                    id="recognition-type"
                    className="classroom-list__create-input"
                    value={recognitionType}
                    onChange={(e) =>
                      setRecognitionType(e.target.value as "points_awarded" | "high_five" | "callout")
                    }
                  >
                    <option value="high_five">High five</option>
                    <option value="callout">Callout</option>
                    <option value="points_awarded">Points awarded</option>
                  </select>
                </div>
                {recognitionType === "points_awarded" && (
                  <div className="classroom-list__create-field">
                    <label htmlFor="recognition-points">Points</label>
                    <input
                      id="recognition-points"
                      className="classroom-list__create-input"
                      value={recognitionPoints}
                      onChange={(e) => setRecognitionPoints(e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                )}
                <div className="classroom-list__create-field">
                  <label htmlFor="recognition-note">Note (optional)</label>
                  <textarea
                    id="recognition-note"
                    className="classroom-list__create-input classroom-live__assignment-textarea"
                    value={recognitionMessage}
                    onChange={(e) => setRecognitionMessage(e.target.value)}
                    placeholder="Great focus in class today!"
                  />
                </div>
                <div className="classroom-list__create-actions">
                  <button
                    type="button"
                    className="classroom-list__create-btn classroom-list__create-btn--ghost"
                    onClick={() => setShowRecognitionDialog(false)}
                    disabled={savingRecognition}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="classroom-list__create-btn"
                    onClick={handleCreateRecognition}
                    disabled={savingRecognition}
                  >
                    {savingRecognition ? "Saving..." : "Save activity"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <ModalDialog
            isOpen={showAssignmentDialog}
            onClose={() => setShowAssignmentDialog(false)}
            title={editingAssignmentId ? "Update assignment" : "Create assignment"}
            ariaLabel={editingAssignmentId ? "Update assignment" : "Create assignment"}
            contentClassName="classroom-list__create-form classroom-list__create-form--dialog classroom-live__assignment-dialog"
            closeVariant="neutral"
          >
            <div className="classroom-list__create-field">
              <label htmlFor="session-assignment-title">Title</label>
              <input
                id="session-assignment-title"
                className="classroom-list__create-input"
                value={assignmentTitle}
                onChange={(e) => setAssignmentTitle(e.target.value)}
                placeholder="Assignment title"
              />
            </div>
            <div className="classroom-list__create-field">
              <label htmlFor="session-assignment-instructions">Instructions</label>
              <textarea
                id="session-assignment-instructions"
                className="classroom-list__create-input classroom-live__assignment-textarea"
                value={assignmentInstructions}
                onChange={(e) => setAssignmentInstructions(e.target.value)}
                placeholder="What should students do?"
              />
            </div>
            <div className="classroom-list__create-field">
              <label htmlFor="session-assignment-due">Due date & time</label>
              <DateTimePicker
                id="session-assignment-due"
                value={assignmentDueAt}
                onChange={setAssignmentDueAt}
                datePlaceholder="Pick due date"
                timePlaceholder="Pick due time"
              />
            </div>
            <div className="classroom-list__create-actions">
              <button
                type="button"
                className="classroom-list__create-btn classroom-list__create-btn--ghost"
                onClick={() => setShowAssignmentDialog(false)}
              >
                Cancel
              </button>
              <button type="button" className="classroom-list__create-btn" onClick={handleSaveAssignment}>
                {editingAssignmentId ? "Update assignment" : "Create assignment"}
              </button>
            </div>
          </ModalDialog>

          <ModalDialog
            isOpen={showEndDialog}
            onClose={() => setShowEndDialog(false)}
            title="End active session"
            ariaLabel="End session confirmation"
            contentClassName="classroom-list__create-form classroom-list__create-form--dialog classroom-detail__end-dialog"
            closeVariant="neutral"
            disableClose={endingSession}
          >
            {forceEndRequired ? (
              <p className="classroom-detail__end-dialog-copy">
                {presenceSummary?.active_students ?? 0} student(s) are still in the
                session. Ending now will end the meeting for everyone.
              </p>
            ) : (
              <p className="classroom-detail__end-dialog-copy">
                No students are currently active in this session. Confirm to end it
                now.
              </p>
            )}
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
                {endingSession ? "Ending..." : forceEndRequired ? "End for all" : "End session"}
              </button>
            </div>
          </ModalDialog>
        </>
      )}
    </div>
  );
}
