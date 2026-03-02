import * as PIXI from "pixi.js";
// Store imports removed - will integrate later if needed
import { CircuitComponent, ComponentType, Point } from "../types/Circuit";
import { CircuitSolver } from "../engine/CircuitSolver";

export class IntegratedPixiApp {
  public app!: PIXI.Application;
  private container: HTMLElement;
  private toolbar!: PIXI.Container;
  private infoPanel!: PIXI.Container;
  private canvas!: PIXI.Container;
  private isInitialized: boolean = false;
  private isDestroyed: boolean = false;

  // Component graphics management
  private componentGraphics: Map<string, PIXI.Container> = new Map();
  private gridGraphics!: PIXI.Graphics;

  // State
  private selectedTool: string = "select";
  private components: CircuitComponent[] = [];
  private showGrid: boolean = true;

  constructor(container: HTMLElement) {
    this.container = container;
    this.init().catch(console.error);
  }

  private async init() {
    if (this.isDestroyed) return;

    try {
      this.app = new PIXI.Application();

      await this.app.init({
        width: window.innerWidth || 800,
        height: window.innerHeight || 600,
        backgroundColor: 0x1a1a1a,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });

      if (this.isDestroyed) {
        this.app.destroy(true, true);
        return;
      }

      this.container.appendChild(this.app.canvas as HTMLCanvasElement);
      
      // Ensure canvas can receive pointer events
      const canvas = this.app.canvas as HTMLCanvasElement;
      canvas.style.pointerEvents = "auto";
      canvas.style.touchAction = "none";
      canvas.style.display = "block";
      
      console.log("📺 Canvas appended to DOM:", this.app.canvas);
      console.log("🖱️ Canvas pointer-events:", canvas.style.pointerEvents);
      console.log("🖱️ Canvas touch-action:", canvas.style.touchAction);

      // Test if the canvas itself can receive events
      (this.app.canvas as HTMLCanvasElement).addEventListener("click", (e) => {
        console.log("🎯 HTML CANVAS CLICK detected at:", e.clientX, e.clientY);
      });

      this.createUI();
      this.setupEventListeners();

      // CRITICAL: Make sure the stage can handle all events
      this.app.stage.eventMode = "static";
      this.app.stage.hitArea = new PIXI.Rectangle(
        0,
        0,
        this.app.screen.width,
        this.app.screen.height
      );

    // Add stage-level debugging
    this.app.stage.on("pointerdown", (event) => {
      console.log(
        "🎭 STAGE CLICK at global:",
        event.global,
        "target:",
        event.target?.constructor?.name,
        "label:",
        (event.target as any)?.label || "no label"
      );
    });

      console.log(
        "🎭 Stage event handling configured. Stage bounds:",
        this.app.stage.hitArea
      );

      this.isInitialized = true;
      console.log("🚀 Integrated PixiJS Circuit Simulator Ready!");
    } catch (error) {
      console.error("Failed to initialize PixiJS app:", error);
    }
  }

  private createUI() {
    if (!this.app || !this.app.stage || this.isDestroyed) {
      return;
    }

    try {
      // Create toolbar with proper tool selection
      this.toolbar = this.createIntegratedToolbar();
      this.app.stage.addChild(this.toolbar);
      console.log(
        "📋 Toolbar added to stage at:",
        this.toolbar.position,
        "bounds:",
        this.toolbar.getBounds(),
        "x:",
        this.toolbar.x,
        "y:",
        this.toolbar.y,
        "width:",
        this.toolbar.width,
        "height:",
        this.toolbar.height
      );

      // Create info panel
      this.infoPanel = this.createIntegratedInfoPanel();
      this.app.stage.addChild(this.infoPanel);
      console.log(
        "📊 InfoPanel added to stage at:",
        this.infoPanel.position,
        "bounds:",
        this.infoPanel.getBounds()
      );

      // Create main canvas area
      this.canvas = this.createIntegratedCanvas();
      this.app.stage.addChild(this.canvas);
      console.log(
        "🎨 Canvas added to stage at:",
        this.canvas.position,
        "bounds:",
        this.canvas.getBounds(),
        "x:",
        this.canvas.x,
        "y:",
        this.canvas.y,
        "width:",
        this.canvas.width,
        "height:",
        this.canvas.height
      );

      console.log("🏗️ Stage children count:", this.app.stage.children.length);
      console.log(
        "🎯 Stage children order:",
        this.app.stage.children.map((child) => child.constructor.name)
      );

      // Initial render
      this.renderComponents();
      this.renderConnections();
    } catch (error) {
      console.error("Error creating UI:", error);
    }
  }

