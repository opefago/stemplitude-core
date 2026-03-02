import * as PIXI from "pixi.js";
import { ComponentManager } from "../managers/ComponentManager";
import { WireManager } from "../managers/WireManager";
import { GridRenderer } from "../renderers/GridRenderer";
import {
  useComponents,
  useConnections,
  useCircuitActions,
} from "../../store/circuitStore";
import { Point } from "../../types/Circuit";

export class CircuitCanvas extends PIXI.Container {
  private background: PIXI.Graphics;
  private gridRenderer: GridRenderer;
  private componentManager: ComponentManager;
  private wireManager: WireManager;
  private selectedTool: string = "select";
  private canvasWidth: number = 800;
  private canvasHeight: number = 600;
  private gridVisible: boolean = true;

  // Interaction state
  private isDragging: boolean = false;
  // private dragStartPos: Point | null = null; // Unused for now
  private draggedComponent: string | null = null;

  // Wire drawing state
  private isDrawingWire: boolean = false;
  private wireStartPin: {
    componentId: string;
    pinId: string;
    position: Point;
  } | null = null;

  constructor() {
    super();

    this.createBackground();
    this.initializeManagers();
    this.setupInteractivity();
    this.render();

    // Listen to store changes
    this.setupStoreListeners();
  }

  private createBackground() {
    this.background = new PIXI.Graphics();
    this.background.eventMode = "static";
    this.addChild(this.background);
    this.updateBackground();
  }

  private initializeManagers() {
    this.gridRenderer = new GridRenderer(this.canvasWidth, this.canvasHeight);
    this.componentManager = new ComponentManager();
    this.wireManager = new WireManager();

    this.addChild(this.gridRenderer);
    this.addChild(this.componentManager);
    this.addChild(this.wireManager);
  }

  private setupInteractivity() {
    this.background.on("pointerdown", this.onBackgroundPointerDown.bind(this));
    this.background.on("pointermove", this.onBackgroundPointerMove.bind(this));
    this.background.on("pointerup", this.onBackgroundPointerUp.bind(this));

    // Listen to component events
    this.componentManager.on(
      "componentClicked",
      this.onComponentClicked.bind(this)
    );
    this.componentManager.on("pinClicked", this.onPinClicked.bind(this));
    this.componentManager.on(
      "componentDragStart",
      this.onComponentDragStart.bind(this)
    );
    this.componentManager.on(
      "componentDragEnd",
      this.onComponentDragEnd.bind(this)
    );
  }

  private setupStoreListeners() {
    // Note: In PixiJS architecture, we'll handle store updates differently
    // We can use polling or external update mechanisms
    console.log(
      "Store listeners setup - will implement external update mechanism"
    );
  }

  private updateBackground() {
    this.background.clear();
    this.background.rect(0, 0, this.canvasWidth, this.canvasHeight);
    this.background.fill(0x1a1a1a);
  }

  private onBackgroundPointerDown(event: PIXI.FederatedPointerEvent) {
    const position = this.toLocal(event.global);

    if (this.selectedTool !== "select" && this.selectedTool !== "wire") {
      // Create component
      this.createComponent(this.selectedTool, position);
    } else if (this.selectedTool === "select") {
      // Start potential drag operation
      this.isDragging = false; // Will be set to true if we start dragging
      this.dragStartPos = position;
    }
  }

  private onBackgroundPointerMove(event: PIXI.FederatedPointerEvent) {
    const position = this.toLocal(event.global);

    if (this.isDragging && this.draggedComponent) {
      // Update component position
      // TODO: Implement component moving in PixiJS architecture
      console.log("Move component:", this.draggedComponent, position);
    }

    if (this.isDrawingWire && this.wireStartPin) {
      // Update temporary wire visualization
      this.wireManager.updateTempWire(this.wireStartPin.position, position);
    }
  }

