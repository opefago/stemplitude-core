import { Graphics, Text, Container } from "pixi.js";
import {
  MechanicalComponent,
  MechanicalProperties,
  ConnectionPoint,
} from "../MechanicalComponent";
import { MechanicalState, PhysicsSystem } from "../PhysicsSystem";

export interface ForkliftProperties extends MechanicalProperties {
  armLength: number;
  baseHeight: number;
  maxLiftWeight: number;
  gearRatio: number; // Reduction ratio for lift mechanism
  pulleyRadius: number; // Small pulley for driving the lift
}

export interface Load {
  weight: number; // Weight in Newtons
  name: string;
  color: number;
}

export class Forklift extends MechanicalComponent {
  private forkliftProps: ForkliftProperties;
  private currentLoad: Load | null = null;
  private liftHeight: number = 0; // Vertical position of forks
  private maxLiftHeight: number = 180; // Maximum lift height for MEGA forklift

  // Graphics components
  private baseGraphics!: Graphics;
  private forksGraphics!: Graphics;
  private pulleyGraphics!: Graphics;
  private loadGraphics!: Graphics;
  private statusText!: Text;
  private guidesGraphics!: Graphics; // Vertical guides for forks

  // Visual containers
  private forksContainer!: Container; // Forks move vertically only

  constructor(name: string, props: ForkliftProperties) {
    super(name, "forklift", props);
    this.forkliftProps = props;
    this.liftHeight = 0; // Start at bottom position
  }

  protected initializeConnectionPoints(): void {
    // Forklift has connection points ONLY on the rotating pulley mechanism (updated for MEGA size)
    this.connectionPoints = [
      {
        id: "drive_pulley",
        component: this,
        type: "belt_connection",
        position: { x: -60, y: -60 }, // Updated position for MEGA base
      },
      {
        id: "pulley_shaft",
        component: this,
        type: "shaft_connection",
        position: { x: -60, y: -60 }, // Same as pulley position
      },
    ];
  }

  protected createVisuals(): void {
    // Clear display container to prevent duplicates
    this.displayContainer.removeChildren();

    // Initialize graphics objects
    this.baseGraphics = new Graphics();
    this.forksGraphics = new Graphics();
    this.pulleyGraphics = new Graphics();
    this.loadGraphics = new Graphics();
    this.guidesGraphics = new Graphics();
    this.statusText = new Text({
      text: "Forklift",
      style: {
        fontSize: 10,
        fill: 0xffffff,
        fontFamily: "Arial, sans-serif",
        fontWeight: "bold",
        stroke: { color: 0x000000, width: 3 },
        dropShadow: {
          color: 0x000000,
          blur: 2,
          distance: 1,
        },
      },
    });
    this.statusText.anchor.set(0.5);

    // Create container for forks only (this container moves vertically)
    this.forksContainer = new Container();

    // Create visual components
    this.createBaseVisual();
    this.createGuidesVisual();
    this.createForksVisual();
    this.createPulleyVisual();
    this.updateLoadVisual();

    // Position status text
    this.statusText.x = 0;
    this.statusText.y = -200; // Above everything (mega scale)

    // Add forks and load to moving container
    this.forksContainer.addChild(this.forksGraphics);
    this.forksContainer.addChild(this.loadGraphics);

    // Add to main display - base, guides, and pulley are STATIONARY
    this.displayContainer.addChild(this.baseGraphics); // Stationary base
    this.displayContainer.addChild(this.guidesGraphics); // Stationary rails
    this.displayContainer.addChild(this.forksContainer); // MOVING forks container
    this.displayContainer.addChild(this.pulleyGraphics); // Stationary pulley
    this.displayContainer.addChild(this.statusText); // Stationary status

    console.log(
      `Forklift ${this.getName()}: Created visuals - forks in container, base/pulley stationary`
    );
  }

  private createBaseVisual(): void {
    this.baseGraphics.clear();

    // Draw base platform (stationary) - MASSIVE
    this.baseGraphics
      .rect(-80, 0, 160, 40) // MEGA wide and tall base platform
      .fill(0x666666);

    // Draw support structure - MEGA tall and wide
    this.baseGraphics.rect(-40, -120, 80, 120).fill(0x777777);

    // Draw pulley mounting point (updated to match new pulley position) - MEGA
    this.baseGraphics.circle(-60, -60, 15).fill(0x888888);
  }

