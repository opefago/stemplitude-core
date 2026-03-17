import { Application } from "pixi.js";
import GameObject from "./GameObject";
import { MechanicalComponent } from "./MechanicalComponent";
import { ConnectionSystem } from "./ConnectionSystem";
import { Belt, BeltProperties } from "./components/Belt";
import { SceneManager } from "./SceneManager";
import * as planck from "planck";

export default class GameManager {
  private app: Application;
  private sceneManager: SceneManager;
  // Object management now handled by SceneManager
  private mechanicalComponents: Map<string, MechanicalComponent>; // DEPRECATED - use sceneManager instead
  private connectionSystem: ConnectionSystem;
  private physicsWorld: planck.World;
  private physicsTimeStep: number = 1 / 60; // 60 FPS physics
  private physicsAccumulator: number = 0;

  private constructor(app: Application) {
    this.app = app;
    this.mechanicalComponents = new Map(); // DEPRECATED - keeping for backward compatibility temporarily
    this.connectionSystem = new ConnectionSystem();

    // Initialize physics world
    this.physicsWorld = planck.World(planck.Vec2(0, 9.81)); // Gravity pointing down

    // Initialize SceneManager
    this.sceneManager = new SceneManager();

    this.init();
  }

  public static create(app: Application): GameManager {
    return GameManager.getInstance(app);
  }

  public static instance: GameManager | null = null;
  public static getInstance(app?: Application): GameManager {
    if (!GameManager.instance) {
      if (!app) {
        throw new Error(
          "Application instance is required for the first initialization."
        );
      }
      GameManager.instance = new GameManager(app);
    }
    return GameManager.instance;
  }

  public getApp(): Application {
    return this.app;
  }

  private init() {
    this.app.ticker.add((time) => this.update(time.deltaTime));
    this.setupCamera();
  }

  private setupCamera() {
    // Center the stage to show components properly
    this.centerCameraOnComponents();

    // Listen for window resize to keep components centered
    window.addEventListener("resize", () => {
      setTimeout(() => this.centerCameraOnComponents(), 100);
    });
  }

  private centerCameraOnComponents() {
    const centerX = this.app.screen.width / 2;
    const centerY = this.app.screen.height / 2;

    const mechanicalComponents = this.sceneManager.getAllMechanicalComponents();
    if (mechanicalComponents.size > 0) {
      // Calculate bounds of all components
      let minX = Infinity,
        maxX = -Infinity;
      let minY = Infinity,
        maxY = -Infinity;

      mechanicalComponents.forEach((component) => {
        const pos = component.getPosition();
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
      });

      // Center on the bounding box of components
      const componentCenterX = (minX + maxX) / 2;
      const componentCenterY = (minY + maxY) / 2;

      this.app.stage.position.set(
        centerX - componentCenterX,
        centerY - componentCenterY
      );
    } else {
      // Default positioning when no components - center stage at screen center
      // This ensures that world coordinate (0,0) appears at the center of the screen
      this.app.stage.position.set(centerX, centerY);
    }
  }

  private update(delta: number) {
    // Fixed timestep physics simulation
    this.physicsAccumulator += delta * 0.016; // Convert to seconds (assuming 60 FPS)

    while (this.physicsAccumulator >= this.physicsTimeStep) {
      // Step physics world
      this.physicsWorld.step(this.physicsTimeStep);

      // Update connection system
      this.connectionSystem.updateNetworks(this.physicsTimeStep);

      this.physicsAccumulator -= this.physicsTimeStep;
    }

    // Update all scene objects through SceneManager
    this.sceneManager.update(delta);
  }

  public getApplication() {
    return this.app;
  }

  // DEPRECATED: Use sceneManager.addMechanicalComponent() instead
  public addMechanicalComponent(name: string, component: MechanicalComponent) {
    console.warn(
      "DEPRECATED: Use sceneManager.addMechanicalComponent() instead"
    );
    this.sceneManager.addMechanicalComponent(name, component);
  }

  // DEPRECATED: Use sceneManager.removeMechanicalComponent() instead
  public removeMechanicalComponent(name: string) {
    console.warn(
      "DEPRECATED: Use sceneManager.removeMechanicalComponent() instead"
    );
    this.sceneManager.removeMechanicalComponent(name);
  }

