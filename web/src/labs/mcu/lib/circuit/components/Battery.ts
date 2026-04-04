import { Graphics, Text } from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

// Keep warnings/errors, silence verbose dev logs for this module.
const console = {
  ...globalThis.console,
  log: (..._args: unknown[]) => {},
};

export interface BatteryProperties extends CircuitProperties {
  voltage: number; // Terminal voltage (V)
  capacity: number; // Capacity in Ah
  internalResistance: number; // Internal resistance (Ohms)
  batteryType: string; // Battery chemistry
  chargeLevel: number; // Current charge level (0-1)
  isRechargeable: boolean;
}

export class Battery extends CircuitComponent {
  protected batteryProps: BatteryProperties;
  private plusLabel?: Text;
  private minusLabel?: Text;

  constructor(
    name: string,
    voltage: number = 9, // 9V default
    capacity: number = 0.5, // 500mAh default
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: BatteryProperties = {
      value: voltage,
      tolerance: 5, // 5% voltage tolerance
      powerRating: voltage * capacity, // Wh
      voltage: voltage,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      capacity,
      internalResistance: 0.1, // 0.1Ω typical
      batteryType: "alkaline",
      chargeLevel: 1.0, // Fully charged
      isRechargeable: false,
    };

    super(name, "battery", props, gridX, gridY);
    this.batteryProps = props as BatteryProperties;

    // Flip horizontally by default so positive terminal faces right
    this.flipHorizontal();
  }

  protected initializeNodes(): void {
    // Use circuitProps.value if batteryProps is not yet initialized
    const voltage = this.batteryProps?.voltage ?? this.circuitProps?.value ?? 9;

    this.nodes = [
      {
        id: "positive",
        position: { x: -25, y: 0 },
        voltage: voltage,
        current: 0,
        connections: [],
      },
      {
        id: "negative",
        position: { x: 25, y: 0 },
        voltage: 0, // Reference ground
        current: 0,
        connections: [],
      },
    ];
  }

  protected createVisuals(): void {
    this.componentGraphics.clear();

    // Enhanced battery drawing with proper circuit symbol
    const width = 80;
    const height = 60;

    // Battery outline - REMOVED dark fill for visibility on black canvas
    // this.componentGraphics.rect(-width / 2, -height / 2, width, height);
    // this.componentGraphics.fill(0x333333);

    // Battery symbol: two parallel lines of different lengths
    // Positive terminal (longer line) - bright red for visibility
    this.componentGraphics.moveTo(-10, -20);
    this.componentGraphics.lineTo(-10, 20);
    this.componentGraphics.stroke({ width: 4, color: 0xff6666 });

    // Negative terminal (shorter line) - light gray for visibility
    this.componentGraphics.moveTo(10, -15);
    this.componentGraphics.lineTo(10, 15);
    this.componentGraphics.stroke({ width: 4, color: 0xaaaaaa });

    // Terminal connections
    this.componentGraphics.moveTo(-25, 0);
    this.componentGraphics.lineTo(-10, 0);
    this.componentGraphics.moveTo(10, 0);
    this.componentGraphics.lineTo(25, 0);
    this.componentGraphics.stroke({ width: 2, color: 0xffffff });

    // Plus/minus symbols (create once, update positions)
    this.ensurePolarityLabels();

    // Battery charge level indicator
    this.drawChargeIndicator();

    // Update text labels
    this.updateLabels();
  }

