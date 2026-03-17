import { MechanicalComponent } from "./MechanicalComponent";
import { SceneManager } from "./SceneManager";
import GameManager from "./GameManager";
import { Motor } from "./components/Motor";
import { Gear } from "./components/Gear";
import { Pulley } from "./components/Pulley";
import { Forklift } from "./components/Forklift";
import { Belt } from "./components/Belt";

/**
 * Export/Import data structures for saving and loading scene state
 */

export interface ComponentExportData {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
  properties: any;
  mechanicalState?: {
    omega: number;
    torque: number;
    direction: number;
    power: number;
  };
}

export interface ConnectionExportData {
  id: string;
  type: "gear_mesh" | "belt_connection" | "shaft_connection";
  component1: string; // component name
  component2: string; // component name
  connectionPoint1?: string;
  connectionPoint2?: string;
  beltProperties?: any; // For belt connections
  options?: {
    radius1?: number;
    radius2?: number;
    crossed?: boolean;
  };
}

export interface SceneExportData {
  version: string;
  timestamp: string;
  metadata: {
    name?: string;
    description?: string;
    author?: string;
    tags?: string[];
  };
  components: ComponentExportData[];
  connections: ConnectionExportData[];
  cameraState?: {
    position: { x: number; y: number };
    scale: { x: number; y: number };
  };
}

export class SaveLoadSystem {
  private static readonly VERSION = "1.0.0";
  private static readonly LOCALSTORAGE_KEY = "stemplitude_scenes";
  private static readonly AUTOSAVE_KEY = "stemplitude_autosave";

  private gameManager: GameManager;
  private sceneManager: SceneManager;

  constructor(gameManager: GameManager, sceneManager: SceneManager) {
    this.gameManager = gameManager;
    this.sceneManager = sceneManager;
  }

  /**
   * Export current scene to JSON data
   */
  public exportScene(
    metadata?: Partial<SceneExportData["metadata"]>
  ): SceneExportData {
    console.log("🔄 Exporting scene...");

    const components = this.exportComponents();
    const connections = this.exportConnections();
    const cameraState = this.exportCameraState();

    const exportData: SceneExportData = {
      version: SaveLoadSystem.VERSION,
      timestamp: new Date().toISOString(),
      metadata: {
        name: metadata?.name || `Scene_${new Date().toLocaleDateString()}`,
        description: metadata?.description || "Exported STEMplitude scene",
        author: metadata?.author || "STEMplitude User",
        tags: metadata?.tags || [],
        ...metadata,
      },
      components,
      connections,
      cameraState,
    };

    console.log(
      `✅ Scene exported: ${components.length} components, ${connections.length} connections`
    );
    return exportData;
  }

  /**
   * Import scene from JSON data
   */
  public async importScene(data: SceneExportData): Promise<boolean> {
    try {
      console.log("🔄 Importing scene...");

      // Validate version compatibility
      if (!this.validateVersion(data.version)) {
        throw new Error(`Incompatible scene version: ${data.version}`);
      }

      // Clear current scene
      await this.clearScene();

      // Import components first
      const componentMap = await this.importComponents(data.components);

      // Then import connections
      await this.importConnections(data.connections, componentMap);

      // Restore camera state
      if (data.cameraState) {
        this.importCameraState(data.cameraState);
      }

      console.log(
        `✅ Scene imported successfully: ${data.components.length} components, ${data.connections.length} connections`
      );
      return true;
    } catch (error) {
      console.error("❌ Failed to import scene:", error);
      return false;
    }
  }

  /**
   * Export components to serializable format
   */
  private exportComponents(): ComponentExportData[] {
    const components: ComponentExportData[] = [];
    const mechanicalComponents = this.sceneManager.getAllMechanicalComponents();

    mechanicalComponents.forEach((component, name) => {
      const position = component.getPosition();
      const properties = this.extractComponentProperties(component);

      const exportData: ComponentExportData = {
        id: this.generateComponentId(component),
        name: name,
        type: component.getComponentType(),
        position: { x: position.x, y: position.y },
        properties: properties,
        mechanicalState: {
          omega: component.getMechanicalState().omega,
          torque: component.getMechanicalState().torque,
          direction: component.getMechanicalState().direction,
          power: component.getMechanicalState().power,
        },
      };

      components.push(exportData);
    });

    return components;
  }

