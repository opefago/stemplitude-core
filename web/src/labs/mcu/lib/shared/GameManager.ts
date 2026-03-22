import { Application, Container } from "pixi.js";
import { BaseScene } from "./BaseScene";

/**
 * Shared game manager for both mechanical and circuit simulations
 */
export class GameManager {
  private static instance: GameManager | null = null;
  private app: Application;
  private currentScene: BaseScene | null;
  private scenes: Map<string, BaseScene>;
  private lastTime: number;

  // Camera controls
  private zoomLevel: number = 1;
  private readonly MIN_ZOOM = 0.1;
  private readonly MAX_ZOOM = 5;
  private readonly ZOOM_STEP = 0.1;

  private constructor(app: Application) {
    this.app = app;
    this.currentScene = null;
    this.scenes = new Map();
    this.lastTime = performance.now();

    this.setupUpdateLoop();
    this.setupCameraControls();
  }

  public static getInstance(app?: Application): GameManager {
    if (!GameManager.instance) {
      if (!app) {
        throw new Error(
          "GameManager requires an Application instance on first call"
        );
      }
      GameManager.instance = new GameManager(app);
      return GameManager.instance;
    }

    // During remounts/HMR we can receive a fresh PIXI app while a stale singleton
    // still exists. Recreate to avoid using a destroyed stage/canvas.
    if (app && GameManager.instance.app !== app) {
      GameManager.instance.destroy();
      GameManager.instance = new GameManager(app);
    }

    return GameManager.instance;
  }

  public static create(app: Application): GameManager {
    return GameManager.getInstance(app);
  }

  /**
   * Get the PIXI Application
   */
  public getApp(): Application {
    return this.app;
  }

  /**
   * Register a scene
   */
  public registerScene(name: string, scene: BaseScene): void {
    scene.initialize(this);
    this.scenes.set(name, scene);
    console.log(`📋 Registered scene: ${name}`);
  }

  /**
   * Switch to a different scene
   */
  public switchToScene(name: string): boolean {
    const scene = this.scenes.get(name);
    if (!scene) {
      console.error(`Scene "${name}" not found`);
      return false;
    }
    if (!this.app.stage) {
      console.error("Cannot switch scenes: PIXI stage is unavailable");
      return false;
    }

    // Deactivate current scene
    if (this.currentScene) {
      this.currentScene.onSceneDeactivated();
      this.app.stage.removeChild(this.currentScene.getSceneContainer());
    }

    // Activate new scene
    this.currentScene = scene;
    this.app.stage.addChild(scene.getSceneContainer());
    scene.onSceneActivated();

    console.log(`🎬 Switched to scene: ${name}`);
    return true;
  }

  /**
   * Get current scene
   */
  public getCurrentScene(): BaseScene | null {
    return this.currentScene;
  }

  /**
   * Camera controls
   */
  public zoomInFromCenter(): void {
    this.zoomLevel = Math.min(this.zoomLevel + this.ZOOM_STEP, this.MAX_ZOOM);
    this.applyCameraTransform();
  }

  public zoomOutFromCenter(): void {
    this.zoomLevel = Math.max(this.zoomLevel - this.ZOOM_STEP, this.MIN_ZOOM);
    this.applyCameraTransform();
  }

  public zoomInToPoint(screenX: number, screenY: number): void {
    const oldZoom = this.zoomLevel;
    this.zoomLevel = Math.min(this.zoomLevel + this.ZOOM_STEP, this.MAX_ZOOM);

    if (this.zoomLevel !== oldZoom) {
      this.zoomToPoint(screenX, screenY, oldZoom, this.zoomLevel);
    }
  }

  public zoomOutFromPoint(screenX: number, screenY: number): void {
    const oldZoom = this.zoomLevel;
    this.zoomLevel = Math.max(this.zoomLevel - this.ZOOM_STEP, this.MIN_ZOOM);

    if (this.zoomLevel !== oldZoom) {
      this.zoomToPoint(screenX, screenY, oldZoom, this.zoomLevel);
    }
  }

  public recenterCamera(): void {
    if (this.currentScene) {
      const container = this.currentScene.getSceneContainer();
      container.x = this.app.screen.width / 2;
      container.y = this.app.screen.height / 2;
    }
  }

  public getZoomLevel(): number {
    return this.zoomLevel;
  }

  private zoomToPoint(
    screenX: number,
    screenY: number,
    oldZoom: number,
    newZoom: number
  ): void {
    if (!this.currentScene) return;

    const container = this.currentScene.getSceneContainer();

    // Convert screen coordinates to world coordinates before zoom
    const worldX = (screenX - container.x) / oldZoom;
    const worldY = (screenY - container.y) / oldZoom;

    // Apply new zoom
    container.scale.set(newZoom);

    // Adjust position to keep the point under the cursor
    container.x = screenX - worldX * newZoom;
    container.y = screenY - worldY * newZoom;
  }

  private applyCameraTransform(): void {
    if (this.currentScene) {
      const container = this.currentScene.getSceneContainer();
      container.scale.set(this.zoomLevel);
    }
  }

  private setupCameraControls(): void {
    // Mouse wheel zoom
    this.app.canvas.addEventListener?.("wheel", (event: WheelEvent) => {
      event.preventDefault();

      const rect = this.app.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      if (event.deltaY < 0) {
        this.zoomInToPoint(mouseX, mouseY);
      } else {
        this.zoomOutFromPoint(mouseX, mouseY);
      }
    });
  }

  private setupUpdateLoop(): void {
    const update = (currentTime: number) => {
      const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
      this.lastTime = currentTime;

      // Update current scene
      if (this.currentScene) {
        this.currentScene.update(deltaTime);
      }

      requestAnimationFrame(update);
    };

    requestAnimationFrame(update);
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    this.scenes.forEach((scene) => scene.destroy());
    this.scenes.clear();
    this.currentScene = null;
    if (GameManager.instance === this) {
      GameManager.instance = null;
    }
  }
}
