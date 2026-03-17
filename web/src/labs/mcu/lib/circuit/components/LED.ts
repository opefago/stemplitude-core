import { Graphics } from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface LEDProperties extends CircuitProperties {
  forwardVoltage: number; // Forward voltage drop (V)
  maxCurrent: number; // Maximum forward current (A)
  color: string; // LED color
  brightness: number; // Current brightness (0-1)
  isOn: boolean; // LED state
  wavelength: number; // Light wavelength (nm)
  dynamicResistance: number; // Dynamic resistance when conducting (Ω)
}

// Standard LED specifications by color
export interface LEDSpec {
  forwardVoltage: number; // Typical forward voltage (V)
  maxCurrent: number; // Maximum continuous current (A)
  dynamicResistance: number; // Dynamic resistance (Ω)
  wavelength: number; // Light wavelength (nm)
}

export class LED extends CircuitComponent {
  protected ledProps: LEDProperties;

  // Standard LED specifications
  private static readonly LED_SPECS: { [key: string]: LEDSpec } = {
    red: {
      forwardVoltage: 1.8,
      maxCurrent: 0.02, // 20mA
      dynamicResistance: 25,
      wavelength: 660,
    },
    green: {
      forwardVoltage: 2.1,
      maxCurrent: 0.02, // 20mA
      dynamicResistance: 30,
      wavelength: 520,
    },
    blue: {
      forwardVoltage: 3.2,
      maxCurrent: 0.02, // 20mA
      dynamicResistance: 40,
      wavelength: 470,
    },
    yellow: {
      forwardVoltage: 2.0,
      maxCurrent: 0.02, // 20mA
      dynamicResistance: 28,
      wavelength: 570,
    },
    white: {
      forwardVoltage: 3.3,
      maxCurrent: 0.02, // 20mA
      dynamicResistance: 45,
      wavelength: 550, // Broad spectrum
    },
  };

  constructor(
    name: string,
    color: string = "red",
    gridX: number = 0,
    gridY: number = 0
  ) {
    const spec = LED.getSpecForColor(color);

    const props: LEDProperties = {
      value: spec.forwardVoltage,
      tolerance: 10, // 10% voltage tolerance
      powerRating: spec.forwardVoltage * spec.maxCurrent, // Maximum power
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      forwardVoltage: spec.forwardVoltage,
      maxCurrent: spec.maxCurrent,
      color,
      brightness: 0,
      isOn: false,
      wavelength: spec.wavelength,
      dynamicResistance: spec.dynamicResistance,
    };

    super(name, "led", props, gridX, gridY);
    this.ledProps = props as LEDProperties;
  }

  private static getSpecForColor(color: string): LEDSpec {
    return LED.LED_SPECS[color.toLowerCase()] || LED.LED_SPECS.red;
  }

