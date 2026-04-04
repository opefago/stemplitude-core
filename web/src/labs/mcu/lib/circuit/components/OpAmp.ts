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

  protected createVisuals(): void {
    this.componentGraphics.clear();
    const g = this.componentGraphics;
    const strokeColor = 0xffffff;
    const leadColor = 0xffffff;
    const bodyFill = 0x202020;
    const sw = 3;
    const outColor = Math.abs(this.circuitProps.current) > 1e-5 ? 0x88ff88 : leadColor;

    // SVG-inspired proportions, drawn directly in local Pixi coordinates.
    // Input leads
    g.moveTo(-30, -15);
    g.lineTo(-21, -15);
    g.stroke({ width: sw, color: leadColor, cap: "round", join: "round" });
    g.moveTo(-30, 15);
    g.lineTo(-21, 15);
    g.stroke({ width: sw, color: leadColor, cap: "round", join: "round" });

    // Output lead
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
    this.createVisuals();
  }

  private updateLabels(): void {
    const p = this.opAmpProps ?? (this.circuitProps as unknown as OpAmpProperties);
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

    const av = p.openLoopGain ?? 100000;
    const avStr =
      av >= 1e6 ? `${(av / 1e6).toFixed(1)}M` : `${(av / 1e3).toFixed(0)}k`;
    this.valueText.text = `Av=${avStr}\nZin=${this.formatOhms(p.inputImpedance ?? 1e6)}`;
    this.valueText.style = {
      fontSize: 10,
      fill: 0xe0e0e0,
      fontFamily: "Arial",
      lineHeight: 11,
      align: "center",
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
    // Solver owns node voltages; component only mirrors currents/voltage for UI.
    this.circuitProps.voltage = this.nodes[2].voltage;
    this.nodes[0].current = 0;
    this.nodes[1].current = 0;
    this.nodes[2].current = this.circuitProps.current;
  }

  public getImpedance(_frequency: number = 0): number {
    return this.opAmpProps.outputImpedance;
  }
}
