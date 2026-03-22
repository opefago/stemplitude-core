import { CircuitLabContainer } from '../labs/mcu/components/CircuitLabContainer.tsx';
import { useLabExit } from '../features/labs/useLabExit';
import './Labs.css';

const ElectronicsLab = () => {
  const { exitLab, fallbackExitPath } = useLabExit();

  return (
    <div className="lab-page electronics-lab-fullscreen">
      <CircuitLabContainer exitPath={fallbackExitPath} onExit={exitLab} />
    </div>
  );
};

export default ElectronicsLab;
