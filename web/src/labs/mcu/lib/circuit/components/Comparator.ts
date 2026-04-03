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
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "inverting",
        position: { x: -30, y: -15 },
        voltage: 0,
        current: 0,
        connections: [],
        role: "terminal",
      },
      {
        id: "nonInverting",
        position: { x: -30, y: 15 },
        voltage: 0,
        current: 0,
        connections: [],
        role: "terminal",
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

  /** Differential input (V+ − V−) vs threshold with hysteresis; sets output node and flags. */
  private applyComparatorLogic(): void {
    const vInv = this.nodes[0].voltage;
    const vNi = this.nodes[1].voltage;
    const diff = vNi - vInv;
    const { threshold, hysteresis } = this.compProps;

    if (this.compProps.isOutputHigh) {
      if (diff < threshold - hysteresis) {
        this.compProps.isOutputHigh = false;
      }
    } else {
      if (diff > threshold + hysteresis) {
        this.compProps.isOutputHigh = true;
      }
    }

    const vOut = this.compProps.isOutputHigh
      ? this.compProps.outputHigh
      : this.compProps.outputLow;
    this.nodes[2].voltage = vOut;
    this.circuitProps.voltage = vOut;
  }

  protected createVisuals(): void {
    this.componentGraphics.clear();
    const g = this.componentGraphics;
    const sw = 3;
    const strokeColor = 0xffffff;
    const fillColor = 0x222222;
    const high = this.compProps?.isOutputHigh ?? false;

    // Leads
    g.moveTo(-30, -15);
    g.lineTo(-20, -15);
    g.stroke({ width: sw, color: strokeColor });

    g.moveTo(-30, 15);
    g.lineTo(-20, 15);
    g.stroke({ width: sw, color: strokeColor });

    const outColor = high ? 0x44ff88 : strokeColor;
    g.moveTo(25, 0);
    g.lineTo(30, 0);
    g.stroke({ width: sw, color: outColor });

    // Triangle
    g.moveTo(-20, -25);
    g.lineTo(-20, 25);
    g.lineTo(25, 0);
    g.lineTo(-20, -25);
    g.fill(fillColor);
    g.stroke({ width: sw, color: strokeColor });

    // Output-side notch (distinctive tab)
    g.moveTo(25, -6);
    g.lineTo(32, -6);
    g.lineTo(32, 6);
    g.lineTo(25, 6);
    g.stroke({ width: 2, color: strokeColor });

    // +/- markers
    g.moveTo(-18, -10);
    g.lineTo(-12, -10);
    g.stroke({ width: 2, color: strokeColor });

    g.moveTo(-15, 7);
    g.lineTo(-15, 13);
    g.moveTo(-18, 10);
    g.lineTo(-12, 10);
    g.stroke({ width: 2, color: strokeColor });

    g.hitArea = new PIXI.Polygon(-20, -25, -20, 25, 25, 0);
    this.updateLabels();
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -32, valueY: 28 };
  }

  protected updateVisuals(_deltaTime: number): void {
    this.applyComparatorLogic();
    this.createVisuals();
  }

  private updateLabels(): void {
    if (!this.compProps) return;
    const { labelY, valueY } = this.getDefaultLabelPositions();
    this.labelText.text = this.name;
    this.labelText.style = {
      fontSize: 10,
      fill: 0xffffff,
      fontFamily: "Arial",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, labelY);

    const th = this.compProps.threshold;
    const state = this.compProps.isOutputHigh ? "HI" : "LO";
    const stateColor = this.compProps.isOutputHigh ? 0x44ff88 : 0x888888;
    this.valueText.text = `Vth=${th.toFixed(2)}V ${state} (${this.compProps.outputLow}–${this.compProps.outputHigh}V)`;
    this.valueText.style = {
      fontSize: 8,
      fill: stateColor,
      fontFamily: "Arial",
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
    this.applyComparatorLogic();

    this.nodes[0].current = 0;
    this.nodes[1].current = 0;
    this.nodes[2].current = this.circuitProps.current;
  }

  public getImpedance(_frequency: number = 0): number {
    return 1e6;
  }
}
