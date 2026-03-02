import * as PIXI from "pixi.js";
import { Connection, Point, CircuitComponent } from "../../types/Circuit";
import { useComponents } from "../../store/circuitStore";

export class WireManager extends PIXI.Container {
  private wireGraphics: Map<string, PIXI.Graphics> = new Map();
  private connections: Connection[] = [];
  private tempWireGraphic: PIXI.Graphics | null = null;

  // Routing constants
  private readonly COMPONENT_PADDING = 40;
  private readonly COMPONENT_BASE_WIDTH = 80;
  private readonly COMPONENT_BASE_HEIGHT = 60;

  constructor() {
    super();
    this.eventMode = "static";
  }

  public updateConnections(connections: Connection[]) {
    this.connections = connections;

    // Remove graphics for connections that no longer exist
    const existingIds = new Set(connections.map((c) => c.id));
    this.wireGraphics.forEach((graphics, id) => {
      if (!existingIds.has(id)) {
        this.removeChild(graphics);
        graphics.destroy();
        this.wireGraphics.delete(id);
      }
    });

    // Update or create graphics for existing connections
    connections.forEach((connection) => {
      let graphics = this.wireGraphics.get(connection.id);
      if (!graphics) {
        graphics = this.createWireGraphics(connection);
        this.wireGraphics.set(connection.id, graphics);
        this.addChild(graphics);
      } else {
        this.updateWireGraphics(graphics, connection);
      }
    });
  }

  private createWireGraphics(connection: Connection): PIXI.Graphics {
    const graphics = new PIXI.Graphics();
    this.drawWire(graphics, connection);

    // Make wire interactive for selection/highlighting
    graphics.eventMode = "static";
    graphics.cursor = "pointer";

    graphics.on("pointerover", () => {
      // Highlight wire on hover
      this.drawWire(graphics, connection, true);
    });

    graphics.on("pointerout", () => {
      // Remove highlight
      this.drawWire(graphics, connection, false);
    });

    return graphics;
  }

  private updateWireGraphics(graphics: PIXI.Graphics, connection: Connection) {
    this.drawWire(graphics, connection);
  }

