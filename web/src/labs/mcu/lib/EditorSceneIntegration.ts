/**
 * Integration example for EditorScene with SimplifiedObjectiveSystem
 * This shows how to modify your existing EditorScene to work with level-based component restrictions
 */

import { ObjectiveSystem } from "./ObjectiveSystem";
import { ObjectiveUI } from "./ObjectiveUI";

/**
 * Add these properties to your EditorScene class
 */
export class EditorSceneIntegration {
  // Add to your existing EditorScene class properties:
  private objectiveSystem!: ObjectiveSystem;
  private objectiveUI!: ObjectiveUI;

  /**
   * Add this to your onSceneActivated method
   */
  protected initializeObjectiveSystem(): void {
    this.objectiveSystem = new ObjectiveSystem();
    this.objectiveUI = new ObjectiveUI(this.objectiveSystem);

    // Make globally accessible for UI callbacks
    (window as any).objectiveUI = this.objectiveUI;

    // Listen for level changes to update toolbar
    window.addEventListener("levelChanged", () => {
      this.refreshToolbar();
    });

    window.addEventListener("progressReset", () => {
      this.refreshToolbar();
      this.clearScene();
    });

    console.log("🎯 Objective system initialized");
  }

  /**
   * Add this to your createEditorInterface method
   */
  private createObjectivesButton(): void {
    const objectivesButton = document.createElement("button");
    objectivesButton.id = "objectives-button";
    objectivesButton.innerHTML = "🎯";
    objectivesButton.style.cssText = `
      position: fixed;
      top: 20px;
      right: 80px;
      width: 50px;
      height: 50px;
      border: 2px solid #f39c12;
      border-radius: 8px;
      background: linear-gradient(135deg, #f39c12, #e67e22);
      color: white;
      font-size: 20px;
      cursor: pointer;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    `;

    objectivesButton.addEventListener("mouseenter", () => {
      objectivesButton.style.background =
        "linear-gradient(135deg, #e67e22, #d35400)";
      objectivesButton.style.transform = "scale(1.05)";
    });

    objectivesButton.addEventListener("mouseleave", () => {
      objectivesButton.style.background =
        "linear-gradient(135deg, #f39c12, #e67e22)";
      objectivesButton.style.transform = "scale(1)";
    });

    objectivesButton.addEventListener("click", () => {
      this.objectiveUI.toggle();
    });

    // Add tooltip if you have the tooltip system
    // this.addTooltip(objectivesButton, "View Objectives & Progress");

    document.body.appendChild(objectivesButton);
  }

  /**
   * Modify your existing createToolbar method to filter components
   */
  private createToolbarWithObjectiveFilter(): void {
    // Remove existing toolbar
    const existing = document.getElementById("editor-toolbar");
    if (existing) {
      existing.remove();
    }

    this.toolbar = document.createElement("div");
    this.toolbar.id = "editor-toolbar";
    // ... your existing toolbar styling ...

    // Filter components based on current level
    const allowedComponents = this.objectiveSystem.getAllowedComponents();
    const filteredDragDropComponents = this.dragDropComponents.filter(
      (component) =>
        allowedComponents.some((allowed) => allowed.type === component.type)
    );

    // Create sections
    const dragDropSection = this.createToolbarSection(
      "Components",
      filteredDragDropComponents,
      true
    );
    const toolsSection = this.createToolbarSection(
      "Tools",
      this.clickActivateTools,
      false
    );

    this.toolbar.appendChild(dragDropSection);
    this.toolbar.appendChild(toolsSection);

    document.body.appendChild(this.toolbar);
  }

