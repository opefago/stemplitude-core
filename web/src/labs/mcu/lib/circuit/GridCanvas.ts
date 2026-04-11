import { Container, Graphics, Text } from "pixi.js";

export interface GridSettings {
  size: number; // Grid size in pixels
  majorGridLines: number; // Every N lines is a major grid line
  showGrid: boolean;
  snapToGrid: boolean;
  gridColor: number;
  majorGridColor: number;
  backgroundColor: number;
  snapIndicatorColor: number;
  snapIndicatorAlpha: number;
  unitSize?: number; // Unit size for measurement scale (default: 1)
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Grid-based canvas for circuit simulation with snap-to-grid functionality
 */
export class GridCanvas {
  private container: Container;
  private gridGraphics: Graphics;
  private settings: GridSettings;
  private width: number;
  private height: number;

  // Grid coordinate system
  private gridWidth: number;
  private gridHeight: number;

  // Visual elements
  private coordinateLabels: Text[];
  private snapIndicator: Graphics | null = null;
  private currentHighlight: Graphics | null = null;

  constructor(width: number, height: number, settings?: Partial<GridSettings>) {
    this.width = width;
    this.height = height;
    this.coordinateLabels = [];

    // Default grid settings
    this.settings = {
      size: 20, // 20 pixels per grid unit
      majorGridLines: 5, // Every 5th line is major
      showGrid: true,
      snapToGrid: true,
      gridColor: 0x333333, // Dark gray for circuit theme
      majorGridColor: 0x444444, // Slightly lighter gray
      backgroundColor: 0x1a1a1a, // Dark background for circuit theme
      snapIndicatorColor: 0x00ff00, // Green snap indicator
      snapIndicatorAlpha: 0.5,
      unitSize: 1, // Default unit size
      ...settings,
    };

    this.gridWidth = Math.ceil(width / this.settings.size);
    this.gridHeight = Math.ceil(height / this.settings.size);

    this.container = new Container();
    this.gridGraphics = new Graphics();
    this.container.addChild(this.gridGraphics);

    this.drawGrid();
    this.drawCoordinateLabels();
  }

  /**
   * Update coordinate labels based on camera position
   */
  public updateCoordinateLabels(
    cameraOffsetX: number,
    cameraOffsetY: number
  ): void {
    this.drawCoordinateLabels(cameraOffsetX, cameraOffsetY);
  }

  /**
   * Get the grid container
   */
  public getContainer(): Container {
    return this.container;
  }

  /**
   * Draw the grid with improved rendering from reference implementation
   */
  private drawGrid(): void {
    this.gridGraphics.clear();

    // Always draw background
    this.gridGraphics.rect(0, 0, this.width, this.height);
    this.gridGraphics.fill(this.settings.backgroundColor);

    if (!this.settings.showGrid) return;

    // Draw vertical lines
    for (let x = 0; x <= this.gridWidth; x++) {
      const pixelX = x * this.settings.size;
      const isMajor = x % this.settings.majorGridLines === 0;
      const color = isMajor
        ? this.settings.majorGridColor
        : this.settings.gridColor;
      const alpha = isMajor ? 0.6 : 0.3;

      this.gridGraphics.moveTo(pixelX, 0);
      this.gridGraphics.lineTo(pixelX, this.height);
      this.gridGraphics.stroke({ width: 1, color, alpha });
    }

    // Draw horizontal lines
    for (let y = 0; y <= this.gridHeight; y++) {
      const pixelY = y * this.settings.size;
      const isMajor = y % this.settings.majorGridLines === 0;
      const color = isMajor
        ? this.settings.majorGridColor
        : this.settings.gridColor;
      const alpha = isMajor ? 0.6 : 0.3;

      this.gridGraphics.moveTo(0, pixelY);
      this.gridGraphics.lineTo(this.width, pixelY);
      this.gridGraphics.stroke({ width: 1, color, alpha });
    }
  }

