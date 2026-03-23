import { CircuitLabContainer } from '../labs/mcu/components/CircuitLabContainer.tsx';
import { useLabSession } from '../features/labs/useLabSession';
import { useLabSync } from '../features/labs/useLabSync';
import './Labs.css';

const ElectronicsLab = () => {
  const { exitLab, fallbackExitPath, panel, classroomContext } = useLabSession();
  // Yjs infrastructure — state binding handled inside CircuitLabContainer when ydoc/provider are passed
  const { ydoc, provider } = useLabSync(null, classroomContext?.sessionId, false, !!classroomContext);

  return (
    <div className="lab-page electronics-lab-fullscreen">
      <CircuitLabContainer
        exitPath={fallbackExitPath}
        onExit={exitLab}
        ydoc={classroomContext ? ydoc : undefined}
        yjsProvider={classroomContext ? provider : undefined}
      />
      {panel}
    </div>
  );
};

export default ElectronicsLab;