  private createGuidesVisual(): void {
    this.guidesGraphics.clear();

    // Draw vertical guides/rails for forks (stationary) - MEGA tall and wide apart
    this.guidesGraphics
      .moveTo(40, -30)
      .lineTo(40, -150)
      .stroke({ width: 8, color: 0x999999 });

    this.guidesGraphics
      .moveTo(55, -30)
      .lineTo(55, -150)
      .stroke({ width: 8, color: 0x999999 });
  }

  private createForksVisual(): void {
    this.forksGraphics.clear();

    const forkliftProps = this.mechanicalProps as ForkliftProperties;
    const forkLength = forkliftProps.armLength || 120; // MEGA long forks

    // Draw horizontal fork base (moves vertically with container) - MEGA size
    this.forksGraphics.rect(40, -8, forkLength, 16).fill(0x888888);

    // Draw fork tines - MEGA big and wide apart
    this.forksGraphics.rect(40 + forkLength - 6, -25, 10, 50).fill(0xaaaaaa);
    this.forksGraphics.rect(40 + forkLength + 20, -25, 10, 50).fill(0xaaaaaa);

    // Draw lift mechanism (cylinder/hydraulic) - moves with forks, MEGA
    this.forksGraphics.rect(30, -20, 12, 40).fill(0x666666);

    // Draw cable/chain connection point (moves with forks) - MEGA
    this.forksGraphics.circle(45, 0, 8).fill(0x555555);
  }

  private createPulleyVisual(): void {
    this.pulleyGraphics.clear();

    const forkliftProps = this.mechanicalProps as ForkliftProperties;
    const pulleyRadius = forkliftProps.pulleyRadius || 12;

    // Position pulley graphics at the pulley location (exactly like motor) - adjusted for MEGA base
    this.pulleyGraphics.x = -60;
    this.pulleyGraphics.y = -60;

    // Draw pulley centered at (0, 0) in graphics coordinate space (exactly like motor)
    // Pulley disc
    this.pulleyGraphics.circle(0, 0, pulleyRadius).fill(0x666666);

    // Pulley groove (where belt sits) - exact same pattern as motor
    this.pulleyGraphics
      .circle(0, 0, pulleyRadius - 2)
      .stroke({ width: 2, color: 0x333333 });

    // Pulley center - exact same as motor
    this.pulleyGraphics.circle(0, 0, 3).fill(0x888888);

    // Connecting shaft (from forklift base to pulley) - similar to motor, MEGA thick
    this.pulleyGraphics
      .moveTo(20, 0)
      .lineTo(pulleyRadius, 0)
      .stroke({ width: 8, color: 0x555555 });
  }

  private updateLoadVisual(): void {
    this.loadGraphics.clear();

    if (this.currentLoad) {
      // Calculate load position on forks (relative to forks, not absolute)
      const forkliftProps = this.mechanicalProps as ForkliftProperties;
      const forkLength = forkliftProps.armLength || 120; // MEGA long forks

      const loadX = 40 + forkLength; // At end of forks (adjusted for MEGA fork position)
      const loadY = 0; // Load sits ON the forks (forks are already positioned by container)

      // Draw load
      const loadSize = Math.min(20, Math.max(8, this.currentLoad.weight / 100)); // Size based on weight
      this.loadGraphics
        .rect(loadX - loadSize / 2, loadY - loadSize / 2, loadSize, loadSize)
        .fill(this.currentLoad.color);

      // Draw load label
      const loadText = new Text({
        text: this.currentLoad.name,
        style: {
          fontSize: 8,
          fill: 0xffffff,
        },
      });
      loadText.anchor.set(0.5);
      loadText.x = loadX;
      loadText.y = loadY - loadSize / 2 - 8;
      this.loadGraphics.addChild(loadText);
    }
  }