  /**
   * Draw coordinate labels on major grid lines
   */
  private drawCoordinateLabels(
    cameraOffsetX: number = 0,
    cameraOffsetY: number = 0
  ): void {
    // Clear existing labels
    this.coordinateLabels.forEach((label) => {
      if (label.parent) {
        label.parent.removeChild(label);
      }
      label.destroy();
    });
    this.coordinateLabels = [];

    if (!this.settings.showGrid) return;

    // X-axis labels (bottom)
    for (let x = 0; x <= this.gridWidth; x += this.settings.majorGridLines) {
      const pixelX = x * this.settings.size;

      // Calculate world coordinate with center at (0,0)
      // Screen center is at (width/2, height/2)
      // In screen coordinates: X=0 is left, X increases rightward
      // In world coordinates: X=0 is center, X+ is right, X- is left
      const screenCenterX = this.width / 2;
      const worldX =
        (pixelX - screenCenterX - cameraOffsetX) / this.settings.size;
      const unitValue = (worldX * this.settings.unitSize!).toFixed(1);

      // Skip labels too close to zero to avoid clutter
      if (Math.abs(worldX * this.settings.unitSize!) < 0.1) continue;

      const label = new Text({
        text: unitValue,
        style: {
          fontSize: 10,
          fill: 0x666666,
          fontFamily: "Arial",
        },
      });

      label.anchor.set(0.5, 0);
      label.position.set(pixelX, this.height - 15);
      this.container.addChild(label);
      this.coordinateLabels.push(label);
    }

    // Y-axis labels (left side)
    for (let y = 0; y <= this.gridHeight; y += this.settings.majorGridLines) {
      const pixelY = y * this.settings.size;

      // Calculate world coordinate with center at (0,0)
      // Screen center is at (width/2, height/2)
      // In screen coordinates: Y=0 is top, Y increases downward
      // In world coordinates: Y=0 is center, Y+ is up, Y- is down
      const screenCenterY = this.height / 2;
      const worldY =
        (screenCenterY - pixelY + cameraOffsetY) / this.settings.size;
      const unitValue = (worldY * this.settings.unitSize!).toFixed(1);

      // Skip labels too close to zero to avoid clutter
      if (Math.abs(worldY * this.settings.unitSize!) < 0.1) continue;

      const label = new Text({
        text: unitValue,
        style: {
          fontSize: 10,
          fill: 0x666666,
          fontFamily: "Arial",
        },
      });

      label.anchor.set(1, 0.5);
      label.position.set(15, pixelY);
      this.container.addChild(label);
      this.coordinateLabels.push(label);
    }

  }

  /**
   * Convert world coordinates to grid coordinates
   */
  public worldToGrid(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: Math.round(worldX / this.settings.size),
      y: Math.round(worldY / this.settings.size),
    };
  }

  /**
   * Convert grid coordinates to world coordinates
   */
  public gridToWorld(gridX: number, gridY: number): { x: number; y: number } {
    return {
      x: gridX * this.settings.size,
      y: gridY * this.settings.size,
    };
  }

  /**
   * Snap world coordinates to grid with improved algorithm from reference
   */
  public snapToGrid(worldX: number, worldY: number): Point {
    if (!this.settings.snapToGrid) {
      return { x: worldX, y: worldY };
    }

    return {
      x: Math.round(worldX / this.settings.size) * this.settings.size,
      y: Math.round(worldY / this.settings.size) * this.settings.size,
    };
  }

  /**
   * Show snap indicator at the given position
   */
  public showSnapIndicator(worldX: number, worldY: number): void {
    if (!this.settings.snapToGrid) return;

    const snappedPos = this.snapToGrid(worldX, worldY);

    if (!this.snapIndicator) {
      this.snapIndicator = new Graphics();
      this.container.addChild(this.snapIndicator);
    }

    this.snapIndicator.clear();
    this.snapIndicator.circle(snappedPos.x, snappedPos.y, 4);
    this.snapIndicator.fill({
      color: this.settings.snapIndicatorColor,
      alpha: this.settings.snapIndicatorAlpha,
    });
    this.snapIndicator.circle(snappedPos.x, snappedPos.y, 4);
    this.snapIndicator.stroke({
      width: 2,
      color: this.settings.snapIndicatorColor,
      alpha: this.settings.snapIndicatorAlpha + 0.3,
    });
  }

  /**
   * Hide snap indicator
   */
  public hideSnapIndicator(): void {
    if (this.snapIndicator) {
      this.snapIndicator.clear();
    }
  }

  /**
   * Check if grid coordinates are valid (within bounds)
   */
  public isValidGridPosition(gridX: number, gridY: number): boolean {
    return (
      gridX >= 0 &&
      gridX <= this.gridWidth &&
      gridY >= 0 &&
      gridY <= this.gridHeight
    );
  }

  /**
   * Get grid settings
   */
  public getSettings(): GridSettings {
    return { ...this.settings };
  }

