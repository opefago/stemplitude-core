import { Graphics, Text } from "pixi.js";
import {
  MechanicalComponent,
  MechanicalProperties,
  ConnectionPoint,
} from "../MechanicalComponent";
import { MechanicalState, PhysicsSystem } from "../PhysicsSystem";

export interface MotorProperties extends MechanicalProperties {
  maxRPM: number;
  nominalTorque: number;
  pulleyRadius: number;
}

export class Motor extends MechanicalComponent {
  private motorProps: MotorProperties;
  private isRunning: boolean = false;
  private targetRPM: number = 0;
  private currentRPM: number = 0; // Current actual RPM (smoothed)
  private motorGraphics!: Graphics;
  private pulleyGraphics!: Graphics;
  private statusText!: Text;
  private motorLabel!: Text;

  // Motor acceleration/deceleration settings
  private acceleration: number = 30; // RPM per second when starting up (much slower for dramatic effect)
  private deceleration: number = 40; // RPM per second when stopping (much slower coast-down)
  protected override isTransitioning: boolean = false; // Override base class property with correct visibility

  constructor(name: string, props: MotorProperties) {
    super(name, "motor", props);
    this.motorProps = props;
  }

  protected initializeConnectionPoints(): void {
    // Motor has connection points for both belt and shaft connections
    this.connectionPoints = [
      {
        id: "pulley_output",
        component: this,
        type: "belt_connection",
        position: { x: 35, y: 0 }, // Center of pulley (offset from motor center)
      },
      {
        id: "shaft_output",
        component: this,
        type: "shaft_connection",
        position: { x: 25, y: 0 }, // Motor shaft output
      },
    ];
  }

  protected createVisuals(): void {
    console.log(`Motor ${this.getName()} createVisuals() called`);

    // Clear any existing children to prevent duplicates
    this.displayContainer.removeChildren();

    // Initialize graphics objects
    this.motorGraphics = new Graphics();
    this.pulleyGraphics = new Graphics();
    this.statusText = new Text("OFF", {
      fontSize: 11,
      fill: 0xff0000,
      fontFamily: "Arial, sans-serif",
      fontWeight: "bold",
      stroke: { color: 0x000000, width: 3 },
      dropShadow: {
        color: 0x000000,
        blur: 2,
        distance: 1,
      },
    });

    // Simple text-based rotation display - no separate indicator needed

    console.log(
      `Motor ${this.getName()} graphics objects created - motorGraphics: ${!!this.motorGraphics}, pulleyGraphics: ${!!this.pulleyGraphics}, statusText: ${!!this.statusText}`
    );

    // Create motor body (rectangular)
    this.motorGraphics.roundRect(-25, -15, 50, 30, 5).fill(0x444444);

    // Motor label background
    this.motorGraphics.rect(-20, -8, 40, 16).fill(0xffffff);

    // Create motor label text (only once)
    this.motorLabel = new Text("M", {
      fontSize: 14,
      fill: 0x000000,
    });
    this.motorLabel.anchor.set(0.5);
    this.motorLabel.x = 0;
    this.motorLabel.y = 0;

    // Create pulley (circular)
    this.createPulleyVisual();

    // Status text - position it well above motor to prevent overlap
    this.statusText.anchor.set(0.5);
    this.statusText.x = 0;
    this.statusText.y = -55; // Moved even further up to completely avoid overlap

    // Add to container
    this.displayContainer.addChild(this.motorGraphics);
    this.displayContainer.addChild(this.pulleyGraphics);
    this.displayContainer.addChild(this.statusText);
    this.displayContainer.addChild(this.motorLabel);

    console.log(
      `Motor ${this.getName()} createVisuals() completed - children added to container: ${this.displayContainer.children.length}`
    );
  }