  protected updateVisuals(deltaTime: number): void {
    // Check if graphics objects exist, re-initialize if missing
    if (
      !this.forksContainer ||
      !this.pulleyGraphics ||
      !this.statusText ||
      !this.baseGraphics ||
      !this.forksGraphics ||
      !this.loadGraphics
    ) {
      // Re-initializing missing graphics
      this.createVisuals();
      return;
    }

    // Debug: Always log mechanical state to see what forklift is receiving
    if (
      Math.abs(this.mechanicalState.omega) > 0.00001 ||
      Math.abs(this.mechanicalState.torque) > 0.1
    ) {
      console.log(
        `Forklift ${this.getName()} receiving input: omega=${this.mechanicalState.omega.toFixed(6)}, torque=${this.mechanicalState.torque.toFixed(3)}`
      );
    }

    // Initialize movement variables for the entire method
    const forkliftProps = this.mechanicalProps as ForkliftProperties;
    const gearRatio = forkliftProps.gearRatio || 5;
    const pulleyRadius = forkliftProps.pulleyRadius || 12;

    let canMove = true;
    let limitWarning = "";

    // Check if we're at limits and trying to move further
    if (
      this.mechanicalState.omega > 0.001 &&
      this.liftHeight >= this.maxLiftHeight
    ) {
      canMove = false;
      limitWarning = "⚠️ MAX HEIGHT";
      console.warn(
        `Forklift ${this.getName()}: At maximum height, blocking upward movement`
      );
    } else if (this.mechanicalState.omega < -0.001 && this.liftHeight <= 0) {
      canMove = false;
      limitWarning = "⚠️ MIN HEIGHT";
      console.warn(
        `Forklift ${this.getName()}: At minimum height, blocking downward movement`
      );
    }

    // Apply movement and rotation if allowed
    if (Math.abs(this.mechanicalState.omega) > 0.001 && canMove) {
      // Pulley rotates with input omega (direct rotation like motor)
      this.pulleyGraphics.rotation += this.mechanicalState.omega * deltaTime;

      // Calculate cumulative vertical movement from rotation
      const deltaHeight =
        (this.mechanicalState.omega * deltaTime * pulleyRadius) / gearRatio;
      const newHeight = this.liftHeight + deltaHeight;

      // Apply movement with strict limits
      this.liftHeight = Math.max(0, Math.min(this.maxLiftHeight, newHeight));

      // Debug logging to see movement
      console.log(
        `Forklift ${this.getName()}: MOVING - omega=${this.mechanicalState.omega.toFixed(6)}, deltaHeight=${deltaHeight.toFixed(6)}, height=${this.liftHeight.toFixed(3)}/${this.maxLiftHeight}`
      );
    } else if (Math.abs(this.mechanicalState.omega) > 0.001) {
      // Movement blocked by limits - stop the pulley rotation too
      console.log(`Forklift ${this.getName()}: BLOCKED - ${limitWarning}`);
    } else {
      // Debug: Log why movement isn't happening
      console.log(
        `Forklift ${this.getName()}: NO MOVEMENT - omega too small: ${this.mechanicalState.omega.toFixed(6)}`
      );
    }

    // Apply vertical position to forks (negative Y moves up in Pixi)
    this.forksContainer.y = -this.liftHeight;

    // Visual feedback for limits
    if (this.liftHeight >= this.maxLiftHeight) {
      // Red warning at max height
      this.statusText.style.fill = 0xff4444;
    } else if (this.liftHeight <= 0) {
      // Blue warning at min height
      this.statusText.style.fill = 0x4444ff;
    }

    // Debug: Log fork position updates
    if (Math.abs(this.liftHeight) > 0.1) {
      console.log(
        `Forklift ${this.getName()}: Moving forks to Y=${this.forksContainer.y.toFixed(2)} (liftHeight=${this.liftHeight.toFixed(2)})`
      );
    }

    // Update load visual
    this.updateLoadVisual();

    // Update status text
    const rpm = PhysicsSystem.omegaToRPM(Math.abs(this.mechanicalState.omega));
    const canLift = this.canLiftCurrentLoad();
    const direction = this.mechanicalState.omega >= 0 ? "↑" : "↓";

    // Update status text with limit warnings
    let statusText = `H:${this.liftHeight.toFixed(1)}/${this.maxLiftHeight}`;

    // Add movement indicator and warnings
    if (limitWarning) {
      statusText += ` ${limitWarning}`;
    } else if (rpm > 0.1) {
      statusText += ` ${direction}`;
    }

    statusText += ` ${canLift ? "✓" : "⚠"}`;

    this.statusText.text = statusText;

    // Color logic: limits override other colors
    if (!limitWarning) {
      this.statusText.style.fill = canLift ? 0x00ff00 : 0xff0000;
    }
  }

