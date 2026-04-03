import * as PIXI from "pixi.js";
import {
  CircuitComponent,
  CircuitProperties,
} from "../CircuitComponent";
import { applyIECSchematicTransform } from "../rendering/iecSchematicDraw";
import { loadSchematicSvgTextureForCanvas } from "../rendering/loadSchematicSvgTexture";

/** Vendored from chris-pikul/electronic-symbols (MIT): SVG/Resistor-IEC-Potentiometer.svg */
const POTENTIOMETER_SVG_URL = "/assets/circuit-symbols/potentiometer-iec.svg";

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

  private potVisualGeneration = 0;

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
    const bases = [
      { x: -30, y: 0 },
      { x: 30, y: 0 },
      { x: 0, y: 30 },
    ];
    bases.forEach((b, i) => {
      this.nodes[i].position.x = b.x * cos - b.y * sin;
      this.nodes[i].position.y = b.x * sin + b.y * cos;
    });
  }

  protected createVisuals(): void {
    const g = this.componentGraphics;
    const gen = ++this.potVisualGeneration;
    const flipSign = Math.sign(g.scale.x) || 1;
    g.clear();
    g.removeChildren();

    g.hitArea = new PIXI.Rectangle(0, 0, 150, 150);
    g.tint = 0xccaa88;
    this.updateLabels();

    void loadSchematicSvgTextureForCanvas(POTENTIOMETER_SVG_URL).then((tex) => {
      if (gen !== this.potVisualGeneration || g.destroyed) return;
      g.clear();
      g.removeChildren();
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      sp.position.set(75, 75);
      g.addChild(sp);
      applyIECSchematicTransform(g, flipSign);
      g.hitArea = new PIXI.Rectangle(0, 0, 150, 150);
      g.tint = 0xccaa88;
      this.updateLabels();
    });
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