  private createIntegratedToolbar(): PIXI.Container {
    const toolbar = new PIXI.Container();

    // Make toolbar interactive and on top
    toolbar.eventMode = "static";
    toolbar.interactiveChildren = true; // CRITICAL: Allow children to receive events
    toolbar.position.set(0, 0);
    toolbar.sortableChildren = true;
    toolbar.zIndex = 1000; // Ensure toolbar is above everything

    console.log("🔧 Creating toolbar at position:", toolbar.position);

    // Background (add first, but don't make it block events)
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, window.innerWidth || 800, 100);
    bg.fill(0x2d2d2d);
    bg.stroke({ width: 1, color: 0x444444 });
    bg.eventMode = "none"; // Don't intercept events
    bg.zIndex = -1; // Ensure background is behind everything
    toolbar.addChild(bg);

    // Add app title to toolbar
    const title = new PIXI.Text({
      text: "⚡ Electronics Simulator for Kids ⚡",
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 18,
        fontWeight: "bold",
        fill: 0xffffff,
      }),
    });
    title.anchor.set(0.5, 0);
    title.position.set((window.innerWidth || 800) / 2, 5);
    title.eventMode = "none";
    title.zIndex = 5; // Above background but below buttons
    toolbar.addChild(title);

    // Tool buttons
    const tools = [
      { id: "select", label: "Select", icon: "🖱️" },
      { id: "wire", label: "Wire", icon: "⚡" },
      { id: "battery", label: "Battery", icon: "🔋" },
      { id: "resistor", label: "Resistor", icon: "🔌" },
      { id: "led", label: "LED", icon: "💡" },
      { id: "capacitor", label: "Capacitor", icon: "⚿" },
      { id: "ground", label: "Ground", icon: "⏚" },
    ];

    let xPos = 20;
    tools.forEach((tool) => {
      const button = this.createToolButton(tool);
      button.x = xPos;
      button.y = 25; // Moved down to make room for title
      toolbar.addChild(button);
      xPos += 90;
    });

    // Simulation controls
    const simButton = this.createSimulationButton();
    simButton.x = xPos + 20;
    simButton.y = 25; // Moved down to align with other buttons
    toolbar.addChild(simButton);

    // Grid toggle
    const gridToggle = this.createGridToggle();
    gridToggle.x = (window.innerWidth || 800) - 150;
    gridToggle.y = 65; // Moved down to bottom of toolbar
    toolbar.addChild(gridToggle);

    // Add global click test to toolbar
    toolbar.on("pointerdown", (event) => {
      const localPos = toolbar.toLocal(event.global);
      console.log(
        "🎯 TOOLBAR AREA CLICKED at local position:",
        localPos,
        "global:",
        event.global
      );
      // Stop event from bubbling down to canvas
      event.stopPropagation();
    });

    console.log(
      "✅ Toolbar created with",
      tools.length,
      "buttons at position:",
      toolbar.position
    );
    return toolbar;
  }

  private createToolButton(tool: {
    id: string;
    label: string;
    icon: string;
  }): PIXI.Container {
    const container = new PIXI.Container();
    container.label = tool.id; // Add label for debugging

    console.log(
      "🔨 Creating tool button:",
      tool.id,
      "selected:",
      this.selectedTool === tool.id
    );

    // Background
    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, 80, 80, 8);
    bg.fill(this.selectedTool === tool.id ? 0x4caf50 : 0x3d3d3d);
    bg.stroke({
      width: 2,
      color: this.selectedTool === tool.id ? 0x66bb6a : 0x555555,
    });
    bg.eventMode = "none"; // Background shouldn't block events
    container.addChild(bg);

    // Icon
    const icon = new PIXI.Text({
      text: tool.icon,
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 32,
        fill: 0xffffff,
      }),
    });
    icon.anchor.set(0.5);
    icon.position.set(40, 25);
    icon.eventMode = "none"; // Icon shouldn't block events
    container.addChild(icon);

    // Label
    const label = new PIXI.Text({
      text: tool.label,
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 12,
        fill: 0xffffff,
      }),
    });
    label.anchor.set(0.5);
    label.position.set(40, 65);
    label.eventMode = "none"; // Label shouldn't block events
    container.addChild(label);

    // Make container interactive
    container.eventMode = "static";
    container.interactiveChildren = false; // Children shouldn't intercept
    container.cursor = "pointer";
    container.zIndex = 100; // High z-index for buttons
    container.hitArea = new PIXI.Rectangle(0, 0, 80, 80); // Explicit click area

    // Add multiple event listeners for debugging
    container.on("pointerdown", (event) => {
      console.log("🔧 POINTERDOWN Tool button clicked:", tool.id);
      event.stopPropagation(); // Prevent bubbling to canvas
      this.selectTool(tool.id);
    });

    container.on("click", () => {
      console.log("🖱️ CLICK Tool button clicked:", tool.id);
      this.selectTool(tool.id);
    });

    container.on("pointerover", () => {
      console.log("🎯 HOVER Tool button hovered:", tool.id);
    });

    container.on("pointerout", () => {
      console.log("🚫 HOVER OUT Tool button:", tool.id);
    });

    console.log(
      "✅ Tool button created and event listener attached for:",
      tool.id,
      "at global position:",
      container.getBounds()
    );
    return container;
  }

  private createSimulationButton(): PIXI.Container {
    const container = new PIXI.Container();

    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, 120, 80, 8);
    bg.fill(0x4caf50);
    bg.stroke({ width: 2, color: 0x66bb6a });
    bg.eventMode = "none"; // Background shouldn't block events
    container.addChild(bg);

    const text = new PIXI.Text({
      text: "▶ Run\nSimulation",
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 14,
        fontWeight: "bold",
        fill: 0xffffff,
        align: "center",
      }),
    });
    text.anchor.set(0.5);
    text.position.set(60, 40);
    text.eventMode = "none"; // Text shouldn't block events
    container.addChild(text);

    container.eventMode = "static";
    container.interactiveChildren = false;
    container.cursor = "pointer";
    container.zIndex = 100; // Ensure simulation button is above background

    container.on("pointerdown", () => {
      console.log("🎮 Simulation button clicked");
      this.runSimulation();
    });

    return container;
  }

  private createGridToggle(): PIXI.Container {
    const container = new PIXI.Container();

    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, 100, 30, 4);
    bg.fill(this.showGrid ? 0x4caf50 : 0x3d3d3d);
    bg.stroke({ width: 1, color: 0x555555 });
    bg.eventMode = "none"; // Background shouldn't block events
    container.addChild(bg);

    const text = new PIXI.Text({
      text: "Grid",
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 14,
        fill: 0xffffff,
      }),
    });
    text.anchor.set(0.5);
    text.position.set(50, 15);
    text.eventMode = "none"; // Text shouldn't block events
    container.addChild(text);

    container.eventMode = "static";
    container.cursor = "pointer";
    container.zIndex = 10; // Ensure grid toggle is above background

    container.on("pointerdown", () => {
      console.log("🔲 Grid toggle clicked");
      this.showGrid = !this.showGrid;

      // Update visual
      bg.clear();
      bg.roundRect(0, 0, 100, 30, 4);
      bg.fill(this.showGrid ? 0x4caf50 : 0x3d3d3d);
      bg.stroke({ width: 1, color: 0x555555 });

      if (this.gridGraphics) {
        this.gridGraphics.visible = this.showGrid;
      }
    });

    return container;
  }

  private createIntegratedInfoPanel(): PIXI.Container {
    const panel = new PIXI.Container();

    const bg = new PIXI.Graphics();
    bg.rect(0, 0, 300, window.innerHeight || 600);
    bg.fill(0x2d2d2d);
    bg.stroke({ width: 1, color: 0x444444 });
    panel.addChild(bg);

    const title = new PIXI.Text({
      text: "Circuit Info",
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 18,
        fontWeight: "bold",
        fill: 0xffffff,
      }),
    });
    title.position.set(15, 15);
    panel.addChild(title);

    panel.position.set((window.innerWidth || 800) - 300, 0);
    return panel;
  }

  private createIntegratedCanvas(): PIXI.Container {
    const canvas = new PIXI.Container();

    // Background
    const bg = new PIXI.Graphics();
    bg.rect(
      0,
      0,
      (window.innerWidth || 800) - 300,
      (window.innerHeight || 600) - 100
    );
    bg.fill(0x1a1a1a);
    canvas.addChild(bg);

    // Grid
    this.gridGraphics = new PIXI.Graphics();
    this.drawGrid(
      (window.innerWidth || 800) - 300,
      (window.innerHeight || 600) - 100
    );
    canvas.addChild(this.gridGraphics);

    canvas.position.set(0, 100);
    canvas.eventMode = "static";

    // Canvas interactions
    canvas.on("pointerdown", this.onCanvasPointerDown.bind(this));

    return canvas;
  }

  private drawGrid(width: number, height: number) {
    this.gridGraphics.clear();

    const gridSize = 20;

    if (!this.showGrid) {
      this.gridGraphics.visible = false;
      return;
    }

    this.gridGraphics.visible = true;

    // Draw grid lines
    for (let x = 0; x <= width; x += gridSize) {
      const isMajor = x % (gridSize * 5) === 0;
      this.gridGraphics.moveTo(x, 0);
      this.gridGraphics.lineTo(x, height);
      this.gridGraphics.stroke({
        width: 1,
        color: isMajor ? 0x444444 : 0x333333,
        alpha: isMajor ? 0.6 : 0.3,
      });
    }

    for (let y = 0; y <= height; y += gridSize) {
      const isMajor = y % (gridSize * 5) === 0;
      this.gridGraphics.moveTo(0, y);
      this.gridGraphics.lineTo(width, y);
      this.gridGraphics.stroke({
        width: 1,
        color: isMajor ? 0x444444 : 0x333333,
        alpha: isMajor ? 0.6 : 0.3,
      });
    }
  }

  private selectTool(toolId: string) {
    const oldTool = this.selectedTool;
    this.selectedTool = toolId;
    console.log("🎨 Tool changed:", oldTool, "→", toolId);

    // Update toolbar visual state
    this.updateToolbarSelection();
    console.log("✅ Toolbar updated with new selection");
  }

  private updateToolbarSelection() {
    // Clear and rebuild toolbar to reflect current selection
    this.toolbar.removeChildren();

    // Re-create toolbar content with proper event handling
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, window.innerWidth || 800, 100);
    bg.fill(0x2d2d2d);
    bg.stroke({ width: 1, color: 0x444444 });
    bg.eventMode = "none"; // Don't intercept events
    this.toolbar.addChild(bg);

    // Tool buttons
    const tools = [
      { id: "select", label: "Select", icon: "🖱️" },
      { id: "wire", label: "Wire", icon: "⚡" },
      { id: "battery", label: "Battery", icon: "🔋" },
      { id: "resistor", label: "Resistor", icon: "🔌" },
      { id: "led", label: "LED", icon: "💡" },
      { id: "capacitor", label: "Capacitor", icon: "⚿" },
      { id: "ground", label: "Ground", icon: "⏚" },
    ];

    let xPos = 20;
    tools.forEach((tool) => {
      const button = this.createToolButton(tool);
      button.x = xPos;
      button.y = 10;
      this.toolbar.addChild(button);
      xPos += 90;
    });

    // Simulation controls
    const simButton = this.createSimulationButton();
    simButton.x = xPos + 20;
    simButton.y = 10;
    this.toolbar.addChild(simButton);

    // Grid toggle
    const gridToggle = this.createGridToggle();
    gridToggle.x = (window.innerWidth || 800) - 150;
    gridToggle.y = 35;
    this.toolbar.addChild(gridToggle);
  }

  private onCanvasPointerDown(event: PIXI.FederatedPointerEvent) {
    const position = this.canvas.toLocal(event.global);
    const snappedPosition = this.snapToGrid(position);

    console.log("🎯 Canvas clicked:", {
      selectedTool: this.selectedTool,
      position: snappedPosition,
      target: event.target?.constructor?.name,
    });

    // Check if we clicked on an existing component
    const clickedComponent = this.getComponentAt(position);
    
    if (this.selectedTool === "select") {
      if (clickedComponent) {
        console.log("✅ Component selected:", clickedComponent.id);
        // TODO: Highlight selected component
      }
      return; // Don't create new components in select mode
    }

    if (this.selectedTool === "wire") {
      console.log("🔌 Wire tool - checking for pin click");
      // TODO: Implement wire creation logic
      // - First click: select start pin
      // - Second click: select end pin and create connection
      return; // Don't create components in wire mode
    }

    // Only create new component if we clicked on empty canvas
    if (!clickedComponent && this.selectedTool && 
        this.selectedTool !== "select" && this.selectedTool !== "wire") {
      console.log("✅ Creating component:", this.selectedTool, "at", snappedPosition);
      this.createDemoComponent(this.selectedTool as ComponentType, snappedPosition);
    } else if (clickedComponent) {
      console.log("❌ Cannot create component - clicked on existing component");
    } else {
      console.log("❌ Cannot create component - tool is:", this.selectedTool);
    }
  }

  private getComponentAt(position: Point): CircuitComponent | null {
    // Check if position is within any component's bounds
    for (const component of this.components) {
      const dx = position.x - component.position.x;
      const dy = position.y - component.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Component hit radius (adjust based on component size)
      if (distance < 40) {
        return component;
      }
    }
    return null;
  }

  private snapToGrid(position: Point): Point {
    const gridSize = 20;
    return {
      x: Math.round(position.x / gridSize) * gridSize,
      y: Math.round(position.y / gridSize) * gridSize,
    };
  }

  private createDemoComponent(type: ComponentType, position: Point) {
    // Create a demo component for testing
    const component: CircuitComponent = {
      id: `demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: type,
      position: position,
      rotation: 0,
      properties: {},
      pins: [
        {
          id: `demo-${Date.now()}-pin1`,
          position: { x: position.x - 20, y: position.y },
          type: "bidirectional" as const,
        },
        {
          id: `demo-${Date.now()}-pin2`,
          position: { x: position.x + 20, y: position.y },
          type: "bidirectional" as const,
        },
      ],
    };

    console.log("🔩 Creating component:", {
      id: component.id,
      type: component.type,
      position: component.position,
      totalComponents: this.components.length + 1,
    });

    this.components.push(component);
    this.renderComponents();

    console.log(
      "📊 Component created! Total components:",
      this.components.length
    );
  }

  private renderComponents() {
    console.log(
      "🎨 Rendering components:",
      this.components.length,
      "total components"
    );

    // Remove graphics for components that no longer exist
    const existingIds = new Set(this.components.map((c) => c.id));
    this.componentGraphics.forEach((graphics, id) => {
      if (!existingIds.has(id)) {
        console.log("🗑️ Removing old component graphics:", id);
        this.canvas.removeChild(graphics);
        graphics.destroy();
        this.componentGraphics.delete(id);
      }
    });

    // Update or create graphics for existing components
    this.components.forEach((component) => {
      let graphics = this.componentGraphics.get(component.id);
      if (!graphics) {
        console.log(
          "🆕 Creating new component graphics for:",
          component.id,
          component.type
        );
        graphics = this.createComponentGraphics(component);
        this.componentGraphics.set(component.id, graphics);
        this.canvas.addChild(graphics);
        console.log("✅ Component graphics added to canvas");
      } else {
        console.log("🔄 Updating existing component graphics:", component.id);
        this.updateComponentGraphics(graphics, component);
      }
    });

    console.log(
      "📈 Graphics rendered. Total graphics on canvas:",
      this.componentGraphics.size
    );
  }

  private createComponentGraphics(component: CircuitComponent): PIXI.Container {
    const container = new PIXI.Container();

    // Create component body using proper circuit drawings
    const body = this.drawCircuitComponent(component);
    container.addChild(body);

    // Create pins
    component.pins.forEach((pin) => {
      const pinGraphics = this.createPinGraphics(component, pin);
      container.addChild(pinGraphics);
    });

    // Position
    container.position.set(component.position.x, component.position.y);

    // Make interactive
    container.eventMode = "static";
    container.cursor = "pointer";

    return container;
  }

  private drawCircuitComponent(component: CircuitComponent): PIXI.Graphics {
    const graphics = new PIXI.Graphics();
    const width = 80;
    const height = 60;

    switch (component.type) {
      case "battery":
        this.drawBattery(graphics, width, height);
        break;
      case "resistor":
        this.drawResistor(graphics, width, height);
        break;
      case "led":
        this.drawLED(graphics, width, height);
        break;
      case "capacitor":
        this.drawCapacitor(graphics, width, height);
        break;
      case "ground":
        this.drawGround(graphics, width, height);
        break;
      default:
        this.drawGenericComponent(graphics, width, height);
    }

    return graphics;
  }

  private drawBattery(graphics: PIXI.Graphics, width: number, height: number) {
    // Battery outline
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill(0x333333);
    graphics.stroke({ width: 2, color: 0xffffff });

    // Battery terminals
    graphics.moveTo(-10, -20);
    graphics.lineTo(-10, 20);
    graphics.stroke({ width: 6, color: 0xff4444 });

    graphics.moveTo(10, -15);
    graphics.lineTo(10, 15);
    graphics.stroke({ width: 6, color: 0x444444 });

    // Plus/minus symbols
    const plusText = new PIXI.Text({
      text: "+",
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 16,
        fontWeight: "bold",
        fill: 0xffffff,
      }),
    });
    plusText.anchor.set(0.5);
    plusText.position.set(-25, 0);
    graphics.addChild(plusText);

    const minusText = new PIXI.Text({
      text: "-",
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 16,
        fontWeight: "bold",
        fill: 0xffffff,
      }),
    });
    minusText.anchor.set(0.5);
    minusText.position.set(25, 0);
    graphics.addChild(minusText);
  }

  private drawResistor(graphics: PIXI.Graphics, width: number, height: number) {
    // Resistor outline
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill(0x333333);
    graphics.stroke({ width: 2, color: 0xffffff });

    // Zigzag pattern
    const zigzagPoints = [
      { x: -30, y: 0 },
      { x: -20, y: -10 },
      { x: -10, y: 10 },
      { x: 0, y: -10 },
      { x: 10, y: 10 },
      { x: 20, y: -10 },
      { x: 30, y: 0 },
    ];

    graphics.moveTo(zigzagPoints[0].x, zigzagPoints[0].y);
    for (let i = 1; i < zigzagPoints.length; i++) {
      graphics.lineTo(zigzagPoints[i].x, zigzagPoints[i].y);
    }
    graphics.stroke({ width: 4, color: 0x44ff44 });
  }

  private drawLED(graphics: PIXI.Graphics, width: number, height: number) {
    // LED outline
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill(0x333333);
    graphics.stroke({ width: 2, color: 0xffffff });

    // LED triangle
    graphics.moveTo(-15, -10);
    graphics.lineTo(-15, 10);
    graphics.lineTo(5, 0);
    graphics.lineTo(-15, -10);
    graphics.fill(0x4444ff);

    // Cathode line
    graphics.moveTo(5, -10);
    graphics.lineTo(5, 10);
    graphics.stroke({ width: 4, color: 0xffffff });

    // Light rays
    graphics.moveTo(10, -15);
    graphics.lineTo(20, -20);
    graphics.moveTo(15, -10);
    graphics.lineTo(25, -15);
    graphics.stroke({ width: 2, color: 0xffff44 });
  }

  private drawCapacitor(
    graphics: PIXI.Graphics,
    width: number,
    height: number
  ) {
    // Capacitor outline
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill(0x333333);
    graphics.stroke({ width: 2, color: 0xffffff });

    // Two parallel plates
    graphics.moveTo(-5, -20);
    graphics.lineTo(-5, 20);
    graphics.moveTo(5, -20);
    graphics.lineTo(5, 20);
    graphics.stroke({ width: 4, color: 0x44ffff });
  }

  private drawGround(graphics: PIXI.Graphics, width: number, height: number) {
    // Ground outline
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill(0x333333);
    graphics.stroke({ width: 2, color: 0xffffff });

    // Ground symbol
    graphics.moveTo(-20, 5);
    graphics.lineTo(20, 5);
    graphics.moveTo(-15, 10);
    graphics.lineTo(15, 10);
    graphics.moveTo(-10, 15);
    graphics.lineTo(10, 15);
    graphics.stroke({ width: 3, color: 0x888888 });
  }

  private drawGenericComponent(
    graphics: PIXI.Graphics,
    width: number,
    height: number
  ) {
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill(0x444444);
    graphics.stroke({ width: 2, color: 0xffffff });
  }

  private createPinGraphics(
    component: CircuitComponent,
    pin: any
  ): PIXI.Graphics {
    const graphics = new PIXI.Graphics();
    const pinSize = 6;

    const relativePos = {
      x: pin.position.x - component.position.x,
      y: pin.position.y - component.position.y,
    };

    graphics.circle(relativePos.x, relativePos.y, pinSize);
    graphics.fill(0xffffff);
    graphics.stroke({ width: 2, color: 0x888888 });

    graphics.eventMode = "static";
    graphics.cursor = "pointer";

    return graphics;
  }

  private updateComponentGraphics(
    container: PIXI.Container,
    component: CircuitComponent
  ) {
    container.position.set(component.position.x, component.position.y);
  }

  private renderConnections() {
    // TODO: Implement wire rendering
    console.log("Rendering connections: 0 (not implemented yet)");
  }

  private runSimulation() {
    if (this.components.length === 0) {
      console.warn("No components to simulate");
      return;
    }

    try {
      const solver = new CircuitSolver(this.components, []);
      const results = solver.solve();
      console.log("Simulation results:", results);

      // You can update the info panel with results here
    } catch (error) {
      console.error("Simulation failed:", error);
    }
  }

  private onResize = () => {
    if (this.app && this.app.renderer && !this.isDestroyed) {
      this.app.renderer.resize(
        window.innerWidth || 800,
        window.innerHeight || 600
      );
      this.updateLayout();
    }
  };

  private setupEventListeners() {
    window.addEventListener("resize", this.onResize);
  }

  private updateLayout() {
    if (this.isDestroyed || !this.app || !this.isInitialized) return;

    try {
      if (this.infoPanel) {
        this.infoPanel.position.set((window.innerWidth || 800) - 300, 0);
      }

      // Redraw grid with new dimensions
      if (this.gridGraphics) {
        this.drawGrid(
          (window.innerWidth || 800) - 300,
          (window.innerHeight || 600) - 100
        );
      }
    } catch (error) {
      console.warn("Error updating layout:", error);
    }
  }

  // Public methods for external integration
  public updateComponents(components: CircuitComponent[]) {
    this.components = components;
    this.renderComponents();
  }

  public setSelectedTool(tool: string) {
    this.selectTool(tool);
  }

  public setShowGrid(show: boolean) {
    this.showGrid = show;
    if (this.gridGraphics) {
      this.gridGraphics.visible = show;
    }
  }

  public destroy() {
    this.isDestroyed = true;

    window.removeEventListener("resize", this.onResize);

    if (this.app) {
      try {
        if (this.isInitialized && this.app.stage) {
          this.app.destroy(true, true);
        } else if (this.app.renderer) {
          this.app.renderer.destroy();
        }
      } catch (error) {
        console.warn("Error during PixiJS cleanup:", error);
      }
    }

    console.log("🧹 Integrated PixiJS app destroyed");
  }
}
