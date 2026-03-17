import * as PIXI from "pixi.js";
import { CircuitComponent, Point } from "../../types/Circuit";

export class ComponentManager extends PIXI.Container {
  private componentGraphics: Map<string, PIXI.Container> = new Map();
  private components: CircuitComponent[] = [];

  constructor() {
    super();
    this.eventMode = "static";
  }

  public updateComponents(components: CircuitComponent[]) {
    this.components = components;

    // Remove graphics for components that no longer exist
    const existingIds = new Set(components.map((c) => c.id));
    this.componentGraphics.forEach((graphics, id) => {
      if (!existingIds.has(id)) {
        this.removeChild(graphics);
        graphics.destroy();
        this.componentGraphics.delete(id);
      }
    });

    // Update or create graphics for existing components
    components.forEach((component) => {
      let graphics = this.componentGraphics.get(component.id);
      if (!graphics) {
        graphics = this.createComponentGraphics(component);
        this.componentGraphics.set(component.id, graphics);
        this.addChild(graphics);
      } else {
        this.updateComponentGraphics(graphics, component);
      }
    });
  }

  private createComponentGraphics(component: CircuitComponent): PIXI.Container {
    const container = new PIXI.Container();

    // Create component body
    const body = this.createComponentBody(component);
    container.addChild(body);

    // Create pins
    component.pins.forEach((pin, index) => {
      const pinGraphics = this.createPinGraphics(component, pin, index);
      container.addChild(pinGraphics);
    });

    // Create label
    const label = this.createComponentLabel(component);
    container.addChild(label);

    // Set position
    container.position.set(component.position.x, component.position.y);

    // Make interactive
    this.makeComponentInteractive(container, component);

    return container;
  }

  private createComponentBody(component: CircuitComponent): PIXI.Graphics {
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
    // Battery symbol: two parallel lines of different lengths
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill(0x333333);
    graphics.stroke({ width: 2, color: 0xffffff });

    // Positive terminal (longer line)
    graphics.moveTo(-10, -20);
    graphics.lineTo(-10, 20);
    graphics.stroke({ width: 4, color: 0xff4444 });

    // Negative terminal (shorter line)
    graphics.moveTo(10, -15);
    graphics.lineTo(10, 15);
    graphics.stroke({ width: 4, color: 0x444444 });
  }

  private drawResistor(graphics: PIXI.Graphics, width: number, height: number) {
    // Resistor symbol: zigzag line
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
    graphics.stroke({ width: 3, color: 0x44ff44 });
  }

  private drawLED(graphics: PIXI.Graphics, width: number, height: number) {
    // LED symbol: triangle with line
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill(0x333333);
    graphics.stroke({ width: 2, color: 0xffffff });

    // Triangle
    graphics.moveTo(-15, -10);
    graphics.lineTo(-15, 10);
    graphics.lineTo(5, 0);
    graphics.lineTo(-15, -10);
    graphics.fill(0x4444ff);

    // Cathode line
    graphics.moveTo(5, -10);
    graphics.lineTo(5, 10);
    graphics.stroke({ width: 3, color: 0xffffff });

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
    // Capacitor symbol: two parallel lines
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
    // Ground symbol: three horizontal lines decreasing in length
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill(0x333333);
    graphics.stroke({ width: 2, color: 0xffffff });

    // Ground lines
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
    pin: any,
    index: number
  ): PIXI.Graphics {
    const graphics = new PIXI.Graphics();
    const pinSize = 6;

    // Pin position relative to component center
    const relativePos = {
      x: pin.position.x - component.position.x,
      y: pin.position.y - component.position.y,
    };

    graphics.circle(relativePos.x, relativePos.y, pinSize);
    graphics.fill(0xffffff);
    graphics.stroke({ width: 2, color: 0x888888 });

    // Make pin interactive
    graphics.eventMode = "static";
    graphics.cursor = "pointer";

    graphics.on("pointerdown", (event) => {
      event.stopPropagation();
      this.emit("pinClicked", component.id, pin.id, pin.position);
    });

    graphics.on("pointerover", () => {
      graphics.clear();
      graphics.circle(relativePos.x, relativePos.y, pinSize);
      graphics.fill(0x44ff44);
      graphics.stroke({ width: 2, color: 0x66ff66 });
    });

    graphics.on("pointerout", () => {
      graphics.clear();
      graphics.circle(relativePos.x, relativePos.y, pinSize);
      graphics.fill(0xffffff);
      graphics.stroke({ width: 2, color: 0x888888 });
    });

    return graphics;
  }

  private createComponentLabel(component: CircuitComponent): PIXI.Text {
    const label = component.properties?.label || component.type;

    const text = new PIXI.Text({
      text: label,
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 12,
        fill: 0xffffff,
        align: "center",
      }),
    });

    text.anchor.set(0.5);
    text.position.set(0, 35); // Below the component

    return text;
  }

  private updateComponentGraphics(
    container: PIXI.Container,
    component: CircuitComponent
  ) {
    // Update position
    container.position.set(component.position.x, component.position.y);

    // Update label if it exists
    const labelText = container.children.find(
      (child) => child instanceof PIXI.Text
    ) as PIXI.Text;
    if (labelText && component.properties?.label) {
      labelText.text = component.properties.label;
    }
  }

  private makeComponentInteractive(
    container: PIXI.Container,
    component: CircuitComponent
  ) {
    container.eventMode = "static";
    container.cursor = "pointer";

    let isDragging = false;
    let dragStart: Point | null = null;

    container.on("pointerdown", (event) => {
      event.stopPropagation();
      this.emit("componentClicked", component.id);

      isDragging = false;
      dragStart = event.global.clone();
      this.emit("componentDragStart", component.id, component.position);
    });

    container.on("pointermove", (event) => {
      if (dragStart && !isDragging) {
        const distance = Math.sqrt(
          Math.pow(event.global.x - dragStart.x, 2) +
            Math.pow(event.global.y - dragStart.y, 2)
        );
        if (distance > 5) {
          isDragging = true;
        }
      }
    });

    container.on("pointerup", () => {
      if (isDragging) {
        this.emit("componentDragEnd", component.id);
      }
      isDragging = false;
      dragStart = null;
    });

    container.on("pointerover", () => {
      // Highlight component on hover
      const body = container.children[0] as PIXI.Graphics;
      // Add slight glow effect
      container.alpha = 0.8;
    });

    container.on("pointerout", () => {
      container.alpha = 1.0;
    });
  }

  public onCanvasResize(width: number, height: number) {
    // Handle canvas resize if needed
    // For now, components maintain their absolute positions
  }
}
