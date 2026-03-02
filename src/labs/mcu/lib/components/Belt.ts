import { Graphics, Point } from "pixi.js";
import {
  MechanicalComponent,
  MechanicalProperties,
  ConnectionPoint,
} from "../MechanicalComponent";
import {
  MechanicalState,
  PhysicsSystem,
  PulleyProperties,
} from "../PhysicsSystem";

export interface BeltProperties extends MechanicalProperties {
  maxLength: number;
  width: number;
  tensionCapacity: number; // Maximum tension the belt can handle
  slipCoefficient: number; // Friction coefficient for slip calculation
  arcResolution?: number; // Optional: Number of points per arc segment (default: 6)
}

export interface BeltConnection {
  component: MechanicalComponent;
  radius: number; // Effective radius at connection point
  position: { x: number; y: number }; // World position
}

export class Belt extends MechanicalComponent {
  // Arc resolution configuration constants
  public static readonly DEFAULT_ARC_RESOLUTION = 6; // Default smoothness
  public static readonly MIN_ARC_RESOLUTION = 2; // Minimum for performance
  public static readonly MAX_ARC_RESOLUTION = 16; // Maximum for ultra-smooth belts

  private beltProps: BeltProperties;
  private beltGraphics!: Graphics;
  // statusText removed - no longer needed for belt visualization
  public beltConnections: BeltConnection[] = []; // Made public for EditorScene access
  public isCrossed: boolean = false; // Made public for EditorScene access
  private currentLength: number = 0;
  private tension: number = 0;
  private isSlipping: boolean = false;

  constructor(name: string, props: BeltProperties) {
    super(name, "belt", props);
    this.beltProps = props;

    // Belts have very fast transition rate - minimal inertia
    this.transitionRate = 300; // Very fast transitions for belts (they're flexible)
    this.transitionThreshold = 0.005; // Very low threshold for immediate response
  }

  // Override applyInput to add belt-specific debugging
  public override applyInput(
    inputState: MechanicalState,
    fromConnection?: string
  ): void {
    // Belt received input - just call parent implementation which handles transitions
    super.applyInput(inputState, fromConnection);
  }

  /**
   * Get the effective arc resolution for this belt
   */
  private getArcResolution(): number {
    const resolution =
      this.beltProps.arcResolution ?? Belt.DEFAULT_ARC_RESOLUTION;
    return Math.max(
      Belt.MIN_ARC_RESOLUTION,
      Math.min(Belt.MAX_ARC_RESOLUTION, resolution)
    );
  }

  protected initializeConnectionPoints(): void {
    // Belt has two connection points - input and output
    this.connectionPoints = [
      {
        id: "belt_input",
        component: this,
        type: "belt_connection",
        position: { x: -10, y: 0 }, // Left side for input
      },
      {
        id: "belt_output",
        component: this,
        type: "belt_connection",
        position: { x: 10, y: 0 }, // Right side for output
      },
    ];
  }

  protected createVisuals(): void {
    // Initialize graphics objects
    this.beltGraphics = new Graphics();
    // this.statusText = new Text({
    //   text: "Belt",
    //   style: {
    //     fontSize: 8,
    //     fill: 0xffffff,
    //   },
    // });
    // this.statusText.anchor.set(0.5);

    // Belt visual will be drawn dynamically based on connections
    this.displayContainer.addChild(this.beltGraphics);
    // this.displayContainer.addChild(this.statusText);
  }

  protected updateVisuals(_deltaTime: number): void {
    // Check if graphics objects exist, re-initialize if missing
    if (!this.beltGraphics) {
      this.createVisuals();
      return;
    }

    this.drawBelt();
    // Status text disabled - no need to update it
  }

