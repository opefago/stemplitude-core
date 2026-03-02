/**
 * Interactive Wire Integration
 *
 * Integrates the InteractiveWireSystem with CircuitScene
 * to provide seamless wire editing capabilities
 */

import { CircuitScene } from "./CircuitScene";
import {
  InteractiveWireSystem,
  InteractiveWireConnection,
  WireNode,
} from "./InteractiveWireSystem";
import { CircuitComponent } from "./CircuitComponent";
import { GridCanvas } from "./GridCanvas";

export interface WireEditMode {
  enabled: boolean;
  selectedWire: string | null;
  dragPoint: { x: number; y: number } | null;
  snapThreshold: number;
}

export interface WireEditOptions {
  enableDragToRoute: boolean;
  enableWireJoining: boolean;
  enableSmartDeletion: boolean;
  showJunctionNodes: boolean;
  snapToGrid: boolean;
  snapThreshold: number;
}

/**
 * Integration layer for interactive wire editing
 */
export class InteractiveWireIntegration {
  private circuitScene: CircuitScene;
  private wireSystem: InteractiveWireSystem;
  private gridCanvas: GridCanvas;

  private editMode: WireEditMode;
  private options: WireEditOptions;

  constructor(circuitScene: CircuitScene, gridCanvas: GridCanvas) {
    this.circuitScene = circuitScene;
    this.gridCanvas = gridCanvas;
    this.wireSystem = new InteractiveWireSystem(gridCanvas);

    this.editMode = {
      enabled: true, // Enable by default
      selectedWire: null,
      dragPoint: null,
      snapThreshold: 15,
    };

    this.options = {
      enableDragToRoute: true,
      enableWireJoining: true,
      enableSmartDeletion: true,
      showJunctionNodes: true,
      snapToGrid: true,
      snapThreshold: 15,
    };

    this.setupIntegration();
  }

  /**
   * Setup integration with CircuitScene
   */
  private setupIntegration(): void {
    // Add wire system container to zoomable container (same as regular wire system)
    this.circuitScene.zoomableContainer.addChild(
      this.wireSystem.getContainer()
    );

    // Override circuit scene wire methods
    this.overrideWireMethods();

    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();

    console.log("🔌 Interactive wire system integrated with CircuitScene");
  }

  /**
   * Override CircuitScene wire methods
   */
  private overrideWireMethods(): void {
    // Override createWire method
    (this.circuitScene as any).createWire = (
      wireId: string,
      startComp: string,
      startNode: string,
      endComp: string,
      endNode: string
    ) => {
      return this.createWire(wireId, startComp, startNode, endComp, endNode);
    };

    // Override removeWire method
    (this.circuitScene as any).removeWire = (wireId: string) => {
      return this.removeWire(wireId);
    };

    // Override updateWireStates method
    (this.circuitScene as any).updateWireStates = (results: any) => {
      this.updateWireStates(results);
    };
  }

  /**
   * Setup keyboard shortcuts for wire editing
   */
  private setupKeyboardShortcuts(): void {
    document.addEventListener("keydown", (event) => {
      if (!this.editMode.enabled) return;

      switch (event.key) {
        case "Escape":
          this.cancelWireEdit();
          break;
        case "Delete":
        case "Backspace":
          if (this.editMode.selectedWire) {
            this.deleteSelectedWire();
          }
          break;
        case "j":
          if (event.ctrlKey) {
            this.toggleJunctionNodes();
          }
          break;
        case "r":
          if (event.ctrlKey) {
            this.rerouteSelectedWire();
          }
          break;
      }
    });
  }

  /**
   * Create a wire with interactive capabilities
   */
  public createWire(
    wireId: string,
    startComponent: string,
    startNode: string,
    endComponent: string,
    endNode: string
  ): boolean {
    const success = this.wireSystem.createWire(
      wireId,
      startComponent,
      startNode,
      endComponent,
      endNode
    );

    if (success) {
      console.log(`🔌 Created interactive wire ${wireId}`);

      // Get routing statistics
      const stats = this.getRoutingStats();
      console.log(`📊 Routing Stats:`, stats);
    }

    return success;
  }

  /**
   * Remove a wire
   */
  public removeWire(wireId: string): boolean {
    const success = this.wireSystem.removeWire(wireId);

    if (success) {
      console.log(`🗑️ Removed wire ${wireId}`);
    }

    return success;
  }

