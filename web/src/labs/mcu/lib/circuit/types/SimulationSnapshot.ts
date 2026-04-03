export type SimulationSnapshot = {
  time: number;
  nodeVoltages: Record<string, number>;
  componentTerminalCurrents: Record<string, Record<string, number>>;
  componentTerminalVoltages?: Record<string, Record<string, number>>;
  componentPower?: Record<string, number>;
  componentTemperatures?: Record<string, number>;
  componentStates?: Record<string, Record<string, unknown>>;
  convergence?: {
    converged: boolean;
    iterations: number;
  };
};

export function createEmptySnapshot(): SimulationSnapshot {
  return {
    time: 0,
    nodeVoltages: {},
    componentTerminalCurrents: {},
    componentTerminalVoltages: {},
    componentPower: {},
  };
}