  private drawBelt(): void {
    this.beltGraphics.clear();

    if (this.beltConnections.length < 2) {
      // Insufficient connections
      return; // Need at least 2 connections to draw a belt
    }

    // Calculate belt path
    const beltPath = this.calculateBeltPath();

    if (beltPath.length < 2) {
      return;
    }

    // Draw belt as realistic line using PIXI.js v8 API
    const strokeColor = this.isSlipping ? 0xff6666 : 0x444444;
    const strokeWidth = Math.max(this.beltProps.width, 2); // Realistic belt thickness

    // Draw the realistic belt path
    for (let i = 0; i < beltPath.length; i++) {
      const point = beltPath[i];

      if (i === 0) {
        this.beltGraphics.moveTo(point.x, point.y);
      } else {
        this.beltGraphics.lineTo(point.x, point.y);
      }
    }

    // Close the belt loop by connecting back to the start
    if (beltPath.length > 2) {
      this.beltGraphics.lineTo(beltPath[0].x, beltPath[0].y);
    }

    // Apply stroke with correct v8 API
    this.beltGraphics.stroke({ width: strokeWidth, color: strokeColor });

    // Force visibility
    this.beltGraphics.visible = true;
    this.displayContainer.visible = true;
  }

  public calculateBeltPath(): Point[] {
    if (this.beltConnections.length < 2) return [];

    const path: Point[] = [];

    if (this.beltConnections.length === 2) {
      // Get actual connection positions (not the stored relative ones)
      const conn1ActualPos = this.getBeltConnectionPosition(
        this.beltConnections[0].component
      );
      const conn2ActualPos = this.getBeltConnectionPosition(
        this.beltConnections[1].component
      );
      const beltPos = this.getPosition();

      // Create connection objects with correct positions for calculation
      const conn1 = {
        ...this.beltConnections[0],
        position: {
          x: conn1ActualPos.x - beltPos.x,
          y: conn1ActualPos.y - beltPos.y,
        },
      };
      const conn2 = {
        ...this.beltConnections[1],
        position: {
          x: conn2ActualPos.x - beltPos.x,
          y: conn2ActualPos.y - beltPos.y,
        },
      };

      // Calculate tangent points between the two pulleys
      const tangentPoints = this.calculateTangentPoints(conn1, conn2);

      if (tangentPoints.length >= 4) {
        // Create a closed belt path that includes tangent lines and arcs
        const beltPath = this.createClosedBeltPath(conn1, conn2, tangentPoints);
        path.push(...beltPath);
      } else {
        // Fallback to simple line
        path.push(new Point(conn1.position.x, conn1.position.y));
        path.push(new Point(conn2.position.x, conn2.position.y));
      }
    } else {
      // Multi-pulley belt (more complex)
      // Use actual connection positions
      const beltPos = this.getPosition();
      for (const conn of this.beltConnections) {
        const actualPos = this.getBeltConnectionPosition(conn.component);
        path.push(new Point(actualPos.x - beltPos.x, actualPos.y - beltPos.y));
      }
    }

    return path;
  }

  private calculateTangentPoints(
    conn1: BeltConnection,
    conn2: BeltConnection
  ): Point[] {
    const dx = conn2.position.x - conn1.position.x;
    const dy = conn2.position.y - conn1.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0 || distance < Math.abs(conn1.radius - conn2.radius)) {
      console.log("  Invalid configuration for tangent calculation");
      return [];
    }

    const points: Point[] = [];