  /**
   * Update wire states with analysis results
   */
  public updateWireStates(results: any): void {
    this.wireSystem.getWires().forEach((wire, wireId) => {
      // Update wire current and voltage from analysis results
      // This would be implemented based on your specific analysis result format
      wire.current = 0; // Placeholder
      wire.voltage = 0; // Placeholder

      // Redraw wire with updated state
      this.wireSystem.getContainer().removeChild(wire.graphics);
      this.wireSystem.getContainer().addChild(wire.graphics);
    });
  }

  /**
   * Enable wire edit mode
   */
  public enableWireEditMode(): void {
    this.editMode.enabled = true;
    console.log("✏️ Wire edit mode enabled");
    this.showEditInstructions();
  }

  /**
   * Disable wire edit mode
   */
  public disableWireEditMode(): void {
    this.editMode.enabled = false;
    this.editMode.selectedWire = null;
    this.editMode.dragPoint = null;
    console.log("✏️ Wire edit mode disabled");
  }

  /**
   * Toggle wire edit mode
   */
  public toggleWireEditMode(): void {
    if (this.editMode.enabled) {
      this.disableWireEditMode();
    } else {
      this.enableWireEditMode();
    }
  }

  /**
   * Show edit instructions
   */
  private showEditInstructions(): void {
    const instructions = document.createElement("div");
    instructions.id = "wire-edit-instructions";
    instructions.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 15px;
        border-radius: 8px;
        font-family: monospace;
        font-size: 12px;
        z-index: 1000;
        max-width: 300px;
      ">
        <h4 style="margin: 0 0 10px 0; color: #00ff00;">🔧 Wire Edit Mode</h4>
        <p style="margin: 5px 0;"><strong>Click & Drag:</strong> Reroute wires</p>
        <p style="margin: 5px 0;"><strong>Drag to Wire:</strong> Join wires</p>
        <p style="margin: 5px 0;"><strong>Delete Key:</strong> Delete wire to nearest node</p>
        <p style="margin: 5px 0;"><strong>Ctrl+J:</strong> Toggle junction nodes</p>
        <p style="margin: 5px 0;"><strong>Ctrl+R:</strong> Reroute selected wire</p>
        <p style="margin: 5px 0;"><strong>Escape:</strong> Cancel edit</p>
        <button onclick="this.parentElement.remove()" style="
          background: #ff4444;
          color: white;
          border: none;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 10px;
        ">Close</button>
      </div>
    `;

    document.body.appendChild(instructions);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (instructions.parentElement) {
        instructions.remove();
      }
    }, 10000);
  }

  /**
   * Cancel wire edit
   */
  private cancelWireEdit(): void {
    this.editMode.selectedWire = null;
    this.editMode.dragPoint = null;
    console.log("❌ Wire edit cancelled");
  }

  /**
   * Delete selected wire
   */
  private deleteSelectedWire(): void {
    if (!this.editMode.selectedWire) return;

    const success = this.wireSystem.removeWire(this.editMode.selectedWire);
    if (success) {
      this.editMode.selectedWire = null;
      console.log(`🗑️ Deleted wire ${this.editMode.selectedWire}`);
    }
  }

  /**
   * Toggle junction nodes visibility
   */
  private toggleJunctionNodes(): void {
    this.options.showJunctionNodes = !this.options.showJunctionNodes;
    console.log(
      `🔗 Junction nodes ${this.options.showJunctionNodes ? "shown" : "hidden"}`
    );
  }

  /**
   * Reroute selected wire
   */
  private rerouteSelectedWire(): void {
    if (!this.editMode.selectedWire) return;

    const wire = this.wireSystem.getWires().get(this.editMode.selectedWire);
    if (!wire) return;

    // Trigger automatic rerouting
    console.log(`🔄 Rerouting wire ${this.editMode.selectedWire}`);
  }

  /**
   * Get routing statistics
   */
  public getRoutingStats(): {
    totalWires: number;
    totalJunctions: number;
    totalNodes: number;
    averageSegmentsPerWire: number;
    totalWireLength: number;
  } {
    const wires = this.wireSystem.getWires();
    const nodes = this.wireSystem.getNodes();

    let totalSegments = 0;
    let totalLength = 0;
    let junctionCount = 0;

    wires.forEach((wire) => {
      totalSegments += wire.segments.length;
      totalLength += wire.segments.reduce((sum, segment) => {
        const dx = segment.end.x - segment.start.x;
        const dy = segment.end.y - segment.start.y;
        return sum + Math.sqrt(dx * dx + dy * dy);
      }, 0);
    });

    nodes.forEach((node) => {
      if (node.type === "junction") {
        junctionCount++;
      }
    });

    return {
      totalWires: wires.size,
      totalJunctions: junctionCount,
      totalNodes: nodes.size,
      averageSegmentsPerWire: wires.size > 0 ? totalSegments / wires.size : 0,
      totalWireLength: totalLength,
    };
  }

  /**
   * Set wire edit options
   */
  public setOptions(options: Partial<WireEditOptions>): void {
    this.options = { ...this.options, ...options };
    console.log("⚙️ Wire edit options updated:", this.options);
  }

  /**
   * Get current options
   */
  public getOptions(): WireEditOptions {
    return { ...this.options };
  }

  /**
   * Get wire system
   */
  public getWireSystem(): InteractiveWireSystem {
    return this.wireSystem;
  }

  /**
   * Add component to wire system
   */
  public addComponent(component: CircuitComponent): void {
    this.wireSystem.addComponent(component);
  }

  /**
   * Remove component from wire system
   */
  public removeComponent(componentId: string): void {
    this.wireSystem.removeComponent(componentId);
  }

  /**
   * Clear all wires
   */
  public clearWires(): void {
    this.wireSystem.clearWires();
  }

  /**
   * Get all wires
   */
  public getWires(): Map<string, InteractiveWireConnection> {
    return this.wireSystem.getWires();
  }

  /**
   * Get all nodes
   */
  public getNodes(): Map<string, WireNode> {
    return this.wireSystem.getNodes();
  }

  /**
   * Update wire positions when components move
   */
  public updateWirePositions(componentId: string): void {
    this.wireSystem.updateWirePositions(componentId);
  }

  /**
   * Select wire at point
   */
  public selectWireAtPoint(x: number, y: number): boolean {
    return this.wireSystem.selectWireAtPoint(x, y);
  }

  /**
   * Set the wire routing strategy
   */
  public setRoutingStrategy(strategy: "dagre" | "astar" | "hybrid"): void {
    this.wireSystem.setRoutingStrategy(strategy);
  }

  /**
   * Test the open-source routing algorithms
   */
  public testOpenSourceRouting(): void {
    this.wireSystem.testOpenSourceRouting();
  }

  /**
   * Destroy the integration
   */
  public destroy(): void {
    this.wireSystem.destroy();
  }
}

/**
 * Wire Edit Mode Toggle Button
 */
export class WireEditToggle {
  private button: HTMLButtonElement;
  private integration: InteractiveWireIntegration;
  private isActive: boolean = false;

  constructor(integration: InteractiveWireIntegration) {
    this.integration = integration;
    this.createButton();
  }

  private createButton(): void {
    this.button = document.createElement("button");
    this.button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
      </svg>
      <span>Wire Edit Mode</span>
    `;

    this.button.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px 15px;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.3s ease;
      z-index: 1000;
      display: none; /* Hidden by default since wire editing is always enabled */
      align-items: center;
      gap: 8px;
    `;

    this.button.addEventListener("click", () => this.toggle());
    this.button.addEventListener("mouseenter", () => {
      this.button.style.transform = "translateY(-2px)";
      this.button.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.2)";
    });
    this.button.addEventListener("mouseleave", () => {
      this.button.style.transform = "translateY(0)";
      this.button.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
    });

    document.body.appendChild(this.button);
  }

  private toggle(): void {
    this.isActive = !this.isActive;

    if (this.isActive) {
      this.integration.enableWireEditMode();
      this.button.style.background =
        "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)";
      this.button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
        <span>Exit Edit</span>
      `;
    } else {
      this.integration.disableWireEditMode();
      this.button.style.background =
        "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
      this.button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        </svg>
        <span>Edit Wires</span>
      `;
    }
  }

  public destroy(): void {
    if (this.button.parentElement) {
      this.button.parentElement.removeChild(this.button);
    }
  }
}