  /**
   * Export connections to serializable format
   */
  private exportConnections(): ConnectionExportData[] {
    const connections: ConnectionExportData[] = [];
    const mechanicalComponents = this.sceneManager.getAllMechanicalComponents();

    // For now, we'll export belt connections by finding Belt components
    // and extracting their connection information
    mechanicalComponents.forEach((component, componentName) => {
      if (component.getComponentType() === "belt") {
        const belt = component as Belt;
        const beltConnections = belt.beltConnections;

        if (beltConnections && beltConnections.length === 2) {
          const comp1 = beltConnections[0].component;
          const comp2 = beltConnections[1].component;

          const connectionData: ConnectionExportData = {
            id: `belt_${componentName}`,
            type: "belt_connection",
            component1: comp1.getName(),
            component2: comp2.getName(),
            beltProperties: this.extractComponentProperties(belt),
            options: {
              radius1: beltConnections[0].radius,
              radius2: beltConnections[1].radius,
              crossed: (belt as any).isCrossed || false,
            },
          };
          connections.push(connectionData);
        }
      }
    });

    return connections;
  }

  /**
   * Export camera state
   */
  private exportCameraState(): SceneExportData["cameraState"] {
    const stage = this.gameManager.getApp().stage;
    return {
      position: { x: stage.position.x, y: stage.position.y },
      scale: { x: stage.scale.x, y: stage.scale.y },
    };
  }

  /**
   * Import components from export data
   */
  private async importComponents(
    componentsData: ComponentExportData[]
  ): Promise<Map<string, MechanicalComponent>> {
    const componentMap = new Map<string, MechanicalComponent>();

    for (const componentData of componentsData) {
      try {
        const component = this.createComponentFromExportData(componentData);

        // Set position
        component.setPosition(
          componentData.position.x,
          componentData.position.y
        );

        // Add to scene
        this.sceneManager.addMechanicalComponent(componentData.name, component);
        componentMap.set(componentData.name, component);

        console.log(
          `✅ Imported component: ${componentData.name} (${componentData.type})`
        );
      } catch (error) {
        console.error(
          `❌ Failed to import component ${componentData.name}:`,
          error
        );
        throw error;
      }
    }

    return componentMap;
  }

  /**
   * Import connections from export data
   */
  private async importConnections(
    connectionsData: ConnectionExportData[],
    componentMap: Map<string, MechanicalComponent>
  ): Promise<void> {
    for (const connectionData of connectionsData) {
      try {
        const comp1 = componentMap.get(connectionData.component1);
        const comp2 = componentMap.get(connectionData.component2);

        if (!comp1 || !comp2) {
          console.warn(
            `⚠️ Skipping connection: components not found (${connectionData.component1}, ${connectionData.component2})`
          );
          continue;
        }

        if (
          connectionData.type === "belt_connection" &&
          connectionData.beltProperties
        ) {
          // Create belt connection
          const success = this.gameManager.createBeltConnection(
            connectionData.component1,
            connectionData.component2,
            connectionData.beltProperties,
            connectionData.options
          );

          if (success) {
            console.log(
              `✅ Imported belt connection: ${connectionData.component1} <-> ${connectionData.component2}`
            );
          } else {
            console.warn(
              `⚠️ Failed to create belt connection: ${connectionData.component1} <-> ${connectionData.component2}`
            );
          }
        } else {
          // Create direct connection
          const success = comp1.connectTo(
            comp2,
            connectionData.type,
            connectionData.connectionPoint1,
            connectionData.connectionPoint2
          );

          if (success) {
            console.log(
              `✅ Imported ${connectionData.type}: ${connectionData.component1} <-> ${connectionData.component2}`
            );
          } else {
            console.warn(
              `⚠️ Failed to create ${connectionData.type}: ${connectionData.component1} <-> ${connectionData.component2}`
            );
          }
        }
      } catch (error) {
        console.error(`❌ Failed to import connection:`, connectionData, error);
      }
    }
  }

