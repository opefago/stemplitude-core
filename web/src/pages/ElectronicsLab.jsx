import { CircuitLabContainer } from '../labs/mcu/components/CircuitLabContainer.tsx';
import './Labs.css';

const ElectronicsLab = () => {
  return (
    <div className="lab-page electronics-lab-fullscreen">
      <CircuitLabContainer exitPath="/playground" />
    </div>
  );
};

export default ElectronicsLab;