  private createPulleyVisual(): void {
    this.pulleyGraphics.clear();

    // Cast mechanicalProps to MotorProperties to access pulleyRadius
    const motorProps = this.mechanicalProps as MotorProperties;
    const pulleyRadius = motorProps.pulleyRadius || 20; // Default fallback

    // Position pulley graphics at the pulley location
    this.pulleyGraphics.x = 35;
    this.pulleyGraphics.y = 0;

    // Draw pulley centered at (0, 0) in graphics coordinate space
    // Pulley disc
    this.pulleyGraphics.circle(0, 0, pulleyRadius).fill(0x666666);

    // Pulley groove (where belt sits)
    this.pulleyGraphics
      .circle(0, 0, pulleyRadius - 2)
      .stroke({ width: 2, color: 0x333333 });

    // Pulley center
    this.pulleyGraphics.circle(0, 0, 3).fill(0x888888);

    // Connecting shaft (from motor center to pulley)
    this.pulleyGraphics
      .moveTo(-10, 0)
      .lineTo(-pulleyRadius, 0)
      .stroke({ width: 3, color: 0x555555 });
  }

  protected updateVisuals(deltaTime: number): void {
    // Motor visuals updated

    // Check if graphics objects exist, re-initialize if missing
    if (
      !this.pulleyGraphics ||
      !this.statusText ||
      !this.motorGraphics ||
      !this.motorLabel
    ) {
      console.log(
        `Motor ${this.getName()} graphics missing - motorGraphics: ${!!this.motorGraphics}, pulleyGraphics: ${!!this.pulleyGraphics}, statusText: ${!!this.statusText}, motorLabel: ${!!this.motorLabel}`
      );
      console.log(`Motor ${this.getName()} re-initializing graphics...`);
      this.createVisuals();
      return;
    }

    // Update current RPM with smooth transitions
    this.updateMotorTransitions(deltaTime);

    // Rotate pulley based on current RPM (not mechanical state)
    if (this.currentRPM > 0.1) {
      const currentOmega = PhysicsSystem.rpmToOmega(this.currentRPM);
      this.pulleyGraphics.rotation += currentOmega * deltaTime;
    }

    // Update status text with direction
    if (this.currentRPM > 0.1) {
      const direction = this.mechanicalState.omega >= 0 ? "CW" : "CCW";
      this.statusText.text = `${this.currentRPM.toFixed(0)} RPM ${direction}`;

      // Color changes based on how close to target we are
      if (this.isTransitioning) {
        this.statusText.style.fill = 0xffaa00; // Orange when transitioning
      } else {
        this.statusText.style.fill = 0x00ff00; // Green when at target
      }
    } else {
      this.statusText.text = "OFF";
      this.statusText.style.fill = 0xff0000; // Red when off
    }

    // Update motor body color based on load
    this.motorGraphics.clear();
    const loadRatio =
      Math.abs(this.mechanicalState.torque) / this.motorProps.nominalTorque;
    const intensity = Math.min(loadRatio * 255, 255);
    const motorColor =
      (intensity << 16) |
      (Math.max(68, 255 - intensity) << 8) |
      Math.max(68, 255 - intensity);

    this.motorGraphics.roundRect(-25, -15, 50, 30, 5).fill(motorColor);

    // Recreate motor label background
    this.motorGraphics.rect(-20, -8, 40, 16).fill(0xffffff);

    // Motor label is already created once in createVisuals() - no need to recreate
  }

  /**
   * Override the base class transition method to use motor-specific transitions
   */
  protected override updateMechanicalTransitions(deltaTime: number): void {
    // Motors use their own specialized transition system
    this.updateMotorTransitions(deltaTime);
  }

