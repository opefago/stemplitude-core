import GameObject from "./GameObject";
import { MechanicalComponent } from "./MechanicalComponent";
import GameManager from "./GameManager";
import { BeltProperties } from "./components/Belt";
import { BaseScene } from "./BaseScene";

/**
 * SceneManager is responsible for managing GameObjects within a scene.
 * It handles object lifecycle, scene transitions, and coordinates with
 * GameManager for system-level operations like mechanical connections.
 */
export class SceneManager {
  private gameObjects: Map<string, GameObject> = new Map();
  private mechanicalComponents: Map<string, MechanicalComponent> = new Map();
  private activeScene: BaseScene | null = null;

  constructor() {
    console.log("SceneManager initialized");
  }

  private getGameManager(): GameManager {
    return GameManager.getInstance();
  }

  /**
   * Add a game object to the current scene
   */
  public addGameObject(name: string, gameObject: GameObject): void {
    console.log(
      `SceneManager: Adding game object '${name}' (${gameObject.constructor.name})`,
    );

    // Remove existing object with same name if it exists
    if (this.gameObjects.has(name)) {
      console.log(`SceneManager: Removing existing game object '${name}'`);
      this.removeGameObject(name);
    }

    this.gameObjects.set(name, gameObject);

    // Add to PIXI stage for rendering
    const app = this.getGameManager().getApplication();
    const displayObject = gameObject.displayObject();
    console.log(`SceneManager: DisplayObject for '${name}':`, !!displayObject);

    if (displayObject) {
      console.log(`SceneManager: Adding '${name}' to stage`);
      app.stage.addChild(displayObject);
      console.log(
        `SceneManager: Stage now has ${app.stage.children.length} children`,
      );
    } else {
      console.warn(`SceneManager: No display object found for '${name}'`);
    }

    console.log(`SceneManager: Successfully added game object '${name}'`);

    // Don't automatically recenter camera - this might be causing the disappearance issue
    // this.getGameManager().recenterCamera();
  }

  /**
   * Add a mechanical component to the current scene
   */
  public addMechanicalComponent(
    name: string,
    component: MechanicalComponent,
  ): void {
    console.log(
      `SceneManager: Adding mechanical component '${name}' (${component.getComponentType()})`,
    );

    // First add as regular game object
    this.addGameObject(name, component);

    // Then store as mechanical component for physics/connections
    this.mechanicalComponents.set(name, component);

    // Verify the component was added to both collections
    const gameObjectExists = this.gameObjects.has(name);
    const mechanicalComponentExists = this.mechanicalComponents.has(name);

    console.log(
      `SceneManager: Added mechanical component '${name}' - GameObject: ${gameObjectExists}, MechanicalComponent: ${mechanicalComponentExists}`,
    );

    // Log current counts
    console.log(
      `SceneManager: Total objects - GameObjects: ${this.gameObjects.size}, MechanicalComponents: ${this.mechanicalComponents.size}`,
    );
  }

  /**
   * Remove a game object from the current scene
   */
  public removeGameObject(name: string): void {
    const gameObject = this.gameObjects.get(name);
    if (gameObject) {
      // Remove from PIXI stage
      const app = this.getGameManager().getApplication();
      const displayObject = gameObject.displayObject();
      if (displayObject) {
        app.stage.removeChild(displayObject);
      }

      // Remove from our tracking
      this.gameObjects.delete(name);

      console.log(`SceneManager: Removed game object '${name}'`);
    }
  }

  /**
   * Remove a mechanical component from the current scene
   */
  public removeMechanicalComponent(name: string): void {
    const component = this.mechanicalComponents.get(name);
    if (component) {
      // Disconnect all connections first
      const connectionSystem = this.getGameManager().getConnectionSystem();
      const connections =
        connectionSystem.getConnectionsForComponent(component);

      for (const connection of connections) {
        const otherComp =
          connection.component1 === component
            ? connection.component2
            : connection.component1;
        connectionSystem.disconnect(component, otherComp);
      }

      // Remove from mechanical components tracking
      this.mechanicalComponents.delete(name);

      // Remove as regular game object (handles PIXI cleanup)
      this.removeGameObject(name);

      console.log(`SceneManager: Removed mechanical component '${name}'`);
    }
  }

