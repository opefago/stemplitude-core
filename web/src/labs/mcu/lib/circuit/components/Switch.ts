import * as PIXI from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";
import {
  applyIECSchematicTransform,
  drawSwitchSPSTIEC,
} from "../rendering/iecSchematicDraw";

export interface SwitchProperties extends CircuitProperties {
  isClosed: boolean;
}

/**
 * Switch component - Can be opened or closed by clicking
 * Closed: Acts like a wire (very low resistance)
 * Open: Acts like open circuit (infinite resistance)
 */
export class Switch extends CircuitComponent {
  protected switchProps: SwitchProperties;
  private isClosed: boolean = true;

  constructor(
    name: string,
    isClosed: boolean = true,
    gridX: number = 0,
    gridY: number = 0
  ) {
    const props: SwitchProperties = {
      value: isClosed ? 0.001 : 1e15, // 1mΩ when closed; open must track solver SPST_R_OFF
      resistance: isClosed ? 0.001 : 1e15,
      tolerance: 0,
      powerRating: 100,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      isClosed: isClosed,
    };

    super(name, "switch", props, gridX, gridY);
    this.switchProps = props as SwitchProperties;
    this.isClosed = isClosed;
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "terminal1",
        position: { x: -30, y: 0 }, // Relative to component center
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "terminal2",
        position: { x: 30, y: 0 }, // Relative to component center
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -35, valueY: 30 };
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

  protected getTerminalPinRadius(): number {
    return 5;
  }

  protected createVisuals(): void {
    this.drawSwitch();
    this.updateLabels();
    this.componentGraphics.eventMode = "static";
    this.componentGraphics.cursor = "pointer";
  }

  private drawSwitch(): void {
    const g = this.componentGraphics;
    g.clear();
    drawSwitchSPSTIEC(g, this.isClosed);
    applyIECSchematicTransform(g, Math.sign(g.scale.x) || 1);
    g.hitArea = new PIXI.Rectangle(0, 0, 150, 150);
    g.tint = this.isClosed ? 0xaaffaa : 0xffaaaa;
  }

  private updateLabels(): void {
    // Component label (name)
    this.labelText.text = this.name;
    this.labelText.style = {
      fontSize: 12,
      fill: 0xffffff,
      fontFamily: "Arial",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -35);

    // Value label (state)
    const stateText = this.isClosed ? "CLOSED" : "OPEN";
    this.valueText.text = stateText;
    this.valueText.style = {
      fontSize: 10,
      fill: this.isClosed ? 0x00ff00 : 0xff0000,
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 30);
  }

  /**
   * Toggle switch state (open/close)
   */
  public toggleSwitch(): void {
    this.isClosed = !this.isClosed;
    this.switchProps.isClosed = this.isClosed;

    // Update resistance based on state
    if (this.isClosed) {
      this.switchProps.resistance = 0.001; // 1mΩ (closed)
      this.switchProps.value = 0.001;
    } else {
      this.switchProps.resistance = 1e15;
      this.switchProps.value = 1e15;
    }

    // Update visuals
    this.drawSwitch();

    // Update labels
    this.updateLabels();

    // Emit state change event for circuit recalculation
    const event = new CustomEvent("switch-state-changed", {
      detail: { componentId: this.name, isClosed: this.isClosed },
    });
    window.dispatchEvent(event);
  }

  /**
   * Get switch state
   */
  public getIsClosed(): boolean {
    return this.isClosed;
  }

  /**
   * Set switch state programmatically
   */
  public setState(closed: boolean): void {
    if (this.isClosed !== closed) {
      this.toggleSwitch();
    }
  }

  public getCircuitProperties() {
    return {
      ...super.getCircuitProperties(),
      isClosed: this.isClosed,
      resistance: this.switchProps.resistance,
    };
  }

  public updateCircuitState(voltage: number, current: number): void {
    super.updateCircuitState(voltage, current);
    // Switches don't need visual updates based on voltage/current
  }

  protected updateNodeVoltages(): void {
    // Keep terminal-current convention consistent with passive 2-terminal components:
    // positive current enters terminal1 from wire, exits terminal2.
    this.nodes[0].current = this.circuitProps.current;
    this.nodes[1].current = -this.circuitProps.current;
  }

  protected updateVisuals(_deltaTime: number): void {
    // Switches don't have animated visual updates based on circuit state
    // Visual updates are handled by toggleSwitch() when user clicks
  }
}
