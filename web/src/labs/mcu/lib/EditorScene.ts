import * as PIXI from "pixi.js";
import { Graphics } from "pixi.js";
import { BaseScene } from "./BaseScene";
import { Motor } from "./components/Motor";
import { Gear } from "./components/Gear";
import { Pulley } from "./components/Pulley";
import { Forklift } from "./components/Forklift";
import { MechanicalComponent } from "./MechanicalComponent";
import { PhysicsSystem } from "./PhysicsSystem";
import { SaveLoadSystem } from "./SaveLoadSystem";
import tippy from "tippy.js";
import "tippy.js/dist/tippy.css";

interface AssetItem {
  id: string;
  name: string;
  icon: string;
  type: "motor" | "gear" | "pulley" | "belt" | "chain" | "forklift";
  description: string;
}

interface ComponentConfig {
  type: string;
  position: { x: number; y: number };
  properties: any;
}

export class EditorScene extends BaseScene {
  protected toolbar!: HTMLElement;
  private dragPreview!: HTMLElement;
  private isDragging: boolean = false;
  private componentCounter: number = 0;
  private configModal!: HTMLElement;
  private infoBar!: HTMLElement;
  private saveLoadSystem!: SaveLoadSystem;

  // Belt creation mode
  private beltCreationMode: boolean = false;
  private selectedComponents: any[] = [];
  private beltCreationConfig: any = null;

  // Component dragging
  private isDraggingComponent: boolean = false;
  private draggedComponent: any = null;

  // Component selection system
  private selectedComponentsForDeletion: Set<any> = new Set();
  private selectionHighlights: Map<any, any> = new Map();

  // Constraints
  private readonly GEAR_SNAP_DISTANCE = 80; // Pixels - increased for better UX
  private readonly MAX_BELT_DISTANCE = 300; // Pixels
  private readonly MAX_GEAR_MESH_TOLERANCE = 10; // Pixels - tolerance for gear meshing distance

  // Component compatibility matrix
  private readonly BELT_COMPATIBLE_TYPES = [
    "motor",
    "pulley",
    "gear",
    "forklift",
  ];

  // Drag and drop components (physical components you place on canvas)
  protected dragDropComponents: AssetItem[] = [
    {
      id: "motor",
      name: "Motor",
      icon: "/assets/motor-alt.svg",
      type: "motor",
      description: "Electric motor with variable speed",
    },
    {
      id: "gear",
      name: "Gear",
      icon: "/assets/gear.svg",
      type: "gear",
      description: "Mechanical gear for power transmission",
    },
    {
      id: "pulley",
      name: "Pulley",
      icon: "/assets/cross-timing pulley.svg",
      type: "pulley",
      description: "Pulley for belt drive systems",
    },
    {
      id: "forklift",
      name: "Forklift",
      icon: "/assets/forklift.svg",
      type: "forklift",
      description: "Industrial forklift with vertical lift mechanism",
    },
  ];

  // Click to activate tools (connection tools, don't drag)
  protected clickActivateTools: AssetItem[] = [
    {
      id: "belt",
      name: "Belt Tool",
      icon: "/assets/timing-belt.svg",
      type: "belt",
      description: "Click to connect components with belts",
    },
  ];

  // Belt tool state
  private selectedBeltType: "normal" | "cross" = "normal";
  private isBeltDropdownOpen: boolean = false;

  // Canvas panning state
  private isPanningCanvas: boolean = false;
  private panStartPosition: { x: number; y: number } = { x: 0, y: 0 };
  private cameraStartPosition: { x: number; y: number } = { x: 0, y: 0 };

  // Runtime gear mesh detection
  private lastRuntimeMeshCheck: number = 0;
  private readonly RUNTIME_MESH_CHECK_INTERVAL = 500; // Check every 500ms during simulation

  // Simulation control state
  protected isSimulationRunning: boolean = false;
  private playStopButton!: HTMLElement;

  // Properties panel for in-place editing
  private propertiesPanel!: HTMLElement;
  private isPropertiesPanelVisible: boolean = false;
  private currentEditingComponent: any = null;

  constructor() {
    super();
    this.createEditorInterface();
    this.setupEventListeners();
  }

  private createEditorInterface(): void {
    this.createToolbar();
    this.createPlayStopButton();
    this.createZoomControls();
    this.createSaveLoadButton();
    this.createTrashBin();
    this.createPropertiesPanel();
    this.createDragPreview();
    this.createConfigModal();
    this.createInfoBar();
  }

