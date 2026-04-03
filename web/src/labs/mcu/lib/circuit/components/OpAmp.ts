import { Graphics } from "pixi.js";
import * as PIXI from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface OpAmpProperties extends CircuitProperties {
  openLoopGain: number;
  inputImpedance: number;
  outputImpedance: number;
  vSatPositive: number;
  vSatNegative: number;
}

export class OpAmp extends CircuitComponent {
  protected opAmpProps: OpAmpProperties;

  constructor(
    name: string,
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: OpAmpProperties = {
      value: 100000,
      tolerance: 0,
      powerRating: 0.5,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      openLoopGain: 100000,
      inputImpedance: 1e6,
      outputImpedance: 75,
      vSatPositive: 12,
      vSatNegative: -12,
    };

    super(name, "opamp", props, gridX, gridY);
    this.opAmpProps = props as OpAmpProperties;
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

  protected createVisuals(): void {
    this.componentGraphics.clear();
    const g = this.componentGraphics;
    const sw = 3;
    const strokeColor = 0xffffff;
    const fillColor = 0x222222;

    // Leads to triangle edges
    g.moveTo(-30, -15);
    g.lineTo(-20, -15);
    g.stroke({ width: sw, color: strokeColor });

    g.moveTo(-30, 15);
    g.lineTo(-20, 15);
    g.stroke({ width: sw, color: strokeColor });

    g.moveTo(25, 0);
    g.lineTo(30, 0);
    g.stroke({ width: sw, color: strokeColor });

    // Triangle body
    g.moveTo(-20, -25);
    g.lineTo(-20, 25);
    g.lineTo(25, 0);
    g.lineTo(-20, -25);
    g.fill(fillColor);
    g.stroke({ width: sw, color: strokeColor });

    // +/- markers near inputs
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
    this.updateLabels();
  }

  private updateLabels(): void {
    if (!this.opAmpProps) return;
    const { labelY, valueY } = this.getDefaultLabelPositions();
    this.labelText.text = this.name;
    this.labelText.style = {
      fontSize: 10,
      fill: 0xffffff,
      fontFamily: "Arial",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, labelY);

    const av = this.opAmpProps.openLoopGain;
    const avStr =
      av >= 1e6 ? `${(av / 1e6).toFixed(1)}M` : `${(av / 1e3).toFixed(0)}k`;
    this.valueText.text = `Av=${avStr} Zin=${this.formatOhms(this.opAmpProps.inputImpedance)}`;
    this.valueText.style = {
      fontSize: 8,
      fill: 0xcccccc,
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, valueY);
  }

  private formatOhms(ohms: number): string {
    if (ohms >= 1e6) return `${(ohms / 1e6).toFixed(1)}MΩ`;
    if (ohms >= 1e3) return `${(ohms / 1e3).toFixed(0)}kΩ`;
    return `${ohms}Ω`;
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
    const vInv = this.nodes[0].voltage;
    const vNi = this.nodes[1].voltage;
    const diff = vNi - vInv;
    let vOut = this.opAmpProps.openLoopGain * diff;
    vOut = Math.max(
      this.opAmpProps.vSatNegative,
      Math.min(this.opAmpProps.vSatPositive, vOut)
    );

    this.nodes[2].voltage = vOut;
    this.circuitProps.voltage = vOut;

    this.nodes[0].current = 0;
    this.nodes[1].current = 0;
    this.nodes[2].current = this.circuitProps.current;
  }

  public getImpedance(_frequency: number = 0): number {
    return this.opAmpProps.outputImpedance;
  }
}
