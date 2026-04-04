import { BaseScene } from "../shared/BaseScene";
import { GridCanvas } from "./GridCanvas";
import { WireSystem } from "./WireSystem";
import { RoutingPoint } from "./OptimizedWireRouter";
import { EnhancedCircuitSolver } from "./EnhancedCircuitSolver";
import { CircuitComponent } from "./CircuitComponent";
import { Container, Graphics } from "pixi.js";
import * as PIXI from "pixi.js";
import tippy from "tippy.js";
import "tippy.js/dist/tippy.css";
import {
  InteractiveWireIntegration,
  WireEditToggle,
} from "./InteractiveWireIntegration";
import { HybridWireRouter } from "./HybridWireRouter";
import { Resistor } from "./components/Resistor";
import { Capacitor } from "./components/Capacitor";
import { Battery } from "./components/Battery";
import { ACSource } from "./components/ACSource";
import { Ground } from "./components/Ground";
import { LED } from "./components/LED";
import { Switch } from "./components/Switch";
import { SpdtSwitch } from "./components/SpdtSwitch";
import { PushButton } from "./components/PushButton";
import { Potentiometer } from "./components/Potentiometer";
import { Ammeter } from "./components/Ammeter";
import { Voltmeter } from "./components/Voltmeter";
import { Oscilloscope } from "./components/Oscilloscope";
import { Transistor } from "./components/Transistor";
import { NPNTransistor } from "./components/NPNTransistor";
import { PNPTransistor } from "./components/PNPTransistor";
import { AndGate } from "./components/AndGate";
import { OrGate } from "./components/OrGate";
import { XorGate } from "./components/XorGate";
import { NotGate } from "./components/NotGate";
import { Inductor } from "./components/Inductor";
import { Diode } from "./components/Diode";
import { ZenerDiode } from "./components/ZenerDiode";
import { NMOSTransistor } from "./components/NMOSTransistor";
import { PMOSTransistor } from "./components/PMOSTransistor";
import { OpAmp } from "./components/OpAmp";
import { Comparator } from "./components/Comparator";
import { Timer555, type Timer555Properties } from "./components/Timer555";
import { Relay } from "./components/Relay";
import { NorGate } from "./components/NorGate";
import { NandGate } from "./components/NandGate";
import { WireParticleSystem } from "./rendering/WireParticleSystem";
import { resolveComponentState } from "./state/DerivedStateResolvers";
import { EducationOverlays } from "./rendering/EducationOverlays";
import { SimulatorMode } from "./state/SimulatorMode";
import { setTransientSimulationRunning } from "./state/circuitSimulationFlags";
import {
  setComponentWireCountGetter,
  setDiscreteRcResolver,
  setSameNetChecker,
} from "./state/circuitComponentWiring";
import { resolveAstableDiscreteRcFromNetlist } from "./model/timer555DiscreteRc";

// Keep warnings/errors, silence verbose dev logs for this module.
const console = {
  ...globalThis.console,
  log: (..._args: unknown[]) => {},
};

export interface CircuitToolbarItem {
  id: string;
  name: string;
  icon: string;
  svgPath?: string; // Optional SVG asset path
  type: string;
  description: string;
  category: "passive" | "active" | "digital" | "sources" | "measurement";
}

export interface CircuitSceneSnapshotComponent {
  name: string;
  type: string;
  gridPosition: { x: number; y: number };
  orientation: number;
  properties: Record<string, unknown>;
}

export interface CircuitSceneSnapshotWire {
  id: string;
  kind: "component_to_component" | "component_to_wire";
  start: { componentId: string; nodeId: string };
  end?: { componentId: string; nodeId: string };
  targetWireId?: string;
  junctionPoint?: { x: number; y: number };
}

export interface CircuitSceneSnapshot {
  version: 1;
  components: CircuitSceneSnapshotComponent[];
  wires: CircuitSceneSnapshotWire[];
}

/**
 * Main circuit simulation scene
 */
export class CircuitScene extends BaseScene {
  private static readonly ENABLE_WIRE_FLOW_DEBUG = false;
  private gridCanvas: GridCanvas;
  private wireSystem: WireSystem;
  private circuitSolver: EnhancedCircuitSolver;
  private toolbar: HTMLElement;
  private propertiesPanel: HTMLElement;

  // Interactive wire system
  private interactiveWireIntegration: InteractiveWireIntegration;
  private _wireDisconnectHandler: ((e: any) => void) | null = null;
  private wireEditToggle: WireEditToggle;

  // Open-source wire routing
  private hybridWireRouter: HybridWireRouter;

  // Separate containers for grid and zoomable content
  private gridContainer: Container;
  public zoomableContainer: Container;

  // Interaction state
  private selectedComponent: CircuitComponent | null = null;
  private selectedComponents: Set<CircuitComponent> = new Set(); // Multi-select
  private selectedWireId: string | null = null;
  private isWireMode: boolean = false;
  private wireStartComponent: CircuitComponent | null = null;
  private wireStartNode: string | null = null;
  private isDragging: boolean = false;

  // Wire routing state
  private wireBendPreference: "horizontal-first" | "vertical-first" =
    "horizontal-first";
  private wireWaypoints: { x: number; y: number }[] = [];
  private wireStartWorldPos: { x: number; y: number } | null = null;

  // Selection highlighting
  private selectionHighlight: any = null;
  private selectionHighlights: Map<CircuitComponent, Graphics> = new Map(); // Multi-select highlights
  private nodeHighlight: Graphics | null = null;
  private wirePreview: Graphics | null = null;
  private transformControls: HTMLElement | null = null;

  // Multi-select rectangle
  private isSelectingRectangle: boolean = false;
  private selectionRectStart: { x: number; y: number } | null = null;
  private selectionRectGraphics: Graphics | null = null;

  // Drag and drop from toolbar
  private isDraggingFromToolbar: boolean = false;
  private dragPreview: HTMLElement | null = null;
  private selectedComponentType: string | null = null;

  // Component dragging on canvas
  private isDraggingComponent: boolean = false;
  private draggedComponent: CircuitComponent | null = null;
  private lastComponentPlacedTime: number = 0; // Track when last component was placed

  // Canvas panning state
  private isPanningCanvas: boolean = false;
  private panStartPosition: { x: number; y: number } = { x: 0, y: 0 };
  private cameraStartPosition: { x: number; y: number } = { x: 0, y: 0 };

  // EveryCircuit-style wire animation
  private wireGlowLayer: Container = new Container();
  private particleFlowLayer: Container = new Container();
  private overlayLayer: Container = new Container();
  private wireParticleSystem: WireParticleSystem | null = null;
  private wirePathSignatures: Map<string, string> = new Map();
  private wirePathOrientations: Map<string, 1 | -1> = new Map();
  private wireDirectionHistory: Map<string, 1 | -1 | 0> = new Map();
  private lastWireInvariantWarningMs: number = 0;
  private educationOverlays: EducationOverlays | null = null;
  private simulatorMode: SimulatorMode = new SimulatorMode();

  // Simulation state
  private isSimulationRunning: boolean = false;
  private simulationInterval: number | null = null;
  private timeStep: number = 1e-3; // 1ms time step

  // Component counter for naming
  private componentCounter: Map<string, number> = new Map();

  // Toolbar items
  private toolbarItems: CircuitToolbarItem[] = [
    // Passive components
    {
      id: "resistor",
      name: "Resistor",
      icon: "🔧",
      svgPath: "/assets/resistor.svg",
      type: "resistor",
      description: "Fixed resistor",
      category: "passive",
    },
    {
      id: "capacitor",
      name: "Capacitor",
      icon: "⚡",
      svgPath: "/assets/capacitor.svg",
      type: "capacitor",
      description: "Capacitor for energy storage",
      category: "passive",
    },
    {
      id: "inductor",
      name: "Inductor",
      icon: "🌀",
      svgPath: "/assets/inductor.svg",
      type: "inductor",
      description: "Inductor for magnetic energy storage",
      category: "passive",
    },
    // Sources
    {
      id: "battery",
      name: "Battery",
      icon: "🔋",
      svgPath: "/assets/battery.svg",
      type: "battery",
      description: "DC voltage source",
      category: "sources",
    },
    {
      id: "acsource",
      name: "AC Source",
      icon: "~",
      svgPath: "/assets/voltage-ac.svg",
      type: "acsource",
      description: "AC voltage source (sine wave)",
      category: "sources",
    },
    {
      id: "ground",
      name: "Ground",
      icon: "⏚",
      svgPath: "/assets/ground.svg",
      type: "ground",
      description: "Circuit ground reference",
      category: "sources",
    },
    // Active components
    {
      id: "led",
      name: "LED",
      icon: "💡",
      svgPath: "/assets/diode.svg",
      type: "led",
      description: "Light emitting diode",
      category: "active",
    },
    {
      id: "npn_transistor",
      name: "NPN BJT",
      icon: "🔺",
      svgPath: "/assets/npn.png",
      type: "npn_transistor",
      description: "NPN transistor (switch/amplifier)",
      category: "active",
    },
    {
      id: "pnp_transistor",
      name: "PNP BJT",
      icon: "🔻",
      svgPath: "/assets/pnp.png",
      type: "pnp_transistor",
      description: "PNP transistor (switch/amplifier)",
      category: "active",
    },
    {
      id: "switch",
      name: "Switch",
      icon: "🔘",
      svgPath: "/assets/switch.svg",
      type: "switch",
      description: "Click to open/close circuit",
      category: "active",
    },
    {
      id: "spdt_switch",
      name: "SPDT Switch",
      icon: "🔀",
      svgPath: "/assets/circuit-symbols/spdt-switch.svg",
      type: "spdt_switch",
      description: "Single-pole double-throw toggle",
      category: "active",
    },
    {
      id: "potentiometer",
      name: "Potentiometer",
      icon: "🎚️",
      svgPath: "/assets/circuit-symbols/potentiometer-iec.svg",
      type: "potentiometer",
      description: "Variable resistor (wiper)",
      category: "passive",
    },
    {
      id: "push_button",
      name: "Push Button",
      icon: "🟦",
      svgPath: "/assets/circuit-symbols/push-button-no.svg",
      type: "push_button",
      description: "Momentary button (press to close)",
      category: "active",
    },
    // Measurement tools
    {
      id: "ammeter",
      name: "Ammeter",
      icon: "Ⓐ",
      svgPath: "/assets/ammeter.svg",
      type: "ammeter",
      description: "Measures current (click to view)",
      category: "measurement",
    },
    {
      id: "voltmeter",
      name: "Voltmeter",
      icon: "Ⓥ",
      svgPath: "/assets/voltmeter.svg",
      type: "voltmeter",
      description: "Measures voltage (click to view)",
      category: "measurement",
    },
    {
      id: "oscilloscope",
      name: "Oscilloscope",
      icon: "📊",
      svgPath: "/assets/oscilloscope.svg",
      type: "oscilloscope",
      description: "View waveforms over time",
      category: "measurement",
    },
    // Digital logic
    {
      id: "and_gate",
      name: "AND Gate",
      icon: "∧",
      svgPath: "/assets/circuit-symbols/logic-and.svg",
      type: "and_gate",
      description: "Logical AND gate",
      category: "digital",
    },
    {
      id: "or_gate",
      name: "OR Gate",
      icon: "∨",
      svgPath: "/assets/circuit-symbols/logic-or.svg",
      type: "or_gate",
      description: "Logical OR gate",
      category: "digital",
    },
    {
      id: "xor_gate",
      name: "XOR Gate",
      icon: "⊕",
      svgPath: "/assets/circuit-symbols/logic-xor.svg",
      type: "xor_gate",
      description: "Logical XOR gate",
      category: "digital",
    },
    {
      id: "not_gate",
      name: "NOT Gate",
      icon: "¬",
      svgPath: "/assets/circuit-symbols/logic-not.svg",
      type: "not_gate",
      description: "Logical NOT gate",
      category: "digital",
    },
    {
      id: "nor_gate",
      name: "NOR Gate",
      icon: "⊽",
      svgPath: "/assets/circuit-symbols/logic-nor.svg",
      type: "nor_gate",
      description: "Logical NOR gate",
      category: "digital",
    },
    {
      id: "nand_gate",
      name: "NAND Gate",
      icon: "⊼",
      svgPath: "/assets/circuit-symbols/logic-nand.svg",
      type: "nand_gate",
      description: "Logical NAND gate",
      category: "digital",
    },
    {
      id: "diode",
      name: "Diode",
      icon: "▶",
      svgPath: "/assets/circuit-symbols/diode.svg",
      type: "diode",
      description: "Semiconductor diode",
      category: "active",
    },
    {
      id: "zener_diode",
      name: "Zener Diode",
      icon: "⏚▶",
      svgPath: "/assets/circuit-symbols/zener-diode.svg",
      type: "zener_diode",
      description: "Diode with reverse breakdown regulation",
      category: "active",
    },
    {
      id: "nmos_transistor",
      name: "N-MOSFET",
      icon: "Ⓝ",
      svgPath: "/assets/circuit-symbols/nmos.svg",
      type: "nmos_transistor",
      description: "N-channel MOSFET",
      category: "active",
    },
    {
      id: "pmos_transistor",
      name: "P-MOSFET",
      icon: "Ⓟ",
      svgPath: "/assets/circuit-symbols/pmos.svg",
      type: "pmos_transistor",
      description: "P-channel MOSFET",
      category: "active",
    },
    {
      id: "opamp",
      name: "Op-Amp",
      icon: "△",
      svgPath: "/assets/circuit-symbols/opamp.svg",
      type: "opamp",
      description: "Operational amplifier",
      category: "active",
    },
    {
      id: "comparator",
      name: "Comparator",
      icon: "⇌",
      svgPath: "/assets/circuit-symbols/comparator.svg",
      type: "comparator",
      description: "Voltage comparator",
      category: "active",
    },
    {
      id: "timer555",
      name: "555 Timer",
      icon: "⏱",
      svgPath: "/assets/circuit-symbols/timer-555.svg",
      type: "timer555",
      description: "555 timer IC",
      category: "active",
    },
    {
      id: "relay",
      name: "Relay",
      icon: "⚙",
      svgPath: "/assets/circuit-symbols/relay.svg",
      type: "relay",
      description: "Electromagnetic relay",
      category: "active",
    },
  ];

  constructor() {
    super();

    // Initialize grid canvas with full screen dimensions
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    this.gridCanvas = new GridCanvas(screenWidth, screenHeight, {
      size: 20,
      majorGridLines: 5,
      showGrid: true,
      snapToGrid: true,
    });

    // Initialize wire system
    this.wireSystem = new WireSystem(this.gridCanvas);

    // Initialize enhanced circuit solver with MathJS
    this.circuitSolver = new EnhancedCircuitSolver();

    // Create separate containers for grid and zoomable content
    this.gridContainer = new Container();
    this.zoomableContainer = new Container();

    // Add grid to non-zoomable container (always full screen)
    this.gridContainer.addChild(this.gridCanvas.getContainer());

    // Wire system will be added by InteractiveWireIntegration
    // this.zoomableContainer.addChild(this.wireSystem.getContainer());

    // Add both containers to scene
    this.sceneContainer.addChild(this.gridContainer);
    this.sceneContainer.addChild(this.zoomableContainer);

    // Add wire glow layer BELOW wires
    this.zoomableContainer.addChild(this.wireGlowLayer);

    // Initialize interactive wire system — adds its wire container to zoomableContainer
    this.interactiveWireIntegration = new InteractiveWireIntegration(
      this,
      this.gridCanvas,
    );
    this.wireEditToggle = new WireEditToggle(this.interactiveWireIntegration);

    // Add particle flow layer ABOVE wires so particles render on top
    this.zoomableContainer.addChild(this.particleFlowLayer);
    this.zoomableContainer.addChild(this.overlayLayer);
    this.wireParticleSystem = new WireParticleSystem(
      this.particleFlowLayer,
      this.wireGlowLayer,
    );
    this.educationOverlays = new EducationOverlays(this.overlayLayer);

    setComponentWireCountGetter((componentId: string) => {
      let count = 0;
      this.interactiveWireIntegration.getWires().forEach((wire) => {
        if (
          wire.nodes.some(
            (n) => n.type === "component" && n.componentId === componentId,
          )
        ) {
          count++;
        }
      });
      return count;
    });

    setSameNetChecker((componentId, nodeIdA, nodeIdB) =>
      this.circuitSolver.areNodesElectricallyCommon(
        componentId,
        nodeIdA,
        nodeIdB,
      ),
    );

    // Initialize hybrid wire router with open-source algorithms
    this.hybridWireRouter = new HybridWireRouter(screenWidth, screenHeight, 10);
    console.log("🚀 Initialized HybridWireRouter with open-source algorithms");
  }

  public override onSceneActivated(): void {
    super.onSceneActivated();

    // Ensure scene container starts at scale 1,1
    this.sceneContainer.scale.set(1, 1);

    // Initialize camera at center (0,0)
    this.zoomableContainer.x = 0;
    this.zoomableContainer.y = 0;

    this.createToolbar();
    this.createPropertiesPanel();
    this.createDragPreview();
    this.setupEventListeners();
    this.setupDragAndDrop();

    // Create zoom controls
    this.createZoomControls();

    // Create floating delete button
    this.createTrashBin();

    // Setup canvas panning
    this.setupCanvasPanning();

    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Global wire disconnect listener (once, not per-component)
    this._wireDisconnectHandler = (e: any) => {
      const { a, b } = e.detail || {};
      if (a && b) {
        this.circuitSolver.disconnectNodes(
          a.componentId,
          a.nodeId,
          b.componentId,
          b.nodeId,
        );
      }
    };
    (window as any).addEventListener?.(
      "wire:disconnected",
      this._wireDisconnectHandler,
    );

    // Setup window resize handler
    this.setupResizeHandler();

    // Force initial render
    this.forceGridRender();

    // Ensure scene container starts at scale 1,1
    this.sceneContainer.scale.set(1, 1);

    // Override GameManager's wheel zoom with our custom implementation
    this.overrideWheelZoom();

    console.log("🔌 Circuit simulation scene activated");
  }

  /**
   * Override zoom methods to only zoom the zoomable container, not the grid
   * Also prevent GameManager from interfering with our custom zoom
   */
  protected override zoomIn(): void {
    // Prevent GameManager zoom by resetting scene container scale
    if (this.sceneContainer) {
      this.sceneContainer.scale.set(1, 1);
    }

    const currentScale = this.zoomableContainer.scale.x;
    const newScale = Math.min(currentScale * 1.2, 1.5); // Max 150%
    this.zoomableContainer.scale.set(newScale);

    // Update grid scale reference
    this.updateGridScale(newScale);

    console.log(`🔍 Zoomed in - Level: ${(newScale * 100).toFixed(0)}%`);

    // Update transform controls position if a component is selected (after render)
    if (this.selectedComponent) {
      requestAnimationFrame(() => {
        this.updateTransformControlsPosition();
      });
    }
  }

  protected override zoomOut(): void {
    // Prevent GameManager zoom by resetting scene container scale
    if (this.sceneContainer) {
      this.sceneContainer.scale.set(1, 1);
    }

    const currentScale = this.zoomableContainer.scale.x;
    const newScale = Math.max(currentScale * 0.8, 0.5); // Min 50%
    this.zoomableContainer.scale.set(newScale);

    // Update grid scale reference
    this.updateGridScale(newScale);

    console.log(`🔍 Zoomed out - Level: ${(newScale * 100).toFixed(0)}%`);

    // Update transform controls position if a component is selected (after render)
    if (this.selectedComponent) {
      requestAnimationFrame(() => {
        this.updateTransformControlsPosition();
      });
    }
  }