  /**
   * Add component count validation
   */
  private canPlaceComponent(componentType: string): {
    allowed: boolean;
    reason?: string;
  } {
    // Check if component is allowed in current level
    if (!this.objectiveSystem.isComponentAllowed(componentType)) {
      return {
        allowed: false,
        reason: `${componentType} is not available in current level`,
      };
    }

    // Check component count limits
    const limit = this.objectiveSystem.getComponentLimit(componentType);
    if (limit !== null) {
      const currentCount = this.countComponentsOfType(componentType);
      if (currentCount >= limit) {
        return {
          allowed: false,
          reason: `Maximum ${limit} ${componentType}(s) allowed in this level`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Helper method to count components of a specific type
   */
  private countComponentsOfType(componentType: string): number {
    const components = this.getSceneManager().getAllMechanicalComponents();
    return Array.from(components.values()).filter(
      (comp) => comp.getComponentType() === componentType
    ).length;
  }

  /**
   * Modify your component placement logic to include validation
   */
  private placeComponentWithValidation(
    componentType: string,
    x: number,
    y: number
  ): boolean {
    const validation = this.canPlaceComponent(componentType);

    if (!validation.allowed) {
      this.updateInfoBar(
        validation.reason || "Cannot place component",
        "error"
      );
      return false;
    }

    // Your existing component placement logic here...
    const success = this.placeComponent(componentType, x, y);

    if (success) {
      // Notify objective system
      this.objectiveSystem.onComponentPlaced(
        componentType,
        this.getCurrentGameState()
      );
    }

    return success;
  }

  /**
   * Get current game state for objective validation
   */
  private getCurrentGameState(): any {
    return {
      components: this.getSceneManager().getAllMechanicalComponents(),
      connections: [], // Get from your connection system
      isSimulationRunning: this.isSimulationRunning,
      maxRPMAchieved: 0, // Track this in your simulation
      lastSaveTime: Date.now(), // Track when user last saved
    };
  }

  /**
   * Integrate with your existing event handlers
   */

  // Add to your connection creation method:
  private onConnectionCreated(connectionType: string): void {
    this.objectiveSystem.onConnectionMade(
      connectionType,
      this.getCurrentGameState()
    );
  }

  // Add to your simulation start method:
  private onSimulationStarted(): void {
    this.isSimulationRunning = true;
    this.objectiveSystem.onSimulationStarted(this.getCurrentGameState());
  }

  // Add to your save method:
  private onProjectSaved(): void {
    this.objectiveSystem.onProjectSaved(this.getCurrentGameState());
  }

  // Add to your performance tracking:
  private onPerformanceUpdate(rpm: number): void {
    this.objectiveSystem.onPerformanceAchieved(rpm, this.getCurrentGameState());
  }

  /**
   * Refresh toolbar when level changes
   */
  private refreshToolbar(): void {
    this.createToolbarWithObjectiveFilter();
  }

  /**
   * Add level indicator to your UI
   */
  private createLevelIndicator(): void {
    const indicator = document.createElement("div");
    indicator.id = "level-indicator";
    indicator.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      padding: 10px 15px;
      background: linear-gradient(135deg, #2c3e50, #34495e);
      border: 2px solid #3498db;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      font-weight: bold;
      z-index: 1000;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    `;

    this.updateLevelIndicator(indicator);

    // Update when level changes
    window.addEventListener("levelChanged", () => {
      this.updateLevelIndicator(indicator);
    });

    document.body.appendChild(indicator);
  }

  /**
   * Update level indicator content
   */
  private updateLevelIndicator(indicator: HTMLElement): void {
    const currentLevel = this.objectiveSystem.getCurrentLevel();
    const userProgress = this.objectiveSystem.getUserProgress();

    if (currentLevel) {
      const completedObjectives = currentLevel.objectives.filter(
        (obj) => obj.completed
      ).length;
      const totalObjectives = currentLevel.objectives.length;

      indicator.innerHTML = `
        <div style="font-size: 12px; opacity: 0.8;">CURRENT LEVEL</div>
        <div>${currentLevel.title}</div>
        <div style="font-size: 11px; margin-top: 4px;">
          ${completedObjectives}/${totalObjectives} objectives • ${userProgress.totalPoints} pts
        </div>
      `;
    } else {
      indicator.innerHTML = `
        <div style="font-size: 12px; opacity: 0.8;">NO ACTIVE LEVEL</div>
        <div>Click 🎯 to start</div>
      `;
    }
  }

  /**
   * Example of how to modify your existing placeComponent method
   */
  private placeComponent(componentType: string, x: number, y: number): boolean {
    // Your existing placement logic...

    // After successful placement, notify objective system:
    this.objectiveSystem.onComponentPlaced(
      componentType,
      this.getCurrentGameState()
    );

    return true;
  }
}

/**
 * CSS Styles to add to your style.css
 */
const OBJECTIVE_STYLES = `
/* Objectives Panel */
.objectives-panel {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.objectives-panel.visible {
  opacity: 1;
}

.objectives-panel > div {
  background: linear-gradient(135deg, #2c3e50, #34495e);
  border: 2px solid #3498db;
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.objectives-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #3498db;
}

.objectives-header h2 {
  margin: 0;
  color: #ecf0f1;
}

.user-stats {
  display: flex;
  gap: 15px;
  color: #bdc3c7;
  font-size: 14px;
}

.level-info {
  padding: 15px 20px;
  border-bottom: 1px solid #34495e;
}

.level-description {
  margin: 0 0 10px 0;
  color: #bdc3c7;
}

.level-meta {
  display: flex;
  gap: 15px;
  font-size: 12px;
}

.difficulty {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: bold;
}

.difficulty.beginner { background: #27ae60; color: white; }
.difficulty.intermediate { background: #f39c12; color: white; }
.difficulty.advanced { background: #e74c3c; color: white; }

.objectives-list {
  padding: 20px;
}

.objective-item {
  margin-bottom: 15px;
  padding: 15px;
  background: rgba(52, 73, 94, 0.3);
  border: 1px solid #34495e;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.objective-item.completed {
  background: rgba(39, 174, 96, 0.2);
  border-color: #27ae60;
}

.objective-header {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  margin-bottom: 10px;
}

.objective-status {
  font-size: 20px;
  flex-shrink: 0;
}

.objective-content {
  flex: 1;
}

.objective-description {
  margin: 0 0 8px 0;
  color: #ecf0f1;
  font-weight: 500;
}

.objective-meta {
  display: flex;
  gap: 15px;
  font-size: 12px;
  color: #95a5a6;
}

.objective-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: #34495e;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3498db, #2980b9);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 12px;
  color: #bdc3c7;
  min-width: 35px;
}

.allowed-components {
  padding: 20px;
  border-top: 1px solid #34495e;
}

.allowed-components h3 {
  margin: 0 0 15px 0;
  color: #ecf0f1;
}

.components-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.component-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: rgba(52, 73, 94, 0.3);
  border: 1px solid #34495e;
  border-radius: 6px;
}

.component-icon {
  font-size: 20px;
}

.component-name {
  font-size: 12px;
  color: #ecf0f1;
  font-weight: 500;
}

.component-limit {
  font-size: 10px;
  color: #95a5a6;
}

.level-navigation {
  padding: 20px;
  border-top: 1px solid #34495e;
}

.level-navigation h3 {
  margin: 0 0 15px 0;
  color: #ecf0f1;
}

.levels-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.level-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 12px;
  background: rgba(52, 73, 94, 0.3);
  border: 1px solid #34495e;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.level-item:hover {
  background: rgba(52, 73, 94, 0.5);
  border-color: #3498db;
}

.level-item.current {
  background: rgba(52, 152, 219, 0.2);
  border-color: #3498db;
}

.level-item.completed {
  background: rgba(39, 174, 96, 0.2);
  border-color: #27ae60;
}

.level-item.locked {
  opacity: 0.5;
  cursor: not-allowed;
}

.level-status {
  font-size: 18px;
  flex-shrink: 0;
}

.level-info {
  flex: 1;
}

.level-title {
  color: #ecf0f1;
  font-weight: 500;
  margin-bottom: 4px;
}

.reset-btn {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  border: none;
  color: white;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s ease;
}

.reset-btn:hover {
  background: linear-gradient(135deg, #c0392b, #a93226);
}

.level-completed-notification {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.8);
  background: linear-gradient(135deg, #27ae60, #229954);
  color: white;
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  z-index: 11000;
  opacity: 0;
  transition: all 0.3s ease;
}

.level-completed-notification.show {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.notification-content h3 {
  margin: 0 0 10px 0;
  font-size: 24px;
}

.notification-content p {
  margin: 0;
  opacity: 0.9;
}
`;

export { OBJECTIVE_STYLES };