  /**
   * Handle smooth motor acceleration/deceleration transitions
   */
  private updateMotorTransitions(deltaTime: number): void {
    const threshold = 0.5; // RPM threshold for considering "at target" (lowered for smoother transitions)

    if (Math.abs(this.currentRPM - this.targetRPM) > threshold) {
      this.isTransitioning = true;

      if (this.currentRPM < this.targetRPM) {
        // Accelerating up to target
        const rpmIncrease = this.acceleration * deltaTime;
        this.currentRPM = Math.min(
          this.currentRPM + rpmIncrease,
          this.targetRPM
        );
        console.log(
          `🟢 Motor ${this.getName()} accelerating: ${this.currentRPM.toFixed(1)} RPM (target: ${this.targetRPM})`
        );
      } else {
        // Decelerating down to target
        const rpmDecrease = this.deceleration * deltaTime;
        this.currentRPM = Math.max(
          this.currentRPM - rpmDecrease,
          this.targetRPM
        );
        console.log(
          `🔴 Motor ${this.getName()} decelerating: ${this.currentRPM.toFixed(1)} RPM (target: ${this.targetRPM})`
        );
      }
    } else {
      // Close enough to target - snap to target and stop transitioning
      if (this.isTransitioning) {
        console.log(
          `✅ Motor ${this.getName()} reached target: ${this.targetRPM} RPM`
        );
      }
      this.currentRPM = this.targetRPM;
      this.isTransitioning = false;
    }

    // Update mechanical state based on current RPM
    this.mechanicalState.omega = PhysicsSystem.rpmToOmega(this.currentRPM);
    this.mechanicalState.torque =
      this.currentRPM > 0.1 ? this.motorProps.nominalTorque : 0;
    this.mechanicalState.direction = 1;
    this.mechanicalState.power = PhysicsSystem.calculatePower(
      this.mechanicalState.torque,
      this.mechanicalState.omega
    );

    // Always propagate when transitioning or when there's significant mechanical state
    // This ensures connected components receive gradual changes during motor transitions
    if (this.isTransitioning || this.mechanicalState.omega > 0.01) {
      this.propagateOutput();
    }
  }

  protected calculateOutputState(
    connection: ConnectionPoint
  ): MechanicalState | null {
    console.log(
      `Motor calculateOutputState: connection.id=${connection.id}, isRunning=${this.isRunning}, currentRPM=${this.currentRPM}, targetRPM=${this.targetRPM}, omega=${this.mechanicalState.omega}, torque=${this.mechanicalState.torque}`
    );

    // Motor outputs power if it's running OR transitioning (even with very small omega)
    // This ensures torque is transmitted during gradual startup
    if (this.isRunning || this.isTransitioning) {
      const outputState = {
        omega: this.mechanicalState.omega,
        torque: this.mechanicalState.torque,
        direction: this.mechanicalState.direction,
        power: this.mechanicalState.power,
      };
      console.log(
        `Motor returning output state: RPM=${PhysicsSystem.omegaToRPM(outputState.omega)}, torque=${outputState.torque}`
      );
      return outputState;
    }

    // Motor is completely stopped - send zero state to stop connected components
    const zeroState = {
      omega: 0,
      torque: 0,
      direction: 1,
      power: 0,
    };
    console.log(`Motor returning zero state - motor completely stopped`);
    return zeroState;
  }

  /**
   * Start the motor at specified RPM (with smooth acceleration)
   */
  public start(rpm: number = 100): void {
    if (rpm > this.motorProps.maxRPM) {
      console.warn(
        `Motor ${this.getName()}: Requested RPM ${rpm} exceeds max RPM ${this.motorProps.maxRPM}`
      );
      rpm = this.motorProps.maxRPM;
    }

    this.isRunning = true;
    this.targetRPM = rpm;
    this.isDriven = false; // Motor is self-driving
    this.isTransitioning = true; // Begin smooth acceleration

    // Don't instantly set mechanical state - let updateMotorTransitions handle it
    // The current RPM will smoothly accelerate to the target

    console.log(
      `Motor ${this.getName()} starting smooth acceleration to ${rpm} RPM (current: ${this.currentRPM.toFixed(1)} RPM)`
    );
  }

  /**
   * Stop the motor (with smooth deceleration)
   */
  public stop(): void {
    console.log(
      `🛑 Motor ${this.getName()} STOPPING - was running: ${this.isRunning} at ${this.currentRPM.toFixed(1)} RPM`
    );

    this.isRunning = false;
    this.targetRPM = 0; // Target is now zero
    this.isTransitioning = true; // Begin smooth deceleration

    console.log(
      `🛑 Motor ${this.getName()} beginning smooth deceleration from ${this.currentRPM.toFixed(1)} RPM to 0 (rate: ${this.deceleration} RPM/s)`
    );
    console.log(
      `🛑 Expected deceleration time: ${(this.currentRPM / this.deceleration).toFixed(1)} seconds`
    );
  }

