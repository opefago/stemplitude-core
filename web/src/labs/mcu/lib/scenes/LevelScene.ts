import { EditorScene } from "../EditorScene";
import { ObjectiveSystem, Level, Objective } from "../ObjectiveSystem";
import { ObjectiveUI } from "../ObjectiveUI";

/**
 * Base class for level-specific scenes
 * Each level extends this to create custom learning experiences
 */
export abstract class LevelScene extends EditorScene {
  protected objectiveSystem: ObjectiveSystem;
  protected objectiveUI: ObjectiveUI;
  protected levelData: Level;
  protected levelObjectives: Objective[] = [];

  // Toolbar customization
  protected enabledComponents: string[] = [];
  protected enabledTools: string[] = [];
  protected disabledComponents: string[] = [];
  protected disabledTools: string[] = [];

  // Level completion tracking
  protected isLevelCompleted: boolean = false;
  protected completedObjectives: Set<string> = new Set();

  constructor(levelId: string) {
    super();
    this.initializeLevelData(levelId);
    this.setupObjectiveSystem();
  }

  /**
   * Initialize level-specific data
   */
  protected abstract initializeLevelData(levelId: string): void;

  /**
   * Setup objectives for this level
   */
  protected abstract setupLevelObjectives(): void;

  /**
   * Define which components are available in this level
   */
  protected abstract defineAvailableComponents(): string[];

  /**
   * Define which tools are available in this level
   */
  protected abstract defineAvailableTools(): string[];

  /**
   * Custom level initialization
   */
  protected abstract onLevelStart(): void;

  /**
   * Called when level is completed
   */
  protected abstract onLevelComplete(): void;

  /**
   * Setup the objective system for this level
   */
  private setupObjectiveSystem(): void {
    this.objectiveSystem = new ObjectiveSystem();
    this.objectiveUI = new ObjectiveUI(this.objectiveSystem);

    // Make globally accessible
    (window as any).objectiveUI = this.objectiveUI;

    // Setup level-specific objectives
    this.setupLevelObjectives();
    this.enabledComponents = this.defineAvailableComponents();
    this.enabledTools = this.defineAvailableTools();

    console.log(`🎯 Level scene initialized: ${this.levelData.title}`);
  }

  /**
   * Override scene activation to include level setup
   */
  protected override onSceneActivated(): void {
    super.onSceneActivated();
    this.createLevelUI();
    this.onLevelStart();
    this.showLevelIntroduction();
  }

  /**
   * Create level-specific UI elements
   */
  protected createLevelUI(): void {
    this.createLevelHeader();
    this.createObjectivesPanel();
    this.createLevelProgress();
  }