  /**
   * Get the current SceneManager
   */
  public getSceneManager(): SceneManager {
    return this.sceneManager;
  }

  /**
   * Connect two components directly (called by SceneManager)
   */
  public connectComponentsDirect(
    comp1: MechanicalComponent,
    comp2: MechanicalComponent,
    connectionType: "gear_mesh" | "belt_connection" | "shaft_connection"
  ): boolean {
    if (connectionType === "gear_mesh") {
      // Use direct connection for gears (old system)
      return comp1.connectTo(comp2, connectionType);
    } else {
      // Use ConnectionSystem for other types (if needed)
      return this.connectionSystem.connect(comp1, comp2, connectionType);
    }
  }

  /**
   * Create belt connection for SceneManager (returns belt to be added to scene)
   */
  public createBeltConnectionForScene(
    sceneManager: SceneManager,
    comp1Name: string,
    comp2Name: string,
    beltProps: BeltProperties,
    options?: {
      radius1?: number;
      radius2?: number;
      crossed?: boolean;
    }
  ): boolean {
    const comp1 = sceneManager.getMechanicalComponent(comp1Name);
    const comp2 = sceneManager.getMechanicalComponent(comp2Name);

    if (!comp1 || !comp2) {
      console.warn(
        `Cannot find components for belt connection: ${comp1Name}, ${comp2Name}`
      );
      return false;
    }

    // Create Belt component
    const beltName = `belt_${comp1Name}_${comp2Name}`;
    const belt = new Belt(beltName, beltProps);

    // Set belt position to midpoint between components for proper centering
    const pos1 = comp1.getPosition();
    const pos2 = comp2.getPosition();
    const midX = (pos1.x + pos2.x) / 2;
    const midY = (pos1.y + pos2.y) / 2;
    belt.setPosition(midX, midY);

    // Add belt to scene via SceneManager
    sceneManager.addMechanicalComponent(beltName, belt);

    // Set up belt visual connections
    const radius1 = options?.radius1 || this.getEffectiveRadius(comp1);
    const radius2 = options?.radius2 || this.getEffectiveRadius(comp2);

    belt.connectBetweenAtPositions(
      comp1,
      comp2,
      pos1,
      pos2,
      radius1,
      radius2,
      options?.crossed
    );

    console.log(
      `Created belt mechanical component: ${beltName} connecting ${comp1Name} to ${comp2Name}`
    );

    // Create direct connections for old propagation system
    // Connect comp1 -> belt -> comp2
    const belt_connection_1 = comp1.connectTo(belt, "belt_connection");
    const belt_connection_2 = belt.connectTo(comp2, "belt_connection");

    if (belt_connection_1 && belt_connection_2) {
      console.log(
        `Successfully created old-style belt connections: ${comp1Name} -> ${beltName} -> ${comp2Name}`
      );
      return true;
    } else {
      console.error(`Failed to create old-style belt connections`);
      return false;
    }
  }

  /**
   * Connect two mechanical components
   */
  public connectComponents(
    comp1Name: string,
    comp2Name: string,
    connectionType: "gear_mesh" | "belt_connection" | "shaft_connection",
    options?: { point1?: string; point2?: string }
  ): boolean {
    const comp1 = this.mechanicalComponents.get(comp1Name);
    const comp2 = this.mechanicalComponents.get(comp2Name);

    if (!comp1 || !comp2) {
      console.warn(`Cannot find components: ${comp1Name}, ${comp2Name}`);
      return false;
    }

    return this.connectionSystem.connect(comp1, comp2, connectionType, options);
  }

  /**
   * Disconnect two mechanical components
   */
  public disconnectComponents(comp1Name: string, comp2Name: string): boolean {
    const comp1 = this.mechanicalComponents.get(comp1Name);
    const comp2 = this.mechanicalComponents.get(comp2Name);

    if (!comp1 || !comp2) {
      return false;
    }

    return this.connectionSystem.disconnect(comp1, comp2);
  }

  // DEPRECATED: Use sceneManager.getMechanicalComponent() instead
  public getMechanicalComponent(name: string): MechanicalComponent | undefined {
    console.warn(
      "DEPRECATED: Use sceneManager.getMechanicalComponent() instead"
    );
    return this.sceneManager.getMechanicalComponent(name);
  }