  /**
   * Update grid settings
   */
  public updateSettings(newSettings: Partial<GridSettings>): void {
    Object.assign(this.settings, newSettings);

    // Recalculate grid dimensions if size changed
    if (newSettings.size) {
      this.gridWidth = Math.ceil(this.width / this.settings.size);
      this.gridHeight = Math.ceil(this.height / this.settings.size);
    }

    this.drawGrid();
    this.drawCoordinateLabels();
  }

  /**
   * Toggle grid visibility
   */
  public toggleGrid(): void {
    this.settings.showGrid = !this.settings.showGrid;
    this.updateSettings({});
  }

  /**
   * Toggle snap to grid
   */
  public toggleSnapToGrid(): void {
    this.settings.snapToGrid = !this.settings.snapToGrid;
  }

  /**
   * Get grid dimensions
   */
  public getGridDimensions(): { width: number; height: number } {
    return {
      width: this.gridWidth,
      height: this.gridHeight,
    };
  }

  /**
   * Get canvas dimensions
   */
  public getCanvasDimensions(): { width: number; height: number } {
    return {
      width: this.width,
      height: this.height,
    };
  }

  /**
   * Resize the canvas
   */
  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.gridWidth = Math.ceil(width / this.settings.size);
    this.gridHeight = Math.ceil(height / this.settings.size);

    this.drawGrid();
    this.drawCoordinateLabels();
  }

  /**
   * Highlight a grid cell
   */
  public highlightGridCell(
    gridX: number,
    gridY: number,
    color: number = 0x00ff00,
    alpha: number = 0.3
  ): Graphics {
    const highlight = new Graphics();
    highlight.beginFill(color, alpha);

    const worldPos = this.gridToWorld(gridX, gridY);
    const halfSize = this.settings.size / 2;

    highlight.drawRect(
      worldPos.x - halfSize,
      worldPos.y - halfSize,
      this.settings.size,
      this.settings.size
    );
    highlight.endFill();

    this.container.addChild(highlight);
    return highlight;
  }

  /**
   * Remove highlight
   */
  public removeHighlight(highlight: Graphics): void {
    if (highlight.parent) {
      highlight.parent.removeChild(highlight);
    }
    highlight.destroy();
  }

  /**
   * Get all grid positions within a rectangular area
   */
  public getGridPositionsInArea(
    worldX1: number,
    worldY1: number,
    worldX2: number,
    worldY2: number
  ): { x: number; y: number }[] {
    const grid1 = this.worldToGrid(
      Math.min(worldX1, worldX2),
      Math.min(worldY1, worldY2)
    );
    const grid2 = this.worldToGrid(
      Math.max(worldX1, worldX2),
      Math.max(worldY1, worldY2)
    );

    const positions: { x: number; y: number }[] = [];

    for (let x = grid1.x; x <= grid2.x; x++) {
      for (let y = grid1.y; y <= grid2.y; y++) {
        if (this.isValidGridPosition(x, y)) {
          positions.push({ x, y });
        }
      }
    }

    return positions;
  }

  /**
   * Find nearest grid position to world coordinates
   */
  public findNearestGridPosition(
    worldX: number,
    worldY: number
  ): { x: number; y: number } {
    const gridX = Math.round(worldX / this.settings.size);
    const gridY = Math.round(worldY / this.settings.size);

    // Clamp to valid range
    return {
      x: Math.max(0, Math.min(this.gridWidth, gridX)),
      y: Math.max(0, Math.min(this.gridHeight, gridY)),
    };
  }

  /**
   * Calculate distance between two grid positions
   */
  public gridDistance(
    pos1: { x: number; y: number },
    pos2: { x: number; y: number }
  ): number {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate Manhattan distance between two grid positions
   */
  public manhattanDistance(
    pos1: { x: number; y: number },
    pos2: { x: number; y: number }
  ): number {
    return Math.abs(pos2.x - pos1.x) + Math.abs(pos2.y - pos1.y);
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    this.coordinateLabels.forEach((label) => label.destroy());
    this.coordinateLabels = [];

    if (this.snapIndicator) {
      this.snapIndicator.destroy();
      this.snapIndicator = null;
    }

    if (this.currentHighlight) {
      this.currentHighlight.destroy();
      this.currentHighlight = null;
    }

    this.gridGraphics.destroy();
    this.container.destroy();
  }
}