  private onBackgroundPointerUp(event: PIXI.FederatedPointerEvent) {
    if (this.isDragging) {
      this.isDragging = false;
      this.draggedComponent = null;
      this.dragStartPos = null;
    }

    if (this.isDrawingWire) {
      // Cancel wire if clicked on empty space
      this.cancelWireDrawing();
    }
  }

  private onComponentClicked(componentId: string) {
    this.emit("componentSelected", componentId);
  }

  private onPinClicked(componentId: string, pinId: string, position: Point) {
    if (this.selectedTool === "wire") {
      this.handlePinWireInteraction(componentId, pinId, position);
    }
  }

  private onComponentDragStart(componentId: string, position: Point) {
    if (this.selectedTool === "select") {
      this.isDragging = true;
      this.draggedComponent = componentId;
      this.dragStartPos = position;
    }
  }

  private onComponentDragEnd() {
    this.isDragging = false;
    this.draggedComponent = null;
    this.dragStartPos = null;
  }

  private createComponent(type: string, position: Point) {
    // TODO: Implement component creation in PixiJS architecture
    const snappedPosition = this.snapToGrid(position);
    console.log("Create component:", type, snappedPosition);
  }

  private handlePinWireInteraction(
    componentId: string,
    pinId: string,
    position: Point
  ) {
    if (!this.isDrawingWire) {
      // Start wire drawing
      this.startWireDrawing(componentId, pinId, position);
    } else {
      // Complete wire drawing
      this.completeWireDrawing(componentId, pinId, position);
    }
  }

  private startWireDrawing(
    componentId: string,
    pinId: string,
    position: Point
  ) {
    this.isDrawingWire = true;
    this.wireStartPin = { componentId, pinId, position };
    this.wireManager.startTempWire(position);
  }

  private completeWireDrawing(
    componentId: string,
    pinId: string,
    position: Point
  ) {
    if (this.wireStartPin && this.wireStartPin.pinId !== pinId) {
      // TODO: Implement connection creation in PixiJS architecture
      console.log(
        "Create connection from",
        this.wireStartPin.pinId,
        "to",
        pinId
      );
    }

    this.cancelWireDrawing();
  }

  private cancelWireDrawing() {
    this.isDrawingWire = false;
    this.wireStartPin = null;
    this.wireManager.clearTempWire();
  }

  private snapToGrid(position: Point): Point {
    const gridSize = 20;
    return {
      x: Math.round(position.x / gridSize) * gridSize,
      y: Math.round(position.y / gridSize) * gridSize,
    };
  }

  public setSelectedTool(tool: string) {
    this.selectedTool = tool;

    // Cancel any ongoing operations
    if (this.isDrawingWire) {
      this.cancelWireDrawing();
    }

    // Update cursor
    this.cursor = this.getCursorForTool(tool);
  }

  private getCursorForTool(tool: string): string {
    switch (tool) {
      case "select":
        return "default";
      case "wire":
        return "crosshair";
      default:
        return "copy"; // For component placement
    }
  }

  public toggleGrid() {
    this.gridVisible = !this.gridVisible;
    this.gridRenderer.visible = this.gridVisible;
  }

  public resize(width: number, height: number) {
    this.canvasWidth = width;
    this.canvasHeight = height;

    this.updateBackground();
    this.gridRenderer.resize(width, height);

    // Emit resize event for managers
    this.componentManager.onCanvasResize(width, height);
    this.wireManager.onCanvasResize(width, height);
  }

  private render() {
    // Initial render of all components and connections
    // TODO: Get components and connections from external state management
    const components: any[] = [];
    const connections: any[] = [];

    this.componentManager.updateComponents(components);
    this.wireManager.updateConnections(connections);
  }

  public getCanvasBounds() {
    return {
      width: this.canvasWidth,
      height: this.canvasHeight,
    };
  }

  public clearSelection() {
    this.emit("componentSelected", null);
  }

  public destroy() {
    super.destroy();

    // Clean up managers
    this.componentManager.destroy();
    this.wireManager.destroy();
    this.gridRenderer.destroy();
  }
}