  /**
   * Create level header with title and description
   */
  private createLevelHeader(): void {
    const header = document.createElement("div");
    header.id = "level-header";
    header.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      right: 200px;
      background: linear-gradient(135deg, #2c3e50, #34495e);
      border: 2px solid #3498db;
      border-radius: 12px;
      padding: 15px 20px;
      color: white;
      z-index: 1000;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    `;

    header.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="margin: 0 0 5px 0; font-size: 18px;">${this.levelData.title}</h2>
          <p style="margin: 0; font-size: 14px; opacity: 0.8;">${this.levelData.description}</p>
        </div>
        <div style="display: flex; align-items: center; gap: 15px;">
          <span class="difficulty-badge ${this.levelData.difficulty}">${this.levelData.difficulty.toUpperCase()}</span>
          <button id="show-objectives-btn" style="
            background: linear-gradient(135deg, #f39c12, #e67e22);
            border: none;
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          ">🎯 Objectives</button>
        </div>
      </div>
    `;

    document.body.appendChild(header);

    // Setup objectives button
    const objectivesBtn = header.querySelector(
      "#show-objectives-btn"
    ) as HTMLButtonElement;
    objectivesBtn.addEventListener("click", () => {
      this.objectiveUI.toggle();
    });
  }

  /**
   * Create objectives panel (simplified for level view)
   */
  private createObjectivesPanel(): void {
    // The ObjectiveUI handles this, but we can customize it per level
    this.objectiveUI.show();
    setTimeout(() => this.objectiveUI.hide(), 100); // Hide initially
  }

  /**
   * Create level progress indicator
   */
  private createLevelProgress(): void {
    const progress = document.createElement("div");
    progress.id = "level-progress";
    progress.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: linear-gradient(135deg, #2c3e50, #34495e);
      border: 2px solid #3498db;
      border-radius: 8px;
      padding: 10px 15px;
      color: white;
      z-index: 1000;
      min-width: 200px;
    `;

    this.updateProgressDisplay(progress);
    document.body.appendChild(progress);

    // Update progress every 2 seconds
    setInterval(() => {
      this.updateProgressDisplay(progress);
    }, 2000);
  }

  /**
   * Update progress display
   */
  private updateProgressDisplay(progressElement: HTMLElement): void {
    const completed = this.completedObjectives.size;
    const total = this.levelObjectives.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    progressElement.innerHTML = `
      <div style="font-size: 12px; opacity: 0.8; margin-bottom: 5px;">PROGRESS</div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>${completed}/${total} Objectives</span>
        <span style="font-weight: bold;">${percentage}%</span>
      </div>
      <div style="width: 100%; height: 4px; background: #34495e; border-radius: 2px; margin-top: 5px;">
        <div style="width: ${percentage}%; height: 100%; background: linear-gradient(90deg, #3498db, #2980b9); border-radius: 2px; transition: width 0.3s ease;"></div>
      </div>
    `;
  }

  /**
   * Show level introduction modal
   */
  private showLevelIntroduction(): void {
    const modal = document.createElement("div");
    modal.className = "level-intro-modal";
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 11000;
    `;

    modal.innerHTML = `
      <div style="
        background: linear-gradient(135deg, #2c3e50, #34495e);
        border: 2px solid #3498db;
        border-radius: 12px;
        padding: 30px;
        max-width: 500px;
        color: white;
        text-align: center;
      ">
        <h2 style="margin: 0 0 15px 0; color: #3498db;">${this.levelData.title}</h2>
        <p style="margin: 0 0 20px 0; line-height: 1.5;">${this.levelData.description}</p>
        
        <div style="margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; font-size: 16px;">Objectives:</h3>
          <ul style="text-align: left; margin: 0; padding-left: 20px;">
            ${this.levelObjectives.map((obj) => `<li style="margin-bottom: 5px;">${obj.description}</li>`).join("")}
          </ul>
        </div>
        
        <div style="margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; font-size: 16px;">Available Components:</h3>
          <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
            ${this.enabledComponents
              .map(
                (comp) => `
              <span style="
                background: rgba(52, 152, 219, 0.2);
                border: 1px solid #3498db;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
              ">${comp.charAt(0).toUpperCase() + comp.slice(1)}</span>
            `
              )
              .join("")}
          </div>
        </div>
        
        <button id="start-level-btn" style="
          background: linear-gradient(135deg, #27ae60, #229954);
          border: none;
          color: white;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
        ">🚀 Start Level</button>
      </div>
    `;

    document.body.appendChild(modal);

    // Setup start button
    const startBtn = modal.querySelector(
      "#start-level-btn"
    ) as HTMLButtonElement;
    startBtn.addEventListener("click", () => {
      modal.remove();
      this.startLevelTimer();
    });
  }

  /**
   * Start level timer (optional)
   */
  private startLevelTimer(): void {
    // Override in subclasses if timing is needed
    console.log(`🎯 Level started: ${this.levelData.title}`);
  }

  /**
   * Override toolbar creation to filter components
   */
  protected override createToolbar(): void {
    // Initialize component arrays if not set yet
    if (!this.enabledComponents || this.enabledComponents.length === 0) {
      this.enabledComponents = this.defineAvailableComponents() || [];
      console.log('🔧 Initialized enabledComponents:', this.enabledComponents);
    }
    if (!this.enabledTools || this.enabledTools.length === 0) {
      this.enabledTools = this.defineAvailableTools() || [];
      console.log('🔧 Initialized enabledTools:', this.enabledTools);
    }

    // Remove existing toolbar
    const existing = document.getElementById("editor-toolbar");
    if (existing) {
      existing.remove();
    }

    this.toolbar = document.createElement("div");
    this.toolbar.id = "editor-toolbar";
    this.toolbar.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 160px;
      height: 100vh;
      background: linear-gradient(135deg, #2c3e50, #34495e);
      border-left: 2px solid #3498db;
      padding: 20px 10px;
      box-sizing: border-box;
      overflow-y: auto;
      z-index: 1000;
    `;

    // Filter components and tools based on level
    const filteredComponents = this.dragDropComponents.filter((comp) =>
      this.enabledComponents.includes(comp.type)
    );

    const filteredTools = this.clickActivateTools.filter((tool) =>
      this.enabledTools.includes(tool.type)
    );

    // Create components section
    if (filteredComponents.length > 0) {
      const componentsTitle = document.createElement("h3");
      componentsTitle.textContent = "Components";
      componentsTitle.style.cssText = `
        color: #ecf0f1;
        margin: 0 0 12px 0;
        font-size: 14px;
        text-align: center;
        border-bottom: 2px solid #3498db;
        padding-bottom: 8px;
      `;
      this.toolbar.appendChild(componentsTitle);

      const componentsHint = document.createElement("div");
      componentsHint.textContent = "Drag to canvas";
      componentsHint.style.cssText = `
        color: #95a5a6;
        font-size: 11px;
        text-align: center;
        margin-bottom: 10px;
        font-style: italic;
      `;
      this.toolbar.appendChild(componentsHint);

      filteredComponents.forEach((asset) => {
        const assetElement = this.createDragDropAssetElement(asset);
        this.toolbar.appendChild(assetElement);
      });
    }

    // Create tools section
    if (filteredTools.length > 0) {
      const toolsTitle = document.createElement("h3");
      toolsTitle.textContent = "Tools";
      toolsTitle.style.cssText = `
        color: #ecf0f1;
        margin: 20px 0 12px 0;
        font-size: 14px;
        text-align: center;
        border-bottom: 2px solid #e74c3c;
        padding-bottom: 8px;
      `;
      this.toolbar.appendChild(toolsTitle);

      const toolsHint = document.createElement("div");
      toolsHint.textContent = "Click to activate";
      toolsHint.style.cssText = `
        color: #95a5a6;
        font-size: 11px;
        text-align: center;
        margin-bottom: 10px;
        font-style: italic;
      `;
      this.toolbar.appendChild(toolsHint);

      filteredTools.forEach((tool) => {
        const toolElement = this.createClickActivateToolElement(tool);
        this.toolbar.appendChild(toolElement);
      });
    }

    document.body.appendChild(this.toolbar);
  }

  /**
   * Check objective completion
   */
  protected checkObjective(objectiveId: string): void {
    const objective = this.levelObjectives.find(
      (obj) => obj.id === objectiveId
    );
    if (!objective || this.completedObjectives.has(objectiveId)) return;

    const gameState = this.getCurrentGameState();
    const isCompleted = this.validateObjective(objective, gameState);

    if (isCompleted) {
      this.completeObjective(objectiveId);
    }
  }

  /**
   * Validate objective completion
   */
  protected validateObjective(objective: Objective, gameState: any): boolean {
    switch (objective.type) {
      case "place":
        const componentCount = this.countComponents(
          gameState,
          objective.target.component!
        );
        return componentCount >= (objective.target.count || 1);

      case "connect":
        return this.checkConnection(gameState, objective.target.action!);

      case "simulate":
        return gameState.isSimulationRunning || false;

      case "achieve":
        const currentValue = this.getCurrentValue(gameState, objective);
        return currentValue >= (objective.target.value || 0);

      case "save":
        return gameState.lastSaveTime > 0;

      default:
        return false;
    }
  }

  /**
   * Complete an objective
   */
  private completeObjective(objectiveId: string): void {
    this.completedObjectives.add(objectiveId);

    const objective = this.levelObjectives.find(
      (obj) => obj.id === objectiveId
    );
    if (objective) {
      objective.completed = true;
      objective.progress = 100;

      this.showObjectiveCompletedNotification(objective);

      // Check if level is completed
      if (this.completedObjectives.size === this.levelObjectives.length) {
        this.completeLevelWithDelay();
      }
    }
  }

  /**
   * Show objective completed notification
   */
  private showObjectiveCompletedNotification(objective: Objective): void {
    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      background: linear-gradient(135deg, #27ae60, #229954);
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
      z-index: 10000;
      transform: translateX(100%);
      transition: transform 0.3s ease;
    `;

    notification.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">✅ Objective Complete!</div>
      <div style="font-size: 14px;">${objective.description}</div>
      <div style="font-size: 12px; opacity: 0.8; margin-top: 5px;">+${objective.points} points</div>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.style.transform = "translateX(0)";
    }, 100);

    // Remove after delay
    setTimeout(() => {
      notification.style.transform = "translateX(100%)";
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Complete level with delay for final objective notification
   */
  private completeLevelWithDelay(): void {
    setTimeout(() => {
      this.isLevelCompleted = true;
      this.onLevelComplete();
      this.showLevelCompletedModal();
    }, 1500);
  }

  /**
   * Show level completed modal
   */
  private showLevelCompletedModal(): void {
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 11000;
    `;

    const totalPoints = this.levelObjectives.reduce(
      (sum, obj) => sum + obj.points,
      0
    );

    modal.innerHTML = `
      <div style="
        background: linear-gradient(135deg, #27ae60, #229954);
        border: 2px solid #2ecc71;
        border-radius: 12px;
        padding: 40px;
        max-width: 400px;
        color: white;
        text-align: center;
      ">
        <div style="font-size: 48px; margin-bottom: 20px;">🎉</div>
        <h2 style="margin: 0 0 15px 0;">Level Complete!</h2>
        <p style="margin: 0 0 20px 0; font-size: 18px;">${this.levelData.title}</p>
        
        <div style="margin: 20px 0;">
          <div style="font-size: 24px; font-weight: bold;">+${totalPoints} Points</div>
          <div style="font-size: 14px; opacity: 0.8;">${this.completedObjectives.size}/${this.levelObjectives.length} objectives completed</div>
        </div>
        
        ${
          this.levelData.reward.badge
            ? `
          <div style="margin: 20px 0;">
            <div style="font-size: 14px; margin-bottom: 5px;">Badge Earned:</div>
            <div style="
              background: rgba(255, 255, 255, 0.2);
              border: 1px solid rgba(255, 255, 255, 0.3);
              padding: 8px 16px;
              border-radius: 6px;
              display: inline-block;
            ">🏅 ${this.levelData.reward.badge}</div>
          </div>
        `
            : ""
        }
        
        <div style="margin-top: 30px; display: flex; gap: 10px; justify-content: center;">
          <button id="retry-level-btn" style="
            background: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
          ">🔄 Retry</button>
          <button id="next-level-btn" style="
            background: linear-gradient(135deg, #3498db, #2980b9);
            border: none;
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
          ">➡️ Next Level</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Setup buttons
    const retryBtn = modal.querySelector(
      "#retry-level-btn"
    ) as HTMLButtonElement;
    const nextBtn = modal.querySelector("#next-level-btn") as HTMLButtonElement;

    retryBtn.addEventListener("click", () => {
      modal.remove();
      this.retryLevel();
    });

    nextBtn.addEventListener("click", () => {
      modal.remove();
      this.goToNextLevel();
    });
  }

  /**
   * Retry current level
   */
  protected retryLevel(): void {
    // Clear scene and reset objectives
    this.clearScene();
    this.completedObjectives.clear();
    this.isLevelCompleted = false;

    this.levelObjectives.forEach((obj) => {
      obj.completed = false;
      obj.progress = 0;
    });

    console.log(`🔄 Retrying level: ${this.levelData.title}`);
  }

  /**
   * Go to next level (override in subclasses)
   */
  protected abstract goToNextLevel(): void;

  /**
   * Helper methods
   */
  protected getCurrentGameState(): any {
    return {
      components: this.getSceneManager().getAllMechanicalComponents(),
      connections: [], // Get from connection system
      isSimulationRunning: this.isSimulationRunning,
      maxRPMAchieved: 0, // Track in simulation
      lastSaveTime: Date.now(),
    };
  }

  protected countComponents(gameState: any, componentType: string): number {
    if (!gameState.components) return 0;
    return Array.from(gameState.components.values()).filter(
      (comp: any) => comp.getComponentType() === componentType
    ).length;
  }

  protected checkConnection(gameState: any, actionType: string): boolean {
    if (!gameState.connections) return false;

    switch (actionType) {
      case "gear_mesh":
        return gameState.connections.some(
          (conn: any) => conn.type === "gear_mesh"
        );
      case "belt_connection":
        return gameState.connections.some(
          (conn: any) => conn.type === "belt_connection"
        );
      default:
        return false;
    }
  }

  protected getCurrentValue(gameState: any, objective: Objective): number {
    // Override in subclasses for specific value tracking
    return gameState.maxRPMAchieved || 0;
  }

  /**
   * Override component placement to check objectives
   */
  protected override onComponentPlaced(componentType: string): void {
    // Check placement objectives
    this.levelObjectives.forEach((obj) => {
      if (obj.type === "place" && obj.target.component === componentType) {
        this.checkObjective(obj.id);
      }
    });
  }

  /**
   * Override connection creation to check objectives
   */
  protected override onConnectionCreated(connectionType: string): void {
    // Check connection objectives
    this.levelObjectives.forEach((obj) => {
      if (obj.type === "connect") {
        this.checkObjective(obj.id);
      }
    });
  }

  /**
   * Override simulation start to check objectives
   */
  protected override onSimulationStarted(): void {
    super.onSimulationStarted();

    console.log('🎯 LevelScene: Simulation started, checking objectives...');
    console.log('🎯 isSimulationRunning:', this.isSimulationRunning);

    // Check simulation objectives
    this.levelObjectives.forEach((obj) => {
      if (obj.type === "simulate") {
        console.log(`🎯 Checking simulate objective: ${obj.id}`);
        this.checkObjective(obj.id);
      }
    });
  }

  /**
   * Cleanup when scene is deactivated
   */
  protected override onSceneDeactivated(): void {
    super.onSceneDeactivated();

    // Remove level-specific UI
    document.getElementById("level-header")?.remove();
    document.getElementById("level-progress")?.remove();
    document.querySelector(".level-intro-modal")?.remove();
  }
}