  protected override zoomInToPoint(screenX: number, screenY: number): void {
    // Prevent GameManager zoom by resetting scene container scale
    if (this.sceneContainer) {
      this.sceneContainer.scale.set(1, 1);
    }

    const oldScale = this.zoomableContainer.scale.x;
    const newScale = Math.min(oldScale * 1.1, 1.5); // Max 150%

    if (newScale !== oldScale) {
      // Convert screen coordinates to world coordinates before zoom
      const worldX = (screenX - this.zoomableContainer.x) / oldScale;
      const worldY = (screenY - this.zoomableContainer.y) / oldScale;

      // Apply new zoom
      this.zoomableContainer.scale.set(newScale);

      // Update grid scale reference
      this.updateGridScale(newScale);

      // Adjust position to keep the point under the cursor
      this.zoomableContainer.x = screenX - worldX * newScale;
      this.zoomableContainer.y = screenY - worldY * newScale;

      // Update grid coordinate labels to reflect new camera position
      this.updateGridCoordinateLabels();

      // Update transform controls position if a component is selected (after render)
      if (this.selectedComponent) {
        requestAnimationFrame(() => {
          this.updateTransformControlsPosition();
        });
      }
    }
  }

  protected override zoomOutFromPoint(screenX: number, screenY: number): void {
    // Prevent GameManager zoom by resetting scene container scale
    if (this.sceneContainer) {
      this.sceneContainer.scale.set(1, 1);
    }

    const oldScale = this.zoomableContainer.scale.x;
    const newScale = Math.max(oldScale * 0.9, 0.5); // Min 50%

    if (newScale !== oldScale) {
      // Convert screen coordinates to world coordinates before zoom
      const worldX = (screenX - this.zoomableContainer.x) / oldScale;
      const worldY = (screenY - this.zoomableContainer.y) / oldScale;

      // Apply new zoom
      this.zoomableContainer.scale.set(newScale);

      // Update grid scale reference
      this.updateGridScale(newScale);

      // Adjust position to keep the point under the cursor
      this.zoomableContainer.x = screenX - worldX * newScale;
      this.zoomableContainer.y = screenY - worldY * newScale;

      // Update grid coordinate labels to reflect new camera position
      this.updateGridCoordinateLabels();

      // Update transform controls position if a component is selected (after render)
      if (this.selectedComponent) {
        requestAnimationFrame(() => {
          this.updateTransformControlsPosition();
        });
      }
    }
  }

  protected override recenterCamera(): void {
    // Prevent GameManager interference
    if (this.sceneContainer) {
      this.sceneContainer.scale.set(1, 1);
    }

    // Center the zoomable container at (0,0) world coordinates
    // This means the container should be at screen center with no offset
    this.zoomableContainer.x = 0;
    this.zoomableContainer.y = 0;

    // Update grid coordinate labels to reflect new camera position
    this.updateGridCoordinateLabels();

    console.log("🎯 Camera recentered to (0,0)");
  }

  protected override panCamera(deltaX: number, deltaY: number): void {
    // Pan only the zoomable container, keep grid fixed
    this.zoomableContainer.x += deltaX;
    this.zoomableContainer.y += deltaY;

    // Update grid coordinate labels to reflect new camera position
    this.updateGridCoordinateLabels();

    // Update transform controls position during pan (immediate, no RAF needed)
    this.updateTransformControlsPosition();
  }

  protected override getZoomLevel(): number {
    return this.zoomableContainer.scale.x;
  }

  protected override getCameraPosition(): { x: number; y: number } {
    return { x: this.zoomableContainer.x, y: this.zoomableContainer.y };
  }

  /**
   * Update grid coordinate labels based on current camera position
   */
  private updateGridCoordinateLabels(): void {
    // Get camera offset from zoomable container position
    const cameraOffsetX = this.zoomableContainer.x;
    const cameraOffsetY = this.zoomableContainer.y;

    // Update grid coordinate labels
    this.gridCanvas.updateCoordinateLabels(cameraOffsetX, cameraOffsetY);

    console.log(
      `📍 Grid coordinates updated - Camera offset: (${cameraOffsetX.toFixed(0)}, ${cameraOffsetY.toFixed(0)})`,
    );
  }

  /**
   * Update grid scale reference based on zoom level
   */
  private updateGridScale(zoomLevel: number): void {
    // Calculate the effective grid unit size based on zoom
    // At 100% zoom: 1 grid unit = 20px = 1 unit
    // At 150% zoom: 1 grid unit = 20px = 0.67 units (smaller units, more precision)
    // At 50% zoom: 1 grid unit = 20px = 2 units (larger units, less precision)

    const baseGridSize = 20; // pixels per grid unit
    const effectiveUnitSize = 1 / zoomLevel; // Inverse relationship

    // Recreate grid with new scale reference
    this.recreateGridWithScale(effectiveUnitSize);

    console.log(
      `📏 Grid scale updated - 1 grid square = ${effectiveUnitSize.toFixed(2)} units`,
    );
  }

  /**
   * Recreate grid canvas with new measurement scale
   */
  private recreateGridWithScale(unitSize: number): void {
    // Remove old grid
    this.gridContainer.removeChild(this.gridCanvas.getContainer());
    this.gridCanvas.destroy();

    // Create new grid with updated scale
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    this.gridCanvas = new GridCanvas(screenWidth, screenHeight, {
      size: 20, // Visual size stays the same
      majorGridLines: 5,
      showGrid: true,
      snapToGrid: true,
      // Pass the unit size for labeling
      unitSize: unitSize,
    });

    // Add back to grid container
    this.gridContainer.addChild(this.gridCanvas.getContainer());

    // Update wire system reference
    this.wireSystem.updateGridReference(this.gridCanvas);

    // Update coordinate labels with current camera position
    this.updateGridCoordinateLabels();
  }

  /**
   * Override GameManager's wheel zoom with our custom implementation
   */
  private overrideWheelZoom(): void {
    const canvas = this.app.canvas;

    // Add our wheel event listener with high priority
    const wheelHandler = (event: WheelEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation(); // Stop all other wheel handlers

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      if (event.deltaY < 0) {
        this.zoomInToPoint(x, y);
      } else {
        this.zoomOutFromPoint(x, y);
      }
    };

    // Remove existing wheel listeners and add ours first
    canvas.addEventListener("wheel", wheelHandler, {
      capture: true,
      passive: false,
    });

    // Store reference for cleanup
    (this as any).wheelHandler = wheelHandler;

    console.log("🔒 Wheel zoom overridden for CircuitScene");
  }

  protected override onSceneDeactivated(): void {
    super.onSceneDeactivated();

    this.stopSimulation();
    this.cleanupUI();

    console.log("🔌 Circuit simulation scene deactivated");
  }

  /**
   * Create the circuit component toolbar
   */
  private createToolbar(): void {
    this.toolbar = document.createElement("div");
    this.toolbar.id = "circuit-toolbar";
    this.toolbar.className = "circuit-toolbar";

    // Group components by category
    const categories = [
      "sources",
      "passive",
      "active",
      "measurement",
      "digital",
    ];

    categories.forEach((category) => {
      const categoryItems = this.toolbarItems.filter(
        (item) => item.category === category,
      );
      if (categoryItems.length === 0) return;

      // Create category header
      const categoryHeader = document.createElement("div");
      categoryHeader.className = `toolbar-category-header toolbar-header-${category}`;

      // Add SVG icons for each category
      const categorySvgs: { [key: string]: string } = {
        sources: "/assets/toolbar/source.svg",
        passive: "/assets/toolbar/passive.svg",
        active: "/assets/toolbar/active.svg",
        measurement: "/assets/toolbar/measurement.svg",
        digital: "/assets/toolbar/logic.svg",
      };

      const svgPath = categorySvgs[category];
      const categoryName = category.charAt(0).toUpperCase() + category.slice(1);

      if (svgPath) {
        categoryHeader.innerHTML = `
          <img src="${svgPath}" alt="${categoryName}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px; filter: brightness(0) saturate(100%) invert(100%);" />
          ${categoryName}
        `;
      } else {
        categoryHeader.textContent = categoryName;
      }

      this.toolbar.appendChild(categoryHeader);

      // Create category container
      const categoryContainer = document.createElement("div");
      categoryContainer.className = "toolbar-category";

      categoryItems.forEach((item) => {
        const button = this.createToolbarButton(item);
        categoryContainer.appendChild(button);
      });

      this.toolbar.appendChild(categoryContainer);
    });

    // Simulation controls are now in the navbar
    // this.createSimulationControls();

    document.body.appendChild(this.toolbar);
  }

