import dagre from "dagre";
import { CircuitComponent } from "./CircuitComponent";
import { WirePath, RoutingPoint, WireSegment } from "./OptimizedWireRouter";

/**
 * Advanced wire routing using Dagre.js for hierarchical layouts
 * This provides professional-grade routing algorithms for circuit diagrams
 *
 * Version: 2.3 - Fixed wire routing with reliable fallback
 */
export class DagreWireRouter {
  private graph: dagre.graphlib.Graph;
  private components: Map<string, CircuitComponent>;
  private nodePositions: Map<string, { x: number; y: number }>;

  constructor() {
    this.graph = new dagre.graphlib.Graph();
    this.components = new Map();
    this.nodePositions = new Map();

    // Configure Dagre for circuit diagrams
    this.graph.setGraph({
      rankdir: "TB", // Top to bottom layout
      align: "UL", // Upper left alignment
      nodesep: 50, // Node separation
      edgesep: 20, // Edge separation
      ranksep: 80, // Rank separation
      marginx: 20, // X margin
      marginy: 20, // Y margin
    });

    // Set default edge routing
    this.graph.setDefaultEdgeLabel(() => ({}));
  }

  /**
   * Add a component to the routing graph
   */
  public addComponent(component: CircuitComponent): void {
    const componentId = component.getName();
    this.components.set(componentId, component);

    // Get component position and size from display object
    const position = component.getPosition();
    const displayObject = component.displayObject();
    const bounds = displayObject.getBounds();

    // Add component as a node to the graph
    this.graph.setNode(componentId, {
      width: bounds.width || 40, // Default width if bounds not available
      height: bounds.height || 40, // Default height if bounds not available
      x: position.x,
      y: position.y,
    });

    console.log(`🔌 Added component ${componentId} to Dagre router (v2.0)`);
  }

  /**
   * Remove a component from the routing graph
   */
  public removeComponent(componentId: string): void {
    this.components.delete(componentId);
    this.graph.removeNode(componentId);
    this.nodePositions.delete(componentId);
    console.log(`🗑️ Removed component ${componentId} from Dagre router`);
  }