  private drawWire(
    graphics: PIXI.Graphics,
    connection: Connection,
    highlighted: boolean = false
  ) {
    graphics.clear();

    const color = highlighted ? 0xffff00 : 0xffffff;
    const width = highlighted ? 4 : 2;

    // Use routed path if available, otherwise calculate
    let path = connection.routedPath;
    if (!path && connection.points.length >= 2) {
      path = this.calculateRoutedPath(
        connection.points[0],
        connection.points[connection.points.length - 1],
        connection.fromPin,
        connection.toPin
      );
    }
    path = path || connection.points;

    // Draw wire path
    if (path.length > 0) {
      graphics.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        graphics.lineTo(path[i].x, path[i].y);
      }
      graphics.stroke({ width, color, cap: "round", join: "round" });

      // Draw connection points
      path.forEach((point, index) => {
        if (index > 0 && index < path.length - 1) {
          graphics.circle(point.x, point.y, 3);
          graphics.fill(color);
        }
      });
    }
  }

  public startTempWire(startPos: Point) {
    if (this.tempWireGraphic) {
      this.removeChild(this.tempWireGraphic);
      this.tempWireGraphic.destroy();
    }

    this.tempWireGraphic = new PIXI.Graphics();
    this.addChild(this.tempWireGraphic);
  }

  public updateTempWire(startPos: Point, currentPos: Point) {
    if (!this.tempWireGraphic) return;

    this.tempWireGraphic.clear();

    // Calculate routed path for temporary wire
    const routedPath = this.calculateRoutedPath(startPos, currentPos);

    // Draw with dashed line style
    this.tempWireGraphic.moveTo(routedPath[0].x, routedPath[0].y);
    for (let i = 1; i < routedPath.length; i++) {
      this.tempWireGraphic.lineTo(routedPath[i].x, routedPath[i].y);
    }
    this.tempWireGraphic.stroke({
      width: 3,
      color: 0x00ff00,
      cap: "round",
      join: "round",
    });

    // Draw dashed effect by creating small gaps
    // This is a simplified approach - for true dashes, you'd use a more complex method
    routedPath.forEach((point, index) => {
      if (index % 2 === 0) {
        this.tempWireGraphic.circle(point.x, point.y, 2);
        this.tempWireGraphic.fill(0x00ff00);
      }
    });
  }

  public clearTempWire() {
    if (this.tempWireGraphic) {
      this.removeChild(this.tempWireGraphic);
      this.tempWireGraphic.destroy();
      this.tempWireGraphic = null;
    }
  }

  private calculateRoutedPath(
    startPos: Point,
    endPos: Point,
    startPinId?: string,
    endPinId?: string
  ): Point[] {
    // TODO: Get components from external state management
    const components: any[] = [];

    // Extract component IDs from pin IDs to exclude their obstacles
    const startComponentId = startPinId
      ? startPinId.replace(/-pin\d+$/, "")
      : null;
    const endComponentId = endPinId ? endPinId.replace(/-pin\d+$/, "") : null;
    const excludedComponentIds = new Set(
      [startComponentId, endComponentId].filter(Boolean)
    );

    // Create obstacles for routing (excluding start/end components)
    const obstacles = components
      .filter((comp) => !excludedComponentIds.has(comp.id))
      .map((comp) => ({
        x:
          comp.position.x -
          this.COMPONENT_BASE_WIDTH / 2 -
          this.COMPONENT_PADDING,
        y:
          comp.position.y -
          this.COMPONENT_BASE_HEIGHT / 2 -
          this.COMPONENT_PADDING,
        width: this.COMPONENT_BASE_WIDTH + this.COMPONENT_PADDING * 2,
        height: this.COMPONENT_BASE_HEIGHT + this.COMPONENT_PADDING * 2,
        componentId: comp.id,
      }));

    return this.findManhattanPath(startPos, endPos, obstacles);
  }

  private findManhattanPath(
    startPos: Point,
    endPos: Point,
    obstacles: any[]
  ): Point[] {
    // Check if direct path is clear
    if (!this.lineIntersectsObstacles(startPos, endPos, obstacles)) {
      return [startPos, endPos];
    }

    // Try L-shaped paths
    const horizontalMid = { x: endPos.x, y: startPos.y };
    if (
      !this.pointInObstacles(horizontalMid, obstacles) &&
      !this.lineIntersectsObstacles(startPos, horizontalMid, obstacles) &&
      !this.lineIntersectsObstacles(horizontalMid, endPos, obstacles)
    ) {
      return [startPos, horizontalMid, endPos];
    }

    const verticalMid = { x: startPos.x, y: endPos.y };
    if (
      !this.pointInObstacles(verticalMid, obstacles) &&
      !this.lineIntersectsObstacles(startPos, verticalMid, obstacles) &&
      !this.lineIntersectsObstacles(verticalMid, endPos, obstacles)
    ) {
      return [startPos, verticalMid, endPos];
    }

    // Try detour routes
    const minOffset = 120;

    // Top detour
    const topRoute = [
      startPos,
      { x: endPos.x, y: startPos.y - minOffset },
      endPos,
    ];

    if (
      !this.lineIntersectsObstacles(startPos, topRoute[1], obstacles) &&
      !this.lineIntersectsObstacles(topRoute[1], endPos, obstacles)
    ) {
      return topRoute;
    }

    // Bottom detour
    const bottomRoute = [
      startPos,
      { x: endPos.x, y: startPos.y + minOffset },
      endPos,
    ];

    if (
      !this.lineIntersectsObstacles(startPos, bottomRoute[1], obstacles) &&
      !this.lineIntersectsObstacles(bottomRoute[1], endPos, obstacles)
    ) {
      return bottomRoute;
    }

    // Left detour
    const leftRoute = [
      startPos,
      { x: startPos.x - minOffset, y: endPos.y },
      endPos,
    ];

    if (
      !this.lineIntersectsObstacles(startPos, leftRoute[1], obstacles) &&
      !this.lineIntersectsObstacles(leftRoute[1], endPos, obstacles)
    ) {
      return leftRoute;
    }

    // Right detour
    const rightRoute = [
      startPos,
      { x: startPos.x + minOffset, y: endPos.y },
      endPos,
    ];

    if (
      !this.lineIntersectsObstacles(startPos, rightRoute[1], obstacles) &&
      !this.lineIntersectsObstacles(rightRoute[1], endPos, obstacles)
    ) {
      return rightRoute;
    }

    // Fallback to preferred L-shape
    const dx = Math.abs(endPos.x - startPos.x);
    const dy = Math.abs(endPos.y - startPos.y);

    return dx > dy
      ? [startPos, horizontalMid, endPos]
      : [startPos, verticalMid, endPos];
  }

  private pointInObstacles(point: Point, obstacles: any[]): boolean {
    return obstacles.some(
      (obstacle) =>
        point.x >= obstacle.x &&
        point.x <= obstacle.x + obstacle.width &&
        point.y >= obstacle.y &&
        point.y <= obstacle.y + obstacle.height
    );
  }

  private lineIntersectsObstacles(
    p1: Point,
    p2: Point,
    obstacles: any[]
  ): boolean {
    return obstacles.some((obstacle) =>
      this.lineIntersectsRect(p1, p2, obstacle)
    );
  }

  private lineIntersectsRect(p1: Point, p2: Point, rect: any): boolean {
    // Check if either endpoint is inside rectangle
    if (this.pointInRect(p1, rect) || this.pointInRect(p2, rect)) {
      return true;
    }

    const { x: rx, y: ry, width: rw, height: rh } = rect;

    // Check intersection with each edge of the rectangle
    const edges = [
      { x1: rx, y1: ry, x2: rx + rw, y2: ry }, // Top edge
      { x1: rx + rw, y1: ry, x2: rx + rw, y2: ry + rh }, // Right edge
      { x1: rx + rw, y1: ry + rh, x2: rx, y2: ry + rh }, // Bottom edge
      { x1: rx, y1: ry + rh, x2: rx, y2: ry }, // Left edge
    ];

    return edges.some((edge) =>
      this.linesIntersect(
        p1.x,
        p1.y,
        p2.x,
        p2.y,
        edge.x1,
        edge.y1,
        edge.x2,
        edge.y2
      )
    );
  }

  private pointInRect(point: Point, rect: any): boolean {
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }

  private linesIntersect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    x4: number,
    y4: number
  ): boolean {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return false; // Lines are parallel

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  public onCanvasResize(width: number, height: number) {
    // Handle canvas resize if needed
    // Wires maintain their absolute positions
  }
}
