import { Container, Graphics, Text } from "pixi.js";
import GameObject from "../shared/GameObject";

/**
 * Simple browser-compatible event emitter
 */
class SimpleEventEmitter {
  private listeners: Map<string, Function[]> = new Map();

  emit(event: string, ...args: any[]): boolean {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners || eventListeners.length === 0) {
      return false;
    }

    eventListeners.forEach((listener) => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in event listener for "${event}":`, error);
      }
    });

    return true;
  }

  on(event: string, listener: Function): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    return this;
  }

  off(event: string, listener: Function): this {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
    return this;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}

export type CircuitComponentType =
  | "resistor"
  | "capacitor"
  | "inductor"
  | "battery"
  | "acsource"
  | "led"
  | "transistor"
  | "npn_transistor"
  | "pnp_transistor"
  | "ground"
  | "wire"
  | "switch"
  | "ammeter"
  | "voltmeter"
  | "oscilloscope"
  | "and_gate"
  | "or_gate"
  | "xor_gate"
  | "not_gate";

export interface CircuitNode {
  id: string;
  position: { x: number; y: number };
  voltage: number;
  current: number;
  connections: string[]; // IDs of connected components
}

export interface CircuitProperties {
  // Common properties
  value: number; // Resistance (Ω), Capacitance (F), Inductance (H), Voltage (V)
  resistance?: number; // Explicit resistance for components like switches, meters
  tolerance: number; // ±% tolerance
  powerRating: number; // Maximum power (W)

  // State properties
  voltage: number; // Current voltage across component
  current: number; // Current through component
  power: number; // Current power dissipation

  // Visual properties
  burnt: boolean; // Component is burnt out
  glowing: boolean; // LED is glowing

  // Time-domain properties (for reactive components)
  initialCondition?: number; // Initial voltage (capacitor) or current (inductor)
}

export abstract class CircuitComponent extends GameObject {
  private eventEmitter: SimpleEventEmitter;
  protected componentType: CircuitComponentType;
  protected circuitProps: CircuitProperties;
  protected nodes: CircuitNode[];
  protected gridPosition: { x: number; y: number }; // Grid coordinates
  protected orientation: number; // 0, 90, 180, 270 degrees

  // Visual elements
  protected componentGraphics: Graphics;
  protected labelContainer: Container; // Separate container for labels (doesn't transform)
  protected labelText: Text;
  protected valueText: Text;
  protected pinGraphics: Graphics[] = [];

  // Animation properties
  protected currentFlowAnimation: number = 0;
  protected burnAnimation: number = 0;
  protected glowAnimation: number = 0;

  // Interactive state
  protected _isSelected: boolean = false;
  protected isHighlighted: boolean = false;

  constructor(
    name: string,
    type: CircuitComponentType,
    props: CircuitProperties,
    gridX: number = 0,
    gridY: number = 0
  ) {
    super(name);
    this.eventEmitter = new SimpleEventEmitter();
    this.componentType = type;
    this.circuitProps = props;
    this.gridPosition = { x: gridX, y: gridY };
    this.orientation = 0;
    this.nodes = [];

    // Initialize visual elements
    this.componentGraphics = new Graphics();
    this.labelContainer = new Container(); // Separate container for labels
    this.labelText = new Text("", { fontSize: 10, fill: 0xffffff });
    this.valueText = new Text("", { fontSize: 8, fill: 0xcccccc });

    // Add component graphics to display container (will be transformed)
    this.displayContainer.addChild(this.componentGraphics);

    // Add label container to display container (won't be transformed)
    this.displayContainer.addChild(this.labelContainer);

    // Add labels to their own container
    this.labelContainer.addChild(this.labelText);
    this.labelContainer.addChild(this.valueText);

    this.initializeNodes();
    this.createVisuals();
    this.createPinGraphics();
    this.updateGridPosition();
    // Don't call makeInteractive() here - CircuitScene handles all component interactions
    // this.makeInteractive();
  }

  /**
   * Initialize connection nodes for this component
   * Override in derived classes
   */
  protected abstract initializeNodes(): void;

  /**
   * Get component type
   */
  public getComponentType(): CircuitComponentType {
    return this.componentType;
  }

  /**
   * Get circuit properties
   */
  public getCircuitProperties(): CircuitProperties {
    return { ...this.circuitProps };
  }

  /**
   * Update circuit properties
   */
  public updateCircuitProperties(props: Partial<CircuitProperties>): void {
    Object.assign(this.circuitProps, props);
    this.updateVisuals(0); // Force visual update
  }

  /**
   * Grid position management
   */
  public getGridPosition(): { x: number; y: number } {
    return { ...this.gridPosition };
  }

  public setGridPosition(x: number, y: number): void {
    this.gridPosition.x = x;
    this.gridPosition.y = y;
    this.updateGridPosition();
  }

  public getOrientation(): number {
    return this.orientation;
  }

  public setOrientation(degrees: number): void {
    this.orientation = degrees % 360;
    const radians = (this.orientation * Math.PI) / 180;

    // Rotate the component graphics only (labels are in separate container)
    this.componentGraphics.rotation = radians;

    this.updateNodePositions();
    this.updatePinGraphics();
    this.updateLabelPositions();

    // Notify listeners so wires can update when orientation changes
    this.emit("positionChanged", this);
  }

  public rotateClockwise(): void {
    this.setOrientation(this.orientation + 90);
  }

  public rotateCounterClockwise(): void {
    this.setOrientation(this.orientation - 90);
  }

  /**
   * Node management
   */
  public getNodes(): CircuitNode[] {
    return [...this.nodes];
  }

  public getNode(id: string): CircuitNode | undefined {
    return this.nodes.find((node) => node.id === id);
  }

  protected updateNodePositions(): void {
    // Update node positions based on orientation
    // Override in derived classes for specific node layouts
  }

  /**
   * Circuit analysis methods
   */
  public getImpedance(frequency: number = 0): number {
    // Override in derived classes
    // Default: pure resistance
    return this.circuitProps.value;
  }

  public getReactance(frequency: number): number {
    // Override in derived classes for reactive components
    return 0;
  }

  /**
   * Update component state based on circuit analysis
   */
  public updateCircuitState(voltage: number, current: number): void {
    this.circuitProps.voltage = voltage;
    this.circuitProps.current = current;
    this.circuitProps.power = Math.abs(voltage * current);

    // Reset burnt state if voltage and current are both zero (simulation stopped)
    if (voltage === 0 && current === 0) {
      this.circuitProps.burnt = false;
      this.circuitProps.glowing = false;
    }

    // Check for component failure
    if (this.circuitProps.power > this.circuitProps.powerRating) {
      this.circuitProps.burnt = true;
      this.startBurnAnimation();
    }

    // Update node voltages
    this.updateNodeVoltages();

    // Update visual state based on new circuit properties
    this.updateVisuals(0);
  }

  protected updateNodeVoltages(): void {
    // Update node voltages based on component behavior
    // Override in derived classes
  }

  /**
   * Visual effects
   */
  protected startBurnAnimation(): void {
    this.burnAnimation = 1.0;
  }

  protected startCurrentFlowAnimation(): void {
    if (Math.abs(this.circuitProps.current) > 0.001) {
      this.currentFlowAnimation = 1.0;
    }
  }

  protected startGlowAnimation(): void {
    if (this.componentType === "led" && this.circuitProps.current > 0) {
      this.circuitProps.glowing = true;
      this.glowAnimation = 1.0;
    }
  }

  /**
   * Update animations
   */
  public override update(deltaTime: number): void {
    super.update(deltaTime);

    // Update animations
    if (this.currentFlowAnimation > 0) {
      this.currentFlowAnimation -= deltaTime * 2; // 0.5 second animation
      this.currentFlowAnimation = Math.max(0, this.currentFlowAnimation);
    }

    if (this.burnAnimation > 0) {
      this.burnAnimation -= deltaTime * 0.5; // 2 second burn animation
      this.burnAnimation = Math.max(0, this.burnAnimation);
    }

    if (this.glowAnimation > 0 && !this.circuitProps.glowing) {
      this.glowAnimation -= deltaTime * 3; // 0.33 second fade
      this.glowAnimation = Math.max(0, this.glowAnimation);
    }

    // Start animations based on current state
    this.startCurrentFlowAnimation();
    this.startGlowAnimation();
  }

  /**
   * Grid positioning
   */
  protected updateGridPosition(): void {
    const GRID_SIZE = 20; // 20 pixels per grid unit
    this.setPosition(
      this.gridPosition.x * GRID_SIZE,
      this.gridPosition.y * GRID_SIZE
    );
  }

  /**
   * Snap to grid
   */
  public snapToGrid(worldX: number, worldY: number): void {
    const GRID_SIZE = 20;
    const gridX = Math.round(worldX / GRID_SIZE);
    const gridY = Math.round(worldY / GRID_SIZE);
    this.setGridPosition(gridX, gridY);
  }

  /**
   * Get formatted value string
   */
  protected getValueString(): string {
    const value = this.circuitProps.value;

    switch (this.componentType) {
      case "resistor":
        return this.formatResistance(value);
      case "capacitor":
        return this.formatCapacitance(value);
      case "inductor":
        return this.formatInductance(value);
      case "battery":
        return `${value}V`;
      default:
        return value.toString();
    }
  }

  private formatResistance(ohms: number): string {
    if (ohms >= 1e6) return `${(ohms / 1e6).toFixed(1)}MΩ`;
    if (ohms >= 1e3) return `${(ohms / 1e3).toFixed(1)}kΩ`;
    return `${ohms}Ω`;
  }

  private formatCapacitance(farads: number): string {
    if (farads >= 1e-3) return `${(farads * 1e3).toFixed(1)}mF`;
    if (farads >= 1e-6) return `${(farads * 1e6).toFixed(1)}μF`;
    if (farads >= 1e-9) return `${(farads * 1e9).toFixed(1)}nF`;
    return `${(farads * 1e12).toFixed(1)}pF`;
  }

  private formatInductance(henries: number): string {
    if (henries >= 1) return `${henries.toFixed(2)}H`;
    if (henries >= 1e-3) return `${(henries * 1e3).toFixed(1)}mH`;
    return `${(henries * 1e6).toFixed(1)}μH`;
  }

  /**
   * Create interactive pin graphics (from reference implementation)
   */
  protected createPinGraphics(): void {
    // Clear existing pin graphics
    this.pinGraphics.forEach((pin) => {
      if (pin.parent) {
        pin.parent.removeChild(pin);
      }
      pin.destroy();
    });
    this.pinGraphics = [];

    // Create pin graphics for each node
    this.nodes.forEach((node, index) => {
      const pinGraphics = new Graphics();
      const pinSize = 6;

      // Pin position is already relative to component center in node.position
      // No need to subtract this.position since node.position is already relative
      const relativePos = {
        x: node.position.x,
        y: node.position.y,
      };

      pinGraphics.circle(relativePos.x, relativePos.y, pinSize);
      pinGraphics.fill(0xffffff);
      pinGraphics.stroke({ width: 2, color: 0x888888 });

      // Make pin interactive
      pinGraphics.eventMode = "static";
      pinGraphics.cursor = "pointer";

      // Pin hover effects
      pinGraphics.on("pointerover", () => {
        pinGraphics.clear();
        pinGraphics.circle(relativePos.x, relativePos.y, pinSize);
        pinGraphics.fill(0x44ff44);
        pinGraphics.stroke({ width: 2, color: 0x66ff66 });
      });

      pinGraphics.on("pointerout", () => {
        pinGraphics.clear();
        pinGraphics.circle(relativePos.x, relativePos.y, pinSize);
        pinGraphics.fill(0xffffff);
        pinGraphics.stroke({ width: 2, color: 0x888888 });
      });

      // Pin click events
      pinGraphics.on("pointerdown", (event) => {
        event.stopPropagation();
        // Pin clicks are handled by the scene's canvas event listeners
        console.log(`🔌 Pin clicked: ${this.getName()}.${node.id}`);
      });

      this.displayContainer.addChild(pinGraphics);
      this.pinGraphics.push(pinGraphics);
    });
  }

  /**
   * Make component interactive (from reference implementation)
   */
  protected makeInteractive(): void {
    this.displayContainer.eventMode = "static";
    this.displayContainer.cursor = "pointer";

    let isDragging = false;
    let dragStart: { x: number; y: number } | null = null;

    this.displayContainer.on("pointerdown", (event) => {
      event.stopPropagation();
      // Component clicks are handled by the scene's canvas event listeners
      console.log(`🔧 Component clicked: ${this.getName()}`);

      isDragging = false;
      dragStart = { x: event.global.x, y: event.global.y };
      // Drag events are handled by the scene
    });

    this.displayContainer.on("pointermove", (event) => {
      if (dragStart && !isDragging) {
        const distance = Math.sqrt(
          Math.pow(event.global.x - dragStart.x, 2) +
            Math.pow(event.global.y - dragStart.y, 2)
        );
        if (distance > 5) {
          isDragging = true;
        }
      }
    });

    this.displayContainer.on("pointerup", () => {
      if (isDragging) {
        console.log(`🔧 Component drag ended: ${this.getName()}`);
      }
      isDragging = false;
      dragStart = null;
    });

    this.displayContainer.on("pointerover", () => {
      // Highlight component on hover
      this.displayContainer.alpha = 0.8;
    });

    this.displayContainer.on("pointerout", () => {
      this.displayContainer.alpha = 1.0;
    });
  }

  /**
   * Set component selection state
   */
  public setSelected(selected: boolean): void {
    this._isSelected = selected;
    this.updateVisuals(0);
  }

  /**
   * Set component highlight state
   */
  public setHighlighted(highlighted: boolean): void {
    this.isHighlighted = highlighted;
    this.updateVisuals(0);
  }

  /**
   * Flip component horizontally
   */
  public flipHorizontal(): void {
    // Flip the visual scale of the component graphics only (labels are in separate container)
    this.componentGraphics.scale.x *= -1;

    // Note: Node positions will be updated by updateNodePositions()
    // which is overridden in derived classes to handle flipping properly

    // Update pin graphics and label positions
    this.updateNodePositions();
    this.updatePinGraphics();
    this.updateLabelPositions();

    // Notify listeners so wires can update when flipping affects node positions
    this.emit("positionChanged", this);
  }

  /**
   * Update pin graphics after transformation
   */
  protected updatePinGraphics(): void {
    // Remove old pin graphics
    this.pinGraphics.forEach((pin) => {
      if (pin.parent) {
        pin.parent.removeChild(pin);
      }
      pin.destroy();
    });
    this.pinGraphics = [];

    // Recreate pin graphics with new node positions
    this.createPinGraphics();
  }

  /**
   * Get default label positions for horizontal orientation
   * Can be overridden by derived classes if needed
   * Returns the Y positions for label and value text
   */
  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    // Default positions - most components use label above, value below
    // Increased spacing for better readability
    return { labelY: -30, valueY: 25 };
  }

  /**
   * Update label positions based on component orientation
   * Places labels to the side when vertical, keeps them above/below when horizontal
   */
  protected updateLabelPositions(): void {
    // Normalize orientation to 0-359
    const normalizedOrientation = ((this.orientation % 360) + 360) % 360;

    // Get the default positions for this component type
    const defaultPositions = this.getDefaultLabelPositions();

    // Adjust positions based on orientation
    if (normalizedOrientation >= 45 && normalizedOrientation < 135) {
      // 90° - component is vertical, move labels to the left side
      this.labelText.position.set(-55, -5);
      this.valueText.position.set(-55, 10);
    } else if (normalizedOrientation >= 225 && normalizedOrientation < 315) {
      // 270° - component is vertical, move labels to the right side
      this.labelText.position.set(55, -5);
      this.valueText.position.set(55, 10);
    } else {
      // 0°, 180°, or 360° - component is horizontal, use default positions
      this.labelText.position.set(0, defaultPositions.labelY);
      this.valueText.position.set(0, defaultPositions.valueY);
    }
  }

  /**
   * Override setPosition to update wire positions
   */
  public setPosition(x: number, y: number): void {
    super.setPosition(x, y);
    // Trigger wire position update
    this.emit("positionChanged", this);
  }

  // EventEmitter methods
  public emit(event: string, ...args: any[]): boolean {
    return this.eventEmitter.emit(event, ...args);
  }

  public on(event: string, listener: (...args: any[]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  public off(event: string, listener: (...args: any[]) => void): this {
    this.eventEmitter.off(event, listener);
    return this;
  }

  public removeAllListeners(event?: string): this {
    this.eventEmitter.removeAllListeners(event);
    return this;
  }
}
