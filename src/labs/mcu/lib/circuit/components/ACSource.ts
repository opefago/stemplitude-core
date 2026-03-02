import { Graphics, Text } from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface ACSourceProperties extends CircuitProperties {
  amplitude: number; // Peak voltage (V)
  frequency: number; // Frequency (Hz)
  phase: number; // Phase shift (radians)
}

/**
 * AC Voltage Source component - Generates sinusoidal voltage
 * V(t) = amplitude * sin(2πf * t + phase)
 */
export class ACSource extends CircuitComponent {
  protected acSourceProps: ACSourceProperties;

  constructor(
    name: string,
    amplitude: number = 10,
    frequency: number = 60,
    phase: number = 0,
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: ACSourceProperties = {
      value: amplitude, // Initial value is amplitude
      tolerance: 1,
      powerRating: 1000,
      voltage: 0, // Instantaneous voltage (set during simulation)
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      amplitude: amplitude,
      frequency: frequency,
      phase: phase,
    };

    super(name, "acsource", props, gridX, gridY);
    // Must assign after super() but props are accessed via this.circuitProps in createVisuals
    this.acSourceProps = this.circuitProps as ACSourceProperties;
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "positive",
        position: { x: -20, y: 0 }, // Relative to component center
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "negative",
        position: { x: 20, y: 0 }, // Relative to component center
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -40, valueY: 45 };
  }

  protected updateNodePositions(): void {
    // Update node positions based on orientation
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    // Positive terminal (left when orientation = 0)
    this.nodes[0].position.x = -20 * cos - 0 * sin;
    this.nodes[0].position.y = -20 * sin + 0 * cos;

    // Negative terminal (right when orientation = 0)
    this.nodes[1].position.x = 20 * cos - 0 * sin;
    this.nodes[1].position.y = 20 * sin + 0 * cos;
  }

  protected createVisuals(): void {
    if (this.componentGraphics.parent) {
      this.componentGraphics.parent.removeChild(this.componentGraphics);
    }
    this.componentGraphics = new Graphics();
    this.displayContainer.addChild(this.componentGraphics);

    // Draw circle (like battery but with AC symbol)
    this.componentGraphics
      .circle(0, 0, 15)
      .stroke({ width: 2, color: 0xff66ff });

    // Draw sine wave symbol inside circle
    this.drawSineWave();

    // Draw terminals
    this.componentGraphics
      .moveTo(-20, 0)
      .lineTo(-15, 0)
      .stroke({ width: 2, color: 0xaaaaaa });

    this.componentGraphics
      .moveTo(15, 0)
      .lineTo(20, 0)
      .stroke({ width: 2, color: 0xaaaaaa });

    // Add + and - signs
    const plusSign = new Text({
      text: "+",
      style: {
        fontSize: 12,
        fill: 0xff4444,
        fontFamily: "Arial",
        fontWeight: "bold",
      },
    });
    plusSign.position.set(-28, -8);
    this.componentGraphics.addChild(plusSign);

    const minusSign = new Text({
      text: "−",
      style: {
        fontSize: 12,
        fill: 0x4444ff,
        fontFamily: "Arial",
        fontWeight: "bold",
      },
    });
    minusSign.position.set(20, -8);
    this.componentGraphics.addChild(minusSign);

    // Add label (use circuitProps since acSourceProps isn't assigned yet during super() constructor)
    const props = this.circuitProps as ACSourceProperties;
    const valueLabel = new Text({
      text: `${props.amplitude}V\n${props.frequency}Hz`,
      style: {
        fontSize: 9,
        fill: 0xffffff,
        fontFamily: "Arial",
        align: "center",
      },
    });
    valueLabel.position.set(-15, 18);
    this.componentGraphics.addChild(valueLabel);

    // Add component label
    const label = new Text({
      text: this.name,
      style: {
        fontSize: 10,
        fill: 0xffffff,
        fontFamily: "Arial",
      },
    });
    label.position.set(-12, -28);
    this.componentGraphics.addChild(label);

    this.displayContainer.addChild(this.componentGraphics);
    this.createPinGraphics();
  }

  /**
   * Draw a simple sine wave inside the circle
   */
  private drawSineWave(): void {
    const points: { x: number; y: number }[] = [];
    const amplitude = 5;
    const frequency = 2;
    const steps = 20;

    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * 20 - 10;
      const y = amplitude * Math.sin((i / steps) * frequency * Math.PI * 2);
      points.push({ x, y });
    }

    // Draw the sine wave
    if (points.length > 0) {
      this.componentGraphics.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        this.componentGraphics.lineTo(points[i].x, points[i].y);
      }
      this.componentGraphics.stroke({ width: 2, color: 0xff66ff });
    }
  }

  /**
   * Calculate instantaneous voltage at time t
   */
  public getInstantaneousVoltage(time: number): number {
    const { amplitude, frequency, phase } = this.acSourceProps;
    return amplitude * Math.sin(2 * Math.PI * frequency * time + phase);
  }

  /**
   * Update voltage based on simulation time
   */
  public updateVoltageAtTime(time: number): void {
    this.circuitProps.voltage = this.getInstantaneousVoltage(time);
    this.acSourceProps.voltage = this.circuitProps.voltage;
  }

  public getCircuitProperties() {
    return {
      ...super.getCircuitProperties(),
      amplitude: this.acSourceProps.amplitude,
      frequency: this.acSourceProps.frequency,
      phase: this.acSourceProps.phase,
    };
  }

  public updateCircuitState(voltage: number, current: number): void {
    super.updateCircuitState(voltage, current);
    // Voltage is set by updateVoltageAtTime() during simulation
  }

  public updateCircuitProperties(updates: Partial<ACSourceProperties>): void {
    // Update the properties
    if (updates.amplitude !== undefined) {
      this.acSourceProps.amplitude = updates.amplitude;
      this.circuitProps.value = updates.amplitude; // Amplitude is the "value"
    }
    if (updates.frequency !== undefined) {
      this.acSourceProps.frequency = updates.frequency;
    }
    if (updates.phase !== undefined) {
      this.acSourceProps.phase = updates.phase;
    }
    if (updates.value !== undefined) {
      this.acSourceProps.amplitude = updates.value;
      this.circuitProps.value = updates.value;
    }

    // Update the visual label to reflect new values
    this.updateVisualLabel();
  }

  /**
   * Update the visual label to show current amplitude and frequency
   */
  private updateVisualLabel(): void {
    // Find and update the value label (3rd text child)
    const textChildren = this.componentGraphics.children.filter(
      (child) => child instanceof Text
    );

    if (textChildren.length >= 2) {
      const valueLabel = textChildren[1] as Text; // Second text is the value label
      valueLabel.text = `${this.acSourceProps.amplitude}V\n${this.acSourceProps.frequency}Hz`;
    }
  }

  protected updateVisuals(_deltaTime: number): void {
    // AC Source doesn't have animated visual updates based on circuit state
    // Visual representation is static and shows the waveform symbol
  }
}
