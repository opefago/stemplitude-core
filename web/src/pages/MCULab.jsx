import { Esp32BlocklyEditor } from '../labs/mcu/components/blockly/Esp32BlocklyEditor.tsx';
import { useLabSession } from '../features/labs/useLabSession';
import { useLabSync } from '../features/labs/useLabSync';
import './Labs.css';

const MCULab = () => {
  const { exitLab, fallbackExitPath, panel, classroomContext } = useLabSession();
  const { ydoc, provider } = useLabSync(null, classroomContext?.sessionId, false, !!classroomContext);

  return (
    <div className="lab-page mcu-lab-fullscreen">
      <div style={{ width: '100%', height: '100vh' }}>
        <Esp32BlocklyEditor
          exitPath={fallbackExitPath}
          onExit={exitLab}
          ydoc={classroomContext ? ydoc : undefined}
          yjsProvider={classroomContext ? provider : undefined}
        />
      </div>
      {panel}
    </div>
  );
};

export default MCULab;
