import { Container } from "pixi.js";
import GameObject from "./GameObject";
import { MechanicalState, PhysicsSystem } from "./PhysicsSystem";
import * as planck from "planck";

export type MechanicalComponentType =
  | "motor"
  | "gear"
  | "pulley"
  | "belt"
  | "chain"
  | "forklift"
  | "crank"
  | "slider";

export interface ConnectionPoint {
  id: string;
  component: MechanicalComponent;
  type: "gear_mesh" | "belt_connection" | "shaft_connection";
  position: { x: number; y: number }; // Local position on component
}

export interface MechanicalProperties {
  radius?: number;
  teeth?: number;
  mass: number;
  inertia: number;
  friction: number;
  maxTorque?: number;
  efficiency: number;
}

export abstract class MechanicalComponent extends GameObject {
  protected componentType: MechanicalComponentType;
  protected mechanicalState: MechanicalState;
  protected mechanicalProps: MechanicalProperties;
  protected connections: Map<string, ConnectionPoint>;
  protected connectionPoints: ConnectionPoint[];
  protected physicsBody: planck.Body | null;
  protected displayContainer: Container;
  protected isDriven: boolean; // true if this component receives input from another

  // Smooth mechanical transitions - similar to motor transitions but for all components
  protected currentState: MechanicalState; // Current actual state during transitions
  protected targetState: MechanicalState; // Target state to transition toward
  protected transitionRate: number = 120; // Omega units per second (adjustable per component)
  protected isTransitioning: boolean = false;
  protected transitionThreshold: number = 0.01; // Omega threshold for considering "at target"

  // Input tracking for proper connection management
  protected lastInputTime: number = 0;
  protected inputTimeoutDuration: number = 100; // 100ms timeout for detecting disconnection

  constructor(
    name: string,
    type: MechanicalComponentType,
    props: MechanicalProperties
  ) {
    super(name);
    this.componentType = type;
    this.mechanicalProps = props;
    this.mechanicalState = {
      omega: 0,
      torque: 0,
      direction: 1,
      power: 0,
    };

    // Initialize current and target states to the same idle state
    this.currentState = { ...this.mechanicalState };
    this.targetState = { ...this.mechanicalState };

    this.connections = new Map();
    this.connectionPoints = [];
    this.physicsBody = null;
    this.displayContainer = new Container();
    this.isDriven = false;

    this.initializeConnectionPoints();
    this.createVisuals();
    this.updateDisplayPosition(); // Sync position with display container
  }

  /**
   * Initialize connection points for this component
   * Override in derived classes
   */
  protected abstract initializeConnectionPoints(): void;

  /**
   * Create visual representation
   * Override in derived classes
   */
  protected abstract createVisuals(): void;

  /**
   * Apply input mechanical state to this component
   * This is called when another component drives this one
   */
  public applyInput(
    inputState: MechanicalState,
    _fromConnection?: string
  ): void {
    const inputRpm = PhysicsSystem.omegaToRPM(inputState.omega);
    const isStopping = Math.abs(inputState.omega) < 0.001;

    // Track input timestamp for connection management
    this.lastInputTime = Date.now();

    // Component received input
    console.log(
      `🔄 ${this.getName()} received input: ${inputRpm.toFixed(1)} RPM, ${inputState.torque.toFixed(2)} Nm (from: ${_fromConnection || "unknown"})`
    );

    // For components with multiple inputs, we need to handle state combination properly
    // This is a simplified approach - in reality, mechanical systems are more complex
    if (
      this.isDriven &&
      Math.abs(this.targetState.omega) > 0.001 &&
      !isStopping
    ) {
      // Component already has a target state from another input
      // For simplicity, take the average omega and add torques
      console.log(
        `${this.getName()} combining multiple inputs - current target: ${PhysicsSystem.omegaToRPM(this.targetState.omega).toFixed(1)} RPM, new: ${inputRpm.toFixed(1)} RPM`
      );

      this.targetState = {
        omega: (this.targetState.omega + inputState.omega) / 2, // Average speed
        torque: this.targetState.torque + inputState.torque, // Add torques
        direction: inputState.direction, // Use latest direction
        power: (this.targetState.power || 0) + (inputState.power || 0), // Add power
      };

      console.log(
        `${this.getName()} combined target state: ${PhysicsSystem.omegaToRPM(this.targetState.omega).toFixed(1)} RPM, ${this.targetState.torque.toFixed(2)} Nm`
      );
    } else {
      // First input or stopping signal - set as target state
      this.targetState = { ...inputState };
      this.isDriven = true;
    }

    // Decide whether to transition gradually or update immediately
    const omegaDifference = Math.abs(
      this.currentState.omega - this.targetState.omega
    );

    if (omegaDifference > this.transitionThreshold) {
      // Large difference - start gradual transition
      this.isTransitioning = true;
      console.log(
        `🏃 ${this.getName()} starting transition from ${PhysicsSystem.omegaToRPM(this.currentState.omega).toFixed(1)} to ${PhysicsSystem.omegaToRPM(this.targetState.omega).toFixed(1)} RPM`
      );
    } else {
      // Small difference - update immediately for responsive torque transmission
      this.currentState = { ...this.targetState };
      this.isTransitioning = false;
    }

    // CRITICAL: Update mechanicalState immediately so propagateOutput works correctly
    this.mechanicalState = { ...this.currentState };

    console.log(
      `🔧 ${this.getName()} updated mechanicalState: ${PhysicsSystem.omegaToRPM(this.mechanicalState.omega).toFixed(1)} RPM, ${this.mechanicalState.torque.toFixed(2)} Nm, about to propagate`
    );

    // Update physics body based on current state
    if (this.physicsBody) {
      this.physicsBody.setAngularVelocity(this.currentState.omega);
    }

    // Propagate to connected components (avoid infinite loops)
    this.propagateOutput(_fromConnection);
  }

