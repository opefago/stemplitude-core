import * as PIXI from "pixi.js";
import { CircuitComponent } from "../CircuitComponent";
import { BJT_SVG_PIVOT, BJT_SVG_SCALE } from "../rendering/bjtSchematicSvg";
import { drawLogicOrIEC } from "../rendering/logicGateAndZenerSchematicDraw";
import { LogicGateProperties } from "./AndGate";

export class OrGate extends CircuitComponent {
  protected gateProps: LogicGateProperties;

  constructor(name: string, gridX: number = 0, gridY: number = 0) {
    const props: LogicGateProperties = {
      value: 0,
      tolerance: 0,
      powerRating: 0.1,
      voltage: 5,
      current: 0.001,
      power: 0.005,
      burnt: false,
      glowing: false,
      inputA: false,
      inputB: false,
      output: false,
      propagationDelay: 10,
    };

    super(name, "or_gate", props, gridX, gridY);
    this.gateProps = props as LogicGateProperties;
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "inputA",
        position: { x: -30, y: -10 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "inputB",
        position: { x: -30, y: 10 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "output",
        position: { x: 30, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected getTerminalPinRadius(): number {
    return 5;
  }

  protected createVisuals(): void {
    const g = this.componentGraphics;
    g.clear();
    drawLogicOrIEC(g);
    g.pivot.set(BJT_SVG_PIVOT, BJT_SVG_PIVOT);
    const flipSign = Math.sign(g.scale.x) || 1;
    g.scale.set(flipSign * BJT_SVG_SCALE, BJT_SVG_SCALE);
    g.tint = this.gateProps?.output ? 0xaaffaa : 0xffffff;
    g.hitArea = new PIXI.Rectangle(0, 0, 150, 150);
    this.updateLabels();
  }

  protected updateVisuals(_deltaTime: number): void {
    if (!this.gateProps) return;

    this.gateProps.output = this.gateProps.inputA || this.gateProps.inputB;

    this.circuitProps.voltage = this.gateProps.output ? 5 : 0;

    this.componentGraphics.tint = this.gateProps.output ? 0xaaffaa : 0xffffff;
    this.updateLabels();
  }

  private updateLabels(): void {
    // Component label
    this.labelText.text = "OR";
    this.labelText.style = {
      fontSize: 12,
      fill: 0xffffff,
      fontFamily: "Arial",
      fontWeight: "bold",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, 0);

    // Value label (show current state)
    const inputA = this.gateProps?.inputA ?? false;
    const inputB = this.gateProps?.inputB ?? false;
    const output = this.gateProps?.output ?? false;
    const stateText = `${inputA ? "1" : "0"}${inputB ? "1" : "0"} → ${output ? "1" : "0"}`;
    this.valueText.text = stateText;
    this.valueText.style = {
      fontSize: 8,
      fill: 0xcccccc,
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 35);
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: 0, valueY: 45 };
  }

  protected updateNodePositions(): void {
    // Update node positions based on orientation
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
    // Update input states based on node voltages
    this.gateProps.inputA = this.nodes[0].voltage > 2.5;
    this.gateProps.inputB = this.nodes[1].voltage > 2.5;

    // Calculate output (OR logic)
    this.gateProps.output = this.gateProps.inputA || this.gateProps.inputB;

    // Set output voltage
    this.nodes[2].voltage = this.gateProps.output ? 5.0 : 0.0;

    // Very low current consumption
    this.nodes[0].current = 0.0001;
    this.nodes[1].current = 0.0001;
    this.nodes[2].current = -0.0002;
  }

  public getImpedance(frequency: number = 0): number {
    return 1e6; // 1MΩ
  }

  public setInputA(state: boolean): void {
    this.gateProps.inputA = state;
    this.nodes[0].voltage = state ? 5.0 : 0.0;
    this.updateVisuals(0);
  }

  public setInputB(state: boolean): void {
    this.gateProps.inputB = state;
    this.nodes[1].voltage = state ? 5.0 : 0.0;
    this.updateVisuals(0);
  }

  public getOutput(): boolean {
    return this.gateProps.output;
  }
}
