import * as PIXI from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";
import {
  applyIECSchematicTransform,
  drawPushButtonIEC,
} from "../rendering/iecSchematicDraw";

export interface PushButtonProperties extends CircuitProperties {
  isPressed: boolean;
  normallyClosed: boolean;
  isClosed: boolean;
}

/**
 * Momentary push button.
 * Default behavior is normally-open:
 * - pressed => closed circuit
 * - released => open circuit
 */
export class PushButton extends CircuitComponent {
  /** Same object as `circuitProps` (assigned in `super`); avoids undefined during `createVisuals` in `super`. */
  protected get buttonProps(): PushButtonProperties {
    return this.circuitProps as PushButtonProperties;
  }

  constructor(
    name: string,
    normallyClosed: boolean = false,
    gridX: number = 0,
    gridY: number = 0
  ) {
    const initialClosed = normallyClosed;
    const props: PushButtonProperties = {
      value: initialClosed ? 0.001 : 1e15,
      resistance: initialClosed ? 0.001 : 1e15,
      tolerance: 0,
      powerRating: 100,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      isPressed: false,
      normallyClosed,
      isClosed: initialClosed,
    };

    super(name, "push_button", props, gridX, gridY);
    this.syncElectricalState();
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

  protected updateNodePositions(): void {
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);
    this.nodes[0].position.x = -30 * cos;
    this.nodes[0].position.y = -30 * sin;
    this.nodes[1].position.x = 30 * cos;
    this.nodes[1].position.y = 30 * sin;
  }

  protected getTerminalPinRadius(): number {
    return 5;
  }

  protected createVisuals(): void {
    const g = this.componentGraphics;
    g.clear();
    const nc = this.buttonProps?.normallyClosed ?? false;
    const closed = this.buttonProps?.isClosed ?? false;
    drawPushButtonIEC(g, nc, closed);
    applyIECSchematicTransform(g, Math.sign(g.scale.x) || 1);
    g.hitArea = new PIXI.Rectangle(0, 0, 150, 150);
    const isClosed = this.buttonProps?.isClosed ?? false;
    const pressed = this.buttonProps?.isPressed ?? false;
    g.tint = isClosed ? 0xaaffaa : 0xffcc88;
    if (pressed) {
      g.tint = 0x88ccff;
    }
    this.updateLabels();
  }

  protected updateVisuals(_deltaTime: number): void {
    // Visuals are controlled by pressed/released state.
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -35, valueY: 30 };
  }

  private updateLabels(): void {
    const pressed = this.buttonProps?.isPressed ?? false;
    this.labelText.text = this.name;
    this.labelText.style = {
      fontSize: 10,
      fill: 0xffffff,
      fontFamily: "Arial",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -35);

    this.valueText.text = pressed ? "PRESSED" : "RELEASED";
    this.valueText.style = {
      fontSize: 9,
      fill: pressed ? 0x44aaff : 0xffaa66,
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 30);
  }

  private syncElectricalState(): void {
    const pressed = this.buttonProps?.isPressed ?? false;
    const normallyClosed = this.buttonProps?.normallyClosed ?? false;
    // NO button: closed while pressed; NC button: closed while released.
    const closed = normallyClosed ? !pressed : pressed;
    this.buttonProps.isClosed = closed;
    this.buttonProps.value = closed ? 0.001 : 1e15;
    this.buttonProps.resistance = closed ? 0.001 : 1e15;
    this.createVisuals();
    this.emitStateChanged(closed);
  }

  private emitStateChanged(isClosed: boolean): void {
    window.dispatchEvent(
      new CustomEvent("switch-state-changed", {
        detail: { componentId: this.name, isClosed },
      })
    );
  }

  public pressButton(): void {
    if (this.buttonProps?.isPressed) return;
    this.buttonProps.isPressed = true;
    this.syncElectricalState();
  }

  public releaseButton(): void {
    if (!this.buttonProps?.isPressed) return;
    this.buttonProps.isPressed = false;
    this.syncElectricalState();
  }

  // Keep compatibility with generic "toggle" UI flows
  public toggleSwitch(): void {
    if (this.buttonProps?.isPressed) this.releaseButton();
    else this.pressButton();
  }

  public getCircuitProperties() {
    return {
      ...super.getCircuitProperties(),
      isPressed: this.buttonProps?.isPressed ?? false,
      isClosed: this.buttonProps?.isClosed ?? false,
      resistance: this.buttonProps.resistance,
    };
  }

  protected updateNodeVoltages(): void {
    // Same terminal-current convention as other passive 2-terminal components.
    this.nodes[0].current = this.circuitProps.current;
    this.nodes[1].current = -this.circuitProps.current;
  }
}

