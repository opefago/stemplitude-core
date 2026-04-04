import * as PIXI from "pixi.js";
import {
  CircuitComponent,
  CircuitProperties,
} from "../CircuitComponent";
import { applyIECSchematicTransform } from "../rendering/iecSchematicDraw";

export interface PotentiometerProperties extends CircuitProperties {
  totalResistance: number;
  /** 0 = wiper at end1, 1 = wiper at end2 */
  wiperPosition: number;
}

export class Potentiometer extends CircuitComponent {
  /** `circuitProps` is assigned before `createVisuals()`; a stored field is not. */
  protected get potProps(): PotentiometerProperties {
    return this.circuitProps as PotentiometerProperties;
  }

  constructor(
    name: string,
    totalOhms: number = 10000,
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: PotentiometerProperties = {
      value: totalOhms,
      resistance: totalOhms,
      tolerance: 10,
      powerRating: 0.25,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      totalResistance: totalOhms,
      wiperPosition: 0.5,
    };
    super(name, "potentiometer", props, gridX, gridY);
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "end1",
        position: { x: -30, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "end2",
        position: { x: 30, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "wiper",
        position: { x: 0, y: 30 },
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -42, valueY: 42 };
  }

  protected getTerminalPinRadius(): number {
    return 5;
  }

  protected updateNodePositions(): void {
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);
    const flipX = Math.sign(this.componentGraphics.scale.x) || 1;
    const bases = [
      { x: -30, y: 0 },
      { x: 30, y: 0 },
      { x: 0, y: 30 },
    ];
    bases.forEach((b, i) => {
      const bx = b.x * flipX;
      this.nodes[i].position.x = bx * cos - b.y * sin;
      this.nodes[i].position.y = bx * sin + b.y * cos;
    });
  }

  protected createVisuals(): void {
    const g = this.componentGraphics;
    g.clear();
    g.removeChildren();
    const flipSign = Math.sign(g.scale.x) || 1;

    // SVG-inspired IEC potentiometer, drawn directly via Pixi primitives.
    const line = { width: 10, color: 0xffffff, cap: "round" as const, join: "round" as const };

    // End leads
    g.moveTo(0, 75);
    g.lineTo(22, 75);
    g.stroke(line);
    g.moveTo(128, 75);
    g.lineTo(150, 75);
    g.stroke(line);

    // Resistor body (zig-zag style similar to IEC asset)
    const zig = [
      [22, 75],
      [32, 65],
      [42, 85],
      [52, 65],
      [62, 85],
      [72, 65],
      [82, 85],
      [92, 65],
      [102, 85],
      [112, 65],
      [122, 75],
    ];
    g.moveTo(zig[0][0], zig[0][1]);
    for (let i = 1; i < zig.length; i++) g.lineTo(zig[i][0], zig[i][1]);
    g.stroke(line);

    // Wiper lead (terminal at bottom center to resistor body)
    g.moveTo(75, 150);
    g.lineTo(75, 112);
    g.stroke(line);

    // Wiper arrow pointing to resistor track
    g.moveTo(75, 112);
    g.lineTo(91, 94);
    g.stroke(line);
    g.moveTo(91, 94);
    g.lineTo(82, 94);
    g.lineTo(91, 85);
    g.closePath();
    g.fill({ color: 0xffffff });

    applyIECSchematicTransform(g, flipSign);
    g.hitArea = new PIXI.Rectangle(0, 0, 150, 150);
    g.tint = 0xccaa88;
    this.updateLabels();
  }

  private updateLabels(): void {
    this.labelText.text = `${this.name}\nPOT`;
    this.labelText.style = {
      fontSize: 10,
      fill: 0xffffff,
      fontFamily: "Arial",
      align: "center",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -42);
    const r = this.potProps.totalResistance;
    const w = this.potProps.wiperPosition;
    this.valueText.text = `${(r / 1000).toFixed(1)}kΩ  w=${(w * 100).toFixed(0)}%`;
    this.valueText.style = {
      fontSize: 8,
      fill: 0xcccccc,
      fontFamily: "Arial",
      align: "center",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 42);
  }

  public setWiperPosition(p: number): void {
    this.potProps.wiperPosition = Math.max(0, Math.min(1, p));
    this.updateVisuals(0);
  }

  protected updateNodeVoltages(): void {
    this.nodes[0].current = this.circuitProps.current * (1 - this.potProps.wiperPosition);
    this.nodes[1].current = this.circuitProps.current * this.potProps.wiperPosition;
  }

  protected updateVisuals(_deltaTime: number): void {
    this.createVisuals();
  }

  public getCircuitProperties(): CircuitProperties & PotentiometerProperties {
    return {
      ...super.getCircuitProperties(),
      totalResistance: this.potProps.totalResistance,
      wiperPosition: this.potProps.wiperPosition,
      resistance: this.potProps.totalResistance,
    } as CircuitProperties & PotentiometerProperties;
  }
}
