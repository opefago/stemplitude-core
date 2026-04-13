import { type ReactElement, useCallback, useEffect, useMemo, useRef } from "react";
import { createElement } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { heartbeatMySession } from "../../lib/api/classrooms";
import { ApiHttpError } from "../../lib/api/client";
import { useAuth } from "../../providers/AuthProvider";
import { LiveVideoWidget } from "../classrooms/LiveVideoWidget";
import { LabAssistantPanel } from "./LabAssistantPanel";

/** Classroom context carried through URL params when a lab is launched from a session or assignment. */
export interface LabClassroomContext {
  classroomId: string;
  sessionId: string;
  referrer: string;
  labType: string | null;
  /** Set when opened from the assignment workflow (for submitting back with snapshot). */
  assignmentId: string | null;
  curriculumLabId: string | null;
  lessonId: string | null;
  savedProjectId: string | null;
}

const IN_LAB_HEARTBEAT_MS = 30_000;

const CLASSROOM_LAB_REFERRERS = new Set(["classroom_live_session", "assignment_view"]);

function parseClassroomContext(search: string): LabClassroomContext | null {
  const params = new URLSearchParams(search);
  const classroomId = params.get("classroom_id");
  const sessionId = params.get("session_id");
  const referrer = params.get("referrer");
  if (
    classroomId &&
    sessionId &&
    referrer &&
    CLASSROOM_LAB_REFERRERS.has(referrer)
  ) {
    return {
      classroomId,
      sessionId,
      referrer,
      labType: params.get("lab"),
      assignmentId: params.get("assignment_id"),
      curriculumLabId: params.get("curriculum_lab_id"),
      lessonId: params.get("lesson_id"),
      savedProjectId: params.get("saved_project_id"),
    };
  }
  return null;
}

function getFallbackExitPath(search: string): string {
  const params = new URLSearchParams(search);
  const returnTo = params.get("return_to");
  if (returnTo) return returnTo;

  const classroomId = params.get("classroom_id");
  if (classroomId) {
    const referrer = params.get("referrer");
    if (referrer === "classroom_live_session") {
      return `/app/classrooms/${classroomId}/live`;
    }
    return `/app/classrooms/${classroomId}?tab=sessions`;
  }

  return "/playground";
}

/**
 * Common base hook for all virtual lab pages.
 *
 * Provides:
 * - exitLab() navigation with correct return path
 * - classroomContext from URL params (null when opened standalone)
 * - Automatic in-lab heartbeats to the classroom session so the student
 *   remains visible as a participant while working in the lab
 */
export function useLabSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const classroomContext = useMemo(
    () => parseClassroomContext(location.search),
    [location.search],
  );

  const fallbackExitPath = useMemo(() => {
    const state = (location.state ?? {}) as { returnTo?: string };
    if (state.returnTo) return state.returnTo;
    return getFallbackExitPath(location.search);
  }, [location.search, location.state]);

  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopHeartbeatRef = useRef(false);

  // Send in-lab heartbeats to keep the student listed as a participant
  useEffect(() => {
    if (!classroomContext) return;
    // Student-only endpoint; wait for auth and run only for students.
    if (user?.subType !== "student") return;
    stopHeartbeatRef.current = false;
    const { classroomId, sessionId, labType } = classroomContext;

    const sendHeartbeat = () => {
      if (stopHeartbeatRef.current) return;
      void heartbeatMySession(classroomId, sessionId, "in_lab", labType).catch((err: unknown) => {
        const status = err instanceof ApiHttpError ? err.status : undefined;
        // Terminal states for this page: stop sending heartbeat loop.
        if (status === 409 || status === 403 || status === 401) {
          stopHeartbeatRef.current = true;
          if (heartbeatIntervalRef.current !== null) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
          }
        }
      });
    };

    sendHeartbeat();
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, IN_LAB_HEARTBEAT_MS);

    return () => {
      if (heartbeatIntervalRef.current !== null) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [classroomContext?.classroomId, classroomContext?.sessionId, classroomContext?.labType, user?.subType]);

  const exitLab = useCallback(() => {
    const idx =
      typeof window !== "undefined"
        ? (window.history.state?.idx as number | undefined)
        : undefined;

    if (typeof idx === "number" && idx > 0) {
      navigate(-1);
      return;
    }

    navigate(fallbackExitPath, { replace: true });
  }, [fallbackExitPath, navigate]);

  const meetingProvider = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("meeting_provider");
  }, [location.search]);

  const useBuiltInVideo = meetingProvider === "built_in";

  const panel: ReactElement | null = classroomContext
    ? createElement(
        "div",
        null,
        useBuiltInVideo
          ? createElement(LiveVideoWidget, {
              classroomId: classroomContext.classroomId,
              sessionId: classroomContext.sessionId,
              isInstructorView: user?.subType === "user",
            })
          : null,
        createElement(LabAssistantPanel, { classroomContext }),
      )
    : null;

  return { exitLab, fallbackExitPath, classroomContext, panel };
}
