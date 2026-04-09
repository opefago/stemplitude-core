import { CircuitLabContainer } from "../labs/circuit/components/CircuitLabContainer.tsx";
import { useLabSession } from "../features/labs/useLabSession";
import { useLabSync, getLocalActorId } from "../features/labs/useLabSync";
import { LabAnnotationOverlay } from "../components/lab/LabAnnotationOverlay";
import "./Labs.css";

const ElectronicsLab = () => {
  const { exitLab, fallbackExitPath, panel, classroomContext } =
    useLabSession();
  const { ydoc, provider } = useLabSync(
    null,
    classroomContext?.sessionId,
    false,
    !!classroomContext,
  );

  return (
    <div className="lab-page electronics-lab-fullscreen">
      <CircuitLabContainer
        exitPath={fallbackExitPath}
        onExit={exitLab}
        ydoc={classroomContext ? ydoc : undefined}
        yjsProvider={classroomContext ? provider : undefined}
        classroomId={classroomContext?.classroomId}
        sessionId={classroomContext?.sessionId}
      />
      {classroomContext && provider && (
        <LabAnnotationOverlay
          provider={provider}
          actorId={getLocalActorId() ?? ''}
          actorName="Student"
          isInstructor={false}
          enabled
        >
          <span />
        </LabAnnotationOverlay>
      )}
      {panel}
    </div>
  );
};

export default ElectronicsLab;
