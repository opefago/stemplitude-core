import { Graphics, Text, Container } from "pixi.js";
import {
  MechanicalComponent,
  MechanicalProperties,
  ConnectionPoint,
} from "../MechanicalComponent";
import {
  MechanicalState,
  PhysicsSystem,
  GearProperties,
} from "../PhysicsSystem";

export interface GearComponentProperties extends MechanicalProperties {
  teeth: number;
  radius: number;
  beltRadius: number; // Slightly smaller than gear radius for belt connections
  // Visual properties for different gear types
  hasTeeth?: boolean; // Whether to show gear teeth (false for pure pulleys)
  hasBeltGroove?: boolean; // Whether to show belt groove (false for gear-only)
  isTimingGear?: boolean; // Whether to show timing gear markings
}

export class Gear extends MechanicalComponent {
  private gearProps: GearComponentProperties;
  private gearGraphics!: Graphics;
  private gearContainer!: Container;
  private statusText!: Text;

  constructor(name: string, props: GearComponentProperties) {
    super(name, "gear", props);
    this.gearProps = props;

    // Ensure belt radius is smaller than gear radius
    if (this.gearProps.beltRadius >= this.gearProps.radius) {
      this.gearProps.beltRadius = this.gearProps.radius * 0.8;
    }

    // Gears have moderate transition rate - heavier gears transition slower
    const massWeight = Math.max(0.5, this.gearProps.radius / 40); // Bigger gears = more inertia
    this.transitionRate = 150 / massWeight; // Base 150 rad/s, adjusted for size
    this.transitionThreshold = 0.02; // Slightly higher threshold for gears
  }

  // Call parent implementation for input handling
  public override applyInput(
    inputState: MechanicalState,
    fromConnection?: string
  ): void {
    super.applyInput(inputState, fromConnection);
  }

  protected initializeConnectionPoints(): void {
    // Gear has multiple connection points around its circumference for gear meshing
    const meshPoints: ConnectionPoint[] = [];
    const numMeshPoints = 8; // 8 possible meshing positions around the gear

    // Use base class mechanicalProps since gearProps isn't set yet
    const gearProps = this.mechanicalProps as GearComponentProperties;
    const radius = gearProps.radius || 20; // Default fallback
    const beltRadius = gearProps.beltRadius || 16; // Default fallback

    for (let i = 0; i < numMeshPoints; i++) {
      const angle = (i * Math.PI * 2) / numMeshPoints;
      meshPoints.push({
        id: `gear_mesh_${i}`,
        component: this,
        type: "gear_mesh",
        position: {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        },
      });
    }

    // Belt connection points (fewer points, at belt radius)
    const beltPoints: ConnectionPoint[] = [];
    const numBeltPoints = 4; // 4 possible belt connection positions

    for (let i = 0; i < numBeltPoints; i++) {
      const angle = (i * Math.PI * 2) / numBeltPoints;
      beltPoints.push({
        id: `belt_connection_${i}`,
        component: this,
        type: "belt_connection",
        position: {
          x: Math.cos(angle) * beltRadius,
          y: Math.sin(angle) * beltRadius,
        },
      });
    }

    // Add shaft connection at center for motor connections
    const shaftPoint: ConnectionPoint = {
      id: "shaft_connection",
      component: this,
      type: "shaft_connection",
      position: { x: 0, y: 0 }, // Center of gear
    };

    this.connectionPoints = [...meshPoints, ...beltPoints, shaftPoint];
  }

  protected createVisuals(): void {
    // Creating gear visuals

    // Initialize graphics objects
    this.gearGraphics = new Graphics();
    this.gearContainer = new Container();
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

    this.createGearVisual();

    // Status text positioning - positioned more dynamically to avoid overlaps
    const gearProps = this.mechanicalProps as GearComponentProperties;
    const gearRadius = gearProps.radius || 20;
    this.statusText.x = 0;
    this.statusText.y = gearRadius + Math.max(30, gearRadius * 0.7); // Dynamic spacing based on gear size

    // Add gear graphics to the rotating gear container
    this.gearContainer.addChild(this.gearGraphics);

    // Simple text-based rotation display - no separate indicator needed

    // Add both containers to the main display container
    this.displayContainer.addChild(this.gearContainer);
    this.displayContainer.addChild(this.statusText);
  }

