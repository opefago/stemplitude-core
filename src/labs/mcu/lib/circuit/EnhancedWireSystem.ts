/**
 * Enhanced Wire System with Optimized Routing
 *
 * Integrates the OptimizedWireRouter with the existing WireSystem
 * to provide advanced routing capabilities while maintaining compatibility
 */

import { Graphics, Container } from "pixi.js";
import { CircuitComponent } from "./CircuitComponent";
import {
  OptimizedWireRouter,
  RoutingOptions,
  WirePath,
  RoutingPoint,
} from "./OptimizedWireRouter";
import { GridCanvas } from "./GridCanvas";

export interface EnhancedWireConnection {
  id: string;
  startComponent: string;
  startNode: string;
  endComponent: string;
  endNode: string;
  path: WirePath;
  graphics: Graphics;
  current: number;
  voltage: number;
  isHighlighted: boolean;
}

export interface RoutingStrategy {
  name: string;
  description: string;
  options: Partial<RoutingOptions>;
}

/**
 * Enhanced wire system with multiple routing strategies
 */
export class EnhancedWireSystem {
  private router: OptimizedWireRouter;
  private wires: Map<string, EnhancedWireConnection>;
  private wireContainer: Container;
  private gridCanvas: GridCanvas;
  private components: Map<string, CircuitComponent>;

  // Visual settings
  private wireColor: number = 0xffffff;
  private wireThickness: number = 2;
  private currentFlowColor: number = 0x00ffff;
  private highlightColor: number = 0xffff00;
  private tempWireColor: number = 0x00ff00;

  // Routing strategies
  private strategies: Map<string, RoutingStrategy>;
  private currentStrategy: string = "outside";

  constructor(gridCanvas: GridCanvas) {
    this.gridCanvas = gridCanvas;
    this.wires = new Map();
    this.wireContainer = new Container();
    this.components = new Map();

    // Initialize router with grid dimensions
    const gridDims = gridCanvas.getGridDimensions();
    this.router = new OptimizedWireRouter(
      gridDims.width,
      gridDims.height,
      10, // cell size
      {
        preferOrthogonal: true,
        minimizeBends: true,
        avoidComponents: true,
        enablePostProcessing: true,
        mergeCollinearSegments: true,
        enableCaching: true,
        maxSearchIterations: 8000,
      }
    );

    this.initializeStrategies();
  }

  /**
   * Initialize routing strategies
   */
  private initializeStrategies(): void {
    this.strategies = new Map([
      [
        "fast",
        {
          name: "Fast Routing",
          description: "Quick routing with minimal processing",
          options: {
            preferOrthogonal: true,
            minimizeBends: false,
            avoidComponents: true,
            enablePostProcessing: false,
            enableCaching: true,
            maxSearchIterations: 1000,
          },
        },
      ],
      [
        "balanced",
        {
          name: "Balanced Routing",
          description: "Good balance of speed and quality",
          options: {
            preferOrthogonal: true,
            minimizeBends: true,
            avoidComponents: true,
            enablePostProcessing: true,
            enableCaching: true,
            maxSearchIterations: 5000,
          },
        },
      ],
      [
        "optimal",
        {
          name: "Optimal Routing",
          description: "Highest quality routing with full optimization",
          options: {
            preferOrthogonal: true,
            minimizeBends: true,
            minimizeLength: true,
            avoidComponents: true,
            enablePostProcessing: true,
            enableMultiLayer: true,
            maxLayers: 3,
            enableCaching: true,
            maxSearchIterations: 20000,
          },
        },
      ],
      [
        "simple",
        {
          name: "Simple Routing",
          description: "Direct routing without component avoidance",
          options: {
            preferOrthogonal: true,
            minimizeBends: false,
            avoidComponents: false,
            enablePostProcessing: false,
            enableCaching: false,
          },
        },
      ],
      [
        "outside",
        {
          name: "Outside Routing",
          description: "Prefers routing around components in square patterns",
          options: {
            preferOrthogonal: true,
            minimizeBends: true,
            avoidComponents: true,
            enablePostProcessing: true,
            mergeCollinearSegments: true,
            enableCaching: true,
            maxSearchIterations: 8000,
          },
        },
      ],
    ]);
  }

  /**
   * Get available routing strategies
   */
  public getStrategies(): RoutingStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Set current routing strategy
   */
  public setStrategy(strategyName: string): boolean {
    if (this.strategies.has(strategyName)) {
      this.currentStrategy = strategyName;
      const strategy = this.strategies.get(strategyName)!;
      this.router.setOptions(strategy.options);
      return true;
    }
    return false;
  }

  /**
   * Get current strategy name
   */
  public getCurrentStrategy(): string {
    return this.currentStrategy;
  }

