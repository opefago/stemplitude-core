import * as PIXI from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";
import { BJT_SVG_PIVOT, BJT_SVG_SCALE } from "../rendering/bjtSchematicSvg";
import { drawLogicNorIEC } from "../rendering/logicGateAndZenerSchematicDraw";

export interface NorGateProperties extends CircuitProperties {
  inputStates: [boolean, boolean];
  outputState: boolean;
}

/**
 * 2-input NOR gate (OR body + inversion bubble).
 */
export class NorGate extends CircuitComponent {
  protected gateProps: NorGateProperties;

  constructor(name: string, gridX: number = 0, gridY: number = 0) {
    const props: NorGateProperties = {
      value: 0,
      tolerance: 0,
      powerRating: 0.1,
      voltage: 5,
      current: 0.001,
      power: 0.005,
      burnt: false,
      glowing: false,
      inputStates: [false, false],
      outputState: true,
    };

    super(name, "nor_gate", props, gridX, gridY);
    this.gateProps = props as NorGateProperties;
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "input1",
        position: { x: -30, y: -10 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "input2",
        position: { x: -30, y: 10 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "output",
        position: { x: 30, y: 0 },
        voltage: 5,
        current: 0,
        connections: [],
      },
    ];
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -28, valueY: 36 };
  }

  protected getTerminalPinRadius(): number {
    return 5;
  }

  protected createVisuals(): void {
    const g = this.componentGraphics;
    g.clear();
    drawLogicNorIEC(g);
    g.pivot.set(BJT_SVG_PIVOT, BJT_SVG_PIVOT);
    const flipSign = Math.sign(g.scale.x) || 1;
    g.scale.set(flipSign * BJT_SVG_SCALE, BJT_SVG_SCALE);
    g.tint = this.gateProps?.outputState ? 0xaaffaa : 0xffffff;
    g.hitArea = new PIXI.Rectangle(0, 0, 150, 150);
    this.updateLabels();
  }

  private updateLabels(): void {
    if (!this.gateProps) return;
    this.labelText.text = "NOR";
    this.labelText.style = {
      fontSize: 11,
      fill: 0xffffff,
      fontFamily: "Arial",
      fontWeight: "bold",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -28);

    const [a, b] = this.gateProps.inputStates;
    const o = this.gateProps.outputState;
    this.valueText.text = `${a ? "1" : "0"}${b ? "1" : "0"} → ${o ? "1" : "0"}`;
    this.valueText.style = {
      fontSize: 8,
      fill: 0xcccccc,
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 36);
  }

  protected updateVisuals(_deltaTime: number): void {
    if (!this.gateProps) return;

    this.gateProps.outputState = !(
      this.gateProps.inputStates[0] || this.gateProps.inputStates[1]
    );
    this.circuitProps.voltage = this.gateProps.outputState ? 5 : 0;

    this.componentGraphics.tint = this.gateProps.outputState ? 0xaaffaa : 0xffffff;
    this.updateLabels();
  }

  protected updateNodePositions(): void {
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    this.nodes[0].position.x = -30 * cos - -10 * sin;
    this.nodes[0].position.y = -30 * sin + -10 * cos;

    this.nodes[1].position.x = -30 * cos - 10 * sin;
    this.nodes[1].position.y = -30 * sin + 10 * cos;

    this.nodes[2].position.x = 30 * cos;
    this.nodes[2].position.y = 30 * sin;
  }

  protected updateNodeVoltages(): void {
    this.gateProps.inputStates = [
      this.nodes[0].voltage > 2.5,
      this.nodes[1].voltage > 2.5,
    ];
    this.gateProps.outputState = !(
      this.gateProps.inputStates[0] || this.gateProps.inputStates[1]
    );
    this.nodes[2].voltage = this.gateProps.outputState ? 5 : 0;

    this.nodes[0].current = 0.0001;
    this.nodes[1].current = 0.0001;
    this.nodes[2].current = -0.0002;
  }

  public getImpedance(_frequency: number = 0): number {
    return 1e6;
  }

  public setInput1(state: boolean): void {
    this.nodes[0].voltage = state ? 5 : 0;
    this.gateProps.inputStates[0] = state;
    this.updateVisuals(0);
  }

  public setInput2(state: boolean): void {
    this.nodes[1].voltage = state ? 5 : 0;
    this.gateProps.inputStates[1] = state;
    this.updateVisuals(0);
  }

  public getOutput(): boolean {
    return this.gateProps.outputState;
  }
}