  // DEPRECATED: Use sceneManager.getAllMechanicalComponents() instead
  public getAllMechanicalComponents(): Map<string, MechanicalComponent> {
    console.warn(
      "DEPRECATED: Use sceneManager.getAllMechanicalComponents() instead"
    );
    return this.sceneManager.getAllMechanicalComponents();
  }

  // DEPRECATED: Use sceneManager.getAllGameObjects() instead
  public getAllGameObjects(): Map<string, GameObject> {
    console.warn("DEPRECATED: Use sceneManager.getAllGameObjects() instead");
    return this.sceneManager.getAllGameObjects();
  }

  /**
   * Manually recenter the camera on all components
   */
  public recenterCamera(): void {
    this.centerCameraOnComponents();
  }

  /**
   * Reset camera to initial position (world origin at screen center)
   */
  public resetCamera(): void {
    const centerX = this.app.screen.width / 2;
    const centerY = this.app.screen.height / 2;

    // Reset stage position so world coordinate (0,0) is at screen center
    this.app.stage.position.set(centerX, centerY);

    // Reset scale to 1:1
    this.app.stage.scale.set(1, 1);

    console.log(`Camera reset - Stage positioned at (${centerX}, ${centerY})`);
  }

  /**
   * Zoom in on the canvas from center (for buttons)
   */
  public zoomIn(factor: number = 1.2): void {
    const stage = this.app.stage;
    const newScale = Math.min(stage.scale.x * factor, 5); // Max zoom 5x

    // Zoom towards screen center
    const centerX = this.app.screen.width / 2;
    const centerY = this.app.screen.height / 2;

    // Calculate world position at screen center before scaling
    const worldPosX = (centerX - stage.position.x) / stage.scale.x;
    const worldPosY = (centerY - stage.position.y) / stage.scale.y;

    // Apply new scale
    stage.scale.set(newScale, newScale);

    // Adjust position to keep the same world point at screen center
    stage.position.set(
      centerX - worldPosX * newScale,
      centerY - worldPosY * newScale
    );
  }

  /**
   * Zoom in on the canvas towards a specific screen position (for scroll wheel)
   */
  public zoomInToPoint(
    screenX: number,
    screenY: number,
    factor: number = 1.2
  ): void {
    const stage = this.app.stage;
    const newScale = Math.min(stage.scale.x * factor, 5); // Max zoom 5x

    // Calculate world position at the mouse cursor before scaling
    const worldPosX = (screenX - stage.position.x) / stage.scale.x;
    const worldPosY = (screenY - stage.position.y) / stage.scale.y;

    // Apply new scale
    stage.scale.set(newScale, newScale);

    // Adjust position to keep the same world point at the cursor position
    stage.position.set(
      screenX - worldPosX * newScale,
      screenY - worldPosY * newScale
    );
  }

  /**
   * Zoom out on the canvas from center (for buttons)
   */
  public zoomOut(factor: number = 0.8): void {
    const stage = this.app.stage;
    const newScale = Math.max(stage.scale.x * factor, 0.1); // Min zoom 0.1x

    // Zoom towards screen center
    const centerX = this.app.screen.width / 2;
    const centerY = this.app.screen.height / 2;

    // Calculate world position at screen center before scaling
    const worldPosX = (centerX - stage.position.x) / stage.scale.x;
    const worldPosY = (centerY - stage.position.y) / stage.scale.y;

    // Apply new scale
    stage.scale.set(newScale, newScale);

    // Adjust position to keep the same world point at screen center
    stage.position.set(
      centerX - worldPosX * newScale,
      centerY - worldPosY * newScale
    );
  }

  /**
   * Zoom out on the canvas away from a specific screen position (for scroll wheel)
   */
  public zoomOutFromPoint(
    screenX: number,
    screenY: number,
    factor: number = 0.8
  ): void {
    const stage = this.app.stage;
    const newScale = Math.max(stage.scale.x * factor, 0.1); // Min zoom 0.1x

    // Calculate world position at the mouse cursor before scaling
    const worldPosX = (screenX - stage.position.x) / stage.scale.x;
    const worldPosY = (screenY - stage.position.y) / stage.scale.y;

    // Apply new scale
    stage.scale.set(newScale, newScale);

    // Adjust position to keep the same world point at the cursor position
    stage.position.set(
      screenX - worldPosX * newScale,
      screenY - worldPosY * newScale
    );
  }

