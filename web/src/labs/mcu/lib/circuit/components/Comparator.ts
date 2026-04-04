import { Graphics } from "pixi.js";
import * as PIXI from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface ComparatorProperties extends CircuitProperties {
  threshold: number;
  outputHigh: number;
  outputLow: number;
  hysteresis: number;
  isOutputHigh: boolean;
}

export class Comparator extends CircuitComponent {
  protected compProps: ComparatorProperties;

  constructor(
    name: string,
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: ComparatorProperties = {
      value: 0,
      tolerance: 0,
      powerRating: 0.25,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      threshold: 0,
      outputHigh: 5,
      outputLow: 0,
      hysteresis: 0.1,
      isOutputHigh: false,
    };

    super(name, "comparator", props, gridX, gridY);
    this.compProps = props as ComparatorProperties;
    // Ensure labels are initialized after subclass props are available.
    this.createVisuals();
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "inverting",
        position: { x: -30, y: -15 },
        voltage: 0,
        current: 0,
        connections: [],
        role: "control",
      },
      {
        id: "nonInverting",
        position: { x: -30, y: 15 },
        voltage: 0,
        current: 0,
        connections: [],
        role: "control",
      },
      {
        id: "output",
        position: { x: 30, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
        role: "terminal",
      },
    ];
  }

  private refreshOutputStateFromNode(): void {
    const vOut = this.nodes[2].voltage;
    const midpoint = (this.compProps.outputHigh + this.compProps.outputLow) * 0.5;
    this.compProps.isOutputHigh = vOut >= midpoint;
    this.circuitProps.voltage = vOut;
  }

  protected createVisuals(): void {
    this.componentGraphics.clear();
    const g = this.componentGraphics;
    const sw = 3;
    const strokeColor = 0xffffff;
    const bodyFill = 0x202020;
    const high = this.compProps?.isOutputHigh ?? false;

    // SVG-inspired op-amp/comparator proportions in local Pixi coordinates.
    // Input leads
    g.moveTo(-30, -15);
    g.lineTo(-21, -15);
    g.stroke({ width: sw, color: strokeColor, cap: "round", join: "round" });
    g.moveTo(-30, 15);
    g.lineTo(-21, 15);
    g.stroke({ width: sw, color: strokeColor, cap: "round", join: "round" });

    // Output lead
    const outColor = high ? 0x44ff88 : strokeColor;
    g.moveTo(21, 0);
    g.lineTo(30, 0);
    g.stroke({ width: sw, color: outColor, cap: "round", join: "round" });

    // Body triangle
    g.moveTo(-21, -22);
    g.lineTo(-21, 22);
    g.lineTo(21, 0);
    g.closePath();
    g.fill({ color: bodyFill });
    g.stroke({ width: sw, color: strokeColor, cap: "round", join: "round" });

    // Output-side tab (comparator identifier)
    g.moveTo(21, -6);
    g.lineTo(27, -6);
    g.lineTo(27, 6);
    g.lineTo(21, 6);
    g.stroke({ width: 2, color: strokeColor, cap: "round", join: "round" });

    // Inverting marker (-)
    g.moveTo(-16, -15);
    g.lineTo(-10, -15);
    g.stroke({ width: 2, color: strokeColor, cap: "round", join: "round" });

    // Non-inverting marker (+)
    g.moveTo(-13, 12);
    g.lineTo(-13, 18);
    g.stroke({ width: 2, color: strokeColor, cap: "round", join: "round" });
    g.moveTo(-16, 15);
    g.lineTo(-10, 15);
    g.stroke({ width: 2, color: strokeColor, cap: "round", join: "round" });

    g.hitArea = new PIXI.Polygon(-21, -22, -21, 22, 21, 0);
    this.updateLabels();
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -36, valueY: 34 };
  }

  protected updateVisuals(_deltaTime: number): void {
    this.refreshOutputStateFromNode();
    this.createVisuals();
  }

  private updateLabels(): void {
    const p = this.compProps ?? (this.circuitProps as unknown as ComparatorProperties);
    const { labelY, valueY } = this.getDefaultLabelPositions();
    this.labelText.text = this.name;
    this.labelText.style = {
      fontSize: 12,
      fill: 0xffffff,
      fontFamily: "Arial",
      fontWeight: "bold",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, labelY);

    const th = p.threshold ?? 0;
    const isHigh = p.isOutputHigh ?? false;
    const state = isHigh ? "HI" : "LO";
    const stateColor = isHigh ? 0x44ff88 : 0x888888;
    this.valueText.text = `Vth=${th.toFixed(2)}V  ${state}\nOut=${p.outputLow ?? 0}..${p.outputHigh ?? 5}V`;
    this.valueText.style = {
      fontSize: 10,
      fill: stateColor,
      fontFamily: "Arial",
      lineHeight: 11,
      align: "center",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, valueY);
  }

  protected updateNodePositions(): void {
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    const bases = [
      { x: -30, y: -15 },
      { x: -30, y: 15 },
      { x: 30, y: 0 },
    ];

    for (let i = 0; i < bases.length; i++) {
      const { x: x0, y: y0 } = bases[i];
      this.nodes[i].position.x = x0 * cos - y0 * sin;
      this.nodes[i].position.y = x0 * sin + y0 * cos;
    }
  }

  protected updateNodeVoltages(): void {
    this.refreshOutputStateFromNode();
    this.nodes[0].current = 0;
    this.nodes[1].current = 0;
    this.nodes[2].current = this.circuitProps.current;
  }

  public getImpedance(_frequency: number = 0): number {
    return 1e6;
  }
}