    if (this.isCrossed) {
      // Crossed belt - external tangents
      const radiusSum = conn1.radius + conn2.radius;

      if (distance < radiusSum) {
        console.log("  Crossed belt: pulleys too close together");
        return [];
      }

      const angle = Math.asin(radiusSum / distance);
      const baseAngle = Math.atan2(dy, dx);

      // Calculate tangent points
      const angle1 = baseAngle + angle;
      const angle2 = baseAngle - angle;

      points.push(
        new Point(
          conn1.position.x + conn1.radius * Math.cos(angle1 + Math.PI / 2),
          conn1.position.y + conn1.radius * Math.sin(angle1 + Math.PI / 2)
        )
      );
      points.push(
        new Point(
          conn2.position.x - conn2.radius * Math.cos(angle1 + Math.PI / 2),
          conn2.position.y - conn2.radius * Math.sin(angle1 + Math.PI / 2)
        )
      );
      points.push(
        new Point(
          conn2.position.x - conn2.radius * Math.cos(angle2 - Math.PI / 2),
          conn2.position.y - conn2.radius * Math.sin(angle2 - Math.PI / 2)
        )
      );
      points.push(
        new Point(
          conn1.position.x + conn1.radius * Math.cos(angle2 - Math.PI / 2),
          conn1.position.y + conn1.radius * Math.sin(angle2 - Math.PI / 2)
        )
      );
    } else {
      // Open belt - external tangents
      const radiusDiff = Math.abs(conn1.radius - conn2.radius);

      if (distance < radiusDiff) {
        console.log("  Open belt: distance too small for tangents");
        return [];
      }

      const angle = Math.asin(radiusDiff / distance);
      const baseAngle = Math.atan2(dy, dx);
      const sign = conn1.radius > conn2.radius ? 1 : -1;

      const angle1 = baseAngle + sign * angle;
      const angle2 = baseAngle - sign * angle;

      // Top tangent points
      points.push(
        new Point(
          conn1.position.x + conn1.radius * Math.cos(angle1 + Math.PI / 2),
          conn1.position.y + conn1.radius * Math.sin(angle1 + Math.PI / 2)
        )
      );
      points.push(
        new Point(
          conn2.position.x + conn2.radius * Math.cos(angle1 + Math.PI / 2),
          conn2.position.y + conn2.radius * Math.sin(angle1 + Math.PI / 2)
        )
      );

      // Bottom tangent points
      points.push(
        new Point(
          conn2.position.x + conn2.radius * Math.cos(angle2 - Math.PI / 2),
          conn2.position.y + conn2.radius * Math.sin(angle2 - Math.PI / 2)
        )
      );
      points.push(
        new Point(
          conn1.position.x + conn1.radius * Math.cos(angle2 - Math.PI / 2),
          conn1.position.y + conn1.radius * Math.sin(angle2 - Math.PI / 2)
        )
      );
    }

