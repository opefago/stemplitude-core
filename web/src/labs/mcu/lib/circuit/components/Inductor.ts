import { Graphics } from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface InductorProperties extends CircuitProperties {
  inductance: number; // Henries
  currentRating: number; // Maximum current (A)
  dcResistance: number; // DC resistance (Ohms)
  coreMaterial: string; // Core material
  flux: number; // Current magnetic flux (Wb)
}

export class Inductor extends CircuitComponent {
  protected inductorProps: InductorProperties;

  constructor(
    name: string,
    inductance: number = 1e-3, // 1mH default
    currentRating: number = 1, // 1A default
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: InductorProperties = {
      value: inductance,
      tolerance: 10, // 10% typical for inductors
      powerRating: 1, // 1W default
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      inductance,
      currentRating,
      dcResistance: 0.1, // 0.1Ω typical DC resistance
      coreMaterial: "ferrite",
      flux: 0,
      initialCondition: 0, // Initial current
    };

    super(name, "inductor", props, gridX, gridY);
    this.inductorProps = props as InductorProperties;
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

    // Enhanced inductor drawing with proper circuit symbol
    const width = 80;
    const height = 60;

    // Inductor outline - REMOVED dark fill for visibility on black canvas
    // this.componentGraphics.rect(-width / 2, -height / 2, width, height);
    // this.componentGraphics.fill(0x333333);

    // Inductor symbol (coil/spiral)
    // Draw continuous path with visual extension to compensate for stroke rendering
    this.componentGraphics.moveTo(-32, 0);
    this.componentGraphics.lineTo(-20, 0);

    // Coil loops (simplified as arcs)
    const numLoops = 4;
    const loopWidth = 40 / numLoops;

    for (let i = 0; i < numLoops; i++) {
      const x = -20 + i * loopWidth;
      this.componentGraphics.arc(
        x + loopWidth / 2,
        0,
        loopWidth / 2,
        Math.PI,
        0,
        false
      );
    }

    // Ensure we end at (20, 0) before drawing right lead (extend slightly beyond)
    this.componentGraphics.lineTo(20, 0);
    this.componentGraphics.lineTo(32, 0);
    this.componentGraphics.stroke({ width: 3, color: 0x44ffff });

    // Update text labels
    this.updateLabels();
  }

  protected updateVisuals(_deltaTime: number): void {
    // Update inductor visual state based on current and saturation
    if (this.circuitProps.burnt) {
      // Burnt inductor - black with red glow
      this.componentGraphics.tint = 0x000000;
    } else if (
      Math.abs(this.circuitProps.current) >
      this.inductorProps.currentRating * 0.9
    ) {
      // Near saturation - reddish tint
      this.componentGraphics.tint = 0xff8888;
    } else if (
      Math.abs(this.circuitProps.current) >
      this.inductorProps.currentRating * 0.7
    ) {
      // High current - orange tint
      this.componentGraphics.tint = 0xffaa88;
    } else {
      // Normal - no tint
      this.componentGraphics.tint = 0xffffff;
    }

    // Current flow animation
    if (Math.abs(this.circuitProps.current) > 0.001) {
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

    // Draw moving dots along the inductor coil
    for (let i = 0; i < 5; i++) {
      const progress = (i / 5 + animationOffset * flowDirection) % 1;
      const x = -20 + progress * 40; // Move along inductor body
      const y = Math.sin(progress * Math.PI * 4) * 5; // Sine wave to follow coil
      flowGraphics.drawCircle(x, y, 1);
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
      fill: 0xffffff,
      fontFamily: "Arial",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -25);

    // Value label
    this.valueText.text = this.getValueString();
    this.valueText.style = {
      fontSize: 8,
      fill: 0xcccccc,
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 25);
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -35, valueY: 35 };
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
    // For an inductor, voltage is L * di/dt
    // In steady state, inductor acts as short circuit (only DC resistance)
    const voltageDrop =
      this.circuitProps.current * this.inductorProps.dcResistance;

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
    if (frequency === 0) {
      // DC: only resistance
      return this.inductorProps.dcResistance;
    }
    // AC: Z = R + jωL
    const omega = 2 * Math.PI * frequency;
    const reactance = omega * this.inductorProps.inductance;
    return Math.sqrt(this.inductorProps.dcResistance ** 2 + reactance ** 2);
  }

  public getReactance(frequency: number): number {
    // XL = ωL
    const omega = 2 * Math.PI * frequency;
    return omega * this.inductorProps.inductance;
  }

  public simulateTimeStep(deltaTime: number, voltage: number): void {
    // For inductor: V = L * di/dt, so di = V * dt / L
    const deltaI = (voltage * deltaTime) / this.inductorProps.inductance;
    this.circuitProps.current += deltaI;

    // Update magnetic flux: Φ = L * I
    this.inductorProps.flux =
      this.inductorProps.inductance * this.circuitProps.current;

    // Update power: P = I * V
    this.circuitProps.power = Math.abs(this.circuitProps.current * voltage);

    // Check for saturation/burning
    if (
      Math.abs(this.circuitProps.current) > this.inductorProps.currentRating
    ) {
      this.circuitProps.burnt = true;
    }
  }

  public getInductance(): number {
    return this.inductorProps.inductance;
  }

  public setInductance(inductance: number): void {
    this.inductorProps.inductance = inductance;
    this.circuitProps.value = inductance;
    this.updateVisuals(0);
  }

  public getFlux(): number {
    return this.inductorProps.flux;
  }
}
