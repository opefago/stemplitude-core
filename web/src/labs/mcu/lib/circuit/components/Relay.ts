import * as PIXI from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";
import {
  applyIECSchematicTransform,
  drawRelayCOM_SPST_NO_IEC,
} from "../rendering/iecSchematicDraw";

export interface RelayProperties extends CircuitProperties {
  coilResistance: number;
  activationVoltage: number;
  isActivated: boolean;
}

/**
 * Electromechanical relay: coil (left) and SPST-style contacts (right).
 */
export class Relay extends CircuitComponent {
  protected relayProps: RelayProperties;
  private lastActivatedDrawn: boolean | null = null;

  constructor(name: string, gridX: number = 0, gridY: number = 0) {
    const props: RelayProperties = {
      value: 100,
      resistance: 100,
      tolerance: 0,
      powerRating: 2,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      coilResistance: 100,
      activationVoltage: 5,
      isActivated: false,
    };

    super(name, "relay", props, gridX, gridY);
    this.relayProps = props as RelayProperties;
  }

  protected initializeNodes(): void {
    // Relay-COM-COM-SPST-NO.svg @ scale 0.4
    this.nodes = [
      {
        id: "coil1",
        position: { x: -30, y: -10 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "coil2",
        position: { x: -30, y: 10 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "contact_common",
        position: { x: 30, y: -10 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "contact_no",
        position: { x: 30, y: 10 },
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -38, valueY: 32 };
  }

  private drawRelayGraphics(): void {
    this.componentGraphics.clear();
    const g = this.componentGraphics;
    const active = this.relayProps?.isActivated ?? false;
    drawRelayCOM_SPST_NO_IEC(g, active);
    applyIECSchematicTransform(g, Math.sign(g.scale.x) || 1);
    g.hitArea = new PIXI.Rectangle(0, 0, 150, 150);
    g.tint = active ? 0xccffcc : 0xffeedd;
    this.lastActivatedDrawn = active;
  }

  protected createVisuals(): void {
    this.drawRelayGraphics();
    this.updateLabels();
  }

  private updateLabels(): void {
    if (!this.relayProps) return;
    this.labelText.text = this.name;
    this.labelText.style = {
      fontSize: 11,
      fill: 0xffffff,
      fontFamily: "Arial",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -38);

    const r = this.relayProps.coilResistance;
    const vAct = this.relayProps.activationVoltage;
    const act = this.relayProps.isActivated;
    this.valueText.text = `${r}Ω coil  Vact ${vAct}V  ${act ? "ON" : "OFF"}`;
    this.valueText.style = {
      fontSize: 8,
      fill: act ? 0x66ff66 : 0xcccccc,
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 32);
  }

  protected updateNodePositions(): void {
    const bases = [
      { x: -30, y: -10 },
      { x: -30, y: 10 },
      { x: 30, y: -10 },
      { x: 30, y: 10 },
    ];
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    for (let i = 0; i < this.nodes.length; i++) {
      const b = bases[i];
      this.nodes[i].position.x = b.x * cos - b.y * sin;
      this.nodes[i].position.y = b.x * sin + b.y * cos;
    }
  }

  protected updateNodeVoltages(): void {
    const vCoil = Math.abs(this.nodes[0].voltage - this.nodes[1].voltage);
    this.relayProps.isActivated = vCoil >= this.relayProps.activationVoltage - 1e-6;

    const rCoil = this.relayProps.coilResistance;
    this.circuitProps.value = rCoil;
    this.circuitProps.resistance = rCoil;

    if (this.relayProps.isActivated) {
      const v = this.nodes[2].voltage;
      this.nodes[3].voltage = v;
    }

    this.nodes[0].current = this.circuitProps.current * 0.25;
    this.nodes[1].current = -this.nodes[0].current;
    this.nodes[2].current = this.relayProps.isActivated ? this.circuitProps.current : 0;
    this.nodes[3].current = this.relayProps.isActivated ? -this.circuitProps.current : 0;
  }

  protected updateVisuals(_deltaTime: number): void {
    if (this.lastActivatedDrawn !== this.relayProps.isActivated) {
      this.drawRelayGraphics();
    }
    this.updateLabels();
  }

  public getCircuitProperties() {
    return {
      ...super.getCircuitProperties(),
      coilResistance: this.relayProps.coilResistance,
      activationVoltage: this.relayProps.activationVoltage,
      isActivated: this.relayProps.isActivated,
    } as RelayProperties & CircuitProperties;
  }

  public getImpedance(_frequency: number = 0): number {
    return this.relayProps.coilResistance;
  }
}
