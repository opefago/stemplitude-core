import { Esp32BlocklyEditor } from '../labs/mcu/components/blockly/Esp32BlocklyEditor.tsx';
import { useLabSession } from '../features/labs/useLabSession';
import './Labs.css';

const MCULab = () => {
  const { exitLab, fallbackExitPath } = useLabSession();

  return (
    <div className="lab-page mcu-lab-fullscreen">
      <div style={{ width: '100%', height: '100vh' }}>
        <Esp32BlocklyEditor exitPath={fallbackExitPath} onExit={exitLab} />
      </div>
    </div>
  );
};

export default MCULab;