  /**
   * Add a component to the routing system
   */
  public addComponent(component: CircuitComponent): void {
    this.components.set(component.getName(), component);
    this.router.addComponent(component);
  }

  /**
   * Remove a component from the routing system
   */
  public removeComponent(componentId: string): void {
    this.components.delete(componentId);
    this.router.removeComponent(componentId);

    // Remove any wires connected to this component
    const wiresToRemove: string[] = [];
    this.wires.forEach((wire, wireId) => {
      if (
        wire.startComponent === componentId ||
        wire.endComponent === componentId
      ) {
        wiresToRemove.push(wireId);
      }
    });

    wiresToRemove.forEach((wireId) => this.removeWire(wireId));
  }

  /**
   * Update a component in the routing system
   */
  public updateComponent(component: CircuitComponent): void {
    this.components.set(component.getName(), component);
    this.router.updateComponent(component);

    // Reroute wires connected to this component
    this.rerouteConnectedWires(component.getName());
  }

  /**
   * Create a wire between two components
   */
  public createWire(
    wireId: string,
    startComponent: string,
    startNode: string,
    endComponent: string,
    endNode: string
  ): boolean {
    const startComp = this.components.get(startComponent);
    const endComp = this.components.get(endComponent);

    if (!startComp || !endComp) {
      console.error(`Components not found: ${startComponent}, ${endComponent}`);
      return false;
    }

    // Get node positions
    const startPos = this.getNodePosition(startComp, startNode);
    const endPos = this.getNodePosition(endComp, endNode);

    if (!startPos || !endPos) {
      console.error(`Node positions not found: ${startNode}, ${endNode}`);
      return false;
    }

    // Route the wire
    const path = this.router.routeWire(
      startPos,
      endPos,
      [startComponent, endComponent] // Avoid the connected components
    );

    // Create wire graphics
    const graphics = new Graphics();

    // Create wire connection
    const wire: EnhancedWireConnection = {
      id: wireId,
      startComponent,
      startNode,
      endComponent,
      endNode,
      path,
      graphics,
      current: 0,
      voltage: 0,
      isHighlighted: false,
    };

    this.wires.set(wireId, wire);
    this.wireContainer.addChild(graphics);

    // Draw the wire
    this.drawWire(wire);

    console.log(
      `🔌 Created wire ${wireId} with ${path.segments.length} segments, ${path.bendCount} bends, length: ${path.totalLength.toFixed(1)}px`
    );

    return true;
  }

  /**
   * Remove a wire
   */
  public removeWire(wireId: string): boolean {
    const wire = this.wires.get(wireId);
    if (!wire) return false;

    this.wireContainer.removeChild(wire.graphics);
    wire.graphics.destroy();
    this.wires.delete(wireId);

    console.log(`🗑️ Removed wire ${wireId}`);
    return true;
  }

  /**
   * Reroute all wires connected to a component
   */
  private rerouteConnectedWires(componentId: string): void {
    this.wires.forEach((wire, wireId) => {
      if (
        wire.startComponent === componentId ||
        wire.endComponent === componentId
      ) {
        this.rerouteWire(wireId);
      }
    });
  }

  /**
   * Reroute a specific wire
   */
  public rerouteWire(wireId: string): boolean {
    const wire = this.wires.get(wireId);
    if (!wire) return false;

    const startComp = this.components.get(wire.startComponent);
    const endComp = this.components.get(wire.endComponent);

    if (!startComp || !endComp) return false;

    const startPos = this.getNodePosition(startComp, wire.startNode);
    const endPos = this.getNodePosition(endComp, wire.endNode);

    if (!startPos || !endPos) return false;

    // Route the wire with new path
    const newPath = this.router.routeWire(startPos, endPos, [
      wire.startComponent,
      wire.endComponent,
    ]);

    wire.path = newPath;
    this.drawWire(wire);

    console.log(`🔄 Rerouted wire ${wireId}`);
    return true;
  }

  /**
   * Get node position from component
   */
  private getNodePosition(
    component: CircuitComponent,
    nodeId: string
  ): RoutingPoint | null {
    const nodes = component.getNodes();
    const node = nodes.find((n) => n.id === nodeId);

    if (!node) return null;

    return {
      x: node.x,
      y: node.y,
      layer: 0,
    };
  }

