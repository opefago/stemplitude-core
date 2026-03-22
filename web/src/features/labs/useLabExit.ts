import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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

export function useLabExit() {
  const navigate = useNavigate();
  const location = useLocation();

  const fallbackExitPath = useMemo(() => {
    const state = (location.state ?? {}) as { returnTo?: string };
    if (state.returnTo) return state.returnTo;
    return getFallbackExitPath(location.search);
  }, [location.search, location.state]);

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

  return { exitLab, fallbackExitPath };
}

