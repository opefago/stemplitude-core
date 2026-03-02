import { Graphics } from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface CapacitorProperties extends CircuitProperties {
  capacitance: number; // Farads
  voltageRating: number; // Maximum voltage
  dielectric: string; // Dielectric material
  esr: number; // Equivalent Series Resistance (Ohms)
  charge: number; // Current charge (Coulombs)
}

export class Capacitor extends CircuitComponent {
  protected capacitorProps: CapacitorProperties;

  constructor(
    name: string,
    capacitance: number = 100e-6, // 100μF default
    voltageRating: number = 25, // 25V default
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: CapacitorProperties = {
      value: capacitance,
      tolerance: 20, // 20% typical for electrolytic
      powerRating: 1, // Not really applicable, but for consistency
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      capacitance,
      voltageRating,
      dielectric: "electrolytic",
      esr: 0.1, // 0.1Ω typical ESR
      charge: 0,
      initialCondition: 0, // Initial voltage
    };

    super(name, "capacitor", props, gridX, gridY);
    this.capacitorProps = props as CapacitorProperties;
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "positive",
        position: { x: -25, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "negative",
        position: { x: 25, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected createVisuals(): void {
    this.componentGraphics.clear();

    // Draw capacitor symbol (two parallel plates) - bright cyan for visibility
    // Left terminal
    this.componentGraphics.moveTo(-25, 0);
    this.componentGraphics.lineTo(-10, 0);
    this.componentGraphics.stroke({ width: 3, color: 0x44dddd });

    // Left plate (positive)
    this.componentGraphics.moveTo(-10, -15);
    this.componentGraphics.lineTo(-10, 15);
    this.componentGraphics.stroke({ width: 3, color: 0x44dddd });

    // Right plate (negative)
    this.componentGraphics.moveTo(10, -15);
    this.componentGraphics.lineTo(10, 15);
    this.componentGraphics.stroke({ width: 3, color: 0x44dddd });

    // Right terminal
    this.componentGraphics.moveTo(10, 0);
    this.componentGraphics.lineTo(25, 0);
    this.componentGraphics.stroke({ width: 3, color: 0x44dddd });

    // Draw terminal dots
    this.componentGraphics.circle(-25, 0, 2);
    this.componentGraphics.fill(0x666666);
    this.componentGraphics.circle(25, 0, 2);
    this.componentGraphics.fill(0x666666);

    // Draw polarity indicators for electrolytic capacitors
    const dielectric = this.capacitorProps?.dielectric ?? "ceramic";
    if (dielectric === "electrolytic") {
      this.drawPolarityMarkers();
    }

    this.updateLabels();
  }

  private drawPolarityMarkers(): void {
    // Draw + symbol near positive terminal
    this.componentGraphics.lineStyle(2, 0xff0000);
    this.componentGraphics.moveTo(-18, -5);
    this.componentGraphics.lineTo(-18, 5);
    this.componentGraphics.moveTo(-23, 0);
    this.componentGraphics.lineTo(-13, 0);

    // Draw - symbol near negative terminal
    this.componentGraphics.moveTo(13, 0);
    this.componentGraphics.lineTo(23, 0);
  }

  protected updateVisuals(deltaTime: number): void {
    // Update capacitor appearance based on charge and voltage
    let plateColor = 0x333333; // Normal

    if (this.circuitProps.burnt) {
      // Burnt capacitor (overvoltage)
      plateColor = 0x000000;
      this.componentGraphics.tint = 0x000000;

      if (this.burnAnimation > 0) {
        // Add smoke/burn effect
        this.drawBurnEffect();
      }
    } else if (
      Math.abs(this.circuitProps.voltage) >
      (this.capacitorProps?.voltageRating ?? 25) * 0.9
    ) {
      // Near voltage limit - warning color
      plateColor = 0xff6600;
    } else if (Math.abs(this.capacitorProps?.charge ?? 0) > 0) {
      // Charged capacitor - slight blue tint
      const charge = this.capacitorProps?.charge ?? 0;
      const capacitance = this.capacitorProps?.capacitance ?? 100e-6;
      const voltageRating = this.capacitorProps?.voltageRating ?? 25;
      const chargeRatio = Math.abs(charge) / (capacitance * voltageRating);
      const intensity = Math.min(chargeRatio, 1) * 0.3;
      plateColor = this.interpolateColor(0x333333, 0x0066ff, intensity);
    }

    // Current flow animation (charging/discharging)
    if (
      this.currentFlowAnimation > 0 &&
      Math.abs(this.circuitProps.current) > 0.001
    ) {
      this.drawCurrentFlow();
    }

    this.updateLabels();
  }

  private drawBurnEffect(): void {
    // Draw smoke/burn effect for overvoltage failure
    const smokeGraphics = new Graphics();
    smokeGraphics.beginFill(0x666666, 0.3);

    // Simple smoke particles
    for (let i = 0; i < 5; i++) {
      const x = -5 + Math.random() * 10;
      const y = -20 - Math.random() * 10;
      const size = 2 + Math.random() * 3;
      smokeGraphics.drawCircle(x, y, size);
    }

    smokeGraphics.endFill();
    this.displayContainer.addChild(smokeGraphics);

    setTimeout(() => {
      if (smokeGraphics.parent) {
        smokeGraphics.parent.removeChild(smokeGraphics);
      }
      smokeGraphics.destroy();
    }, 100);
  }

  private drawCurrentFlow(): void {
    // Draw current flow animation for charging/discharging
    const flowGraphics = new Graphics();

    if (this.circuitProps.current > 0) {
      // Charging - current flows to positive plate
      flowGraphics.beginFill(0x00ff00, 0.6);
    } else {
      // Discharging - current flows from positive plate
      flowGraphics.beginFill(0xff6600, 0.6);
    }

    const animationOffset = (Date.now() / 150) % 1;
    const flowDirection = this.circuitProps.current > 0 ? 1 : -1;

    // Draw moving charge indicators
    for (let i = 0; i < 4; i++) {
      const progress = (i / 4 + animationOffset * flowDirection) % 1;
      const x = -25 + progress * 50;
      flowGraphics.drawCircle(x, -8, 1.5);
    }

    flowGraphics.endFill();
    this.displayContainer.addChild(flowGraphics);

    setTimeout(() => {
      if (flowGraphics.parent) {
        flowGraphics.parent.removeChild(flowGraphics);
      }
      flowGraphics.destroy();
    }, 16);
  }

  private updateLabels(): void {
    // Component label
    this.labelText.text = this.name;
    this.labelText.style = {
      fontSize: 10,
      fill: 0xffffff, // White text for visibility on black canvas
      fontFamily: "Arial",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -25);

    // Value label with charge info
    const valueStr = this.getValueString();
    const charge = this.capacitorProps?.charge ?? 0;
    const chargeStr = `Q=${(charge * 1e6).toFixed(1)}μC`;
    this.valueText.text = `${valueStr}\n${chargeStr}`;
    this.valueText.style = {
      fontSize: 8,
      fill: 0xcccccc, // Light gray for value
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 20);
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -35, valueY: 30 };
  }

  protected updateNodePositions(): void {
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    // Positive terminal
    this.nodes[0].position.x = -25 * cos - 0 * sin;
    this.nodes[0].position.y = -25 * sin + 0 * cos;

    // Negative terminal
    this.nodes[1].position.x = 25 * cos - 0 * sin;
    this.nodes[1].position.y = 25 * sin + 0 * cos;
  }

  protected updateNodeVoltages(): void {
    // For a capacitor, voltage across plates equals stored voltage
    this.nodes[0].voltage = this.circuitProps.voltage;
    this.nodes[1].voltage = 0; // Reference

    // Update node currents (same for both terminals)
    this.nodes[0].current = this.circuitProps.current;
    this.nodes[1].current = -this.circuitProps.current;
  }

  public getImpedance(frequency: number): number {
    if (frequency === 0) {
      return Infinity; // DC: capacitor is open circuit
    }

    const omega = 2 * Math.PI * frequency;
    const reactance = 1 / (omega * this.capacitorProps.capacitance);

    // Include ESR for more realistic model
    return Math.sqrt(
      reactance * reactance + this.capacitorProps.esr * this.capacitorProps.esr
    );
  }

  public getReactance(frequency: number): number {
    if (frequency === 0) return Infinity;

    const omega = 2 * Math.PI * frequency;
    return -1 / (omega * this.capacitorProps.capacitance); // Negative for capacitive reactance
  }

  public getCapacitance(): number {
    return this.capacitorProps.capacitance;
  }

  public setCapacitance(capacitance: number): void {
    this.capacitorProps.capacitance = capacitance;
    this.circuitProps.value = capacitance;
    this.updateVisuals(0);
  }

  public getCharge(): number {
    return this.capacitorProps?.charge ?? 0;
  }

  public setCharge(charge: number): void {
    if (this.capacitorProps) {
      this.capacitorProps.charge = charge;
      // Update voltage based on Q = CV
      const capacitance = this.capacitorProps.capacitance ?? 100e-6;
      this.circuitProps.voltage = charge / capacitance;
    }
    this.updateVisuals(0);
  }

  /**
   * Time-domain update for transient analysis
   */
  public updateTransient(deltaTime: number, appliedVoltage: number): void {
    // Simple RC charging/discharging model
    // dV/dt = (Vapplied - Vcap) / (R * C)
    // For now, assume external resistance is handled by circuit solver

    // Update charge based on current
    if (this.capacitorProps) {
      this.capacitorProps.charge += this.circuitProps.current * deltaTime;

      // Update voltage based on charge
      const capacitance = this.capacitorProps.capacitance ?? 100e-6;
      this.circuitProps.voltage = this.capacitorProps.charge / capacitance;
    }

    // Check for overvoltage
    const voltageRating = this.capacitorProps?.voltageRating ?? 25;
    if (Math.abs(this.circuitProps.voltage) > voltageRating) {
      this.circuitProps.burnt = true;
      this.startBurnAnimation();
    }
  }

  private interpolateColor(
    color1: number,
    color2: number,
    factor: number
  ): number {
    const r1 = (color1 >> 16) & 0xff;
    const g1 = (color1 >> 8) & 0xff;
    const b1 = color1 & 0xff;

    const r2 = (color2 >> 16) & 0xff;
    const g2 = (color2 >> 8) & 0xff;
    const b2 = color2 & 0xff;

    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);

    return (r << 16) | (g << 8) | b;
  }
}
