import type { SimulationSnapshot } from "../types/SimulationSnapshot";
import type { WireVisualState } from "../types/WireTypes";
import { createDefaultWireVisualState } from "../types/WireTypes";
import { DesignTokens } from "../rendering/DesignTokens";

type WireConnection = {
  id: string;
  startNodeId?: string;
  endNodeId?: string;
  startComponentId?: string;
  endComponentId?: string;
  current: number;
  voltage: number;
};

/**
 * Maps solver simulation results to per-wire visual states.
 * This bridges the solver output (node voltages, terminal currents)
 * to the wire rendering system (particle speed, glow, etc.).
 */
export class WireCurrentMapper {
  /**
   * Given a simulation snapshot and wire topology, compute visual states for each wire.
   */
  mapWireStates(
    snapshot: SimulationSnapshot,
    wires: WireConnection[]
  ): Map<string, WireVisualState> {
    const states = new Map<string, WireVisualState>();

    for (const wire of wires) {
      const vs = this.computeWireVisualState(snapshot, wire);
      states.set(wire.id, vs);
    }

    return states;
  }

  private computeWireVisualState(
    snapshot: SimulationSnapshot,
    wire: WireConnection
  ): WireVisualState {
    const state = createDefaultWireVisualState();

    // Try to determine current from connected component terminals
    let current = wire.current;

    // If wire has endpoint component info, look up terminal currents
    if (wire.startComponentId && snapshot.componentTerminalCurrents) {
      const compCurrents = snapshot.componentTerminalCurrents[wire.startComponentId];
      if (compCurrents) {
        const terminalId = wire.startNodeId ?? Object.keys(compCurrents)[0];
        if (terminalId && compCurrents[terminalId] !== undefined) {
          current = compCurrents[terminalId];
        }
      }
    }

    // If still zero, try end component
    if (Math.abs(current) < 1e-9 && wire.endComponentId && snapshot.componentTerminalCurrents) {
      const compCurrents = snapshot.componentTerminalCurrents[wire.endComponentId];
      if (compCurrents) {
        const terminalId = wire.endNodeId ?? Object.keys(compCurrents)[0];
        if (terminalId && compCurrents[terminalId] !== undefined) {
          current = -compCurrents[terminalId]; // Negate for direction
        }
      }
    }

    const absCurrent = Math.abs(current);
    state.currentMagnitude = absCurrent;
    state.currentDirection = current > 0.001 ? 1 : current < -0.001 ? -1 : 0;
    state.energized = absCurrent > DesignTokens.particle.currentThreshold;

    // Voltage drop across wire
    if (wire.startNodeId && wire.endNodeId) {
      const v1 = snapshot.nodeVoltages[wire.startNodeId] ?? 0;
      const v2 = snapshot.nodeVoltages[wire.endNodeId] ?? 0;
      state.voltageDrop = v1 - v2;
    }

    // Particle rate: more particles at higher current
    if (state.energized) {
      const normalizedI = Math.min(absCurrent / 1.0, 1.0); // Normalize to 1A
      state.particleRate = 0.2 + normalizedI * 0.8;
      state.glowLevel = Math.min(normalizedI * 0.8, DesignTokens.wire.glowMaxAlpha);
    }

    return state;
  }

  /**
   * Update wire.current and wire.voltage from the snapshot.
   * Call this in place of the old placeholder code that set wire.current = 0.
   */
  updateWireConnectionsFromSnapshot(
    wires: WireConnection[],
    snapshot: SimulationSnapshot
  ): void {
    for (const wire of wires) {
      const vs = this.computeWireVisualState(snapshot, wire);
      wire.current = vs.currentDirection * vs.currentMagnitude;
      wire.voltage = vs.voltageDrop ?? 0;
    }
  }
}