  /**
   * Get a game object by name
   */
  public getGameObject(name: string): GameObject | undefined {
    return this.gameObjects.get(name);
  }

  /**
   * Get a mechanical component by name
   */
  public getMechanicalComponent(name: string): MechanicalComponent | undefined {
    return this.mechanicalComponents.get(name);
  }

  /**
   * Get all game objects
   */
  public getAllGameObjects(): Map<string, GameObject> {
    return new Map(this.gameObjects);
  }

  /**
   * Get all mechanical components
   */
  public getAllMechanicalComponents(): Map<string, MechanicalComponent> {
    return new Map(this.mechanicalComponents);
  }

  /**
   * Connect two mechanical components (delegates to GameManager)
   */
  public connectComponents(
    comp1Name: string,
    comp2Name: string,
    connectionType: "gear_mesh" | "belt_connection" | "shaft_connection",
  ): boolean {
    const comp1 = this.mechanicalComponents.get(comp1Name);
    const comp2 = this.mechanicalComponents.get(comp2Name);

    if (!comp1 || !comp2) {
      console.warn(
        `SceneManager: Cannot connect components - ${comp1Name}: ${!!comp1}, ${comp2Name}: ${!!comp2}`,
      );
      return false;
    }

    // Delegate to GameManager for actual connection logic
    return this.getGameManager().connectComponentsDirect(
      comp1,
      comp2,
      connectionType,
    );
  }

  /**
   * Create a belt connection between two components (delegates to GameManager)
   */
  public createBeltConnection(
    comp1Name: string,
    comp2Name: string,
    beltProps: BeltProperties,
    options?: {
      radius1?: number;
      radius2?: number;
      crossed?: boolean;
    },
  ): boolean {
    // Delegate to GameManager, but the belt will be added back to this scene
    return this.getGameManager().createBeltConnectionForScene(
      this,
      comp1Name,
      comp2Name,
      beltProps,
      options,
    );
  }

  /**
   * Clear all objects from the current scene
   */
  public clearScene(): void {
    console.log("SceneManager: Clearing scene...");

    // Clear mechanical components first (handles disconnections)
    const mechanicalComponentNames = Array.from(
      this.mechanicalComponents.keys(),
    );
    for (const name of mechanicalComponentNames) {
      this.removeMechanicalComponent(name);
    }

    // Clear any remaining game objects
    const gameObjectNames = Array.from(this.gameObjects.keys());
    for (const name of gameObjectNames) {
      this.removeGameObject(name);
    }

    console.log("SceneManager: Scene cleared");
  }

  /**
   * Set the active scene for updates
   */
  public setActiveScene(scene: BaseScene | null): void {
    this.activeScene = scene;
    console.log(
      `SceneManager: Active scene set to ${scene?.constructor.name || "null"}`,
    );
  }

  /**
   * Update all objects in the scene
   */
  public update(deltaTime: number): void {
    // Update all game objects
    this.gameObjects.forEach((gameObject) => {
      gameObject.update(deltaTime);
    });

    // Update mechanical components (they're also game objects, but this ensures physics updates)
    this.mechanicalComponents.forEach((component) => {
      component.update(deltaTime);
    });

    // Update active scene if one is set
    if (this.activeScene) {
      this.activeScene.update(deltaTime);
    }
  }

  /**
   * Get count of objects for debugging
   */
  public getObjectCounts(): {
    gameObjects: number;
    mechanicalComponents: number;
  } {
    return {
      gameObjects: this.gameObjects.size,
      mechanicalComponents: this.mechanicalComponents.size,
    };
  }
}
