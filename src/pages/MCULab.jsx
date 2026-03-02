import { Esp32BlocklyEditor } from '../labs/mcu/components/blockly/Esp32BlocklyEditor.tsx';
import './Labs.css';

const MCULab = () => {
  return (
    <div className="lab-page mcu-lab-fullscreen">
      <div style={{ width: '100%', height: '100vh' }}>
        <Esp32BlocklyEditor exitPath="/playground" />
      </div>
    </div>
  );
};

export default MCULab;