  /**
   * Reset component to idle state (no longer driven)
   * Called when component becomes disconnected
   */
  public resetToIdleState(): void {
    console.log(
      `${this.getName()} reset to idle state - was driven: ${this.isDriven}`
    );

    // Reset driven state first
    this.isDriven = false;

    // Set target state to zero and begin transition
    this.targetState = {
      omega: 0,
      torque: 0,
      direction: 1,
      power: 0,
    };

    // If we have significant motion, transition gradually; otherwise stop immediately
    if (Math.abs(this.currentState.omega) > this.transitionThreshold) {
      this.isTransitioning = true;
      console.log(
        `${this.getName()} starting gradual transition to idle from ${PhysicsSystem.omegaToRPM(this.currentState.omega).toFixed(1)} RPM`
      );
    } else {
      // Stop immediately for very small motions
      this.currentState = { ...this.targetState };
      this.mechanicalState = { ...this.targetState };
      this.isTransitioning = false;
    }

    // Update physics body if it exists
    if (this.physicsBody) {
      this.physicsBody.setAngularVelocity(this.currentState.omega);
    }

    // Propagate stop signal to any remaining connected components
    this.propagateOutput();

    console.log(
      `${this.getName()} reset complete - omega: ${this.mechanicalState.omega}, isDriven: ${this.isDriven}`
    );
  }

  /**
   * Propagate output to connected components
   * Override in derived classes for specific transmission logic
   */
  protected propagateOutput(excludeConnection?: string): void {
    console.log(
      `📡 ${this.getName()} propagating to ${this.connections.size} connections (excluding: ${excludeConnection || "none"})`
    );

    this.connections.forEach((connection, connectionId) => {
      if (connectionId === excludeConnection) {
        console.log(
          `⏭️ ${this.getName()} skipping connection ${connectionId} (excluded)`
        );
        return; // Don't propagate back to source
      }

      console.log(
        `🎯 ${this.getName()} calculating output for connection ${connectionId} to ${connection.component.getName()}`
      );
      const outputState = this.calculateOutputState(connection);
      if (outputState) {
        console.log(
          `➡️ ${this.getName()} sending to ${connection.component.getName()}: ${PhysicsSystem.omegaToRPM(outputState.omega).toFixed(1)} RPM, ${outputState.torque.toFixed(2)} Nm`
        );
        connection.component.applyInput(
          outputState,
          this.findConnectionIdTo(connection.component)
        );
      } else {
        console.log(
          `❌ ${this.getName()} no output state calculated for ${connection.component.getName()}`
        );
      }
    });
  }

  /**
   * Calculate output state for a specific connection
   * Override in derived classes
   */
  protected abstract calculateOutputState(
    connection: ConnectionPoint
  ): MechanicalState | null;