  protected calculateOutputState(
    _connection: ConnectionPoint
  ): MechanicalState | null {
    // When forklift is at limits, it can't transfer torque/power - STOP the mechanism
    if (!this.canLiftCurrentLoad()) {
      console.log(
        `Forklift ${this.getName()}: Cannot lift load, stopping output`
      );
      return {
        omega: 0,
        torque: 0,
        direction: 1,
        power: 0,
      };
    }

    // Check if we're at height limits and trying to move in blocked direction
    const isAtMaxHeight = this.liftHeight >= this.maxLiftHeight;
    const isAtMinHeight = this.liftHeight <= 0;
    const isMovingUp = this.mechanicalState.omega > 0.001;
    const isMovingDown = this.mechanicalState.omega < -0.001;

    if ((isAtMaxHeight && isMovingUp) || (isAtMinHeight && isMovingDown)) {
      console.log(
        `Forklift ${this.getName()}: At limit, stopping output to prevent further movement`
      );
      return {
        omega: 0,
        torque: 0,
        direction: 1,
        power: 0,
      };
    }

    // Normal operation - typically end point, so return null (no passthrough)
    return null;
  }

  /**
   * Apply input to drive the forklift lift mechanism
   */
  public applyInput(
    inputState: MechanicalState,
    fromConnection?: string
  ): void {
    super.applyInput(inputState, fromConnection);

    // Calculate required torque for current load
    const forkliftProps = this.mechanicalProps as ForkliftProperties;
    const currentWeight = this.currentLoad ? this.currentLoad.weight : 0;
    const totalWeight = currentWeight + forkliftProps.mass;

    // Simplified torque calculation for vertical lifting
    const requiredTorque =
      (totalWeight * 9.81 * (forkliftProps.pulleyRadius || 12)) /
      (forkliftProps.gearRatio || 5);

    console.log(
      `Forklift ${this.getName()}: Required torque: ${requiredTorque.toFixed(2)}, Available: ${Math.abs(inputState.torque).toFixed(2)}`
    );

    // The pulley rotation is handled automatically in updateVisuals
    // based on the mechanical state omega received from connected components

    // Check if we can lift the current load
    if (Math.abs(inputState.torque) < requiredTorque) {
      console.warn(
        `Forklift ${this.getName()}: Insufficient torque for current load. Required: ${requiredTorque.toFixed(2)}, Available: ${Math.abs(inputState.torque).toFixed(2)}`
      );
      // Could implement stall behavior here if needed
    }
  }

  /**
   * Calculate required torque for current load and angle
   */
  private calculateRequiredTorque(): number {
    let totalWeight = 0;

    if (this.currentLoad) {
      totalWeight = this.currentLoad.weight;
    }

    // Add arm weight (simplified)
    const forkliftProps = this.mechanicalProps as ForkliftProperties;
    const armWeight = (forkliftProps.mass || 20) * 9.81;
    totalWeight += armWeight;

    return (
      (totalWeight * 9.81 * (forkliftProps.pulleyRadius || 12)) /
      (forkliftProps.gearRatio || 5)
    ); // Torque for vertical lifting with gear reduction
  }

  /**
   * Check if forklift can lift the current load
   */
  private canLiftCurrentLoad(): boolean {
    const requiredTorque = this.calculateRequiredTorque();
    const availableTorque = Math.abs(this.mechanicalState.torque);

    return availableTorque >= requiredTorque;
  }

  /**
   * Load an item onto the forklift
   */
  public loadItem(load: Load): boolean {
    if (!load.weight || load.weight <= 0) {
      console.warn(`Invalid load weight: ${load.weight}`);
      return false;
    }

    if (load.weight > this.forkliftProps.maxLiftWeight) {
      console.warn(
        `Load weight ${load.weight}N exceeds maximum capacity ${this.forkliftProps.maxLiftWeight}N`
      );
      return false;
    }

    this.currentLoad = load;
    return true;
  }

  /**
   * Unload the current item
   */
  public unloadItem(): Load | null {
    const load = this.currentLoad;
    this.currentLoad = null;
    return load;
  }

  /**
   * Set target lift height manually (legacy method name for compatibility)
   */
  public setTargetAngle(heightValue: number): void {
    this.liftHeight = Math.max(0, Math.min(this.maxLiftHeight, heightValue));
  }

  /**
   * Get current lift height
   */
  public getLiftHeight(): number {
    return this.liftHeight;
  }

  /**
   * Get current fork height
   */
  public getArmAngle(): number {
    return this.liftHeight;
  }

  /**
   * Get current load
   */
  public getCurrentLoad(): Load | null {
    return this.currentLoad;
  }

  /**
   * Get forklift-specific properties
   */
  public getForkliftProperties(): ForkliftProperties {
    return { ...this.forkliftProps };
  }

  /**
   * Check if forklift can handle additional weight
   */
  public canHandle(weight: number): boolean {
    const currentWeight = this.currentLoad ? this.currentLoad.weight : 0;
    return currentWeight + weight <= this.forkliftProps.maxLiftWeight;
  }
}
