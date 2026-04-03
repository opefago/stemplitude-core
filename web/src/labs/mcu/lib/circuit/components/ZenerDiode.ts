import * as PIXI from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";
import { BJT_SVG_PIVOT, BJT_SVG_SCALE } from "../rendering/bjtSchematicSvg";
import { drawZenerDiodeIEC } from "../rendering/logicGateAndZenerSchematicDraw";

export interface ZenerDiodeProperties extends CircuitProperties {
  forwardVoltage: number;
  breakdownVoltage: number;
  maxCurrent: number;
  dynamicResistance: number;
  isForwardBiased: boolean;
  isInBreakdown: boolean;
  isConducting: boolean;
}

export class ZenerDiode extends CircuitComponent {
  protected zenerProps: ZenerDiodeProperties;

  constructor(
    name: string,
    breakdownVoltage: number = 5.1,
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: ZenerDiodeProperties = {
      value: breakdownVoltage,
      tolerance: 5,
      powerRating: 0.5,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      forwardVoltage: 0.7,
      breakdownVoltage,
      maxCurrent: 1.0,
      dynamicResistance: 10,
      isForwardBiased: false,
      isInBreakdown: false,
      isConducting: false,
    };

    super(name, "zener_diode", props, gridX, gridY);
    this.zenerProps = props as ZenerDiodeProperties;
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "anode",
        position: { x: -30, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
        role: "terminal",
      },
      {
        id: "cathode",
        position: { x: 30, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
        role: "terminal",
      },
    ];
  }

  protected getTerminalPinRadius(): number {
    return 5;
  }

  protected createVisuals(): void {
    const g = this.componentGraphics;
    g.clear();
    drawZenerDiodeIEC(g);

    if (this.circuitProps?.burnt) {
      g.moveTo(55, 55);
      g.lineTo(95, 95);
      g.moveTo(55, 95);
      g.lineTo(95, 55);
      g.stroke({
        width: 10,
        color: 0xff0000,
        cap: "round",
        join: "round",
      });
    }

    g.pivot.set(BJT_SVG_PIVOT, BJT_SVG_PIVOT);
    const flipSign = Math.sign(g.scale.x) || 1;
    g.scale.set(flipSign * BJT_SVG_SCALE, BJT_SVG_SCALE);
    g.hitArea = new PIXI.Rectangle(0, 0, 150, 150);

    const isBurnt = this.circuitProps?.burnt ?? false;
    const isConducting = this.zenerProps?.isConducting ?? false;
    const isBreakdown = this.zenerProps?.isInBreakdown ?? false;
    if (isBurnt) {
      g.tint = 0x888888;
    } else if (isBreakdown) {
      g.tint = 0x99ccff;
    } else if (isConducting) {
      g.tint = 0x99ff99;
    } else {
      g.tint = 0xffffff;
    }

    this.updateLabels();
  }

  protected updateVisuals(_deltaTime: number): void {
    if (!this.zenerProps) return;

    const vAnode = this.nodes[0].voltage;
    const vCathode = this.nodes[1].voltage;
    const vForward = vAnode - vCathode;
    const vReverse = vCathode - vAnode;
    const absCurrent = Math.abs(this.circuitProps.current);

    const isForwardBiased = vForward > 0;
    const isForwardConducting =
      isForwardBiased &&
      vForward >= this.zenerProps.forwardVoltage &&
      absCurrent > 0.001;
    const isInBreakdown =
      !isForwardBiased &&
      vReverse >= this.zenerProps.breakdownVoltage &&
      absCurrent > 0.001;

    this.zenerProps.isForwardBiased = isForwardBiased;
    this.zenerProps.isInBreakdown = isInBreakdown;
    this.zenerProps.isConducting = isForwardConducting || isInBreakdown;

    (this.circuitProps as Record<string, unknown>).isForwardBiased = isForwardBiased;
    (this.circuitProps as Record<string, unknown>).isInBreakdown = isInBreakdown;
    (this.circuitProps as Record<string, unknown>).isConducting = this.zenerProps.isConducting;

    if (absCurrent > this.zenerProps.maxCurrent * 2) {
      this.circuitProps.burnt = true;
    }

    this.createVisuals();
  }


  private updateLabels(): void {
    this.labelText.text = this.name;
    this.labelText.style = { fontSize: 10, fill: 0xffffff, fontFamily: "Arial" };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -22);

    let state = "OFF";
    let color = 0x888888;
    if (this.circuitProps?.burnt) {
      state = "BURNT";
      color = 0xff0000;
    } else if (this.zenerProps?.isInBreakdown) {
      state = "ZENER";
      color = 0x55aaff;
    } else if (this.zenerProps?.isConducting) {
      state = "FWD";
      color = 0x66ff66;
    }

    this.valueText.text = `Vz=${this.zenerProps?.breakdownVoltage ?? 5.1}V ${state}`;
    this.valueText.style = { fontSize: 8, fill: color, fontFamily: "Arial" };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 22);
  }

  protected updateNodePositions(): void {
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);
    this.nodes[0].position.x = -30 * cos;
    this.nodes[0].position.y = -30 * sin;
    this.nodes[1].position.x = 30 * cos;
    this.nodes[1].position.y = 30 * sin;
  }

  protected updateNodeVoltages(): void {
    this.nodes[0].current = -this.circuitProps.current;
    this.nodes[1].current = this.circuitProps.current;
  }

  public getImpedance(_frequency: number = 0): number {
    if (this.circuitProps?.burnt) return 1e9;
    if (this.zenerProps?.isConducting || this.zenerProps?.isInBreakdown) {
      return this.zenerProps.dynamicResistance;
    }
    return 1e9;
  }

  public getForwardVoltage(): number {
    return this.zenerProps?.forwardVoltage ?? 0.7;
  }

  public getBreakdownVoltage(): number {
    return this.zenerProps?.breakdownVoltage ?? 5.1;
  }
}