  /**
   * Draw a wire
   */
  private drawWire(wire: EnhancedWireConnection): void {
    const graphics = wire.graphics;
    graphics.clear();

    // Set wire color based on state
    let color = this.wireColor;
    if (wire.isHighlighted) {
      color = this.highlightColor;
    } else if (Math.abs(wire.current) > 0.001) {
      color = this.currentFlowColor;
    }

    // Draw wire segments
    wire.path.segments.forEach((segment, index) => {
      graphics.moveTo(segment.start.x, segment.start.y);
      graphics.lineTo(segment.end.x, segment.end.y);
      graphics.stroke({
        width: this.wireThickness,
        color: color,
        alpha: 0.9,
      });
    });

    // Draw connection dots at endpoints
    if (wire.path.segments.length > 0) {
      const firstSegment = wire.path.segments[0];
      const lastSegment = wire.path.segments[wire.path.segments.length - 1];

      graphics.circle(firstSegment.start.x, firstSegment.start.y, 3);
      graphics.fill(color);
      graphics.circle(lastSegment.end.x, lastSegment.end.y, 3);
      graphics.fill(color);
    }

    // Draw current flow animation if current is flowing
    if (Math.abs(wire.current) > 0.001) {
      this.drawCurrentFlow(wire);
    }
  }

  /**
   * Draw current flow animation
   */
  private drawCurrentFlow(wire: EnhancedWireConnection): void {
    const flowGraphics = new Graphics();
    const animationTime = Date.now() / 300; // 300ms cycle
    const flowDirection = wire.current > 0 ? 1 : -1;

    // Draw moving dots along each segment
    wire.path.segments.forEach((segment, segmentIndex) => {
      const segmentLength = Math.sqrt(
        Math.pow(segment.end.x - segment.start.x, 2) +
          Math.pow(segment.end.y - segment.start.y, 2)
      );

      const numDots = Math.max(1, Math.floor(segmentLength / 30));

      for (let i = 0; i < numDots; i++) {
        const progress =
          (i / numDots + animationTime * flowDirection + segmentIndex) % 1;
        if (progress < 0) continue;

        const x =
          segment.start.x + (segment.end.x - segment.start.x) * progress;
        const y =
          segment.start.y + (segment.end.y - segment.start.y) * progress;

        flowGraphics.circle(x, y, 2);
        flowGraphics.fill({ color: this.currentFlowColor, alpha: 0.8 });
      }
    });

    this.wireContainer.addChild(flowGraphics);

    // Remove flow graphics after animation
    setTimeout(() => {
      if (flowGraphics.parent) {
        flowGraphics.parent.removeChild(flowGraphics);
      }
      flowGraphics.destroy();
    }, 300);
  }

  /**
   * Update wire states with analysis results
   */
  public updateWireStates(results: any): void {
    this.wires.forEach((wire, wireId) => {
      // Update wire current and voltage from analysis results
      // This would be implemented based on your specific analysis result format
      wire.current = 0; // Placeholder
      wire.voltage = 0; // Placeholder

      // Redraw wire with updated state
      this.drawWire(wire);
    });
  }

  /**
   * Highlight a wire
   */
  public highlightWire(wireId: string, highlight: boolean = true): void {
    const wire = this.wires.get(wireId);
    if (wire) {
      wire.isHighlighted = highlight;
      this.drawWire(wire);
    }
  }

  /**
   * Get wire container for adding to scene
   */
  public getContainer(): Container {
    return this.wireContainer;
  }

  /**
   * Get all wires
   */
  public getWires(): Map<string, EnhancedWireConnection> {
    return this.wires;
  }

  /**
   * Get wire by ID
   */
  public getWire(wireId: string): EnhancedWireConnection | undefined {
    return this.wires.get(wireId);
  }

  /**
   * Clear all wires
   */
  public clearWires(): void {
    this.wires.forEach((wire) => {
      this.wireContainer.removeChild(wire.graphics);
      wire.graphics.destroy();
    });
    this.wires.clear();
  }

  /**
   * Get routing statistics
   */
  public getRoutingStats(): {
    totalWires: number;
    totalSegments: number;
    totalBends: number;
    totalLength: number;
    averageBendsPerWire: number;
    averageLengthPerWire: number;
  } {
    let totalSegments = 0;
    let totalBends = 0;
    let totalLength = 0;

    this.wires.forEach((wire) => {
      totalSegments += wire.path.segments.length;
      totalBends += wire.path.bendCount;
      totalLength += wire.path.totalLength;
    });

    return {
      totalWires: this.wires.size,
      totalSegments,
      totalBends,
      totalLength,
      averageBendsPerWire:
        this.wires.size > 0 ? totalBends / this.wires.size : 0,
      averageLengthPerWire:
        this.wires.size > 0 ? totalLength / this.wires.size : 0,
    };
  }

  /**
   * Destroy the wire system
   */
  public destroy(): void {
    this.clearWires();
    this.wireContainer.destroy();
    this.router.clearCache();
  }
}