  /**
   * Connect this component to another component
   */
  public connectTo(
    other: MechanicalComponent,
    connectionType: "gear_mesh" | "belt_connection" | "shaft_connection",
    thisPointId?: string,
    otherPointId?: string
  ): boolean {
    // Find available connection points
    const thisPoint = thisPointId
      ? this.connectionPoints.find((p) => p.id === thisPointId)
      : this.connectionPoints.find((p) => p.type === connectionType);

    const otherPoint = otherPointId
      ? other.connectionPoints.find((p) => p.id === otherPointId)
      : other.connectionPoints.find((p) => p.type === connectionType);

    if (!thisPoint || !otherPoint) {
      console.warn(
        `Cannot connect ${this.getName()} to ${other.getName()}: No compatible connection points`
      );
      return false;
    }

    // Create connection
    const connectionId = `${this.getName()}-${other.getName()}-${Date.now()}`;

    this.connections.set(connectionId, {
      id: connectionId,
      component: other,
      type: connectionType,
      position: thisPoint.position,
    });

    other.connections.set(connectionId, {
      id: connectionId,
      component: this,
      type: connectionType,
      position: otherPoint.position,
    });

    return true;
  }

  /**
   * Disconnect from another component
   */
  public disconnectFrom(other: MechanicalComponent): void {
    const connectionId = this.findConnectionIdTo(other);
    if (connectionId) {
      this.connections.delete(connectionId);
      other.connections.delete(connectionId);
    }
  }

  /**
   * Find connection ID to specific component
   */
  protected findConnectionIdTo(
    component: MechanicalComponent
  ): string | undefined {
    for (const [id, connection] of this.connections) {
      if (connection.component === component) {
        return id;
      }
    }
    return undefined;
  }

  /**
   * Update component state
   */
  public update(deltaTime: number): void {
    // Component update called
    super.update(deltaTime);

    // For non-motors, check if we should transition to idle state
    if (this.componentType !== "motor") {
      const currentTime = Date.now();
      const timeSinceLastInput = currentTime - this.lastInputTime;

      // Check if we haven't received input recently (input timeout)
      if (this.isDriven && timeSinceLastInput > this.inputTimeoutDuration) {
        console.log(
          `⏰ ${this.getName()} input timeout (${timeSinceLastInput}ms since last input) - resetting to idle`
        );
        this.isDriven = false;
      }

      // Check if we should transition to idle state when no longer driven
      if (
        !this.isDriven &&
        (Math.abs(this.currentState.omega) > this.transitionThreshold ||
          Math.abs(this.targetState.omega) > this.transitionThreshold)
      ) {
        this.targetState = { omega: 0, torque: 0, direction: 1, power: 0 };
        this.isTransitioning = true;
        console.log(
          `🛑 ${this.getName()} no longer driven - transitioning to idle state`
        );
      }
    }

    // Update mechanical transitions BEFORE updating visuals
    this.updateMechanicalTransitions(deltaTime);

    // Update power calculation (now using current transitioning state)
    this.mechanicalState.power = PhysicsSystem.calculatePower(
      this.mechanicalState.torque,
      this.mechanicalState.omega
    );

    // Update visuals based on current transitioning state
    this.updateVisuals(deltaTime);

    // Synchronize physics body
    if (this.physicsBody) {
      this.syncPhysicsToVisuals();
    }
  }

  /**
   * Handle smooth mechanical transitions for all components
   * Similar to motor transitions but for general mechanical states
   */
  protected updateMechanicalTransitions(deltaTime: number): void {
    if (!this.isTransitioning) {
      // No transition needed, ensure states are synchronized
      this.mechanicalState = { ...this.currentState };
      return;
    }

    const omegaDiff = Math.abs(
      this.currentState.omega - this.targetState.omega
    );

    if (omegaDiff > this.transitionThreshold) {
      // Calculate transition step for omega
      const omegaStep = this.transitionRate * deltaTime;

      if (this.currentState.omega < this.targetState.omega) {
        // Accelerating
        this.currentState.omega = Math.min(
          this.currentState.omega + omegaStep,
          this.targetState.omega
        );
      } else {
        // Decelerating
        this.currentState.omega = Math.max(
          this.currentState.omega - omegaStep,
          this.targetState.omega
        );
      }

      // Interpolate other properties proportionally
      const progress = this.calculateTransitionProgress();
      this.currentState.torque = this.lerp(
        this.currentState.torque,
        this.targetState.torque,
        progress
      );
      this.currentState.direction = this.targetState.direction; // Direction changes immediately
      this.currentState.power = PhysicsSystem.calculatePower(
        this.currentState.torque,
        this.currentState.omega
      );

      // Log transition progress (less frequent to avoid spam)
      if (Math.random() < 0.1) {
        // 10% chance to log each frame
        console.log(
          `🏃 ${this.getName()} transitioning: ${PhysicsSystem.omegaToRPM(this.currentState.omega).toFixed(1)} RPM → ${PhysicsSystem.omegaToRPM(this.targetState.omega).toFixed(1)} RPM`
        );
      }
    } else {
      // Close enough to target - snap to target and stop transitioning
      this.currentState = { ...this.targetState };
      this.isTransitioning = false;

      console.log(
        `✅ ${this.getName()} reached target: ${PhysicsSystem.omegaToRPM(this.currentState.omega).toFixed(1)} RPM`
      );
    }

    // Update the main mechanical state from current state
    this.mechanicalState = { ...this.currentState };

    // Propagate during transitions, but avoid double-propagation
    // Motors need this for their gradual start/stop, and other components need it for coasting
    if (this.isTransitioning) {
      // Only propagate if we haven't just received input (to avoid double-propagation)
      // Motors always propagate during transitions regardless
      if (this.componentType === "motor" || !this.isDriven) {
        this.propagateOutput();
      }
    }
  }

