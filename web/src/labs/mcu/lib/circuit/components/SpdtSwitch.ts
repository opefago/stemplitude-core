import * as PIXI from "pixi.js";
import {
  CircuitComponent,
  CircuitProperties,
} from "../CircuitComponent";
import {
  applyIECSchematicTransform,
  drawSwitchSPDTIEC,
} from "../rendering/iecSchematicDraw";

export interface SpdtSwitchProperties extends CircuitProperties {
  isClosed: boolean;
  /** true = common connected to upper throw */
  connectUpper: boolean;
}

/**
 * SPDT toggle — common on the left; throws top/bottom on the right (IEC symbol).
 */
export class SpdtSwitch extends CircuitComponent {
  protected switchProps: SpdtSwitchProperties;
  private connectUpper: boolean = true;

  constructor(name: string, gridX: number = 0, gridY: number = 0) {
    const props: SpdtSwitchProperties = {
      value: 0.001,
      resistance: 0.001,
      tolerance: 0,
      powerRating: 100,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      isClosed: true,
      connectUpper: true,
    };
    super(name, "spdt_switch", props, gridX, gridY);
    this.switchProps = props as SpdtSwitchProperties;
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "common",
        position: { x: -30, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "throw_a",
        position: { x: 30, y: -18 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "throw_b",
        position: { x: 30, y: 18 },
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -40, valueY: 38 };
  }

  protected getTerminalPinRadius(): number {
    return 5;
  }

  protected updateNodePositions(): void {
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);
    const bases = [
      { x: -30, y: 0 },
      { x: 30, y: -18 },
      { x: 30, y: 18 },
    ];
    bases.forEach((b, i) => {
      this.nodes[i].position.x = b.x * cos - b.y * sin;
      this.nodes[i].position.y = b.x * sin + b.y * cos;
    });
  }

  protected createVisuals(): void {
    const g = this.componentGraphics;
    g.clear();
    drawSwitchSPDTIEC(g, this.connectUpper);
    applyIECSchematicTransform(g, Math.sign(g.scale.x) || 1);
    g.hitArea = new PIXI.Rectangle(0, 0, 150, 150);
    g.tint = 0xddddff;
    this.updateLabels();
  }

  private updateLabels(): void {
    this.labelText.text = `${this.name}\nSPDT`;
    this.labelText.style = {
      fontSize: 10,
      fill: 0xffffff,
      fontFamily: "Arial",
      align: "center",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -40);
    const pos = this.connectUpper ? "A" : "B";
    this.valueText.text = `→ ${pos}`;
    this.valueText.style = {
      fontSize: 9,
      fill: 0xcccccc,
      fontFamily: "Arial",
      align: "center",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 38);
  }

  public toggleSwitch(): void {
    this.connectUpper = !this.connectUpper;
    this.switchProps.connectUpper = this.connectUpper;
    this.switchProps.resistance = 0.001;
    this.switchProps.value = 0.001;
    this.createVisuals();
    this.updateLabels();
    window.dispatchEvent(
      new CustomEvent("switch-state-changed", {
        detail: { componentId: this.name, isClosed: true },
      })
    );
  }

  public getConnectUpper(): boolean {
    return this.connectUpper;
  }

  protected updateNodeVoltages(): void {
    this.nodes[0].current = this.circuitProps.current;
  }

  protected updateVisuals(_deltaTime: number): void {}

  public getCircuitProperties(): CircuitProperties & SpdtSwitchProperties {
    return {
      ...super.getCircuitProperties(),
      connectUpper: this.connectUpper,
      isClosed: this.switchProps.isClosed,
      resistance: this.switchProps.resistance,
    } as CircuitProperties & SpdtSwitchProperties;
  }
}
