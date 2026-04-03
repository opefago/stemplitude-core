import { Graphics } from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface ResistorProperties extends CircuitProperties {
  resistance: number; // Ohms
  temperatureCoefficient: number; // ppm/°C
  temperature: number; // °C
}

export class Resistor extends CircuitComponent {
  protected resistorProps: ResistorProperties;

  constructor(
    name: string,
    resistance: number = 1000, // 1kΩ default
    powerRating: number = 0.25, // 1/4 watt default
    tolerance: number = 5, // 5% default
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: ResistorProperties = {
      value: resistance,
      tolerance,
      powerRating,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      resistance,
      temperatureCoefficient: 0, // Assume ideal for now
      temperature: 25, // Room temperature
    };

    super(name, "resistor", props, gridX, gridY);
    this.resistorProps = props as ResistorProperties;
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "terminal1",
        position: { x: -30, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "terminal2",
        position: { x: 30, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected createVisuals(): void {
    this.componentGraphics.clear();

    const g = this.componentGraphics;
    const isBurnt = this.circuitProps?.burnt ?? false;
    const power = this.circuitProps?.power ?? 0;
    const rating = this.circuitProps?.powerRating ?? 0.25;
    const ratio = rating > 0 ? power / rating : 0;

    let color = 0x44ff44;
    if (isBurnt) {
      color = 0x444444;
    } else if (ratio > 1.0) {
      color = 0xff4444;
    } else if (ratio > 0.8) {
      color = 0xffaa00;
    }

    const sw = 3;

    // Left lead
    g.moveTo(-32, 0);
    g.lineTo(-20, 0);
    g.stroke({ width: sw, color });

    // Smooth wave body using quadratic curves (5 humps)
    g.moveTo(-20, 0);
    g.quadraticCurveTo(-16, -12, -12, 0);
    g.quadraticCurveTo(-8, 12, -4, 0);
    g.quadraticCurveTo(0, -12, 4, 0);
    g.quadraticCurveTo(8, 12, 12, 0);
    g.quadraticCurveTo(16, -12, 20, 0);
    g.stroke({ width: sw, color });

    // Right lead
    g.moveTo(20, 0);
    g.lineTo(32, 0);
    g.stroke({ width: sw, color });

    // Draw "X" if burnt
    if (isBurnt) {
      g.moveTo(-10, -8);
      g.lineTo(10, 8);
      g.moveTo(-10, 8);
      g.lineTo(10, -8);
      g.stroke({ width: 3, color: 0xff0000 });
    }

    this.updateLabels();
  }

  protected updateVisuals(_deltaTime: number): void {
    if (!this.resistorProps) return;

    const power = Math.abs(this.circuitProps.voltage * this.circuitProps.current);
    this.circuitProps.power = power;

    // Burn out when power exceeds 2x the rating (like a fuse wire melting)
    if (!this.circuitProps.burnt && power > this.circuitProps.powerRating * 2) {
      this.circuitProps.burnt = true;
      console.log(
        `⚠️ Resistor ${this.name} BURNT! Power: ${power.toFixed(4)}W exceeded ${(this.circuitProps.powerRating * 2).toFixed(4)}W`
      );
    }

    this.createVisuals();
    this.updateLabels();
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
    this.labelText.position.set(0, -20);

    // Value label
    this.valueText.text = this.getValueString();
    this.valueText.style = {
      fontSize: 8,
      fill: 0xcccccc, // Light gray for value
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 15);
  }

  protected updateNodePositions(): void {
    // Update node positions based on orientation
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    // Terminal 1 (left when orientation = 0)
    this.nodes[0].position.x = -30 * cos - 0 * sin;
    this.nodes[0].position.y = -30 * sin + 0 * cos;

    // Terminal 2 (right when orientation = 0)
    this.nodes[1].position.x = 30 * cos - 0 * sin;
    this.nodes[1].position.y = 30 * sin + 0 * cos;
  }

  protected updateNodeVoltages(): void {
    // For a resistor, voltage drop is I*R
    const voltageDrop =
      this.circuitProps.current * this.resistorProps.resistance;

    if (this.circuitProps.current > 0) {
      // Current flows from terminal1 to terminal2
      this.nodes[0].voltage = this.circuitProps.voltage;
      this.nodes[1].voltage = this.circuitProps.voltage - voltageDrop;
    } else {
      // Current flows from terminal2 to terminal1
      this.nodes[1].voltage = this.circuitProps.voltage;
      this.nodes[0].voltage = this.circuitProps.voltage - voltageDrop;
    }

    // Update node currents
    this.nodes[0].current = this.circuitProps.current;
    this.nodes[1].current = -this.circuitProps.current;
  }

  public getImpedance(_frequency: number = 0): number {
    if (this.circuitProps.burnt) return 1e9;
    return this.resistorProps.resistance;
  }

  public getResistance(): number {
    return this.resistorProps.resistance;
  }

  public setResistance(resistance: number): void {
    this.resistorProps.resistance = resistance;
    this.circuitProps.value = resistance;
    this.updateVisuals(0);
  }
}
