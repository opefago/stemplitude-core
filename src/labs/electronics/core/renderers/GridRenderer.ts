import * as PIXI from "pixi.js";

export class GridRenderer extends PIXI.Container {
  private gridGraphics: PIXI.Graphics;
  private gridSize: number = 20;
  private canvasWidth: number;
  private canvasHeight: number;

  constructor(width: number, height: number) {
    super();
    this.canvasWidth = width;
    this.canvasHeight = height;

    this.gridGraphics = new PIXI.Graphics();
    this.addChild(this.gridGraphics);

    this.drawGrid();
  }

  private drawGrid() {
    this.gridGraphics.clear();

    const gridColor = 0x333333;
    const majorGridColor = 0x444444;
    const lineWidth = 1;

    // Draw vertical lines
    for (let x = 0; x <= this.canvasWidth; x += this.gridSize) {
      const isMajor = x % (this.gridSize * 5) === 0;
      const color = isMajor ? majorGridColor : gridColor;
      const alpha = isMajor ? 0.6 : 0.3;

      this.gridGraphics.moveTo(x, 0);
      this.gridGraphics.lineTo(x, this.canvasHeight);
      this.gridGraphics.stroke({ width: lineWidth, color, alpha });
    }

    // Draw horizontal lines
    for (let y = 0; y <= this.canvasHeight; y += this.gridSize) {
      const isMajor = y % (this.gridSize * 5) === 0;
      const color = isMajor ? majorGridColor : gridColor;
      const alpha = isMajor ? 0.6 : 0.3;

      this.gridGraphics.moveTo(0, y);
      this.gridGraphics.lineTo(this.canvasWidth, y);
      this.gridGraphics.stroke({ width: lineWidth, color, alpha });
    }
  }

  public resize(width: number, height: number) {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.drawGrid();
  }

  public setGridSize(size: number) {
    this.gridSize = size;
    this.drawGrid();
  }

  public getGridSize(): number {
    return this.gridSize;
  }

  public snapToGrid(point: { x: number; y: number }): { x: number; y: number } {
    return {
      x: Math.round(point.x / this.gridSize) * this.gridSize,
      y: Math.round(point.y / this.gridSize) * this.gridSize,
    };
  }
}
