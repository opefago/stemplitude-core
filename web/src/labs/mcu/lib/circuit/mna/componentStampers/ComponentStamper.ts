import { CircuitComponent } from "../../CircuitComponent";
import { CircuitNetlist } from "../CircuitNetlist";
import type { Timer555State } from "../domains/digital";
import type { RelayState } from "../domains/linear";

export interface ComponentStamperContext {
  netlist: CircuitNetlist;
  inTransientStamping: boolean;
  timeStep: number;
  nodeIndex(globalNodeId: string): number;
  addTwoNodeConductance(n1: number, n2: number, conductance: number): void;
  addTwoNodeCurrentSource(nPlus: number, nMinus: number, current: number): void;
  addSeriesVoltageSource(
    nPlus: number,
    nMinus: number,
    vsIndex: number,
    voltage: number,
    seriesResistance: number,
  ): void;
  setVoltageSourceMap(componentId: string, vsIndex: number): void;
  limitStateFlip(key: string, prev: boolean, next: boolean): boolean;
  getComparatorState(componentId: string): boolean | undefined;
  setComparatorState(componentId: string, isHigh: boolean): void;
  getTimer555State(componentId: string): Timer555State | undefined;
  setTimer555State(componentId: string, state: Timer555State): void;
  getRelayState(componentId: string): RelayState | undefined;
  setRelayState(componentId: string, state: RelayState): void;
  getSpdtState(componentId: string): number | undefined;
  setSpdtState(componentId: string, value: number): void;
  evaluatePnCompanion(
    vAnodeCathode: number,
    kneeVoltage: number,
    dynamicResistance: number,
  ): { g: number; i: number };
}

export interface ComponentStamper {
  readonly type: string;
  stamp(component: CircuitComponent, ctx: ComponentStamperContext): void;
}
