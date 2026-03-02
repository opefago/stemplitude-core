import { Graphics, Rectangle } from "pixi.js";
import * as PIXI from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

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
    // Store base positions (unrotated) - match visual terminal endpoints
    this.baseNodePositions = {
      base: { x: -30, y: 0 }, // Left terminal end
      collector: { x: 5, y: 25 }, // Bottom terminal end (inverted for PNP)
      emitter: { x: 5, y: -25 }, // Top terminal end (inverted for PNP)
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
        position: { x: 5, y: 25 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "emitter",
        position: { x: 5, y: -25 },
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
    const flipX = this.componentGraphics.scale.x; // Will be -1 if flipped

    // If baseNodePositions isn't set yet, initialize it now
    if (!this.baseNodePositions) {
      this.baseNodePositions = {
        base: { x: -30, y: 0 },
        collector: { x: 5, y: 25 },
        emitter: { x: 5, y: -25 },
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

  protected createVisuals(): void {
    this.componentGraphics.clear();

    // Circle enclosure - draw first as background
    this.componentGraphics.circle(0, 0, 22);
    this.componentGraphics.stroke({ width: 2.5, color: 0xff88ff });

    // === BASE (left terminal) ===
    // External base connection (extend slightly for visual alignment)
    this.componentGraphics.moveTo(-32, 0);
    this.componentGraphics.lineTo(-6, 0);

    // === EMITTER (top terminal - INVERTED for PNP) ===
    this.componentGraphics.moveTo(-3, -7);
    this.componentGraphics.lineTo(5, -14);
    this.componentGraphics.lineTo(5, -27);

    // === COLLECTOR (bottom terminal - INVERTED for PNP) ===
    this.componentGraphics.moveTo(-3, 7);
    this.componentGraphics.lineTo(5, 14);
    this.componentGraphics.lineTo(5, 27);

    // Apply stroke to all terminal lines at once
    this.componentGraphics.stroke({ width: 2.5, color: 0xff88ff });

    // Base vertical bar (solid rectangle)
    this.componentGraphics.rect(-6, -14, 3, 28);
    this.componentGraphics.fill({ color: 0xff88ff });

    // === ARROW (PNP - pointing IN on emitter line) ===
    // Arrow positioned on the diagonal emitter line (top, inverted)
    // The emitter line goes from (-3, -7) to (5, -14) - diagonal direction
    // Position arrow at midpoint, angled toward the base

    // Top angled line of arrow (pointing inward toward base)
    this.componentGraphics.moveTo(4, -16);
    this.componentGraphics.lineTo(0, -12);
    this.componentGraphics.stroke({ width: 3.5, color: 0xff88ff });

    // Bottom angled line of arrow
    this.componentGraphics.moveTo(0, -12);
    this.componentGraphics.lineTo(4, -8);
    this.componentGraphics.stroke({ width: 3.5, color: 0xff88ff });

    // Set explicit hit area to ensure transistor is clickable
    // Spans from base connection to collector/emitter terminals
    this.componentGraphics.hitArea = new PIXI.Rectangle(-35, -30, 45, 60);

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
