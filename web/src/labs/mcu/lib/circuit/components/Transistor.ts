import { Graphics, Text } from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface TransistorProperties extends CircuitProperties {
  type: "NPN" | "PNP" | "NMOS" | "PMOS"; // Transistor type
  beta: number; // Current gain (hFE for BJT)
  vbe: number; // Base-emitter voltage (BJT)
  vth: number; // Threshold voltage (MOSFET)
  saturationVoltage: number; // VCE(sat) for BJT or VDS(sat) for MOSFET
  isSaturated: boolean; // Operating in saturation region
  isCutoff: boolean; // Operating in cutoff region
  isActive: boolean; // Operating in active/linear region
  baseVoltage: number; // Voltage at base/gate
  collectorVoltage: number; // Voltage at collector/drain
  emitterVoltage: number; // Voltage at emitter/source
  baseCurrent: number; // Current into base/gate
  collectorCurrent: number; // Current through collector/drain
  emitterCurrent: number; // Current through emitter/source
}

export class Transistor extends CircuitComponent {
  protected transistorProps: TransistorProperties;

  constructor(
    name: string,
    type: "NPN" | "PNP" | "NMOS" | "PMOS" = "NPN",
    beta: number = 100, // Typical current gain
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: TransistorProperties = {
      value: beta, // Use beta as the primary value
      tolerance: 10, // Typical beta tolerance
      powerRating: 0.5, // 500mW default
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      type,
      beta,
      vbe: 0.7, // Silicon BJT threshold (0.3V for Germanium)
      vth: type === "NMOS" || type === "PMOS" ? 2.0 : 0.7, // MOSFET threshold
      saturationVoltage: 0.2, // VCE(sat)
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

    super(name, "transistor", props, gridX, gridY);
    this.transistorProps = props as TransistorProperties;
  }

  protected initializeNodes(): void {
    // Three terminals: Base/Gate, Collector/Drain, Emitter/Source
    this.nodes = [
      {
        id: "base",
        position: { x: -30, y: 0 }, // Left side
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "collector",
        position: { x: 0, y: -25 }, // Top
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "emitter",
        position: { x: 0, y: 25 }, // Bottom
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected createVisuals(): void {
    this.componentGraphics.clear();

    const tType = this.transistorProps?.type ?? "NPN";
    const isBJT = tType === "NPN" || tType === "PNP";
    const isNType = tType === "NPN" || tType === "NMOS";

    if (isBJT) {
      this.drawBJT(isNType);
    } else {
      this.drawMOSFET(isNType);
    }

    this.updateLabels();
  }

  private drawBJT(isNPN: boolean): void {
    // Circle around transistor
    this.componentGraphics.circle(0, 0, 20);
    this.componentGraphics.stroke({ width: 2, color: 0x8888ff });

    // Base line (vertical)
    this.componentGraphics.moveTo(-8, -12);
    this.componentGraphics.lineTo(-8, 12);
    this.componentGraphics.stroke({ width: 3, color: 0x8888ff });

    // Base connection
    this.componentGraphics.moveTo(-30, 0);
    this.componentGraphics.lineTo(-8, 0);
    this.componentGraphics.stroke({ width: 2, color: 0x8888ff });

    // Collector line
    this.componentGraphics.moveTo(-8, -8);
    this.componentGraphics.lineTo(0, -25);
    this.componentGraphics.stroke({ width: 2, color: 0x8888ff });

    // Emitter line
    this.componentGraphics.moveTo(-8, 8);
    this.componentGraphics.lineTo(0, 25);
    this.componentGraphics.stroke({ width: 2, color: 0x8888ff });

    // Arrow on emitter (points out for NPN, in for PNP)
    if (isNPN) {
      // Arrow pointing away from base (NPN)
      this.componentGraphics.moveTo(-2, 18);
      this.componentGraphics.lineTo(0, 25);
      this.componentGraphics.lineTo(-6, 22);
      this.componentGraphics.stroke({ width: 2, color: 0xff8888 });
    } else {
      // Arrow pointing toward base (PNP)
      this.componentGraphics.moveTo(-2, 12);
      this.componentGraphics.lineTo(-8, 8);
      this.componentGraphics.lineTo(-4, 6);
      this.componentGraphics.stroke({ width: 2, color: 0xff8888 });
    }
  }

  private drawMOSFET(isNMOS: boolean): void {
    // Gate line (vertical, isolated)
    this.componentGraphics.moveTo(-15, -15);
    this.componentGraphics.lineTo(-15, 15);
    this.componentGraphics.stroke({ width: 3, color: 0x88ff88 });

    // Gate connection
    this.componentGraphics.moveTo(-30, 0);
    this.componentGraphics.lineTo(-15, 0);
    this.componentGraphics.stroke({ width: 2, color: 0x88ff88 });

    // Channel segments (3 dashes)
    for (let i = -1; i <= 1; i++) {
      this.componentGraphics.moveTo(-8, i * 8 - 2);
      this.componentGraphics.lineTo(-8, i * 8 + 2);
      this.componentGraphics.stroke({ width: 3, color: 0x88ff88 });
    }

    // Drain connection
    this.componentGraphics.moveTo(-8, -8);
    this.componentGraphics.lineTo(0, -25);
    this.componentGraphics.stroke({ width: 2, color: 0x88ff88 });

    // Source connection
    this.componentGraphics.moveTo(-8, 8);
    this.componentGraphics.lineTo(0, 25);
    this.componentGraphics.stroke({ width: 2, color: 0x88ff88 });

    // Arrow on source (points out for NMOS, in for PMOS)
    if (isNMOS) {
      this.componentGraphics.moveTo(-2, 18);
      this.componentGraphics.lineTo(0, 25);
      this.componentGraphics.lineTo(-6, 22);
      this.componentGraphics.stroke({ width: 2, color: 0xffff88 });
    } else {
      this.componentGraphics.moveTo(-2, -18);
      this.componentGraphics.lineTo(0, -25);
      this.componentGraphics.lineTo(-6, -22);
      this.componentGraphics.stroke({ width: 2, color: 0xffff88 });
    }
  }

  protected updateVisuals(deltaTime: number): void {
    // Update operating region based on voltages
    this.updateOperatingRegion();

    // Change color based on operating region
    let color = 0x8888ff; // Default blue for BJT, green for MOSFET

    if (this.transistorProps.isSaturated) {
      color = 0xff8888; // Red when saturated (switch ON)
    } else if (this.transistorProps.isActive) {
      color = 0xffaa00; // Orange in active region (amplifier)
    } else if (this.transistorProps.isCutoff) {
      color = 0x444466; // Dark when cutoff (switch OFF)
    }

    // Apply tint based on state
    this.componentGraphics.tint = color;

    this.updateLabels();
  }

  private updateOperatingRegion(): void {
    const isBJT =
      this.transistorProps.type === "NPN" ||
      this.transistorProps.type === "PNP";
    const isNType =
      this.transistorProps.type === "NPN" ||
      this.transistorProps.type === "NMOS";

    const vbe =
      this.transistorProps.baseVoltage - this.transistorProps.emitterVoltage;
    const vce =
      this.transistorProps.collectorVoltage -
      this.transistorProps.emitterVoltage;

    if (isBJT) {
      // BJT operating regions
      if (isNType) {
        // NPN
        if (vbe < this.transistorProps.vbe) {
          // Cutoff: VBE < 0.7V
          this.transistorProps.isCutoff = true;
          this.transistorProps.isActive = false;
          this.transistorProps.isSaturated = false;
        } else if (vce < this.transistorProps.saturationVoltage) {
          // Saturation: VCE < VCE(sat)
          this.transistorProps.isCutoff = false;
          this.transistorProps.isActive = false;
          this.transistorProps.isSaturated = true;
        } else {
          // Active: VBE > 0.7V and VCE > VCE(sat)
          this.transistorProps.isCutoff = false;
          this.transistorProps.isActive = true;
          this.transistorProps.isSaturated = false;
        }
      } else {
        // PNP (opposite polarity)
        if (vbe > -this.transistorProps.vbe) {
          this.transistorProps.isCutoff = true;
          this.transistorProps.isActive = false;
          this.transistorProps.isSaturated = false;
        } else if (vce > -this.transistorProps.saturationVoltage) {
          this.transistorProps.isCutoff = false;
          this.transistorProps.isActive = false;
          this.transistorProps.isSaturated = true;
        } else {
          this.transistorProps.isCutoff = false;
          this.transistorProps.isActive = true;
          this.transistorProps.isSaturated = false;
        }
      }
    } else {
      // MOSFET operating regions
      const vgs =
        this.transistorProps.baseVoltage - this.transistorProps.emitterVoltage;
      const vds =
        this.transistorProps.collectorVoltage -
        this.transistorProps.emitterVoltage;

      if (isNType) {
        // NMOS
        if (vgs < this.transistorProps.vth) {
          // Cutoff: VGS < Vth
          this.transistorProps.isCutoff = true;
          this.transistorProps.isActive = false;
          this.transistorProps.isSaturated = false;
        } else if (vds < vgs - this.transistorProps.vth) {
          // Linear/Triode region
          this.transistorProps.isCutoff = false;
          this.transistorProps.isActive = true;
          this.transistorProps.isSaturated = false;
        } else {
          // Saturation region (acts as current source)
          this.transistorProps.isCutoff = false;
          this.transistorProps.isActive = false;
          this.transistorProps.isSaturated = true;
        }
      } else {
        // PMOS (opposite polarity)
        if (vgs > -this.transistorProps.vth) {
          this.transistorProps.isCutoff = true;
          this.transistorProps.isActive = false;
          this.transistorProps.isSaturated = false;
        } else if (vds > vgs + this.transistorProps.vth) {
          this.transistorProps.isCutoff = false;
          this.transistorProps.isActive = true;
          this.transistorProps.isSaturated = false;
        } else {
          this.transistorProps.isCutoff = false;
          this.transistorProps.isActive = false;
          this.transistorProps.isSaturated = true;
        }
      }
    }
  }

  private updateLabels(): void {
    if (!this.transistorProps) return;
    this.labelText.text = `${this.name}\n${this.transistorProps.type}`;
    this.labelText.style = {
      fontSize: 10,
      fill: 0xffffff,
      fontFamily: "Arial",
      align: "center",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -40);

    let region = "OFF";
    if (this.transistorProps.isSaturated) {
      region = "SAT";
    } else if (this.transistorProps.isActive) {
      region = "ACT";
    }

    this.valueText.text = `β=${this.transistorProps.beta}\n${region}`;
    this.valueText.style = {
      fontSize: 8,
      fill: 0xcccccc,
      fontFamily: "Arial",
      align: "center",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 35);
  }

  protected updateNodePositions(): void {
    // Update node positions based on orientation
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    // Base (left)
    this.nodes[0].position.x = -30 * cos - 0 * sin;
    this.nodes[0].position.y = -30 * sin + 0 * cos;

    // Collector (top)
    this.nodes[1].position.x = 0 * cos - -25 * sin;
    this.nodes[1].position.y = 0 * sin + -25 * cos;

    // Emitter (bottom)
    this.nodes[2].position.x = 0 * cos - 25 * sin;
    this.nodes[2].position.y = 0 * sin + 25 * cos;
  }

  protected updateNodeVoltages(): void {
    // Update node voltages from simulation
    this.transistorProps.baseVoltage = this.nodes[0].voltage;
    this.transistorProps.collectorVoltage = this.nodes[1].voltage;
    this.transistorProps.emitterVoltage = this.nodes[2].voltage;

    // Update node currents
    this.nodes[0].current = this.transistorProps.baseCurrent;
    this.nodes[1].current = this.transistorProps.collectorCurrent;
    this.nodes[2].current = this.transistorProps.emitterCurrent;
  }

  public getValueString(): string {
    return `β=${this.transistorProps.beta}`;
  }

  public getTransistorType(): "NPN" | "PNP" | "NMOS" | "PMOS" {
    return this.transistorProps.type;
  }

  public getBeta(): number {
    return this.transistorProps.beta;
  }

  public setBeta(beta: number): void {
    this.transistorProps.beta = beta;
    this.circuitProps.value = beta;
    this.updateVisuals(0);
  }

  public getOperatingRegion(): string {
    if (this.transistorProps.isCutoff) return "cutoff";
    if (this.transistorProps.isActive) return "active";
    if (this.transistorProps.isSaturated) return "saturated";
    return "unknown";
  }
}