  private ensurePolarityLabelsExist(): void {
    // Search for existing labels in the container (in case references were lost)
    let foundPlusLabel: Text | null = null;
    let foundMinusLabel: Text | null = null;

    for (const child of this.labelContainer.children) {
      if (child instanceof Text) {
        if (child.text === "+") {
          foundPlusLabel = child as Text;
        } else if (child.text === "-") {
          foundMinusLabel = child as Text;
        }
      }
    }

    // Restore or create plus label
    if (foundPlusLabel) {
      this.plusLabel = foundPlusLabel;
    } else {
      this.plusLabel = new Text("+", {
        fontFamily: "Arial",
        fontSize: 16,
        fontWeight: "bold",
        fill: 0xffffff,
      });
      this.plusLabel.anchor.set(0.5);
      this.labelContainer.addChild(this.plusLabel);
    }

    // Restore or create minus label
    if (foundMinusLabel) {
      this.minusLabel = foundMinusLabel;
    } else {
      this.minusLabel = new Text("-", {
        fontFamily: "Arial",
        fontSize: 16,
        fontWeight: "bold",
        fill: 0xffffff,
      });
      this.minusLabel.anchor.set(0.5);
      this.labelContainer.addChild(this.minusLabel);
    }
  }

  private ensurePolarityLabels(): void {
    // Ensure labels exist
    this.ensurePolarityLabelsExist();
    // Always update positions
    this.updatePolarityLabelPositions();
  }

  private updatePolarityLabelPositions(): void {
    // Ensure labels exist before updating positions
    if (!this.plusLabel || !this.minusLabel) {
      // Create labels if they don't exist yet
      this.ensurePolarityLabelsExist();
      if (!this.plusLabel || !this.minusLabel) {
        return;
      }
    }

    // Base positions (before transformation)
    const plusBasePos = { x: -25, y: -25 };
    const minusBasePos = { x: 25, y: -25 };

    // Apply flip if component is flipped
    const flipX = this.componentGraphics.scale.x < 0 ? -1 : 1;

    // Apply rotation
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    // Transform plus label position
    const plusFlippedX = plusBasePos.x * flipX;
    const plusX = plusFlippedX * cos - plusBasePos.y * sin;
    const plusY = plusFlippedX * sin + plusBasePos.y * cos;

    // Transform minus label position
    const minusFlippedX = minusBasePos.x * flipX;
    const minusX = minusFlippedX * cos - minusBasePos.y * sin;
    const minusY = minusFlippedX * sin + minusBasePos.y * cos;

    this.plusLabel.position.set(plusX, plusY);
    this.minusLabel.position.set(minusX, minusY);

    // Keep labels upright (counter-rotate)
    this.plusLabel.rotation = 0;
    this.minusLabel.rotation = 0;
  }

  private drawChargeIndicator(): void {
    // Battery charge level bar
    const chargeBarWidth = 30;
    const chargeBarHeight = 6;
    const chargeLevel = this.batteryProps?.chargeLevel ?? 1.0;

    // Background
    this.componentGraphics.rect(
      -chargeBarWidth / 2,
      25,
      chargeBarWidth,
      chargeBarHeight
    );
    this.componentGraphics.fill(0x444444);
    this.componentGraphics.stroke({ width: 1, color: 0x888888 });

    // Charge level fill
    const fillWidth = chargeBarWidth * chargeLevel;
    let fillColor = 0x00ff00; // Green (full)

    if (chargeLevel < 0.2) {
      fillColor = 0xff0000; // Red (low)
    } else if (chargeLevel < 0.5) {
      fillColor = 0xffff00; // Yellow (medium)
    }

    this.componentGraphics.rect(
      -chargeBarWidth / 2,
      25,
      fillWidth,
      chargeBarHeight
    );
    this.componentGraphics.fill(fillColor);
  }