  /**
   * Import camera state
   */
  private importCameraState(
    cameraState: NonNullable<SceneExportData["cameraState"]>
  ): void {
    const stage = this.gameManager.getApp().stage;
    stage.position.set(cameraState.position.x, cameraState.position.y);
    stage.scale.set(cameraState.scale.x, cameraState.scale.y);
  }

  /**
   * Create component from export data
   */
  private createComponentFromExportData(
    data: ComponentExportData
  ): MechanicalComponent {
    switch (data.type) {
      case "motor":
        return new Motor(data.name, data.properties);
      case "gear":
        return new Gear(data.name, data.properties);
      case "pulley":
        return new Pulley(data.name, data.properties);
      case "forklift":
        return new Forklift(data.name, data.properties);
      case "belt":
        return new Belt(data.name, data.properties);
      default:
        throw new Error(`Unknown component type: ${data.type}`);
    }
  }

  /**
   * Extract component properties for export
   */
  private extractComponentProperties(component: MechanicalComponent): any {
    const baseProps = {
      radius: component.getMechanicalProperties().radius || 20,
      mass: component.getMechanicalProperties().mass,
      inertia: component.getMechanicalProperties().inertia,
      friction: component.getMechanicalProperties().friction,
      efficiency: component.getMechanicalProperties().efficiency,
    };

    // Add component-specific properties
    switch (component.getComponentType()) {
      case "motor":
        const motor = component as Motor;
        return {
          ...baseProps,
          maxRPM: (motor as any).motorProps?.maxRPM || 1800,
          maxTorque: (motor as any).motorProps?.maxTorque || 100,
          targetRPM: (motor as any).targetRPM || 0,
        };

      case "gear":
        const gear = component as Gear;
        return {
          ...baseProps,
          teeth: (gear as any).gearProps?.teeth || 20,
        };

      case "pulley":
        return baseProps;

      case "forklift":
        const forklift = component as Forklift;
        return {
          ...baseProps,
          pulleyRadius: (forklift as any).pulleyRadius || 35,
          armLength: (forklift as any).armLength || 120,
          maxLiftWeight: (forklift as any).maxLiftWeight || 1000,
          gearRatio: (forklift as any).gearRatio || 10,
        };

      case "belt":
        const belt = component as Belt;
        return {
          ...baseProps,
          maxLength: (belt as any).beltProps?.maxLength || 500,
          thickness: (belt as any).beltProps?.thickness || 8,
        };

      default:
        return baseProps;
    }
  }

  /**
   * Generate unique component ID
   */
  private generateComponentId(component: MechanicalComponent): string {
    return `${component.getComponentType()}_${component.getName()}_${Date.now()}`;
  }

  /**
   * Find belt component between two components
   */
  private findBeltBetweenComponents(
    comp1: MechanicalComponent,
    comp2: MechanicalComponent
  ): Belt | null {
    const allComponents = this.sceneManager.getAllMechanicalComponents();

    for (const [, component] of allComponents) {
      if (component.getComponentType() === "belt") {
        const belt = component as Belt;
        const connections = belt.beltConnections;

        if (connections && connections.length === 2) {
          const hasComp1 = connections.some(
            (conn: any) => conn.component === comp1
          );
          const hasComp2 = connections.some(
            (conn: any) => conn.component === comp2
          );

          if (hasComp1 && hasComp2) {
            return belt;
          }
        }
      }
    }

    return null;
  }

  /**
   * Clear current scene
   */
  private async clearScene(): Promise<void> {
    // Clear all components from scene manager
    const components = this.sceneManager.getAllMechanicalComponents();
    const componentNames = Array.from(components.keys());

    for (const name of componentNames) {
      this.sceneManager.removeMechanicalComponent(name);
    }

    // Clear visual stage
    this.gameManager.getApp().stage.removeChildren();

    console.log("🧹 Scene cleared");
  }

  /**
   * Validate version compatibility
   */
  private validateVersion(version: string): boolean {
    // For now, accept any version starting with "1."
    return version.startsWith("1.");
  }

