import * as PIXI from "pixi.js";

export class SimplePixiApp {
  public app!: PIXI.Application;
  private container: HTMLElement;
  private toolbar!: PIXI.Container;
  private infoPanel!: PIXI.Container;
  private canvas!: PIXI.Container;
  private isInitialized: boolean = false;
  private isDestroyed: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.init().catch(console.error);
  }

  private async init() {
    if (this.isDestroyed) return;

    try {
      // Initialize PixiJS 8
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
        // Component was destroyed during initialization
        this.app.destroy(true, true);
        return;
      }

      this.container.appendChild(this.app.canvas as HTMLCanvasElement);

      this.createUI();
      this.setupEventListeners();

      this.isInitialized = true;
      console.log("🚀 Simple PixiJS 8 Circuit Simulator Ready!");
    } catch (error) {
      console.error("Failed to initialize PixiJS app:", error);
    }
  }

  private createUI() {
    if (!this.app || !this.app.stage || this.isDestroyed) {
      console.warn("App not ready for UI creation");
      return;
    }

    try {
      // Create toolbar
      this.toolbar = this.createToolbar();
      this.app.stage.addChild(this.toolbar);

      // Create info panel
      this.infoPanel = this.createInfoPanel();
      this.app.stage.addChild(this.infoPanel);

      // Create main canvas area
      this.canvas = this.createCanvas();
      this.app.stage.addChild(this.canvas);
    } catch (error) {
      console.error("Error creating UI:", error);
    }
  }

  private createToolbar(): PIXI.Container {
    const toolbar = new PIXI.Container();

    // Background
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, window.innerWidth || 800, 80);
    bg.fill(0x2d2d2d);
    bg.stroke({ width: 1, color: 0x444444 });
    toolbar.addChild(bg);

    // Add some tool buttons
    const tools = [
      { label: "🖱️", x: 20 },
      { label: "⚡", x: 90 },
      { label: "🔋", x: 160 },
      { label: "🔌", x: 230 },
      { label: "💡", x: 300 },
    ];

    tools.forEach((tool) => {
      const button = this.createToolButton(tool.label, tool.x);
      toolbar.addChild(button);
    });

    return toolbar;
  }

  private createToolButton(label: string, x: number): PIXI.Container {
    const button = new PIXI.Container();

    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, 60, 60, 8);
    bg.fill(0x3d3d3d);
    bg.stroke({ width: 2, color: 0x555555 });
    button.addChild(bg);

    const text = new PIXI.Text({
      text: label,
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 24,
        fill: 0xffffff,
      }),
    });
    text.anchor.set(0.5);
    text.position.set(30, 30);
    button.addChild(text);

    button.position.set(x, 10);
    button.eventMode = "static";
    button.cursor = "pointer";

    button.on("pointerdown", () => {
      console.log(`Tool selected: ${label}`);

      // Visual feedback
      bg.clear();
      bg.roundRect(0, 0, 60, 60, 8);
      bg.fill(0x4caf50);
      bg.stroke({ width: 2, color: 0x66bb6a });
    });

    return button;
  }

  private createInfoPanel(): PIXI.Container {
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

    const info = new PIXI.Text({
      text: "PixiJS 8 Architecture\n\n✅ Modular Components\n✅ Clean Separation\n✅ Event System\n✅ Modern Graphics",
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 14,
        fill: 0xffffff,
        lineHeight: 20,
      }),
    });
    info.position.set(15, 60);
    panel.addChild(info);

    panel.position.set((window.innerWidth || 800) - 300, 0);

    return panel;
  }

  private createCanvas(): PIXI.Container {
    const canvas = new PIXI.Container();

    // Background
    const bg = new PIXI.Graphics();
    bg.rect(
      0,
      0,
      (window.innerWidth || 800) - 300,
      (window.innerHeight || 600) - 80
    );
    bg.fill(0x1a1a1a);
    canvas.addChild(bg);

    // Draw a simple grid
    this.drawGrid(
      canvas,
      (window.innerWidth || 800) - 300,
      (window.innerHeight || 600) - 80
    );

    // Add some demo components
    this.addDemoComponents(canvas);

    canvas.position.set(0, 80);
    canvas.eventMode = "static";

    // Make canvas interactive
    canvas.on("pointerdown", (event) => {
      const position = canvas.toLocal(event.global);
      console.log("Canvas clicked at:", position);

      // Add a simple demo component at click location
      this.addDemoComponent(canvas, position.x, position.y);
    });

    return canvas;
  }

  private drawGrid(container: PIXI.Container, width: number, height: number) {
    const grid = new PIXI.Graphics();
    const gridSize = 20;

    // Draw grid lines
    for (let x = 0; x <= width; x += gridSize) {
      grid.moveTo(x, 0);
      grid.lineTo(x, height);
      grid.stroke({ width: 1, color: 0x333333, alpha: 0.3 });
    }

    for (let y = 0; y <= height; y += gridSize) {
      grid.moveTo(0, y);
      grid.lineTo(width, y);
      grid.stroke({ width: 1, color: 0x333333, alpha: 0.3 });
    }

    container.addChild(grid);
  }

  private addDemoComponents(canvas: PIXI.Container) {
    // Add some demo components
    this.addDemoComponent(canvas, 200, 200, "🔋");
    this.addDemoComponent(canvas, 400, 200, "🔌");
    this.addDemoComponent(canvas, 300, 350, "💡");
  }

  private addDemoComponent(
    canvas: PIXI.Container,
    x: number,
    y: number,
    emoji: string = "⚡"
  ) {
    const component = new PIXI.Container();

    // Component background
    const bg = new PIXI.Graphics();
    bg.rect(-40, -30, 80, 60);
    bg.fill(0x333333);
    bg.stroke({ width: 2, color: 0xffffff });
    component.addChild(bg);

    // Component emoji/icon
    const icon = new PIXI.Text({
      text: emoji,
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 32,
        fill: 0xffffff,
      }),
    });
    icon.anchor.set(0.5);
    component.addChild(icon);

    // Add pins
    [-20, 20].forEach((offset) => {
      const pin = new PIXI.Graphics();
      pin.circle(offset, 0, 6);
      pin.fill(0xffffff);
      pin.stroke({ width: 2, color: 0x888888 });
      component.addChild(pin);
    });

    component.position.set(x, y);
    component.eventMode = "static";
    component.cursor = "pointer";

    // Make component draggable
    let isDragging = false;
    component.on("pointerdown", () => {
      isDragging = true;
      component.alpha = 0.8;
    });

    component.on("pointermove", (event) => {
      if (isDragging) {
        const position = canvas.toLocal(event.global);
        component.position.set(position.x, position.y);
      }
    });

    component.on("pointerup", () => {
      isDragging = false;
      component.alpha = 1.0;
    });

    canvas.addChild(component);
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
    // Handle window resize
    window.addEventListener("resize", this.onResize);
  }

  private updateLayout() {
    if (this.isDestroyed || !this.app || !this.isInitialized) return;

    try {
      // Update component positions on resize
      if (this.infoPanel) {
        this.infoPanel.position.set((window.innerWidth || 800) - 300, 0);
      }

      // Recreate UI elements with new dimensions
      // For simplicity, we'll just log this for now
      console.log("Layout updated");
    } catch (error) {
      console.warn("Error updating layout:", error);
    }
  }

  public destroy() {
    this.isDestroyed = true;

    // Remove event listeners
    window.removeEventListener("resize", this.onResize);

    // Destroy PixiJS app if it exists and is initialized
    if (this.app) {
      try {
        // Only destroy if the app was properly initialized
        if (this.isInitialized && this.app.stage) {
          this.app.destroy(true, true);
        } else if (this.app.renderer) {
          // If partially initialized, try to destroy renderer
          this.app.renderer.destroy();
        }
      } catch (error) {
        console.warn("Error during PixiJS cleanup:", error);
      }
    }

    console.log("🧹 Simple PixiJS app destroyed");
  }
}
