import { Graphics } from "pixi.js";
import { CircuitComponent } from "../CircuitComponent";
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
        position: { x: -40, y: -15 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "inputB",
        position: { x: -40, y: 15 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "output",
        position: { x: 40, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected createVisuals(): void {
    this.componentGraphics.clear();

    // Enhanced OR gate drawing from reference implementation
    const width = 80;
    const height = 60;

    // OR gate outline - REMOVED dark fill for visibility on black canvas
    // this.componentGraphics.rect(-width / 2, -height / 2, width, height);
    // this.componentGraphics.fill(0x333333);

    // OR gate symbol (curved shape)
    // Left curved side
    this.componentGraphics.moveTo(-30, -20);
    this.componentGraphics.quadraticCurveTo(-20, 0, -30, 20);

    // Right curved side (output)
    this.componentGraphics.moveTo(-30, -20);
    this.componentGraphics.quadraticCurveTo(10, -10, 30, 0);
    this.componentGraphics.quadraticCurveTo(10, 10, -30, 20);

    this.componentGraphics.fill(0xff4444);
    this.componentGraphics.stroke({ width: 2, color: 0xff6666 });

    // Input lines
    this.componentGraphics.moveTo(-40, -15);
    this.componentGraphics.lineTo(-30, -15);
    this.componentGraphics.moveTo(-40, 15);
    this.componentGraphics.lineTo(-30, 15);
    this.componentGraphics.stroke({ width: 2, color: 0xffffff });

    // Output line
    this.componentGraphics.moveTo(30, 0);
    this.componentGraphics.lineTo(40, 0);
    this.componentGraphics.stroke({ width: 2, color: 0xffffff });

    // Update text labels
    this.updateLabels();
  }

  protected updateVisuals(deltaTime: number): void {
    // Only update if gateProps is initialized
    if (!this.gateProps) return;

    // Update gate output based on inputs (OR logic)
    this.gateProps.output = this.gateProps.inputA || this.gateProps.inputB;

    // Update output voltage
    this.circuitProps.voltage = this.gateProps.output ? 5 : 0;

    // Visual feedback for gate state
    if (this.gateProps.output !== (this.nodes[2].voltage > 2.5)) {
      this.createVisuals();
    }

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

    // Input A (top-left when orientation = 0)
    this.nodes[0].position.x = -40 * cos - -15 * sin;
    this.nodes[0].position.y = -40 * sin + -15 * cos;

    // Input B (bottom-left when orientation = 0)
    this.nodes[1].position.x = -40 * cos - 15 * sin;
    this.nodes[1].position.y = -40 * sin + 15 * cos;

    // Output (right when orientation = 0)
    this.nodes[2].position.x = 40 * cos - 0 * sin;
    this.nodes[2].position.y = 40 * sin + 0 * cos;
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