  private createToolbar(): void {
    // Remove existing toolbar if it exists
    const existing = document.getElementById("editor-toolbar");
    if (existing) {
      existing.remove();
    }

    this.toolbar = document.createElement("div");
    this.toolbar.id = "editor-toolbar";
    this.toolbar.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 160px;
      height: 100vh;
      background: linear-gradient(135deg, #2c3e50, #34495e);
      border-left: 2px solid #3498db;
      padding: 16px;
      box-sizing: border-box;
      z-index: 1000;
      overflow-y: auto;
      box-shadow: -2px 0 10px rgba(0,0,0,0.3);
    `;

    // === DRAG & DROP COMPONENTS SECTION ===
    const dragDropTitle = document.createElement("h3");
    dragDropTitle.textContent = "Components";
    dragDropTitle.style.cssText = `
      color: #ecf0f1;
      margin: 0 0 12px 0;
      font-size: 14px;
      text-align: center;
      border-bottom: 2px solid #3498db;
      padding-bottom: 8px;
    `;
    this.toolbar.appendChild(dragDropTitle);

    const dragDropHint = document.createElement("div");
    dragDropHint.textContent = "Drag to canvas";
    dragDropHint.style.cssText = `
      color: #95a5a6;
      font-size: 11px;
      text-align: center;
      margin-bottom: 10px;
      font-style: italic;
    `;
    this.toolbar.appendChild(dragDropHint);

    // Create drag & drop component items
    this.dragDropComponents.forEach((asset) => {
      const assetElement = this.createDragDropAssetElement(asset);
      this.toolbar.appendChild(assetElement);
    });

    // === TOOLS SECTION ===
    const toolsTitle = document.createElement("h3");
    toolsTitle.textContent = "Tools";
    toolsTitle.style.cssText = `
      color: #ecf0f1;
      margin: 20px 0 12px 0;
      font-size: 14px;
      text-align: center;
      border-bottom: 2px solid #e74c3c;
      padding-bottom: 8px;
    `;
    this.toolbar.appendChild(toolsTitle);

    const toolsHint = document.createElement("div");
    toolsHint.textContent = "Click to activate";
    toolsHint.style.cssText = `
      color: #95a5a6;
      font-size: 11px;
      text-align: center;
      margin-bottom: 10px;
      font-style: italic;
    `;
    this.toolbar.appendChild(toolsHint);

    // Create click-to-activate tool items
    this.clickActivateTools.forEach((tool) => {
      const toolElement = this.createClickActivateToolElement(tool);
      this.toolbar.appendChild(toolElement);
    });

    // Instructions and controls
    const instructions = document.createElement("div");
    instructions.innerHTML = `
      <div style="color: #bdc3c7; font-size: 10px; margin-top: 16px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">
        <strong>Instructions:</strong><br>
        <span style="color: #3498db;">Components:</span> Drag onto canvas<br>
        <span style="color: #e74c3c;">Tools:</span> Click to activate/deactivate<br>
        • Belt tool: Click 2 components to connect
      </div>
    `;
    this.toolbar.appendChild(instructions);

    // All toolbar control buttons and button container removed as requested

    document.body.appendChild(this.toolbar);
  }

  private createPlayStopButton(): void {
    // Remove existing button if it exists
    const existing = document.getElementById("play-stop-button");
    if (existing) {
      existing.remove();
    }

    this.playStopButton = document.createElement("button");
    this.playStopButton.id = "play-stop-button";
    // Add Tippy tooltip instead of custom tooltip
    this.addTooltip(this.playStopButton, "Start/Stop Simulation");

    // Position it in the top right, just before the toolbar
    this.playStopButton.style.cssText = `
      position: fixed;
      top: 20px;
      right: 180px;
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #27ae60, #2ecc71);
      border: 3px solid #1e8449;
      border-radius: 50%;
      cursor: pointer;
      z-index: 1001;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      user-select: none;
    `;

    // Add play icon initially
    this.updatePlayStopButtonIcon();

    // Add hover effects
    this.playStopButton.addEventListener("mouseenter", () => {
      this.playStopButton.style.transform = "scale(1.1)";
      this.playStopButton.style.boxShadow = "0 6px 20px rgba(0,0,0,0.4)";
    });

    this.playStopButton.addEventListener("mouseleave", () => {
      this.playStopButton.style.transform = "scale(1.0)";
      this.playStopButton.style.boxShadow = "0 4px 15px rgba(0,0,0,0.3)";
    });

    // Add click handler
    this.playStopButton.addEventListener("click", () => {
      this.toggleSimulation();
    });

    document.body.appendChild(this.playStopButton);
  }

  private updatePlayStopButtonIcon(): void {
    // Clear existing content
    this.playStopButton.innerHTML = "";

    if (this.isSimulationRunning) {
      // Show stop icon (square)
      this.playStopButton.style.background =
        "linear-gradient(135deg, #e74c3c, #c0392b)";
      this.playStopButton.style.borderColor = "#a93226";
      this.playStopButton.title = "Stop Simulation";

      const stopIcon = document.createElement("div");
      stopIcon.style.cssText = `
        width: 20px;
        height: 20px;
        background: #fff;
        border-radius: 3px;
      `;
      this.playStopButton.appendChild(stopIcon);
    } else {
      // Show play icon (triangle)
      this.playStopButton.style.background =
        "linear-gradient(135deg, #27ae60, #2ecc71)";
      this.playStopButton.style.borderColor = "#1e8449";
      this.playStopButton.title = "Start Simulation";

      const playIcon = document.createElement("div");
      playIcon.style.cssText = `
        width: 0;
        height: 0;
        border-left: 15px solid #fff;
        border-top: 10px solid transparent;
        border-bottom: 10px solid transparent;
        margin-left: 3px;
      `;
      this.playStopButton.appendChild(playIcon);
    }
  }

  private toggleSimulation(): void {
    this.isSimulationRunning = !this.isSimulationRunning;

    console.log(
      `🎮 Simulation ${this.isSimulationRunning ? "STARTED" : "STOPPED"}`
    );

    // Update button appearance
    this.updatePlayStopButtonIcon();

    if (this.isSimulationRunning) {
      this.startSimulation();
    } else {
      this.stopSimulation();
    }
  }

  private startSimulation(): void {
    const motors = this.findAllMotors();

    console.log(`🎮 Starting ${motors.length} motors found in scene`);

    if (motors.length === 0) {
      this.updateInfoBar(
        "No motors found to start - add motors to the scene first",
        "warning"
      );
      this.isSimulationRunning = false;
      this.updatePlayStopButtonIcon();
      return;
    }

    // Start all motors
    motors.forEach((motor) => {
      try {
        // Enable manual control to prevent auto-stopping
        if (typeof motor.enableManualControl === "function") {
          motor.enableManualControl();
        }

        // Start the motor with its configured RPM
        if (typeof motor.start === "function") {
          // Get the motor's configured RPM from its motor-specific properties
          const motorProps = motor.getMotorProperties();
          const configuredRPM = motorProps.maxRPM || 100; // Default to 100 if not set

          motor.start(configuredRPM);
          console.log(
            `🎮 Started motor: ${motor.getName()} at ${configuredRPM} RPM (configured: ${motorProps.maxRPM})`
          );

          // Debug motor's mechanical state after starting
          setTimeout(() => {
            const mechanicalState = motor.getMechanicalState();
            const actualRPM = PhysicsSystem.omegaToRPM(
              Math.abs(mechanicalState.omega)
            );
            console.log(
              `🎮 Motor ${motor.getName()} mechanical state:`,
              `RPM: ${actualRPM.toFixed(1)},`,
              `Torque: ${mechanicalState.torque.toFixed(2)},`,
              `Power: ${mechanicalState.power?.toFixed(2) || 0}W`
            );
          }, 100);
        } else {
          console.warn(`🎮 Motor ${motor.getName()} doesn't have start method`);
        }
      } catch (error) {
        console.error(`🎮 Failed to start motor ${motor.getName()}:`, error);
      }
    });

    this.updateInfoBar(
      `Simulation started - ${motors.length} motor(s) running`,
      "success"
    );

    // Notify level scene about simulation start
    this.onSimulationStarted();

    // Debug all components after a short delay
    setTimeout(() => {
      this.debugAllComponentStates();
    }, 500);
  }

  private debugAllComponentStates(): void {
    console.log("🔍 === COMPONENT STATE DEBUG ===");
    const components = this.getSceneManager().getAllMechanicalComponents();

    for (const [name, component] of components) {
      const mechanicalState = component.getMechanicalState();
      const actualRPM = PhysicsSystem.omegaToRPM(
        Math.abs(mechanicalState.omega)
      );
      const componentType = component.getComponentType();

      console.log(
        `🔍 ${componentType.toUpperCase()} ${name}:`,
        `RPM: ${actualRPM.toFixed(1)},`,
        `Torque: ${mechanicalState.torque.toFixed(2)},`,
        `Direction: ${mechanicalState.direction},`,
        `Power: ${mechanicalState.power?.toFixed(2) || 0}W`
      );

      // Additional debug info for specific component types
      if (componentType === "gear") {
        const gearProps = (component as Gear).getGearProperties();
        console.log(
          `   ↳ Gear properties: ${gearProps.teeth} teeth, radius: ${gearProps.radius.toFixed(1)}px, beltRadius: ${gearProps.beltRadius.toFixed(1)}px, efficiency: ${gearProps.efficiency}`
        );
        // Check if this gear was configured for 1:1 matching (approximation)
        const isLikely1to1 = [12, 16, 20, 24, 30].includes(
          Math.round(gearProps.beltRadius)
        );
        if (isLikely1to1) {
          console.log(
            `   ↳ 🎯 Belt radius ${gearProps.beltRadius}px matches standard motor/pulley sizes for 1:1 ratios`
          );
        }
      } else if (componentType === "motor") {
        const motorProps = (component as Motor).getMotorProperties();
        const isRunning = (component as Motor).getIsRunning();
        console.log(
          `   ↳ Motor properties: max ${motorProps.maxRPM} RPM, ${motorProps.nominalTorque}Nm torque, pulleyRadius: ${motorProps.pulleyRadius}px, running: ${isRunning}`
        );

        // Also show base mechanical properties
        const baseMechProps = component.getMechanicalProperties();
        console.log(
          `   ↳ Motor belt radius: ${baseMechProps.radius}px (used for belt connections)`
        );
      } else if (componentType === "pulley") {
        const baseMechProps = component.getMechanicalProperties();
        console.log(
          `   ↳ Pulley radius: ${baseMechProps.radius}px (also used as belt radius)`
        );
        console.log(
          `   ↳ 🎯 Configured for 1:1 ratio matching with ${baseMechProps.radius}px motors/gears`
        );
      }
    }
    console.log("🔍 === END DEBUG ===");
  }

  private stopSimulation(): void {
    const motors = this.findAllMotors();

    console.log(`🎮 Stopping ${motors.length} motors found in scene`);

    // Stop all motors
    motors.forEach((motor) => {
      try {
        if (typeof motor.stop === "function") {
          motor.stop();
          console.log(`🎮 Stopped motor: ${motor.getName()}`);
        } else {
          console.warn(`🎮 Motor ${motor.getName()} doesn't have stop method`);
        }
      } catch (error) {
        console.error(`🎮 Failed to stop motor ${motor.getName()}:`, error);
      }
    });

    // Reset all non-motor components to idle state
    console.log(`🎮 Resetting all non-motor components to idle state`);
    const allComponents = this.getSceneManager().getAllMechanicalComponents();
    let resetCount = 0;

    allComponents.forEach((component: any) => {
      if (component.getComponentType() !== "motor") {
        try {
          const componentName = component.getName();
          const currentState = component.getMechanicalState();

          if (
            Math.abs(currentState.omega) > 0.001 ||
            Math.abs(currentState.torque) > 0.001
          ) {
            console.log(
              `🔧 Resetting ${componentName}: ${PhysicsSystem.omegaToRPM(currentState.omega).toFixed(1)} RPM -> 0 RPM`
            );
            component.resetToIdleState();
            component.updateVisuals(0);
            resetCount++;
          }
        } catch (error) {
          console.error(
            `🎮 Failed to reset component ${component.getName()}:`,
            error
          );
        }
      }
    });

    console.log(`🎮 Reset ${resetCount} components to idle state`);

    this.updateInfoBar(
      `Simulation stopped - ${motors.length} motor(s) stopped, ${resetCount} component(s) reset`,
      "info"
    );
  }

  private findAllMotors(): any[] {
    const components = this.getSceneManager().getAllMechanicalComponents();
    const motors: any[] = [];

    for (const [, component] of components) {
      if (component.getComponentType() === "motor") {
        motors.push(component);
      }
    }

    return motors;
  }

  private addTooltip(element: HTMLElement, text: string): void {
    // Use Tippy.js for reliable tooltips
    tippy(element, {
      content: text,
      theme: "custom",
      placement: "bottom",
      arrow: true,
      delay: [300, 0], // 300ms delay on show, 0ms on hide
      duration: [200, 150], // Animation durations
      followCursor: false,
      hideOnClick: true,
      interactive: false,
      maxWidth: 250,
    });

    console.log(`✅ Tippy tooltip added to ${element.tagName}: "${text}"`);
  }

  private createSaveLoadButton(): void {
    // Remove existing save/load button if it exists
    const existing = document.getElementById("save-load-button");
    if (existing) {
      existing.remove();
    }

    const saveLoadButton = document.createElement("button");
    saveLoadButton.id = "save-load-button";
    saveLoadButton.innerHTML = "💾";
    saveLoadButton.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      border: 2px solid #3498db;
      border-radius: 8px;
      background: linear-gradient(135deg, #2c3e50, #34495e);
      color: white;
      font-size: 20px;
      cursor: pointer;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    `;

    saveLoadButton.addEventListener("mouseenter", () => {
      saveLoadButton.style.background =
        "linear-gradient(135deg, #3498db, #2980b9)";
      saveLoadButton.style.transform = "scale(1.05)";
    });

    saveLoadButton.addEventListener("mouseleave", () => {
      saveLoadButton.style.background =
        "linear-gradient(135deg, #2c3e50, #34495e)";
      saveLoadButton.style.transform = "scale(1)";
    });

    saveLoadButton.addEventListener("click", () => {
      this.showSaveLoadModal();
    });

    this.addTooltip(saveLoadButton, "Save & Load Scenes");
    document.body.appendChild(saveLoadButton);
  }

  private createZoomControls(): void {
    // Remove existing zoom controls if they exist
    const existing = document.getElementById("zoom-controls");
    if (existing) {
      existing.remove();
    }

    const zoomControls = document.createElement("div");
    zoomControls.id = "zoom-controls";
    zoomControls.style.cssText = `
      position: fixed;
      bottom: 70px;
      right: 180px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: rgba(44, 62, 80, 0.9);
      padding: 12px;
      border-radius: 8px;
      border: 2px solid rgba(52, 152, 219, 0.8);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

    // Zoom In button
    const zoomInBtn = document.createElement("button");
    zoomInBtn.style.cssText = `
      width: 40px;
      height: 40px;
      background: rgba(46, 204, 113, 0.8);
      border: 2px solid #2ecc71;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      padding: 8px;
    `;

    const zoomInIcon = document.createElement("img");
    zoomInIcon.src = "/assets/zoom-in.svg";
    zoomInIcon.style.cssText = `
      width: 20px;
      height: 20px;
      filter: brightness(0) invert(1);
    `;
    zoomInBtn.appendChild(zoomInIcon);

    // Add Tippy tooltip instead of default
    this.addTooltip(zoomInBtn, "Zoom In");

    // Zoom Out button
    const zoomOutBtn = document.createElement("button");
    zoomOutBtn.style.cssText = `
      width: 40px;
      height: 40px;
      background: rgba(231, 76, 60, 0.8);
      border: 2px solid #e74c3c;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      padding: 8px;
    `;

    const zoomOutIcon = document.createElement("img");
    zoomOutIcon.src = "/assets/zoom-out.svg";
    zoomOutIcon.style.cssText = `
      width: 20px;
      height: 20px;
      filter: brightness(0) invert(1);
    `;
    zoomOutBtn.appendChild(zoomOutIcon);

    // Add Tippy tooltip instead of default
    this.addTooltip(zoomOutBtn, "Zoom Out");

    // Center on Components button
    const recenterBtn = document.createElement("button");
    recenterBtn.style.cssText = `
      width: 40px;
      height: 40px;
      background: rgba(52, 152, 219, 0.8);
      border: 2px solid #3498db;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      padding: 8px;
    `;

    const recenterIcon = document.createElement("img");
    recenterIcon.src = "/assets/center-to-fit.svg";
    recenterIcon.style.cssText = `
      width: 20px;
      height: 20px;
      filter: brightness(0) invert(1);
    `;
    recenterBtn.appendChild(recenterIcon);

    // Add Tippy tooltip instead of default
    this.addTooltip(recenterBtn, "Center to Fit");

    // Hover effects for all buttons
    [zoomInBtn, zoomOutBtn, recenterBtn].forEach((btn) => {
      btn.addEventListener("mouseenter", () => {
        btn.style.transform = "scale(1.1)";
        btn.style.boxShadow = "0 4px 8px rgba(0,0,0,0.3)";
      });

      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "scale(1)";
        btn.style.boxShadow = "none";
      });
    });

    // Event listeners
    zoomInBtn.addEventListener("click", () => {
      this.zoomIn();
      this.updateInfoBar(
        `Zoomed in - Level: ${(this.getZoomLevel() * 100).toFixed(0)}%`
      );
    });

    zoomOutBtn.addEventListener("click", () => {
      this.zoomOut();
      this.updateInfoBar(
        `Zoomed out - Level: ${(this.getZoomLevel() * 100).toFixed(0)}%`
      );
    });

    recenterBtn.addEventListener("click", () => {
      this.recenterCamera(); // Manual recentering still works
      this.updateInfoBar("Camera centered on components");
    });

    // Add only the essential zoom controls
    zoomControls.appendChild(zoomInBtn);
    zoomControls.appendChild(zoomOutBtn);
    zoomControls.appendChild(recenterBtn);

    document.body.appendChild(zoomControls);
  }

  private createTrashBin(): void {
    // Remove existing trash bin if it exists
    const existing = document.getElementById("trash-bin");
    if (existing) {
      existing.remove();
    }

    const trashBin = document.createElement("div");
    trashBin.id = "trash-bin";
    trashBin.style.cssText = `
      position: fixed;
      bottom: 70px;
      left: 15px;
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #e74c3c, #c0392b);
      border: 3px solid #a93226;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      z-index: 1000;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    `;

    // Create trash icon using the provided SVG
    const trashIcon = document.createElement("img");
    trashIcon.src = "/assets/bin-cancel-delete-remove-trash-garbage.svg";
    trashIcon.alt = "Delete";
    trashIcon.style.cssText = `
      width: 30px;
      height: 30px;
      filter: brightness(0) invert(1);
      pointer-events: none;
    `;

    trashBin.appendChild(trashIcon);

    // Hover effects
    trashBin.addEventListener("mouseenter", () => {
      trashBin.style.transform = "scale(1.1)";
      trashBin.style.boxShadow = "0 6px 20px rgba(231, 76, 60, 0.5)";
    });

    trashBin.addEventListener("mouseleave", () => {
      trashBin.style.transform = "scale(1.0)";
      trashBin.style.boxShadow = "0 4px 15px rgba(0,0,0,0.3)";
    });

    // Click handler for deleting selected components
    trashBin.addEventListener("click", () => {
      void this.handleTrashBinClick();
    });

    // Drag over effects for drag-to-delete
    trashBin.addEventListener("dragover", (e) => {
      e.preventDefault();
      trashBin.style.transform = "scale(1.2)";
      trashBin.style.background = "linear-gradient(135deg, #ff6b6b, #ee5a52)";
    });

    trashBin.addEventListener("dragleave", () => {
      trashBin.style.transform = "scale(1.0)";
      trashBin.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)";
    });

    trashBin.addEventListener("drop", (e) => {
      e.preventDefault();
      this.handleDragToTrash(e);
      trashBin.style.transform = "scale(1.0)";
      trashBin.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)";
    });

    document.body.appendChild(trashBin);
  }

  private createPropertiesPanel(): void {
    // Remove existing panel if it exists
    const existing = document.getElementById("properties-panel");
    if (existing) {
      existing.remove();
    }

    this.propertiesPanel = document.createElement("div");
    this.propertiesPanel.id = "properties-panel";
    this.propertiesPanel.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 320px;
      max-height: calc(100vh - 40px);
      background: linear-gradient(135deg, #2c3e50, #34495e);
      border: 2px solid #3498db;
      border-radius: 16px;
      box-shadow: 0 15px 35px rgba(0,0,0,0.3);
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: none;
      z-index: 9999;
      overflow-y: auto;
      backdrop-filter: blur(10px);
      animation: slideInRight 0.3s ease-out;
    `;

    // Add CSS animation
    if (!document.querySelector("#properties-panel-styles")) {
      const style = document.createElement("style");
      style.id = "properties-panel-styles";
      style.textContent = `
        @keyframes slideInRight {
          from { 
            transform: translateX(100%); 
            opacity: 0; 
          }
          to { 
            transform: translateX(0); 
            opacity: 1; 
          }
        }
        @keyframes slideOutRight {
          from { 
            transform: translateX(0); 
            opacity: 1; 
          }
          to { 
            transform: translateX(100%); 
            opacity: 0; 
          }
        }
        .properties-panel-section {
          margin-bottom: 16px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .properties-panel-label {
          color: #ecf0f1;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .properties-panel-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #34495e;
          border-radius: 6px;
          background: #2c3e50;
          color: #ecf0f1;
          font-size: 14px;
          box-sizing: border-box;
        }
        .properties-panel-input:focus {
          outline: none;
          border-color: #3498db;
          box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
        }
        .properties-panel-button {
          background: #3498db;
          color: white;
          border: none;
          padding: 10px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.2s ease;
        }
        .properties-panel-button:hover {
          background: #2980b9;
        }
        .properties-panel-button.danger {
          background: #e74c3c;
        }
        .properties-panel-button.danger:hover {
          background: #c0392b;
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(this.propertiesPanel);
  }

  private showPropertiesPanel(component: any): void {
    if (!component) return;

    this.currentEditingComponent = component;
    this.isPropertiesPanelVisible = true;

    // Clear existing content
    this.propertiesPanel.innerHTML = "";

    // Create header
    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    `;

    const title = document.createElement("h3");
    title.textContent = `Edit ${component.getName()}`;
    title.style.cssText = `
      margin: 0;
      color: #ecf0f1;
      font-size: 18px;
      font-weight: 600;
    `;

    const closeButton = document.createElement("button");
    closeButton.innerHTML = "×";
    closeButton.style.cssText = `
      background: none;
      border: none;
      color: #bdc3c7;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      transition: background 0.2s ease;
    `;
    closeButton.onmouseenter = () =>
      (closeButton.style.background = "rgba(231, 76, 60, 0.2)");
    closeButton.onmouseleave = () => (closeButton.style.background = "none");
    closeButton.onclick = () => this.hidePropertiesPanel();

    header.appendChild(title);
    header.appendChild(closeButton);
    this.propertiesPanel.appendChild(header);

    // Create content based on component type
    this.populatePropertiesPanel(component);

    // Show panel with animation
    this.propertiesPanel.style.display = "block";
    this.propertiesPanel.style.animation = "slideInRight 0.3s ease-out";
  }

  private hidePropertiesPanel(): void {
    if (!this.isPropertiesPanelVisible) return;

    this.propertiesPanel.style.animation =
      "slideOutRight 0.3s ease-in forwards";
    setTimeout(() => {
      this.propertiesPanel.style.display = "none";
      this.isPropertiesPanelVisible = false;
      this.currentEditingComponent = null;
    }, 300);
  }

  private populatePropertiesPanel(component: any): void {
    const componentType = component.getComponentType();

    // Component info section
    const infoSection = document.createElement("div");
    infoSection.className = "properties-panel-section";

    const typeLabel = document.createElement("div");
    typeLabel.className = "properties-panel-label";
    typeLabel.textContent = "Component Type";

    const typeValue = document.createElement("div");
    typeValue.style.cssText =
      "color: #3498db; font-weight: 500; text-transform: capitalize;";
    typeValue.textContent = componentType;

    infoSection.appendChild(typeLabel);
    infoSection.appendChild(typeValue);
    this.propertiesPanel.appendChild(infoSection);

    // Component name section (universal for all components)
    this.createNameProperties(component);

    // Component-specific properties
    switch (componentType) {
      case "gear":
        this.createGearProperties(component);
        break;
      case "motor":
        this.createMotorProperties(component);
        break;
      case "pulley":
        this.createPulleyProperties(component);
        break;
      case "forklift":
        this.createForkliftProperties(component);
        break;
      case "belt":
        this.createBeltProperties(component);
        break;
    }

    // Position section
    this.createPositionProperties(component);

    // Action buttons
    this.createActionButtons(component);
  }

  private createNameProperties(component: any): void {
    const nameSection = document.createElement("div");
    nameSection.className = "properties-panel-section";

    const nameLabel = document.createElement("div");
    nameLabel.className = "properties-panel-label";
    nameLabel.textContent = "Component Name";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "properties-panel-input";
    nameInput.value = component.getName();
    nameInput.placeholder = "Enter component name";

    nameSection.appendChild(nameLabel);
    nameSection.appendChild(nameInput);
    this.propertiesPanel.appendChild(nameSection);

    // Store reference for updates
    (nameInput as any).componentProperty = "name";
  }

  private createGearProperties(component: any): void {
    const gearProps = component.getGearProperties();
    const mechanicalProps = component.getMechanicalProperties();

    // Gear Type section
    const gearTypeSection = document.createElement("div");
    gearTypeSection.className = "properties-panel-section";

    const gearTypeLabel = document.createElement("div");
    gearTypeLabel.className = "properties-panel-label";
    gearTypeLabel.textContent = "Gear Type";

    const gearTypeSelect = document.createElement("select");
    gearTypeSelect.className = "properties-panel-input";
    gearTypeSelect.innerHTML = `
      <option value="gear-only">⚙️ Gear Only</option>
      <option value="hybrid">🔧 Hybrid</option>
      <option value="timing-gear">⏱️ Timing Gear</option>
      <option value="belt-pulley">🔄 Belt Pulley</option>
    `;
    gearTypeSelect.value = mechanicalProps.gearType || "hybrid";

    gearTypeSection.appendChild(gearTypeLabel);
    gearTypeSection.appendChild(gearTypeSelect);
    this.propertiesPanel.appendChild(gearTypeSection);

    // Teeth section
    const teethSection = document.createElement("div");
    teethSection.className = "properties-panel-section";

    const teethLabel = document.createElement("div");
    teethLabel.className = "properties-panel-label";
    teethLabel.textContent = "Teeth Count";

    const teethInput = document.createElement("input");
    teethInput.type = "number";
    teethInput.className = "properties-panel-input";
    teethInput.value = gearProps.teeth.toString();
    teethInput.min = "6";
    teethInput.max = "100";

    teethSection.appendChild(teethLabel);
    teethSection.appendChild(teethInput);
    this.propertiesPanel.appendChild(teethSection);

    // Material section
    const materialSection = document.createElement("div");
    materialSection.className = "properties-panel-section";

    const materialLabel = document.createElement("div");
    materialLabel.className = "properties-panel-label";
    materialLabel.textContent = "Material";

    const materialSelect = document.createElement("select");
    materialSelect.className = "properties-panel-input";
    materialSelect.innerHTML = `
      <option value="steel">🔩 Steel</option>
      <option value="brass">🥉 Brass</option>
      <option value="aluminum">⚪ Aluminum</option>
      <option value="plastic">🧩 Plastic</option>
      <option value="carbon">🖤 Carbon Fiber</option>
    `;
    materialSelect.value = mechanicalProps.material || "steel";

    materialSection.appendChild(materialLabel);
    materialSection.appendChild(materialSelect);
    this.propertiesPanel.appendChild(materialSection);

    // Store references for updates
    (gearTypeSelect as any).componentProperty = "gearType";
    (teethInput as any).componentProperty = "teeth";
    (materialSelect as any).componentProperty = "material";
  }

  private createMotorProperties(component: any): void {
    const motorProps = component.getMotorProperties();

    // RPM section
    const rpmSection = document.createElement("div");
    rpmSection.className = "properties-panel-section";

    const rpmLabel = document.createElement("div");
    rpmLabel.className = "properties-panel-label";
    rpmLabel.textContent = "Max RPM";

    const rpmInput = document.createElement("input");
    rpmInput.type = "number";
    rpmInput.className = "properties-panel-input";
    rpmInput.value = motorProps.maxRPM.toString();
    rpmInput.min = "100";
    rpmInput.max = "10000";

    rpmSection.appendChild(rpmLabel);
    rpmSection.appendChild(rpmInput);
    this.propertiesPanel.appendChild(rpmSection);

    // Torque section
    const torqueSection = document.createElement("div");
    torqueSection.className = "properties-panel-section";

    const torqueLabel = document.createElement("div");
    torqueLabel.className = "properties-panel-label";
    torqueLabel.textContent = "Nominal Torque (Nm)";

    const torqueInput = document.createElement("input");
    torqueInput.type = "number";
    torqueInput.className = "properties-panel-input";
    torqueInput.value = motorProps.nominalTorque.toString();
    torqueInput.min = "0.1";
    torqueInput.max = "100";
    torqueInput.step = "0.1";

    torqueSection.appendChild(torqueLabel);
    torqueSection.appendChild(torqueInput);
    this.propertiesPanel.appendChild(torqueSection);

    // Motor transitions section
    const transitionsSection = document.createElement("div");
    transitionsSection.className = "properties-panel-section";

    const transitionsLabel = document.createElement("div");
    transitionsLabel.className = "properties-panel-label";
    transitionsLabel.textContent = "Motor Transitions";

    const transitionSettings = component.getMotorTransitionSettings();

    const accelerationContainer = document.createElement("div");
    accelerationContainer.style.cssText =
      "display: flex; gap: 10px; margin-bottom: 8px;";

    const accelerationInput = document.createElement("input");
    accelerationInput.type = "number";
    accelerationInput.className = "properties-panel-input";
    accelerationInput.placeholder = "Acceleration";
    accelerationInput.value = transitionSettings.acceleration.toString();
    accelerationInput.min = "10";
    accelerationInput.max = "200";
    accelerationInput.step = "5";
    accelerationInput.style.flex = "1";

    const accelerationLabel = document.createElement("span");
    accelerationLabel.textContent = "RPM/s";
    accelerationLabel.style.cssText =
      "color: #bdc3c7; font-size: 11px; line-height: 35px;";

    accelerationContainer.appendChild(accelerationInput);
    accelerationContainer.appendChild(accelerationLabel);

    const decelerationContainer = document.createElement("div");
    decelerationContainer.style.cssText = "display: flex; gap: 10px;";

    const decelerationInput = document.createElement("input");
    decelerationInput.type = "number";
    decelerationInput.className = "properties-panel-input";
    decelerationInput.placeholder = "Deceleration";
    decelerationInput.value = transitionSettings.deceleration.toString();
    decelerationInput.min = "10";
    decelerationInput.max = "200";
    decelerationInput.step = "5";
    decelerationInput.style.flex = "1";

    const decelerationLabel = document.createElement("span");
    decelerationLabel.textContent = "RPM/s";
    decelerationLabel.style.cssText =
      "color: #bdc3c7; font-size: 11px; line-height: 35px;";

    decelerationContainer.appendChild(decelerationInput);
    decelerationContainer.appendChild(decelerationLabel);

    const transitionHelp = document.createElement("div");
    transitionHelp.style.cssText =
      "color: #7f8c8d; font-size: 10px; margin-top: 5px; font-style: italic;";
    transitionHelp.textContent = "How fast the motor accelerates/decelerates";

    transitionsSection.appendChild(transitionsLabel);
    transitionsSection.appendChild(accelerationContainer);
    transitionsSection.appendChild(decelerationContainer);
    transitionsSection.appendChild(transitionHelp);
    this.propertiesPanel.appendChild(transitionsSection);

    // Store references for updates
    (rpmInput as any).componentProperty = "maxRPM";
    (torqueInput as any).componentProperty = "nominalTorque";
    (accelerationInput as any).componentProperty = "acceleration";
    (decelerationInput as any).componentProperty = "deceleration";
  }

  private createPulleyProperties(component: any): void {
    const pulleyProps = component.getPulleyProperties();

    // Radius section
    const radiusSection = document.createElement("div");
    radiusSection.className = "properties-panel-section";

    const radiusLabel = document.createElement("div");
    radiusLabel.className = "properties-panel-label";
    radiusLabel.textContent = "Radius (px)";

    const radiusInput = document.createElement("input");
    radiusInput.type = "number";
    radiusInput.className = "properties-panel-input";
    radiusInput.value = pulleyProps.radius.toString();
    radiusInput.min = "8";
    radiusInput.max = "100";

    radiusSection.appendChild(radiusLabel);
    radiusSection.appendChild(radiusInput);
    this.propertiesPanel.appendChild(radiusSection);

    // Store reference for updates
    (radiusInput as any).componentProperty = "radius";
  }

  private createForkliftProperties(component: any): void {
    const forkliftProps = component.forkliftProps || {};

    // Max Lift Weight section
    const maxWeightSection = document.createElement("div");
    maxWeightSection.className = "properties-panel-section";

    const maxWeightLabel = document.createElement("div");
    maxWeightLabel.className = "properties-panel-label";
    maxWeightLabel.textContent = "Max Lift Weight (N)";

    const maxWeightInput = document.createElement("input");
    maxWeightInput.type = "number";
    maxWeightInput.className = "properties-panel-input";
    maxWeightInput.value = (forkliftProps.maxLiftWeight || 500).toString();
    maxWeightInput.min = "100";
    maxWeightInput.max = "2000";

    maxWeightSection.appendChild(maxWeightLabel);
    maxWeightSection.appendChild(maxWeightInput);
    this.propertiesPanel.appendChild(maxWeightSection);

    // Gear Ratio section
    const gearRatioSection = document.createElement("div");
    gearRatioSection.className = "properties-panel-section";

    const gearRatioLabel = document.createElement("div");
    gearRatioLabel.className = "properties-panel-label";
    gearRatioLabel.textContent = "Gear Ratio";

    const gearRatioInput = document.createElement("input");
    gearRatioInput.type = "number";
    gearRatioInput.className = "properties-panel-input";
    gearRatioInput.value = (forkliftProps.gearRatio || 5).toString();
    gearRatioInput.min = "1";
    gearRatioInput.max = "20";

    gearRatioSection.appendChild(gearRatioLabel);
    gearRatioSection.appendChild(gearRatioInput);
    this.propertiesPanel.appendChild(gearRatioSection);

    // Current Status section
    const statusSection = document.createElement("div");
    statusSection.className = "properties-panel-section";
    statusSection.innerHTML = `
      <div class="properties-panel-label">Current Status</div>
      <div style="font-size: 11px; color: #95a5a6; margin-top: 10px;">
        🏗️ Height: ${(component.liftHeight || 0).toFixed(1)}/${component.maxLiftHeight || 60}<br>
        📊 Status: ${
          component.liftHeight >= (component.maxLiftHeight || 60)
            ? "🔴 MAX HEIGHT"
            : component.liftHeight <= 0
              ? "🔵 MIN HEIGHT"
              : "🟢 OPERATIONAL"
        }<br>
        ⚙️ Pulley: ${forkliftProps.pulleyRadius || 12}px radius
      </div>
    `;
    this.propertiesPanel.appendChild(statusSection);

    // Store references for updates
    (maxWeightInput as any).componentProperty = "maxLiftWeight";
    (gearRatioInput as any).componentProperty = "gearRatio";
  }

  private createBeltProperties(component: any): void {
    const beltProps = component.getBeltProperties();

    // Efficiency section
    const efficiencySection = document.createElement("div");
    efficiencySection.className = "properties-panel-section";

    const efficiencyLabel = document.createElement("div");
    efficiencyLabel.className = "properties-panel-label";
    efficiencyLabel.textContent = "Efficiency (%)";

    const efficiencyInput = document.createElement("input");
    efficiencyInput.type = "number";
    efficiencyInput.className = "properties-panel-input";
    efficiencyInput.value = (beltProps.efficiency * 100).toString();
    efficiencyInput.min = "50";
    efficiencyInput.max = "100";

    efficiencySection.appendChild(efficiencyLabel);
    efficiencySection.appendChild(efficiencyInput);
    this.propertiesPanel.appendChild(efficiencySection);

    // Store reference for updates
    (efficiencyInput as any).componentProperty = "efficiency";
  }

  private createPositionProperties(component: any): void {
    const componentType = component.getComponentType();

    // Skip position editing for belts - they are positioned automatically
    if (componentType === "belt") {
      const positionSection = document.createElement("div");
      positionSection.className = "properties-panel-section";

      const positionLabel = document.createElement("div");
      positionLabel.className = "properties-panel-label";
      positionLabel.textContent = "Position";

      const infoDiv = document.createElement("div");
      infoDiv.style.cssText =
        "color: #95a5a6; font-size: 11px; font-style: italic; padding: 8px; background: #2c3e50; border-radius: 4px; border: 1px solid #34495e;";
      infoDiv.textContent =
        "Belt position is automatically determined by connected components";

      positionSection.appendChild(positionLabel);
      positionSection.appendChild(infoDiv);
      this.propertiesPanel.appendChild(positionSection);
      return;
    }

    const position = component.getPosition();

    const positionSection = document.createElement("div");
    positionSection.className = "properties-panel-section";

    const positionLabel = document.createElement("div");
    positionLabel.className = "properties-panel-label";
    positionLabel.textContent = "Position";

    const positionContainer = document.createElement("div");
    positionContainer.style.cssText = "display: flex; gap: 10px;";

    const xInput = document.createElement("input");
    xInput.type = "number";
    xInput.className = "properties-panel-input";
    xInput.placeholder = "X";
    xInput.value = Math.round(position.x).toString();
    xInput.style.flex = "1";

    const yInput = document.createElement("input");
    yInput.type = "number";
    yInput.className = "properties-panel-input";
    yInput.placeholder = "Y";
    yInput.value = Math.round(position.y).toString();
    yInput.style.flex = "1";

    positionContainer.appendChild(xInput);
    positionContainer.appendChild(yInput);
    positionSection.appendChild(positionLabel);
    positionSection.appendChild(positionContainer);
    this.propertiesPanel.appendChild(positionSection);

    // Store references for updates
    (xInput as any).componentProperty = "x";
    (yInput as any).componentProperty = "y";
  }

  private createActionButtons(component: any): void {
    const buttonSection = document.createElement("div");
    buttonSection.className = "properties-panel-section";
    buttonSection.style.cssText += "text-align: center;";

    // Apply Changes button
    const applyButton = document.createElement("button");
    applyButton.textContent = "Apply Changes";
    applyButton.className = "properties-panel-button";
    applyButton.style.marginRight = "10px";
    applyButton.onclick = () => this.applyPropertiesChanges();

    // Delete Component button
    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete Component";
    deleteButton.className = "properties-panel-button danger";
    deleteButton.onclick = () => this.deleteComponentFromPanel(component);

    buttonSection.appendChild(applyButton);
    buttonSection.appendChild(deleteButton);
    this.propertiesPanel.appendChild(buttonSection);
  }

  private applyPropertiesChanges(): void {
    if (!this.currentEditingComponent) return;

    const inputs = this.propertiesPanel.querySelectorAll(
      ".properties-panel-input"
    );
    const updates: any = {};

    inputs.forEach((input: any) => {
      if (input.componentProperty) {
        let value = input.value;

        // Convert to appropriate type
        if (input.type === "number") {
          value = parseFloat(value);
        } else if (
          input.componentProperty === "efficiency" &&
          input.type === "number"
        ) {
          value = parseFloat(value) / 100; // Convert percentage to decimal
        }

        updates[input.componentProperty] = value;
      }
    });

    // Apply name updates
    if (updates.name !== undefined && updates.name.trim() !== "") {
      const newName = updates.name.trim();
      const oldName = this.currentEditingComponent.getName();

      // Check if name is different and not empty
      if (newName !== oldName) {
        // Update the component's name - this updates the internal name
        this.currentEditingComponent.setName(newName);

        console.log(`🏷️ Renamed component: ${oldName} → ${newName}`);

        // The component is tracked by reference, so name change doesn't break tracking
        // but we should update any name-dependent displays
        this.updateInfoBar(`Component renamed to: ${newName}`, "info");
      }
    }

    // Apply position updates
    if (updates.x !== undefined || updates.y !== undefined) {
      const currentPos = this.currentEditingComponent.getPosition();
      const newX = updates.x !== undefined ? updates.x : currentPos.x;
      const newY = updates.y !== undefined ? updates.y : currentPos.y;
      this.currentEditingComponent.setPosition(newX, newY);
    }

    // Apply property updates to the component
    this.updateComponentProperties(this.currentEditingComponent, updates);

    // Update visuals
    this.currentEditingComponent.updateVisuals(0);

    // Show success feedback
    this.updateInfoBar(
      `Updated ${this.currentEditingComponent.getName()} properties`,
      "success"
    );

    // Refresh the panel to show updated values
    this.showPropertiesPanel(this.currentEditingComponent);
  }

  private updateComponentProperties(component: any, updates: any): void {
    // This method would need to be implemented based on how component properties are structured
    // For now, we'll update what we can directly

    try {
      const componentType = component.getComponentType();

      if (componentType === "gear" && component.updateGearProperties) {
        component.updateGearProperties(updates);
      } else if (componentType === "motor" && component.updateMotorProperties) {
        component.updateMotorProperties(updates);
      } else if (
        componentType === "pulley" &&
        component.updatePulleyProperties
      ) {
        component.updatePulleyProperties(updates);
      }

      console.log(`Updated ${component.getName()} with:`, updates);
    } catch (error) {
      console.error("Failed to update component properties:", error);
      this.updateInfoBar("Failed to update component properties", "error");
    }
  }

  private deleteComponentFromPanel(component: any): void {
    // Clear selection and select this component
    this.clearComponentSelection();
    this.selectComponent(component, false);

    // Hide properties panel
    this.hidePropertiesPanel();

    // Show delete confirmation
    void this.showDeleteConfirmationDialog();
  }

  protected createDragDropAssetElement(asset: AssetItem): HTMLElement {
    const assetDiv = document.createElement("div");
    assetDiv.className = "toolbar-asset";
    assetDiv.dataset.assetId = asset.id;
    assetDiv.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px 6px;
      margin: 6px 0;
      background: rgba(52, 73, 94, 0.8);
      border: 2px solid transparent;
      border-radius: 6px;
      cursor: grab;
      transition: all 0.3s ease;
      user-select: none;
      text-align: center;
      min-height: 60px;
    `;

    // Add Tippy tooltip instead of default title
    this.addTooltip(assetDiv, asset.description);

    // Asset icon (on top)
    const icon = document.createElement("img");
    icon.src = asset.icon;
    icon.alt = asset.name;
    icon.style.cssText = `
      width: 24px;
      height: 24px;
      margin-bottom: 4px;
      pointer-events: none;
      filter: brightness(0) invert(1);
    `;

    // Asset name (below icon)
    const name = document.createElement("div");
    name.textContent = asset.name;
    name.style.cssText = `
      color: #ecf0f1;
      font-weight: bold;
      font-size: 10px;
      pointer-events: none;
      line-height: 1.2;
    `;

    assetDiv.appendChild(icon);
    assetDiv.appendChild(name);

    // Mouse-based drag instead of HTML5 drag and drop
    assetDiv.addEventListener("mousedown", (e) => {
      // Start drag from toolbar
      (this as any).startToolbarDrag(asset.id, e);
    });

    // Hover effects
    assetDiv.addEventListener("mouseenter", () => {
      assetDiv.style.borderColor = "#3498db";
      assetDiv.style.background = "rgba(52, 152, 219, 0.2)";
      assetDiv.style.transform = "translateX(-5px)";
    });

    assetDiv.addEventListener("mouseleave", () => {
      if (!this.isDragging) {
        assetDiv.style.borderColor = "transparent";
        assetDiv.style.background = "rgba(52, 73, 94, 0.8)";
        assetDiv.style.transform = "translateX(0)";
      }
    });

    return assetDiv;
  }

  protected createClickActivateToolElement(tool: AssetItem): HTMLElement {
    const toolContainer = document.createElement("div");
    toolContainer.className = "toolbar-tool-container";

    // Special handling for belt tool with dropdown
    if (tool.type === "belt") {
      return this.createBeltToolWithDropdown(tool);
    }

    // Standard tool element for other tools
    const toolDiv = document.createElement("div");
    toolDiv.className = "toolbar-tool";
    toolDiv.dataset.toolId = tool.id;
    toolDiv.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px 6px;
      margin: 6px 0;
      background: rgba(52, 73, 94, 0.8);
      border: 2px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.3s ease;
      user-select: none;
      text-align: center;
      min-height: 60px;
    `;

    // Add Tippy tooltip instead of default title
    this.addTooltip(toolDiv, tool.description);

    // Tool icon (on top)
    const icon = document.createElement("img");
    icon.src = tool.icon;
    icon.alt = tool.name;
    icon.style.cssText = `
      width: 24px;
      height: 24px;
      margin-bottom: 4px;
      pointer-events: none;
      filter: brightness(0) invert(1);
    `;

    // Tool name (below icon)
    const name = document.createElement("div");
    name.textContent = tool.name;
    name.style.cssText = `
      color: #ecf0f1;
      font-weight: bold;
      font-size: 10px;
      pointer-events: none;
      line-height: 1.2;
    `;

    toolDiv.appendChild(icon);
    toolDiv.appendChild(name);

    // Click to activate/deactivate tool
    toolDiv.addEventListener("click", () => {
      this.toggleTool(tool);
    });

    // Hover effects
    toolDiv.addEventListener("mouseenter", () => {
      if (!this.isToolActive(tool)) {
        toolDiv.style.borderColor = "#e74c3c";
        toolDiv.style.background = "rgba(231, 76, 60, 0.2)";
        toolDiv.style.transform = "translateX(-5px)";
      }
    });

    toolDiv.addEventListener("mouseleave", () => {
      if (!this.isToolActive(tool)) {
        toolDiv.style.borderColor = "transparent";
        toolDiv.style.background = "rgba(52, 73, 94, 0.8)";
        toolDiv.style.transform = "translateX(0)";
      }
    });

    return toolDiv;
  }

  private createBeltToolWithDropdown(tool: AssetItem): HTMLElement {
    const toolContainer = document.createElement("div");
    toolContainer.className = "toolbar-tool-container";
    toolContainer.dataset.toolId = tool.id;

    // Add Tippy tooltip instead of default title
    this.addTooltip(toolContainer, tool.description);

    toolContainer.style.cssText = `
      margin: 6px 0;
    `;

    // Main tool element
    const toolDiv = document.createElement("div");
    toolDiv.className = "toolbar-tool belt-tool";
    toolDiv.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px 6px;
      background: rgba(52, 73, 94, 0.8);
      border: 2px solid transparent;
      border-radius: 6px 6px ${this.isBeltDropdownOpen ? "0 0" : "6px 6px"};
      cursor: pointer;
      transition: all 0.3s ease;
      user-select: none;
      text-align: center;
      min-height: 60px;
      position: relative;
    `;

    // Tool icon (on top)
    const icon = document.createElement("img");
    icon.src = tool.icon;
    icon.alt = tool.name;
    icon.style.cssText = `
      width: 24px;
      height: 24px;
      margin-bottom: 4px;
      pointer-events: none;
      filter: brightness(0) invert(1);
    `;

    // Tool name (below icon)
    const name = document.createElement("div");
    name.textContent = tool.name;
    name.style.cssText = `
      color: #ecf0f1;
      font-weight: bold;
      font-size: 10px;
      pointer-events: none;
      line-height: 1.2;
      margin-bottom: 1px;
    `;

    // Belt type indicator (smaller text below name)
    const typeIndicator = document.createElement("div");
    typeIndicator.className = "belt-type-indicator";
    typeIndicator.textContent =
      this.selectedBeltType === "normal" ? "Normal" : "Cross";
    typeIndicator.style.cssText = `
      font-size: 8px;
      color: #bdc3c7;
      line-height: 1.2;
      pointer-events: none;
    `;

    // Dropdown arrow (positioned absolutely at bottom-right)
    const arrow = document.createElement("div");
    arrow.className = "dropdown-arrow";
    arrow.style.cssText = `
      position: absolute;
      bottom: 4px;
      right: 4px;
      width: 8px;
      height: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
    `;

    // Create the actual arrow triangle as a child element
    const arrowTriangle = document.createElement("div");
    arrowTriangle.style.cssText = `
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 4px solid #bdc3c7;
      transform: ${this.isBeltDropdownOpen ? "rotate(180deg)" : "rotate(0deg)"};
      transition: transform 0.3s ease;
    `;

    arrow.appendChild(arrowTriangle);

    toolDiv.appendChild(icon);
    toolDiv.appendChild(name);
    toolDiv.appendChild(typeIndicator);
    toolDiv.appendChild(arrow);

    // Dropdown options
    const dropdown = document.createElement("div");
    dropdown.className = "belt-dropdown";
    dropdown.style.cssText = `
      display: ${this.isBeltDropdownOpen ? "block" : "none"};
      background: rgba(44, 62, 80, 0.95);
      border: 2px solid #e74c3c;
      border-top: none;
      border-radius: 0 0 8px 8px;
      overflow: hidden;
    `;

    // Normal Belt Option
    const normalOption = document.createElement("div");
    normalOption.className = "belt-option";
    normalOption.dataset.beltType = "normal";
    normalOption.style.cssText = `
      padding: 10px 12px;
      cursor: pointer;
      transition: background-color 0.2s ease;
      border-bottom: 1px solid rgba(127, 140, 141, 0.3);
      ${this.selectedBeltType === "normal" ? "background: rgba(39, 174, 96, 0.3);" : ""}
    `;
    normalOption.innerHTML = `
      <div style="display: flex; align-items: center;">
        <div style="width: 20px; height: 20px; margin-right: 8px; background: #2ecc71; border-radius: 50%; ${this.selectedBeltType === "normal" ? "box-shadow: 0 0 8px rgba(46, 204, 113, 0.6);" : ""}"></div>
        <div>
          <div style="color: #ecf0f1; font-size: 12px; font-weight: bold;">Normal Belt</div>
          <div style="color: #bdc3c7; font-size: 10px;">Standard power transmission</div>
        </div>
      </div>
    `;

    // Cross Belt Option
    const crossOption = document.createElement("div");
    crossOption.className = "belt-option";
    crossOption.dataset.beltType = "cross";
    crossOption.style.cssText = `
      padding: 10px 12px;
      cursor: pointer;
      transition: background-color 0.2s ease;
      ${this.selectedBeltType === "cross" ? "background: rgba(39, 174, 96, 0.3);" : ""}
    `;
    crossOption.innerHTML = `
      <div style="display: flex; align-items: center;">
        <div style="width: 20px; height: 20px; margin-right: 8px; background: #e74c3c; border-radius: 50%; ${this.selectedBeltType === "cross" ? "box-shadow: 0 0 8px rgba(231, 76, 60, 0.6);" : ""}"></div>
        <div>
          <div style="color: #ecf0f1; font-size: 12px; font-weight: bold;">Cross Belt</div>
          <div style="color: #bdc3c7; font-size: 10px;">Reverses rotation direction</div>
        </div>
      </div>
    `;

    dropdown.appendChild(normalOption);
    dropdown.appendChild(crossOption);
    toolContainer.appendChild(toolDiv);
    toolContainer.appendChild(dropdown);

    // Event handlers
    // Main tool click - activate/deactivate tool
    toolDiv.addEventListener("click", (e) => {
      // Check if click was on the arrow container or triangle
      const target = e.target as HTMLElement;
      if (
        target.classList.contains("dropdown-arrow") ||
        target.parentElement?.classList.contains("dropdown-arrow")
      ) {
        return; // Let arrow handle its own click
      }

      e.stopPropagation();
      this.toggleBeltToolActivation(tool);
    });

    // Arrow click - open/close dropdown
    arrow.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleBeltDropdown(toolContainer);
    });

    // Arrow hover effect
    arrow.addEventListener("mouseenter", () => {
      arrowTriangle.style.borderTopColor = "#ecf0f1"; // Brighter on hover
    });

    arrow.addEventListener("mouseleave", () => {
      arrowTriangle.style.borderTopColor = "#bdc3c7"; // Back to normal
    });

    // Dropdown option clicks
    normalOption.addEventListener("click", (e) => {
      e.stopPropagation();
      this.selectBeltType("normal");
    });

    crossOption.addEventListener("click", (e) => {
      e.stopPropagation();
      this.selectBeltType("cross");
    });

    // Hover effects
    toolDiv.addEventListener("mouseenter", () => {
      if (!this.isToolActive(tool)) {
        toolDiv.style.borderColor = "#e74c3c";
        toolDiv.style.background = "rgba(231, 76, 60, 0.2)";
        toolDiv.style.transform = "translateX(-5px)";
      }
    });

    toolDiv.addEventListener("mouseleave", () => {
      if (!this.isToolActive(tool)) {
        toolDiv.style.borderColor = "transparent";
        toolDiv.style.background = "rgba(52, 73, 94, 0.8)";
        toolDiv.style.transform = "translateX(0)";
      }
    });

    normalOption.addEventListener("mouseenter", () => {
      if (this.selectedBeltType !== "normal") {
        normalOption.style.background = "rgba(127, 140, 141, 0.2)";
      }
    });

    normalOption.addEventListener("mouseleave", () => {
      if (this.selectedBeltType !== "normal") {
        normalOption.style.background = "transparent";
      }
    });

    crossOption.addEventListener("mouseenter", () => {
      if (this.selectedBeltType !== "cross") {
        crossOption.style.background = "rgba(127, 140, 141, 0.2)";
      }
    });

    crossOption.addEventListener("mouseleave", () => {
      if (this.selectedBeltType !== "cross") {
        crossOption.style.background = "transparent";
      }
    });

    return toolContainer;
  }

  private toggleBeltToolActivation(tool: AssetItem): void {
    console.log(
      `🔧 Toggling belt tool activation: current state = ${this.beltCreationMode}`
    );

    if (this.beltCreationMode) {
      // Currently active - deactivate
      this.deactivateBeltTool();
    } else {
      // Currently inactive - activate with current selected type
      this.activateBeltTool();
    }

    this.updateToolVisualState(tool);
  }

  private deactivateBeltTool(): void {
    this.beltCreationMode = false;
    this.selectedComponents = [];
    this.beltCreationConfig = null;

    // Close dropdown if open
    if (this.isBeltDropdownOpen) {
      this.isBeltDropdownOpen = false;
      const beltToolContainer = document.querySelector(
        '[data-tool-id="belt"]'
      ) as HTMLElement;
      if (beltToolContainer) {
        this.toggleBeltDropdown(beltToolContainer);
      }
    }

    // Clear all highlights when deactivating
    this.clearHighlights();

    this.updateInfoBar("Belt tool deactivated", "info");
    console.log("🔧 Belt tool deactivated - highlights cleared");
  }

  private toggleBeltDropdown(toolContainer: HTMLElement): void {
    this.isBeltDropdownOpen = !this.isBeltDropdownOpen;

    const dropdown = toolContainer.querySelector(
      ".belt-dropdown"
    ) as HTMLElement;
    const arrow = toolContainer.querySelector(".dropdown-arrow") as HTMLElement;
    const arrowTriangle = arrow?.querySelector("div") as HTMLElement;
    const toolDiv = toolContainer.querySelector(".toolbar-tool") as HTMLElement;

    if (dropdown && arrow && arrowTriangle && toolDiv) {
      dropdown.style.display = this.isBeltDropdownOpen ? "block" : "none";
      arrowTriangle.style.transform = this.isBeltDropdownOpen
        ? "rotate(180deg)"
        : "rotate(0deg)";
      toolDiv.style.borderRadius = this.isBeltDropdownOpen
        ? "8px 8px 0 0"
        : "8px";
    }

    console.log(
      `🔧 Belt dropdown ${this.isBeltDropdownOpen ? "opened" : "closed"}`
    );
  }

  private selectBeltType(type: "normal" | "cross"): void {
    this.selectedBeltType = type;

    console.log(`🔧 Selected belt type: ${type}`);

    // Update the type indicator
    const typeIndicator = document.querySelector(
      ".belt-type-indicator"
    ) as HTMLElement;
    if (typeIndicator) {
      typeIndicator.textContent =
        type === "normal" ? "Normal Belt" : "Cross Belt";
    }

    // Update option styling
    const normalOption = document.querySelector(
      '[data-belt-type="normal"]'
    ) as HTMLElement;
    const crossOption = document.querySelector(
      '[data-belt-type="cross"]'
    ) as HTMLElement;

    if (normalOption && crossOption) {
      // Update background colors
      normalOption.style.background =
        type === "normal" ? "rgba(39, 174, 96, 0.3)" : "transparent";
      crossOption.style.background =
        type === "cross" ? "rgba(39, 174, 96, 0.3)" : "transparent";

      // Update glow effects on dots
      const normalDot = normalOption.querySelector("div > div") as HTMLElement;
      const crossDot = crossOption.querySelector("div > div") as HTMLElement;

      if (normalDot) {
        normalDot.style.boxShadow =
          type === "normal" ? "0 0 8px rgba(46, 204, 113, 0.6)" : "none";
      }
      if (crossDot) {
        crossDot.style.boxShadow =
          type === "cross" ? "0 0 8px rgba(231, 76, 60, 0.6)" : "none";
      }
    }

    // Close dropdown
    this.isBeltDropdownOpen = false;
    this.toggleBeltDropdown(
      document.querySelector('[data-tool-id="belt"]') as HTMLElement
    );

    // If tool is currently active, update the configuration and restart
    if (this.beltCreationMode) {
      this.activateBeltTool(); // Re-activate with new type
      console.log("🔧 Belt tool reactivated with new type");
    } else {
      console.log("🔧 Belt type changed - tool remains inactive");
    }
  }

  private findAssetById(id: string): AssetItem | undefined {
    // Search in drag & drop components first
    const dragDropAsset = this.dragDropComponents.find(
      (asset) => asset.id === id
    );
    if (dragDropAsset) return dragDropAsset;

    // Then search in click-to-activate tools
    const toolAsset = this.clickActivateTools.find((tool) => tool.id === id);
    return toolAsset;
  }

  private toggleTool(tool: AssetItem): void {
    console.log(`🔧 Toggling tool: ${tool.name}`);

    if (tool.type === "belt") {
      // Belt tool activation/deactivation
      this.toggleBeltToolActivation(tool);
    } else if (tool.type === "chain") {
      // Future: Chain tool implementation
      this.updateInfoBar(`${tool.name} - Coming soon!`, "info");
    }

    this.updateToolVisualState(tool);
  }

  private activateBeltTool(): void {
    this.beltCreationMode = true;
    this.selectedComponents = [];

    // Set belt configuration based on selected type
    const isCrossed = this.selectedBeltType === "cross";
    this.beltCreationConfig = {
      type: isCrossed ? "crossed" : "open",
      width: 3, // Default width
      color: isCrossed ? "#e74c3c" : "#2ecc71", // Red for cross, green for normal
      crossed: isCrossed,
    };

    // Immediately highlight all compatible components
    this.highlightCompatibleComponents();

    this.updateInfoBar(
      `${this.selectedBeltType === "normal" ? "Normal" : "Cross"} belt tool activated - Click 2 compatible components to connect`,
      "info"
    );
    console.log(
      `🔧 ${this.selectedBeltType} belt tool activated - compatible components highlighted`
    );
  }

  // Removed _legacy_deactivateBeltTool - replaced with deactivateBeltTool

  private isToolActive(tool: AssetItem): boolean {
    if (tool.type === "belt") {
      return this.beltCreationMode;
    }
    return false;
  }

  private updateToolVisualState(tool: AssetItem): void {
    const toolElement = document.querySelector(
      `[data-tool-id="${tool.id}"]`
    ) as HTMLElement;
    if (!toolElement) return;

    const isActive = this.isToolActive(tool);

    // Handle belt tool with dropdown structure
    if (tool.type === "belt") {
      const beltToolDiv = toolElement.querySelector(
        ".toolbar-tool"
      ) as HTMLElement;
      if (beltToolDiv) {
        if (isActive) {
          // Active state - red/orange glow
          beltToolDiv.style.borderColor = "#e74c3c";
          beltToolDiv.style.background = "rgba(231, 76, 60, 0.3)";
          beltToolDiv.style.boxShadow = "0 0 15px rgba(231, 76, 60, 0.5)";
        } else {
          // Inactive state
          beltToolDiv.style.borderColor = "transparent";
          beltToolDiv.style.background = "rgba(52, 73, 94, 0.8)";
          beltToolDiv.style.boxShadow = "none";
        }
      }
    } else {
      // Standard tool handling
      if (isActive) {
        // Active state - red/orange glow
        toolElement.style.borderColor = "#e74c3c";
        toolElement.style.background = "rgba(231, 76, 60, 0.3)";
        toolElement.style.boxShadow = "0 0 15px rgba(231, 76, 60, 0.5)";
      } else {
        // Inactive state
        toolElement.style.borderColor = "transparent";
        toolElement.style.background = "rgba(52, 73, 94, 0.8)";
        toolElement.style.boxShadow = "none";
      }
    }
  }

  private createDragPreview(): void {
    this.dragPreview = document.createElement("div");
    this.dragPreview.id = "drag-preview";
    this.dragPreview.style.cssText = `
      position: fixed;
      width: 64px;
      height: 64px;
      pointer-events: none;
      z-index: 10000;
      opacity: 0.7;
      transform: scale(1.2);
      background: rgba(52, 152, 219, 0.3);
      border: 2px dashed #3498db;
      border-radius: 8px;
      display: none;
      justify-content: center;
      align-items: center;
    `;
    document.body.appendChild(this.dragPreview);
  }

  private createConfigModal(): void {
    this.configModal = document.createElement("div");
    this.configModal.id = "config-modal";
    this.configModal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.7);
      z-index: 10000;
      display: none;
      justify-content: center;
      align-items: center;
    `;
    document.body.appendChild(this.configModal);
  }

  private createInfoBar(): void {
    // Remove existing info bar if it exists
    const existing = document.getElementById("editor-info-bar");
    if (existing) {
      existing.remove();
    }

    this.infoBar = document.createElement("div");
    this.infoBar.id = "editor-info-bar";
    this.infoBar.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 160px;
      height: 50px;
      background: linear-gradient(135deg, #2c3e50, #34495e);
      border-top: 2px solid #3498db;
      display: flex;
      align-items: center;
      padding: 0 20px;
      color: #ecf0f1;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 1000;
      box-shadow: 0 -2px 10px rgba(0,0,0,0.3);
    `;

    this.updateInfoBar(
      "Ready - Drag components from the toolbar to the canvas"
    );
    document.body.appendChild(this.infoBar);
  }

  private updateInfoBar(
    message: string,
    type: "info" | "success" | "warning" | "error" = "info"
  ): void {
    if (!this.infoBar) return;

    const colors = {
      info: "#3498db",
      success: "#27ae60",
      warning: "#f39c12",
      error: "#e74c3c",
    };

    this.infoBar.textContent = message;
    this.infoBar.style.borderTopColor = colors[type];

    // Auto-clear non-info messages after 3 seconds
    if (type !== "info") {
      setTimeout(() => {
        if (this.infoBar) {
          this.updateInfoBar(
            "Ready - Drag components from the toolbar to the canvas"
          );
        }
      }, 3000);
    }
  }

  private setupEventListeners(): void {
    // Mouse-based drag system (replaces HTML5 drag and drop)
    let isDraggingFromToolbar = false;
    let draggedAssetId = "";

    // Mouse move - update drag preview
    document.addEventListener("mousemove", (e) => {
      if (isDraggingFromToolbar) {
        e.preventDefault();
        this.updateDragPreview(e.clientX, e.clientY);
      }
    });

    // Mouse up - handle drop
    document.addEventListener("mouseup", (e) => {
      if (isDraggingFromToolbar) {
        e.preventDefault();

        // Check if we're dropping over the canvas (not the toolbar)
        const toolbarElement = this.toolbar;
        const toolbarRect = toolbarElement.getBoundingClientRect();
        const isOverToolbar =
          e.clientX >= toolbarRect.left &&
          e.clientX <= toolbarRect.right &&
          e.clientY >= toolbarRect.top &&
          e.clientY <= toolbarRect.bottom;

        if (!isOverToolbar) {
          // Convert screen coordinates to world coordinates
          const worldPosition = this.screenToWorldCoordinates(
            e.clientX,
            e.clientY
          );

          this.handleDrop(draggedAssetId, worldPosition);
        }

        this.hideDragPreview();
        isDraggingFromToolbar = false;
        draggedAssetId = "";
        this.isDragging = false;
        this.clearToolbarHighlights(); // Clear any lingering toolbar highlights
      }
    });

    // Store reference for toolbar asset mousedown events
    (this as any).startToolbarDrag = (assetId: string, event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      isDraggingFromToolbar = true;
      draggedAssetId = assetId;
      this.isDragging = true;

      // Show drag preview
      const asset = this.findAssetById(assetId)!;
      this.showDragPreview(asset);
      this.updateDragPreview(event.clientX, event.clientY);

      console.log(`Started dragging ${assetId} from toolbar`);
    };

    // Close belt dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (this.isBeltDropdownOpen) {
        const target = e.target as HTMLElement;
        const beltToolContainer = document.querySelector(
          '[data-tool-id="belt"]'
        ) as HTMLElement;

        // Check if click is outside belt tool
        if (beltToolContainer && !beltToolContainer.contains(target)) {
          this.isBeltDropdownOpen = false;
          this.toggleBeltDropdown(beltToolContainer);
          console.log("🔧 Belt dropdown closed - clicked outside");
        }
      }
    });

    // ESC key to exit belt creation mode
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.keyCode === 27) {
        if (this.beltCreationMode) {
          console.log("🎮 ESC pressed - exiting belt creation mode");
          this.deactivateBeltTool();
          // Update visual state for belt tool
          const beltTool = this.clickActivateTools.find(
            (tool) => tool.type === "belt"
          );
          if (beltTool) {
            this.updateToolVisualState(beltTool);
          }
        }
      }
    });

    // Canvas panning functionality
    this.setupCanvasPanning();
  }

  private setupCanvasPanning(): void {
    const gameManager = this.getGameManager();
    const app = gameManager.getApp();

    // Use a more reliable approach: listen on the canvas element directly
    let panStarted = false;

    app.canvas.addEventListener("mousedown", (e: MouseEvent) => {
      // Don't pan if:
      // - Already dragging from toolbar
      // - Already dragging a component
      // - Belt creation mode is active
      // - Right click (we want left click only)
      if (
        this.isDragging ||
        this.isDraggingComponent ||
        this.beltCreationMode ||
        e.button !== 0
      ) {
        return;
      }

      // Clear component selections when clicking on empty space (unless Ctrl is held)
      if (!e.ctrlKey && !e.metaKey) {
        this.clearComponentSelection();
      }

      // Check if we're over a component by using world coordinate hit testing
      const rect = app.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Convert screen coordinates to world coordinates for hit testing
      const worldCoords = this.screenToWorldCoordinates(e.clientX, e.clientY);

      let hitObject = null;
      const mechanicalComponents =
        this.getSceneManager().getAllMechanicalComponents();

      mechanicalComponents.forEach((component) => {
        const displayObject = component.displayObject();
        if (displayObject && displayObject.interactive) {
          const compPos = component.getPosition();
          const distance = Math.sqrt(
            Math.pow(worldCoords.x - compPos.x, 2) +
              Math.pow(worldCoords.y - compPos.y, 2)
          );

          // Use a reasonable hit radius (adjust based on your component sizes)
          if (distance < 50) {
            hitObject = displayObject;
          }
        }
      });

      console.log(
        `🔄 Mouse at world(${worldCoords.x.toFixed(1)}, ${worldCoords.y.toFixed(1)}) - Hit object: ${hitObject ? "YES" : "NO"}`
      );

      // Check if space pan mode is active
      const isSpacePanMode = (this as any).isSpacePanMode
        ? (this as any).isSpacePanMode()
        : false;

      // If we hit a component and space isn't held, don't start panning
      if (hitObject && !isSpacePanMode) {
        console.log(
          "🔄 Hit a component, not panning (hold space to pan over components)"
        );
        return;
      }

      // Allow panning on empty canvas or when space is held
      if (isSpacePanMode) {
        console.log("🔄 Space held - panning regardless of hit test");
      } else {
        console.log("🔄 Empty canvas - allowing pan");
      }

      console.log("🔄 Starting canvas pan");
      this.isPanningCanvas = true;
      panStarted = true;

      // Store starting positions
      this.panStartPosition.x = x;
      this.panStartPosition.y = y;

      const cameraPos = this.getCameraPosition();
      this.cameraStartPosition.x = cameraPos.x;
      this.cameraStartPosition.y = cameraPos.y;

      // Change cursor to grab
      app.canvas.style.cursor = "grabbing";

      this.updateInfoBar("Panning canvas - drag to move around", "info");
      e.preventDefault();
    });

    // Mouse move - handle panning
    app.canvas.addEventListener("mousemove", (e: MouseEvent) => {
      if (!this.isPanningCanvas || !panStarted) return;

      const rect = app.canvas.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      // Calculate pan delta
      const deltaX = currentX - this.panStartPosition.x;
      const deltaY = currentY - this.panStartPosition.y;

      // Apply pan offset to camera
      const newCameraX = this.cameraStartPosition.x + deltaX;
      const newCameraY = this.cameraStartPosition.y + deltaY;

      // Set camera position directly
      app.stage.position.set(newCameraX, newCameraY);

      this.updateInfoBar(
        `Panning: ${Math.round(deltaX)}, ${Math.round(deltaY)}`,
        "info"
      );
    });

    // Mouse up - end panning
    const endPanning = () => {
      if (this.isPanningCanvas && panStarted) {
        console.log("🔄 Ending canvas pan");
        this.isPanningCanvas = false;
        panStarted = false;

        // Reset cursor
        app.canvas.style.cursor = "default";

        this.updateInfoBar("Canvas panning ended", "info");
      }
    };

    app.canvas.addEventListener("mouseup", endPanning);
    document.addEventListener("mouseup", endPanning); // Global fallback

    // Space bar for temporary pan mode
    let spaceHeld = false;
    document.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !spaceHeld) {
        e.preventDefault();
        spaceHeld = true;
        app.canvas.style.cursor = "grab";
        this.updateInfoBar("Space held - Pan mode active", "info");
      }
    });

    document.addEventListener("keyup", (e) => {
      if (e.code === "Space" && spaceHeld) {
        e.preventDefault();
        spaceHeld = false;
        app.canvas.style.cursor = "default";
        this.updateInfoBar("Space released - Pan mode off", "info");
      }
    });

    // Update panning logic to check for space bar
    (this as any).isSpacePanMode = () => spaceHeld;

    // Wheel zoom support - zoom to cursor position
    app.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();

      // Get mouse position relative to canvas
      const rect = app.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const gameManager = this.getGameManager();

      if (e.deltaY < 0) {
        // Scroll up - zoom in towards cursor
        gameManager.zoomInToPoint(mouseX, mouseY);
        this.updateInfoBar(
          `Zoomed in - Level: ${(this.getZoomLevel() * 100).toFixed(0)}%`
        );
      } else {
        // Scroll down - zoom out from cursor
        gameManager.zoomOutFromPoint(mouseX, mouseY);
        this.updateInfoBar(
          `Zoomed out - Level: ${(this.getZoomLevel() * 100).toFixed(0)}%`
        );
      }
    });
  }

  private showDragPreview(asset: AssetItem): void {
    const icon = document.createElement("img");
    icon.src = asset.icon;
    icon.style.cssText = `
      width: 48px;
      height: 48px;
      filter: brightness(0) invert(1);
    `;

    this.dragPreview.innerHTML = "";
    this.dragPreview.appendChild(icon);
    this.dragPreview.style.display = "flex";
  }

  private updateDragPreview(x: number, y: number): void {
    this.dragPreview.style.left = x - 32 + "px";
    this.dragPreview.style.top = y - 32 + "px";
  }

  private hideDragPreview(): void {
    this.dragPreview.style.display = "none";
  }

  private clearToolbarHighlights(): void {
    // Clear highlights from all toolbar assets
    this.dragDropComponents.forEach((asset) => {
      const assetElement = document.querySelector(
        `[data-asset-id="${asset.id}"]`
      ) as HTMLElement;
      if (assetElement) {
        assetElement.style.borderColor = "transparent";
        assetElement.style.background = "rgba(52, 73, 94, 0.8)";
        assetElement.style.transform = "translateX(0)";
      }
    });
  }

  private selectComponent(component: any, multiSelect: boolean = false): void {
    if (!multiSelect) {
      // Clear previous selections if not multi-selecting
      this.clearComponentSelection();
    }

    // Add to selection
    this.selectedComponentsForDeletion.add(component);
    this.addSelectionHighlight(component);

    console.log(`🎯 Component selected: ${component.getName()}`);

    // Show properties panel for single selection
    if (this.selectedComponentsForDeletion.size === 1 && !multiSelect) {
      this.showPropertiesPanel(component);
      this.updateInfoBar(
        `Editing: ${component.getName()} - See properties panel →`
      );
    } else {
      this.hidePropertiesPanel();
      this.updateInfoBar(
        `Selected: ${component.getName()}${multiSelect ? ` (+${this.selectedComponentsForDeletion.size - 1} others)` : ""}`
      );
    }
  }

  private deselectComponent(component: any): void {
    this.selectedComponentsForDeletion.delete(component);
    this.removeSelectionHighlight(component);

    console.log(`🎯 Component deselected: ${component.getName()}`);

    // Hide properties panel if this was the only selected component
    if (this.currentEditingComponent === component) {
      this.hidePropertiesPanel();
    }

    if (this.selectedComponentsForDeletion.size === 0) {
      this.updateInfoBar("No components selected");
    } else if (this.selectedComponentsForDeletion.size === 1) {
      // Show properties panel for the remaining selected component
      const remainingComponent = Array.from(
        this.selectedComponentsForDeletion
      )[0];
      this.showPropertiesPanel(remainingComponent);
      this.updateInfoBar(
        `Editing: ${remainingComponent.getName()} - See properties panel →`
      );
    } else {
      this.updateInfoBar(
        `${this.selectedComponentsForDeletion.size} component(s) selected`
      );
    }
  }

  private clearComponentSelection(): void {
    // Remove all selection highlights
    this.selectedComponentsForDeletion.forEach((component) => {
      this.removeSelectionHighlight(component);
    });
    this.selectedComponentsForDeletion.clear();

    // Hide properties panel when clearing selection
    this.hidePropertiesPanel();

    console.log("🎯 All selections cleared");
  }

  private addSelectionHighlight(component: any): void {
    const displayObject = component.displayObject();
    if (!displayObject) return;

    // Create selection highlight graphics
    const highlight = new Graphics();
    const componentType = component.getComponentType();
    const pos = component.getPosition();

    // Create shape-specific highlights
    switch (componentType) {
      case "motor":
        this.createMotorSelectionHighlight(highlight, component);
        break;
      case "gear":
        this.createGearSelectionHighlight(highlight, component);
        break;
      case "pulley":
        this.createPulleySelectionHighlight(highlight, component);
        break;
      case "forklift":
        this.createForkliftSelectionHighlight(highlight, component);
        break;
      case "belt":
        this.createBeltSelectionHighlight(highlight, component);
        break;
      default:
        // Fallback to bounds-based highlight for unknown types
        this.createDefaultSelectionHighlight(highlight, displayObject);
        break;
    }

    // Position highlight at component position
    highlight.x = pos.x;
    highlight.y = pos.y;

    // Add to stage and store reference
    this.getGameManager().getApp().stage.addChild(highlight);
    this.selectionHighlights.set(component, highlight);
  }

  private createMotorSelectionHighlight(
    highlight: Graphics,
    _component: any
  ): void {
    // Motor is rectangular with rounded corners
    const margin = 6;
    highlight
      .roundRect(
        -25 - margin,
        -15 - margin,
        50 + margin * 2,
        30 + margin * 2,
        8
      )
      .stroke({
        width: 3,
        color: 0x00ff00, // Green selection highlight
        alpha: 0.9,
      });
  }

  private createGearSelectionHighlight(
    highlight: Graphics,
    component: any
  ): void {
    // Get gear properties for accurate sizing
    const gearProps = component.getGearProperties();
    const radius = gearProps.radius || 20;
    const margin = 6;

    // Draw circular highlight around the gear
    highlight.circle(0, 0, radius + margin).stroke({
      width: 3,
      color: 0x00ff00, // Green selection highlight
      alpha: 0.9,
    });
  }

  private createPulleySelectionHighlight(
    highlight: Graphics,
    component: any
  ): void {
    // Get pulley properties for accurate sizing
    const pulleyProps = component.mechanicalProps;
    const radius = pulleyProps.radius || 15;
    const margin = 6;

    // Draw circular highlight around the pulley
    highlight.circle(0, 0, radius + margin).stroke({
      width: 3,
      color: 0x00ff00, // Green selection highlight
      alpha: 0.9,
    });
  }

  private createForkliftSelectionHighlight(
    highlight: Graphics,
    component: any
  ): void {
    // Forklift has a rectangular base, so use rect selection highlight
    const forkliftProps = component.forkliftProps || {};
    const baseWidth = forkliftProps.baseWidth || 50;
    const baseHeight = forkliftProps.baseHeight || 40;
    const margin = 8;

    // Draw rectangular highlight around the forklift base
    highlight
      .rect(
        -baseWidth / 2 - margin,
        -baseHeight / 2 - margin,
        baseWidth + 2 * margin,
        baseHeight + 2 * margin
      )
      .stroke({
        width: 3,
        color: 0x00ff00, // Green selection highlight
        alpha: 0.9,
      });
  }

  private createBeltSelectionHighlight(
    highlight: Graphics,
    component: any
  ): void {
    try {
      // Get the belt's actual path data
      const belt = component as any; // Belt component

      // Access the belt's path calculation method
      const beltPath = this.calculateBeltPathForHighlight(belt);

      if (beltPath && beltPath.length >= 2) {
        // Draw highlight that follows the actual belt path
        this.drawBeltPathHighlight(highlight, beltPath);
      } else {
        // Fallback to simple highlight if path calculation fails
        this.drawSimpleBeltHighlight(highlight, component);
      }
    } catch (error) {
      console.warn(
        "Failed to create belt path highlight, using fallback:",
        error
      );
      this.drawSimpleBeltHighlight(highlight, component);
    }
  }

  private calculateBeltPathForHighlight(belt: any): any[] | null {
    try {
      // Use the belt's actual path calculation method instead of reimplementing
      const actualBeltPath = belt.calculateBeltPath
        ? belt.calculateBeltPath()
        : null;

      if (actualBeltPath && actualBeltPath.length >= 2) {
        // Convert PIXI Point objects to simple {x, y} objects for highlight
        return actualBeltPath.map((point: any) => ({
          x: point.x,
          y: point.y,
        }));
      }

      // Fallback: try accessing belt connections directly
      const beltConnections = belt.beltConnections;
      if (!beltConnections || beltConnections.length < 2) {
        return null;
      }

      // Simple fallback path - just connect the connection points
      const path: any[] = [];
      for (const conn of beltConnections) {
        path.push({ x: conn.position.x, y: conn.position.y });
      }

      return path;
    } catch (error) {
      console.warn("Error calculating belt path for highlight:", error);
      return null;
    }
  }

  private drawBeltPathHighlight(highlight: Graphics, beltPath: any[]): void {
    // Draw highlight that follows the belt path with a slight offset for visibility
    const highlightWidth = 6;
    const highlightColor = 0x00ff00;
    const highlightAlpha = 0.8;

    // Draw the main belt path
    for (let i = 0; i < beltPath.length; i++) {
      const point = beltPath[i];
      if (i === 0) {
        highlight.moveTo(point.x, point.y);
      } else {
        highlight.lineTo(point.x, point.y);
      }
    }

    // Close the belt loop
    if (beltPath.length > 2) {
      highlight.lineTo(beltPath[0].x, beltPath[0].y);
    }

    // Apply stroke with highlight styling
    highlight.stroke({
      width: highlightWidth,
      color: highlightColor,
      alpha: highlightAlpha,
    });
  }

  private drawSimpleBeltHighlight(highlight: Graphics, component: any): void {
    // Fallback: simple bounding box highlight
    const bounds = component.displayObject().getBounds();
    const margin = 6;

    highlight
      .rect(
        -bounds.width / 2 - margin,
        -bounds.height / 2 - margin,
        bounds.width + margin * 2,
        bounds.height + margin * 2
      )
      .stroke({
        width: 3,
        color: 0x00ff00,
        alpha: 0.8,
      });
  }

  private createDefaultSelectionHighlight(
    highlight: Graphics,
    displayObject: any
  ): void {
    // Fallback for unknown component types
    const bounds = displayObject.getBounds();
    const margin = 6;

    highlight
      .rect(
        -bounds.width / 2 - margin,
        -bounds.height / 2 - margin,
        bounds.width + margin * 2,
        bounds.height + margin * 2
      )
      .stroke({
        width: 3,
        color: 0x00ff00, // Green selection highlight
        alpha: 0.8,
      });
  }

  private removeSelectionHighlight(component: any): void {
    const highlight = this.selectionHighlights.get(component);
    if (highlight) {
      this.getGameManager().getApp().stage.removeChild(highlight);
      this.selectionHighlights.delete(component);
    }
  }

  private async handleTrashBinClick(): Promise<void> {
    if (this.selectedComponentsForDeletion.size === 0) {
      this.updateInfoBar("No components selected for deletion", "warning");
      return;
    }

    await this.showDeleteConfirmationDialog();
  }

  private handleDragToTrash(_event: DragEvent): void {
    // For now, this will be handled when we implement component dragging to trash
    // The current drag system is for toolbar items, not components
    console.log("🗑️ Drag to trash detected - feature in development");
    this.updateInfoBar(
      "Drag-to-trash feature coming soon - use selection + trash click for now",
      "info"
    );
  }

  private async showDeleteConfirmationDialog(): Promise<void> {
    const selectedCount = this.selectedComponentsForDeletion.size;
    if (selectedCount === 0) return;

    const componentNames = Array.from(this.selectedComponentsForDeletion)
      .map((comp) => comp.getName())
      .join(", ");

    const confirmed = await this.showCustomConfirmationModal(
      selectedCount === 1 ? "Delete Component" : "Delete Components",
      selectedCount === 1
        ? `Are you sure you want to delete "${componentNames}"?`
        : `Are you sure you want to delete these ${selectedCount} components?\n\n${componentNames}`,
      "Delete",
      "Cancel",
      "destructive"
    );

    if (confirmed) {
      this.deleteSelectedComponents();
    }
  }

  private showCustomConfirmationModal(
    title: string,
    message: string,
    confirmText: string = "OK",
    cancelText: string = "Cancel",
    type: "normal" | "destructive" = "normal"
  ): Promise<boolean> {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement("div");
      overlay.className = "stemplitude-modal-overlay";
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: stemplitude-modal-fade-in 0.2s ease-out;
      `;

      // Create modal container
      const modal = document.createElement("div");
      modal.className = "stemplitude-modal";
      modal.style.cssText = `
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
        max-width: 480px;
        width: 90%;
        max-height: 80vh;
        overflow: hidden;
        transform: scale(0.95);
        animation: stemplitude-modal-scale-in 0.2s ease-out forwards;
      `;

      // Create header
      const header = document.createElement("div");
      header.style.cssText = `
        padding: 24px 24px 16px 24px;
        border-bottom: 1px solid #e5e7eb;
      `;

      const titleElement = document.createElement("h2");
      titleElement.textContent = title;
      titleElement.style.cssText = `
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #1f2937;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;

      header.appendChild(titleElement);

      // Create body
      const body = document.createElement("div");
      body.style.cssText = `
        padding: 20px 24px;
        color: #4b5563;
        line-height: 1.6;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 16px;
      `;

      // Handle multi-line messages
      const messageLines = message.split("\n");
      messageLines.forEach((line, index) => {
        if (index > 0) {
          body.appendChild(document.createElement("br"));
          body.appendChild(document.createElement("br"));
        }

        if (index === messageLines.length - 1 && messageLines.length > 1) {
          // Last line (component names) - make it more prominent
          const componentList = document.createElement("div");
          componentList.textContent = line;
          componentList.style.cssText = `
            background: #f3f4f6;
            padding: 12px 16px;
            border-radius: 8px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 14px;
            color: #374151;
            border-left: 3px solid #6b7280;
            margin-top: 8px;
          `;
          body.appendChild(componentList);
        } else {
          body.appendChild(document.createTextNode(line));
        }
      });

      // Create footer
      const footer = document.createElement("div");
      footer.style.cssText = `
        padding: 16px 24px 24px 24px;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        border-top: 1px solid #e5e7eb;
      `;

      // Create buttons
      const cancelButton = document.createElement("button");
      cancelButton.textContent = cancelText;
      cancelButton.style.cssText = `
        padding: 10px 20px;
        border: 1px solid #d1d5db;
        background: #ffffff;
        color: #374151;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: all 0.15s ease;
        min-width: 80px;
      `;

      const confirmButton = document.createElement("button");
      confirmButton.textContent = confirmText;

      if (type === "destructive") {
        confirmButton.style.cssText = `
          padding: 10px 20px;
          border: none;
          background: #dc2626;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          transition: all 0.15s ease;
          min-width: 80px;
        `;
      } else {
        confirmButton.style.cssText = `
          padding: 10px 20px;
          border: none;
          background: #3b82f6;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          transition: all 0.15s ease;
          min-width: 80px;
        `;
      }

      // Add hover effects
      cancelButton.addEventListener("mouseenter", () => {
        cancelButton.style.background = "#f9fafb";
        cancelButton.style.borderColor = "#9ca3af";
      });
      cancelButton.addEventListener("mouseleave", () => {
        cancelButton.style.background = "#ffffff";
        cancelButton.style.borderColor = "#d1d5db";
      });

      confirmButton.addEventListener("mouseenter", () => {
        if (type === "destructive") {
          confirmButton.style.background = "#b91c1c";
        } else {
          confirmButton.style.background = "#2563eb";
        }
      });
      confirmButton.addEventListener("mouseleave", () => {
        if (type === "destructive") {
          confirmButton.style.background = "#dc2626";
        } else {
          confirmButton.style.background = "#3b82f6";
        }
      });

      // Add event listeners
      const closeModal = (result: boolean) => {
        overlay.style.animation = "stemplitude-modal-fade-out 0.15s ease-in forwards";
        modal.style.animation = "stemplitude-modal-scale-out 0.15s ease-in forwards";

        setTimeout(() => {
          document.body.removeChild(overlay);
          resolve(result);
        }, 150);
      };

      cancelButton.addEventListener("click", () => closeModal(false));
      confirmButton.addEventListener("click", () => closeModal(true));

      // Close on overlay click
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          closeModal(false);
        }
      });

      // Close on Escape key
      const escapeHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeModal(false);
          document.removeEventListener("keydown", escapeHandler);
        }
      };
      document.addEventListener("keydown", escapeHandler);

      // Assemble modal
      footer.appendChild(cancelButton);
      footer.appendChild(confirmButton);
      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      overlay.appendChild(modal);

      // Add CSS animations if not already added
      if (!document.querySelector("#stemplitude-modal-styles")) {
        const style = document.createElement("style");
        style.id = "stemplitude-modal-styles";
        style.textContent = `
          @keyframes stemplitude-modal-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes stemplitude-modal-fade-out {
            from { opacity: 1; }
            to { opacity: 0; }
          }
          @keyframes stemplitude-modal-scale-in {
            from { 
              transform: scale(0.95); 
              opacity: 0; 
            }
            to { 
              transform: scale(1); 
              opacity: 1; 
            }
          }
          @keyframes stemplitude-modal-scale-out {
            from { 
              transform: scale(1); 
              opacity: 1; 
            }
            to { 
              transform: scale(0.95); 
              opacity: 0; 
            }
          }
        `;
        document.head.appendChild(style);
      }

      // Add to DOM
      document.body.appendChild(overlay);

      // Focus the confirm button by default
      setTimeout(() => {
        confirmButton.focus();
      }, 100);
    });
  }

  private deleteSelectedComponents(): void {
    const deletedComponents: any[] = [];
    const deletedBelts: any[] = [];

    // Delete each selected component
    this.selectedComponentsForDeletion.forEach((component) => {
      try {
        const componentName = component.getName();
        const componentType = component.getComponentType();

        // Handle belt deletion - disconnect mechanical connections
        if (componentType === "belt") {
          console.log(
            `🗑️ Deleting belt: ${componentName} - disconnecting all connections`
          );
          this.disconnectBeltConnections(component);
        }

        // Find and delete all connected elements (cascade deletion for non-belts)
        if (componentType !== "belt") {
          const connectedBelts = this.findConnectedBelts(componentName);

          // Delete connected belts
          connectedBelts.forEach((beltName) => {
            try {
              const belt = this.getMechanicalComponent(beltName);
              if (belt) {
                this.disconnectBeltConnections(belt);
              }
              this.removeGameObject(beltName);
              deletedBelts.push(beltName);
              console.log(`🗑️ Cascade deleted belt: ${beltName}`);
            } catch (error) {
              console.error(
                `Failed to delete connected belt ${beltName}:`,
                error
              );
            }
          });

          // Disconnect any direct gear mesh connections
          this.disconnectGearMeshes(component);
        }

        // Remove the component itself
        this.removeGameObject(componentName);
        deletedComponents.push(componentName);
        console.log(`🗑️ Deleted component: ${componentName}`);
      } catch (error) {
        console.error(
          `Failed to delete component ${component.getName()}:`,
          error
        );
      }
    });

    // Clear selection
    this.clearComponentSelection();

    // Update info bar with detailed deletion info
    const deletedCount = deletedComponents.length;
    const beltCount = deletedBelts.length;
    let message = `Deleted ${deletedCount} component${deletedCount === 1 ? "" : "s"}: ${deletedComponents.join(", ")}`;
    if (beltCount > 0) {
      message += ` (+ ${beltCount} connected belt${beltCount === 1 ? "" : "s"})`;
    }

    this.updateInfoBar(message, "success");
  }

  private disconnectBeltConnections(belt: any): void {
    try {
      // Get the components this belt was connecting
      const beltConnections = belt.beltConnections || [];

      // Disconnect the belt from each connected component
      // The structure is: comp1 -> belt -> comp2, not comp1 -> comp2
      const connectedComponents: any[] = [];

      beltConnections.forEach((beltConn: any) => {
        const component = beltConn.component;
        if (component) {
          connectedComponents.push(component);

          // Disconnect component from belt
          component.disconnectFrom(belt);
          // Disconnect belt from component
          belt.disconnectFrom(component);
          console.log(
            `🔗 Disconnected belt from component: ${component.getName()} <-> ${belt.getName()}`
          );

          // Also use ConnectionSystem if available
          try {
            const connectionSystem =
              this.getGameManager().getConnectionSystem();
            connectionSystem.disconnect(component, belt);
          } catch (error) {
            console.warn("ConnectionSystem disconnect failed:", error);
          }
        }
      });

      // Clear the belt's internal connections
      if (belt.beltConnections) {
        console.log(
          `🔗 Clearing ${belt.beltConnections.length} internal belt connections`
        );
        belt.beltConnections.length = 0;
      }

      // Check if any connected components should reset to idle state
      connectedComponents.forEach((component) => {
        const componentName = component.getName();
        const componentType = component.getComponentType();

        console.log(
          `🔧 Checking ${componentName} (${componentType}) for remaining connections...`
        );

        if (componentType !== "motor") {
          // Check if component still has other connections (belts OR gear meshes)
          const remainingBeltConnections = this.getConnectedBelts(component);
          const remainingMeshConnections =
            this.getConnectedGearMeshes(component);
          const totalConnections =
            remainingBeltConnections.length + remainingMeshConnections.length;

          console.log(
            `🔧 ${componentName} has ${remainingBeltConnections.length} belt connections and ${remainingMeshConnections.length} mesh connections (total: ${totalConnections})`
          );

          if (totalConnections === 0) {
            // No more connections - reset to idle
            const currentState = component.getMechanicalState();
            console.log(
              `🔧 ${componentName} before reset: ${PhysicsSystem.omegaToRPM(currentState.omega).toFixed(1)} RPM`
            );

            component.resetToIdleState();

            // Force an immediate visual update to reflect the stopped state
            component.updateVisuals(0);

            const newState = component.getMechanicalState();
            console.log(
              `🔧 ${componentName} after reset: ${PhysicsSystem.omegaToRPM(newState.omega).toFixed(1)} RPM`
            );
            console.log(
              `🔧 Reset ${componentName} to idle state - no remaining connections`
            );
          } else {
            console.log(
              `🔧 ${componentName} still has ${totalConnections} connections - keeping active`
            );
          }
        } else {
          console.log(`🔧 ${componentName} is a motor - not resetting`);
        }
      });

      // Verify connections are cleared
      const remainingConnections = belt.connections ? belt.connections.size : 0;
      console.log(
        `🔗 Belt ${belt.getName()} has ${remainingConnections} remaining connections after cleanup`
      );
    } catch (error) {
      console.error("Failed to disconnect belt connections:", error);
    }
  }

  private disconnectGearMeshes(component: any): void {
    try {
      // Get all connections from this component
      const connections = component.connections || new Map();

      connections.forEach((connection: any) => {
        if (connection.type === "gear_mesh") {
          const otherComponent = connection.component;
          if (otherComponent) {
            component.disconnectFrom(otherComponent);
            console.log(
              `⚙️ Disconnected gear mesh: ${component.getName()} <-> ${otherComponent.getName()}`
            );
          }
        }
      });
    } catch (error) {
      console.error("Failed to disconnect gear meshes:", error);
    }
  }

  private findConnectedBelts(componentName: string): string[] {
    const connectedBelts: string[] = [];

    // Get all mechanical components to find belts
    const allComponents = this.getSceneManager().getAllMechanicalComponents();

    for (const [name, component] of allComponents) {
      // Check if this is a belt component
      if (component.getComponentType() === "belt") {
        // Belt names follow pattern: belt_comp1_comp2
        if (
          name.includes(`_${componentName}_`) ||
          name.includes(`_${componentName}`)
        ) {
          connectedBelts.push(name);
        }
      }
    }

    return connectedBelts;
  }

  private checkDropOnTrash(event: any, component: any): boolean {
    if (!event) return false;

    // Get mouse position from the event
    let clientX: number, clientY: number;

    if (event.clientX !== undefined) {
      // DOM event
      clientX = event.clientX;
      clientY = event.clientY;
    } else if (event.global) {
      // PIXI event - convert to screen coordinates
      const app = this.getGameManager().getApp();
      const rect = app.canvas.getBoundingClientRect();
      clientX = event.global.x + rect.left;
      clientY = event.global.y + rect.top;
    } else {
      return false;
    }

    // Get trash bin element and its bounds
    const trashBin = document.getElementById("trash-bin");
    if (!trashBin) return false;

    const trashRect = trashBin.getBoundingClientRect();

    // Check if drop position is over trash bin (with some margin for easier targeting)
    const margin = 20;
    const isOverTrash =
      clientX >= trashRect.left - margin &&
      clientX <= trashRect.right + margin &&
      clientY >= trashRect.top - margin &&
      clientY <= trashRect.bottom + margin;

    if (isOverTrash) {
      console.log(`🗑️ Component ${component.getName()} dropped on trash bin`);
      void this.handleDragToTrashDrop(component);
      return true;
    }

    return false;
  }

  private async handleDragToTrashDrop(component: any): Promise<void> {
    // Clear any existing selections and select this component
    this.clearComponentSelection();
    this.selectComponent(component, false);

    // Show confirmation dialog and delete
    await this.showDeleteConfirmationDialog();
  }

  private updateTrashBinDragFeedback(event: any): void {
    if (!event) return;

    // Get mouse position from the event
    let clientX: number, clientY: number;

    if (event.clientX !== undefined) {
      // DOM event
      clientX = event.clientX;
      clientY = event.clientY;
    } else if (event.global) {
      // PIXI event - convert to screen coordinates
      const app = this.getGameManager().getApp();
      const rect = app.canvas.getBoundingClientRect();
      clientX = event.global.x + rect.left;
      clientY = event.global.y + rect.top;
    } else {
      return;
    }

    // Get trash bin element
    const trashBin = document.getElementById("trash-bin");
    if (!trashBin) return;

    const trashRect = trashBin.getBoundingClientRect();

    // Check if drag position is over trash bin (with margin)
    const margin = 20;
    const isOverTrash =
      clientX >= trashRect.left - margin &&
      clientX <= trashRect.right + margin &&
      clientY >= trashRect.top - margin &&
      clientY <= trashRect.bottom + margin;

    if (isOverTrash) {
      // Show "drop to delete" feedback
      trashBin.style.transform = "scale(1.3)";
      trashBin.style.background = "linear-gradient(135deg, #ff4757, #ff3742)";
      trashBin.style.boxShadow = "0 8px 25px rgba(255, 71, 87, 0.6)";
    } else {
      // Restore normal appearance
      this.clearTrashBinDragFeedback();
    }
  }

  private clearTrashBinDragFeedback(): void {
    const trashBin = document.getElementById("trash-bin");
    if (trashBin) {
      trashBin.style.transform = "scale(1.0)";
      trashBin.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)";
      trashBin.style.boxShadow = "0 4px 15px rgba(0,0,0,0.3)";
    }
  }

  private handleDrop(
    assetId: string,
    position: { x: number; y: number }
  ): void {
    const asset = this.findAssetById(assetId);
    if (!asset) return;

    // Handle drop of drag & drop component at specified world coordinates
    // Note: Belt and chain tools are no longer drag & drop - they're click-to-activate

    // Only handle drag & drop components (motor, gear, pulley)
    if (this.dragDropComponents.some((comp) => comp.id === asset.id)) {
      // Show configuration modal for physical components
      this.showConfigModal(asset, position);
    } else {
      // Tools (belt, chain) should not reach here since they're not draggable
      console.warn(`Attempted to drop non-draggable tool: ${asset.name}`);
      this.updateInfoBar(
        `${asset.name} is not draggable - click to activate`,
        "warning"
      );
    }
  }

  // startBeltCreation method removed - belt is now click-to-activate
  // showBeltConfigModal method removed - replaced with dropdown selection

  // This section intentionally left empty - legacy methods removed

  private highlightCompatibleComponents(): void {
    const components = this.getSceneManager().getAllMechanicalComponents();
    components.forEach((component) => {
      if (this.BELT_COMPATIBLE_TYPES.includes(component.getComponentType())) {
        const displayObject = component.displayObject();
        if (displayObject) {
          // Add blue tint for PIXI objects
          displayObject.tint = 0x3498db;
          displayObject.alpha = 0.8;
          displayObject.interactive = true;
          displayObject.cursor = "pointer";
        }
      }
    });
  }

  private clearHighlights(): void {
    const components = this.getSceneManager().getAllMechanicalComponents();
    components.forEach((component) => {
      const displayObject = component.displayObject();
      if (displayObject) {
        displayObject.tint = 0xffffff; // Reset to white
        displayObject.alpha = 1.0;
        displayObject.interactive = true;
        displayObject.cursor = "move";
      }
    });
  }

  private handleComponentClick(component: any, event: MouseEvent): void {
    event.stopPropagation();

    if (this.beltCreationMode) {
      this.handleBeltComponentSelection(component);
    } else {
      // Normal component selection
      const isCtrlPressed = event.ctrlKey || event.metaKey; // Support both Ctrl and Cmd

      if (this.selectedComponentsForDeletion.has(component)) {
        // Component is already selected - deselect it
        this.deselectComponent(component);
      } else {
        // Component is not selected - select it
        this.selectComponent(component, isCtrlPressed);
      }
    }
  }

  private handleBeltComponentSelection(component: any): void {
    // Check basic component type compatibility
    if (!this.BELT_COMPATIBLE_TYPES.includes(component.getComponentType())) {
      this.updateInfoBar(
        `${component.getComponentType()} is not compatible with belt connections`,
        "error"
      );
      return;
    }

    // Additional check for gear components - reject gear-only types
    if (component.getComponentType() === "gear") {
      const gearProps = component.getMechanicalProperties();
      const gearType = gearProps.gearType;

      if (gearType === "gear-only") {
        this.updateInfoBar(
          `${component.getName()} is configured as 'Gear Only' and cannot accept belt connections. Change to 'Hybrid' or another belt-compatible type.`,
          "error"
        );
        return;
      }
    }

    // Check if already selected
    if (this.selectedComponents.includes(component)) {
      this.updateInfoBar(
        `Component ${component.getName()} already selected`,
        "warning"
      );
      return;
    }

    this.selectedComponents.push(component);

    // Highlight selected component differently
    const displayObject = component.displayObject();
    if (displayObject) {
      displayObject.tint = 0x27ae60; // Green tint for selected
      displayObject.alpha = 0.9;
    }

    if (this.selectedComponents.length === 1) {
      this.updateInfoBar(
        `Selected ${component.getName()}. Click on another component to connect with belt.`,
        "info"
      );
    } else if (this.selectedComponents.length === 2) {
      console.log(
        "🔧 Two components selected - checking proximity and creating belt"
      );
      this.createBeltBetweenComponents();
    }
  }

  private createBeltBetweenComponents(): void {
    const comp1 = this.selectedComponents[0];
    const comp2 = this.selectedComponents[1];

    console.log(
      `🔧 Creating belt between: ${comp1.getName()} and ${comp2.getName()}`
    );
    console.log(
      `🔧 Component types: ${comp1.getComponentType()} -> ${comp2.getComponentType()}`
    );
    console.log(`🔧 Belt config:`, this.beltCreationConfig);

    // Check distance
    const pos1 = comp1.getPosition();
    const pos2 = comp2.getPosition();
    const distance = Math.sqrt(
      Math.pow(pos2.x - pos1.x, 2) + Math.pow(pos2.y - pos1.y, 2)
    );

    console.log(
      `🔧 Distance between components: ${distance.toFixed(0)}px (max: ${this.MAX_BELT_DISTANCE}px)`
    );
    console.log(
      `🔧 Component positions: ${comp1.getName()} at (${pos1.x}, ${pos1.y}), ${comp2.getName()} at (${pos2.x}, ${pos2.y})`
    );

    if (distance > this.MAX_BELT_DISTANCE) {
      this.updateInfoBar(
        `Components too far apart (${distance.toFixed(0)}px > ${this.MAX_BELT_DISTANCE}px max)`,
        "error"
      );
      this.finishBeltCreation();
      return;
    }

    // Check connection points
    const comp1ConnectionPoints = comp1.getConnectionPoints
      ? comp1.getConnectionPoints()
      : [];
    const comp2ConnectionPoints = comp2.getConnectionPoints
      ? comp2.getConnectionPoints()
      : [];
    console.log(
      `🔧 ${comp1.getName()} connection points:`,
      comp1ConnectionPoints
    );
    console.log(
      `🔧 ${comp2.getName()} connection points:`,
      comp2ConnectionPoints
    );

    // Create belt connection
    console.log("🔧 Creating belt connection...");
    const success = this.createBeltConnection(
      comp1.getName(),
      comp2.getName(),
      this.beltCreationConfig,
      {
        crossed: this.beltCreationConfig.crossed,
      }
    );

    console.log(`🔧 Belt creation result: ${success}`);

    if (success) {
      // Add interaction handlers to the newly created belt
      const beltName = `belt_${comp1.getName()}_${comp2.getName()}`;
      const belt = this.getMechanicalComponent(beltName);
      if (belt) {
        setTimeout(() => {
          this.addComponentInteractionHandlers(belt);
          console.log(`🔧 Added interaction handlers to belt: ${beltName}`);
        }, 100);
      }

      this.updateInfoBar(
        `Belt created between ${comp1.getName()} and ${comp2.getName()}`,
        "success"
      );
    } else {
      this.updateInfoBar("Failed to create belt connection", "error");
    }

    this.finishBeltCreation();
  }

  private finishBeltCreation(): void {
    console.log("🔧 Finishing belt creation...");

    // Clear highlights before deactivating
    this.clearHighlights();

    // Keep belt tool active for continuous use - don't deactivate automatically
    this.selectedComponents = [];

    // Keep the belt configuration and mode active for next belt creation
    console.log(
      "🔧 Belt creation reset - tool remains active for next connection"
    );
    this.updateInfoBar(
      "Belt ready - Click 2 more components to create another belt",
      "info"
    );

    // Re-highlight compatible components for next belt
    setTimeout(() => {
      if (this.beltCreationMode) {
        this.highlightCompatibleComponents();
      }
    }, 100);
  }

  private showConfigModal(
    asset: AssetItem,
    position: { x: number; y: number }
  ): void {
    const modalContent = document.createElement("div");
    modalContent.style.cssText = `
      background: #2c3e50;
      border-radius: 12px;
      padding: 30px;
      max-width: 400px;
      width: 90%;
      border: 2px solid #3498db;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    `;

    modalContent.innerHTML = `
      <h3 style="color: #ecf0f1; margin: 0 0 20px 0; text-align: center;">
        Configure ${asset.name}
      </h3>
    `;

    // Create configuration based on component type
    const configSection = this.createConfigSection(asset);
    modalContent.appendChild(configSection);

    // Buttons
    const buttonContainer = document.createElement("div");
    buttonContainer.style.cssText = `
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-top: 20px;
    `;

    const createBtn = this.createButton("Create", "#27ae60", () => {
      const config = this.getConfigFromModal(asset, position);
      this.createComponentFromConfig(config);
      this.hideConfigModal();
    });

    const cancelBtn = this.createButton("Cancel", "#e74c3c", () => {
      this.hideConfigModal();
    });

    buttonContainer.appendChild(createBtn);
    buttonContainer.appendChild(cancelBtn);
    modalContent.appendChild(buttonContainer);

    this.configModal.innerHTML = "";
    this.configModal.appendChild(modalContent);
    this.configModal.style.display = "flex";
  }

  private createConfigSection(asset: AssetItem): HTMLElement {
    const section = document.createElement("div");

    switch (asset.type) {
      case "gear":
        section.innerHTML = `
          <div style="margin-bottom: 15px;">
            <label style="color: #ecf0f1; display: block; margin-bottom: 5px;">Component Name:</label>
            <input type="text" id="gear-name" value="${this.generateComponentName("gear")}" placeholder="Enter gear name (e.g. main_gear)" style="width: 100%; padding: 8px; border: 1px solid #34495e; border-radius: 4px; background: #34495e; color: #ecf0f1; margin-bottom: 5px; box-sizing: border-box;">
            <div style="font-size: 11px; color: #95a5a6; margin-bottom: 10px;">Leave blank for auto-generated name (gear_1, gear_2, etc.)</div>
          </div>

          <div style="margin-bottom: 15px;">
            <label style="color: #ecf0f1; display: block; margin-bottom: 5px;">Gear Type:</label>
            <select id="gear-type" style="width: 100%; padding: 8px; border: 1px solid #34495e; border-radius: 4px; background: #34495e; color: #ecf0f1; margin-bottom: 10px;">
              <option value="gear-only">⚙️ Gear Only - Pure gear meshing</option>
              <option value="hybrid" selected>🔧 Hybrid - Gear mesh + belt compatible</option>
              <option value="timing-gear">⏱️ Timing Gear - 1:1 belt/gear ratios</option>
              <option value="belt-pulley">🔄 Belt Pulley - Belt only, toothed</option>
            </select>
            <div style="font-size: 11px; color: #bdc3c7; margin-top: 5px;" id="gear-type-description">
              Most versatile - Can connect to other gears or belts
            </div>
          </div>
          
          <div style="margin-bottom: 15px;">
            <label style="color: #ecf0f1; display: block; margin-bottom: 5px;">Size Configuration:</label>
            <select id="gear-config-type" style="width: 100%; padding: 8px; border: 1px solid #34495e; border-radius: 4px; background: #34495e; color: #ecf0f1; margin-bottom: 10px;">
              <option value="teeth" selected>Configure by Teeth Count</option>
              <option value="radius">Configure by Size (1:1 matching)</option>
            </select>
          </div>
          
          <div id="gear-teeth-config" style="margin-bottom: 15px;">
            <label style="color: #ecf0f1; display: block; margin-bottom: 5px;">Teeth Count:</label>
            <select id="gear-teeth" style="width: 100%; padding: 8px; border: 1px solid #34495e; border-radius: 4px; background: #34495e; color: #ecf0f1;">
              <option value="12">12 teeth (Small - ⌀16px)</option>
              <option value="20">20 teeth (Medium - ⌀25px)</option>
              <option value="30" selected>30 teeth (Large - ⌀35px)</option>
              <option value="40">40 teeth (X-Large - ⌀45px)</option>
              <option value="60">60 teeth (XX-Large - ⌀60px)</option>
            </select>
            <div style="font-size: 11px; color: #3498db; margin-top: 5px;">
              ⚙️ Gear ratio = teeth₁/teeth₂ (e.g. 30→12 = 2.5x speed, 0.4x torque)
            </div>
          </div>
          
          <div id="gear-radius-config" style="margin-bottom: 15px; display: none;">
            <label style="color: #ecf0f1; display: block; margin-bottom: 5px;">Belt Connection Size:</label>
            <select id="gear-belt-radius" style="width: 100%; padding: 8px; border: 1px solid #34495e; border-radius: 4px; background: #34495e; color: #ecf0f1;">
              <option value="12">Small (12px) - Match small motors/pulleys</option>
              <option value="16">Medium-Small (16px)</option>
              <option value="20" selected>Medium (20px) - Standard size</option>
              <option value="24">Medium-Large (24px)</option>
              <option value="30">Large (30px) - Match large components</option>
            </select>
            <div style="font-size: 11px; color: #27ae60; margin-top: 5px;">
              💡 Match motor/pulley size for 1:1 speed ratio
            </div>
          </div>
          
          <div style="margin-bottom: 15px;">
            <label style="color: #ecf0f1; display: block; margin-bottom: 5px;">Material & Efficiency:</label>
            <select id="gear-material" style="width: 100%; padding: 8px; border: 1px solid #34495e; border-radius: 4px; background: #34495e; color: #ecf0f1;">
              <option value="steel" selected>🔩 Steel - 98% efficiency, high strength</option>
              <option value="brass">🥉 Brass - 95% efficiency, corrosion resistant</option>
              <option value="aluminum">⚪ Aluminum - 96% efficiency, lightweight</option>
              <option value="plastic">🧩 Plastic - 90% efficiency, quiet operation</option>
              <option value="carbon">🖤 Carbon Fiber - 97% efficiency, ultra-light</option>
            </select>
          </div>
        `;
        break;

      case "belt":
        section.innerHTML = `
          <div style="margin-bottom: 15px;">
            <label style="color: #ecf0f1; display: block; margin-bottom: 5px;">Belt Type:</label>
            <select id="belt-type" style="width: 100%; padding: 8px; border: 1px solid #34495e; border-radius: 4px; background: #34495e; color: #ecf0f1;">
              <option value="normal" selected>Normal Belt (Same Direction)</option>
              <option value="crossed">Crossed Belt (Reverse Direction)</option>
            </select>
          </div>
          <div style="margin-bottom: 15px;">
            <label style="color: #ecf0f1; display: block; margin-bottom: 5px;">Belt Width:</label>
            <input type="range" id="belt-width" min="2" max="8" value="3" style="width: 100%;">
            <span style="color: #bdc3c7; font-size: 12px;">Width: <span id="belt-width-value">3</span>px</span>
          </div>
        `;
        break;

      case "motor":
        section.innerHTML = `
          <div style="margin-bottom: 15px;">
            <label style="color: #ecf0f1; display: block; margin-bottom: 5px;">Component Name:</label>
            <input type="text" id="motor-name" value="${this.generateComponentName("motor")}" placeholder="Enter motor name (e.g. drive_motor)" style="width: 100%; padding: 8px; border: 1px solid #34495e; border-radius: 4px; background: #34495e; color: #ecf0f1; margin-bottom: 5px; box-sizing: border-box;">
            <div style="font-size: 11px; color: #95a5a6; margin-bottom: 10px;">Leave blank for auto-generated name (motor_1, motor_2, etc.)</div>
          </div>

          <div style="margin-bottom: 15px;">
            <label style="color: #ecf0f1; display: block; margin-bottom: 5px;">Max RPM:</label>
            <input type="range" id="motor-rpm" min="300" max="1800" value="1200" step="100" style="width: 100%;">
            <span style="color: #bdc3c7; font-size: 12px;">RPM: <span id="motor-rpm-value">1200</span></span>
          </div>
          <div style="margin-bottom: 15px;">
            <label style="color: #ecf0f1; display: block; margin-bottom: 5px;">Torque (Nm):</label>
            <input type="range" id="motor-torque" min="10" max="100" value="50" step="5" style="width: 100%;">
            <span style="color: #bdc3c7; font-size: 12px;">Torque: <span id="motor-torque-value">50</span>Nm</span>
          </div>
          <div style="margin-bottom: 15px;">
            <label style="color: #ecf0f1; display: block; margin-bottom: 5px;">Pulley Size (for 1:1 ratio matching):</label>
            <select id="motor-pulley-size" style="width: 100%; padding: 8px; border: 1px solid #34495e; border-radius: 4px; background: #34495e; color: #ecf0f1;">
              <option value="12">Small (12px) - Match small gears/pulleys</option>
              <option value="16">Medium-Small (16px) - Match 16px components</option>
              <option value="20" selected>Medium (20px) - Match standard components</option>
              <option value="24">Medium-Large (24px) - Match 24px components</option>
              <option value="30">Large (30px) - Match large gears/pulleys</option>
            </select>
            <span style="color: #27ae60; font-size: 11px;">💡 Match this size with your target component for 1:1 speed/torque ratio</span>
          </div>
        `;
        break;

      case "pulley":
        section.innerHTML = `
          <div style="margin-bottom: 15px;">
            <label style="color: #ecf0f1; display: block; margin-bottom: 5px;">Component Name:</label>
            <input type="text" id="pulley-name" value="${this.generateComponentName("pulley")}" placeholder="Enter pulley name (e.g. drive_pulley)" style="width: 100%; padding: 8px; border: 1px solid #34495e; border-radius: 4px; background: #34495e; color: #ecf0f1; margin-bottom: 5px; box-sizing: border-box;">
            <div style="font-size: 11px; color: #95a5a6; margin-bottom: 10px;">Leave blank for auto-generated name (pulley_1, pulley_2, etc.)</div>
          </div>

          <div style="margin-bottom: 15px;">
            <label style="color: #ecf0f1; display: block; margin-bottom: 5px;">Pulley Size (for 1:1 ratio matching):</label>
            <select id="pulley-size" style="width: 100%; padding: 8px; border: 1px solid #34495e; border-radius: 4px; background: #34495e; color: #ecf0f1;">
              <option value="12">Small (12px) - Match small motors/gears</option>
              <option value="16">Medium-Small (16px) - Match 16px motors</option>
              <option value="20" selected>Medium (20px) - Match standard motors</option>
              <option value="24">Medium-Large (24px) - Match 24px motors</option>
              <option value="30">Large (30px) - Match large motors/gears</option>
            </select>
            <span style="color: #27ae60; font-size: 11px;">💡 Match this size with your motor for 1:1 speed/torque ratio</span>
          </div>
        `;
        break;

      default:
        section.innerHTML = `<p style="color: #ecf0f1;">Configuration options for ${asset.name} will be added soon.</p>`;
    }

    // Add live updates for range inputs
    section.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.type === "range") {
        const valueSpan = document.getElementById(target.id + "-value");
        if (valueSpan) {
          valueSpan.textContent = target.value;
        }
      }
    });

    // Setup interactive elements based on asset type
    if (asset.type === "gear") {
      // Setup gear configuration type toggle
      setTimeout(() => {
        const gearTypeSelect = section.querySelector(
          "#gear-type"
        ) as HTMLSelectElement;
        const configTypeSelect = section.querySelector(
          "#gear-config-type"
        ) as HTMLSelectElement;
        const teethConfig = section.querySelector("#gear-teeth-config");
        const radiusConfig = section.querySelector("#gear-radius-config");
        const gearTypeDescription = section.querySelector(
          "#gear-type-description"
        ) as HTMLElement;

        // Gear type descriptions
        const gearTypeDescriptions = {
          "gear-only":
            "Only connects to other gears via meshing - no belt capability",
          hybrid: "Most versatile - Can connect to other gears or belts",
          "timing-gear":
            "Precision timing - 1:1 belt/gear ratios for synchronization",
          "belt-pulley": "Belt-only operation with toothed surface for grip",
        };

        // Update description when gear type changes
        gearTypeSelect?.addEventListener("change", () => {
          if (gearTypeDescription) {
            gearTypeDescription.textContent =
              gearTypeDescriptions[
                gearTypeSelect.value as keyof typeof gearTypeDescriptions
              ] || "";
          }
        });

        // Size configuration toggle
        configTypeSelect?.addEventListener("change", () => {
          if (configTypeSelect.value === "teeth") {
            if (teethConfig)
              (teethConfig as HTMLElement).style.display = "block";
            if (radiusConfig)
              (radiusConfig as HTMLElement).style.display = "none";
          } else {
            if (teethConfig)
              (teethConfig as HTMLElement).style.display = "none";
            if (radiusConfig)
              (radiusConfig as HTMLElement).style.display = "block";
          }
        });
      }, 0);
    }

    // Add script to highlight name inputs when modal opens
    setTimeout(() => {
      const nameInput = section.querySelector(
        "#gear-name, #motor-name, #pulley-name"
      ) as HTMLInputElement;
      if (nameInput) {
        nameInput.focus();
        nameInput.select();
        console.log(`🏷️ Auto-selected default name: ${nameInput.value}`);
      }
    }, 100);

    return section;
  }

  private createButton(
    text: string,
    color: string,
    onClick: () => void
  ): HTMLElement {
    const button = document.createElement("button");
    button.textContent = text;
    button.style.cssText = `
      padding: 10px 20px;
      background: ${color};
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      transition: all 0.2s ease;
    `;

    button.addEventListener("mouseenter", () => {
      button.style.transform = "translateY(-2px)";
      button.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    });

    button.addEventListener("mouseleave", () => {
      button.style.transform = "translateY(0)";
      button.style.boxShadow = "none";
    });

    button.addEventListener("click", onClick);
    return button;
  }

  private getConfigFromModal(
    asset: AssetItem,
    position: { x: number; y: number }
  ): ComponentConfig {
    const config: ComponentConfig = {
      type: asset.type,
      position,
      properties: {},
    };

    switch (asset.type) {
      case "gear": {
        const gearNameInput = document.getElementById(
          "gear-name"
        ) as HTMLInputElement;
        const gearTypeSelect = document.getElementById(
          "gear-type"
        ) as HTMLSelectElement;
        const configTypeSelect = document.getElementById(
          "gear-config-type"
        ) as HTMLSelectElement;
        const materialSelect = document.getElementById(
          "gear-material"
        ) as HTMLSelectElement;

        // Get custom name or generate default name
        const customName = gearNameInput?.value.trim() || "";
        const componentName = customName || this.generateComponentName("gear");

        let teeth: number;
        let gearRadius: number;
        let beltRadius: number;
        const gearType = gearTypeSelect?.value || "hybrid";

        if (configTypeSelect?.value === "radius") {
          // 1:1 ratio matching configuration
          const beltRadiusSelect = document.getElementById(
            "gear-belt-radius"
          ) as HTMLSelectElement;
          beltRadius = parseInt(beltRadiusSelect.value);
          gearRadius = beltRadius * 1.25; // Slightly larger visual radius
          teeth = Math.round(beltRadius * 1.5); // Approximate teeth for display
        } else {
          // Traditional teeth-based configuration
          const teethSelect = document.getElementById(
            "gear-teeth"
          ) as HTMLSelectElement;
          teeth = parseInt(teethSelect.value);
          gearRadius = Math.max(10, teeth * 0.8); // Scale radius with teeth
          beltRadius = gearType === "gear-only" ? 0 : gearRadius * 0.8; // No belt radius for gear-only
        }

        // Adjust properties based on gear type
        if (gearType === "timing-gear") {
          beltRadius = gearRadius; // 1:1 ratio for timing gears
        } else if (gearType === "belt-pulley") {
          teeth = 0; // Belt pulleys don't mesh with gears
        }

        // Enhanced material properties
        const materialProperties = {
          steel: { friction: 0.08, efficiency: 0.98, density: 1.0 },
          brass: { friction: 0.1, efficiency: 0.95, density: 0.85 },
          aluminum: { friction: 0.09, efficiency: 0.96, density: 0.35 },
          plastic: { friction: 0.15, efficiency: 0.9, density: 0.15 },
          carbon: { friction: 0.07, efficiency: 0.97, density: 0.2 },
        };

        const material =
          materialProperties[
            materialSelect.value as keyof typeof materialProperties
          ] || materialProperties.steel;

        config.properties = {
          name: componentName, // Custom or auto-generated name
          gearType, // New: track the gear type
          teeth,
          radius: gearRadius,
          beltRadius: beltRadius,
          mass: gearRadius * 0.1 * material.density,
          inertia: gearRadius * 0.05 * material.density,
          friction: material.friction,
          efficiency: material.efficiency,
          material: materialSelect.value,
          configuredFor1to1: configTypeSelect?.value === "radius",
          // Visual properties for different gear types
          hasTeeth: gearType !== "belt-pulley",
          hasBeltGroove: gearType !== "gear-only",
          isTimingGear: gearType === "timing-gear",
        };
        break;
      }

      case "motor": {
        const motorNameInput = document.getElementById(
          "motor-name"
        ) as HTMLInputElement;
        const rpmInput = document.getElementById(
          "motor-rpm"
        ) as HTMLInputElement;
        const torqueInput = document.getElementById(
          "motor-torque"
        ) as HTMLInputElement;
        const pulleySizeSelect = document.getElementById(
          "motor-pulley-size"
        ) as HTMLSelectElement;

        // Get custom name or generate default name
        const customName = motorNameInput?.value.trim() || "";
        const componentName = customName || this.generateComponentName("motor");
        const selectedRadius = parseInt(pulleySizeSelect.value);

        config.properties = {
          name: componentName, // Custom or auto-generated name
          radius: selectedRadius, // Use selected pulley size for belt connections
          mass: 5,
          inertia: 2,
          friction: 0.1,
          efficiency: 0.95,
          maxRPM: parseInt(rpmInput.value),
          nominalTorque: parseInt(torqueInput.value),
          pulleyRadius: selectedRadius, // Keep consistent with radius
        };
        break;
      }

      case "pulley": {
        const pulleyNameInput = document.getElementById(
          "pulley-name"
        ) as HTMLInputElement;
        const sizeSelect = document.getElementById(
          "pulley-size"
        ) as HTMLSelectElement;

        // Get custom name or generate default name
        const customName = pulleyNameInput?.value.trim() || "";
        const componentName =
          customName || this.generateComponentName("pulley");
        const pulleyRadius = parseInt(sizeSelect.value);

        config.properties = {
          name: componentName, // Custom or auto-generated name
          radius: pulleyRadius,
          beltRadius: pulleyRadius, // Same as radius for 1:1 ratio matching
          mass: pulleyRadius * 0.1,
          inertia: pulleyRadius * 0.05,
          friction: 0.08,
          efficiency: 0.95,
        };
        break;
      }

      case "forklift": {
        // Forklift with good defaults from working demo
        const componentName = this.generateComponentName("forklift");

        config.properties = {
          name: componentName,
          radius: 10,
          mass: 20,
          inertia: 5,
          friction: 0.1,
          efficiency: 0.92,
          armLength: 120, // Much longer forks for mega forklift
          baseHeight: 20,
          maxLiftWeight: 500,
          gearRatio: 5, // 5:1 reduction for lifting
          pulleyRadius: 35, // More reasonable size - bigger than standard but not excessive
        };
        break;
      }

      case "belt": {
        // Belt configuration now handled via dropdown selection in toolbar
        config.properties = {
          maxLength: 1000,
          width: 3,
          tensionCapacity: 500,
          slipCoefficient: 0.8,
          efficiency: 0.95,
          crossed: this.selectedBeltType === "cross",
        };
        break;
      }
    }

    return config;
  }

  private generateComponentName(type: string): string {
    this.componentCounter++;
    return `${type}_${this.componentCounter}`;
  }

  private createComponentFromConfig(config: ComponentConfig): void {
    // Use name from config properties, or fall back to generated name
    const componentName =
      config.properties.name || this.generateComponentName(config.type);

    // Creating component from config

    try {
      let component: any = null;

      switch (config.type) {
        case "motor":
          component = new Motor(componentName, config.properties);
          break;

        case "gear":
          component = new Gear(componentName, config.properties);
          break;

        case "pulley":
          component = new Pulley(componentName, config.properties);
          break;

        case "forklift":
          component = new Forklift(componentName, config.properties);
          break;

        case "belt":
          // Belt creation will be handled differently - needs two components to connect
          console.log(
            "Belt creation requires selecting two components to connect"
          );
          return;

        default:
          console.warn(`Component type ${config.type} not yet implemented`);
          return;
      }

      if (component) {
        component.setPosition(config.position.x, config.position.y);
        this.addMechanicalComponent(componentName, component);

        // Verify component was added
        const addedComponent = this.getMechanicalComponent(componentName);
        if (!addedComponent) {
          console.error(`Failed to add component: ${componentName}`);
          return;
        }

        // Add interaction handlers to the component - do this after a brief delay
        setTimeout(() => {
          this.addComponentInteractionHandlers(component);
        }, 100);

        // Check for gear snapping if it's a gear
        if (component.getComponentType() === "gear") {
          this.checkGearSnapping(component as Gear);
        }

        // Notify level scene about component placement
        this.onComponentPlaced(component.getComponentType());

        // Component created successfully

        this.updateInfoBar(`Created ${componentName}`, "success");
      }

      // Don't recenter camera immediately - let the user see what they created
      // this.getGameManager().recenterCamera();
    } catch (error) {
      console.error(`Failed to create ${config.type} component:`, error);
      this.updateInfoBar(
        `Failed to create ${config.type} component: ${error}`,
        "error"
      );
    }
  }

  private addComponentInteractionHandlers(component: any): void {
    const displayObject = component.displayObject();
    if (!displayObject) {
      console.warn(
        `No display object found for component: ${component.getName()}`
      );
      return;
    }

    // Setting up component interactions

    try {
      // Make component interactive and draggable
      displayObject.eventMode = "static";
      displayObject.cursor = "move";

      // Remove existing listeners to prevent conflicts
      displayObject.removeAllListeners();

      // Disable native browser dragging
      displayObject.addEventListener?.("dragstart", (e: Event) => {
        e.preventDefault();
        return false;
      });

      // Use PIXI's built-in drag system instead of mixing with DOM events
      let isDragging = false;
      const dragStart = { x: 0, y: 0 };
      const componentStart = { x: 0, y: 0 };

      // Click handler for belt creation and selection
      displayObject.on("click", (e: any) => {
        if (!isDragging) {
          // Only handle click if not dragging
          e.stopPropagation();
          this.handleComponentClick(component, e);
        }
      });

      // Double-click handler for direct property editing
      displayObject.on("dblclick", (e: any) => {
        e.stopPropagation();
        console.log(
          `🎯 Double-clicked ${component.getName()} - opening properties panel`
        );

        // Clear any existing selections and select this component
        this.clearComponentSelection();
        this.selectComponent(component, false);

        // Force show properties panel (should already be shown by selectComponent)
        this.showPropertiesPanel(component);

        this.updateInfoBar(
          `Double-clicked: Editing ${component.getName()} properties`
        );
      });

      // Global drag handlers - defined outside to prevent fast drag release
      let globalMoveHandler: any = null;
      let globalUpHandler: any = null;

      // Start drag
      displayObject.on("pointerdown", (e: any) => {
        console.log("🔥 PIXI DRAG START:", component.getName());

        if (this.beltCreationMode || this.isDragging) return;

        isDragging = true;
        this.isDraggingComponent = true;
        this.draggedComponent = component;

        // Store starting positions
        dragStart.x = e.global.x;
        dragStart.y = e.global.y;
        const pos = component.getPosition();
        componentStart.x = pos.x;
        componentStart.y = pos.y;

        // Bring component to front
        displayObject.parent.setChildIndex(
          displayObject,
          displayObject.parent.children.length - 1
        );

        // Setup GLOBAL drag handlers to prevent fast mouse movement issues
        const gameManager = this.getGameManager();
        const app = gameManager.getApp(); // Use public getter instead of private property

        // Global move handler - tracks mouse even when it leaves the component
        globalMoveHandler = (moveEvent: any) => {
          if (!isDragging) return;

          console.log("🔄 DRAG MOVE:", component.getName());

          let globalX, globalY;

          // Handle different event types (PIXI vs DOM)
          if (moveEvent.global) {
            // PIXI event
            globalX = moveEvent.global.x;
            globalY = moveEvent.global.y;
          } else if (moveEvent.clientX !== undefined) {
            // DOM event - convert to PIXI coordinates
            const rect = app.canvas.getBoundingClientRect();
            globalX = moveEvent.clientX - rect.left;
            globalY = moveEvent.clientY - rect.top;
          } else {
            return; // Unknown event type
          }

          // Calculate new position based on drag offset
          const dx = globalX - dragStart.x;
          const dy = globalY - dragStart.y;

          const newX = componentStart.x + dx;
          const newY = componentStart.y + dy;

          // Check belt constraints
          if (this.hasConnectedBelts(component)) {
            const constraintResult = this.isWithinBeltConstraints(component, {
              x: newX,
              y: newY,
            });
            if (!constraintResult.valid && constraintResult.violatingBelt) {
              const violatingBelt = constraintResult.violatingBelt;

              // Highlight the component that's causing the constraint violation
              const otherDisplayObject =
                violatingBelt.otherComponent.displayObject();
              if (otherDisplayObject) {
                otherDisplayObject.tint = 0xff4444; // Red tint for constraint violation
                setTimeout(() => {
                  otherDisplayObject.tint = 0xffffff; // Reset to normal after 500ms
                }, 500);
              }

              this.updateInfoBar(
                `Cannot move - belt to ${violatingBelt.otherComponent.getName()} would be ${violatingBelt.distance}px (max: ${violatingBelt.maxDistance}px)`,
                "error"
              );
              return;
            }
          }

          // Update component position
          component.setPosition(newX, newY);
          this.updateConnectedBelts(component);
          this.updateConnectedGearMeshes(component);

          // Show gear snap preview if it's a gear being dragged
          if (component.getComponentType() === "gear") {
            this.showGearSnapPreview(component as any);
          }

          // Check if over trash bin and provide visual feedback
          this.updateTrashBinDragFeedback(moveEvent);

          this.updateInfoBar(
            `Dragging ${component.getName()} (${Math.round(newX)}, ${Math.round(newY)})`
          );
        };

        // Global up handler - ensures drag always ends
        globalUpHandler = (upEvent?: any) => {
          if (!isDragging) return;

          console.log("🔥 PIXI DRAG END:", component.getName());

          // Clear trash bin drag feedback
          this.clearTrashBinDragFeedback();

          // Check if component was dropped on trash bin (handles deletion internally)
          this.checkDropOnTrash(upEvent, component);

          isDragging = false;
          this.isDraggingComponent = false;
          this.draggedComponent = null;

          // Remove all handlers
          if (globalMoveHandler) {
            // Remove element-based events
            displayObject.off("pointermove", globalMoveHandler);
            // Remove global DOM events
            document.removeEventListener("mousemove", globalMoveHandler, {
              capture: true,
            });
            globalMoveHandler = null;
          }
          if (globalUpHandler) {
            // Remove element-based events
            displayObject.off("pointerup", globalUpHandler);
            displayObject.off("pointerupoutside", globalUpHandler);
            // Remove global DOM events
            document.removeEventListener("mouseup", globalUpHandler, {
              capture: true,
            });
            document.removeEventListener("pointerup", globalUpHandler, {
              capture: true,
            });
            globalUpHandler = null;
          }

          this.finalizeDrag(component);
        };

        // Use BOTH element events (for normal cases) AND global events (for fast movement)

        // Primary: Element-based events (work in most cases)
        displayObject.on("pointermove", globalMoveHandler);
        displayObject.on("pointerup", globalUpHandler);
        displayObject.on("pointerupoutside", globalUpHandler);

        // Secondary: Global DOM events (catch fast movement cases)
        document.addEventListener("mousemove", globalMoveHandler, {
          capture: true,
        });
        document.addEventListener("mouseup", globalUpHandler, {
          capture: true,
        });
        document.addEventListener("pointerup", globalUpHandler, {
          capture: true,
        });

        e.stopPropagation();
        this.updateInfoBar(`Dragging ${component.getName()}`);
      });

      // OLD drag movement handler - REMOVED (replaced with global handlers above to prevent fast drag release)
      // The global handlers in pointerdown now handle all drag movement and release

      // Legacy endDrag function removed - now handled by global handlers

      // OLD drag end handlers - REMOVED (replaced with global handlers to prevent fast drag release)
      // displayObject.on("pointerup", endDrag);
      // displayObject.on("pointerupoutside", endDrag);

      // Component interactions ready
    } catch (error) {
      console.error(
        `Failed to add interaction handlers for ${component.getName()}:`,
        error
      );
    }
  }

  // Legacy drag methods removed - now using pure PIXI event system in addComponentInteractionHandlers

  // endComponentDrag method removed - now handled by pure PIXI events

  private finalizeDrag(draggedComponent: any): void {
    console.log("🔥 FINALIZING DRAG:", draggedComponent.getName());

    // Clear gear snap preview effects
    this.clearGearSnapPreview();

    // CRITICAL: Check for belt disconnections at final position
    this.updateConnectedBelts(draggedComponent);
    this.updateConnectedGearMeshes(draggedComponent);

    // Check for gear snapping if it's a gear
    if (draggedComponent.getComponentType() === "gear") {
      this.checkGearSnapping(draggedComponent as Gear);
    }

    // Update info bar
    this.updateInfoBar(
      `Moved ${draggedComponent.getName()} to position: ${draggedComponent.getPosition().x.toFixed(0)}, ${draggedComponent.getPosition().y.toFixed(0)}`,
      "success"
    );

    // Now recenter camera after drag is complete
    // this.getGameManager().recenterCamera(); // Disabled auto-recentering
  }

  private checkGearSnapping(gear: Gear): void {
    const components = this.getSceneManager().getAllMechanicalComponents();
    const gearPos = gear.getPosition();
    const isSimulationRunning = this.isSimulationRunning;

    console.log(
      `🔧 Checking gear snapping for ${gear.getName()} at (${gearPos.x.toFixed(1)}, ${gearPos.y.toFixed(1)}) - Simulation running: ${isSimulationRunning}`
    );

    // Find all nearby gears with their distances
    const nearbyGears: Array<{
      gear: Gear;
      distance: number;
      position: { x: number; y: number };
    }> = [];

    for (const [, component] of components) {
      // Skip self and non-gears
      if (component === gear || component.getComponentType() !== "gear")
        continue;

      const otherPos = component.getPosition();
      const distance = Math.sqrt(
        Math.pow(otherPos.x - gearPos.x, 2) +
          Math.pow(otherPos.y - gearPos.y, 2)
      );

      if (distance <= this.GEAR_SNAP_DISTANCE) {
        nearbyGears.push({
          gear: component as Gear,
          distance: distance,
          position: otherPos,
        });
      }
    }

    // If no nearby gears, no snapping
    if (nearbyGears.length === 0) {
      return;
    }

    // Sort by distance to find the closest gear
    nearbyGears.sort((a, b) => a.distance - b.distance);
    const closestGearInfo = nearbyGears[0];
    const closestGear = closestGearInfo.gear;
    const otherPos = closestGearInfo.position;

    console.log(
      `🔧 Gear snapping: ${gear.getName()} found ${nearbyGears.length} nearby gears, snapping to closest: ${closestGear.getName()} (distance: ${closestGearInfo.distance.toFixed(1)}px)`
    );

    // Calculate proper meshing position
    const gearProps = gear.getGearProperties();
    const otherGearProps = closestGear.getGearProperties();

    // Position gears so they touch at their radii (accounting for gear teeth)
    const totalRadius = gearProps.radius + otherGearProps.radius;

    // Calculate angle from closest gear to current gear position
    const angle = Math.atan2(gearPos.y - otherPos.y, gearPos.x - otherPos.x);

    // Calculate snap position - place gear at exact meshing distance
    const snapX = otherPos.x + Math.cos(angle) * totalRadius;
    const snapY = otherPos.y + Math.sin(angle) * totalRadius;

    // Apply snapping with visual feedback
    const originalPos = { x: gearPos.x, y: gearPos.y };
    gear.setPosition(snapX, snapY);

    const actualDistance = Math.sqrt(
      Math.pow(snapX - otherPos.x, 2) + Math.pow(snapY - otherPos.y, 2)
    );

    console.log(
      `🔧 Gear snapped: ${gear.getName()} moved from (${originalPos.x.toFixed(1)}, ${originalPos.y.toFixed(1)}) to (${snapX.toFixed(1)}, ${snapY.toFixed(1)}), meshing distance: ${actualDistance.toFixed(1)}px (expected: ${totalRadius.toFixed(1)}px)`
    );

    // Check if already connected before attempting connection
    const alreadyConnected = this.areComponentsConnected(
      gear.getName(),
      closestGear.getName(),
      "gear_mesh"
    );
    console.log(
      `🔧 Gear connection check: ${gear.getName()} ↔ ${closestGear.getName()} already connected: ${alreadyConnected}`
    );

    if (!alreadyConnected) {
      // Create gear mesh connection
      const success = this.connectComponents(
        gear.getName(),
        closestGear.getName(),
        "gear_mesh"
      );

      console.log(
        `🔧 Gear mesh connection attempt: ${success ? "SUCCESS" : "FAILED"} (${gear.getName()} ↔ ${closestGear.getName()})`
      );

      // Provide user feedback
      if (success) {
        this.updateInfoBar(
          `🔧 ${gear.getName()} snapped to ${closestGear.getName()} and meshed (${closestGearInfo.distance.toFixed(0)}px → ${actualDistance.toFixed(0)}px)`,
          "success"
        );

        // Brief visual feedback - tint both gears green
        this.showGearSnapFeedback(gear, closestGear);
      } else {
        this.updateInfoBar(
          `🔧 Failed to mesh ${gear.getName()} with ${closestGear.getName()}`,
          "error"
        );
      }
    } else {
      console.log(
        `🔧 Gears ${gear.getName()} ↔ ${closestGear.getName()} already meshed - skipping`
      );
      this.updateInfoBar(
        `🔧 ${gear.getName()} snapped to ${closestGear.getName()} (already meshed)`,
        "info"
      );
    }
  }

  private showGearSnapFeedback(gear1: Gear, gear2: Gear): void {
    const originalTint1 = gear1.displayObject().tint;
    const originalTint2 = gear2.displayObject().tint;

    // Tint both gears green briefly
    gear1.displayObject().tint = 0x00ff00; // Green
    gear2.displayObject().tint = 0x00ff00; // Green

    // Restore original tint after a short delay
    setTimeout(() => {
      gear1.displayObject().tint = originalTint1;
      gear2.displayObject().tint = originalTint2;
    }, 500);
  }

  private showGearSnapPreview(draggedGear: Gear): void {
    const components = this.getSceneManager().getAllMechanicalComponents();
    const gearPos = draggedGear.getPosition();

    // Reset all gear tints first
    for (const [, component] of components) {
      if (
        component.getComponentType() === "gear" &&
        component !== draggedGear
      ) {
        component.displayObject().tint = 0xffffff; // White (normal)
      }
    }

    // Find nearby gears that could snap
    let foundNearbyGear = false;
    for (const [, component] of components) {
      // Skip self and non-gears
      if (component === draggedGear || component.getComponentType() !== "gear")
        continue;

      const otherPos = component.getPosition();
      const distance = Math.sqrt(
        Math.pow(otherPos.x - gearPos.x, 2) +
          Math.pow(otherPos.y - gearPos.y, 2)
      );

      // Show preview if within snap distance
      if (distance <= this.GEAR_SNAP_DISTANCE) {
        // Tint the nearby gear yellow to indicate it's in snap range
        component.displayObject().tint = 0xffff00; // Yellow
        foundNearbyGear = true;
      }
    }

    // Tint the dragged gear to show snap status
    if (foundNearbyGear) {
      draggedGear.displayObject().tint = 0xffff00; // Yellow - ready to snap
    } else {
      draggedGear.displayObject().tint = 0xffffff; // White - normal
    }
  }

  private clearGearSnapPreview(): void {
    // Reset all gear tints to normal
    const components = this.getSceneManager().getAllMechanicalComponents();
    for (const [, component] of components) {
      if (component.getComponentType() === "gear") {
        component.displayObject().tint = 0xffffff; // White (normal)
      }
    }
  }

  private hasConnectedBelts(component: any): boolean {
    const connections = component.getConnections();
    for (const [, connection] of connections) {
      if (connection.type === "belt_connection") {
        return true;
      }
    }
    return false;
  }

  private getConnectedBelts(component: any): Array<{
    belt: any;
    otherComponent: any;
    radius1: number;
    radius2: number;
  }> {
    const connectedBelts: Array<{
      belt: any;
      otherComponent: any;
      radius1: number;
      radius2: number;
    }> = [];

    // Get all belt objects in the scene
    const gameObjects = this.getSceneManager().getAllGameObjects();

    gameObjects.forEach((gameObject, name) => {
      if (
        name.startsWith("belt_") &&
        gameObject instanceof MechanicalComponent
      ) {
        const belt = gameObject as any;

        // Check if this belt connects to our component
        const beltConnections = belt.beltConnections || [];

        for (const beltConnection of beltConnections) {
          if (beltConnection.component === component) {
            // Find the other component in this belt connection
            const otherConnection = beltConnections.find(
              (conn: any) => conn.component !== component
            );

            if (otherConnection) {
              connectedBelts.push({
                belt: belt,
                otherComponent: otherConnection.component,
                radius1: beltConnection.radius,
                radius2: otherConnection.radius,
              });
            }
          }
        }
      }
    });

    return connectedBelts;
  }

  private getConnectedGearMeshes(component: any): Array<{
    meshedGear: any;
    requiredDistance: number;
    actualDistance: number;
  }> {
    const connectedGearMeshes: Array<{
      meshedGear: any;
      requiredDistance: number;
      actualDistance: number;
    }> = [];

    // Check all connections of this component
    const connections = component.getConnections();

    for (const [, connection] of connections) {
      // Only look at gear mesh connections
      if (connection.type === "gear_mesh") {
        const otherGear = connection.component;

        // Calculate required meshing distance (sum of radii)
        const componentRadius = this.getComponentRadius(component);
        const otherRadius = this.getComponentRadius(otherGear);
        const requiredDistance = componentRadius + otherRadius;

        // Calculate actual distance
        const componentPos = component.getPosition();
        const otherPos = otherGear.getPosition();
        const actualDistance = this.calculateDistance(componentPos, otherPos);

        connectedGearMeshes.push({
          meshedGear: otherGear,
          requiredDistance,
          actualDistance,
        });
      }
    }

    return connectedGearMeshes;
  }

  private getComponentRadius(component: any): number {
    if (component.getComponentType() === "gear") {
      const gearProps = component.getGearProperties();
      return gearProps.radius || 20; // Default fallback
    } else if (component.getComponentType() === "pulley") {
      const pulleyProps = component.getPulleyProperties();
      return pulleyProps.radius || 16; // Default fallback
    } else if (component.getComponentType() === "motor") {
      const motorProps = component.getMotorProperties();
      return motorProps.beltRadius || 20; // Default fallback
    }
    return 20; // Default fallback
  }

  private isWithinBeltConstraints(
    component: any,
    newPosition: { x: number; y: number }
  ): {
    valid: boolean;
    violatingBelt?: {
      otherComponent: any;
      distance: number;
      maxDistance: number;
    };
  } {
    const connectedBelts = this.getConnectedBelts(component);

    for (const beltInfo of connectedBelts) {
      const otherPos = beltInfo.otherComponent.getPosition();
      const distance = Math.sqrt(
        Math.pow(otherPos.x - newPosition.x, 2) +
          Math.pow(otherPos.y - newPosition.y, 2)
      );

      if (distance > this.MAX_BELT_DISTANCE) {
        return {
          valid: false,
          violatingBelt: {
            otherComponent: beltInfo.otherComponent,
            distance: Math.round(distance),
            maxDistance: this.MAX_BELT_DISTANCE,
          },
        };
      }
    }

    return { valid: true };
  }

  private updateConnectedBelts(movedComponent: any): void {
    // Get all belt components that connect to this component
    const connectedBelts = this.getConnectedBelts(movedComponent);

    console.log(
      `🔧 Updating ${connectedBelts.length} connected belts for ${movedComponent.getName()}`
    );

    const beltsToRemove: any[] = [];

    connectedBelts.forEach((beltInfo) => {
      const { belt, otherComponent } = beltInfo;

      // Check if components are too far apart for belt connection
      const distance = this.calculateDistance(
        movedComponent.getPosition(),
        otherComponent.getPosition()
      );

      if (distance > this.MAX_BELT_DISTANCE * 1.5) {
        // 1.5x threshold for disconnection
        console.log(
          `🔧 Belt ${belt.getName()} exceeds max distance (${distance.toFixed(1)}px > ${this.MAX_BELT_DISTANCE * 1.5}px) - disconnecting`
        );
        beltsToRemove.push(belt);
      } else {
        // Use the efficient update method
        belt.updateConnectionPositions();
        console.log(`🔧 Updated belt ${belt.getName()} positions`);
      }
    });

    // Remove belts that are too stretched
    beltsToRemove.forEach((belt) => {
      this.removeBeltConnection(belt);
    });

    // Disabled auto-recentering for better user experience
    // Users can manually recenter using controls if needed
    // if (!this.isDraggingComponent) {
    //   this.getGameManager().recenterCamera();
    // }
  }

  private updateConnectedGearMeshes(movedComponent: any): void {
    // Get all gear mesh connections for this component
    const connectedGearMeshes = this.getConnectedGearMeshes(movedComponent);

    console.log(
      `⚙️ Updating ${connectedGearMeshes.length} connected gear meshes for ${movedComponent.getName()}`
    );

    const meshesToRemove: Array<{ component: any; otherGear: any }> = [];

    connectedGearMeshes.forEach((meshInfo) => {
      const { meshedGear, requiredDistance, actualDistance } = meshInfo;

      // Check if gears are too far apart to mesh (with tolerance)
      const maxAllowedDistance =
        requiredDistance + this.MAX_GEAR_MESH_TOLERANCE;

      if (actualDistance > maxAllowedDistance) {
        console.log(
          `⚙️ Gear mesh ${movedComponent.getName()} ↔ ${meshedGear.getName()} exceeds meshing distance (${actualDistance.toFixed(1)}px > ${maxAllowedDistance.toFixed(1)}px) - disconnecting`
        );
        meshesToRemove.push({
          component: movedComponent,
          otherGear: meshedGear,
        });
      } else {
        console.log(
          `⚙️ Gear mesh ${movedComponent.getName()} ↔ ${meshedGear.getName()} OK: ${actualDistance.toFixed(1)}px ≤ ${maxAllowedDistance.toFixed(1)}px`
        );
      }
    });

    // Remove gear meshes that are too far apart
    meshesToRemove.forEach(({ component, otherGear }) => {
      this.removeGearMeshConnection(component, otherGear);
    });
  }

  /**
   * Remove a belt connection and clean up all related connections
   */
  private removeBeltConnection(belt: any): void {
    const beltName = belt.getName();

    // Get connected components before removing the belt
    const connectedComponents: any[] = [];
    if (belt.beltConnections && belt.beltConnections.length > 0) {
      belt.beltConnections.forEach((connection: any) => {
        if (connection.component) {
          connectedComponents.push(connection.component);
        }
      });
    }

    // Remove the belt component from the scene
    this.getSceneManager().removeMechanicalComponent(beltName);

    // Reset connected components to idle state if they're not motors (self-driving)
    connectedComponents.forEach((component) => {
      const componentType = component.getComponentType();
      const componentName = component.getName();
      console.log(
        `🔧 Checking component ${componentName} (type: ${componentType}) for remaining connections...`
      );

      if (componentType !== "motor") {
        // Check if component still has other connections (belts OR gear meshes)
        const remainingBeltConnections = this.getConnectedBelts(component);
        const remainingMeshConnections = this.getConnectedGearMeshes(component);
        const totalConnections =
          remainingBeltConnections.length + remainingMeshConnections.length;

        console.log(
          `🔧 ${componentName} has ${remainingBeltConnections.length} belt connections and ${remainingMeshConnections.length} mesh connections (total: ${totalConnections})`
        );

        if (totalConnections === 0) {
          // No more connections - reset to idle
          const currentState = component.getMechanicalState();
          console.log(
            `🔧 ${componentName} before reset: ${PhysicsSystem.omegaToRPM(currentState.omega).toFixed(1)} RPM`
          );

          component.resetToIdleState();

          // Force an immediate visual update to reflect the stopped state
          component.updateVisuals(0);

          const newState = component.getMechanicalState();
          console.log(
            `🔧 ${componentName} after reset: ${PhysicsSystem.omegaToRPM(newState.omega).toFixed(1)} RPM`
          );
          console.log(
            `🔧 Reset ${componentName} to idle state - no remaining connections`
          );
        } else {
          console.log(
            `🔧 ${componentName} still has ${totalConnections} connections - keeping active`
          );
          // List the remaining connections for debugging
          remainingBeltConnections.forEach((conn, index) => {
            console.log(
              `  Belt ${index + 1}: ${conn.belt.getName()} -> ${conn.otherComponent.getName()}`
            );
          });
          remainingMeshConnections.forEach((conn, index) => {
            console.log(
              `  Mesh ${index + 1}: ${componentName} ↔ ${conn.meshedGear.getName()}`
            );
          });
        }
      } else {
        console.log(
          `🔧 ${componentName} is a motor - skipping reset (self-driving)`
        );
      }
    });

    // Update info bar
    this.updateInfoBar(
      `Belt connection ${beltName} removed - components too far apart`
    );

    console.log(`🔧 Removed belt connection: ${beltName}`);
  }

  /**
   * Remove a gear mesh connection and clean up related connections
   */
  private removeGearMeshConnection(gear1: any, gear2: any): void {
    const gear1Name = gear1.getName();
    const gear2Name = gear2.getName();

    console.log(
      `⚙️ Removing gear mesh connection between ${gear1Name} and ${gear2Name}`
    );

    // Disconnect at component level
    gear1.disconnectFrom(gear2);

    // Also disconnect via connection system if available
    const connectionSystem = this.getGameManager().getConnectionSystem();
    if (connectionSystem) {
      connectionSystem.disconnect(gear1, gear2);
    }

    // Check and reset each gear if it has no remaining connections
    const gearComponents = [gear1, gear2];

    gearComponents.forEach((gear) => {
      const gearType = gear.getComponentType();
      const gearName = gear.getName();
      console.log(
        `⚙️ Checking gear ${gearName} (type: ${gearType}) for remaining connections...`
      );

      if (gearType !== "motor") {
        // Check if gear still has other connections (belts OR gear meshes)
        const remainingBelts = this.getConnectedBelts(gear);
        const remainingMeshes = this.getConnectedGearMeshes(gear);
        const totalConnections = remainingBelts.length + remainingMeshes.length;

        console.log(
          `⚙️ ${gearName} has ${remainingBelts.length} belt connections and ${remainingMeshes.length} mesh connections (total: ${totalConnections})`
        );

        if (totalConnections === 0) {
          // No more connections - reset to idle
          const currentState = gear.getMechanicalState();
          console.log(
            `⚙️ ${gearName} before reset: ${PhysicsSystem.omegaToRPM(currentState.omega).toFixed(1)} RPM`
          );

          gear.resetToIdleState();

          // Force an immediate visual update to reflect the stopped state
          gear.updateVisuals(0);

          const newState = gear.getMechanicalState();
          console.log(
            `⚙️ ${gearName} after reset: ${PhysicsSystem.omegaToRPM(newState.omega).toFixed(1)} RPM`
          );
          console.log(
            `⚙️ Reset ${gearName} to idle state - no remaining connections`
          );
        } else {
          console.log(
            `⚙️ ${gearName} still has ${totalConnections} connections - keeping active`
          );
          // List the remaining connections for debugging
          remainingBelts.forEach((conn, index) => {
            console.log(
              `  Belt ${index + 1}: ${conn.belt.getName()} -> ${conn.otherComponent.getName()}`
            );
          });
          remainingMeshes.forEach((conn, index) => {
            console.log(
              `  Mesh ${index + 1}: ${gearName} ↔ ${conn.meshedGear.getName()}`
            );
          });
        }
      } else {
        console.log(
          `⚙️ ${gearName} is a motor - skipping reset (self-driving)`
        );
      }
    });

    // Update info bar
    this.updateInfoBar(
      `Gear mesh connection ${gear1Name} ↔ ${gear2Name} removed - gears too far apart`
    );
  }

  /**
   * Check if two components are already connected with a specific connection type
   */
  private areComponentsConnected(
    comp1Name: string,
    comp2Name: string,
    connectionType: string
  ): boolean {
    const comp1 = this.getSceneManager().getMechanicalComponent(comp1Name);
    const comp2 = this.getSceneManager().getMechanicalComponent(comp2Name);

    if (!comp1 || !comp2) return false;

    const connections = comp1.getConnections();
    for (const [, connection] of connections) {
      if (
        connection.component === comp2 &&
        connection.type === connectionType
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Runtime gear mesh detection - automatically creates mesh connections
   * when gears come close during simulation
   */
  private checkRuntimeGearMeshing(): void {
    if (!this.isSimulationRunning) return;

    const currentTime = Date.now();
    if (
      currentTime - this.lastRuntimeMeshCheck <
      this.RUNTIME_MESH_CHECK_INTERVAL
    ) {
      return; // Skip if checked too recently
    }

    this.lastRuntimeMeshCheck = currentTime;

    const components = this.getSceneManager().getAllMechanicalComponents();
    const gears: any[] = [];

    // Collect all gears
    for (const [, component] of components) {
      if (component.getComponentType() === "gear") {
        gears.push(component);
      }
    }

    // Only log when there are gears and potential for meshing
    if (gears.length >= 2) {
      console.log(`⚙️ Runtime mesh check: Found ${gears.length} gears`);
    }

    // Check each pair of gears for potential meshing
    for (let i = 0; i < gears.length; i++) {
      for (let j = i + 1; j < gears.length; j++) {
        const gear1 = gears[i];
        const gear2 = gears[j];

        // Skip if already connected
        if (
          this.areComponentsConnected(
            gear1.getName(),
            gear2.getName(),
            "gear_mesh"
          )
        ) {
          continue;
        }

        // Check distance between gears
        const pos1 = gear1.getPosition();
        const pos2 = gear2.getPosition();
        const distance = this.calculateDistance(pos1, pos2);

        // Calculate required meshing distance
        const radius1 = this.getComponentRadius(gear1);
        const radius2 = this.getComponentRadius(gear2);
        const requiredDistance = radius1 + radius2;
        const maxAllowedDistance =
          requiredDistance + this.MAX_GEAR_MESH_TOLERANCE;

        // If gears are close enough to mesh, create connection
        if (distance <= maxAllowedDistance) {
          console.log(
            `⚙️ Runtime mesh opportunity: ${gear1.getName()} ↔ ${gear2.getName()} (distance: ${distance.toFixed(1)}px ≤ ${maxAllowedDistance.toFixed(1)}px)`
          );

          // Only adjust position if the distance is significantly off and gear isn't actively driven
          const positionAdjustmentNeeded =
            Math.abs(distance - requiredDistance) > 2; // 2px tolerance
          const gear1Driven = gear1.getMechanicalState().omega !== 0;
          const gear2Driven = gear2.getMechanicalState().omega !== 0;

          if (positionAdjustmentNeeded && !gear1Driven && !gear2Driven) {
            // Position gears for perfect meshing (only if neither is currently rotating)
            const angle = Math.atan2(pos1.y - pos2.y, pos1.x - pos2.x);
            const snapX = pos2.x + Math.cos(angle) * requiredDistance;
            const snapY = pos2.y + Math.sin(angle) * requiredDistance;

            gear1.setPosition(snapX, snapY);
            console.log(
              `⚙️ Adjusted ${gear1.getName()} position for perfect meshing`
            );
          }

          // Create gear mesh connection
          const success = this.connectComponents(
            gear1.getName(),
            gear2.getName(),
            "gear_mesh"
          );

          if (success) {
            console.log(
              `⚙️ Runtime mesh created: ${gear1.getName()} ↔ ${gear2.getName()}`
            );
            this.updateInfoBar(
              `⚙️ Auto-meshed: ${gear1.getName()} ↔ ${gear2.getName()}`,
              "success"
            );

            // Brief visual feedback
            this.showGearSnapFeedback(gear1, gear2);
          } else {
            console.log(
              `⚙️ Runtime mesh failed: ${gear1.getName()} ↔ ${gear2.getName()}`
            );
          }
        }
      }
    }
  }

  /**
   * Scene update - called every frame
   * Handles runtime gear mesh detection during simulation
   */
  public override update(deltaTime: number): void {
    super.update(deltaTime);

    // Check for runtime gear meshing opportunities during simulation
    this.checkRuntimeGearMeshing();
  }

  /**
   * Calculate distance between two positions
   */
  private calculateDistance(
    pos1: { x: number; y: number },
    pos2: { x: number; y: number }
  ): number {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Convert screen coordinates to PIXI world coordinates
   */
  private screenToWorldCoordinates(
    screenX: number,
    screenY: number
  ): { x: number; y: number } {
    const app = this.getGameManager().getApp();
    const canvasRect = app.canvas.getBoundingClientRect();

    // Step 1: Convert screen coordinates to canvas coordinates
    const canvasX = screenX - canvasRect.left;
    const canvasY = screenY - canvasRect.top;

    // Step 2: Convert canvas coordinates to PIXI world coordinates
    // Account for stage transformation (position and scale)
    const worldX = (canvasX - app.stage.position.x) / app.stage.scale.x;
    const worldY = (canvasY - app.stage.position.y) / app.stage.scale.y;

    // Coordinate conversion complete

    return { x: worldX, y: worldY };
  }

  // Removed worldToScreenCoordinates method as it's no longer used

  // Removed testCoordinateSystem method as requested

  private hideConfigModal(): void {
    this.configModal.style.display = "none";
    this.configModal.innerHTML = "";
  }

  // Removed checkDragStatus method as it's no longer needed

  // Removed testQuickDrop method as requested

  /**
   * Clean up editor interface when scene is cleared
   */
  protected override onSceneCleared(): void {
    this.componentCounter = 0;
    console.log("Editor scene cleared - component counter reset");
  }

  /**
   * Clean up editor interface when scene is deactivated
   */
  protected override onSceneDeactivated(): void {
    // Stop simulation when leaving the scene
    if (this.isSimulationRunning) {
      this.stopSimulation();
      this.isSimulationRunning = false;
    }

    // Remove toolbar when leaving editor
    if (this.toolbar && this.toolbar.parentNode) {
      this.toolbar.parentNode.removeChild(this.toolbar);
    }

    // Remove play/stop button
    if (this.playStopButton && this.playStopButton.parentNode) {
      this.playStopButton.parentNode.removeChild(this.playStopButton);
    }

    if (this.dragPreview && this.dragPreview.parentNode) {
      this.dragPreview.parentNode.removeChild(this.dragPreview);
    }

    if (this.configModal && this.configModal.parentNode) {
      this.configModal.parentNode.removeChild(this.configModal);
    }

    if (this.infoBar && this.infoBar.parentNode) {
      this.infoBar.parentNode.removeChild(this.infoBar);
    }

    // Remove zoom controls
    const zoomControls = document.getElementById("zoom-controls");
    if (zoomControls) zoomControls.remove();

    // Remove trash bin
    const trashBin = document.getElementById("trash-bin");
    if (trashBin) trashBin.remove();

    // Remove properties panel
    const propertiesPanel = document.getElementById("properties-panel");
    if (propertiesPanel) propertiesPanel.remove();

    // Reset states
    this.beltCreationMode = false;
    this.selectedComponents = [];
    this.isDraggingComponent = false;
    this.draggedComponent = null;
    this.clearHighlights();
    this.clearComponentSelection(); // Clear component selections
    this.clearTrashBinDragFeedback(); // Clear trash bin feedback
    document.body.style.cursor = "default";

    // Unregister this scene from active updates
    this.getSceneManager().setActiveScene(null);
  }

  /**
   * Initialize editor interface when scene is activated
   */
  protected override onSceneActivated(): void {
    // Register this scene as the active scene for updates
    this.getSceneManager().setActiveScene(this);

    this.initializeSaveLoadSystem();
    this.createEditorInterface();
    this.setupEventListeners();
    this.setupDragSafetyHandlers();
    this.disableBrowserDragOnCanvas();
    this.setupAutoSave();

    // Reset camera to ensure proper coordinate system
    this.getGameManager().resetCamera();
    this.drawOriginMarker();
    console.log(
      "EditorScene activated - camera reset for proper coordinate system"
    );
  }

  private disableBrowserDragOnCanvas(): void {
    const app = this.getGameManager().getApp();
    const canvas = app.canvas;

    // Disable native browser dragging on the canvas
    canvas.draggable = false;
    canvas.ondragstart = (e) => {
      console.log("🚫 Preventing native drag on canvas");
      e.preventDefault();
      return false;
    };

    // Disable context menu which can interfere
    canvas.oncontextmenu = (e) => {
      e.preventDefault();
      return false;
    };

    // Disable text selection
    canvas.style.userSelect = "none";
    canvas.style.webkitUserSelect = "none";

    console.log("✅ Canvas drag behavior disabled");
  }

  private setupDragSafetyHandlers(): void {
    // Force stop dragging on escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isDraggingComponent) {
        console.log("🔥 ESCAPE pressed - force stopping drag");
        this.forceStopDragging();
      }
    });

    // Force stop dragging if mouse leaves the window
    window.addEventListener("mouseleave", () => {
      if (this.isDraggingComponent) {
        console.log("🔥 Mouse left window - force stopping drag");
        this.forceStopDragging();
      }
    });

    // Global safety net - ensure any mouse up stops dragging
    document.addEventListener("mouseup", () => {
      if (this.isDraggingComponent) {
        console.log("🔥 Global mouseup detected - stopping any active drag");
        this.forceStopDragging();
      }
    });

    // Prevent default drag behavior on the entire body
    document.body.addEventListener("dragstart", (e) => {
      e.preventDefault();
      return false;
    });

    // Additional safety for pointer events
    document.addEventListener("pointerup", () => {
      if (this.isDraggingComponent) {
        console.log("🔥 Global pointerup detected - stopping any active drag");
        this.forceStopDragging();
      }
    });
  }

  private forceStopDragging(): void {
    console.log("🔥 FORCE STOP DRAG - Current state:", {
      isDraggingComponent: this.isDraggingComponent,
      draggedComponent: this.draggedComponent?.getName(),
    });

    if (this.isDraggingComponent && this.draggedComponent) {
      console.log("🔥 FORCE STOPPING:", this.draggedComponent.getName());

      // Get the dragged component before clearing
      const draggedComp = this.draggedComponent;

      // Clear all drag state immediately
      this.isDraggingComponent = false;
      this.draggedComponent = null;

      // Finalize the drag
      this.finalizeDrag(draggedComp);

      // Clear any lingering event listeners on the component
      const displayObj = draggedComp.displayObject();
      if (displayObj) {
        displayObj.cursor = "move";
        // Reset interaction state
        console.log("🔥 Resetting component interaction state");
      }

      this.updateInfoBar("Drag force stopped", "info");
    } else {
      console.log("🔥 No active drag to stop");
      this.updateInfoBar("No drag active", "info");
    }
  }

  /**
   * Draw a visual marker at world coordinate (0, 0) to help with debugging
   */
  private drawOriginMarker(): void {
    const app = this.getGameManager().getApp();

    // Remove existing origin marker if it exists
    const existingMarker = app.stage.children.find(
      (child) => child.label === "origin-marker"
    );
    if (existingMarker) {
      app.stage.removeChild(existingMarker);
    }

    // Create a new graphics object for the origin marker
    const originMarker = new PIXI.Graphics();
    (originMarker as any).label = "origin-marker"; // Add label for identification

    // Draw crosshair at world origin (0, 0)
    const crossSize = 20;

    // Red horizontal line
    originMarker.moveTo(-crossSize, 0);
    originMarker.lineTo(crossSize, 0);
    originMarker.stroke({ width: 2, color: 0xff0000 });

    // Red vertical line
    originMarker.moveTo(0, -crossSize);
    originMarker.lineTo(0, crossSize);
    originMarker.stroke({ width: 2, color: 0xff0000 });

    // Center circle
    originMarker.circle(0, 0, 3);
    originMarker.fill(0xff0000);

    // Position at world origin (0, 0)
    originMarker.position.set(0, 0);

    // Add to stage
    app.stage.addChild(originMarker);

    // Origin marker drawn at world (0, 0)
  }

  /**
   * Create empty editor scene
   */
  public createEditorScene(): void {
    this.clearScene();
    console.log("Editor scene created - ready for component placement");
  }

  // === SAVE/LOAD SYSTEM METHODS ===

  /**
   * Initialize the save/load system
   */
  private initializeSaveLoadSystem(): void {
    this.saveLoadSystem = new SaveLoadSystem(
      this.getGameManager(),
      this.getSceneManager()
    );
    console.log("💾 Save/Load system initialized");
  }

  /**
   * Setup auto-save functionality
   */
  private setupAutoSave(): void {
    // Auto-save every 2 minutes
    setInterval(
      () => {
        this.saveLoadSystem.autoSave();
      },
      2 * 60 * 1000
    );

    // Auto-save on page unload
    window.addEventListener("beforeunload", () => {
      this.saveLoadSystem.autoSave();
    });
  }

  /**
   * Show save/load modal
   */
  private showSaveLoadModal(): void {
    const modal = document.createElement("div");
    modal.className = "save-load-modal";
    modal.innerHTML = `
      <div class="save-load-content">
        <div class="save-load-header">
          <h2>💾 Save & Load</h2>
          <button class="close-btn" onclick="this.closest('.save-load-modal').remove()">×</button>
        </div>
        
        <div class="save-load-tabs">
          <button class="tab-btn active" data-tab="save">Save</button>
          <button class="tab-btn" data-tab="load">Load</button>
          <button class="tab-btn" data-tab="export">Export</button>
          <button class="tab-btn" data-tab="import">Import</button>
        </div>

        <div class="tab-content active" data-tab="save">
          <h3>Save Scene</h3>
          <input type="text" id="scene-name" placeholder="Enter scene name..." />
          <textarea id="scene-description" placeholder="Optional description..."></textarea>
          <button id="save-btn" class="action-btn">💾 Save to Browser</button>
        </div>

        <div class="tab-content" data-tab="load">
          <h3>Load Scene</h3>
          <div id="saved-scenes-list">
            <p>Loading saved scenes...</p>
          </div>
          <button id="load-autosave-btn" class="action-btn secondary">🔄 Load Auto-Save</button>
        </div>

        <div class="tab-content" data-tab="export">
          <h3>Export Scene</h3>
          <input type="text" id="export-name" placeholder="Enter filename..." />
          <textarea id="export-description" placeholder="Optional description..."></textarea>
          <button id="export-btn" class="action-btn">📥 Download File</button>
        </div>

        <div class="tab-content" data-tab="import">
          <h3>Import Scene</h3>
          <input type="file" id="import-file" accept=".json,.stemplitude.json" />
          <button id="import-btn" class="action-btn">📤 Import File</button>
          <div class="import-info">
            <p>Select a .stemplitude.json file to import</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.setupSaveLoadModalEvents(modal);
    this.loadSavedScenesList();
  }

  /**
   * Setup save/load modal event handlers
   */
  private setupSaveLoadModalEvents(modal: HTMLElement): void {
    // Tab switching
    const tabBtns = modal.querySelectorAll(".tab-btn");
    const tabContents = modal.querySelectorAll(".tab-content");

    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabName = btn.getAttribute("data-tab");

        // Update active tab
        tabBtns.forEach((b) => b.classList.remove("active"));
        tabContents.forEach((c) => c.classList.remove("active"));

        btn.classList.add("active");
        modal
          .querySelector(`[data-tab="${tabName}"].tab-content`)
          ?.classList.add("active");
      });
    });

    // Save functionality
    const saveBtn = modal.querySelector("#save-btn") as HTMLButtonElement;
    const sceneNameInput = modal.querySelector(
      "#scene-name"
    ) as HTMLInputElement;
    const sceneDescInput = modal.querySelector(
      "#scene-description"
    ) as HTMLTextAreaElement;

    saveBtn.addEventListener("click", () => {
      const sceneName = sceneNameInput.value.trim();
      if (!sceneName) {
        alert("Please enter a scene name");
        return;
      }

      const success = this.saveLoadSystem.saveToLocalStorage(sceneName, {
        description: sceneDescInput.value.trim() || undefined,
      });

      if (success) {
        this.updateInfoBar(`Scene saved: ${sceneName}`, "success");
        this.loadSavedScenesList(); // Refresh the list
        sceneNameInput.value = "";
        sceneDescInput.value = "";
      } else {
        this.updateInfoBar("Failed to save scene", "error");
      }
    });

    // Load auto-save
    const loadAutoSaveBtn = modal.querySelector(
      "#load-autosave-btn"
    ) as HTMLButtonElement;
    loadAutoSaveBtn.addEventListener("click", async () => {
      const success = await this.saveLoadSystem.loadAutoSave();
      if (success) {
        this.updateInfoBar("Auto-save loaded successfully", "success");
        modal.remove();
      } else {
        this.updateInfoBar("No auto-save found or failed to load", "error");
      }
    });

    // Export functionality
    const exportBtn = modal.querySelector("#export-btn") as HTMLButtonElement;
    const exportNameInput = modal.querySelector(
      "#export-name"
    ) as HTMLInputElement;
    const exportDescInput = modal.querySelector(
      "#export-description"
    ) as HTMLTextAreaElement;

    exportBtn.addEventListener("click", () => {
      const fileName = exportNameInput.value.trim() || "STEMplitude_Scene";

      this.saveLoadSystem.exportToFile(fileName, {
        description: exportDescInput.value.trim() || undefined,
      });

      this.updateInfoBar(`Scene exported: ${fileName}.stemplitude.json`, "success");
    });

    // Import functionality
    const importBtn = modal.querySelector("#import-btn") as HTMLButtonElement;
    const importFileInput = modal.querySelector(
      "#import-file"
    ) as HTMLInputElement;

    importBtn.addEventListener("click", async () => {
      const file = importFileInput.files?.[0];
      if (!file) {
        alert("Please select a file to import");
        return;
      }

      const success = await this.saveLoadSystem.importFromFile(file);
      if (success) {
        this.updateInfoBar(`Scene imported: ${file.name}`, "success");
        modal.remove();
      } else {
        this.updateInfoBar("Failed to import scene", "error");
      }
    });

    // Close modal on background click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  /**
   * Load and display saved scenes list
   */
  private loadSavedScenesList(): void {
    const listContainer = document.querySelector("#saved-scenes-list");
    if (!listContainer) return;

    const savedScenes = this.saveLoadSystem.getSavedScenes();
    const sceneNames = Object.keys(savedScenes);

    if (sceneNames.length === 0) {
      listContainer.innerHTML =
        '<p class="no-scenes">No saved scenes found</p>';
      return;
    }

    listContainer.innerHTML = sceneNames
      .map((sceneName) => {
        const scene = savedScenes[sceneName];
        const date = new Date(scene.timestamp).toLocaleDateString();
        const componentCount = scene.components.length;

        return `
        <div class="saved-scene-item">
          <div class="scene-info">
            <h4>${sceneName}</h4>
            <p>${scene.metadata.description || "No description"}</p>
            <small>${componentCount} components • ${date}</small>
          </div>
          <div class="scene-actions">
            <button class="load-scene-btn" data-scene="${sceneName}">Load</button>
            <button class="delete-scene-btn" data-scene="${sceneName}">Delete</button>
          </div>
        </div>
      `;
      })
      .join("");

    // Add event listeners for load/delete buttons
    listContainer.querySelectorAll(".load-scene-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const sceneName = (e.target as HTMLElement).getAttribute("data-scene")!;
        const success =
          await this.saveLoadSystem.loadFromLocalStorage(sceneName);

        if (success) {
          this.updateInfoBar(`Scene loaded: ${sceneName}`, "success");
          document.querySelector(".save-load-modal")?.remove();
        } else {
          this.updateInfoBar("Failed to load scene", "error");
        }
      });
    });

    listContainer.querySelectorAll(".delete-scene-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const sceneName = (e.target as HTMLElement).getAttribute("data-scene")!;

        if (confirm(`Delete scene "${sceneName}"?`)) {
          const success = this.saveLoadSystem.deleteFromLocalStorage(sceneName);

          if (success) {
            this.updateInfoBar(`Scene deleted: ${sceneName}`, "success");
            this.loadSavedScenesList(); // Refresh the list
          } else {
            this.updateInfoBar("Failed to delete scene", "error");
          }
        }
      });
    });
  }

  /**
   * Called when a component is placed - can be overridden by subclasses
   */
  protected onComponentPlaced(componentType: string): void {
    // Base implementation - can be overridden
    console.log(`📦 Component placed: ${componentType}`);
  }

  /**
   * Called when simulation starts - can be overridden by subclasses
   */
  protected onSimulationStarted(): void {
    // Base implementation - can be overridden
    console.log(`▶️ Simulation started`);
  }

  /**
   * Called when a connection is created - can be overridden by subclasses
   */
  protected onConnectionCreated(connectionType: string): void {
    // Base implementation - can be overridden
    console.log(`🔗 Connection created: ${connectionType}`);
  }
}