  // === LOCAL STORAGE METHODS ===

  /**
   * Save scene to localStorage
   */
  public saveToLocalStorage(
    sceneName: string,
    metadata?: Partial<SceneExportData["metadata"]>
  ): boolean {
    try {
      const exportData = this.exportScene({
        ...metadata,
        name: sceneName,
      });

      const savedScenes = this.getSavedScenes();
      savedScenes[sceneName] = exportData;

      localStorage.setItem(
        SaveLoadSystem.LOCALSTORAGE_KEY,
        JSON.stringify(savedScenes)
      );
      console.log(`💾 Scene saved to localStorage: ${sceneName}`);
      return true;
    } catch (error) {
      console.error("❌ Failed to save to localStorage:", error);
      return false;
    }
  }

  /**
   * Load scene from localStorage
   */
  public async loadFromLocalStorage(sceneName: string): Promise<boolean> {
    try {
      const savedScenes = this.getSavedScenes();
      const sceneData = savedScenes[sceneName];

      if (!sceneData) {
        console.warn(`⚠️ Scene not found in localStorage: ${sceneName}`);
        return false;
      }

      return await this.importScene(sceneData);
    } catch (error) {
      console.error("❌ Failed to load from localStorage:", error);
      return false;
    }
  }

  /**
   * Get all saved scenes from localStorage
   */
  public getSavedScenes(): Record<string, SceneExportData> {
    try {
      const saved = localStorage.getItem(SaveLoadSystem.LOCALSTORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error("❌ Failed to read saved scenes:", error);
      return {};
    }
  }

  /**
   * Delete scene from localStorage
   */
  public deleteFromLocalStorage(sceneName: string): boolean {
    try {
      const savedScenes = this.getSavedScenes();
      delete savedScenes[sceneName];
      localStorage.setItem(
        SaveLoadSystem.LOCALSTORAGE_KEY,
        JSON.stringify(savedScenes)
      );
      console.log(`🗑️ Scene deleted from localStorage: ${sceneName}`);
      return true;
    } catch (error) {
      console.error("❌ Failed to delete from localStorage:", error);
      return false;
    }
  }

  /**
   * Auto-save current scene
   */
  public autoSave(): boolean {
    try {
      const exportData = this.exportScene({
        name: "AutoSave",
        description: "Automatically saved scene",
      });

      localStorage.setItem(
        SaveLoadSystem.AUTOSAVE_KEY,
        JSON.stringify(exportData)
      );
      console.log("💾 Auto-saved scene");
      return true;
    } catch (error) {
      console.error("❌ Auto-save failed:", error);
      return false;
    }
  }

  /**
   * Load auto-saved scene
   */
  public async loadAutoSave(): Promise<boolean> {
    try {
      const autoSaveData = localStorage.getItem(SaveLoadSystem.AUTOSAVE_KEY);
      if (!autoSaveData) {
        console.warn("⚠️ No auto-save found");
        return false;
      }

      const sceneData: SceneExportData = JSON.parse(autoSaveData);
      return await this.importScene(sceneData);
    } catch (error) {
      console.error("❌ Failed to load auto-save:", error);
      return false;
    }
  }

  // === FILE EXPORT/IMPORT METHODS ===

  /**
   * Export scene to downloadable JSON file
   */
  public exportToFile(
    sceneName: string,
    metadata?: Partial<SceneExportData["metadata"]>
  ): void {
    const exportData = this.exportScene({
      ...metadata,
      name: sceneName,
    });

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(dataBlob);
    link.download = `${sceneName.replace(/[^a-z0-9]/gi, "_")}.stemplitude.json`;
    link.click();

    console.log(`📥 Scene exported to file: ${link.download}`);
  }

  /**
   * Import scene from uploaded JSON file
   */
  public async importFromFile(file: File): Promise<boolean> {
    try {
      const text = await file.text();
      const sceneData: SceneExportData = JSON.parse(text);

      return await this.importScene(sceneData);
    } catch (error) {
      console.error("❌ Failed to import from file:", error);
      return false;
    }
  }
}