  /**
   * Pan the camera by a given offset
   */
  public panCamera(deltaX: number, deltaY: number): void {
    this.app.stage.position.x += deltaX;
    this.app.stage.position.y += deltaY;
  }

  /**
   * Get current zoom level
   */
  public getZoomLevel(): number {
    return this.app.stage.scale.x;
  }

  /**
   * Get current camera position
   */
  public getCameraPosition(): { x: number; y: number } {
    return {
      x: this.app.stage.position.x,
      y: this.app.stage.position.y,
    };
  }

  // Debug function to show all connections
  public debugConnections() {
    console.log("=== DEBUG: All Component Connections ===");
    const mechanicalComponents = this.sceneManager.getAllMechanicalComponents();
    mechanicalComponents.forEach((component, name) => {
      const connections = component.getConnections();
      console.log(
        `${name} (${component.getComponentType()}): ${connections.size} connections`
      );
      connections.forEach((connection, id) => {
        console.log(
          `  -> ${id}: ${connection.component.getName()} (${connection.type})`
        );
      });
    });
    console.log("=== END DEBUG ===");
  }

  /**
   * Get connection system
   */
  public getConnectionSystem(): ConnectionSystem {
    return this.connectionSystem;
  }

  /**
   * Get physics world
   */
  public getPhysicsWorld(): planck.World {
    return this.physicsWorld;
  }

  /**
   * Get effective radius for belt connections
   */
  private getEffectiveRadius(component: MechanicalComponent): number {
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

    // For forklifts, offset to pulley position (updated for MEGA size)
    if (component.getComponentType() === "forklift") {
      return {
        x: basePos.x + -60, // Updated offset for MEGA forklift
        y: basePos.y + -60,
      };
    }

    // For other components, use center position
    return basePos;
  }

  /**
   * Create a belt connection between two components
   */
  public createBeltConnection(
    comp1Name: string,
    comp2Name: string,
    beltProps: BeltProperties,
    options?: {
      radius1?: number;
      radius2?: number;
      crossed?: boolean;
    }
  ): boolean {
    const comp1 = this.mechanicalComponents.get(comp1Name);
    const comp2 = this.mechanicalComponents.get(comp2Name);

    if (!comp1 || !comp2) {
      console.warn(
        `Cannot find components for belt connection: ${comp1Name}, ${comp2Name}`
      );
      return false;
    }

    // Create Belt component for visual representation only
    const beltName = `belt_${comp1Name}_${comp2Name}`;
    const belt = new Belt(beltName, beltProps);

    // Set belt position to midpoint between connection points for proper centering
    const pos1 = this.getBeltConnectionPosition(comp1);
    const pos2 = this.getBeltConnectionPosition(comp2);
    const midX = (pos1.x + pos2.x) / 2;
    const midY = (pos1.y + pos2.y) / 2;
    belt.setPosition(midX, midY);

    // Add belt as a mechanical component for old propagation system
    this.addMechanicalComponent(beltName, belt);

    // Set up belt visual connections
    const radius1 = options?.radius1 || this.getEffectiveRadius(comp1);
    const radius2 = options?.radius2 || this.getEffectiveRadius(comp2);

    belt.connectBetweenAtPositions(
      comp1,
      comp2,
      pos1,
      pos2,
      radius1,
      radius2,
      options?.crossed
    );

    console.log(
      `Created belt mechanical component: ${beltName} connecting ${comp1Name} to ${comp2Name}`
    );

    // Create direct connections for old propagation system
    // Connect comp1 -> belt -> comp2
    const belt_connection_1 = comp1.connectTo(belt, "belt_connection");
    const belt_connection_2 = belt.connectTo(comp2, "belt_connection");

    if (belt_connection_1 && belt_connection_2) {
      console.log(
        `Successfully created old-style belt connections: ${comp1Name} -> ${beltName} -> ${comp2Name}`
      );
      return true;
    } else {
      console.error(`Failed to create old-style belt connections`);
      return false;
    }
  }
}
