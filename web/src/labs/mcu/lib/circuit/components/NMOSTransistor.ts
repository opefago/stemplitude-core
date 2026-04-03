import * as PIXI from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";
import {
  applyIECSchematicTransform,
  drawMosfetNIEC,
} from "../rendering/iecSchematicDraw";

export interface NMOSProperties extends CircuitProperties {
  vgsThreshold: number;
  rdson: number;
  maxVds: number;
  maxVgs: number;
  isEnhancement: boolean;
  isConducting: boolean;
}

export class NMOSTransistor extends CircuitComponent {
  protected nmosProps: NMOSProperties;
  private baseNodePositions: { [key: string]: { x: number; y: number } };

  constructor(
    name: string,
    rdson: number = 0.1,
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: NMOSProperties = {
      value: rdson,
      tolerance: 10,
      powerRating: 0.5,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      vgsThreshold: 2,
      rdson,
      maxVds: 30,
      maxVgs: 20,
      isEnhancement: true,
      isConducting: false,
    };

    super(name, "nmos_transistor", props, gridX, gridY);
    this.nmosProps = this.circuitProps as NMOSProperties;
  }

  protected initializeNodes(): void {
    // Transistor-COM-MOSFET-N.svg @ pivot 75 + scale 0.4
    this.baseNodePositions = {
      gate: { x: -30, y: 0 },
      drain: { x: 10, y: -30 },
      source: { x: 10, y: 30 },
    };

    this.nodes = [
      {
        id: "gate",
        position: { x: -30, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
        role: "control",
      },
      {
        id: "drain",
        position: { x: 10, y: -30 },
        voltage: 0,
        current: 0,
        connections: [],
        role: "terminal",
      },
      {
        id: "source",
        position: { x: 10, y: 30 },
        voltage: 0,
        current: 0,
        connections: [],
        role: "terminal",
      },
    ];
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -50, valueY: 45 };
  }

  protected updateNodePositions(): void {
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);
    const flipX = this.componentGraphics.scale.x;

    if (!this.baseNodePositions) {
      this.baseNodePositions = {
        gate: { x: -30, y: 0 },
        drain: { x: 10, y: -30 },
        source: { x: 10, y: 30 },
      };
    }

    this.nodes.forEach((node) => {
      const basePos = this.baseNodePositions[node.id];
      if (basePos) {
        const baseX = basePos.x * flipX;
        const baseY = basePos.y;
        node.position.x = baseX * cos - baseY * sin;
        node.position.y = baseX * sin + baseY * cos;
      }
    });
  }

  protected getTerminalPinRadius(): number {
    return 5;
  }

  protected createVisuals(): void {
    const g = this.componentGraphics;
    g.clear();
    drawMosfetNIEC(g);
    applyIECSchematicTransform(g, Math.sign(g.scale.x) || 1);
    g.hitArea = new PIXI.Rectangle(0, 0, 150, 150);
    this.updateLabels();
  }

  protected updateVisuals(_deltaTime: number): void {
    this.updateConductionState();

    let tint = 0x666666;
    if (this.nmosProps.isConducting) {
      tint = 0xffffff;
    } else if (this.circuitProps.burnt) {
      tint = 0x444444;
    }

    this.componentGraphics.tint = tint;
    this.updateLabels();
  }

  private updateConductionState(): void {
    const vg = this.nodes[0].voltage;
    const vd = this.nodes[1].voltage;
    const vs = this.nodes[2].voltage;
    const vgs = vg - vs;
    const vds = vd - vs;

    const on =
      vgs > this.nmosProps.vgsThreshold &&
      vds > 0.001 &&
      Math.abs(this.circuitProps.current) > 1e-6;

    this.nmosProps.isConducting = on;
  }

  private updateLabels(): void {
    this.labelText.text = `${this.name}\nNMOS`;
    this.labelText.style = {
      fontSize: 10,
      fill: 0xffffff,
      fontFamily: "Arial",
      align: "center",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -40);

    const props = this.circuitProps as NMOSProperties;
    const state = props.isConducting ? "ON" : "OFF";

    this.valueText.text = `Rdson=${props.rdson}Ω\n${state}`;
    this.valueText.style = {
      fontSize: 8,
      fill: 0xcccccc,
      fontFamily: "Arial",
      align: "center",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 35);
  }

  protected updateNodeVoltages(): void {
    const ids = this.circuitProps.current;
    this.nodes[0].current = 0;
    this.nodes[1].current = ids;
    this.nodes[2].current = -ids;
  }

  public getValueString(): string {
    return `Rdson=${this.nmosProps.rdson}Ω`;
  }

  public getImpedance(_frequency: number = 0): number {
    if (this.circuitProps.burnt) return 1e9;
    if (this.nmosProps.isConducting) return this.nmosProps.rdson;
    return 1e9;
  }

  public getNMOSProperties(): NMOSProperties {
    return this.nmosProps;
  }
}
