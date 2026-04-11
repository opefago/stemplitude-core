import * as PIXI from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";
import { BJT_SVG_PIVOT, BJT_SVG_SCALE } from "../rendering/bjtSchematicSvg";
import { drawLedIEC } from "../rendering/ledSchematicDraw";

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

type LEDGlowLayerMode = "behindSymbol" | "overSymbol";

export class LED extends CircuitComponent {
  protected ledProps: LEDProperties;
  private overstressSamples: number = 0;
  private glowBackLayer: PIXI.Graphics | null = null;
  private glowFrontLayer: PIXI.Graphics | null = null;
  private glowLayerMode: LEDGlowLayerMode = "overSymbol";

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
        position: { x: -30, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "cathode",
        position: { x: 30, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected getTerminalPinRadius(): number {
    return 5;
  }

  /** Arrowhead fill from LED color and brightness (IEC symbol photon arrows). */
  private getArrowFillColor(): number {
    const isBurnt = this.circuitProps?.burnt ?? false;
    const isOn = this.ledProps?.isOn ?? false;
    const brightness = this.ledProps?.brightness ?? 0;

    if (isBurnt) {
      return 0x1a1a1a;
    }
    if (!isOn) {
      return 0x333333;
    }

    const baseColor = this.getLEDColor();
    const baseR = (baseColor >> 16) & 0xff;
    const baseG = (baseColor >> 8) & 0xff;
    const baseB = baseColor & 0xff;
    const darkR = Math.floor(baseR * 0.2);
    const darkG = Math.floor(baseG * 0.2);
    const darkB = Math.floor(baseB * 0.2);
    const r = darkR + (baseR - darkR) * brightness;
    const g = darkG + (baseG - darkG) * brightness;
    const b = darkB + (baseB - darkB) * brightness;
    return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
  }

  protected createVisuals(): void {
    const g = this.componentGraphics;
    g.clear();
    const glowBack = this.ensureGlowLayer("back");
    const glowFront = this.ensureGlowLayer("front");
    glowBack.clear();
    glowFront.clear();

    const isBurnt = this.circuitProps?.burnt ?? false;
    const isOn = this.ledProps?.isOn ?? false;
    const brightness = this.ledProps?.brightness ?? 0;

    drawLedIEC(g, {
      arrowFill: this.getArrowFillColor(),
      burnt: isBurnt,
    });

    if (isBurnt) {
      g.moveTo(55, 55);
      g.lineTo(95, 95);
      g.moveTo(55, 95);
      g.lineTo(95, 55);
      g.stroke({
        width: 10,
        color: 0xff0000,
        cap: "round",
        join: "round",
      });
    }

    if (isOn && !isBurnt && brightness > 0.01) {
      if (this.glowLayerMode === "behindSymbol") {
        this.drawGlowEffect(glowBack);
        this.drawLightRays(glowFront);
      } else {
        this.drawGlowEffect(glowFront);
        this.drawLightRays(glowFront);
      }
    }

    g.pivot.set(BJT_SVG_PIVOT, BJT_SVG_PIVOT);
    const flipSign = Math.sign(g.scale.x) || 1;
    g.scale.set(flipSign * BJT_SVG_SCALE, BJT_SVG_SCALE);
    g.hitArea = new PIXI.Rectangle(0, 0, 150, 150);

    // Keep glow layers perfectly aligned when LED rotates/flips/scales.
    glowBack.pivot.copyFrom(g.pivot);
    glowBack.position.copyFrom(g.position);
    glowBack.rotation = g.rotation;
    glowBack.scale.copyFrom(g.scale);
    glowFront.pivot.copyFrom(g.pivot);
    glowFront.position.copyFrom(g.position);
    glowFront.rotation = g.rotation;
    glowFront.scale.copyFrom(g.scale);

    // Ensure the front glow renders above everything else in this component.
    if (glowFront.parent === this.displayContainer) {
      this.displayContainer.setChildIndex(
        glowFront,
        this.displayContainer.children.length - 1,
      );
    }

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

  /** Rays in IEC SVG space (0–150), emission toward upper-right like Diode-COM-LED.svg */
  private drawLightRays(target: PIXI.Graphics): void {
    const rayColor = this.getLEDColor();
    const b = this.ledProps?.brightness ?? 0;
    const startX = 118;
    const startY = 62;
    const t = Date.now() * 0.003;

    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 4 + (i - 2) * 0.22;
      const shimmer = 0.85 + 0.15 * Math.sin(t + i * 1.7);
      const len = (24 + 14 * b) * shimmer;
      const endX = startX + len * Math.cos(angle);
      const endY = startY + len * Math.sin(angle);

      // Thick soft glow ray
      target.moveTo(startX, startY);
      target.lineTo(endX, endY);
      target.stroke({ width: 6, color: rayColor, alpha: 0.15 * b * shimmer });

      // Thin bright core ray
      target.moveTo(startX, startY);
      target.lineTo(endX, endY);
      target.stroke({ width: 2.5, color: 0xffffff, alpha: (0.3 + 0.5 * b) * shimmer });

      // Arrowhead
      const arrowAngle = Math.atan2(endY - startY, endX - startX);
      const as = 5;
      target.moveTo(endX, endY);
      target.lineTo(endX - as * Math.cos(arrowAngle - 0.5), endY - as * Math.sin(arrowAngle - 0.5));
      target.moveTo(endX, endY);
      target.lineTo(endX - as * Math.cos(arrowAngle + 0.5), endY - as * Math.sin(arrowAngle + 0.5));
      target.stroke({ width: 2, color: rayColor, alpha: (0.4 + 0.5 * b) * shimmer });
    }
  }

  /** Vivid bloom + shimmer glow around the LED body. */
  private drawGlowEffect(target: PIXI.Graphics): void {
    const glowColor = this.getLEDColor();
    const b = this.ledProps?.brightness ?? 0;
    const t = Date.now() * 0.004;
    const pulse = 0.9 + 0.1 * Math.sin(t);
    const cx = 75;
    const cy = 75;

    // Outer soft aura — wide halo
    const auraLayers = [
      { radius: 120, alpha: 0.06 },
      { radius: 96, alpha: 0.10 },
      { radius: 78, alpha: 0.16 },
      { radius: 60, alpha: 0.24 },
      { radius: 46, alpha: 0.35 },
      { radius: 34, alpha: 0.50 },
      { radius: 24, alpha: 0.65 },
    ];

    for (const layer of auraLayers) {
      target.circle(cx, cy, layer.radius * pulse);
      target.fill({ color: glowColor, alpha: layer.alpha * b });
    }

    // Saturated color pool — the main visible glow body
    target.circle(cx, cy, 44 + 12 * b * pulse);
    target.fill({ color: glowColor, alpha: 0.5 + 0.35 * b });

    // Hot white-ish core — the "filament" shine
    target.circle(cx, cy, 18 + 10 * b * pulse);
    target.fill({ color: glowColor, alpha: 0.75 * b });
    target.circle(cx, cy, 8 + 5 * b * pulse);
    target.fill({ color: 0xffffff, alpha: 0.55 + 0.4 * b });
    target.circle(cx, cy, 3 + 2 * b);
    target.fill({ color: 0xffffff, alpha: 0.8 * b });

    // Shiny halo ring
    target.circle(cx, cy, 38 + 8 * b * pulse);
    target.stroke({ width: 4, color: glowColor, alpha: 0.5 + 0.4 * b });

    // Outer shimmer ring
    const shimmer = 0.7 + 0.3 * Math.sin(t * 1.5);
    target.circle(cx, cy, 56 + 6 * b * pulse);
    target.stroke({ width: 2, color: 0xffffff, alpha: 0.15 * b * shimmer });
  }

  private ensureGlowLayer(position: "back" | "front"): PIXI.Graphics {
    const existing = position === "back" ? this.glowBackLayer : this.glowFrontLayer;
    if (existing) return existing;

    const layer = new PIXI.Graphics();
    layer.eventMode = "none";
    layer.blendMode = "screen" as any;
    const componentIndex = this.displayContainer.getChildIndex(this.componentGraphics);
    if (position === "back") {
      this.displayContainer.addChildAt(layer, Math.max(0, componentIndex));
      this.glowBackLayer = layer;
    } else {
      this.displayContainer.addChild(layer);
      this.glowFrontLayer = layer;
    }
    return layer;
  }

  public setGlowLayerMode(mode: LEDGlowLayerMode): void {
    this.glowLayerMode = mode;
    this.updateVisuals(0);
  }

  protected updateVisuals(_deltaTime: number): void {
    // Only update if ledProps is initialized
    if (!this.ledProps) {
      console.log(
        `⚠️ LED ${this.name} - updateVisuals called but ledProps not initialized`
      );
      return;
    }

    // Check for overcurrent (LED burning out) using absolute current
    const absCurrent = Math.abs(this.circuitProps.current);
    const voltageDrop = this.nodes[0].voltage - this.nodes[1].voltage;
    const forwardBiased = voltageDrop > 0;
    const reverseVoltage = Math.max(0, -voltageDrop);
    const junctionPower = Math.abs(voltageDrop) * absCurrent;
    const overstressed =
      (forwardBiased &&
        absCurrent > this.ledProps.maxCurrent * 2.5 &&
        junctionPower >
          this.ledProps.forwardVoltage * this.ledProps.maxCurrent * 2.2) ||
      (!forwardBiased &&
        reverseVoltage > 5.5 &&
        absCurrent > this.ledProps.maxCurrent * 0.75);
    this.overstressSamples = overstressed ? this.overstressSamples + 1 : 0;
    if (!this.circuitProps.burnt && this.overstressSamples >= 20) {
      this.circuitProps.burnt = true;
      // Overstress-triggered burnout bypasses CircuitComponent.updateCircuitState,
      // so explicitly start burn smoke/animation here.
      this.startBurnAnimation();
      console.log(
        `⚠️ LED ${this.name} BURNT! Sustained overstress detected. I=${absCurrent.toFixed(4)}A`
      );
    }
    // A burnt LED is an open circuit — no conduction regardless of bias
    if (this.circuitProps.burnt) {
      this.ledProps.isOn = false;
      this.ledProps.brightness = 0;
      this.circuitProps.glowing = false;
      (this.circuitProps as Record<string, unknown>).isForwardBiased = false;
      (this.circuitProps as Record<string, unknown>).isConducting = false;
    } else {
      const shouldTurnOn =
        forwardBiased &&
        voltageDrop >= this.ledProps.forwardVoltage &&
        absCurrent > 0.001;

      this.ledProps.isOn = shouldTurnOn;
      (this.circuitProps as Record<string, unknown>).isForwardBiased = forwardBiased;
      (this.circuitProps as Record<string, unknown>).isConducting = shouldTurnOn;

      if (shouldTurnOn) {
        this.ledProps.brightness = Math.min(1.0, absCurrent / this.ledProps.maxCurrent);
        this.circuitProps.glowing = true;
      } else {
        this.ledProps.brightness = 0;
        this.circuitProps.glowing = false;
      }
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

    this.nodes[0].position.x = -30 * cos;
    this.nodes[0].position.y = -30 * sin;

    this.nodes[1].position.x = 30 * cos;
    this.nodes[1].position.y = 30 * sin;
  }

  protected updateNodeVoltages(): void {
    // Node voltages are set by the circuit solver.
    // Convention used across passive devices:
    // positive terminal current = enters component from wire.
    // For forward LED current (anode -> cathode), anode enters (+), cathode exits (-).
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
