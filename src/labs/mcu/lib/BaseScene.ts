import GameObject from "./GameObject";
import { MechanicalComponent } from "./MechanicalComponent";
import GameManager from "./GameManager";
import { SceneManager } from "./SceneManager";
import { BeltProperties } from "./components/Belt";

/**
 * BaseScene provides a convenient abstraction over SceneManager
 * for creating and managing scenes. Concrete scene classes should
 * extend this to get common scene functionality.
 */
export abstract class BaseScene {
  protected sceneManager: SceneManager;

  constructor() {
    this.sceneManager = GameManager.getInstance().getSceneManager();
  }

  /**
   * Add a game object to the scene
   */
  protected addGameObject(name: string, gameObject: GameObject): void {
    this.sceneManager.addGameObject(name, gameObject);
  }

  /**
   * Add a mechanical component to the scene
   */
  protected addMechanicalComponent(
    name: string,
    component: MechanicalComponent,
  ): void {
    this.sceneManager.addMechanicalComponent(name, component);
  }

  /**
   * Remove a game object from the scene
   */
  protected removeGameObject(name: string): void {
    this.sceneManager.removeGameObject(name);
  }

  /**
   * Remove a mechanical component from the scene
   */
  protected removeMechanicalComponent(name: string): void {
    this.sceneManager.removeMechanicalComponent(name);
  }

  /**
   * Get a game object by name
   */
  protected getGameObject(name: string): GameObject | undefined {
    return this.sceneManager.getGameObject(name);
  }

  /**
   * Get a mechanical component by name
   */
  protected getMechanicalComponent(
    name: string,
  ): MechanicalComponent | undefined {
    return this.sceneManager.getMechanicalComponent(name);
  }

  /**
   * Connect two mechanical components
   */
  protected connectComponents(
    comp1Name: string,
    comp2Name: string,
    connectionType: "gear_mesh" | "belt_connection" | "shaft_connection",
  ): boolean {
    return this.sceneManager.connectComponents(
      comp1Name,
      comp2Name,
      connectionType,
    );
  }

  /**
   * Create a belt connection between two components
   */
  protected createBeltConnection(
    comp1Name: string,
    comp2Name: string,
    beltProps: BeltProperties,
    options?: {
      radius1?: number;
      radius2?: number;
      crossed?: boolean;
    },
  ): boolean {
    return this.sceneManager.createBeltConnection(
      comp1Name,
      comp2Name,
      beltProps,
      options,
    );
  }

  /**
   * Get count of objects in the scene
   */
  protected getObjectCounts(): {
    gameObjects: number;
    mechanicalComponents: number;
  } {
    return this.sceneManager.getObjectCounts();
  }

  /**
   * Access GameManager for system-level operations (use sparingly)
   */
  protected getGameManager(): GameManager {
    return GameManager.getInstance();
  }

  /**
   * Clear all objects from the scene
   */
  public clearScene(): void {
    this.sceneManager.clearScene();
    this.onSceneCleared();
  }

  /**
   * Called after the scene is cleared - override in subclasses for cleanup
   */
  protected onSceneCleared(): void {
    // Override in subclasses if needed
  }

  /**
   * Called when the scene is activated - override in subclasses for setup
   */
  protected onSceneActivated(): void {
    // Override in subclasses if needed
  }

  /**
   * Called when the scene is deactivated - override in subclasses for cleanup
   */
  protected onSceneDeactivated(): void {
    // Override in subclasses if needed
  }

  /**
   * Camera and zoom controls
   */
  protected zoomIn(factor?: number): void {
    GameManager.getInstance().zoomIn(factor);
  }

  protected zoomOut(factor?: number): void {
    GameManager.getInstance().zoomOut(factor);
  }

  protected resetCamera(): void {
    GameManager.getInstance().resetCamera();
  }

  protected recenterCamera(): void {
    GameManager.getInstance().recenterCamera();
  }

  protected panCamera(deltaX: number, deltaY: number): void {
    GameManager.getInstance().panCamera(deltaX, deltaY);
  }

  protected getZoomLevel(): number {
    return GameManager.getInstance().getZoomLevel();
  }

  protected getCameraPosition(): { x: number; y: number } {
    return GameManager.getInstance().getCameraPosition();
  }

  /**
   * Get scene manager (use sparingly - prefer using the helper methods above)
   */
  protected getSceneManager(): SceneManager {
    return this.sceneManager;
  }

  /**
   * Update the scene - called every frame during game loop
   * Override in subclasses for custom scene logic
   */
  public update(_deltaTime: number): void {
    // Override in subclasses if needed
    // Base implementation does nothing - SceneManager handles object updates
  }
}
