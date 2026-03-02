import { Graphics, Text } from "pixi.js";
import {
  MechanicalComponent,
  MechanicalProperties,
  ConnectionPoint,
} from "../MechanicalComponent";
import { MechanicalState, PhysicsSystem } from "../PhysicsSystem";

export interface PulleyComponentProperties extends MechanicalProperties {
  radius: number;
  grooveDepth: number;
}

export class Pulley extends MechanicalComponent {
  private pulleyProps: PulleyComponentProperties;
  private pulleyGraphics!: Graphics;
  private statusText!: Text;
  private rotationAccumulator: number = 0;

  constructor(name: string, props: PulleyComponentProperties) {
    super(name, "pulley", props);
    this.pulleyProps = props;

    // Pulleys have fast transition rate - they're typically lighter than gears
    this.transitionRate = 200; // Fast transitions for pulleys
    this.transitionThreshold = 0.015; // Lower threshold for responsive pulley action
  }

  protected initializeConnectionPoints(): void {
    // Pulley has belt connection points around its circumference
    const beltPoints: ConnectionPoint[] = [];
    const numBeltPoints = 6; // 6 possible belt connection positions

    // Use base class mechanicalProps since pulleyProps isn't set yet
    const pulleyProps = this.mechanicalProps as PulleyComponentProperties;
    const radius = pulleyProps.radius || 15; // Default fallback

    for (let i = 0; i < numBeltPoints; i++) {
      const angle = (i * Math.PI * 2) / numBeltPoints;
      beltPoints.push({
        id: `belt_connection_${i}`,
        component: this,
        type: "belt_connection",
        position: {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        },
      });
    }

    // Add shaft connection at center
    beltPoints.push({
      id: "shaft_connection",
      component: this,
      type: "shaft_connection",
      position: { x: 0, y: 0 },
    });

    this.connectionPoints = beltPoints;
  }

  protected createVisuals(): void {
    // Creating pulley visuals

    // Initialize graphics objects
    this.pulleyGraphics = new Graphics();
    this.statusText = new Text({
      text: "0",
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

    // Graphics objects created

    this.createPulleyVisual();

    // Status text - positioned dynamically based on pulley size
    const pulleyProps = this.mechanicalProps as PulleyComponentProperties;
    const radius = pulleyProps.radius || 15;
    this.statusText.x = 0;
    this.statusText.y = radius + Math.max(25, radius * 0.8); // Dynamic spacing based on pulley size

    // Simple text-based rotation display - no separate indicator needed

    // Add to container
    this.displayContainer.addChild(this.pulleyGraphics);
    this.displayContainer.addChild(this.statusText);

    // Visual creation completed
  }

  private createPulleyVisual(): void {
    this.pulleyGraphics.clear();

    // Cast to access pulley-specific properties
    const pulleyProps = this.mechanicalProps as PulleyComponentProperties;
    const radius = pulleyProps.radius || 15;
    const grooveDepth = pulleyProps.grooveDepth || 2;

    // Draw pulley body
    this.pulleyGraphics.circle(0, 0, radius).fill(0x666666);

    // Draw groove for belt
    this.pulleyGraphics
      .circle(0, 0, radius - grooveDepth)
      .stroke({ width: grooveDepth * 2, color: 0x444444 });

    // Draw center hub
    this.pulleyGraphics.circle(0, 0, Math.min(6, radius * 0.3)).fill(0x888888);

    // Add spokes for visual detail
    const numSpokes = 4;
    for (let i = 0; i < numSpokes; i++) {
      const angle = (i * Math.PI * 2) / numSpokes;
      const innerRadius = Math.min(6, radius * 0.3);
      const outerRadius = radius * 0.8;

      this.pulleyGraphics
        .moveTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius)
        .lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius)
        .stroke({ width: 2, color: 0x999999 });
    }
  }

  protected updateVisuals(deltaTime: number): void {
    // Updating pulley visuals

    // Check if graphics objects exist, re-initialize if missing
    if (!this.pulleyGraphics || !this.statusText) {
      // Re-initializing missing graphics
      this.createVisuals();
      return;
    }

    // Rotate pulley based on angular velocity
    if (Math.abs(this.mechanicalState.omega) > 0.01) {
      this.rotationAccumulator += this.mechanicalState.omega * deltaTime;
      this.pulleyGraphics.rotation = this.rotationAccumulator;
      // Pulley rotating
    }

    // Update status text with direction
    const rpm = PhysicsSystem.omegaToRPM(Math.abs(this.mechanicalState.omega));
    if (rpm > 0.1) {
      const direction = this.mechanicalState.omega >= 0 ? "CW" : "CCW";
      this.statusText.text = `${rpm.toFixed(0)} RPM ${direction}`;
    } else {
      this.statusText.text = "0";
    }
    // Status text updated

    // Color based on load
    if (Math.abs(this.mechanicalState.torque) > 0.1) {
      this.statusText.style.fill = 0x00ff00; // Green when active
    } else {
      this.statusText.style.fill = 0xcccccc; // Gray when idle
    }
  }

  protected calculateOutputState(
    connection: ConnectionPoint
  ): MechanicalState | null {
    // Calculating output state

    if (
      connection.type === "belt_connection" ||
      connection.type === "shaft_connection"
    ) {
      // Pulley transmits power directly (belt handles ratios)
      const outputState = {
        omega: this.mechanicalState.omega,
        torque: this.mechanicalState.torque,
        direction: this.mechanicalState.direction,
        power: this.mechanicalState.power,
      };
      // Returning output state
      return outputState;
    }

    // Wrong connection type
    return null;

    return null;
  }

  /**
   * Get pulley-specific properties
   */
  public getPulleyProperties(): PulleyComponentProperties {
    return { ...this.pulleyProps };
  }
}