  /**
   * Create drag preview element for toolbar drag and drop
   */
  private createDragPreview(): void {
    this.dragPreview = document.createElement("div");
    this.dragPreview.id = "circuit-drag-preview";
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
      backdrop-filter: blur(5px);
    `;
    document.body.appendChild(this.dragPreview);
  }

  /**
   * Show drag preview with component icon
   */
  private showDragPreview(item: CircuitToolbarItem): void {
    if (!this.dragPreview) return;

    // Use SVG if available, otherwise use emoji
    if (item.svgPath) {
      this.dragPreview.innerHTML = `
        <img src="${item.svgPath}" alt="${item.name}" 
             style="width: 32px; height: 32px; filter: brightness(0) saturate(100%) invert(52%) sepia(95%) saturate(1234%) hue-rotate(175deg) brightness(95%) contrast(88%);" />
      `;
    } else {
      this.dragPreview.innerHTML = `
        <div style="font-size: 24px; color: #3498db;">
          ${item.icon}
        </div>
      `;
    }
    this.dragPreview.style.display = "flex";
  }

  /**
   * Update drag preview position
   */
  private updateDragPreview(x: number, y: number): void {
    if (!this.dragPreview) return;

    this.dragPreview.style.left = `${x - 32}px`;
    this.dragPreview.style.top = `${y - 32}px`;
  }

  /**
   * Hide drag preview
   */
  private hideDragPreview(): void {
    if (!this.dragPreview) return;
    this.dragPreview.style.display = "none";
  }

  /**
   * Add Tippy tooltip to an element
   */
  private addTooltip(element: HTMLElement, text: string): void {
    // Use Tippy.js for reliable tooltips
    tippy(element, {
      content: text,
      theme: "custom",
      placement: "bottom",
      arrow: true,
      animation: "fade",
      duration: [200, 150],
      delay: [500, 0],
      maxWidth: 250,
    });

  }

  /**
   * Setup drag and drop functionality for toolbar components
   */
  private setupDragAndDrop(): void {
    let draggedItemId = "";

    const onMouseMove = (e: MouseEvent) => {
      if (!this.app?.renderer) return;
      if (this.isDraggingFromToolbar) {
        e.preventDefault();
        this.updateDragPreview(e.clientX, e.clientY);
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!this.app?.renderer) return;
      if (this.isDraggingFromToolbar) {
        e.preventDefault();

        const toolbarElement = this.toolbar;
        const toolbarRect = toolbarElement.getBoundingClientRect();
        const isOverToolbar =
          e.clientX >= toolbarRect.left &&
          e.clientX <= toolbarRect.right &&
          e.clientY >= toolbarRect.top &&
          e.clientY <= toolbarRect.bottom;

        if (!isOverToolbar) {
          const worldPosition = this.screenToWorldCoordinates(
            e.clientX,
            e.clientY,
          );
          this.handleDrop(draggedItemId, worldPosition);
        }

        this.isDraggingFromToolbar = false;
        this.isDragging = false;
        this.hideDragPreview();
        draggedItemId = "";
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    (this as any)._dragMoveHandler = onMouseMove;
    (this as any)._dragUpHandler = onMouseUp;

    // Store reference for toolbar button mousedown events
    (this as any).startToolbarDrag = (itemId: string, event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      this.isDraggingFromToolbar = true;
      this.isDragging = true;
      draggedItemId = itemId;

      // Find the toolbar item
      const item = this.toolbarItems.find((item) => item.id === itemId);
      if (item) {
        this.showDragPreview(item);
        this.updateDragPreview(event.clientX, event.clientY);
      }

    };
  }

  /**
   * Convert screen coordinates to world coordinates
   */
  private screenToWorldCoordinates(
    screenX: number,
    screenY: number,
  ): { x: number; y: number } {
    try {
      const rect = this.app.canvas.getBoundingClientRect();
      const canvasX = screenX - rect.left;
      const canvasY = screenY - rect.top;

      const containerScale = this.zoomableContainer.scale.x;
      const worldX = (canvasX - this.zoomableContainer.x) / containerScale;
      const worldY = (canvasY - this.zoomableContainer.y) / containerScale;

      return { x: worldX, y: worldY };
    } catch {
      return { x: screenX, y: screenY };
    }
  }

  /**
   * Handle component drop on canvas
   */
  private handleDrop(itemId: string, position: { x: number; y: number }): void {
    const item = this.toolbarItems.find((item) => item.id === itemId);
    if (!item) return;

    // Place component at drop position
    this.placeComponentAt(item.type, position.x, position.y);
    console.log(
      `🎯 Dropped ${item.name} at (${position.x.toFixed(1)}, ${position.y.toFixed(1)})`,
    );
  }

  /**
   * Place a component at specific coordinates
   */
  private placeComponentAt(componentType: string, x: number, y: number): void {
    const component = this.createComponent(componentType, x, y);
    if (component) {
      this.gameObjects.set(component.getName(), component);
      this.zoomableContainer.addChild(component.displayObject());

      // Register with wire system and circuit solver
      this.wireSystem.registerComponent(component);
      this.circuitSolver.addComponent(component);

      // Register with interactive wire system
      this.interactiveWireIntegration.addComponent(component);

      // Register with hybrid wire router (open-source algorithms)
      this.registerComponentWithRouter(component);

      // Listen for position changes to update wires
      component.on("positionChanged", (comp) => {
        this.interactiveWireIntegration.updateWirePositions(comp.getName());
      });

      // Add interaction handlers for dragging
      this.addComponentInteractionHandlers(component);

      // Update properties panel
      this.updatePropertiesPanel(component);

      // Record placement time to prevent immediate panning
      this.lastComponentPlacedTime = Date.now();

      console.log(
        `✅ Placed ${componentType} at (${x.toFixed(1)}, ${y.toFixed(1)})`,
      );
    }
  }

  /**
   * Create a component instance at the specified coordinates
   */
  private createComponent(
    type: string,
    x: number,
    y: number,
  ): CircuitComponent | null {
    // Snap to grid
    const gridPos = this.gridCanvas.snapToGrid(x, y);
    const gridCoords = this.gridCanvas.worldToGrid(gridPos.x, gridPos.y);

    // Generate component name
    const count = (this.componentCounter.get(type) || 0) + 1;
    this.componentCounter.set(type, count);
    const name = `${type.toUpperCase()}${count}`;

    // Create component based on type
    let component: CircuitComponent | null = null;

    switch (type) {
      case "resistor":
        component = new Resistor(
          name,
          1000,
          0.25,
          5,
          gridCoords.x,
          gridCoords.y,
        );
        break;
      case "capacitor":
        component = new Capacitor(name, 100e-6, 25, gridCoords.x, gridCoords.y);
        break;
      case "inductor":
        component = new Inductor(name, 100e-3, 1.0, gridCoords.x, gridCoords.y);
        break;
      case "battery":
        component = new Battery(name, 9, 0.5, gridCoords.x, gridCoords.y);
        break;
      case "acsource":
        component = new ACSource(name, 10, 60, 0, gridCoords.x, gridCoords.y);
        break;
      case "ground":
        component = new Ground(name, "earth", gridCoords.x, gridCoords.y);
        break;
      case "led":
        component = new LED(name, "red", gridCoords.x, gridCoords.y);
        break;
      case "transistor":
        component = new Transistor(
          name,
          "NPN",
          100,
          gridCoords.x,
          gridCoords.y,
        );
        break;
      case "npn_transistor":
        component = new NPNTransistor(name, 100, gridCoords.x, gridCoords.y);
        break;
      case "pnp_transistor":
        component = new PNPTransistor(name, 100, gridCoords.x, gridCoords.y);
        break;
      case "switch":
        component = new Switch(name, false, gridCoords.x, gridCoords.y); // Default to OPEN (false)
        break;
      case "spdt_switch":
        component = new SpdtSwitch(name, gridCoords.x, gridCoords.y);
        break;
      case "potentiometer":
        component = new Potentiometer(name, 10000, gridCoords.x, gridCoords.y);
        break;
      case "push_button":
        component = new PushButton(name, false, gridCoords.x, gridCoords.y); // Normally-open by default
        break;
      case "ammeter":
        component = new Ammeter(name, gridCoords.x, gridCoords.y);
        break;
      case "voltmeter":
        component = new Voltmeter(name, gridCoords.x, gridCoords.y);
        break;
      case "oscilloscope":
        component = new Oscilloscope(name, gridCoords.x, gridCoords.y);
        break;
      case "and_gate":
        component = new AndGate(name, gridCoords.x, gridCoords.y);
        break;
      case "or_gate":
        component = new OrGate(name, gridCoords.x, gridCoords.y);
        break;
      case "xor_gate":
        component = new XorGate(name, gridCoords.x, gridCoords.y);
        break;
      case "not_gate":
        component = new NotGate(name, gridCoords.x, gridCoords.y);
        break;
      case "diode":
        component = new Diode(name, 0.7, gridCoords.x, gridCoords.y);
        break;
      case "zener_diode":
        component = new ZenerDiode(name, 5.1, gridCoords.x, gridCoords.y);
        break;
      case "nmos_transistor":
        component = new NMOSTransistor(name, 2, gridCoords.x, gridCoords.y);
        break;
      case "pmos_transistor":
        component = new PMOSTransistor(name, -2, gridCoords.x, gridCoords.y);
        break;
      case "opamp":
        component = new OpAmp(name, gridCoords.x, gridCoords.y);
        break;
      case "comparator":
        component = new Comparator(name, gridCoords.x, gridCoords.y);
        break;
      case "timer555":
        component = new Timer555(name, gridCoords.x, gridCoords.y);
        break;
      case "relay":
        component = new Relay(name, gridCoords.x, gridCoords.y);
        break;
      case "nor_gate":
        component = new NorGate(name, gridCoords.x, gridCoords.y);
        break;
      case "nand_gate":
        component = new NandGate(name, gridCoords.x, gridCoords.y);
        break;
      default:
        console.warn(`Component type ${type} not implemented yet`);
        return null;
    }

    return component;
  }

  /**
   * Select a component and show its properties
   */
  private selectComponent(component: CircuitComponent | null): void {
    // Deselect previous component
    if (this.selectedComponent) {
      this.clearSelectionHighlight();
    }

    // Clear any wire selection when selecting a component
    if (component && this.selectedWireId) {
      this.deselectWire();
    }

    this.selectedComponent = component;

    if (component) {
      // Create selection highlight
      this.createSelectionHighlight(component);

      // Update properties panel
      this.updatePropertiesPanel(component);

      console.log(`🎯 Selected component: ${component.getName()}`);
    } else {
      // Hide properties panel when nothing is selected
      this.hidePropertiesPanel();
      console.log("🎯 Deselected all components");
    }

    // Update trash bin visibility
    this.updateTrashBinVisibility();
  }

  /**
   * Select a wire and highlight it
   */
  private selectWire(wireId: string): void {
    // Clear component selection
    this.selectComponent(null);
    this.selectedWireId = wireId;

    // Use the wire system's built-in selection
    const wireSystem = this.interactiveWireIntegration.getWireSystem();
    const wire = wireSystem.getWires().get(wireId);
    if (wire) {
      wire.isSelected = true;
      wireSystem.selectWireAtPoint(
        wire.segments[0]?.start.x ?? 0,
        wire.segments[0]?.start.y ?? 0,
      );
    }

    this.updateTrashBinVisibility();
    console.log(`🎯 Selected wire: ${wireId}`);
  }

  /**
   * Deselect the currently selected wire
   */
  private deselectWire(): void {
    if (!this.selectedWireId) return;

    const wireSystem = this.interactiveWireIntegration.getWireSystem();
    const wire = wireSystem.getWires().get(this.selectedWireId);
    if (wire) {
      wire.isSelected = false;
    }

    this.selectedWireId = null;
    this.updateTrashBinVisibility();
  }

  /**
   * Delete the currently selected wire and disconnect its components
   */
  private deleteSelectedWire(): void {
    if (!this.selectedWireId) return;

    const wireId = this.selectedWireId;
    this.selectedWireId = null;

    // removeWire handles: graphics cleanup, node cleanup, and dispatching wire:disconnected event
    this.interactiveWireIntegration.removeWire(wireId);

    this.updateTrashBinVisibility();
    console.log(`🗑️ Deleted wire: ${wireId}`);
  }

  /**
   * Create visual highlight for selected component
   */
  private createSelectionHighlight(component: CircuitComponent): void {
    this.clearSelectionHighlight();

    // Store reference to selected component for transform controls updates
    this.selectedComponent = component;

    const displayObject = component.displayObject();

    // Get local bounds for sizing
    const localBounds = displayObject.getLocalBounds();

    // Create highlight graphics
    this.selectionHighlight = new Graphics();

    // Draw selection rectangle with glow effect
    const padding = 8;
    const x = localBounds.x - padding;
    const y = localBounds.y - padding;
    const width = localBounds.width + padding * 2;
    const height = localBounds.height + padding * 2;

    // Outer glow
    this.selectionHighlight.rect(x - 2, y - 2, width + 4, height + 4);
    this.selectionHighlight.fill({ color: 0x3498db, alpha: 0.2 });

    // Main selection border
    this.selectionHighlight.rect(x, y, width, height);
    this.selectionHighlight.stroke({
      width: 2,
      color: 0x3498db,
      alpha: 0.8,
    });

    // Corner indicators
    const cornerSize = 6;
    const corners = [
      { x: x, y: y }, // Top-left
      { x: x + width - cornerSize, y: y }, // Top-right
      { x: x, y: y + height - cornerSize }, // Bottom-left
      { x: x + width - cornerSize, y: y + height - cornerSize }, // Bottom-right
    ];

    corners.forEach((corner) => {
      this.selectionHighlight.rect(corner.x, corner.y, cornerSize, cornerSize);
      this.selectionHighlight.fill({ color: 0x3498db, alpha: 0.9 });
    });

    // Position the highlight at the component's world position
    this.selectionHighlight.position.set(displayObject.x, displayObject.y);

    // Add to zoomable container
    this.zoomableContainer.addChild(this.selectionHighlight);

    // Create transform controls
    this.createTransformControls(component);
  }

  /**
   * Create flip/rotate control buttons above selected component
   */
  private createTransformControls(component: CircuitComponent): void {
    this.clearTransformControls();

    const canvas = this.app.canvas;
    const rect = canvas.getBoundingClientRect();
    const displayObject = component.displayObject();

    // Use PixiJS's toGlobal to get screen coordinates (handles all transformations)
    const globalPos = displayObject.toGlobal({ x: 0, y: 0 });

    // Convert to screen coordinates
    const screenX = rect.left + globalPos.x;
    const screenY = rect.top + globalPos.y;

    // Create controls container
    this.transformControls = document.createElement("div");
    this.transformControls.style.cssText = `
      position: fixed;
      left: ${screenX}px;
      top: ${screenY - 65}px;
      transform: translateX(-50%);
      display: flex;
      gap: 3px;
      z-index: 9999;
      pointer-events: all;
    `;

    // Flip horizontal button
    const flipBtn = document.createElement("button");
    flipBtn.innerHTML = `<img src="/assets/flip-horizontal.svg" alt="Flip" style="width: 12px; height: 12px; display: block;" />`;
    flipBtn.style.cssText = `
      background: linear-gradient(135deg, #3498db, #2980b9);
      border: 1.5px solid #ecf0f1;
      border-radius: 5px;
      padding: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      transition: all 0.2s ease;
    `;
    flipBtn.onmouseover = () => {
      flipBtn.style.transform = "scale(1.15)";
      flipBtn.style.boxShadow = "0 2px 8px rgba(52, 152, 219, 0.5)";
    };
    flipBtn.onmouseout = () => {
      flipBtn.style.transform = "scale(1)";
      flipBtn.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.3)";
    };
    flipBtn.onclick = () => {
      this.flipComponent(component);
    };

    // Add Tippy tooltip to flip button (upwards)
    tippy(flipBtn, {
      content: "Flip Horizontal",
      theme: "custom",
      placement: "top",
      arrow: true,
      animation: "fade",
      duration: [200, 150],
      delay: [300, 0],
    });

    // Rotate clockwise button
    const rotateBtn = document.createElement("button");
    rotateBtn.innerHTML = `<img src="/assets/rotating-clockwise.svg" alt="Rotate" style="width: 12px; height: 12px; display: block;" />`;
    rotateBtn.style.cssText = `
      background: linear-gradient(135deg, #9b59b6, #8e44ad);
      border: 1.5px solid #ecf0f1;
      border-radius: 5px;
      padding: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      transition: all 0.2s ease;
    `;
    rotateBtn.onmouseover = () => {
      rotateBtn.style.transform = "scale(1.15) rotate(90deg)";
      rotateBtn.style.boxShadow = "0 2px 8px rgba(155, 89, 182, 0.5)";
    };
    rotateBtn.onmouseout = () => {
      rotateBtn.style.transform = "scale(1)";
      rotateBtn.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.3)";
    };
    rotateBtn.onclick = () => {
      this.rotateComponent(component);
    };

    // Add Tippy tooltip to rotate button (upwards)
    tippy(rotateBtn, {
      content: "Rotate Clockwise",
      theme: "custom",
      placement: "top",
      arrow: true,
      animation: "fade",
      duration: [200, 150],
      delay: [300, 0],
    });

    // Rotate counter-clockwise button
    const rotateCCWBtn = document.createElement("button");
    rotateCCWBtn.innerHTML = `<img src="/assets/rotating-counter-clockwise.svg" alt="Rotate CCW" style="width: 12px; height: 12px; display: block;" />`;
    rotateCCWBtn.style.cssText = `
      background: linear-gradient(135deg, #e67e22, #d35400);
      border: 1.5px solid #ecf0f1;
      border-radius: 5px;
      padding: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      transition: all 0.2s ease;
    `;
    rotateCCWBtn.onmouseover = () => {
      rotateCCWBtn.style.transform = "scale(1.15) rotate(-90deg)";
      rotateCCWBtn.style.boxShadow = "0 2px 8px rgba(230, 126, 34, 0.5)";
    };
    rotateCCWBtn.onmouseout = () => {
      rotateCCWBtn.style.transform = "scale(1)";
      rotateCCWBtn.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.3)";
    };
    rotateCCWBtn.onclick = () => {
      this.rotateComponentCounterClockwise(component);
    };

    // Add Tippy tooltip to counter-clockwise rotate button (upwards)
    tippy(rotateCCWBtn, {
      content: "Rotate Counter-Clockwise",
      theme: "custom",
      placement: "top",
      arrow: true,
      animation: "fade",
      duration: [200, 150],
      delay: [300, 0],
    });

    this.transformControls.appendChild(flipBtn);
    this.transformControls.appendChild(rotateBtn);
    this.transformControls.appendChild(rotateCCWBtn);
    document.body.appendChild(this.transformControls);
  }

  /**
   * Update transform controls position (called during zoom/pan)
   */
  private updateTransformControlsPosition(): void {
    if (!this.transformControls || !this.selectedComponent) {
      return;
    }

    const canvas = this.app.canvas;
    const rect = canvas.getBoundingClientRect();
    const displayObject = this.selectedComponent.displayObject();

    // Use PixiJS's toGlobal to get screen coordinates (handles all transformations)
    const globalPos = displayObject.toGlobal({ x: 0, y: 0 });

    // Convert to screen coordinates
    const screenX = rect.left + globalPos.x;
    const screenY = rect.top + globalPos.y;

    // Update position
    this.transformControls.style.left = `${screenX}px`;
    this.transformControls.style.top = `${screenY - 65}px`;
  }

  /**
   * Clear transform control buttons
   */
  private clearTransformControls(): void {
    if (this.transformControls) {
      this.transformControls.remove();
      this.transformControls = null;
    }
  }

  /**
   * Flip component horizontally
   */
  private flipComponent(component: CircuitComponent): void {
    component.flipHorizontal();

    // Update all connected wires to reflect new node positions
    this.updateConnectedWires(component);

    // Refresh selection highlight and controls
    this.createSelectionHighlight(component);

    console.log(`🔄 Flipped component: ${component.getName()}`);
  }

  /**
   * Rotate component clockwise by 90 degrees
   */
  private rotateComponent(component: CircuitComponent): void {
    component.rotateClockwise();

    // Update all connected wires to reflect new node positions
    this.updateConnectedWires(component);

    // Refresh selection highlight and controls
    this.createSelectionHighlight(component);

    console.log(
      `🔄 Rotated component clockwise: ${component.getName()} to ${component.getOrientation()}°`,
    );
  }

  /**
   * Rotate component counter-clockwise by 90 degrees
   */
  private rotateComponentCounterClockwise(component: CircuitComponent): void {
    component.rotateCounterClockwise();

    // Update all connected wires to reflect new node positions
    this.updateConnectedWires(component);

    // Refresh selection highlight and controls
    this.createSelectionHighlight(component);

    console.log(
      `🔄 Rotated component counter-clockwise: ${component.getName()} to ${component.getOrientation()}°`,
    );
  }

  /**
   * Update all wires connected to a component after transformation
   */
  private updateConnectedWires(component: CircuitComponent): void {
    const componentName = component.getName();
    const nodes = component.getNodes();

    // Get all wires from the wire system
    const allWires = this.wireSystem.getAllWires();

    // Debug logging removed to prevent spam

    // Count wires updated
    let wiresUpdated = 0;

    // Find and update wires connected to this component
    nodes.forEach((node) => {
      const connectedWires = allWires.filter(
        (wire: any) =>
          (wire.startComponent === componentName &&
            wire.startNode === node.id) ||
          (wire.endComponent === componentName && wire.endNode === node.id),
      );

      console.log(
        `  Node ${node.id}: found ${connectedWires.length} connected wires`,
      );

      // Redraw each connected wire
      connectedWires.forEach((wire: any) => {
        console.log(`    Updating wire ${wire.id}`);
        if (this.wireSystem.updateWire(wire.id)) {
          wiresUpdated++;
        }
      });
    });

    // Debug logging removed to prevent spam
  }

  /**
   * Clear selection highlight
   */
  private clearSelectionHighlight(): void {
    if (this.selectionHighlight) {
      if (this.selectionHighlight.parent) {
        this.selectionHighlight.parent.removeChild(this.selectionHighlight);
      }
      this.selectionHighlight.destroy();
      this.selectionHighlight = null;
    }
    this.clearTransformControls();
  }

  /**
   * Clear all multi-select highlights
   */
  private clearMultiSelectHighlights(): void {
    this.selectionHighlights.forEach((highlight) => {
      if (highlight.parent) {
        highlight.parent.removeChild(highlight);
      }
      highlight.destroy();
    });
    this.selectionHighlights.clear();
  }

  /**
   * Select all components within a rectangular area
   */
  private selectComponentsInRect(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): void {
    // Clear previous selection
    this.clearSelectionHighlight();
    this.clearMultiSelectHighlights();
    this.selectedComponent = null;
    this.selectedComponents.clear();

    // Find all components within bounds
    this.gameObjects.forEach((gameObject) => {
      if (gameObject instanceof CircuitComponent) {
        const pos = gameObject.getPosition();
        if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
          this.selectedComponents.add(gameObject);
          this.createMultiSelectHighlight(gameObject);
        }
      }
    });

    // Don't show properties panel for multi-select
    this.hidePropertiesPanel();

    // Update trash bin visibility
    this.updateTrashBinVisibility();
  }

  /**
   * Create highlight for a component in multi-select
   */
  private createMultiSelectHighlight(component: CircuitComponent): void {
    const displayObject = component.displayObject();
    const localBounds = displayObject.getLocalBounds();

    // Create highlight graphics
    const highlight = new Graphics();

    // Draw selection rectangle
    const padding = 8;
    const x = localBounds.x - padding;
    const y = localBounds.y - padding;
    const width = localBounds.width + padding * 2;
    const height = localBounds.height + padding * 2;

    // Outer glow
    highlight.rect(x - 2, y - 2, width + 4, height + 4);
    highlight.fill({ color: 0x3498db, alpha: 0.15 });

    // Main selection border
    highlight.rect(x, y, width, height);
    highlight.stroke({
      width: 2,
      color: 0x3498db,
      alpha: 0.6,
    });

    // Position the highlight at the component's world position
    highlight.position.set(displayObject.x, displayObject.y);

    // Add to zoomable container
    this.zoomableContainer.addChild(highlight);

    // Store highlight
    this.selectionHighlights.set(component, highlight);
  }

  /**
   * Delete all selected components (with confirmation)
   */
  private async deleteSelectedComponents(): Promise<void> {
    if (this.selectedComponents.size > 0) {
      // Show confirmation for multi-select
      await this.showMultiDeleteConfirmationDialog();
    } else if (this.selectedComponent) {
      // Show confirmation for single component
      await this.showDeleteConfirmationDialog(this.selectedComponent);
    }
  }

  /**
   * Delete all selected components (without confirmation, used after confirmation dialog)
   */
  private deleteSelectedComponentsWithoutConfirmation(): void {
    if (this.selectedComponents.size > 0) {
      console.log(
        `🗑️ Deleting ${this.selectedComponents.size} selected components`,
      );

      // Delete each selected component
      this.selectedComponents.forEach((component) => {
        this.deleteComponent(component);
      });

      // Clear selection
      this.clearMultiSelectHighlights();
      this.selectedComponents.clear();
      this.hidePropertiesPanel();
      this.updateTrashBinVisibility();
    }
  }

  /**
   * Hide properties panel
   */
  private hidePropertiesPanel(): void {
    if (this.propertiesPanel) {
      this.propertiesPanel.classList.add("hidden");
    }
  }

  /**
   * Create a toolbar button for a component
   */
  private createToolbarButton(item: CircuitToolbarItem): HTMLElement {
    const button = document.createElement("div");
    button.className = "toolbar-item";
    button.setAttribute("data-type", item.type);

    const icon = document.createElement("div");
    icon.className = "toolbar-icon";

    // Use SVG if available, otherwise use emoji icon
    if (item.svgPath) {
      const img = document.createElement("img");
      img.src = item.svgPath;
      img.alt = item.name;
      img.className = "toolbar-icon-svg";
      icon.appendChild(img);
    } else {
      icon.textContent = item.icon;
    }

    const label = document.createElement("div");
    label.className = "toolbar-label";
    label.textContent = item.name;

    button.appendChild(icon);
    button.appendChild(label);

    // Add Tippy tooltip instead of title attribute
    this.addTooltip(button, item.description);

    // Add mousedown handler for drag and drop
    button.addEventListener("mousedown", (e) => {
      // Start drag from toolbar
      (this as any).startToolbarDrag(item.id, e);
    });

    // Add hover effects
    button.addEventListener("mouseenter", () => {
      if (!this.isDragging) {
        button.style.borderColor = "#3498db";
        button.style.background = "rgba(52, 152, 219, 0.2)";
        button.style.transform = "translateY(-2px)";
      }
    });

    button.addEventListener("mouseleave", () => {
      if (!this.isDragging) {
        button.style.borderColor = "#34495e";
        button.style.background = "rgba(52, 73, 94, 0.3)";
        button.style.transform = "translateY(0)";
      }
    });

    return button;
  }

  /**
   * Create simulation control buttons
   */
  private createSimulationControls(): void {
    const controlsHeader = document.createElement("div");
    controlsHeader.className = "toolbar-category-header";
    controlsHeader.textContent = "Simulation";
    this.toolbar.appendChild(controlsHeader);

    const controlsContainer = document.createElement("div");
    controlsContainer.className = "toolbar-category simulation-controls";

    // Play/Stop button (for transient simulation)
    const playStopButton = document.createElement("button");
    playStopButton.className = "sim-button play-stop";
    playStopButton.textContent = "▶️ Start";
    playStopButton.title =
      "Run time-domain simulation (shows capacitor charging/discharging)";
    playStopButton.addEventListener("click", () => this.toggleSimulation());
    this.addTooltip(
      playStopButton,
      "Run time-domain simulation to see capacitor/inductor transient behavior",
    );

    // Reset button
    const resetButton = document.createElement("button");
    resetButton.className = "sim-button reset";
    resetButton.textContent = "🔄 Reset";
    resetButton.title = "Reset simulation to t=0";
    resetButton.addEventListener("click", () => this.resetSimulation());
    this.addTooltip(resetButton, "Reset simulation to initial state (t=0)");

    controlsContainer.appendChild(playStopButton);
    controlsContainer.appendChild(resetButton);

    this.toolbar.appendChild(controlsContainer);
  }

  /**
   * Create properties panel for component editing
   */
  private createPropertiesPanel(): void {
    this.propertiesPanel = document.createElement("div");
    this.propertiesPanel.id = "circuit-properties";
    this.propertiesPanel.className = "circuit-properties hidden";

    const header = document.createElement("div");
    header.className = "properties-header";
    header.style.cssText =
      "display: flex; justify-content: space-between; align-items: center;";

    // Title
    const title = document.createElement("span");
    title.textContent = "Component Properties";
    header.appendChild(title);

    // Add close button
    const closeButton = document.createElement("button");
    closeButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    closeButton.style.cssText = `
      background: transparent;
      border: none;
      color: #ecf0f1;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s ease;
    `;
    closeButton.onmouseover = () => {
      closeButton.style.background = "rgba(255, 255, 255, 0.1)";
    };
    closeButton.onmouseout = () => {
      closeButton.style.background = "transparent";
    };
    closeButton.onclick = () => {
      this.selectComponent(null);
    };
    header.appendChild(closeButton);

    const content = document.createElement("div");
    content.className = "properties-content";

    this.propertiesPanel.appendChild(header);
    this.propertiesPanel.appendChild(content);

    document.body.appendChild(this.propertiesPanel);
  }

  /**
   * Setup event listeners for canvas interaction
   */
  private setupEventListeners(): void {
    const canvas = this.app.canvas;

    // Mouse events for component placement and interaction
    canvas.addEventListener("click", (event) => this.onCanvasClick(event));
    canvas.addEventListener("mousedown", (event) =>
      this.onCanvasMouseDown(event),
    );
    canvas.addEventListener("mousemove", (event) =>
      this.onCanvasMouseMove(event),
    );
    canvas.addEventListener("mouseup", (event) => this.onCanvasMouseUp(event));

    // Keyboard events
    document.addEventListener("keydown", (event) => this.onKeyDown(event));
    document.addEventListener("keyup", (event) => this.onKeyUp(event));

    // Switch state change event listener
    const switchStateHandler = ((event: CustomEvent) => {
      console.log(
        `🔄 Switch state changed: ${event.detail.componentId} is now ${event.detail.isClosed ? "CLOSED" : "OPEN"}`,
      );
      // Switch state is updated, but circuit analysis is only done when user clicks Run/Analyze buttons
      // This allows users to set up their circuit before running analysis
    }) as EventListener;

    window.addEventListener("switch-state-changed", switchStateHandler);

    // Store reference for cleanup
    (this as any).switchStateHandler = switchStateHandler;
  }

  /**
   * Handle canvas click events
   */
  private onCanvasClick(event: MouseEvent): void {
    // Ignore clicks that occurred during/after a component drag
    if (this.isDraggingComponent) {
      console.log("🖱️ Ignoring click - component was being dragged");
      return;
    }

    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    // Convert screen coordinates to zoomable container coordinates
    const containerScale = this.zoomableContainer.scale.x;
    const worldX = (screenX - this.zoomableContainer.x) / containerScale;
    const worldY = (screenY - this.zoomableContainer.y) / containerScale;

    console.log(
      `🖱️ Canvas clicked at screen (${screenX}, ${screenY}) -> world (${worldX}, ${worldY})`,
    );

    if (this.isWireMode) {
      this.handleWireClick(worldX, worldY);
    } else {
      this.handleComponentClick(worldX, worldY);
    }
  }

  /**
   * Handle node click for creating wire connections
   */
  private handleNodeClick(
    component: CircuitComponent,
    node: any,
    _x: number,
    _y: number,
  ): void {
    if (!this.isWireMode) {
      // Start wire mode
      this.wireStartComponent = component;
      this.wireStartNode = node.id;
      this.isWireMode = true;
      this.wireWaypoints = [];
      this.wireStartWorldPos = null;
      this.wireBendPreference = "horizontal-first";
      document.body.classList.add("wire-mode");

      // Visual feedback - highlight the starting node
      this.highlightNode(component, node);

      console.log(`🔗 Wire start: ${component.getName()}.${node.id}`);
    } else {
      // Complete wire connection
      if (
        component !== this.wireStartComponent ||
        node.id !== this.wireStartNode
      ) {
        // Check if clicking on an existing wire
        const existingWire = this.findWireAtPoint(_x, _y);

        if (existingWire) {
          // Connect to existing wire
          const success = this.interactiveWireIntegration
            .getWireSystem()
            .createWireToWire(
              `wire_${Date.now()}`,
              this.wireStartComponent!.getName(),
              this.wireStartNode!,
              { x: _x, y: _y },
              existingWire.id,
            );

          if (success) {
            console.log(
              `🔗 Wire connected to existing wire at (${_x.toFixed(1)}, ${_y.toFixed(1)})`,
            );
            // Also connect solver nets: start node ↔ all component endpoints on the target wire
            try {
              const endpoints = (existingWire.nodes || []).filter(
                (n: any) => n.type === "component",
              );
              endpoints.forEach((end: any) => {
                this.circuitSolver.connectNodes(
                  this.wireStartComponent!.getName(),
                  this.wireStartNode!,
                  end.componentId,
                  end.nodeId,
                );
              });
            } catch {}
          }
        } else {
          // Regular component-to-component connection
          const wireId = `wire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const success = this.interactiveWireIntegration.createWire(
            wireId,
            this.wireStartComponent!.getName(),
            this.wireStartNode!,
            component.getName(),
            node.id,
          );

          if (success) {
            console.log(`🔗 Wire created: ${wireId}`);
            // Connect nodes in circuit solver
            this.circuitSolver.connectNodes(
              this.wireStartComponent!.getName(),
              this.wireStartNode!,
              component.getName(),
              node.id,
            );
          } else {
            console.warn("⚠️ Failed to create wire");
          }
        }
      }

      // Cancel wire mode
      this.cancelWireMode();
    }
  }