  private createGearVisual(): void {
    this.gearGraphics.clear();

    // Cast to access gear-specific properties
    const gearProps = this.mechanicalProps as GearComponentProperties;

    // Visual properties with defaults
    const hasTeeth = gearProps.hasTeeth !== false; // Default to true
    const hasBeltGroove = gearProps.hasBeltGroove !== false; // Default to true
    const isTimingGear = gearProps.isTimingGear === true; // Default to false

    console.log(
      `🎨 Creating gear visual for ${this.getName()}: teeth=${hasTeeth}, groove=${hasBeltGroove}, timing=${isTimingGear}`
    );

    // Draw gear teeth (if applicable)
    if (hasTeeth) {
      this.drawGearTeeth();
    } else {
      // For non-toothed components, draw as smooth pulley
      this.gearGraphics.circle(0, 0, gearProps.radius || 20).fill(0x777777);
    }

    // Draw belt groove (inner circle for belt) - only if component supports belts
    if (hasBeltGroove) {
      const grooveColor = isTimingGear ? 0x2ecc71 : 0x555555; // Green for timing gears
      const grooveWidth = isTimingGear ? 3 : 2; // Thicker groove for timing gears

      this.gearGraphics
        .circle(0, 0, gearProps.beltRadius || 16)
        .stroke({ width: grooveWidth, color: grooveColor });

      // Add timing marks for timing gears
      if (isTimingGear) {
        this.drawTimingMarks();
      }
    }

    // Draw center hub
    const hubColor = isTimingGear ? 0x27ae60 : 0x888888; // Darker green for timing gear hubs
    this.gearGraphics
      .circle(0, 0, Math.min(8, (gearProps.radius || 20) * 0.2))
      .fill(hubColor);

    // Add gear label with tooth count (only for toothed gears)
    if (hasTeeth) {
      const label = new Text({
        text: (gearProps.teeth || 12).toString(),
        style: {
          fontSize: Math.max(8, Math.min(12, (gearProps.radius || 20) / 3)),
          fill: 0x000000,
        },
      });
      label.anchor.set(0.5);
      this.gearContainer.addChild(label);
    } else {
      // For pulleys, show diameter or belt indication
      const label = new Text({
        text: "P", // P for Pulley
        style: {
          fontSize: Math.max(8, Math.min(12, (gearProps.radius || 20) / 3)),
          fill: 0x000000,
        },
      });
      label.anchor.set(0.5);
      this.gearContainer.addChild(label);
    }
  }

  private drawGearTeeth(): void {
    const gearProps = this.mechanicalProps as GearComponentProperties;
    const numTeeth = gearProps.teeth || 12;
    const radius = gearProps.radius || 20;
    const innerRadius = radius * 0.9;
    const outerRadius = radius;

    // Draw gear body
    this.gearGraphics.circle(0, 0, innerRadius).fill(0x777777);

    // Draw teeth
    this.gearGraphics.fill(0x777777);
    for (let i = 0; i < numTeeth; i++) {
      const angle = (i * Math.PI * 2) / numTeeth;
      const toothWidth = (Math.PI / numTeeth) * 0.6; // 60% of space for tooth, 40% for gap

      // Create tooth shape
      const startAngle = angle - toothWidth / 2;
      const endAngle = angle + toothWidth / 2;

      // Draw tooth as a trapezoid
      this.gearGraphics.moveTo(
        Math.cos(startAngle) * innerRadius,
        Math.sin(startAngle) * innerRadius
      );
      this.gearGraphics.lineTo(
        Math.cos(startAngle) * outerRadius,
        Math.sin(startAngle) * outerRadius
      );
      this.gearGraphics.lineTo(
        Math.cos(endAngle) * outerRadius,
        Math.sin(endAngle) * outerRadius
      );
      this.gearGraphics.lineTo(
        Math.cos(endAngle) * innerRadius,
        Math.sin(endAngle) * innerRadius
      );
    }
    // End fill is automatic with new API
  }