  /**
   * Calculate transition progress (0 to 1) based on how close we are to target
   */
  private calculateTransitionProgress(): number {
    const initialDiff = Math.abs(this.targetState.omega);
    const currentDiff = Math.abs(
      this.currentState.omega - this.targetState.omega
    );

    if (initialDiff === 0) return 1;
    return Math.min(1, Math.max(0, 1 - currentDiff / initialDiff));
  }

  /**
   * Linear interpolation helper
   */
  private lerp(start: number, end: number, progress: number): number {
    return start + (end - start) * Math.min(1, Math.max(0, progress * 0.1)); // Slower interpolation for torque
  }

  /**
   * Update visual representation based on current state
   * Override in derived classes
   */
  protected abstract updateVisuals(deltaTime: number): void;

  /**
   * Synchronize physics body with visual representation
   */
  protected syncPhysicsToVisuals(): void {
    if (this.physicsBody) {
      const position = this.physicsBody.getPosition();
      const angle = this.physicsBody.getAngle();

      this.displayContainer.x = position.x;
      this.displayContainer.y = position.y;
      this.displayContainer.rotation = angle;
    }
  }

  /**
   * Create physics body for this component
   */
  protected createPhysicsBody(world: planck.World): void {
    const bodyDef: planck.BodyDef = {
      type: "dynamic",
      position: planck.Vec2(this.getPosition().x, this.getPosition().y),
      angle: this.getRotation(),
    };

    this.physicsBody = world.createBody(bodyDef);

    // Add circular fixture for most mechanical components
    const fixtureDef: planck.FixtureDef = {
      shape: planck.Circle(this.mechanicalProps.radius || 1),
      density: this.mechanicalProps.mass,
      friction: this.mechanicalProps.friction,
    };

    this.physicsBody.createFixture(fixtureDef);
  }

  /**
   * Update display container position to match GameObject position
   */
  private updateDisplayPosition(): void {
    const pos = this.getPosition();
    this.displayContainer.x = pos.x;
    this.displayContainer.y = pos.y;
    this.displayContainer.rotation = this.getRotation();
    const scale = this.getScale();
    this.displayContainer.scale.set(scale.x, scale.y);
  }

  /**
   * Override setPosition to also update display container
   */
  public setPosition(x: number, y: number) {
    super.setPosition(x, y);
    if (this.displayContainer) {
      this.displayContainer.x = x;
      this.displayContainer.y = y;
    }
    return this;
  }

  /**
   * Override setRotation to also update display container
   */
  public setRotation(rotation: number) {
    super.setRotation(rotation);
    if (this.displayContainer) {
      this.displayContainer.rotation = rotation;
    }
    return this;
  }

  /**
   * Override setScale to also update display container
   */
  public setScale(x: number, y: number) {
    super.setScale(x, y);
    if (this.displayContainer) {
      this.displayContainer.scale.set(x, y);
    }
    return this;
  }

  /**
   * Get display object for rendering
   */
  public displayObject(): Container {
    return this.displayContainer;
  }

  /**
   * Get current mechanical state
   */
  public getMechanicalState(): MechanicalState {
    return { ...this.mechanicalState };
  }

  /**
   * Get mechanical properties
   */
  public getMechanicalProperties(): MechanicalProperties {
    return { ...this.mechanicalProps };
  }

  /**
   * Get component type
   */
  public getComponentType(): MechanicalComponentType {
    return this.componentType;
  }

  /**
   * Get all connections
   */
  public getConnections(): Map<string, ConnectionPoint> {
    return new Map(this.connections);
  }

  /**
   * Check if component can handle the applied torque
   */
  public canHandleTorque(torque: number): boolean {
    return (
      !this.mechanicalProps.maxTorque ||
      Math.abs(torque) <= this.mechanicalProps.maxTorque
    );
  }
}
