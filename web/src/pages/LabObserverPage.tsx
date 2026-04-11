/**
 * LabObserverPage — observe a participant's lab in real-time via Yjs.
 *
 * Route: /app/classrooms/:classroomId/observe-lab/:actorId
 * Query:  ?session_id=<sessionId>&lab=<labType>
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Wifi, WifiOff } from "lucide-react";
import { buildSoloRoomId, useLabSync, getLocalActorId } from "../features/labs/useLabSync";
import { LabAssistantPanel } from "../features/labs/LabAssistantPanel";
import { LabAnnotationOverlay } from "../components/lab/LabAnnotationOverlay";
import type { LabClassroomContext } from "../features/labs/useLabSession";
import { useAuth } from "../providers/AuthProvider";
import { BlocklyLabObserver } from "../labs/observer/BlocklyLabObserver";
import { CircuitLabObserver } from "../labs/observer/CircuitLabObserver";
import { DesignLabObserver } from "../labs/observer/DesignLabObserver";
import { GameDevLabObserver } from "../labs/observer/GameDevLabObserver";
import { PythonLabObserver } from "../labs/observer/PythonLabObserver";
import "./LabObserverPage.css";

const LAB_LABELS: Record<string, string> = {
  "python-game": "Python Game Lab",
  "game-maker": "Game Maker Lab",
  mcu: "Micro Controller Lab",
  electronics: "Electronics Lab",
  "circuit-maker": "Electronics Lab",
  "design-maker": "Design Maker Lab",
  gamedev: "Game Dev Lab",
};

export function LabObserverPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { classroomId, actorId } = useParams<{ classroomId: string; actorId: string }>();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id") ?? undefined;
  const labType = searchParams.get("lab") ?? "";

  // Connect to the observed actor's solo Yjs room in read-only mode
  const roomId = actorId && sessionId ? buildSoloRoomId(actorId, sessionId) : null;
  const { ydoc, provider, isConnected } = useLabSync(
    roomId,
    sessionId,
    true,
    !!(actorId && sessionId),
  );

  const classroomContext = useMemo<LabClassroomContext | null>(() => {
    if (!classroomId || !sessionId) return null;
    return {
      classroomId,
      sessionId,
      referrer: "classroom_live_session",
      labType: null,
      assignmentId: null,
      curriculumLabId: null,
      savedProjectId: null,
    };
  }, [classroomId, sessionId]);

  const exitObserver = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const labLabel = LAB_LABELS[labType] ?? labType ?? "Lab";

  const renderObserver = () => {
    if (!provider) {
      return (
        <div className="lab-observer__loading">
          <span>Connecting to lab…</span>
        </div>
      );
    }

    switch (labType) {
      case "python-game":
        return <PythonLabObserver ydoc={ydoc} provider={provider} />;
      case "game-maker":
      case "mcu":
        return <BlocklyLabObserver ydoc={ydoc} provider={provider} />;
      case "electronics":
      case "circuit-maker":
        return <CircuitLabObserver ydoc={ydoc} provider={provider} />;
      case "design-maker":
        return <DesignLabObserver ydoc={ydoc} provider={provider} />;
      case "gamedev":
        return <GameDevLabObserver ydoc={ydoc} provider={provider} />;
      default:
        return (
          <div className="lab-observer__unsupported">
            <p>Unknown lab type: <code>{labType}</code></p>
          </div>
        );
    }
  };

  return (
    <div className="lab-observer">
      {/* Header bar */}
      <header className="lab-observer__header">
        <button
          type="button"
          className="lab-observer__back-btn"
          onClick={exitObserver}
          aria-label="Exit observer mode"
        >
          <ArrowLeft size={16} />
          Exit Observer
        </button>
        <span className="lab-observer__title">
          Observing {labLabel}
        </span>
        <span
          className={`lab-observer__status${isConnected ? " lab-observer__status--connected" : ""}`}
          title={isConnected ? "Live sync active" : "Connecting…"}
        >
          {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {isConnected ? "Live" : "Connecting…"}
        </span>
      </header>

      {/* Lab view with annotation overlay */}
      <div className="lab-observer__content">
        <LabAnnotationOverlay
          provider={provider}
          actorId={getLocalActorId() ?? user?.id ?? ""}
          actorName={user?.firstName ?? user?.email?.split("@")[0] ?? "Instructor"}
          isInstructor
          enabled={Boolean(provider && isConnected)}
          normalizationTargetSelector="#observer-pixi-container"
        >
          {renderObserver()}
        </LabAnnotationOverlay>
      </div>

      {/* Floating chat panel (observer mode) */}
      {classroomContext && (
        <LabAssistantPanel classroomContext={classroomContext} />
      )}
    </div>
  );
}