    return points;
  }

  private createClosedBeltPath(
    conn1: BeltConnection,
    conn2: BeltConnection,
    tangentPoints: Point[]
  ): Point[] {
    if (tangentPoints.length < 4) return [];

    const path: Point[] = [];
    const arcResolution = this.getArcResolution(); // Configurable arc smoothness

    if (this.isCrossed) {
      path.push(tangentPoints[0]); // Start tangent point on first pulley
      path.push(tangentPoints[1]); // End tangent point on second pulley

      // Small arc around second pulley
      const arc2Points = this.calculateArcPoints(
        conn2.position,
        conn2.radius,
        tangentPoints[1],
        tangentPoints[2],
        Math.max(2, Math.ceil(arcResolution * 0.6)), // Proportionally smaller arc for crossed belt
        true // Counter-clockwise - crossed belts wrap opposite directions
      );
      path.push(...arc2Points);

      path.push(tangentPoints[2]); // Return tangent start
      path.push(tangentPoints[3]); // Return tangent end

      // Small arc around first pulley
      const arc1Points = this.calculateArcPoints(
        conn1.position,
        conn1.radius,
        tangentPoints[3],
        tangentPoints[0],
        Math.max(2, Math.ceil(arcResolution * 0.6)), // Proportionally smaller arc for crossed belt
        false // Clockwise - opposite direction from second pulley
      );
      path.push(...arc1Points);
    } else {
      // Open belt: full belt loop

      path.push(tangentPoints[0]); // Top tangent from first pulley
      path.push(tangentPoints[1]); // Top tangent to second pulley

      // Arc around second pulley (bottom half)
      const arc2Points = this.calculateArcPoints(
        conn2.position,
        conn2.radius,
        tangentPoints[1],
        tangentPoints[2],
        arcResolution,
        false // Clockwise - belts naturally wrap clockwise around pulleys
      );
      path.push(...arc2Points);

      path.push(tangentPoints[2]); // Bottom tangent from second pulley
      path.push(tangentPoints[3]); // Bottom tangent to first pulley

      // Arc around first pulley (bottom half)
      const arc1Points = this.calculateArcPoints(
        conn1.position,
        conn1.radius,
        tangentPoints[3],
        tangentPoints[0],
        arcResolution,
        false // Clockwise - belts naturally wrap clockwise around pulleys
      );
      path.push(...arc1Points);
    }

    return path;
  }

  private calculateArcPoints(
    center: { x: number; y: number },
    radius: number,
    startPoint: Point,
    endPoint: Point,
    resolution: number,
    forceDirection?: boolean // true = counter-clockwise, false = clockwise
  ): Point[] {
    const points: Point[] = [];

    // Calculate angles for start and end points
    const startAngle = Math.atan2(
      startPoint.y - center.y,
      startPoint.x - center.x
    );
    const endAngle = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);

    // Calculate delta angle
    let deltaAngle = endAngle - startAngle;

    if (forceDirection !== undefined) {
      // Force specific direction
      if (forceDirection) {
        // Counter-clockwise (positive direction)
        if (deltaAngle < 0) deltaAngle += 2 * Math.PI;
      } else {
        // Clockwise (negative direction)
        if (deltaAngle > 0) deltaAngle -= 2 * Math.PI;
      }
    } else {
      // Go the shorter way around
      if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
      if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
    }

    // Generate arc points
    for (let i = 1; i < resolution; i++) {
      const t = i / resolution;
      const angle = startAngle + deltaAngle * t;
      points.push(
        new Point(
          center.x + radius * Math.cos(angle),
          center.y + radius * Math.sin(angle)
        )
      );
    }

    return points;
  }

  // updateStatusText method removed - status text functionality disabled

  protected calculateOutputState(
    connection: ConnectionPoint
  ): MechanicalState | null {
    // Find the belt connection for the requesting component
    const toConnection = this.beltConnections.find(
      (conn) => conn.component === connection.component
    );
    const fromConnection = this.beltConnections.find(
      (conn) => conn.component !== connection.component
    );

    if (!toConnection || !fromConnection) {
      // Missing connections
      return null;
    }

    // Calculate belt transmission ratio based on pulley sizes
    const ratio = fromConnection.radius / toConnection.radius;
    const isCrossed = this.isCrossed;

    // Calculate output state with ratio and direction
    const outputState: MechanicalState = {
      omega: this.mechanicalState.omega * ratio,
      torque: (this.mechanicalState.torque || 0) / ratio, // Inverse relationship
      direction: isCrossed
        ? -this.mechanicalState.direction
        : this.mechanicalState.direction,
      power: (this.mechanicalState.power || 0) * this.beltProps.efficiency, // Account for belt efficiency
    };

    return outputState;
  }

  /**
   * Connect belt between two components
   */
  public connectBetween(
    comp1: MechanicalComponent,
    comp2: MechanicalComponent,
    comp1Radius: number,
    comp2Radius: number,
    crossed: boolean = false
  ): boolean {
    this.isCrossed = crossed;

    const pos1 = comp1.getPosition();
    const pos2 = comp2.getPosition();
    const beltPos = this.getPosition();

    // Convert world positions to belt-relative coordinates
    const relativePos1 = { x: pos1.x - beltPos.x, y: pos1.y - beltPos.y };
    const relativePos2 = { x: pos2.x - beltPos.x, y: pos2.y - beltPos.y };

    this.beltConnections = [
      {
        component: comp1,
        radius: comp1Radius,
        position: relativePos1,
      },
      {
        component: comp2,
        radius: comp2Radius,
        position: relativePos2,
      },
    ];

    // Calculate belt length using world coordinates for accurate measurement
    this.currentLength = this.calculateBeltLengthWorld(
      pos1,
      pos2,
      comp1Radius,
      comp2Radius
    );

    if (this.currentLength > this.beltProps.maxLength) {
      return false;
    }

    return true;
  }

  /**
   * Connect belt between two components using specific connection positions
   */
  public connectBetweenAtPositions(
    comp1: MechanicalComponent,
    comp2: MechanicalComponent,
    pos1: { x: number; y: number },
    pos2: { x: number; y: number },
    comp1Radius: number,
    comp2Radius: number,
    crossed: boolean = false
  ): boolean {
    this.isCrossed = crossed;

    const beltPos = this.getPosition();

    // Convert world positions to belt-relative coordinates
    const relativePos1 = { x: pos1.x - beltPos.x, y: pos1.y - beltPos.y };
    const relativePos2 = { x: pos2.x - beltPos.x, y: pos2.y - beltPos.y };

    this.beltConnections = [
      {
        component: comp1,
        radius: comp1Radius,
        position: relativePos1,
      },
      {
        component: comp2,
        radius: comp2Radius,
        position: relativePos2,
      },
    ];

    // Calculate belt length using world coordinates for accurate measurement
    this.currentLength = this.calculateBeltLengthWorld(
      pos1,
      pos2,
      comp1Radius,
      comp2Radius
    );

    if (this.currentLength > this.beltProps.maxLength) {
      return false;
    }

    return true;
  }

  /**
   * Update belt connection positions when components move
   */
  /**
   * Get belt connection position for component (offset from center if needed)
   */
  private getBeltConnectionPosition(component: MechanicalComponent): {
    x: number;
    y: number;
  } {
    const basePos = component.getPosition();

    // For motors, offset to pulley position
    if (component.getComponentType() === "motor") {
      return {
        x: basePos.x + 35, // Pulley is at offset (35, 0) from motor center
        y: basePos.y + 0,
      };
    }

    // For forklifts, offset to pulley position (updated for MEGA forklift)
    if (component.getComponentType() === "forklift") {
      return {
        x: basePos.x + -60, // Updated offset for MEGA forklift pulley
        y: basePos.y + -60,
      };
    }

    // For other components, use center position
    return basePos;
  }

  /**
   * Get effective radius for belt connection (matches GameManager logic)
   */
  private getEffectiveRadiusForComponent(
    component: MechanicalComponent
  ): number {
    const props = component.getMechanicalProperties();

    // For motors, use pulley radius
    if (component.getComponentType() === "motor") {
      const motorProps = props as any;
      return motorProps.pulleyRadius || 20;
    }

    // For forklifts, use pulley groove radius (where belt actually sits)
    if (component.getComponentType() === "forklift") {
      const forkliftProps = props as any;
      const pulleyRadius = forkliftProps.pulleyRadius || 35;
      return pulleyRadius - 2; // Belt sits in the groove, not on outer edge
    }

    // For gears, use beltRadius if available and > 0, otherwise fallback to radius
    if (component.getComponentType() === "gear") {
      const beltRadius = (props as any).beltRadius;
      if (beltRadius && beltRadius > 0) {
        return beltRadius;
      }
    }

    // For other components or when beltRadius is not available, use general radius
    return props.radius || 20; // Default radius
  }

  public updateConnectionPositions(): void {
    if (this.beltConnections.length !== 2) return;

    const beltPos = this.getPosition();

    // Update relative positions based on current component connection positions
    this.beltConnections.forEach((connection) => {
      const componentConnectionPos = this.getBeltConnectionPosition(
        connection.component
      );
      connection.position = {
        x: componentConnectionPos.x - beltPos.x,
        y: componentConnectionPos.y - beltPos.y,
      };
    });

    // IMPORTANT: Recalculate effective radius values in case component properties changed
    this.beltConnections[0].radius = this.getEffectiveRadiusForComponent(
      this.beltConnections[0].component
    );
    this.beltConnections[1].radius = this.getEffectiveRadiusForComponent(
      this.beltConnections[1].component
    );

    // Recalculate belt length using connection positions and UPDATED radius values
    const comp1ConnectionPos = this.getBeltConnectionPosition(
      this.beltConnections[0].component
    );
    const comp2ConnectionPos = this.getBeltConnectionPosition(
      this.beltConnections[1].component
    );

    this.currentLength = this.calculateBeltLengthWorld(
      comp1ConnectionPos,
      comp2ConnectionPos,
      this.beltConnections[0].radius, // Now uses updated radius
      this.beltConnections[1].radius // Now uses updated radius
    );

    // Force visual update
    this.updateVisuals(0);
  }

  // TODO: Restore if needed for belt length validation

  private calculateBeltLengthWorld(
    pos1: { x: number; y: number },
    pos2: { x: number; y: number },
    radius1: number,
    radius2: number
  ): number {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const centerDistance = Math.sqrt(dx * dx + dy * dy);

    if (this.isCrossed) {
      // Crossed belt length
      const circumference1 = Math.PI * radius1;
      const circumference2 = Math.PI * radius2;
      return centerDistance * 2 + circumference1 + circumference2;
    } else {
      // Open belt length
      const radiusDiff = Math.abs(radius1 - radius2);
      const tangentLength =
        Math.sqrt(centerDistance * centerDistance - radiusDiff * radiusDiff) *
        2;
      const arcLength1 = Math.PI * radius1;
      const arcLength2 = Math.PI * radius2;
      return tangentLength + arcLength1 + arcLength2;
    }
  }

  /**
   * Transmit power between connected components
   */
  public transmitPower(
    inputState: MechanicalState,
    fromComponent: MechanicalComponent
  ): void {
    if (this.beltConnections.length < 2) {
      // Insufficient connections
      return;
    }

    const fromConn = this.beltConnections.find(
      (conn) => conn.component === fromComponent
    );
    const toConn = this.beltConnections.find(
      (conn) => conn.component !== fromComponent
    );

    if (!fromConn || !toConn) {
      // Could not find connections
      return;
    }

    // Calculate pulley transmission
    const pulleyProps1: PulleyProperties = { radius: fromConn.radius };
    const pulleyProps2: PulleyProperties = { radius: toConn.radius };

    const outputState = PhysicsSystem.pulleyPairTransmission(
      inputState,
      pulleyProps1,
      pulleyProps2,
      this.isCrossed,
      this.beltProps.efficiency
    );

    // Check for belt slip
    this.tension = Math.abs(outputState.torque) / toConn.radius;
    this.isSlipping = !PhysicsSystem.checkBeltSlip(
      outputState.torque,
      this.tension,
      this.beltProps.slipCoefficient,
      toConn.radius
    );

    if (this.isSlipping) {
      // Reduce transmitted torque due to slip
      outputState.torque *= 0.5;
      outputState.power = PhysicsSystem.calculatePower(
        outputState.torque,
        outputState.omega
      );
    }

    // Apply output to target component
    toConn.component.applyInput(outputState);
  }

  /**
   * Get belt properties
   */
  public getBeltProperties(): BeltProperties {
    return { ...this.beltProps };
  }

  /**
   * Check if belt is slipping
   */
  public getIsSlipping(): boolean {
    return this.isSlipping;
  }

  /**
   * Get current belt tension
   */
  public getTension(): number {
    return this.tension;
  }

  /**
   * Get current arc resolution setting
   */
  public getArcResolutionSetting(): number {
    return this.getArcResolution();
  }

  /**
   * Helper method to create belt properties with specific arc resolution
   */
  public static createBeltProps(
    baseProps: Omit<BeltProperties, "arcResolution">,
    arcResolution: number
  ): BeltProperties {
    return {
      ...baseProps,
      arcResolution: Math.max(
        Belt.MIN_ARC_RESOLUTION,
        Math.min(Belt.MAX_ARC_RESOLUTION, arcResolution)
      ),
    };
  }
}