  protected updateVisuals(_deltaTime: number): void {
    // Only update if batteryProps is initialized
    if (!this.batteryProps) return;

    // Update battery state based on usage
    if (this.circuitProps.current > 0) {
      // Discharging - reduce charge level over time
      const dischargeRate =
        this.circuitProps.current / this.batteryProps.capacity;
      this.batteryProps.chargeLevel = Math.max(
        0,
        this.batteryProps.chargeLevel - dischargeRate * 0.001 // Slow discharge for demo
      );
    }

    // Update terminal voltage based on charge level and load
    const loadVoltage =
      this.circuitProps.current * this.batteryProps.internalResistance;
    this.circuitProps.voltage =
      this.batteryProps.voltage * this.batteryProps.chargeLevel - loadVoltage;

    // Visual feedback for battery state
    if (this.batteryProps.chargeLevel < 0.1) {
      // Nearly dead battery
      this.componentGraphics.tint = 0x888888;
    } else {
      this.componentGraphics.tint = 0xffffff;
    }

    // Redraw charge indicator
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
    this.labelText.position.set(0, -35);

    // Voltage and charge level
    const chargePercent = Math.round(
      (this.batteryProps?.chargeLevel ?? 1.0) * 100
    );
    const voltage = this.batteryProps?.voltage ?? this.circuitProps?.value ?? 9;
    const vDisp =
      typeof voltage === "number" && Number.isFinite(voltage)
        ? voltage.toFixed(2)
        : String(voltage);
    this.valueText.text = `${vDisp}V (${chargePercent}%)`;
    this.valueText.style = {
      fontSize: 8,
      fill: 0xcccccc,
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 35);
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -45, valueY: 45 };
  }

  protected updateNodePositions(): void {
    // Base positions (before transformation)
    const basePositions = [
      { x: -25, y: 0 }, // Positive terminal (left)
      { x: 25, y: 0 }, // Negative terminal (right)
    ];

    // Apply flip if component is flipped
    const flipX = this.componentGraphics.scale.x < 0 ? -1 : 1;

    // Apply rotation
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    basePositions.forEach((basePos, i) => {
      const flippedX = basePos.x * flipX;
      this.nodes[i].position.x = flippedX * cos - basePos.y * sin;
      this.nodes[i].position.y = flippedX * sin + basePos.y * cos;
    });

    // Update polarity label positions
    this.updatePolarityLabelPositions();
  }

  protected updateNodeVoltages(): void {
    // Battery maintains voltage difference between terminals
    const voltage = this.batteryProps?.voltage ?? this.circuitProps?.value ?? 9;
    const chargeLevel = this.batteryProps?.chargeLevel ?? 1.0;
    const internalResistance = this.batteryProps?.internalResistance ?? 0.1;

    const terminalVoltage = voltage * chargeLevel;
    const voltageDropInternal = this.circuitProps.current * internalResistance;

    // Positive terminal
    this.nodes[0].voltage = terminalVoltage - voltageDropInternal;

    // Negative terminal (reference)
    this.nodes[1].voltage = 0;

    // Update node currents (current flows out of positive, into negative)
    this.nodes[0].current = -this.circuitProps.current; // Current flows out
    this.nodes[1].current = this.circuitProps.current; // Current flows in
  }

  public getImpedance(_frequency: number = 0): number {
    // Battery impedance is just internal resistance
    return this.batteryProps?.internalResistance ?? 0.1;
  }

  public getVoltage(): number {
    const voltage = this.batteryProps?.voltage ?? this.circuitProps?.value ?? 9;
    const chargeLevel = this.batteryProps?.chargeLevel ?? 1.0;
    return voltage * chargeLevel;
  }

  public setVoltage(voltage: number): void {
    if (this.batteryProps) {
      this.batteryProps.voltage = voltage;
    }
    this.circuitProps.value = voltage;
    this.updateVisuals(0);
  }

  public getChargeLevel(): number {
    return this.batteryProps?.chargeLevel ?? 1.0;
  }

  public setChargeLevel(level: number): void {
    if (this.batteryProps) {
      this.batteryProps.chargeLevel = Math.max(0, Math.min(1, level));
      this.updateVisuals(0);
    }
  }

  public getCapacity(): number {
    return this.batteryProps?.capacity ?? 0.5;
  }

  public isFullyDischarged(): boolean {
    return (this.batteryProps?.chargeLevel ?? 1.0) < 0.01;
  }

  public recharge(): void {
    if (this.batteryProps?.isRechargeable) {
      this.batteryProps.chargeLevel = 1.0;
      this.updateVisuals(0);
    }
  }
}