  /**
   * Route a wire between two points using Dagre's hierarchical layout
   */
  public routeWire(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[] = []
  ): WirePath {
    try {
      console.log(
        `🔧 DagreWireRouter: Starting wire routing from (${start.x}, ${start.y}) to (${end.x}, ${end.y})`
      );

      // Store original coordinates for fallback
      const originalStart = { x: start.x, y: start.y };
      const originalEnd = { x: end.x, y: end.y };

      // Create a temporary graph for this routing
      const tempGraph = new dagre.graphlib.Graph();
      tempGraph.setGraph({
        rankdir: this.getOptimalDirection(start, end),
        align: "UL",
        nodesep: 30,
        edgesep: 15,
        ranksep: 60,
        marginx: 10,
        marginy: 10,
      });

      // Add start and end nodes
      const startId = "start";
      const endId = "end";

      tempGraph.setNode(startId, {
        width: 20,
        height: 20,
        x: start.x,
        y: start.y,
      });

      tempGraph.setNode(endId, {
        width: 20,
        height: 20,
        x: end.x,
        y: end.y,
      });

      // Add components as obstacles
      for (const [componentId, component] of this.components) {
        if (!avoidComponents.includes(componentId)) {
          try {
            const position = component.getPosition();
            const displayObject = component.displayObject();
            const bounds = displayObject.getBounds();

            // Use default size if bounds are not available
            const width = bounds.width > 0 ? bounds.width : 40;
            const height = bounds.height > 0 ? bounds.height : 40;

            console.log(
              `🔧 DagreWireRouter: Adding component ${componentId} with bounds:`,
              bounds,
              `using size: ${width}x${height}`
            );

            tempGraph.setNode(componentId, {
              width: width,
              height: height,
              x: position.x,
              y: position.y,
            });
          } catch (error) {
            console.warn(
              `⚠️ Error adding component ${componentId} to Dagre graph:`,
              error
            );
            // Add with default size
            tempGraph.setNode(componentId, {
              width: 40,
              height: 40,
              x: 0,
              y: 0,
            });
          }
        }
      }

      // Add the edge we want to route
      tempGraph.setEdge(startId, endId, {
        minlen: 1,
        weight: 1,
      });

      // Run Dagre layout
      dagre.layout(tempGraph);

      // Extract the path from the layout
      const path = this.extractPathFromLayout(
        tempGraph,
        startId,
        endId,
        originalStart,
        originalEnd
      );

      console.log(
        `✅ DagreWireRouter: Routing complete with ${path.length} segments`
      );

      return {
        segments: path,
        totalLength: this.calculatePathLength(path),
        bendCount: this.countBends(path),
        layer: 0,
      };
    } catch (error) {
      console.error(`❌ DagreWireRouter error:`, error);
      // Fallback to simple direct path
      return {
        segments: [
          {
            start: { x: start.x, y: start.y, layer: 0 },
            end: { x: end.x, y: end.y, layer: 0 },
            isHorizontal: Math.abs(end.x - start.x) > Math.abs(end.y - start.y),
            layer: 0,
          },
        ],
        totalLength: Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2),
        bendCount: 0,
        layer: 0,
      };
    }
  }

  /**
   * Get optimal layout direction based on start and end positions
   */
  private getOptimalDirection(start: RoutingPoint, end: RoutingPoint): string {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? "LR" : "RL"; // Left to Right or Right to Left
    } else {
      return dy > 0 ? "TB" : "BT"; // Top to Bottom or Bottom to Top
    }
  }

  /**
   * Extract wire path from Dagre layout
   */
  private extractPathFromLayout(
    graph: dagre.graphlib.Graph,
    startId: string,
    endId: string,
    originalStart: { x: number; y: number },
    originalEnd: { x: number; y: number }
  ): WireSegment[] {
    const startNode = graph.node(startId);
    const endNode = graph.node(endId);

    if (!startNode || !endNode) {
      return [];
    }

    // Create a simple orthogonal path between the positioned nodes
    const segments: WireSegment[] = [];

    // Get the edge information
    const edge = graph.edge(startId, endId);
    if (edge && edge.points && edge.points.length > 0) {
      // Use Dagre's calculated edge points but with original start coordinates
      let currentPoint = { x: originalStart.x, y: originalStart.y, layer: 0 };

      for (const point of edge.points) {
        segments.push({
          start: currentPoint,
          end: { x: point.x, y: point.y, layer: 0 },
          isHorizontal:
            Math.abs(point.x - currentPoint.x) >
            Math.abs(point.y - currentPoint.y),
          layer: 0,
        });
        currentPoint = { x: point.x, y: point.y, layer: 0 };
      }

      // Final segment to end using original end coordinates
      segments.push({
        start: currentPoint,
        end: { x: originalEnd.x, y: originalEnd.y, layer: 0 },
        isHorizontal:
          Math.abs(originalEnd.x - currentPoint.x) >
          Math.abs(originalEnd.y - currentPoint.y),
        layer: 0,
      });
    } else {
      // Simple fallback routing - always works
      console.log(
        `🔧 DagreWireRouter: No edge points available, using simple fallback routing`
      );

      // Use the original input coordinates, not Dagre's repositioned coordinates
      const startX = originalStart.x;
      const startY = originalStart.y;
      const endX = originalEnd.x;
      const endY = originalEnd.y;
      const midX = (startX + endX) / 2;

      segments.push({
        start: { x: startX, y: startY, layer: 0 },
        end: { x: midX, y: startY, layer: 0 },
        isHorizontal: true,
        layer: 0,
      });

      segments.push({
        start: { x: midX, y: startY, layer: 0 },
        end: { x: midX, y: endY, layer: 0 },
        isHorizontal: false,
        layer: 0,
      });

      segments.push({
        start: { x: midX, y: endY, layer: 0 },
        end: { x: endX, y: endY, layer: 0 },
        isHorizontal: true,
        layer: 0,
      });
    }

    return segments;
  }

  /**
   * Calculate total path length
   */
  private calculatePathLength(segments: WireSegment[]): number {
    return segments.reduce((total, segment) => {
      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      return total + Math.sqrt(dx * dx + dy * dy);
    }, 0);
  }

  /**
   * Count number of bends in the path
   */
  private countBends(segments: WireSegment[]): number {
    if (segments.length <= 1) return 0;

    let bends = 0;
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].isHorizontal !== segments[i - 1].isHorizontal) {
        bends++;
      }
    }
    return bends;
  }

  /**
   * Update component positions in the graph
   */
  public updateComponentPosition(
    componentId: string,
    x: number,
    y: number
  ): void {
    const component = this.components.get(componentId);
    if (component) {
      component.setPosition(x, y);

      // Get updated bounds
      const displayObject = component.displayObject();
      const bounds = displayObject.getBounds();

      // Update graph node
      this.graph.setNode(componentId, {
        width: bounds.width || 40,
        height: bounds.height || 40,
        x: x,
        y: y,
      });
    }
  }

  /**
   * Get all component positions
   */
  public getComponentPositions(): Map<string, { x: number; y: number }> {
    const positions = new Map();
    for (const [id, component] of this.components) {
      const position = component.getPosition();
      positions.set(id, {
        x: position.x,
        y: position.y,
      });
    }
    return positions;
  }

  /**
   * Clear all components and reset the graph
   */
  public clear(): void {
    this.components.clear();
    this.nodePositions.clear();
    this.graph = new dagre.graphlib.Graph();
    this.graph.setGraph({
      rankdir: "TB",
      align: "UL",
      nodesep: 50,
      edgesep: 20,
      ranksep: 80,
      marginx: 20,
      marginy: 20,
    });
    this.graph.setDefaultEdgeLabel(() => ({}));
  }
}