  private static getWavelengthForColor(color: string): number {
    const spec = LED.getSpecForColor(color);
    return spec.wavelength;
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "anode",
        position: { x: -25, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "cathode",
        position: { x: 25, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected createVisuals(): void {
    this.componentGraphics.clear();

    const isBurnt = this.circuitProps?.burnt ?? false;
    const isOn = this.ledProps?.isOn ?? false;
    const brightness = this.ledProps?.brightness ?? 0;

    // LED symbol: triangle with line (diode symbol)
    // Triangle (anode side)
    this.componentGraphics.moveTo(-15, -10);
    this.componentGraphics.lineTo(-15, 10);
    this.componentGraphics.lineTo(5, 0);
    this.componentGraphics.lineTo(-15, -10);

    // Fill triangle based on LED state
    let triangleColor: number;
    if (isBurnt) {
      triangleColor = 0x000000; // Black for burnt
    } else if (isOn) {
      // Blend LED color with dark base color based on brightness
      // This creates a smooth gradient from dim to bright
      const baseColor = this.getLEDColor();

      // Extract RGB components
      const baseR = (baseColor >> 16) & 0xff;
      const baseG = (baseColor >> 8) & 0xff;
      const baseB = baseColor & 0xff;

      // Create a dark version of the LED color (20% of original)
      const darkR = Math.floor(baseR * 0.2);
      const darkG = Math.floor(baseG * 0.2);
      const darkB = Math.floor(baseB * 0.2);

      // Interpolate between dark and full brightness
      // At 0% brightness: dark color (barely visible)
      // At 100% brightness: full LED color (vivid)
      const r = darkR + (baseR - darkR) * brightness;
      const g = darkG + (baseG - darkG) * brightness;
      const b = darkB + (baseB - darkB) * brightness;

      triangleColor =
        (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
    } else {
      triangleColor = 0x333333; // Dark gray when off
    }

    this.componentGraphics.fill(triangleColor);

    // Stroke color based on state
    const strokeColor = isBurnt ? 0xff4444 : 0xffffff; // Red border if burnt
    this.componentGraphics.stroke({ width: 2, color: strokeColor });

    // Cathode line
    this.componentGraphics.moveTo(5, -10);
    this.componentGraphics.lineTo(5, 10);
    this.componentGraphics.stroke({ width: 3, color: strokeColor });

    // Terminal connections
    this.componentGraphics.moveTo(-25, 0);
    this.componentGraphics.lineTo(-15, 0);
    this.componentGraphics.moveTo(5, 0);
    this.componentGraphics.lineTo(25, 0);
    this.componentGraphics.stroke({ width: 2, color: strokeColor });

    // Draw "X" if burnt
    if (isBurnt) {
      this.componentGraphics.moveTo(-10, -8);
      this.componentGraphics.lineTo(10, 8);
      this.componentGraphics.moveTo(-10, 8);
      this.componentGraphics.lineTo(10, -8);
      this.componentGraphics.stroke({ width: 3, color: 0xff0000 });
    }

    // Light rays (when LED is on and not burnt)
    if (isOn && !isBurnt) {
      this.drawLightRays();
    }

    // Glow effect when LED is on and not burnt (even at low brightness)
    if (isOn && !isBurnt && brightness > 0.01) {
      this.drawGlowEffect();
    }

    // Update text labels
    this.updateLabels();
  }

  private getLEDColor(): number {
    const colors: { [key: string]: number } = {
      red: 0xff4444,
      orange: 0xff8844,
      yellow: 0xffff44,
      green: 0x44ff44,
      blue: 0x4444ff,
      white: 0xffffff,
      infrared: 0x880000,
      ultraviolet: 0x8800ff,
    };
    const color = this.ledProps?.color ?? "red";
    return colors[color.toLowerCase()] || 0xff4444;
  }

  private drawLightRays(): void {
    const rayColor = this.getLEDColor();
    const alpha = this.ledProps?.brightness ?? 0;

    // Draw light rays emanating from LED
    for (let i = 0; i < 3; i++) {
      const angle = (i - 1) * 0.3; // Spread rays
      const startX = 10;
      const startY = 0;
      const endX = startX + 20 * Math.cos(angle);
      const endY = startY + 20 * Math.sin(angle);

      this.componentGraphics.moveTo(startX, startY);
      this.componentGraphics.lineTo(endX, endY);
      this.componentGraphics.stroke({
        width: 2,
        color: rayColor,
        alpha: alpha,
      });

      // Arrow heads for light rays
      const arrowSize = 3;
      const arrowAngle = Math.atan2(endY - startY, endX - startX);

      this.componentGraphics.moveTo(endX, endY);
      this.componentGraphics.lineTo(
        endX - arrowSize * Math.cos(arrowAngle - 0.5),
        endY - arrowSize * Math.sin(arrowAngle - 0.5)
      );
      this.componentGraphics.moveTo(endX, endY);
      this.componentGraphics.lineTo(
        endX - arrowSize * Math.cos(arrowAngle + 0.5),
        endY - arrowSize * Math.sin(arrowAngle + 0.5)
      );
      this.componentGraphics.stroke({
        width: 1,
        color: rayColor,
        alpha: alpha,
      });
    }
  }

  private drawGlowEffect(): void {
    // Create glow effect in the shape of the LED triangle
    const glowGraphics = new Graphics();
    const glowColor = this.getLEDColor();
    const brightness = this.ledProps?.brightness ?? 0;

    // Triangle vertices (same as LED body)
    const x1 = -15,
      y1 = -10;
    const x2 = -15,
      y2 = 10;
    const x3 = 5,
      y3 = 0;

    // Calculate centroid of triangle (center point for scaling)
    const centerX = (x1 + x2 + x3) / 3;
    const centerY = (y1 + y2 + y3) / 3;

    // Draw multiple layers of the triangle at increasing sizes for glow effect
    // More layers at higher brightness for a more intense glow
    const glowLayers = Math.max(3, Math.floor(5 * brightness));
    for (let i = glowLayers; i > 0; i--) {
      const scale = 1 + i * 0.2 * brightness; // Scale based on brightness
      // More intense glow at higher brightness levels
      const alpha = (brightness * brightness * 0.6) / i; // Quadratic for more punch

      // Scale each vertex from the centroid
      const sx1 = centerX + (x1 - centerX) * scale;
      const sy1 = centerY + (y1 - centerY) * scale;
      const sx2 = centerX + (x2 - centerX) * scale;
      const sy2 = centerY + (y2 - centerY) * scale;
      const sx3 = centerX + (x3 - centerX) * scale;
      const sy3 = centerY + (y3 - centerY) * scale;

      glowGraphics.moveTo(sx1, sy1);
      glowGraphics.lineTo(sx2, sy2);
      glowGraphics.lineTo(sx3, sy3);
      glowGraphics.lineTo(sx1, sy1);
      glowGraphics.fill({
        color: glowColor,
        alpha: alpha,
      });
    }

    // Add to componentGraphics so it transforms with the LED (rotation/flip)
    this.componentGraphics.addChild(glowGraphics);

    // Remove glow after a short time (for animation)
    setTimeout(() => {
      if (glowGraphics.parent) {
        glowGraphics.parent.removeChild(glowGraphics);
      }
      glowGraphics.destroy();
    }, 100);
  }

  protected updateVisuals(_deltaTime: number): void {
    // Only update if ledProps is initialized
    if (!this.ledProps) {
      console.log(
        `⚠️ LED ${this.name} - updateVisuals called but ledProps not initialized`
      );
      return;
    }

    // Update LED state based on current and voltage
    // Anode is node[0], cathode is node[1]
    const forwardBiased = this.nodes[0].voltage > this.nodes[1].voltage;
    const voltageDrop = this.nodes[0].voltage - this.nodes[1].voltage;
    const absCurrent = Math.abs(this.circuitProps.current);

    // LED turns on when forward biased and voltage exceeds forward voltage
    // Use absolute current to handle both current direction conventions
    const shouldTurnOn =
      forwardBiased &&
      voltageDrop >= this.ledProps.forwardVoltage &&
      absCurrent > 0.001; // 1mA threshold

    this.ledProps.isOn = shouldTurnOn;

    // Calculate brightness based on absolute current
    if (this.ledProps.isOn) {
      this.ledProps.brightness = Math.min(
        1.0,
        absCurrent / this.ledProps.maxCurrent
      );
      this.circuitProps.glowing = true;
    } else {
      this.ledProps.brightness = 0;
      this.circuitProps.glowing = false;
    }

    // Check for overcurrent (LED burning out) using absolute current
    if (absCurrent > this.ledProps.maxCurrent * 2) {
      this.circuitProps.burnt = true;
      this.ledProps.isOn = false;
      this.ledProps.brightness = 0;
      console.log(
        `⚠️ LED ${this.name} BURNT! Current: ${absCurrent.toFixed(4)}A exceeded ${(this.ledProps.maxCurrent * 2).toFixed(4)}A`
      );
    }

    // Redraw with updated state
    this.createVisuals();
    this.updateLabels();
  }

  private updateLabels(): void {
    // Component label
    this.labelText.text = this.name;
    this.labelText.style = {
      fontSize: 10,
      fill: 0xffffff,
      fontFamily: "Arial",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -30);

    // State and color info
    const isBurnt = this.circuitProps?.burnt ?? false;
    const isOn = this.ledProps?.isOn ?? false;
    const color = this.ledProps?.color ?? "red";
    const brightness = this.ledProps?.brightness ?? 0;

    let stateText: string;
    let textColor: number;

    if (isBurnt) {
      stateText = `${color.toUpperCase()} - BURNT!`;
      textColor = 0xff0000; // Red for burnt
    } else if (isOn) {
      stateText = `${color.toUpperCase()} ON (${Math.round(brightness * 100)}%)`;
      textColor = this.getLEDColor();
    } else {
      // Check if reverse biased
      const isReverseBiased =
        this.nodes[0].voltage < this.nodes[1].voltage &&
        Math.abs(this.circuitProps.current) > 0.001;
      if (isReverseBiased) {
        stateText = `${color.toUpperCase()} - REVERSED`;
        textColor = 0xffaa00; // Orange warning
      } else {
        stateText = `${color.toUpperCase()} OFF`;
        textColor = 0x888888;
      }
    }

    this.valueText.text = stateText;
    this.valueText.style = {
      fontSize: 8,
      fill: textColor,
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 30);
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -40, valueY: 40 };
  }

  protected updateNodePositions(): void {
    // Update node positions based on orientation
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    // Anode (left when orientation = 0)
    this.nodes[0].position.x = -25 * cos - 0 * sin;
    this.nodes[0].position.y = -25 * sin + 0 * cos;

    // Cathode (right when orientation = 0)
    this.nodes[1].position.x = 25 * cos - 0 * sin;
    this.nodes[1].position.y = 25 * sin + 0 * cos;
  }

  protected updateNodeVoltages(): void {
    // Node voltages are set by the circuit solver
    // We only need to update node currents here
    this.nodes[0].current = this.circuitProps.current;
    this.nodes[1].current = -this.circuitProps.current;
  }

  public getImpedance(_frequency: number = 0): number {
    const isBurnt = this.circuitProps?.burnt ?? false;
    if (isBurnt) {
      // Burnt LED acts as open circuit
      return 1e9; // 1GΩ
    }

    const isOn = this.ledProps?.isOn ?? false;
    if (isOn) {
      // When conducting, use the color-specific dynamic resistance
      return this.ledProps?.dynamicResistance ?? 25;
    } else {
      // When off, LED has very high resistance
      return 1e6; // 1MΩ
    }
  }

  public getForwardVoltage(): number {
    return this.ledProps?.forwardVoltage ?? 2.0;
  }

  public setColor(color: string): void {
    if (this.ledProps) {
      const spec = LED.getSpecForColor(color);
      this.ledProps.color = color;
      this.ledProps.forwardVoltage = spec.forwardVoltage;
      this.ledProps.maxCurrent = spec.maxCurrent;
      this.ledProps.dynamicResistance = spec.dynamicResistance;
      this.ledProps.wavelength = spec.wavelength;
      this.ledProps.value = spec.forwardVoltage;
      this.ledProps.powerRating = spec.forwardVoltage * spec.maxCurrent;

      // Reset burnt status when color changes
      this.circuitProps.burnt = false;
      this.ledProps.isOn = false;
      this.ledProps.brightness = 0;

      this.updateVisuals(0);
      console.log(
        `LED color changed to ${color} - Vf: ${spec.forwardVoltage}V, R: ${spec.dynamicResistance}Ω`
      );
    }
  }

  public getBrightness(): number {
    return this.ledProps?.brightness ?? 0;
  }

  public isLit(): boolean {
    return this.ledProps?.isOn ?? false;
  }

  public getWavelength(): number {
    return this.ledProps?.wavelength ?? 660;
  }

  public getLightOutput(): number {
    // Simplified light output calculation (lumens)
    const isOn = this.ledProps?.isOn ?? false;
    const brightness = this.ledProps?.brightness ?? 0;
    if (!isOn) return 0;

    const efficiency = 0.1; // 10% electrical to optical efficiency
    return this.circuitProps.power * efficiency * brightness;
  }
}