  /**
   * Set motor speed (with smooth transitions)
   */
  public setSpeed(rpm: number): void {
    if (rpm > this.motorProps.maxRPM) {
      console.warn(
        `Motor ${this.getName()}: Requested RPM ${rpm} exceeds max RPM ${this.motorProps.maxRPM}`
      );
      rpm = this.motorProps.maxRPM;
    }

    this.targetRPM = rpm;
    this.isTransitioning = true;

    if (rpm > 0) {
      this.isRunning = true;
      console.log(
        `Motor ${this.getName()} changing speed to ${rpm} RPM (current: ${this.currentRPM.toFixed(1)} RPM)`
      );
    } else {
      this.stop();
    }
  }

  /**
   * Reverse motor direction
   */
  public reverse(): void {
    if (this.isRunning) {
      this.mechanicalState.direction *= -1;
      this.mechanicalState.omega *= -1;

      console.log(
        `Motor ${this.getName()} reversed direction to ${this.mechanicalState.direction > 0 ? "forward" : "reverse"}`
      );

      // Propagate direction change using old system
      this.propagateOutput();
    }
  }

  /**
   * Get motor-specific properties
   */
  public getMotorProperties(): MotorProperties {
    return { ...this.motorProps };
  }

  /**
   * Check if motor is running
   */
  public getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get target RPM
   */
  public getTargetRPM(): number {
    return this.targetRPM;
  }

  /**
   * Get current actual RPM (smoothed)
   */
  public getCurrentRPM(): number {
    return this.currentRPM;
  }

  /**
   * Check if motor is transitioning (accelerating/decelerating)
   */
  public isTransitioningState(): boolean {
    return this.isTransitioning;
  }

  /**
   * Set motor acceleration rate
   */
  public setAcceleration(rpmPerSecond: number): void {
    this.acceleration = Math.max(10, rpmPerSecond); // Minimum 10 RPM/s for very slow transitions
  }

  /**
   * Set motor deceleration rate
   */
  public setDeceleration(rpmPerSecond: number): void {
    this.deceleration = Math.max(10, rpmPerSecond); // Minimum 10 RPM/s for very slow transitions
  }

  /**
   * Get motor acceleration settings
   */
  public getMotorTransitionSettings(): {
    acceleration: number;
    deceleration: number;
  } {
    return {
      acceleration: this.acceleration,
      deceleration: this.deceleration,
    };
  }

  /**
   * Override applyInput to prevent external driving when motor is running
   */
  public applyInput(
    inputState: MechanicalState,
    fromConnection?: string
  ): void {
    if (this.isRunning && this.targetRPM > 0) {
      // Motor is self-driving and actively running, ignore external inputs
      console.warn(
        `Motor ${this.getName()}: Cannot apply external input while motor is actively running (target: ${this.targetRPM} RPM)`
      );
      return;
    }

    // Allow external driving when motor is off or coasting down (e.g., manual cranking, back-driving)
    console.log(
      `Motor ${this.getName()}: Accepting external input - running: ${this.isRunning}, target: ${this.targetRPM} RPM`
    );
    super.applyInput(inputState, fromConnection);
  }

  /**
   * Update motor-specific properties
   */
  public updateMotorProperties(updates: any): void {
    if (updates.maxRPM !== undefined) {
      this.motorProps.maxRPM = updates.maxRPM;
    }
    if (updates.nominalTorque !== undefined) {
      this.motorProps.nominalTorque = updates.nominalTorque;
    }
    if (updates.pulleyRadius !== undefined) {
      this.motorProps.pulleyRadius = updates.pulleyRadius;
      // Recreate visuals to reflect the new pulley size
      this.createVisuals();
    }
    if (updates.acceleration !== undefined) {
      this.setAcceleration(updates.acceleration);
    }
    if (updates.deceleration !== undefined) {
      this.setDeceleration(updates.deceleration);
    }
  }
}
