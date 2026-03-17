import { Graphics, Rectangle } from "pixi.js";
import * as PIXI from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface BJTProperties extends CircuitProperties {
  beta: number; // Current gain (hFE)
  vbe: number; // Base-emitter voltage threshold
  vcesat: number; // VCE saturation voltage
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

export class NPNTransistor extends CircuitComponent {
  protected bjtProps: BJTProperties;
  private baseNodePositions: { [key: string]: { x: number; y: number } };

  constructor(
    name: string,
    beta: number = 100,
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: BJTProperties = {
      value: beta,
      tolerance: 10,
      powerRating: 0.5, // 500mW
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      beta,
      vbe: 0.7, // Silicon BJT
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

    super(name, "npn_transistor", props, gridX, gridY);
    // Access props through circuitProps which is already set by super()
    this.bjtProps = this.circuitProps as BJTProperties;
  }

  protected initializeNodes(): void {
    // Store base positions (unrotated) - match visual terminal endpoints
    this.baseNodePositions = {
      base: { x: -30, y: 0 }, // Left terminal end
      collector: { x: 5, y: -25 }, // Top terminal end
      emitter: { x: 5, y: 25 }, // Bottom terminal end
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
        position: { x: 5, y: -25 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "emitter",
        position: { x: 5, y: 25 },
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
        collector: { x: 5, y: -25 },
        emitter: { x: 5, y: 25 },
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
    this.componentGraphics.stroke({ width: 2.5, color: 0x8888ff });

    // === BASE (left terminal) ===
    // External base connection (extend slightly for visual alignment)
    this.componentGraphics.moveTo(-32, 0);
    this.componentGraphics.lineTo(-6, 0);

    // === COLLECTOR (top terminal) ===
    this.componentGraphics.moveTo(-3, -7);
    this.componentGraphics.lineTo(5, -14);
    this.componentGraphics.lineTo(5, -27);

    // === EMITTER (bottom terminal) ===
    this.componentGraphics.moveTo(-3, 7);
    this.componentGraphics.lineTo(5, 14);
    this.componentGraphics.lineTo(5, 27);

    // Apply stroke to all terminal lines at once
    this.componentGraphics.stroke({ width: 2.5, color: 0x8888ff });

    // Base vertical bar (solid rectangle)
    this.componentGraphics.rect(-6, -14, 3, 28);
    this.componentGraphics.fill({ color: 0x8888ff });

    // === ARROW (NPN - pointing OUT on emitter line) ===
    // Arrow positioned on the diagonal emitter line
    // The emitter line goes from (-3, 7) to (5, 14) - diagonal direction
    // Position arrow at midpoint, angled along the line direction

    // Top angled line of arrow (pointing outward along emitter diagonal)
    this.componentGraphics.moveTo(0, 9);
    this.componentGraphics.lineTo(4, 12);
    this.componentGraphics.stroke({ width: 3.5, color: 0x8888ff });

    // Bottom angled line of arrow
    this.componentGraphics.moveTo(4, 12);
    this.componentGraphics.lineTo(0, 15);
    this.componentGraphics.stroke({ width: 3.5, color: 0x8888ff });

    // Set explicit hit area to ensure transistor is clickable
    // Spans from base connection to collector/emitter terminals
    this.componentGraphics.hitArea = new PIXI.Rectangle(-35, -30, 45, 60);

    this.updateLabels();
  }

  protected updateVisuals(deltaTime: number): void {
    this.updateOperatingRegion();

    let color = 0x8888ff; // Default blue

    if (this.bjtProps.isSaturated) {
      color = 0xff8888; // Red when saturated (switch ON)
    } else if (this.bjtProps.isActive) {
      color = 0xffaa00; // Orange in active region (amplifier)
    } else if (this.bjtProps.isCutoff) {
      color = 0x444466; // Dark when cutoff (switch OFF)
    }

    this.componentGraphics.tint = color;
    this.updateLabels();
  }

  private updateOperatingRegion(): void {
    const vbe = this.bjtProps.baseVoltage - this.bjtProps.emitterVoltage;
    const vce = this.bjtProps.collectorVoltage - this.bjtProps.emitterVoltage;

    // NPN operating regions
    if (vbe < this.bjtProps.vbe) {
      // Cutoff: VBE < 0.7V
      this.bjtProps.isCutoff = true;
      this.bjtProps.isActive = false;
      this.bjtProps.isSaturated = false;
    } else if (vce < this.bjtProps.vcesat) {
      // Saturation: VCE < VCE(sat)
      this.bjtProps.isCutoff = false;
      this.bjtProps.isActive = false;
      this.bjtProps.isSaturated = true;
    } else {
      // Active: VBE > 0.7V and VCE > VCE(sat)
      this.bjtProps.isCutoff = false;
      this.bjtProps.isActive = true;
      this.bjtProps.isSaturated = false;
    }
  }

  private updateLabels(): void {
    this.labelText.text = `${this.name}\nNPN`;
    this.labelText.style = {
      fontSize: 10,
      fill: 0xffffff,
      fontFamily: "Arial",
      align: "center",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -40);

    // Access props through circuitProps to avoid undefined issues during construction
    const props = this.circuitProps as BJTProperties;
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

  public getBJTProperties(): BJTProperties {
    return this.bjtProps;
  }
}
