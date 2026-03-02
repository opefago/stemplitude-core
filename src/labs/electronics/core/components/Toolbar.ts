import * as PIXI from "pixi.js";
import { ComponentType } from "../../types/Circuit";

export class Toolbar extends PIXI.Container {
  private background: PIXI.Graphics;
  private toolButtons: Map<string, PIXI.Container> = new Map();
  private selectedTool: string = "select";
  public readonly toolbarHeight = 80;

  constructor() {
    super();
    this.createBackground();
    this.createToolButtons();
    this.createGridToggle();
  }

  private createBackground() {
    this.background = new PIXI.Graphics();
    this.background.rect(0, 0, window.innerWidth, this.toolbarHeight);
    this.background.fill(0x2d2d2d);
    this.background.stroke({ width: 1, color: 0x444444 });
    this.addChild(this.background);
  }

  private createToolButtons() {
    const tools = [
      { id: "select", label: "🖱️", tooltip: "Select Tool" },
      { id: "wire", label: "⚡", tooltip: "Wire Tool" },
      { id: "battery", label: "🔋", tooltip: "Battery" },
      { id: "resistor", label: "🔌", tooltip: "Resistor" },
      { id: "led", label: "💡", tooltip: "LED" },
      { id: "capacitor", label: "🔲", tooltip: "Capacitor" },
      { id: "ground", label: "⏚", tooltip: "Ground" },
    ];

    let xPos = 20;
    tools.forEach((tool) => {
      const button = this.createToolButton(tool);
      button.x = xPos;
      button.y = 10;
      this.toolButtons.set(tool.id, button);
      this.addChild(button);
      xPos += 70;
    });

    // Select the first tool by default
    this.selectTool("select");
  }

  private createToolButton(tool: {
    id: string;
    label: string;
    tooltip: string;
  }): PIXI.Container {
    const container = new PIXI.Container();

    // Background
    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, 60, 60, 8);
    bg.fill(0x3d3d3d);
    bg.stroke({ width: 2, color: 0x555555 });
    container.addChild(bg);

    // Icon/Label
    const text = new PIXI.Text({
      text: tool.label,
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 24,
        fill: 0xffffff,
      }),
    });
    text.anchor.set(0.5);
    text.position.set(30, 30);
    container.addChild(text);

    // Make interactive
    container.eventMode = "static";
    container.cursor = "pointer";

    container.on("pointerdown", () => {
      this.selectTool(tool.id);
      this.emit("toolSelected", tool.id);
    });

    container.on("pointerover", () => {
      if (this.selectedTool !== tool.id) {
        bg.clear();
        bg.roundRect(0, 0, 60, 60, 8);
        bg.fill(0x4d4d4d);
        bg.stroke({ width: 2, color: 0x666666 });
      }
    });

    container.on("pointerout", () => {
      if (this.selectedTool !== tool.id) {
        bg.clear();
        bg.roundRect(0, 0, 60, 60, 8);
        bg.fill(0x3d3d3d);
        bg.stroke({ width: 2, color: 0x555555 });
      }
    });

    return container;
  }

  private createGridToggle() {
    const container = new PIXI.Container();

    // Background
    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, 100, 30, 4);
    bg.fill(0x3d3d3d);
    bg.stroke({ width: 1, color: 0x555555 });
    container.addChild(bg);

    // Label
    const text = new PIXI.Text({
      text: "Show Grid",
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 14,
        fill: 0xffffff,
      }),
    });
    text.anchor.set(0.5);
    text.position.set(50, 15);
    container.addChild(text);

    // Position in top-right area
    container.x = window.innerWidth - 320;
    container.y = 25;

    // Make interactive
    container.eventMode = "static";
    container.cursor = "pointer";

    let gridVisible = false;
    container.on("pointerdown", () => {
      gridVisible = !gridVisible;
      this.emit("gridToggled", gridVisible);

      // Update visual state
      bg.clear();
      bg.roundRect(0, 0, 100, 30, 4);
      bg.fill(gridVisible ? 0x4caf50 : 0x3d3d3d);
      bg.stroke({ width: 1, color: gridVisible ? 0x66bb6a : 0x555555 });
    });

    this.addChild(container);
  }

  private selectTool(toolId: string) {
    // Deselect previous tool
    if (this.selectedTool) {
      const prevButton = this.toolButtons.get(this.selectedTool);
      if (prevButton) {
        const bg = prevButton.children[0] as PIXI.Graphics;
        bg.clear();
        bg.roundRect(0, 0, 60, 60, 8);
        bg.fill(0x3d3d3d);
        bg.stroke({ width: 2, color: 0x555555 });
      }
    }

    // Select new tool
    this.selectedTool = toolId;
    const button = this.toolButtons.get(toolId);
    if (button) {
      const bg = button.children[0] as PIXI.Graphics;
      bg.clear();
      bg.roundRect(0, 0, 60, 60, 8);
      bg.fill(0x4caf50);
      bg.stroke({ width: 2, color: 0x66bb6a });
    }
  }

  public getSelectedTool(): string {
    return this.selectedTool;
  }

  public resize(width: number) {
    this.background.clear();
    this.background.rect(0, 0, width, this.toolbarHeight);
    this.background.fill(0x2d2d2d);
    this.background.stroke({ width: 1, color: 0x444444 });

    // Reposition grid toggle
    const gridToggle = this.children[this.children.length - 1];
    gridToggle.x = width - 120;
  }
}
