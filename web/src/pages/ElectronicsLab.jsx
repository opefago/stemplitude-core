import { CircuitLabContainer } from '../labs/mcu/components/CircuitLabContainer.tsx';
import { useLabSession } from '../features/labs/useLabSession';
import './Labs.css';

const ElectronicsLab = () => {
  const { exitLab, fallbackExitPath } = useLabSession();

  return (
    <div className="lab-page electronics-lab-fullscreen">
      <CircuitLabContainer exitPath={fallbackExitPath} onExit={exitLab} />
    </div>
  );
};

export default ElectronicsLab;