  private drawTimingMarks(): void {
    const gearProps = this.mechanicalProps as GearComponentProperties;
    const radius = gearProps.beltRadius || 16;
    const numMarks = Math.min(20, Math.max(8, Math.floor(radius / 2))); // Scale marks with size

    // Draw timing marks around the belt groove
    for (let i = 0; i < numMarks; i++) {
      const angle = (i * Math.PI * 2) / numMarks;
      const innerRadius = radius - 3;
      const outerRadius = radius + 1;

      this.gearGraphics
        .moveTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius)
        .lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius)
        .stroke({ width: 1, color: 0x2ecc71 });
    }
  }

  protected updateVisuals(deltaTime: number): void {
    // Check if graphics objects exist, re-initialize if missing
    if (!this.gearGraphics || !this.gearContainer || !this.statusText) {
      console.log(
        `⚙️ ${this.getName()}: Re-initializing missing graphics objects`
      );
      this.createVisuals();
      return;
    }

    // Calculate display values
    const rpm = PhysicsSystem.omegaToRPM(Math.abs(this.mechanicalState.omega));
    const hasSignificantTorque = Math.abs(this.mechanicalState.torque) > 0.1;

    // ALWAYS log when gear should be rotating but might not be
    if (rpm > 10) {
      console.log(
        `⚙️ ${this.getName()}: Should rotate at ${rpm.toFixed(1)} RPM, omega=${this.mechanicalState.omega.toFixed(4)}`
      );
    }

    // Rotate only the gear container (gear + tooth label), keeping status text readable
    if (Math.abs(this.mechanicalState.omega) > 0.001) {
      // Rotate just the gear container so status text stays readable
      this.gearContainer.rotation += this.mechanicalState.omega * deltaTime;

      if (rpm > 10) {
        console.log(
          `⚙️ ${this.getName()}: ROTATING - gearContainer.rotation=${this.gearContainer.rotation.toFixed(3)}, omega=${this.mechanicalState.omega.toFixed(4)}`
        );
      }
    } else if (rpm > 1) {
      console.log(
        `⚙️ ${this.getName()}: HIGH RPM (${rpm.toFixed(1)}) but LOW OMEGA (${this.mechanicalState.omega.toFixed(6)}) - not rotating visually`
      );
    }

    // Update status text with direction
    if (rpm > 0.1) {
      const direction = this.mechanicalState.omega >= 0 ? "CW" : "CCW";
      this.statusText.text = `${rpm.toFixed(0)} RPM ${direction}`;
    } else {
      this.statusText.text = "0";
    }

    // Color based on load
    if (hasSignificantTorque) {
      this.statusText.style.fill = 0x00ff00; // Green when active
    } else {
      this.statusText.style.fill = 0xcccccc; // Gray when idle
    }
  }

  protected calculateOutputState(
    connection: ConnectionPoint
  ): MechanicalState | null {
    const connectedComponent = connection.component;

    console.log(
      `Gear ${this.getName()} calculateOutputState: to ${connectedComponent.getName()}, connection.type=${connection.type}, my omega=${this.mechanicalState.omega}, torque=${this.mechanicalState.torque}`
    );

    if (
      connection.type === "gear_mesh" &&
      connectedComponent.getComponentType() === "gear"
    ) {
      // Gear meshing calculation
      const otherGear = connectedComponent as Gear;
      const otherProps = otherGear.getGearProperties();

      const thisGearProps: GearProperties = {
        teeth: this.gearProps.teeth,
        radius: this.gearProps.radius,
      };

      const otherGearProps: GearProperties = {
        teeth: otherProps.teeth,
        radius: otherProps.radius,
      };

      const outputState = PhysicsSystem.gearPairTransmission(
        this.mechanicalState,
        thisGearProps,
        otherGearProps,
        this.gearProps.efficiency
      );

      console.log(
        `Gear ${this.getName()} returning gear mesh output: omega=${outputState?.omega}, torque=${outputState?.torque}`
      );

      return outputState;
    } else if (
      connection.type === "belt_connection" ||
      connection.type === "shaft_connection"
    ) {
      // Belt/shaft connection - output same as input (belt handles the transmission, shaft is direct)
      const outputState = {
        omega: this.mechanicalState.omega,
        torque: this.mechanicalState.torque,
        direction: this.mechanicalState.direction,
        power: this.mechanicalState.power,
      };

      console.log(
        `Gear ${this.getName()} returning belt/shaft output: omega=${outputState.omega}, torque=${outputState.torque}`
      );

      return outputState;
    }

    console.log(
      `Gear ${this.getName()} returning null - no matching connection type`
    );
    return null;
  }

  /**
   * Check if this gear can mesh with another gear
   */
  public canMeshWith(otherGear: Gear): boolean {
    const distance = this.getDistanceTo(otherGear);
    const requiredDistance = this.gearProps.radius + otherGear.gearProps.radius;
    const tolerance = requiredDistance * 0.1; // 10% tolerance

    return Math.abs(distance - requiredDistance) <= tolerance;
  }

  /**
   * Get distance to another component
   */
  private getDistanceTo(other: MechanicalComponent): number {
    const thisPos = this.getPosition();
    const otherPos = other.getPosition();

    return Math.sqrt(
      Math.pow(otherPos.x - thisPos.x, 2) + Math.pow(otherPos.y - thisPos.y, 2)
    );
  }

  /**
   * Get gear-specific properties
   */
  public getGearProperties(): GearComponentProperties {
    return { ...this.gearProps };
  }

  /**
   * Calculate gear ratio with another gear
   */
  public getGearRatio(otherGear: Gear): number {
    return this.gearProps.teeth / otherGear.gearProps.teeth;
  }

  /**
   * Override connectTo to validate gear meshing
   */
  public connectTo(
    other: MechanicalComponent,
    connectionType: "gear_mesh" | "belt_connection" | "shaft_connection",
    thisPointId?: string,
    otherPointId?: string
  ): boolean {
    if (connectionType === "gear_mesh" && other.getComponentType() === "gear") {
      const otherGear = other as Gear;
      if (!this.canMeshWith(otherGear)) {
        console.warn(
          `Gears ${this.getName()} and ${other.getName()} are not positioned correctly for meshing`
        );
        return false;
      }
    }

    return super.connectTo(other, connectionType, thisPointId, otherPointId);
  }

  /**
   * Get current rotation in degrees (for debugging/visualization)
   */
  public getRotationDegrees(): number {
    return (this.gearContainer.rotation * 180) / Math.PI;
  }
}
