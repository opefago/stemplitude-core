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

    // Enhanced resistor drawing from reference implementation
    const width = 80;
    const height = 60;

    // Resistor outline - REMOVED dark fill for visibility on black canvas
    // this.componentGraphics.rect(-width / 2, -height / 2, width, height);
    // this.componentGraphics.fill(0x333333);

    // Draw continuous path with visual extension to compensate for stroke rendering
    // Extend slightly beyond node positions so stroke visually reaches the nodes
    this.componentGraphics.moveTo(-32, 0);

    // Zigzag pattern points (resistor body)
    this.componentGraphics.lineTo(-20, 0);
    this.componentGraphics.lineTo(-15, -10);
    this.componentGraphics.lineTo(-5, 10);
    this.componentGraphics.lineTo(0, -10);
    this.componentGraphics.lineTo(5, 10);
    this.componentGraphics.lineTo(15, -10);
    this.componentGraphics.lineTo(20, 0);

    // Right lead to node (extend slightly beyond)
    this.componentGraphics.lineTo(32, 0);
    this.componentGraphics.stroke({ width: 3, color: 0x44ff44 });

    // Update text labels
    this.updateLabels();
  }

  protected updateVisuals(deltaTime: number): void {
    // Update resistor color based on power dissipation and burn state
    let color = 0x8b4513; // Brown (normal)

    if (this.circuitProps.burnt) {
      // Burnt resistor - black with red glow
      color = 0x000000;
      this.componentGraphics.tint = 0x000000;

      if (this.burnAnimation > 0) {
        // Add red glow effect during burn animation
        this.componentGraphics.filters = []; // Add glow filter if available
      }
    } else if (this.circuitProps.power > this.circuitProps.powerRating * 0.8) {
      // High power - getting hot (reddish)
      color = 0xcd853f;
    } else if (this.circuitProps.power > this.circuitProps.powerRating * 0.5) {
      // Medium power - warm (darker brown)
      color = 0xa0522d;
    }

    // Current flow animation
    if (
      this.currentFlowAnimation > 0 &&
      Math.abs(this.circuitProps.current) > 0.001
    ) {
      // Add current flow visualization (moving dots or glow)
      this.drawCurrentFlow();
    }

    this.updateLabels();
  }

  private drawCurrentFlow(): void {
    // Draw animated current flow indicators
    const flowGraphics = new Graphics();
    flowGraphics.beginFill(0x00ffff, 0.6);

    // Calculate flow direction based on current sign
    const flowDirection = this.circuitProps.current > 0 ? 1 : -1;
    const animationOffset = (Date.now() / 200) % 1; // 200ms cycle

    // Draw moving dots along the resistor
    for (let i = 0; i < 3; i++) {
      const progress = (i / 3 + animationOffset * flowDirection) % 1;
      const x = -20 + progress * 40; // Move along resistor body
      flowGraphics.drawCircle(x, 0, 1);
    }

    flowGraphics.endFill();
    this.displayContainer.addChild(flowGraphics);

    // Remove after animation frame
    setTimeout(() => {
      if (flowGraphics.parent) {
        flowGraphics.parent.removeChild(flowGraphics);
      }
      flowGraphics.destroy();
    }, 16); // ~60fps
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

  public getImpedance(frequency: number = 0): number {
    // Pure resistance - frequency independent
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
