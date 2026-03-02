import { Application, Container } from "pixi.js";
import GameObject from "./GameObject";
import { GameManager } from "./GameManager";

/**
 * Base class for all simulation scenes (mechanical, circuit, etc.)
 */
export abstract class BaseScene {
  protected app: Application;
  protected gameManager: GameManager;
  protected sceneContainer: Container;
  protected gameObjects: Map<string, GameObject>;
  protected isActive: boolean;

  constructor() {
    this.sceneContainer = new Container();
    this.gameObjects = new Map();
    this.isActive = false;
  }

  /**
   * Initialize the scene with the game manager
   */
  public initialize(gameManager: GameManager): void {
    this.gameManager = gameManager;
    this.app = gameManager.getApp();
  }

  /**
   * Called when scene becomes active
   */
  public onSceneActivated(): void {
    this.isActive = true;
    console.log(`🎬 ${this.constructor.name} activated`);
  }

  /**
   * Called when scene becomes inactive
   */
  protected onSceneDeactivated(): void {
    this.isActive = false;
    console.log(`🎬 ${this.constructor.name} deactivated`);
  }

  /**
   * Update loop for the scene
   */
  public update(deltaTime: number): void {
    if (!this.isActive) return;

    // Update all game objects
    this.gameObjects.forEach((gameObject) => {
      gameObject.update(deltaTime);
    });
  }

  /**
   * Add a game object to the scene
   */
  public addGameObject(gameObject: GameObject): void {
    const name = gameObject.getName();

    if (this.gameObjects.has(name)) {
      console.warn(`GameObject with name "${name}" already exists in scene`);
      return;
    }

    this.gameObjects.set(name, gameObject);
    this.sceneContainer.addChild(gameObject.displayObject());

    console.log(`➕ Added ${name} to ${this.constructor.name}`);
  }

  /**
   * Remove a game object from the scene
   */
  public removeGameObject(name: string): boolean {
    const gameObject = this.gameObjects.get(name);
    if (!gameObject) {
      console.warn(`GameObject "${name}" not found in scene`);
      return false;
    }

    this.sceneContainer.removeChild(gameObject.displayObject());
    this.gameObjects.delete(name);
    gameObject.destroy();

    console.log(`➖ Removed ${name} from ${this.constructor.name}`);
    return true;
  }

  /**
   * Get a game object by name
   */
  public getGameObject(name: string): GameObject | undefined {
    return this.gameObjects.get(name);
  }

  /**
   * Get all game objects
   */
  public getAllGameObjects(): Map<string, GameObject> {
    return new Map(this.gameObjects);
  }

  /**
   * Clear all game objects
   */
  public clearScene(): void {
    const objectNames = Array.from(this.gameObjects.keys());
    objectNames.forEach((name) => this.removeGameObject(name));
    console.log(`🧹 Cleared ${this.constructor.name}`);
  }

  /**
   * Get the scene container for adding to stage
   */
  public getSceneContainer(): Container {
    return this.sceneContainer;
  }

  /**
   * Get the game manager
   */
  public getGameManager(): GameManager {
    return this.gameManager;
  }

  /**
   * Camera and zoom controls
   */
  protected zoomIn(): void {
    this.gameManager.zoomInFromCenter();
  }

  protected zoomOut(): void {
    this.gameManager.zoomOutFromCenter();
  }

  protected zoomInToPoint(screenX: number, screenY: number): void {
    this.gameManager.zoomInToPoint(screenX, screenY);
  }

  protected zoomOutFromPoint(screenX: number, screenY: number): void {
    this.gameManager.zoomOutFromPoint(screenX, screenY);
  }

  protected resetCamera(): void {
    // Reset camera to center position
    if (this.gameManager.getCurrentScene()) {
      const container = this.gameManager.getCurrentScene()!.getSceneContainer();
      container.x = this.app.screen.width / 2;
      container.y = this.app.screen.height / 2;
    }
  }

  protected recenterCamera(): void {
    this.gameManager.recenterCamera();
  }

  protected panCamera(deltaX: number, deltaY: number): void {
    // Implement basic panning by moving the scene container
    if (this.gameManager.getCurrentScene()) {
      const container = this.gameManager.getCurrentScene()!.getSceneContainer();
      container.x += deltaX;
      container.y += deltaY;
    }
  }

  protected getZoomLevel(): number {
    return this.gameManager.getZoomLevel();
  }

  protected getCameraPosition(): { x: number; y: number } {
    if (this.gameManager.getCurrentScene()) {
      const container = this.gameManager.getCurrentScene()!.getSceneContainer();
      return { x: container.x, y: container.y };
    }
    return { x: 0, y: 0 };
  }

  /**
   * Cleanup when scene is destroyed
   */
  public destroy(): void {
    this.clearScene();
    this.sceneContainer.destroy();
    this.isActive = false;
  }
}
