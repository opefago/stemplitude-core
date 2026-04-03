import { Graphics } from "pixi.js";
import * as PIXI from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface DiodeProperties extends CircuitProperties {
  forwardVoltage: number;
  maxCurrent: number;
  dynamicResistance: number;
  isForwardBiased: boolean;
  isConducting: boolean;
}

export class Diode extends CircuitComponent {
  protected diodeProps: DiodeProperties;

  constructor(
    name: string,
    forwardVoltage: number = 0.7,
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: DiodeProperties = {
      value: forwardVoltage,
      tolerance: 5,
      powerRating: 0.5,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      forwardVoltage,
      maxCurrent: 1.0,
      dynamicResistance: 10,
      isForwardBiased: false,
      isConducting: false,
    };

    super(name, "diode", props, gridX, gridY);
    this.diodeProps = props as DiodeProperties;
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "anode",
        position: { x: -25, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
        role: "terminal",
      },
      {
        id: "cathode",
        position: { x: 25, y: 0 },
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
    const isBurnt = this.circuitProps?.burnt ?? false;
    const isConducting = this.diodeProps?.isConducting ?? false;

    const bodyColor = isBurnt ? 0x444444 : isConducting ? 0x66ff66 : 0xffffff;

    // Anode lead
    g.moveTo(-25, 0);
    g.lineTo(-10, 0);
    g.stroke({ width: 3, color: bodyColor });

    // Triangle (anode side pointing right)
    g.moveTo(-10, -10);
    g.lineTo(-10, 10);
    g.lineTo(8, 0);
    g.lineTo(-10, -10);
    g.fill(isConducting ? 0x225522 : 0x222222);
    g.stroke({ width: 2, color: bodyColor });

    // Cathode bar
    g.moveTo(8, -10);
    g.lineTo(8, 10);
    g.stroke({ width: 3, color: bodyColor });

    // Cathode lead
    g.moveTo(8, 0);
    g.lineTo(25, 0);
    g.stroke({ width: 3, color: bodyColor });

    if (isBurnt) {
      g.moveTo(-8, -8);
      g.lineTo(8, 8);
      g.moveTo(-8, 8);
      g.lineTo(8, -8);
      g.stroke({ width: 3, color: 0xff0000 });
    }

    g.hitArea = new PIXI.Rectangle(-28, -14, 56, 28);
    this.updateLabels();
  }

  protected updateVisuals(_deltaTime: number): void {
    if (!this.diodeProps) return;

    const vAnode = this.nodes[0].voltage;
    const vCathode = this.nodes[1].voltage;
    const forwardBiased = vAnode > vCathode;

    this.diodeProps.isForwardBiased = forwardBiased;
    this.diodeProps.isConducting =
      forwardBiased &&
      (vAnode - vCathode) >= this.diodeProps.forwardVoltage &&
      Math.abs(this.circuitProps.current) > 0.001;

    if (Math.abs(this.circuitProps.current) > this.diodeProps.maxCurrent * 2) {
      this.circuitProps.burnt = true;
    }

    this.createVisuals();
  }

  private updateLabels(): void {
    this.labelText.text = this.name;
    this.labelText.style = { fontSize: 10, fill: 0xffffff, fontFamily: "Arial" };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -20);

    const state = this.circuitProps?.burnt
      ? "BURNT"
      : this.diodeProps?.isConducting
        ? "ON"
        : "OFF";
    const color = this.circuitProps?.burnt
      ? 0xff0000
      : this.diodeProps?.isConducting
        ? 0x44ff44
        : 0x888888;

    this.valueText.text = `${this.diodeProps?.forwardVoltage ?? 0.7}V ${state}`;
    this.valueText.style = { fontSize: 8, fill: color, fontFamily: "Arial" };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 20);
  }

  protected updateNodePositions(): void {
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    this.nodes[0].position.x = -25 * cos;
    this.nodes[0].position.y = -25 * sin;
    this.nodes[1].position.x = 25 * cos;
    this.nodes[1].position.y = 25 * sin;
  }

  protected updateNodeVoltages(): void {
    // MNA voltage source convention: negate so positive = enters from wire
    this.nodes[0].current = -this.circuitProps.current;
    this.nodes[1].current = this.circuitProps.current;
  }

  public getImpedance(_frequency: number = 0): number {
    if (this.circuitProps?.burnt) return 1e9;
    if (this.diodeProps?.isConducting) return this.diodeProps.dynamicResistance;
    return 1e6;
  }

  public getForwardVoltage(): number {
    return this.diodeProps?.forwardVoltage ?? 0.7;
  }
}
