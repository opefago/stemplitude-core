import { CircuitComponent } from "../CircuitComponent";
import { MnaStampWriter } from "./MnaStampWriter";

export type ComponentStampRegistry = Record<
  string,
  (component: CircuitComponent) => void
>;

export interface MnaSystemMatrices {
  G: number[][];
  B: number[][];
  C: number[][];
  D: number[][];
  i: number[];
  e: number[];
  stampWriter: MnaStampWriter;
}

export class MnaAssembler {
  public static createSystem(
    numNodes: number,
    voltageSourceCount: number,
    gmin = 1e-12,
  ): MnaSystemMatrices {
    const G = Array(numNodes)
      .fill(0)
      .map(() => Array(numNodes).fill(0));
    const B = Array(numNodes)
      .fill(0)
      .map(() => Array(voltageSourceCount).fill(0));
    const C = Array(voltageSourceCount)
      .fill(0)
      .map(() => Array(numNodes).fill(0));
    const D = Array(voltageSourceCount)
      .fill(0)
      .map(() => Array(voltageSourceCount).fill(0));
    const i = Array(numNodes).fill(0);
    const e = Array(voltageSourceCount).fill(0);
    const stampWriter = new MnaStampWriter(G, B, C, D, i, e);
    stampWriter.stampGminAllNodes(gmin);
    return { G, B, C, D, i, e, stampWriter };
  }

  public static applyComponentRegistry(
    components: Map<string, CircuitComponent>,
    registry: ComponentStampRegistry,
    onUnknownType: (type: string) => void,
  ): void {
    components.forEach((component) => {
      const type = component.getComponentType();
      const handler = registry[type];
      if (!handler) {
        onUnknownType(type);
        return;
      }
      handler(component);
    });
  }
}