  /**
   * Handle wire mode clicks
   */
  private handleWireClick(x: number, y: number): void {
    // Find component and node at click position
    const clickedComponent = this.findComponentAt(x, y);

    if (!clickedComponent) {
      // If we clicked empty space, try node->wire connection
      if (this.wireStartComponent && this.wireStartNode) {
        const existingWire = this.findWireAtPoint(x, y);
        if (existingWire) {
          const success = this.interactiveWireIntegration
            .getWireSystem()
            .createWireToWire(
              `wire_${Date.now()}`,
              this.wireStartComponent.getName(),
              this.wireStartNode,
              { x, y },
              existingWire.id,
            );
          if (success) {
            console.log(
              `🔗 Wire connected to existing wire at (${x.toFixed(1)}, ${y.toFixed(1)})`,
            );
            try {
              const endpoints = (existingWire.nodes || []).filter(
                (n: any) => n.type === "component",
              );
              endpoints.forEach((end: any) => {
                this.circuitSolver.connectNodes(
                  this.wireStartComponent.getName(),
                  this.wireStartNode!,
                  end.componentId,
                  end.nodeId,
                );
              });
            } catch {}
          }
          this.cancelWireMode();
          return;
        }
      }
      // Place a waypoint at the clicked grid position and continue routing
      if (this.wireStartComponent && this.wireStartNode) {
        const GRID = 20;
        const snappedX = Math.round(x / GRID) * GRID;
        const snappedY = Math.round(y / GRID) * GRID;

        // Compute the orthogonal route from last anchor to this waypoint
        const lastAnchor =
          this.wireWaypoints.length > 0
            ? this.wireWaypoints[this.wireWaypoints.length - 1]
            : this.wireStartWorldPos!;

        const route = this.computeOrthogonalRoute(
          lastAnchor.x,
          lastAnchor.y,
          snappedX,
          snappedY,
          this.wireBendPreference,
        );

        // Add intermediate bend points and the endpoint as waypoints
        for (let i = 1; i < route.length; i++) {
          this.wireWaypoints.push(route[i]);
        }
        return;
      }
      this.cancelWireMode();
      return;
    }

    const clickedNode = this.findNodeAt(clickedComponent, x, y);
    if (!clickedNode) return;

    if (!this.wireStartComponent) {
      // Start wire
      this.wireStartComponent = clickedComponent;
      this.wireStartNode = clickedNode.id;
      console.log(
        `🔗 Wire start: ${clickedComponent.getName()}.${clickedNode.id}`,
      );
    } else {
      // Complete wire
      if (clickedComponent !== this.wireStartComponent) {
        const wireId = `wire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const success = this.interactiveWireIntegration.createWire(
          wireId,
          this.wireStartComponent.getName(),
          this.wireStartNode!,
          clickedComponent.getName(),
          clickedNode.id,
        );

        if (success) {
          console.log(`🔗 Wire created: ${wireId}`);
          // Connect nodes in circuit solver
          this.circuitSolver.connectNodes(
            this.wireStartComponent.getName(),
            this.wireStartNode!,
            clickedComponent.getName(),
            clickedNode.id,
          );
        } else {
          console.warn("⚠️ Failed to create wire");
        }
      }

      this.cancelWireMode();
    }
  }

  /**
   * Handle component placement and selection
   */
  private handleComponentClick(x: number, y: number): void {
    const clickedComponent = this.findComponentAt(x, y);

    if (clickedComponent) {
      // Check if we clicked on a node
      const clickedNode = this.findNodeAt(clickedComponent, x, y);

      if (clickedNode) {
        // Handle node click for wiring
        this.handleNodeClick(clickedComponent, clickedNode, x, y);
      } else {
        // Select component and show properties
        this.selectComponent(clickedComponent);
      }
    } else {
      // No component clicked - check for wire click
      const clickedWire = this.findWireAtPoint(x, y);
      if (clickedWire) {
        this.selectWire(clickedWire.id);
        return;
      }

      // Deselect all components and wires when clicking empty space
      this.selectComponent(null);
      this.deselectWire();

      // Place new component if one is selected in toolbar (legacy click-to-place)
      const selectedType = this.getSelectedToolbarType();
      if (selectedType && selectedType !== "wire") {
        this.placeComponent(selectedType, x, y);
      }
    }
  }

  /**
   * Place a new component on the canvas (legacy method - now uses createComponent)
   */
  private placeComponent(type: string, x: number, y: number): void {
    const component = this.createComponent(type, x, y);
    if (component) {
      this.gameObjects.set(component.getName(), component);
      this.zoomableContainer.addChild(component.displayObject());

      // Register with wire system and circuit solver
      this.wireSystem.registerComponent(component);
      this.circuitSolver.addComponent(component);

      // Register with interactive wire system
      this.interactiveWireIntegration.addComponent(component);

      // Register with hybrid wire router (open-source algorithms)
      this.registerComponentWithRouter(component);

      // Listen for position changes to update wires
      component.on("positionChanged", (comp) => {
        this.interactiveWireIntegration.updateWirePositions(comp.getName());
      });

      // Add interaction handlers for dragging
      this.addComponentInteractionHandlers(component);

      // Update properties panel
      this.updatePropertiesPanel(component);

      console.log(`✅ Placed ${type} at (${x.toFixed(1)}, ${y.toFixed(1)})`);
    }
  }

  /**
   * Find component at world coordinates
   */
  private findComponentAt(x: number, y: number): CircuitComponent | null {
    // Check all components for hit test
    // x, y are in world coordinates (zoomable container space)

    for (const [_name, gameObject] of this.gameObjects) {
      if (gameObject instanceof CircuitComponent) {
        const displayObj = gameObject.displayObject();

        // Get local bounds (size and offset within the component)
        const localBounds = displayObj.getLocalBounds();

        // Get component's position in world space
        const pos = displayObj.position;

        // Create a bounding box in world coordinates
        const worldBounds = {
          x: pos.x + localBounds.x,
          y: pos.y + localBounds.y,
          width: localBounds.width,
          height: localBounds.height,
        };

        // Check if the click point is within the world bounds
        if (
          x >= worldBounds.x &&
          x <= worldBounds.x + worldBounds.width &&
          y >= worldBounds.y &&
          y <= worldBounds.y + worldBounds.height
        ) {
          return gameObject;
        }
      }
    }
    return null;
  }

  /**
   * Find node at coordinates within a component
   */
  private findNodeAt(component: CircuitComponent, x: number, y: number): any {
    const nodes = component.getNodes();
    const componentPos = component.getPosition();

    for (const node of nodes) {
      const nodeWorldX = componentPos.x + node.position.x;
      const nodeWorldY = componentPos.y + node.position.y;
      const distance = Math.sqrt(
        Math.pow(x - nodeWorldX, 2) + Math.pow(y - nodeWorldY, 2),
      );

      if (distance < 10) {
        // 10 pixel hit radius
        return node;
      }
    }

    return null;
  }

  /**
   * Toggle wire mode
   */
  private toggleWireMode(): void {
    this.isWireMode = !this.isWireMode;

    if (this.isWireMode) {
      console.log("🔗 Wire mode activated");
      // Update UI to show wire mode
      document.body.classList.add("wire-mode");
    } else {
      this.cancelWireMode();
    }
  }

  /**
   * Highlight a node to show it's selected for wiring
   */
  private highlightNode(component: CircuitComponent, node: any): void {
    // Clear previous highlight
    this.clearNodeHighlight();

    const componentPos = component.getPosition();
    const nodeWorldX = componentPos.x + node.position.x;
    const nodeWorldY = componentPos.y + node.position.y;

    // Create node highlight
    this.nodeHighlight = new Graphics();

    // Outer glow ring
    this.nodeHighlight.circle(nodeWorldX, nodeWorldY, 12);
    this.nodeHighlight.fill({ color: 0x00ff00, alpha: 0.3 });

    // Middle ring
    this.nodeHighlight.circle(nodeWorldX, nodeWorldY, 8);
    this.nodeHighlight.stroke({ width: 2, color: 0x00ff00, alpha: 0.8 });

    // Inner dot
    this.nodeHighlight.circle(nodeWorldX, nodeWorldY, 4);
    this.nodeHighlight.fill({ color: 0x00ff00, alpha: 1.0 });

    // Add to zoomable container
    this.zoomableContainer.addChild(this.nodeHighlight);

    // Show wire mode indicator
    this.showWireModeIndicator(component, node);

    console.log(
      `✨ Highlighted node ${node.id} at (${nodeWorldX.toFixed(1)}, ${nodeWorldY.toFixed(1)})`,
    );
  }

  /**
   * Show wire mode indicator message
   */
  private showWireModeIndicator(
    _component: CircuitComponent,
    _node: any,
  ): void {
    // Remove existing indicator
    const existing = document.getElementById("wire-mode-indicator");
    if (existing) {
      existing.remove();
    }

    const indicator = document.createElement("div");
    indicator.id = "wire-mode-indicator";
    indicator.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #27ae60, #229954);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(39, 174, 96, 0.4);
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
      animation: slideDown 0.3s ease-out;
      pointer-events: none;
    `;
    indicator.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span>🔗</span>
        <span>Wire Mode: Click another node to connect</span>
        <span style="opacity: 0.7; font-size: 12px; margin-left: 8px;">(Press ESC to cancel)</span>
      </div>
    `;

    document.body.appendChild(indicator);

    // Add animation CSS if not already present
    if (!document.getElementById("wire-mode-animations")) {
      const style = document.createElement("style");
      style.id = "wire-mode-animations";
      style.textContent = `
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Hide wire mode indicator
   */
  private hideWireModeIndicator(): void {
    const indicator = document.getElementById("wire-mode-indicator");
    if (indicator) {
      indicator.style.animation = "slideUp 0.2s ease-out";
      setTimeout(() => indicator.remove(), 200);
    }
  }

  /**
   * Clear node highlight
   */
  private clearNodeHighlight(): void {
    if (this.nodeHighlight) {
      if (this.nodeHighlight.parent) {
        this.nodeHighlight.parent.removeChild(this.nodeHighlight);
      }
      this.nodeHighlight.destroy();
      this.nodeHighlight = null;
    }
  }

  /**
   * Compute orthogonal route segments from start to end using the current bend preference.
   * Returns an array of {x,y} points forming horizontal/vertical segments.
   */
  private computeOrthogonalRoute(
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    preference: "horizontal-first" | "vertical-first",
  ): { x: number; y: number }[] {
    const GRID = 20;
    const snap = (v: number) => Math.round(v / GRID) * GRID;
    const tx = snap(ex);
    const ty = snap(ey);
    const dx = tx - sx;
    const dy = ty - sy;

    // Trivially aligned
    if (Math.abs(dx) < 1 || Math.abs(dy) < 1) {
      return [
        { x: sx, y: sy },
        { x: tx, y: ty },
      ];
    }

    // L-route: one bend
    if (preference === "horizontal-first") {
      return [
        { x: sx, y: sy },
        { x: tx, y: sy },
        { x: tx, y: ty },
      ];
    } else {
      return [
        { x: sx, y: sy },
        { x: sx, y: ty },
        { x: tx, y: ty },
      ];
    }
  }

  /**
   * Create or update wire preview with smart orthogonal routing.
   * Draws committed waypoint segments + a live L-shaped preview from the last anchor to the mouse.
   */
  private updateWirePreview(mouseX: number, mouseY: number): void {
    if (!this.isWireMode || !this.wireStartComponent || !this.wireStartNode)
      return;

    const componentPos = this.wireStartComponent.getPosition();
    const nodes = this.wireStartComponent.getNodes();
    const startNode = nodes.find((n) => n.id === this.wireStartNode);
    if (!startNode) return;

    const originX = componentPos.x + startNode.position.x;
    const originY = componentPos.y + startNode.position.y;

    // Cache the start world position
    if (!this.wireStartWorldPos) {
      this.wireStartWorldPos = { x: originX, y: originY };
    }

    // Convert mouse to world coordinates
    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = mouseX - rect.left;
    const screenY = mouseY - rect.top;
    const scale = this.zoomableContainer.scale.x;
    const worldX = (screenX - this.zoomableContainer.x) / scale;
    const worldY = (screenY - this.zoomableContainer.y) / scale;

    // Clear previous preview
    if (this.wirePreview) {
      if (this.wirePreview.parent) {
        this.wirePreview.parent.removeChild(this.wirePreview);
      }
      this.wirePreview.destroy();
    }
    this.wirePreview = new Graphics();

    // --- Build the full point path ---
    // Start from origin, through all waypoints, to the live cursor
    const anchorPoints: { x: number; y: number }[] = [
      { x: originX, y: originY },
      ...this.wireWaypoints,
    ];

    // Auto-detect bend preference from initial drag direction if not toggled
    const lastAnchor = anchorPoints[anchorPoints.length - 1];
    const absDx = Math.abs(worldX - lastAnchor.x);
    const absDy = Math.abs(worldY - lastAnchor.y);

    // Compute the live segment from last anchor to cursor
    const liveRoute = this.computeOrthogonalRoute(
      lastAnchor.x,
      lastAnchor.y,
      worldX,
      worldY,
      this.wireBendPreference,
    );

    // Combine: committed segments (anchor-to-anchor as straight lines) + live route
    const allPoints: { x: number; y: number }[] = [];
    // Add committed waypoint path
    for (const pt of anchorPoints) {
      allPoints.push(pt);
    }
    // Add live route (skip first point as it's the same as the last anchor)
    for (let i = 1; i < liveRoute.length; i++) {
      allPoints.push(liveRoute[i]);
    }

    // --- Draw committed segments (solid) ---
    if (anchorPoints.length > 1) {
      this.wirePreview.moveTo(anchorPoints[0].x, anchorPoints[0].y);
      for (let i = 1; i < anchorPoints.length; i++) {
        this.wirePreview.lineTo(anchorPoints[i].x, anchorPoints[i].y);
      }
      this.wirePreview.stroke({ width: 2.5, color: 0x4ecdc4, alpha: 1.0 });
    }

    // --- Draw live segment (slightly transparent, rubber-band feel) ---
    if (liveRoute.length > 1) {
      this.wirePreview.moveTo(liveRoute[0].x, liveRoute[0].y);
      for (let i = 1; i < liveRoute.length; i++) {
        this.wirePreview.lineTo(liveRoute[i].x, liveRoute[i].y);
      }
      this.wirePreview.stroke({ width: 2.5, color: 0x00ff88, alpha: 0.7 });
    }

    // --- Draw anchor dots (waypoints) ---
    for (const wp of this.wireWaypoints) {
      this.wirePreview.circle(wp.x, wp.y, 3);
      this.wirePreview.fill({ color: 0x4ecdc4, alpha: 1.0 });
    }

    // Start dot
    this.wirePreview.circle(originX, originY, 4);
    this.wirePreview.fill({ color: 0xff6b6b, alpha: 0.9 });

    // Cursor dot
    const GRID = 20;
    const snappedX = Math.round(worldX / GRID) * GRID;
    const snappedY = Math.round(worldY / GRID) * GRID;
    this.wirePreview.circle(snappedX, snappedY, 4);
    this.wirePreview.fill({ color: 0x00ff88, alpha: 0.9 });

    // Snap crosshair at cursor
    this.wirePreview.moveTo(snappedX - 8, snappedY);
    this.wirePreview.lineTo(snappedX + 8, snappedY);
    this.wirePreview.stroke({ width: 1, color: 0x00ff88, alpha: 0.4 });
    this.wirePreview.moveTo(snappedX, snappedY - 8);
    this.wirePreview.lineTo(snappedX, snappedY + 8);
    this.wirePreview.stroke({ width: 1, color: 0x00ff88, alpha: 0.4 });

    this.zoomableContainer.addChild(this.wirePreview);
  }

  /**
   * Clear wire preview
   */
  private clearWirePreview(): void {
    if (this.wirePreview) {
      if (this.wirePreview.parent) {
        this.wirePreview.parent.removeChild(this.wirePreview);
      }
      this.wirePreview.destroy();
      this.wirePreview = null;
    }
  }

  /**
   * Find wire at a specific point
   */
  private findWireAtPoint(x: number, y: number): any {
    const wires = this.interactiveWireIntegration.getWires();

    for (const wire of wires.values()) {
      if (this.isPointOnWire(wire, { x, y })) {
        return wire;
      }
    }

    return null;
  }

  /**
   * Check if a point is on a wire
   */
  private isPointOnWire(wire: any, point: { x: number; y: number }): boolean {
    const threshold = 8; // Click tolerance

    for (const segment of wire.segments) {
      const distance = this.distanceToLineSegment(
        point,
        { x: segment.start.x, y: segment.start.y },
        { x: segment.end.x, y: segment.end.y },
      );

      if (distance <= threshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate distance from point to line segment
   */
  private distanceToLineSegment(
    point: { x: number; y: number },
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number },
  ): number {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;

    if (lenSq === 0) return Math.sqrt(A * A + B * B);

    let param = dot / lenSq;

    let xx, yy;
    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Cancel wire mode
   */
  private cancelWireMode(): void {
    this.isWireMode = false;
    this.wireStartComponent = null;
    this.wireStartNode = null;
    this.wireWaypoints = [];
    this.wireStartWorldPos = null;
    this.wireBendPreference = "horizontal-first";
    this.clearNodeHighlight();
    this.clearWirePreview();
    this.hideWireModeIndicator();
    document.body.classList.remove("wire-mode");
    console.log("🔗 Wire mode cancelled");
  }

  /**
   * Update properties panel for selected component
   */
  private updatePropertiesPanel(component: CircuitComponent): void {
    // Show the properties panel
    this.propertiesPanel.classList.remove("hidden");

    const content = this.propertiesPanel.querySelector(".properties-content")!;
    content.innerHTML = "";

    const props = component.getCircuitProperties();
    const type = component.getComponentType();
    const friendlyTypeName: Record<string, string> = {
      opamp: "Op-Amp",
      comparator: "Comparator",
      timer555: "555 Timer",
      acsource: "AC Source",
      zener_diode: "Zener Diode",
      npn_transistor: "NPN Transistor",
      pnp_transistor: "PNP Transistor",
      nmos_transistor: "NMOS Transistor",
      pmos_transistor: "PMOS Transistor",
      spdt_switch: "SPDT Switch",
      push_button: "Push Button",
      and_gate: "AND Gate",
      or_gate: "OR Gate",
      xor_gate: "XOR Gate",
      nand_gate: "NAND Gate",
      nor_gate: "NOR Gate",
      not_gate: "NOT Gate",
    };
    const displayType =
      friendlyTypeName[type] ??
      type
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

    // Component type (read-only) to clearly distinguish similar symbols.
    const typeField = document.createElement("div");
    typeField.className = "property-field";
    typeField.style.cssText =
      "font-size:12px;color:#9aa4af;background:#1a1a1a;padding:8px 10px;border-radius:4px;margin-bottom:8px;";
    typeField.innerHTML = `<strong style="color:#cfd8e3;">Component:</strong> ${displayType} <span style="color:#8b949e;">(${component.getName()})</span>`;
    content.appendChild(typeField);

    // Component name
    const nameField = this.createPropertyField(
      "Name",
      component.getName(),
      "text",
      (value) => {
        const oldName = component.getName();
        component.setName(value || oldName);
        // Force visual update
        component.update(0);
        console.log(`📝 Component renamed from ${oldName} to ${value}`);
      },
    );
    content.appendChild(nameField);

    // Component-specific properties (simplified for kids)
    switch (type) {
      case "resistor":
        const resistanceField = this.createPropertyField(
          "Resistance (Ω)",
          props.value.toString(),
          "number",
          (value) => {
            const resistor = component as Resistor;
            resistor.updateCircuitProperties({
              value: parseFloat(value) || 100,
            });
            // Force visual update
            resistor.update(0);
            console.log(`🔧 Resistor resistance updated to ${value}Ω`);
          },
        );

        content.appendChild(resistanceField);
        break;

      case "capacitor":
        const capacitanceField = this.createPropertyField(
          "Capacitance (F)",
          props.value.toString(),
          "number",
          (value) => {
            const capacitor = component as Capacitor;
            capacitor.updateCircuitProperties({
              value: parseFloat(value) || 0.0001,
            });
            // Force visual update
            capacitor.update(0);
            console.log(`⚡ Capacitor capacitance updated to ${value}F`);
          },
        );

        content.appendChild(capacitanceField);
        break;

      case "battery":
        const voltageField = this.createPropertyField(
          "Voltage (V)",
          props.value.toString(),
          "number",
          (value) => {
            const battery = component as Battery;
            battery.updateCircuitProperties({ value: parseFloat(value) || 9 });
            // Force visual update
            battery.update(0);
            console.log(`🔋 Battery voltage updated to ${value}V`);
          },
        );

        content.appendChild(voltageField);
        break;

      case "inductor":
        const inductanceField = this.createPropertyField(
          "Inductance (H)",
          props.value.toString(),
          "number",
          (value) => {
            const inductor = component as Inductor;
            inductor.updateCircuitProperties({
              value: parseFloat(value) || 0.1,
            });
            // Force visual update
            inductor.update(0);
            console.log(`🌀 Inductor inductance updated to ${value}H`);
          },
        );

        content.appendChild(inductanceField);
        break;

      case "acsource":
        const acProps = props as any; // Cast to access amplitude, frequency, phase

        const amplitudeField = this.createPropertyField(
          "Amplitude (V)",
          acProps.amplitude?.toString() || "10",
          "number",
          (value) => {
            const acSource = component as ACSource;
            const newAmplitude = parseFloat(value) || 10;
            acSource.updateCircuitProperties({
              value: newAmplitude,
              amplitude: newAmplitude,
            } as any);
            // Force visual update
            acSource.update(0);
            console.log(`⚡ AC Source amplitude updated to ${value}V`);
          },
        );
        content.appendChild(amplitudeField);

        const frequencyField = this.createPropertyField(
          "Frequency (Hz)",
          acProps.frequency?.toString() || "60",
          "number",
          (value) => {
            const acSource = component as ACSource;
            acSource.updateCircuitProperties({
              frequency: parseFloat(value) || 60,
            } as any);
            // Force visual update
            acSource.update(0);
            console.log(`🌊 AC Source frequency updated to ${value}Hz`);
          },
        );
        content.appendChild(frequencyField);

        const phaseField = this.createPropertyField(
          "Phase (rad)",
          acProps.phase?.toString() || "0",
          "number",
          (value) => {
            const acSource = component as ACSource;
            acSource.updateCircuitProperties({
              phase: parseFloat(value) || 0,
            } as any);
            // Force visual update
            acSource.update(0);
            console.log(`🔄 AC Source phase updated to ${value} rad`);
          },
        );
        content.appendChild(phaseField);
        break;

      case "opamp": {
        const opAmp = component as OpAmp;
        const opProps = opAmp.getCircuitProperties() as any;

        const gainField = this.createPropertyField(
          "Open-loop Gain (V/V)",
          (opProps.openLoopGain ?? 100000).toString(),
          "number",
          (value) => {
            const openLoopGain = Math.max(parseFloat(value) || 100000, 1);
            opAmp.updateCircuitProperties({ openLoopGain } as any);
            opAmp.update(0);
          },
        );
        content.appendChild(gainField);

        const zinField = this.createPropertyField(
          "Input Impedance (Ω)",
          (opProps.inputImpedance ?? 1e6).toString(),
          "number",
          (value) => {
            const inputImpedance = Math.max(parseFloat(value) || 1e6, 1);
            opAmp.updateCircuitProperties({ inputImpedance } as any);
            opAmp.update(0);
          },
        );
        content.appendChild(zinField);

        const routField = this.createPropertyField(
          "Output Impedance (Ω)",
          (opProps.outputImpedance ?? 75).toString(),
          "number",
          (value) => {
            const outputImpedance = Math.max(parseFloat(value) || 75, 1e-3);
            opAmp.updateCircuitProperties({ outputImpedance } as any);
            opAmp.update(0);
          },
        );
        content.appendChild(routField);

        const vSatPField = this.createPropertyField(
          "Positive Saturation (V)",
          (opProps.vSatPositive ?? 12).toString(),
          "number",
          (value) => {
            const vSatPositive = parseFloat(value);
            if (!Number.isFinite(vSatPositive)) return;
            opAmp.updateCircuitProperties({ vSatPositive } as any);
            opAmp.update(0);
          },
        );
        content.appendChild(vSatPField);

        const vSatNField = this.createPropertyField(
          "Negative Saturation (V)",
          (opProps.vSatNegative ?? -12).toString(),
          "number",
          (value) => {
            const vSatNegative = parseFloat(value);
            if (!Number.isFinite(vSatNegative)) return;
            opAmp.updateCircuitProperties({ vSatNegative } as any);
            opAmp.update(0);
          },
        );
        content.appendChild(vSatNField);
        break;
      }

      case "comparator": {
        const cmp = component as Comparator;
        const cmpProps = cmp.getCircuitProperties() as any;

        const thresholdField = this.createPropertyField(
          "Threshold Offset (V)",
          (cmpProps.threshold ?? 0).toString(),
          "number",
          (value) => {
            const threshold = parseFloat(value);
            if (!Number.isFinite(threshold)) return;
            cmp.updateCircuitProperties({ threshold } as any);
            cmp.update(0);
          },
        );
        content.appendChild(thresholdField);

        const hysteresisField = this.createPropertyField(
          "Hysteresis (V)",
          (cmpProps.hysteresis ?? 0.1).toString(),
          "number",
          (value) => {
            const hysteresis = Math.max(parseFloat(value) || 0.1, 0);
            cmp.updateCircuitProperties({ hysteresis } as any);
            cmp.update(0);
          },
        );
        content.appendChild(hysteresisField);

        const outHighField = this.createPropertyField(
          "Output High (V)",
          (cmpProps.outputHigh ?? 5).toString(),
          "number",
          (value) => {
            const outputHigh = parseFloat(value);
            if (!Number.isFinite(outputHigh)) return;
            cmp.updateCircuitProperties({ outputHigh } as any);
            cmp.update(0);
          },
        );
        content.appendChild(outHighField);

        const outLowField = this.createPropertyField(
          "Output Low (V)",
          (cmpProps.outputLow ?? 0).toString(),
          "number",
          (value) => {
            const outputLow = parseFloat(value);
            if (!Number.isFinite(outputLow)) return;
            cmp.updateCircuitProperties({ outputLow } as any);
            cmp.update(0);
          },
        );
        content.appendChild(outLowField);
        break;
      }

      case "led":
        const ledComponent = component as LED;
        const ledProps = props as any;

        // Color selection dropdown
        const colorField = document.createElement("div");
        colorField.className = "property-field";
        colorField.innerHTML = `
          <label>LED Color</label>
          <select id="led-color-select" style="
            width: 100%;
            padding: 8px;
            border: 1px solid #444;
            border-radius: 4px;
            background: #2a2a2a;
            color: #fff;
            font-size: 14px;
          ">
            <option value="red" ${ledProps.color === "red" ? "selected" : ""}>Red (1.8V, 25Ω)</option>
            <option value="green" ${ledProps.color === "green" ? "selected" : ""}>Green (2.1V, 30Ω)</option>
            <option value="blue" ${ledProps.color === "blue" ? "selected" : ""}>Blue (3.2V, 40Ω)</option>
            <option value="yellow" ${ledProps.color === "yellow" ? "selected" : ""}>Yellow (2.0V, 28Ω)</option>
            <option value="white" ${ledProps.color === "white" ? "selected" : ""}>White (3.3V, 45Ω)</option>
          </select>
        `;

        const colorSelect = colorField.querySelector("select");
        colorSelect?.addEventListener("change", (e) => {
          const newColor = (e.target as HTMLSelectElement).value;
          ledComponent.setColor(newColor);
          // Refresh properties panel to show updated values
          this.updatePropertiesPanel(component);
          console.log(`💡 LED color changed to ${newColor}`);
        });

        content.appendChild(colorField);

        // Show current state info
        const stateInfo = document.createElement("div");
        stateInfo.className = "property-field";
        stateInfo.style.cssText = `
          background: #1a1a1a;
          padding: 12px;
          border-radius: 4px;
          margin-top: 8px;
        `;

        const isBurnt = ledComponent.getCircuitProperties().burnt;
        const isOn = ledComponent.isLit();
        const brightness = ledComponent.getBrightness();
        const current = ledComponent.getCircuitProperties().current * 1000; // mA
        const maxCurrent = ledProps.maxCurrent * 1000; // mA

        let stateHTML = `
          <div style="font-size: 11px; color: #aaa; margin-bottom: 8px;">LED Status</div>
        `;

        if (isBurnt) {
          stateHTML += `
            <div style="color: #ff4444; font-weight: bold; font-size: 13px;">⚠️ BURNT - Overcurrent!</div>
            <div style="color: #888; font-size: 11px; margin-top: 4px;">The LED has been damaged by excessive current.</div>
          `;
        } else if (isOn) {
          stateHTML += `
            <div style="color: #44ff44; font-size: 13px;">✓ ON (${Math.round(brightness * 100)}% brightness)</div>
            <div style="color: #888; font-size: 11px; margin-top: 4px;">Current: ${current.toFixed(1)}mA / ${maxCurrent.toFixed(0)}mA max</div>
          `;
        } else {
          stateHTML += `
            <div style="color: #888; font-size: 13px;">○ OFF</div>
            <div style="color: #666; font-size: 11px; margin-top: 4px;">No current flowing</div>
          `;
        }

        stateInfo.innerHTML = stateHTML;
        content.appendChild(stateInfo);
        break;

      case "timer555": {
        const t555 = component as Timer555;
        const tp = t555.getCircuitProperties() as Timer555Properties;

        const hint = document.createElement("div");
        hint.className = "property-field";
        hint.style.cssText =
          "font-size:11px;color:#888;margin-bottom:4px;line-height:1.45;";
        hint.textContent =
          "Like Falstad: place resistors and a capacitor. R1 between Vcc and DIS (pin 7), R2 between DIS and the node where TRIG (2) and THRESH (6) are tied, C from that node to GND. Resistor and capacitor networks between those endpoint nets are reduced to equivalent values (series/parallel/mixed).";
        content.appendChild(hint);

        const fmtR = (r: number) =>
          r >= 1000 ? `${(r / 1000).toFixed(2)} kΩ` : `${r.toFixed(1)} Ω`;
        const fmtC = (c: number) =>
          c >= 1e-6
            ? `${(c * 1e6).toFixed(1)} µF`
            : `${(c * 1e9).toFixed(1)} nF`;
        const rcBlock = document.createElement("div");
        rcBlock.className = "property-field";
        rcBlock.style.cssText =
          "background:#1a1a1a;padding:10px;border-radius:4px;font-size:12px;color:#ccc;";
        const diagStatus = tp.status ?? "—";
        const diagDiscrete = tp.discreteReason ?? "no_solver";
        if (tp.r1Ohms > 0 && tp.r2Ohms > 0 && tp.cFarads > 0) {
          rcBlock.innerHTML = `
            <div style="margin-bottom:6px;color:#aaa;">From schematic</div>
            <div>R1 ${fmtR(tp.r1Ohms)}</div>
            <div>R2 ${fmtR(tp.r2Ohms)}</div>
            <div>C ${fmtC(tp.cFarads)}</div>
            <div style="margin-top:8px;color:#aaa;">Derived</div>
            <div>≈ ${tp.frequency >= 1 ? tp.frequency.toFixed(2) : tp.frequency.toExponential(2)} Hz</div>
            <div>Duty ≈ ${(tp.dutyCycle * 100).toFixed(1)}%</div>
            <div style="margin-top:8px;color:#aaa;">Diagnostics</div>
            <div>Status: ${diagStatus}</div>
            <div>RC extraction: ${diagDiscrete}</div>
          `;
        } else {
          rcBlock.innerHTML = `
            <div style="color:#888;">No valid R1/R2/C detected on the nets. Wire discrete passives as above (pins 2 & 6 tied together; pin 7 separate).</div>
            <div style="margin-top:8px;color:#aaa;">Diagnostics</div>
            <div style="color:#aaa;">Status: ${diagStatus}</div>
            <div style="color:#aaa;">RC extraction: ${diagDiscrete}</div>
          `;
        }
        content.appendChild(rcBlock);
        break;
      }
    }

    // Add action buttons
    this.createActionButtons(component);

    // Show panel
    this.propertiesPanel.classList.remove("hidden");
  }

  /**
   * Create action buttons for the properties panel
   */
  private createActionButtons(component: CircuitComponent): void {
    const content = this.propertiesPanel.querySelector(".properties-content")!;

    const buttonSection = document.createElement("div");
    buttonSection.className = "properties-panel-section";
    buttonSection.style.cssText =
      "display: flex; justify-content: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid #34495e;";

    // Delete button
    const deleteButton = document.createElement("button");
    deleteButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 6px;">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
      Delete
    `;
    deleteButton.className = "properties-panel-button danger";
    deleteButton.style.cssText = `
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      background: linear-gradient(135deg, #e74c3c, #c0392b);
      color: white;
      transition: all 0.3s ease;
      box-shadow: 0 2px 4px rgba(231, 76, 60, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    deleteButton.onmouseover = () => {
      deleteButton.style.background =
        "linear-gradient(135deg, #c0392b, #a93226)";
      deleteButton.style.transform = "translateY(-1px)";
      deleteButton.style.boxShadow = "0 4px 8px rgba(231, 76, 60, 0.4)";
    };

    deleteButton.onmouseout = () => {
      deleteButton.style.background =
        "linear-gradient(135deg, #e74c3c, #c0392b)";
      deleteButton.style.transform = "translateY(0)";
      deleteButton.style.boxShadow = "0 2px 4px rgba(231, 76, 60, 0.3)";
    };

    deleteButton.onclick = () => this.deleteComponentFromPanel(component);

    buttonSection.appendChild(deleteButton);
    content.appendChild(buttonSection);
  }

  /**
   * Delete component from properties panel with confirmation
   */
  private deleteComponentFromPanel(component: CircuitComponent): void {
    this.showDeleteConfirmationDialog(component);
  }

  /**
   * Show delete confirmation dialog
   */
  private async showDeleteConfirmationDialog(
    component: CircuitComponent,
  ): Promise<void> {
    const confirmed = await this.showCustomConfirmationModal(
      "Delete Component",
      `Are you sure you want to delete "${component.getName()}"?\n\nThis action cannot be undone.`,
      "Delete",
      "Cancel",
      "destructive",
    );

    if (confirmed) {
      this.deleteComponent(component);
      this.selectComponent(null); // Deselect and hide properties panel
      console.log(`🗑️ Deleted component: ${component.getName()}`);
    }
  }

  /**
   * Show custom confirmation modal
   */
  private showCustomConfirmationModal(
    title: string,
    message: string,
    confirmText: string = "OK",
    cancelText: string = "Cancel",
    type: "normal" | "destructive" = "normal",
  ): Promise<boolean> {
    return new Promise((resolve) => {
      // Add CSS animations if not already added
      this.addModalAnimations();

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
        white-space: pre-line;
      `;
      body.textContent = message;

      // Create footer
      const footer = document.createElement("div");
      footer.style.cssText = `
        padding: 16px 24px 24px 24px;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        border-top: 1px solid #e5e7eb;
      `;

      // Cancel button
      const cancelButton = document.createElement("button");
      cancelButton.textContent = cancelText;
      cancelButton.style.cssText = `
        padding: 10px 20px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        background: #ffffff;
        color: #374151;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;

      cancelButton.onmouseover = () => {
        cancelButton.style.background = "#f9fafb";
        cancelButton.style.borderColor = "#9ca3af";
      };

      cancelButton.onmouseout = () => {
        cancelButton.style.background = "#ffffff";
        cancelButton.style.borderColor = "#d1d5db";
      };

      // Confirm button
      const confirmButton = document.createElement("button");
      confirmButton.textContent = confirmText;
      const isDestructive = type === "destructive";
      confirmButton.style.cssText = `
        padding: 10px 20px;
        border: none;
        border-radius: 8px;
        background: ${isDestructive ? "linear-gradient(135deg, #ef4444, #dc2626)" : "linear-gradient(135deg, #3b82f6, #2563eb)"};
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;

      confirmButton.onmouseover = () => {
        confirmButton.style.background = isDestructive
          ? "linear-gradient(135deg, #dc2626, #b91c1c)"
          : "linear-gradient(135deg, #2563eb, #1d4ed8)";
        confirmButton.style.transform = "translateY(-1px)";
      };

      confirmButton.onmouseout = () => {
        confirmButton.style.background = isDestructive
          ? "linear-gradient(135deg, #ef4444, #dc2626)"
          : "linear-gradient(135deg, #3b82f6, #2563eb)";
        confirmButton.style.transform = "translateY(0)";
      };

      // Event handlers
      const cleanup = () => {
        overlay.style.animation =
          "stemplitude-modal-fade-out 0.2s ease-out forwards";
        modal.style.animation =
          "stemplitude-modal-scale-out 0.2s ease-out forwards";
        setTimeout(() => {
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        }, 200);
      };

      cancelButton.onclick = () => {
        cleanup();
        resolve(false);
      };

      confirmButton.onclick = () => {
        cleanup();
        resolve(true);
      };

      // Close on overlay click
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(false);
        }
      };

      // Close on Escape key
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          cleanup();
          resolve(false);
          document.removeEventListener("keydown", keyHandler);
        }
      };
      document.addEventListener("keydown", keyHandler);

      // Assemble modal
      footer.appendChild(cancelButton);
      footer.appendChild(confirmButton);
      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Focus confirm button for keyboard navigation
      setTimeout(() => confirmButton.focus(), 100);
    });
  }

  /**
   * Create floating trash bin for deleting components
   */
  private createTrashBin(): void {
    // Remove existing trash bin if it exists
    const existing = document.getElementById("circuit-trash-bin");
    if (existing) {
      existing.remove();
    }

    const trashBin = document.createElement("div");
    trashBin.id = "circuit-trash-bin";
    const hasSelection =
      this.selectedComponent || this.selectedComponents.size > 0;
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
      opacity: ${hasSelection ? "1" : "0.5"};
      pointer-events: ${hasSelection ? "auto" : "none"};
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
      if (
        this.selectedComponent ||
        this.selectedComponents.size > 0 ||
        this.selectedWireId
      ) {
        trashBin.style.transform = "scale(1.1)";
        trashBin.style.boxShadow = "0 6px 20px rgba(231, 76, 60, 0.5)";
      }
    });

    trashBin.addEventListener("mouseleave", () => {
      trashBin.style.transform = "scale(1.0)";
      trashBin.style.boxShadow = "0 4px 15px rgba(0,0,0,0.3)";
    });

    // Click handler for deleting selected component(s) or wire
    trashBin.addEventListener("click", () => {
      if (this.selectedComponents.size > 0) {
        // Multi-select deletion
        void this.showMultiDeleteConfirmationDialog();
      } else if (this.selectedComponent) {
        // Single component deletion
        void this.showDeleteConfirmationDialog(this.selectedComponent);
      } else if (this.selectedWireId) {
        // Wire deletion
        this.deleteSelectedWire();
      }
    });

    document.body.appendChild(trashBin);

    // Store reference for updates
    (this as any).trashBin = trashBin;
  }

  /**
   * Update trash bin visibility based on selection
   */
  private updateTrashBinVisibility(): void {
    const trashBin = (this as any).trashBin;
    if (trashBin) {
      const hasSelection =
        this.selectedComponent !== null ||
        this.selectedComponents.size > 0 ||
        this.selectedWireId !== null;
      trashBin.style.opacity = hasSelection ? "1" : "0.5";
      trashBin.style.pointerEvents = hasSelection ? "auto" : "none";
    }
  }

  /**
   * Show multi-delete confirmation dialog
   */
  private async showMultiDeleteConfirmationDialog(): Promise<void> {
    const count = this.selectedComponents.size;
    const confirmed = await this.showCustomConfirmationModal(
      "Delete Multiple Components",
      `Are you sure you want to delete ${count} selected component${count > 1 ? "s" : ""}?`,
      "Delete",
      "Cancel",
      "destructive",
    );

    if (confirmed) {
      this.deleteSelectedComponentsWithoutConfirmation();
    }
  }

  /**
   * Add interaction handlers to a component for dragging and selection
   */
  private addComponentInteractionHandlers(component: CircuitComponent): void {
    const displayObject = component.displayObject();

    // Make component interactive
    displayObject.eventMode = "static";
    displayObject.cursor = "pointer";

    // Don't set a custom hitArea - let PIXI use the actual drawn graphics
    // This ensures the hit area is always correct regardless of zoom/transforms

    // Remove existing listeners to prevent conflicts (important!)
    displayObject.removeAllListeners();

    // Drag state
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let componentStart = { x: 0, y: 0 };
    let dragStartTime = 0; // Track when drag started

    // Global handlers for smooth dragging
    let globalMoveHandler: any = null;
    let globalUpHandler: any = null;

    // Start drag
    displayObject.on("pointerdown", (e: any) => {
      console.log(
        `👆 pointerdown on ${component.getName()} (type: ${component.getComponentType()})`,
      );

      if (this.isWireMode || this.isDraggingFromToolbar) {
        console.log(
          `   ⏭️ Skipping - wireMode=${this.isWireMode}, draggingFromToolbar=${this.isDraggingFromToolbar}`,
        );
        return;
      }

      // Special handling for Switch / SPDT - toggle on click, don't drag
      if (
        component.getComponentType() === "switch" ||
        component.getComponentType() === "spdt_switch"
      ) {
        console.log(`🔘 Toggling switch: ${component.getName()}`);
        (component as Switch | SpdtSwitch).toggleSwitch();
        e.stopPropagation();
        return; // Don't start dragging
      }
      // Special handling for Push Button components - momentary press on hold
      if (component.getComponentType() === "push_button") {
        console.log(`🟦 Pressing push button: ${component.getName()}`);
        (component as any).pressButton?.();
        const release = () => {
          (component as any).releaseButton?.();
          window.removeEventListener("pointerup", release);
          window.removeEventListener("pointercancel", release);
        };
        window.addEventListener("pointerup", release);
        window.addEventListener("pointercancel", release);
        e.stopPropagation();
        return; // Don't start dragging
      }

      // Check if we're clicking on a node - if so, don't start dragging
      const localPos = displayObject.toLocal(e.global);
      const worldX = component.getPosition().x + localPos.x;
      const worldY = component.getPosition().y + localPos.y;
      const clickedNode = this.findNodeAt(component, worldX, worldY);

      if (clickedNode) {
        return;
      }

      // Mark as dragging IMMEDIATELY to prevent canvas panning
      isDragging = true;
      this.isDraggingComponent = true;
      this.draggedComponent = component;
      dragStartTime = Date.now(); // Record start time

      // Prevent event from bubbling
      e.stopPropagation();
      if (e.originalEvent) {
        e.originalEvent.stopPropagation();
        e.originalEvent.preventDefault();
      }

      // Store starting positions
      dragStart.x = e.global.x;
      dragStart.y = e.global.y;
      const pos = component.getPosition();
      componentStart.x = pos.x;
      componentStart.y = pos.y;

      // Bring component to front
      if (displayObject.parent) {
        displayObject.parent.setChildIndex(
          displayObject,
          displayObject.parent.children.length - 1,
        );
      }

      // Setup GLOBAL drag handlers to prevent fast mouse movement issues
      const app = this.app;

      // Global move handler - tracks mouse even when it leaves the component
      globalMoveHandler = (e: any) => {
        if (!isDragging) return;

        const deltaX = e.global.x - dragStart.x;
        const deltaY = e.global.y - dragStart.y;

        // Calculate new position in world coordinates
        const scale = this.zoomableContainer.scale.x;
        const newX = componentStart.x + deltaX / scale;
        const newY = componentStart.y + deltaY / scale;

        // Update component position
        component.setPosition(newX, newY);

        // Update connected wires in real-time during drag
        this.updateConnectedWires(component);

        // Update selection highlight if this component is selected
        if (this.selectedComponent === component) {
          this.createSelectionHighlight(component);
        }
      };

      // Global up handler - ends drag even if mouse is released outside component
      globalUpHandler = (e: any) => {
        if (!isDragging) return;

        // Ignore immediate pointerup (within 100ms) to prevent toolbar drop from ending drag
        const timeSinceDragStart = Date.now() - dragStartTime;
        if (timeSinceDragStart < 100) {
          return;
        }
        isDragging = false;
        this.isDraggingComponent = false;
        this.draggedComponent = null;

        // Clean up global handlers
        if (globalMoveHandler) {
          app.stage.off("pointermove", globalMoveHandler);
          globalMoveHandler = null;
        }
        if (globalUpHandler) {
          app.stage.off("pointerup", globalUpHandler);
          globalUpHandler = null;
        }

        // Snap to grid
        const currentPos = component.getPosition();
        const snappedPos = this.gridCanvas.snapToGrid(
          currentPos.x,
          currentPos.y,
        );
        component.setPosition(snappedPos.x, snappedPos.y);

        // Update all connected wires to reflect new position
        this.updateConnectedWires(component);

        // Update selection highlight if this component is selected
        if (this.selectedComponent === component) {
          this.createSelectionHighlight(component);
        }
      };

      // Ensure stage is interactive
      app.stage.eventMode = "static";

      // Attach global handlers
      app.stage.on("pointermove", globalMoveHandler);
      app.stage.on("pointerup", globalUpHandler);
    });

    // Click handler for selection (only if not dragging)
    displayObject.on("pointerup", (e: any) => {
      // Only handle selection if we weren't dragging
      if (!this.isDraggingComponent && !isDragging) {
        this.selectComponent(component);
        e.stopPropagation();
      }
    });

    console.log(`🎯 Added interaction handlers to ${component.getName()}`);
  }

  /**
   * Add modal animation CSS if not already present
   */
  private addModalAnimations(): void {
    if (document.getElementById("stemplitude-modal-animations")) return;

    const style = document.createElement("style");
    style.id = "stemplitude-modal-animations";
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
        from { transform: scale(0.95); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
      
      @keyframes stemplitude-modal-scale-out {
        from { transform: scale(1); opacity: 1; }
        to { transform: scale(0.95); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Delete a component from the circuit
   */
  private deleteComponent(component: CircuitComponent): void {
    const componentName = component.getName();

    // Remove from game objects
    this.gameObjects.delete(componentName);

    // Remove from display
    if (component.displayObject().parent) {
      component.displayObject().parent.removeChild(component.displayObject());
    }

    // Remove from wire system
    this.wireSystem.unregisterComponent(componentName);

    // Remove from interactive wire system (also deletes connected wires and visuals)
    this.interactiveWireIntegration.removeComponent(componentName);

    // Remove from circuit solver
    this.circuitSolver.removeComponent(componentName);

    // Remove from hybrid wire router
    this.unregisterComponentFromRouter(componentName);

    // Clear selection if this component was selected
    if (this.selectedComponent === component) {
      this.clearSelectionHighlight();
      this.selectedComponent = null;
    }

    // Destroy the component
    component.destroy();

    console.log(`🗑️ Component ${componentName} deleted successfully`);
  }

  /**
   * Create a property input field
   */
  private createPropertyField(
    label: string,
    value: string,
    type: string,
    onChange?: (value: string) => void,
  ): HTMLElement {
    const field = document.createElement("div");
    field.className = "property-field";

    const labelEl = document.createElement("label");
    labelEl.textContent = label;

    const input = document.createElement("input");
    input.type = type;
    input.value = value;

    // Add change event listener if callback provided
    if (onChange) {
      input.addEventListener("change", (e) => {
        const newValue = (e.target as HTMLInputElement).value;
        onChange(newValue);
      });
    }

    field.appendChild(labelEl);
    field.appendChild(input);

    return field;
  }

  /**
   * Get selected toolbar type
   */
  private getSelectedToolbarType(): string | null {
    const selected = this.toolbar.querySelector(".toolbar-item.selected");
    return selected ? selected.getAttribute("data-type") : null;
  }

  /**
   * Select component type in toolbar
   */
  private selectComponentType(type: string): void {
    // Remove previous selection
    this.toolbar.querySelectorAll(".toolbar-item").forEach((item) => {
      item.classList.remove("selected");
    });

    // Select new type
    const item = this.toolbar.querySelector(`[data-type="${type}"]`);
    if (item) {
      item.classList.add("selected");
    }

    // Exit wire mode
    this.cancelWireMode();
  }

  /**
   * Toggle simulation
   */
  private toggleSimulation(): void {
    if (this.isSimulationRunning) {
      this.stopSimulation();
    } else {
      this.startSimulation();
    }
  }

  /**
   * Start time-domain simulation
   */
  private startSimulation(): void {
    this.isSimulationRunning = true;
    setTransientSimulationRunning(true);

    this.simulationInterval = window.setInterval(() => {
      // Update AC sources voltage based on current time
      const currentTime = this.circuitSolver.getCurrentTime();
      this.gameObjects.forEach((obj) => {
        if (
          obj instanceof CircuitComponent &&
          obj.getComponentType() === "acsource"
        ) {
          (obj as ACSource).updateVoltageAtTime(currentTime);
        }
      });

      // Run simulation step
      this.circuitSolver.simulateTimeStep(this.timeStep);
      this.updateVisualEffects();
      const postStepTime = this.circuitSolver.getCurrentTime();

      // Record data for oscilloscopes
      this.gameObjects.forEach((obj) => {
        if (
          obj instanceof CircuitComponent &&
          obj.getComponentType() === "oscilloscope"
        ) {
          const props = obj.getCircuitProperties();
          (obj as Oscilloscope).recordData(
            postStepTime,
            props.voltage,
            props.current,
          );
        }
      });

      // Log transient data for capacitors (optional)
      this.gameObjects.forEach((obj) => {
        if (
          obj instanceof CircuitComponent &&
          obj.getComponentType() === "capacitor"
        ) {
          const props = obj.getCircuitProperties();
          console.log(
            `⚡ ${obj.getName()} - t=${postStepTime.toFixed(3)}s, V=${props.voltage.toFixed(3)}V, I=${props.current.toFixed(6)}A`,
          );
        }
      });
    }, this.timeStep * 1000); // Convert to milliseconds

    // Update UI
    const playStopButton = this.toolbar.querySelector(
      ".play-stop",
    ) as HTMLButtonElement;
    if (playStopButton) {
      playStopButton.textContent = "⏹️ Stop";
    }

    console.log("▶️ Circuit simulation started (transient analysis enabled)");
    console.log(`⏱️ Time step: ${this.timeStep * 1000}ms`);
  }

  /**
   * Stop simulation
   */
  private stopSimulation(): void {
    this.isSimulationRunning = false;
    setTransientSimulationRunning(false);

    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    // Reset solver state (clears capacitor/inductor previous state)
    this.circuitSolver.reset();

    // Reset all component states to default (turn off LEDs, reset displays, etc.)
    this.gameObjects.forEach((gameObject) => {
      if (gameObject instanceof CircuitComponent) {
        gameObject.updateCircuitState(0, 0);
      }
    });

    // Clear wire flow debug visuals (particles + arrows + glow) immediately.
    this.wireParticleSystem?.clearVisuals();
    this.wireDirectionHistory.clear();

    // Update UI
    const playStopButton = this.toolbar.querySelector(
      ".play-stop",
    ) as HTMLButtonElement;
    if (playStopButton) {
      playStopButton.textContent = "▶️ Start";
    }

    console.log("⏹️ Circuit simulation stopped");
  }

  /**
   * Reset simulation
   */
  private resetSimulation(): void {
    this.stopSimulation();
    this.circuitSolver.reset();

    // Reset all component visual states
    this.gameObjects.forEach((gameObject) => {
      if (gameObject instanceof CircuitComponent) {
        gameObject.updateCircuitState(0, 0);
      }
    });

    console.log("🔄 Circuit simulation reset");
  }

  /**
   * Run DC analysis
   */
  private runDCAnalysis(): void {
    const success = this.circuitSolver.solveDC();

    if (success) {
      const results = this.circuitSolver.getAnalysisResults();
      const snapshot = this.circuitSolver.getSimulationSnapshot();
      console.log("⚡ DC Analysis Results:", results);

      // Update wire systems with typed snapshot data (includes terminal currents)
      const snapshotResults = { ...results, ...snapshot };
      this.wireSystem.updateWireStates(snapshotResults);
      this.interactiveWireIntegration.updateWireStates(snapshotResults);

      this.showAnalysisResults(results);
    } else {
      console.error("❌ DC analysis failed");
    }
  }

  /**
   * Summary payload used by gamification rules to evaluate measurable outputs.
   */
  public getGamificationOutputSummary(): Record<string, unknown> {
    let solverResults: unknown = {};
    let currentTime = 0;
    try {
      solverResults = this.circuitSolver.getAnalysisResults();
      currentTime = this.circuitSolver.getCurrentTime();
    } catch {
      // Keep fallback summary shape stable even if solver state is unavailable.
    }

    const components: Array<Record<string, unknown>> = [];
    let totalCurrent = 0;
    let totalAbsCurrent = 0;
    let maxVoltage = Number.NEGATIVE_INFINITY;
    let minVoltage = Number.POSITIVE_INFINITY;

    this.gameObjects.forEach((obj) => {
      if (!(obj instanceof CircuitComponent)) return;
      const props = obj.getCircuitProperties();
      const voltage = Number(props.voltage || 0);
      const current = Number(props.current || 0);
      totalCurrent += current;
      totalAbsCurrent += Math.abs(current);
      maxVoltage = Math.max(maxVoltage, voltage);
      minVoltage = Math.min(minVoltage, voltage);
      components.push({
        id: obj.getName(),
        type: obj.getComponentType(),
        voltage_v: voltage,
        current_a: current,
        power_w: Number(props.power || 0),
        burnt: Boolean(props.burnt),
        glowing: Boolean(props.glowing),
      });
    });

    return {
      analysis_modes: ["dc", "transient"],
      measurement_types: ["voltage", "current", "power"],
      dc: {
        available: true,
        solver_results: solverResults,
      },
      transient: {
        available: true,
        simulation_running: this.isSimulationRunning,
        time_s: currentTime,
        step_s: this.timeStep,
      },
      outputs: {
        component_count: components.length,
        voltage_max_v: Number.isFinite(maxVoltage) ? maxVoltage : 0,
        voltage_min_v: Number.isFinite(minVoltage) ? minVoltage : 0,
        current_total_a: totalCurrent,
        current_total_abs_a: totalAbsCurrent,
        components,
      },
    };
  }

  /**
   * Show analysis results
   */
  private showAnalysisResults(results: any): void {
    // Create a simple results display
    const resultsDiv = document.createElement("div");
    resultsDiv.className = "analysis-results";
    resultsDiv.innerHTML = `
      <h3>DC Analysis Results</h3>
      <pre>${JSON.stringify(results, null, 2)}</pre>
      <button onclick="this.parentElement.remove()">Close</button>
    `;

    document.body.appendChild(resultsDiv);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (resultsDiv.parentElement) {
        resultsDiv.remove();
      }
    }, 10000);
  }

  /**
   * Update visual effects during simulation
   */
  private updateVisualEffects(): void {
    const results = this.circuitSolver.getAnalysisResults();
    const snapshot = this.circuitSolver.getSimulationSnapshot();
    const combined = { ...results, ...snapshot };
    this.wireSystem.updateWireStates(combined);
    this.interactiveWireIntegration.updateWireStates(combined);

    // Update component runtime states and education badges
    this.gameObjects.forEach((obj) => {
      if (obj instanceof CircuitComponent) {
        const compType = obj.getComponentType();
        const compId = obj.getName();
        const props = obj.getCircuitProperties();
        obj.runtimeState = resolveComponentState(
          compType,
          compId,
          props as unknown as Record<string, unknown>,
          snapshot,
        );

        // Update warning badges
        if (this.educationOverlays) {
          const pos = obj.getPosition();
          this.educationOverlays.updateBadges(
            compId,
            pos.x,
            pos.y,
            obj.runtimeState,
          );
        }
      }
    });

    // Update EveryCircuit-style wire particle animation
    if (this.wireParticleSystem) {
      const wireStates = new Map<
        string,
        import("./types/WireTypes").WireVisualState
      >();

      // Get wires from the interactive wire system (where all user-created wires live)
      const interactiveWires = this.interactiveWireIntegration.getWires();

      interactiveWires.forEach((wire, wireId) => {
        const absI = Math.abs(wire.current);
        const threshold = 0.001;
        const energized = absI > threshold;
        const normalizedI = Math.min(absI / 1.0, 1.0);

        // Flow polarity: InteractiveWireIntegration.updateWireStates() sets
        // flowDirEndpoint from terminal currents. Path mapping uses only
        // wire endpoint geometry (startEp/endEp), not flowSource/flowSink.
        const endpoints = wire.nodes.filter((n: any) => n.type === "component");
        const startEp = endpoints[0];
        const endEp = endpoints[1];
        const logicalDir =
          wire.current > threshold ? 1 : wire.current < -threshold ? -1 : 0;
        const flowDirEndpoint = (wire as any).flowDirEndpoint as
          | "startToEnd"
          | "endToStart"
          | "unknown"
          | undefined;
        const canonicalFlowDir =
          flowDirEndpoint === "startToEnd"
            ? 1
            : flowDirEndpoint === "endToStart"
              ? -1
              : logicalDir;

        // Map canonical endpoint direction to Pixi path parameter (0..1) using
        // path orientation cached per routed wire geometry.
        let renderDir: 0 | 1 | -1 = 0;
        if (wire.segments && wire.segments.length > 0) {
          const pathOrientation = this.updateWirePathCacheAndOrientation(
            wireId,
            wire,
            startEp,
            endEp,
          );
          if (canonicalFlowDir !== 0) {
            renderDir = (canonicalFlowDir * pathOrientation) as 1 | -1;
          }
        }

        wireStates.set(wireId, {
          currentMagnitude: absI,
          currentDirection: renderDir as 1 | -1 | 0,
          energized,
          particleRate: energized ? 0.2 + normalizedI * 0.8 : 0,
          glowLevel: energized ? normalizedI * 0.8 : 0,
          debugText: `I=${wire.current.toFixed(4)} R=${renderDir} F=${flowDirEndpoint ?? "na"}`,
        });
      });

      if (CircuitScene.ENABLE_WIRE_FLOW_DEBUG) {
        this.validateWireFlowInvariants(interactiveWires, wireStates, snapshot);
      }
      this.wireParticleSystem.update(16, wireStates);
    }
  }

  /**
   * Map wire endpoints (first/last component pins) to polyline direction.
   * Must NOT use flowSource/flowSink here: canonicalFlowDir is already expressed
   * relative to wire endpoint order (startEp → endEp). Aligning the path to
   * source→sink as well would double-apply the flow flip and reverse particles
   * on e.g. battery legs when the user drew the wire resistor→battery+ .
   */
  private updateWirePathCacheAndOrientation(
    wireId: string,
    wire: any,
    startEp: any,
    endEp: any,
  ): 1 | -1 {
    if (!wire.segments || wire.segments.length === 0) {
      return this.wirePathOrientations.get(wireId) ?? 1;
    }

    const signature = wire.segments
      .map(
        (seg: any) =>
          `${seg.start.x.toFixed(2)},${seg.start.y.toFixed(2)}->${seg.end.x.toFixed(2)},${seg.end.y.toFixed(2)}`,
      )
      .join("|");
    const previousSignature = this.wirePathSignatures.get(wireId);
    if (previousSignature === signature) {
      return this.wirePathOrientations.get(wireId) ?? 1;
    }

    this.wirePathSignatures.set(wireId, signature);
    const pathSegments = wire.segments.map((seg: any) => ({
      start: { x: seg.start.x, y: seg.start.y },
      end: { x: seg.end.x, y: seg.end.y },
    }));
    this.wireParticleSystem!.updateWirePaths(wireId, pathSegments);

    const pathStart = wire.segments[0].start;
    const pathEnd = wire.segments[wire.segments.length - 1].end;
    const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

    let orientation: 1 | -1 = this.wirePathOrientations.get(wireId) ?? 1;
    if (startEp && endEp) {
      const sum01 = dist2(pathStart, startEp) + dist2(pathEnd, endEp);
      const sum10 = dist2(pathStart, endEp) + dist2(pathEnd, startEp);
      orientation = sum01 <= sum10 ? 1 : -1;
    }
    this.wirePathOrientations.set(wireId, orientation);
    return orientation;
  }

  private validateWireFlowInvariants(
    interactiveWires: Map<string, any>,
    wireStates: Map<string, import("./types/WireTypes").WireVisualState>,
    snapshot: any,
  ): void {
    const issues: string[] = [];
    const flipThreshold = 1e-3;
    const now = performance.now();

    interactiveWires.forEach((wire, wireId) => {
      const state = wireStates.get(wireId);
      if (!state) return;

      const prevDir = this.wireDirectionHistory.get(wireId) ?? 0;
      if (
        prevDir !== 0 &&
        state.currentDirection !== 0 &&
        prevDir !== state.currentDirection &&
        Math.abs(wire.current) > flipThreshold
      ) {
        issues.push(
          `direction flip on ${wireId}: ${prevDir} -> ${state.currentDirection}`,
        );
      }

      const flowDirEndpoint = (wire as any).flowDirEndpoint as
        | "startToEnd"
        | "endToStart"
        | "unknown"
        | undefined;
      const endpointFlowSign =
        flowDirEndpoint === "startToEnd"
          ? 1
          : flowDirEndpoint === "endToStart"
            ? -1
            : 0;
      const pathOrientation = this.wirePathOrientations.get(wireId) ?? 1;
      if (endpointFlowSign !== 0) {
        const expectedDir = (endpointFlowSign * pathOrientation) as 1 | -1;
        if (
          state.currentDirection !== 0 &&
          state.currentDirection !== expectedDir
        ) {
          issues.push(
            `render/sign mismatch on ${wireId}: expected ${expectedDir} got ${state.currentDirection}`,
          );
        }
      }

      const endpoints = wire.nodes.filter((n: any) => n.type === "component");
      const startEp = endpoints[0];
      const endEp = endpoints[1];
      const startV =
        snapshot?.componentTerminalVoltages?.[startEp?.componentId]?.[
          startEp?.nodeId
        ];
      const endV =
        snapshot?.componentTerminalVoltages?.[endEp?.componentId]?.[
          endEp?.nodeId
        ];
      if (
        Number.isFinite(startV) &&
        Number.isFinite(endV) &&
        Math.abs((startV as number) - (endV as number)) > 1e-4 &&
        state.currentDirection !== 0
      ) {
        const endpointDir = (startV as number) >= (endV as number) ? 1 : -1;
        const expectedDir = (endpointDir * pathOrientation) as 1 | -1;
        if (expectedDir !== state.currentDirection) {
          issues.push(
            `voltage-gradient mismatch on ${wireId}: expected ${expectedDir} got ${state.currentDirection}`,
          );
        }
      }
    });

    // Simple scripted scenario check for the common single-loop sanity case.
    const activeDirections = Array.from(wireStates.values())
      .filter((s) => s.currentDirection !== 0)
      .map((s) => s.currentDirection);
    const hasPositiveFlow = activeDirections.some((d) => d === 1);
    const hasNegativeFlow = activeDirections.some((d) => d === -1);
    if (activeDirections.length >= 4 && !(hasPositiveFlow && hasNegativeFlow)) {
      issues.push(
        "single-loop sanity: expected mixed path directions, got uniform",
      );
    }

    if (issues.length > 0 && now - this.lastWireInvariantWarningMs > 1000) {
      this.lastWireInvariantWarningMs = now;
      console.warn("⚠️ Wire flow invariant violations:", issues.slice(0, 6));
    }

    const liveIds = new Set(interactiveWires.keys());
    for (const wireId of Array.from(this.wireDirectionHistory.keys())) {
      if (!liveIds.has(wireId)) {
        this.wireDirectionHistory.delete(wireId);
        this.wirePathSignatures.delete(wireId);
        this.wirePathOrientations.delete(wireId);
      }
    }
    wireStates.forEach((state, wireId) => {
      this.wireDirectionHistory.set(wireId, state.currentDirection);
    });
  }

  /**
   * Handle mouse events for component dragging
   */
  private onCanvasMouseDown(event: MouseEvent): void {
    // Implementation for component dragging
  }

  private onCanvasMouseMove(event: MouseEvent): void {
    // Update wire preview if in wire mode (priority over other interactions)
    if (this.isWireMode) {
      event.preventDefault();
      event.stopPropagation();
      this.updateWirePreview(event.clientX, event.clientY);
      return;
    }

    // Hover tooltip for components
    if (this.educationOverlays && this.isSimulationRunning) {
      const worldPos = this.screenToWorldCoordinates(
        event.clientX,
        event.clientY,
      );
      const hovered = this.findComponentAt(worldPos.x, worldPos.y);
      if (hovered) {
        const lines = this.educationOverlays.getComponentTooltipLines(
          hovered.getComponentType(),
          hovered.getName(),
          hovered.runtimeState,
        );
        this.educationOverlays.showTooltip(event.clientX, event.clientY, lines);
      } else {
        this.educationOverlays.hideTooltip();
      }
    }
  }

  private onCanvasMouseUp(event: MouseEvent): void {
    // Implementation for component dragging
  }

  /**
   * Handle keyboard shortcuts
   */
  private onKeyDown(event: KeyboardEvent): void {
    // Ignore keyboard shortcuts when user is typing in an input field
    const target = event.target as HTMLElement;
    const isInputField =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable;

    switch (event.key) {
      case "Escape":
        // Cancel wire mode if active, otherwise deselect
        if (this.isWireMode) {
          this.cancelWireMode();
        } else if (this.selectedWireId) {
          this.deselectWire();
        } else {
          this.selectComponent(null);
        }
        break;
      case "Delete":
      case "Backspace":
        if (!isInputField) {
          if (this.selectedWireId) {
            this.deleteSelectedWire();
          } else if (this.selectedComponent) {
            void this.showDeleteConfirmationDialog(this.selectedComponent);
          }
        }
        break;
      case "r":
        if (event.ctrlKey) {
          event.preventDefault();
          this.selectComponentType("resistor");
        }
        break;
      case "c":
        if (event.ctrlKey) {
          event.preventDefault();
          this.selectComponentType("capacitor");
        }
        break;
      case "w":
        if (event.ctrlKey) {
          event.preventDefault();
          this.toggleWireMode();
        }
        break;
      case " ":
        event.preventDefault();
        this.toggleSimulation();
        break;
      case "/":
        if (this.isWireMode) {
          event.preventDefault();
          this.wireBendPreference =
            this.wireBendPreference === "horizontal-first"
              ? "vertical-first"
              : "horizontal-first";
        }
        break;
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    // Handle key releases if needed
  }

  /**
   * Cleanup UI elements
   */
  private cleanupUI(): void {
    if (this.toolbar && this.toolbar.parentElement) {
      this.toolbar.remove();
    }

    if (this.propertiesPanel && this.propertiesPanel.parentElement) {
      this.propertiesPanel.remove();
    }

    // Remove zoom controls
    const zoomControls = document.getElementById("circuit-zoom-controls");
    if (zoomControls) {
      zoomControls.remove();
    }

    // Remove any temporary UI elements
    document.querySelectorAll(".analysis-results").forEach((el) => el.remove());
    document.body.classList.remove("wire-mode");

    // Clean up resize handlers
    if ((this as any).resizeHandler) {
      window.removeEventListener("resize", (this as any).resizeHandler);
    }
    if ((this as any).resizeObserver) {
      (this as any).resizeObserver.disconnect();
    }

    // Clean up drag-and-drop document listeners
    if ((this as any)._dragMoveHandler) {
      document.removeEventListener("mousemove", (this as any)._dragMoveHandler);
    }
    if ((this as any)._dragUpHandler) {
      document.removeEventListener("mouseup", (this as any)._dragUpHandler);
    }
  }

  /**
   * Create zoom controls for the circuit scene
   */
  private createZoomControls(): void {
    // Remove existing zoom controls if they exist
    const existing = document.getElementById("circuit-zoom-controls");
    if (existing) {
      existing.remove();
    }

    const zoomControls = document.createElement("div");
    zoomControls.id = "circuit-zoom-controls";
    zoomControls.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 260px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 1000;
      background: rgba(30, 30, 30, 0.95);
      border: 1px solid #444;
      border-radius: 8px;
      padding: 8px;
      backdrop-filter: blur(10px);
    `;

    // Zoom In button
    const zoomInBtn = document.createElement("button");
    zoomInBtn.style.cssText = `
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 6px;
      background: #3498db;
      color: white;
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
    this.addTooltip(zoomInBtn, "Zoom In");

    // Zoom Out button
    const zoomOutBtn = document.createElement("button");
    zoomOutBtn.style.cssText = `
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 6px;
      background: #e74c3c;
      color: white;
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
    this.addTooltip(zoomOutBtn, "Zoom Out");

    // Center button
    const centerBtn = document.createElement("button");
    centerBtn.style.cssText = `
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 6px;
      background: #f39c12;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      padding: 8px;
    `;

    const centerIcon = document.createElement("img");
    centerIcon.src = "/assets/center-to-fit.svg";
    centerIcon.style.cssText = `
      width: 20px;
      height: 20px;
      filter: brightness(0) invert(1);
    `;
    centerBtn.appendChild(centerIcon);
    this.addTooltip(centerBtn, "Center to (0,0)");

    // Help button
    const helpBtn = document.createElement("button");
    helpBtn.style.cssText = `
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 6px;
      background: #9b59b6;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      font-size: 14px;
      font-weight: bold;
    `;
    helpBtn.innerHTML = "?";
    this.addTooltip(helpBtn, "Keyboard Shortcuts");

    // Add hover effects
    [zoomInBtn, zoomOutBtn, centerBtn, helpBtn].forEach((btn) => {
      btn.addEventListener("mouseenter", () => {
        btn.style.transform = "scale(1.1)";
        btn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "scale(1)";
        btn.style.boxShadow = "none";
      });
    });

    // Event listeners
    zoomInBtn.addEventListener("click", () => {
      this.zoomIn();
      console.log(
        `🔍 Zoomed in - Level: ${(this.getZoomLevel() * 100).toFixed(0)}%`,
      );
    });

    zoomOutBtn.addEventListener("click", () => {
      this.zoomOut();
      console.log(
        `🔍 Zoomed out - Level: ${(this.getZoomLevel() * 100).toFixed(0)}%`,
      );
    });

    centerBtn.addEventListener("click", () => {
      this.recenterCamera();
      console.log("🎯 Camera centered on components");
    });

    helpBtn.addEventListener("click", () => {
      this.showKeyboardShortcuts();
    });

    // Test button for wire routing
    const testBtn = document.createElement("button");
    testBtn.style.cssText = helpBtn.style.cssText;
    testBtn.style.background = "#e74c3c";
    testBtn.innerHTML = "🧪";
    this.addTooltip(testBtn, "Test Wire Routing");

    testBtn.addEventListener("mouseenter", () => {
      testBtn.style.transform = "scale(1.1)";
      testBtn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    });
    testBtn.addEventListener("mouseleave", () => {
      testBtn.style.transform = "scale(1)";
      testBtn.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    });

    testBtn.addEventListener("click", () => {
      this.testOpenSourceRouting();
    });

    // Add buttons to controls
    zoomControls.appendChild(zoomInBtn);
    zoomControls.appendChild(zoomOutBtn);
    zoomControls.appendChild(centerBtn);
    zoomControls.appendChild(helpBtn);
    zoomControls.appendChild(testBtn);

    document.body.appendChild(zoomControls);
  }

  /**
   * Setup canvas panning functionality
   */
  private setupCanvasPanning(): void {
    const canvas = this.app.canvas;
    let panStarted = false;

    // Mouse down - start panning or selection rectangle
    const onMouseDown = (event: MouseEvent) => {
      // Don't handle if:
      // 1. Right click (context menu)
      // 2. Wire mode is active
      // 3. Component is being dragged
      // 4. Component was just placed (within 300ms)
      const timeSincePlacement = Date.now() - this.lastComponentPlacedTime;
      if (
        event.button === 2 ||
        this.isWireMode ||
        this.isDragging ||
        this.isDraggingComponent ||
        timeSincePlacement < 300
      ) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;

      // Convert to world coordinates
      const containerScale = this.zoomableContainer.scale.x;
      const worldX = (screenX - this.zoomableContainer.x) / containerScale;
      const worldY = (screenY - this.zoomableContainer.y) / containerScale;

      // Check if we hit a component
      const hitObject = this.findComponentAt(worldX, worldY);
      console.log(
        `🎯 Hit test at screen (${screenX.toFixed(0)}, ${screenY.toFixed(0)}) -> world (${worldX.toFixed(0)}, ${worldY.toFixed(0)}): ${hitObject ? hitObject.getName() : "null"}`,
      );

      // Shift + Drag = Pan
      if (event.shiftKey) {
        console.log("🔄 Shift held - starting pan");
        this.isPanningCanvas = true;
        panStarted = true;

        // Store start positions
        this.panStartPosition.x = screenX;
        this.panStartPosition.y = screenY;

        const cameraPos = this.getCameraPosition();
        this.cameraStartPosition.x = cameraPos.x;
        this.cameraStartPosition.y = cameraPos.y;

        canvas.style.cursor = "grabbing";
        console.log("🔄 Panning canvas - drag to move around");
        return;
      }

      // Regular drag on empty canvas = Selection rectangle
      if (!hitObject) {
        console.log("📦 Starting selection rectangle");
        this.isSelectingRectangle = true;
        this.selectionRectStart = { x: worldX, y: worldY };

        // Create selection rectangle graphics
        this.selectionRectGraphics = new Graphics();
        this.zoomableContainer.addChild(this.selectionRectGraphics);

        canvas.style.cursor = "crosshair";
      }
    };

    // Mouse move - handle panning or selection rectangle
    const onMouseMove = (event: MouseEvent) => {
      // Stop actions if wire mode or component dragging becomes active
      if (this.isWireMode || this.isDraggingComponent) {
        this.isPanningCanvas = false;
        this.isSelectingRectangle = false;
        panStarted = false;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const containerScale = this.zoomableContainer.scale.x;
      const worldX = (screenX - this.zoomableContainer.x) / containerScale;
      const worldY = (screenY - this.zoomableContainer.y) / containerScale;

      // Handle panning
      if (this.isPanningCanvas && panStarted) {
        const currentX = screenX;
        const currentY = screenY;

        // Calculate pan delta from start position
        const deltaX = currentX - this.panStartPosition.x;
        const deltaY = currentY - this.panStartPosition.y;

        // Apply sensitivity multiplier to reduce panning speed
        const panSensitivity = 0.6; // Lower = slower panning (0.5 = half speed)

        // Set camera to new absolute position (not delta)
        this.zoomableContainer.x =
          this.cameraStartPosition.x + deltaX * panSensitivity;
        this.zoomableContainer.y =
          this.cameraStartPosition.y + deltaY * panSensitivity;

        // Update grid coordinate labels and transform controls
        this.updateGridCoordinateLabels();
        this.updateTransformControlsPosition();
        return;
      }

      // Handle selection rectangle
      if (
        this.isSelectingRectangle &&
        this.selectionRectStart &&
        this.selectionRectGraphics
      ) {
        const startX = this.selectionRectStart.x;
        const startY = this.selectionRectStart.y;
        const width = worldX - startX;
        const height = worldY - startY;

        // Draw selection rectangle
        this.selectionRectGraphics.clear();
        this.selectionRectGraphics.rect(startX, startY, width, height);
        this.selectionRectGraphics.stroke({
          width: 2,
          color: 0x3498db,
          alpha: 0.8,
        });
        this.selectionRectGraphics.fill({ color: 0x3498db, alpha: 0.1 });
      }
    };

    // Mouse up - stop panning or finalize selection
    const onMouseUp = (event: MouseEvent) => {
      // Handle panning end
      if (this.isPanningCanvas && panStarted) {
        console.log("🔄 Canvas panning ended");
        this.isPanningCanvas = false;
        panStarted = false;

        // Update transform controls position after panning
        this.updateTransformControlsPosition();
        canvas.style.cursor = "default";
      }

      // Handle selection rectangle end
      if (this.isSelectingRectangle && this.selectionRectStart) {
        const rect = canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const containerScale = this.zoomableContainer.scale.x;
        const worldX = (screenX - this.zoomableContainer.x) / containerScale;
        const worldY = (screenY - this.zoomableContainer.y) / containerScale;

        // Calculate selection bounds
        const minX = Math.min(this.selectionRectStart.x, worldX);
        const maxX = Math.max(this.selectionRectStart.x, worldX);
        const minY = Math.min(this.selectionRectStart.y, worldY);
        const maxY = Math.max(this.selectionRectStart.y, worldY);

        // Find all components within bounds
        this.selectComponentsInRect(minX, minY, maxX, maxY);

        // Clean up
        this.isSelectingRectangle = false;
        this.selectionRectStart = null;
        if (this.selectionRectGraphics) {
          this.selectionRectGraphics.destroy();
          this.selectionRectGraphics = null;
        }
        canvas.style.cursor = "default";

        console.log(
          `📦 Selection complete - ${this.selectedComponents.size} components selected`,
        );
      }
    };

    // Add event listeners
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp); // Stop panning if mouse leaves canvas

    // Note: Wheel zoom is handled in overrideWheelZoom() method
  }

  /**
   * Setup keyboard shortcuts for zoom and pan
   */
  private setupKeyboardShortcuts(): void {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when circuit scene is active
      if (!this.isActive) return;

      // Prevent shortcuts when typing in input fields
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case "+":
        case "=":
          event.preventDefault();
          this.zoomIn();
          console.log(
            `⌨️ Keyboard zoom in - Level: ${(this.getZoomLevel() * 100).toFixed(0)}%`,
          );
          break;

        case "-":
        case "_":
          event.preventDefault();
          this.zoomOut();
          console.log(
            `⌨️ Keyboard zoom out - Level: ${(this.getZoomLevel() * 100).toFixed(0)}%`,
          );
          break;

        case "0":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            this.resetCamera();
            console.log("⌨️ Camera reset to origin");
          }
          break;

        case "c":
          if (event.ctrlKey || event.metaKey) {
            // Don't interfere with copy operations
            return;
          }
          event.preventDefault();
          this.recenterCamera();
          console.log("⌨️ Camera centered on components");
          break;

        case "f":
          event.preventDefault();
          this.recenterCamera();
          console.log("⌨️ Fit all components in view");
          break;

        case "delete":
        case "backspace":
          event.preventDefault();
          void this.deleteSelectedComponents();
          console.log("⌨️ Delete key pressed");
          break;
      }

      // Arrow key panning
      const panDistance = 50;
      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          this.panCamera(0, panDistance);
          break;
        case "ArrowDown":
          event.preventDefault();
          this.panCamera(0, -panDistance);
          break;
        case "ArrowLeft":
          event.preventDefault();
          this.panCamera(panDistance, 0);
          break;
        case "ArrowRight":
          event.preventDefault();
          this.panCamera(-panDistance, 0);
          break;
      }
    };

    // Add event listener
    document.addEventListener("keydown", handleKeyDown);

    // Store reference for cleanup
    (this as any).keyboardHandler = handleKeyDown;
  }

  /**
   * Show keyboard shortcuts help dialog
   */
  private showKeyboardShortcuts(): void {
    // Remove existing dialog if present
    const existing = document.getElementById("keyboard-shortcuts-dialog");
    if (existing) {
      existing.remove();
      return; // Toggle off if already showing
    }

    const dialog = document.createElement("div");
    dialog.id = "keyboard-shortcuts-dialog";
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(20, 20, 20, 0.95);
      border: 2px solid #444;
      border-radius: 12px;
      padding: 20px;
      z-index: 2000;
      color: white;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      max-width: 400px;
      animation: fadeIn 0.3s ease-out;
    `;

    dialog.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h3 style="margin: 0; color: #3498db;">⌨️ Keyboard Shortcuts</h3>
        <button id="close-shortcuts" style="
          background: none;
          border: none;
          color: #ccc;
          font-size: 20px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
        ">×</button>
      </div>
      <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 14px;">
        <strong style="color: #f39c12;">Zoom:</strong>
        <span><kbd>+</kbd> / <kbd>=</kbd> Zoom In, <kbd>-</kbd> Zoom Out</span>
        
        <strong style="color: #f39c12;">Pan:</strong>
        <span><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> Arrow Keys</span>
        
        <strong style="color: #f39c12;">Camera:</strong>
        <span><kbd>C</kbd> Center, <kbd>F</kbd> Fit All, <kbd>Ctrl+0</kbd> Reset</span>
        
        <strong style="color: #f39c12;">Mouse:</strong>
        <span>Scroll Wheel to Zoom, Shift+Drag to Pan</span>
        
        <strong style="color: #f39c12;">Wire Mode:</strong>
        <span>Click components to connect with wires</span>
      </div>
      <div style="margin-top: 15px; text-align: center; font-size: 12px; color: #888;">
        Click anywhere outside to close
      </div>
    `;

    // Add CSS animation
    const style = document.createElement("style");
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      kbd {
        background: #333;
        border: 1px solid #555;
        border-radius: 3px;
        padding: 2px 6px;
        font-size: 11px;
        font-family: monospace;
        color: #fff;
        margin: 0 2px;
      }
    `;
    document.head.appendChild(style);

    // Close button event
    dialog.querySelector("#close-shortcuts")?.addEventListener("click", () => {
      dialog.remove();
    });

    // Click outside to close
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 1999;
    `;
    overlay.addEventListener("click", () => {
      dialog.remove();
      overlay.remove();
    });

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    // Auto-close after 10 seconds
    setTimeout(() => {
      if (document.getElementById("keyboard-shortcuts-dialog")) {
        dialog.remove();
        overlay.remove();
      }
    }, 10000);
  }

  /**
   * Setup window resize handler to keep grid full screen
   */
  private setupResizeHandler(): void {
    const handleResize = () => {
      if (!this.isActive) return;

      const container = document.getElementById("pixi-container");
      if (!container) {
        console.warn("⚠️ pixi-container not found");
        return;
      }

      const screenWidth = container.clientWidth;
      const screenHeight = container.clientHeight;

      // PIXI's resizeTo option should handle renderer resize automatically,
      // but we manually resize the renderer to ensure it happens immediately
      if (this.app && this.app.renderer) {
        this.app.renderer.resize(screenWidth, screenHeight);
      }

      // Recreate grid canvas with new dimensions
      this.gridContainer.removeChild(this.gridCanvas.getContainer());
      this.gridCanvas.destroy();

      this.gridCanvas = new GridCanvas(screenWidth, screenHeight, {
        size: 20,
        majorGridLines: 5,
        showGrid: true,
        snapToGrid: true,
      });

      // Re-add to grid container (at index 0 to keep it below zoomable content)
      this.gridContainer.addChildAt(this.gridCanvas.getContainer(), 0);

    };

    // Use ResizeObserver for more reliable resize detection
    const container = document.getElementById("pixi-container");
    if (container && typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(container);
      (this as any).resizeObserver = resizeObserver;
    } else {
      console.warn("⚠️ ResizeObserver not available or container not found");
    }

    // Also listen to window resize as fallback
    window.addEventListener("resize", handleResize);

    // Store reference for cleanup
    (this as any).resizeHandler = handleResize;
  }

  /**
   * Force initial grid render to prevent blank screen
   */
  private forceGridRender(): void {
    // Ensure grid is properly added and rendered
    if (this.gridCanvas && this.gridContainer) {
      const gridCanvasContainer = this.gridCanvas.getContainer();
      if (!this.gridContainer.children.includes(gridCanvasContainer)) {
        this.gridContainer.addChild(gridCanvasContainer);
      }

      // Force a render update
      setTimeout(() => {
        if (this.gameManager && this.gameManager.getApp()) {
          this.gameManager.getApp().renderer.render(this.sceneContainer);
        }
      }, 100);

    }
  }

  /**
   * Cleanup when scene is destroyed
   */
  public override destroy(): void {
    this.stopSimulation();
    this.cleanupUI();

    // Clean up drag preview
    if (this.dragPreview) {
      this.dragPreview.remove();
      this.dragPreview = null;
    }

    // Clean up selection highlight
    this.clearSelectionHighlight();

    // Clean up node highlight
    this.clearNodeHighlight();

    // Clean up wire preview
    this.clearWirePreview();

    // Clean up trash bin
    const trashBin = document.getElementById("circuit-trash-bin");
    if (trashBin) {
      trashBin.remove();
    }

    // Cancel wire mode
    if (this.isWireMode) {
      this.cancelWireMode();
    }

    // Remove keyboard event listener
    if ((this as any).keyboardHandler) {
      document.removeEventListener("keydown", (this as any).keyboardHandler);
    }

    // Remove resize handler
    if ((this as any).resizeHandler) {
      window.removeEventListener("resize", (this as any).resizeHandler);
    }

    // Remove wheel handler
    if ((this as any).wheelHandler) {
      this.app.canvas.removeEventListener("wheel", (this as any).wheelHandler, {
        capture: true,
      });
    }

    // Remove switch state change event listener
    if ((this as any).switchStateHandler) {
      window.removeEventListener(
        "switch-state-changed",
        (this as any).switchStateHandler,
      );
    }

    // Remove zoom controls
    const zoomControls = document.getElementById("circuit-zoom-controls");
    if (zoomControls) {
      zoomControls.remove();
    }

    this.wireSystem.destroy();
    this.gridCanvas.destroy();

    // Clean up wire:disconnected listener
    if (this._wireDisconnectHandler) {
      (window as any).removeEventListener?.(
        "wire:disconnected",
        this._wireDisconnectHandler,
      );
      this._wireDisconnectHandler = null;
    }

    // Clean up interactive wire system
    this.interactiveWireIntegration.destroy();
    this.wireEditToggle.destroy();

    // Clean up hybrid wire router
    this.hybridWireRouter.clear();
    this.wirePathSignatures.clear();
    this.wirePathOrientations.clear();
    this.wireDirectionHistory.clear();

    super.destroy();
  }

  public override clearScene(): void {
    this.resetCircuitState();
  }

  public exportSnapshot(): CircuitSceneSnapshot {
    const components: CircuitSceneSnapshotComponent[] = [];
    this.gameObjects.forEach((obj) => {
      if (!(obj instanceof CircuitComponent)) return;
      components.push({
        name: obj.getName(),
        type: obj.getComponentType(),
        gridPosition: obj.getGridPosition(),
        orientation: obj.getOrientation(),
        properties:
          JSON.parse(JSON.stringify(obj.getCircuitProperties() ?? {})) ?? {},
      });
    });

    const wires: CircuitSceneSnapshotWire[] = [];
    this.interactiveWireIntegration.getWires().forEach((wire) => {
      const endpoints = (wire.nodes ?? []).filter((n: any) => n.type === "component");
      if (endpoints.length >= 2) {
        const start = endpoints[0];
        const end = endpoints[endpoints.length - 1];
        if (
          start?.componentId &&
          start?.nodeId &&
          end?.componentId &&
          end?.nodeId
        ) {
          wires.push({
            id: wire.id,
            kind: "component_to_component",
            start: { componentId: start.componentId, nodeId: start.nodeId },
            end: { componentId: end.componentId, nodeId: end.nodeId },
          });
        }
        return;
      }

      if (endpoints.length === 1) {
        const start = endpoints[0];
        const junction = (wire.nodes ?? []).find((n: any) => n.type === "junction");
        const targetWireId = junction?.connectedWires?.find(
          (id: string) => id !== wire.id,
        );
        if (start?.componentId && start?.nodeId && junction && targetWireId) {
          wires.push({
            id: wire.id,
            kind: "component_to_wire",
            start: { componentId: start.componentId, nodeId: start.nodeId },
            targetWireId,
            junctionPoint: { x: junction.x, y: junction.y },
          });
        }
      }
    });

    return { version: 1, components, wires };
  }

  public importSnapshot(snapshot: CircuitSceneSnapshot): boolean {
    try {
      if (!snapshot || !Array.isArray(snapshot.components) || !Array.isArray(snapshot.wires)) {
        return false;
      }

      this.resetCircuitState();
      this.componentCounter.clear();

      for (const item of snapshot.components) {
        const world = this.gridCanvas.gridToWorld(
          item.gridPosition?.x ?? 0,
          item.gridPosition?.y ?? 0,
        );
        const component = this.createComponent(item.type, world.x, world.y);
        if (!component) continue;

        component.setName(item.name);
        this.gameObjects.set(component.getName(), component);
        this.zoomableContainer.addChild(component.displayObject());
        this.wireSystem.registerComponent(component);
        this.circuitSolver.addComponent(component);
        this.interactiveWireIntegration.addComponent(component);
        this.registerComponentWithRouter(component);
        component.on("positionChanged", (comp) => {
          this.interactiveWireIntegration.updateWirePositions(comp.getName());
        });
        this.addComponentInteractionHandlers(component);
        component.setOrientation(item.orientation ?? 0);
        component.updateCircuitProperties((item.properties ?? {}) as any);
      }

      const directWires = snapshot.wires.filter(
        (w) => w.kind === "component_to_component",
      );
      const branchWires = snapshot.wires.filter(
        (w) => w.kind === "component_to_wire",
      );

      for (const wire of directWires) {
        if (!wire.end) continue;
        const success = this.interactiveWireIntegration.createWire(
          wire.id,
          wire.start.componentId,
          wire.start.nodeId,
          wire.end.componentId,
          wire.end.nodeId,
        );
        if (success) {
          this.circuitSolver.connectNodes(
            wire.start.componentId,
            wire.start.nodeId,
            wire.end.componentId,
            wire.end.nodeId,
          );
        }
      }

      let pending = [...branchWires];
      for (let pass = 0; pass < 3 && pending.length > 0; pass++) {
        const nextPending: CircuitSceneSnapshotWire[] = [];
        for (const wire of pending) {
          if (!wire.targetWireId || !wire.junctionPoint) {
            continue;
          }
          const targetWire = this.interactiveWireIntegration
            .getWireSystem()
            .getWires()
            .get(wire.targetWireId);
          if (!targetWire) {
            nextPending.push(wire);
            continue;
          }

          const success = this.interactiveWireIntegration
            .getWireSystem()
            .createWireToWire(
              wire.id,
              wire.start.componentId,
              wire.start.nodeId,
              wire.junctionPoint,
              wire.targetWireId,
            );

          if (!success) {
            nextPending.push(wire);
            continue;
          }

          const endpoints = (targetWire.nodes ?? []).filter(
            (n: any) => n.type === "component",
          );
          endpoints.forEach((end: any) => {
            this.circuitSolver.connectNodes(
              wire.start.componentId,
              wire.start.nodeId,
              end.componentId,
              end.nodeId,
            );
          });
        }
        pending = nextPending;
      }

      this.wirePathSignatures.clear();
      this.wirePathOrientations.clear();
      this.wireDirectionHistory.clear();
      this.updateVisualEffects();
      return true;
    } catch {
      return false;
    }
  }

  private resetCircuitState(): void {
    if (this.isSimulationRunning) {
      this.stopSimulation();
    }

    this.cancelWireMode();
    this.clearSelectionHighlight();
    this.clearNodeHighlight();
    this.clearWirePreview();
    this.selectedComponent = null;
    this.selectedComponents.clear();
    this.selectedWireId = null;

    const components = Array.from(this.gameObjects.values()).filter(
      (obj): obj is CircuitComponent => obj instanceof CircuitComponent,
    );
    components.forEach((component) => this.deleteComponent(component));

    this.interactiveWireIntegration.clearWires();
    this.wirePathSignatures.clear();
    this.wirePathOrientations.clear();
    this.wireDirectionHistory.clear();
    this.hidePropertiesPanel();
  }

  /**
   * Set the wire routing strategy
   */
  public setWireRoutingStrategy(strategy: "dagre" | "astar" | "hybrid"): void {
    this.hybridWireRouter.setRoutingStrategy(strategy);
    this.interactiveWireIntegration.setRoutingStrategy(strategy);
    console.log(` Wire routing strategy set to: ${strategy}`);
  }

  /**
   * Get current routing statistics
   */
  public getRoutingStats(): any {
    return this.hybridWireRouter.getRoutingStats();
  }

  /**
   * Register a component with the hybrid wire router
   */
  public registerComponentWithRouter(component: CircuitComponent): void {
    this.hybridWireRouter.addComponent(component);
    console.log(` Registered ${component.getName()} with hybrid wire router`);
  }

  /**
   * Unregister a component from the hybrid wire router
   */
  public unregisterComponentFromRouter(componentId: string): void {
    this.hybridWireRouter.removeComponent(componentId);
    console.log(` Unregistered ${componentId} from hybrid wire router`);
  }

  /**
   * Test the open-source routing algorithms (for debugging)
   */
  public testOpenSourceRouting(): void {
    console.log(" Testing Open-Source Wire Routing...");

    // Test the InteractiveWireSystem routing
    this.interactiveWireIntegration.testOpenSourceRouting();

    // Test the HybridWireRouter directly
    const start: RoutingPoint = { x: 100, y: 100, layer: 0 };
    const end: RoutingPoint = { x: 300, y: 200, layer: 0 };

    // Test all strategies
    const strategies: ("dagre" | "astar" | "hybrid")[] = [
      "dagre",
      "astar",
      "hybrid",
    ];

    strategies.forEach((strategy) => {
      this.hybridWireRouter.setRoutingStrategy(strategy);
      const path = this.hybridWireRouter.routeWire(start, end);

      console.log(` ${strategy.toUpperCase()} Results:`);
      console.log(`   - Segments: ${path.segments.length}`);
      console.log(`   - Length: ${path.totalLength.toFixed(2)}px`);
      console.log(`   - Bends: ${path.bendCount}`);
    });

    // Show statistics
    const stats = this.getRoutingStats();
    console.log("\n Routing Statistics:");
    console.log(`   - Strategy: ${stats.strategy}`);
    console.log(`   - Components: ${stats.componentCount}`);
    console.log(`   - Dagre Available: ${stats.dagreAvailable}`);
    console.log(`   - A* Available: ${stats.aStarAvailable}`);

    console.log("\n Open-Source Routing Test Complete!");
  }

  /**
   * Toggle between beginner (safe-learning) and advanced (realistic) mode.
   */
  public toggleSimulatorMode(): void {
    this.simulatorMode.toggle();
    if (this.educationOverlays) {
      this.educationOverlays.setBeginnerMode(
        this.simulatorMode.isSafeLearning(),
      );
    }
  }

  /**
   * Set simulator mode explicitly.
   */
  public setSimulatorMode(mode: "safe-learning" | "realistic"): void {
    this.simulatorMode.setMode(mode);
    if (this.educationOverlays) {
      this.educationOverlays.setBeginnerMode(
        this.simulatorMode.isSafeLearning(),
      );
    }
  }

  /**
   * Get the current simulator mode.
   */
  public getSimulatorMode(): "safe-learning" | "realistic" {
    return this.simulatorMode.getMode();
  }
}
