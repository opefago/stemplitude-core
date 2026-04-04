import { Rectangle } from "pixi.js";
import * as PIXI from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";
import {
  BJT_SVG_PIVOT,
  BJT_SVG_SCALE,
  drawPnpBjtInSvgSpace,
} from "../rendering/bjtSchematicSvg";

export interface PNPBJTProperties extends CircuitProperties {
  beta: number;
  vbe: number;
  vcesat: number;
  isSaturated: boolean;
  isCutoff: boolean;
  isActive: boolean;
  baseVoltage: number;
  collectorVoltage: number;
  emitterVoltage: number;
  baseCurrent: number;
  collectorCurrent: number;
  emitterCurrent: number;
}

export class PNPTransistor extends CircuitComponent {
  protected bjtProps: PNPBJTProperties;
  private baseNodePositions: { [key: string]: { x: number; y: number } };

  constructor(
    name: string,
    beta: number = 100,
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: PNPBJTProperties = {
      value: beta,
      tolerance: 10,
      powerRating: 0.5,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      beta,
      vbe: 0.7,
      vcesat: 0.2,
      isSaturated: false,
      isCutoff: true,
      isActive: false,
      baseVoltage: 0,
      collectorVoltage: 0,
      emitterVoltage: 0,
      baseCurrent: 0,
      collectorCurrent: 0,
      emitterCurrent: 0,
    };

    super(name, "pnp_transistor", props, gridX, gridY);
    // Access props through circuitProps which is already set by super()
    this.bjtProps = this.circuitProps as PNPBJTProperties;
  }

  protected initializeNodes(): void {
    // PNP SVG terminals after pivot+scale: base (−30,0), emitter top, collector bottom
    this.baseNodePositions = {
      base: { x: -30, y: 0 },
      collector: { x: 10, y: 30 },
      emitter: { x: 10, y: -30 },
    };

    this.nodes = [
      {
        id: "base",
        position: { x: -30, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "collector",
        position: { x: 10, y: 30 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "emitter",
        position: { x: 10, y: -30 },
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -50, valueY: 45 };
  }

  protected updateNodePositions(): void {
    // Update node positions based on orientation and flip
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);
    const flipX = Math.sign(this.componentGraphics.scale.x) || 1; // only ±1

    // If baseNodePositions isn't set yet, initialize it now
    if (!this.baseNodePositions) {
      this.baseNodePositions = {
        base: { x: -30, y: 0 },
        collector: { x: 10, y: 30 },
        emitter: { x: 10, y: -30 },
      };
    }

    this.nodes.forEach((node) => {
      const basePos = this.baseNodePositions[node.id];
      if (basePos) {
        // First apply flip to base position
        let baseX = basePos.x * flipX;
        let baseY = basePos.y;

        // Then apply rotation transformation
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
    drawPnpBjtInSvgSpace(g);
    g.pivot.set(BJT_SVG_PIVOT, BJT_SVG_PIVOT);
    const flipSign = Math.sign(g.scale.x) || 1;
    g.scale.set(flipSign * BJT_SVG_SCALE, BJT_SVG_SCALE);
    g.hitArea = new PIXI.Rectangle(0, 0, 150, 150);

    this.updateLabels();
  }

  protected updateVisuals(deltaTime: number): void {
    this.updateOperatingRegion();

    let color = 0xff88ff; // Default magenta

    if (this.bjtProps.isSaturated) {
      color = 0x88ff88; // Green when saturated (switch ON)
    } else if (this.bjtProps.isActive) {
      color = 0xffaa00; // Orange in active region (amplifier)
    } else if (this.bjtProps.isCutoff) {
      color = 0x664466; // Dark when cutoff (switch OFF)
    }

    this.componentGraphics.tint = color;
    this.updateLabels();
  }

  private updateOperatingRegion(): void {
    const veb = this.bjtProps.emitterVoltage - this.bjtProps.baseVoltage;
    const vec = this.bjtProps.emitterVoltage - this.bjtProps.collectorVoltage;

    // PNP operating regions (opposite polarity to NPN)
    if (veb < this.bjtProps.vbe) {
      // Cutoff: VEB < 0.7V
      this.bjtProps.isCutoff = true;
      this.bjtProps.isActive = false;
      this.bjtProps.isSaturated = false;
    } else if (vec < this.bjtProps.vcesat) {
      // Saturation: VEC < VCE(sat)
      this.bjtProps.isCutoff = false;
      this.bjtProps.isActive = false;
      this.bjtProps.isSaturated = true;
    } else {
      // Active: VEB > 0.7V and VEC > VCE(sat)
      this.bjtProps.isCutoff = false;
      this.bjtProps.isActive = true;
      this.bjtProps.isSaturated = false;
    }
  }

  private updateLabels(): void {
    this.labelText.text = `${this.name}\nPNP`;
    this.labelText.style = {
      fontSize: 10,
      fill: 0xffffff,
      fontFamily: "Arial",
      align: "center",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -40);

    // Access props through circuitProps to avoid undefined issues during construction
    const props = this.circuitProps as PNPBJTProperties;
    let region = "OFF";
    if (props.isSaturated) {
      region = "SAT";
    } else if (props.isActive) {
      region = "ACT";
    }

    this.valueText.text = `β=${props.beta}\n${region}`;
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
    this.bjtProps.baseVoltage = this.nodes[0].voltage;
    this.bjtProps.collectorVoltage = this.nodes[1].voltage;
    this.bjtProps.emitterVoltage = this.nodes[2].voltage;

    this.nodes[0].current = this.bjtProps.baseCurrent;
    this.nodes[1].current = this.bjtProps.collectorCurrent;
    this.nodes[2].current = this.bjtProps.emitterCurrent;
  }

  public getValueString(): string {
    return `β=${this.bjtProps.beta}`;
  }

  public getBeta(): number {
    return this.bjtProps.beta;
  }

  public setBeta(beta: number): void {
    this.bjtProps.beta = beta;
    this.circuitProps.value = beta;
    this.updateVisuals(0);
  }

  public getOperatingRegion(): string {
    if (this.bjtProps.isCutoff) return "cutoff";
    if (this.bjtProps.isActive) return "active";
    if (this.bjtProps.isSaturated) return "saturated";
    return "unknown";
  }

  public getBJTProperties(): PNPBJTProperties {
    return this.bjtProps;
  }
}
