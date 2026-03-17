import * as PIXI from "pixi.js";
import { Toolbar } from "./components/Toolbar";
import { InfoPanel } from "./components/InfoPanel";
import { CircuitCanvas } from "./components/CircuitCanvas";

export class BaseApp {
  public app!: PIXI.Application;
  public toolbar!: Toolbar;
  public infoPanel!: InfoPanel;
  public circuitCanvas!: CircuitCanvas;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.init();
  }

  private async init() {
    await this.initializePixiApp();
    this.createComponents();
    this.setupLayout();
    this.setupEventListeners();
  }

  private async initializePixiApp() {
    // Initialize PixiJS 8 with modern settings
    this.app = new PIXI.Application();

    await this.app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x1a1a1a,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });

    // Append canvas to container
    this.container.appendChild(this.app.canvas as HTMLCanvasElement);
  }

  private createComponents() {
    // Create modular components
    this.toolbar = new Toolbar();
    this.infoPanel = new InfoPanel();
    this.circuitCanvas = new CircuitCanvas();

    // Add to stage
    this.app.stage.addChild(this.toolbar);
    this.app.stage.addChild(this.infoPanel);
    this.app.stage.addChild(this.circuitCanvas);
  }

  private setupLayout() {
    // Position components
    this.toolbar.position.set(0, 0);

    this.infoPanel.position.set(
      this.app.screen.width - this.infoPanel.panelWidth,
      0
    );

    this.circuitCanvas.position.set(0, this.toolbar.toolbarHeight);
    this.circuitCanvas.resize(
      this.app.screen.width - this.infoPanel.panelWidth,
      this.app.screen.height - this.toolbar.toolbarHeight
    );
  }

  private setupEventListeners() {
    // Handle window resize
    window.addEventListener("resize", this.onResize.bind(this));

    // Setup inter-component communication
    this.toolbar.on("toolSelected", this.onToolSelected.bind(this));
    this.circuitCanvas.on(
      "componentSelected",
      this.onComponentSelected.bind(this)
    );
  }

  private onResize() {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.setupLayout();
  }

  private onToolSelected(tool: string) {
    this.circuitCanvas.setSelectedTool(tool);
  }

  private onComponentSelected(componentId: string) {
    this.infoPanel.showComponentInfo(componentId);
  }

  public destroy() {
    window.removeEventListener("resize", this.onResize.bind(this));
    this.app.destroy(true, true);
  }
}
