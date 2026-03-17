import { Graphics } from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface GroundProperties extends CircuitProperties {
  groundType: string; // earth, chassis, signal, etc.
  impedance: number; // Ground impedance (should be very low)
}

export class Ground extends CircuitComponent {
  protected groundProps: GroundProperties;

  constructor(
    name: string,
    groundType: string = "earth",
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: GroundProperties = {
      value: 0, // Ground is 0V reference
      tolerance: 0, // Perfect reference
      powerRating: 1000, // Ground can handle high power
      voltage: 0, // Always 0V
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      groundType,
      impedance: 0.001, // Very low impedance
    };

    super(name, "ground", props, gridX, gridY);
    this.groundProps = props as GroundProperties;
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "ground",
        position: { x: 0, y: -10 },
        voltage: 0, // Always 0V
        current: 0,
        connections: [],
      },
    ];
  }

  protected createVisuals(): void {
    this.componentGraphics.clear();

    // Enhanced ground drawing with proper circuit symbol
    const width = 60;
    const height = 60;

    // Ground outline - REMOVED dark fill for visibility on black canvas
    // this.componentGraphics.rect(-width / 2, -height / 2, width, height);
    // this.componentGraphics.fill(0x333333);

    // Ground symbol: three horizontal lines decreasing in length - bright colors for visibility
    const lineColors = [0xdddddd, 0xcccccc, 0xbbbbbb];
    const lineWidths = [20, 15, 10];
    const lineYPositions = [5, 10, 15];

    // Connection line from top
    this.componentGraphics.moveTo(0, -10);
    this.componentGraphics.lineTo(0, 5);
    this.componentGraphics.stroke({ width: 2, color: 0xffffff });

    // Ground lines
    for (let i = 0; i < 3; i++) {
      this.componentGraphics.moveTo(-lineWidths[i] / 2, lineYPositions[i]);
      this.componentGraphics.lineTo(lineWidths[i] / 2, lineYPositions[i]);
      this.componentGraphics.stroke({ width: 3, color: lineColors[i] });
    }

    // Ground type indicator
    this.drawGroundTypeIndicator();

    // Update text labels
    this.updateLabels();
  }

  private drawGroundTypeIndicator(): void {
    // Different ground types have different symbols
    const groundType = this.groundProps?.groundType ?? "earth";
    switch (groundType.toLowerCase()) {
      case "earth":
        // Earth ground - add small triangles below
        for (let i = 0; i < 3; i++) {
          const x = (i - 1) * 8;
          this.componentGraphics.moveTo(x - 3, 18);
          this.componentGraphics.lineTo(x, 22);
          this.componentGraphics.lineTo(x + 3, 18);
          this.componentGraphics.stroke({ width: 1, color: 0x666666 });
        }
        break;

      case "chassis":
        // Chassis ground - add filled rectangle
        this.componentGraphics.rect(-8, 18, 16, 4);
        this.componentGraphics.fill(0x666666);
        this.componentGraphics.stroke({ width: 1, color: 0x888888 });
        break;

      case "signal":
        // Signal ground - add small circle
        this.componentGraphics.circle(0, 20, 3);
        this.componentGraphics.fill(0x666666);
        this.componentGraphics.stroke({ width: 1, color: 0x888888 });
        break;
    }
  }

  protected updateVisuals(_deltaTime: number): void {
    // Ground doesn't change visually, but we can show current flow
    if (Math.abs(this.circuitProps.current) > 0.001) {
      this.drawCurrentFlow();
    }

    this.updateLabels();
  }

  private drawCurrentFlow(): void {
    // Show current flowing into ground with animated dots
    const flowGraphics = new Graphics();

    const animationOffset = (Date.now() / 300) % 1;

    // Draw dots flowing down into ground
    for (let i = 0; i < 3; i++) {
      const progress = (i / 3 + animationOffset) % 1;
      const y = -10 + progress * 15; // Flow from connection to ground lines

      if (y <= 5) {
        // Only show dots above ground symbol
        flowGraphics.circle(0, y, 1);
        flowGraphics.fill({ color: 0x00ffff, alpha: 0.6 });
      }
    }
    this.displayContainer.addChild(flowGraphics);

    // Remove after animation frame
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
      fill: 0xffffff,
      fontFamily: "Arial",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -25);

    // Ground type and current
    const currentText =
      Math.abs(this.circuitProps.current) > 0.001
        ? ` (${(this.circuitProps.current * 1000).toFixed(1)}mA)`
        : "";

    const groundType = this.groundProps?.groundType ?? "earth";
    this.valueText.text = `${groundType.toUpperCase()} GND${currentText}`;
    this.valueText.style = {
      fontSize: 8,
      fill: 0x888888,
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 30);
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -35, valueY: 40 };
  }

  protected updateNodePositions(): void {
    // Ground node position (always at top of symbol)
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    // Update relative to component center
    this.nodes[0].position.x = 0 * cos - -10 * sin;
    this.nodes[0].position.y = 0 * sin + -10 * cos;
  }

  protected updateNodeVoltages(): void {
    // Ground is always 0V reference
    this.nodes[0].voltage = 0;
    this.circuitProps.voltage = 0;

    // Ground can sink/source any current
    this.nodes[0].current = this.circuitProps.current;
  }

  public getImpedance(_frequency: number = 0): number {
    // Ground has very low impedance
    return this.groundProps?.impedance ?? 0.001;
  }

  public getGroundType(): string {
    return this.groundProps?.groundType ?? "earth";
  }

  public setGroundType(type: string): void {
    if (this.groundProps) {
      this.groundProps.groundType = type;
      this.createVisuals();
    }
  }

  public isGroundNode(nodeId: string): boolean {
    return nodeId === "ground";
  }

  // Ground-specific methods
  public getGroundVoltage(): number {
    return 0; // Always 0V
  }

  public canSinkCurrent(current: number): boolean {
    // Ground can theoretically sink infinite current
    // In practice, limited by circuit protection
    return Math.abs(current) < 100; // 100A limit for safety
  }

  public getTotalGroundCurrent(): number {
    // Sum of all currents flowing into this ground node
    return this.circuitProps.current;
  }
}
