import * as PIXI from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";
import { BJT_SVG_PIVOT, BJT_SVG_SCALE } from "../rendering/bjtSchematicSvg";
import { drawLogicInverterIEC } from "../rendering/logicGateAndZenerSchematicDraw";

export interface NotGateProperties extends CircuitProperties {
  input: boolean;
  output: boolean;
  propagationDelay: number; // nanoseconds
}

export class NotGate extends CircuitComponent {
  protected gateProps: NotGateProperties;

  constructor(name: string, gridX: number = 0, gridY: number = 0) {
    const props: NotGateProperties = {
      value: 0,
      tolerance: 0,
      powerRating: 0.1,
      voltage: 5,
      current: 0.001,
      power: 0.005,
      burnt: false,
      glowing: false,
      input: false,
      output: true, // NOT gate inverts, so default output is true
      propagationDelay: 8, // NOT gates are typically fastest
    };

    super(name, "not_gate", props, gridX, gridY);
    this.gateProps = props as NotGateProperties;
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "input",
        position: { x: -30, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "output",
        position: { x: 30, y: 0 },
        voltage: 5, // Default high output
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
    drawLogicInverterIEC(g);
    g.pivot.set(BJT_SVG_PIVOT, BJT_SVG_PIVOT);
    const flipSign = Math.sign(g.scale.x) || 1;
    g.scale.set(flipSign * BJT_SVG_SCALE, BJT_SVG_SCALE);
    g.tint = this.gateProps?.output ? 0xaaffaa : 0xffffff;
    g.hitArea = new PIXI.Rectangle(0, 0, 150, 150);
    this.updateLabels();
  }

  protected updateVisuals(_deltaTime: number): void {
    if (!this.gateProps) return;

    this.gateProps.output = !this.gateProps.input;

    this.circuitProps.voltage = this.gateProps.output ? 5 : 0;

    this.componentGraphics.tint = this.gateProps.output ? 0xaaffaa : 0xffffff;
    this.updateLabels();
  }

  private updateLabels(): void {
    // Component label
    this.labelText.text = "NOT";
    this.labelText.style = {
      fontSize: 12,
      fill: 0xffffff,
      fontFamily: "Arial",
      fontWeight: "bold",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -25);

    // Value label (show current state)
    const input = this.gateProps?.input ?? false;
    const output = this.gateProps?.output ?? false;
    const stateText = `${input ? "1" : "0"} → ${output ? "1" : "0"}`;
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
    return { labelY: -35, valueY: 45 };
  }

  protected updateNodePositions(): void {
    // Update node positions based on orientation
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    this.nodes[0].position.x = -30 * cos;
    this.nodes[0].position.y = -30 * sin;

    this.nodes[1].position.x = 30 * cos;
    this.nodes[1].position.y = 30 * sin;
  }

  protected updateNodeVoltages(): void {
    // Update input state based on node voltage
    this.gateProps.input = this.nodes[0].voltage > 2.5;

    // Calculate output (NOT logic)
    this.gateProps.output = !this.gateProps.input;

    // Set output voltage
    this.nodes[1].voltage = this.gateProps.output ? 5.0 : 0.0;

    // Very low current consumption
    this.nodes[0].current = 0.0001;
    this.nodes[1].current = -0.0001;
  }

  public getImpedance(frequency: number = 0): number {
    return 1e6; // 1MΩ
  }

  public setInput(state: boolean): void {
    this.gateProps.input = state;
    this.nodes[0].voltage = state ? 5.0 : 0.0;
    this.updateVisuals(0);
  }

  public getOutput(): boolean {
    return this.gateProps.output;
  }
}
