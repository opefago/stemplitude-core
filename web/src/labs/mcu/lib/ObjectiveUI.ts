import {
  ObjectiveSystem,
  Level,
  Objective,
  ComponentRestriction,
} from "./ObjectiveSystem";

/**
 * Objective UI for level-based progression
 * Shows current level, objectives, and progress
 */

export class ObjectiveUI {
  private objectiveSystem: ObjectiveSystem;
  private container: HTMLElement | null = null;
  private isVisible: boolean = false;

  constructor(objectiveSystem: ObjectiveSystem) {
    this.objectiveSystem = objectiveSystem;
    this.setupEventListeners();
  }

  /**
   * Create and show the objectives panel
   */
  public show(): void {
    if (this.container) {
      this.container.remove();
    }

    this.container = this.createObjectivesPanel();
    document.body.appendChild(this.container);
    this.isVisible = true;

    // Animate in
    requestAnimationFrame(() => {
      if (this.container) {
        this.container.classList.add("visible");
      }
    });
  }

  /**
   * Hide the objectives panel
   */
  public hide(): void {
    if (this.container) {
      this.container.classList.remove("visible");
      setTimeout(() => {
        if (this.container) {
          this.container.remove();
          this.container = null;
        }
      }, 300);
    }
    this.isVisible = false;
  }

  /**
   * Toggle panel visibility
   */
  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Create the main objectives panel
   */
  private createObjectivesPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "objectives-panel";

    const currentLevel = this.objectiveSystem.getCurrentLevel();
    const userProgress = this.objectiveSystem.getUserProgress();

    panel.innerHTML = `
      <div class="objectives-header">
        <h2>🎯 ${currentLevel?.title || "No Active Level"}</h2>
        <div class="user-stats">
          <span class="points">🏆 ${userProgress.totalPoints} pts</span>
          <span class="badges">🏅 ${userProgress.badges.length}</span>
        </div>
        <button class="close-btn" onclick="this.closest('.objectives-panel').remove()">×</button>
      </div>

      <div class="level-info">
        <p class="level-description">${currentLevel?.description || "Select a level to begin"}</p>
        <div class="level-meta">
          <span class="difficulty ${currentLevel?.difficulty}">${currentLevel?.difficulty?.toUpperCase() || ""}</span>
          <span class="time">⏱️ ${currentLevel?.estimatedMinutes || 0} min</span>
        </div>
      </div>

      <div class="objectives-list">
        ${currentLevel ? this.createObjectivesHTML(currentLevel.objectives) : "<p>No objectives available</p>"}
      </div>

      <div class="allowed-components">
        <h3>📦 Available Components</h3>
        <div class="components-grid">
          ${this.createAllowedComponentsHTML()}
        </div>
      </div>

      <div class="level-navigation">
        ${this.createLevelNavigationHTML()}
      </div>
    `;

    this.setupPanelEventListeners(panel);
    return panel;
  }

  /**
   * Create objectives list HTML
   */
  private createObjectivesHTML(objectives: Objective[]): string {
    return objectives
      .map(
        (obj) => `
      <div class="objective-item ${obj.completed ? "completed" : "active"}">
        <div class="objective-header">
          <div class="objective-status">
            ${obj.completed ? "✅" : "⏳"}
          </div>
          <div class="objective-content">
            <p class="objective-description">${obj.description}</p>
            <div class="objective-meta">
              <span class="objective-type">${obj.type.toUpperCase()}</span>
              <span class="objective-points">+${obj.points} pts</span>
            </div>
          </div>
        </div>
        <div class="objective-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${obj.progress}%"></div>
          </div>
          <span class="progress-text">${Math.round(obj.progress)}%</span>
        </div>
      </div>
    `
      )
      .join("");
  }

  /**
   * Create allowed components display
   */
  private createAllowedComponentsHTML(): string {
    const allowedComponents = this.objectiveSystem.getAllowedComponents();

    if (allowedComponents.length === 0) {
      return '<p class="no-components">No components available for this level</p>';
    }

    return allowedComponents
      .map(
        (comp) => `
      <div class="component-item">
        <div class="component-icon">${this.getComponentIcon(comp.type)}</div>
        <div class="component-info">
          <div class="component-name">${this.getComponentName(comp.type)}</div>
          ${comp.maxCount ? `<div class="component-limit">Max: ${comp.maxCount}</div>` : ""}
        </div>
      </div>
    `
      )
      .join("");
  }

  /**
   * Create level navigation HTML
   */
  private createLevelNavigationHTML(): string {
    const allLevels = this.objectiveSystem.getAllLevels();
    const userProgress = this.objectiveSystem.getUserProgress();
    const currentLevel = this.objectiveSystem.getCurrentLevel();

    return `
      <h3>📚 All Levels</h3>
      <div class="levels-list">
        ${allLevels
          .map((level) => {
            const isCompleted = userProgress.completedLevels.includes(level.id);
            const isCurrent = currentLevel?.id === level.id;
            const isUnlocked =
              isCompleted ||
              isCurrent ||
              this.isLevelUnlocked(level, userProgress);

            return `
            <div class="level-item ${isCompleted ? "completed" : ""} ${isCurrent ? "current" : ""} ${!isUnlocked ? "locked" : ""}"
                 onclick="window.objectiveUI.selectLevel('${level.id}')">
              <div class="level-status">
                ${isCompleted ? "✅" : isCurrent ? "🎯" : isUnlocked ? "⏳" : "🔒"}
              </div>
              <div class="level-info">
                <div class="level-title">${level.title}</div>
                <div class="level-meta">
                  <span class="difficulty ${level.difficulty}">${level.difficulty}</span>
                  <span class="points">+${level.reward.points} pts</span>
                </div>
              </div>
            </div>
          `;
          })
          .join("")}
      </div>
      
      <div class="level-actions">
        <button class="reset-btn" onclick="window.objectiveUI.resetProgress()">
          🔄 Reset Progress
        </button>
      </div>
    `;
  }

  /**
   * Check if level is unlocked
   */
  private isLevelUnlocked(level: Level, userProgress: any): boolean {
    // First level is always unlocked
    if (level.id === "motor_basics") return true;

    // Check if previous levels are completed
    const allLevels = this.objectiveSystem.getAllLevels();
    const levelIndex = allLevels.findIndex((l) => l.id === level.id);

    if (levelIndex <= 0) return true;

    const previousLevel = allLevels[levelIndex - 1];
    return userProgress.completedLevels.includes(previousLevel.id);
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for objective system events
    this.objectiveSystem.on("objectiveCompleted", () => {
      this.refreshPanel();
    });

    this.objectiveSystem.on("levelCompleted", () => {
      this.refreshPanel();
      this.showLevelCompletedNotification();
    });

    // Refresh panel periodically
    setInterval(() => {
      if (this.isVisible) {
        this.refreshPanel();
      }
    }, 2000);
  }

  /**
   * Setup panel event listeners
   */
  private setupPanelEventListeners(panel: HTMLElement): void {
    // Close on background click
    panel.addEventListener("click", (e) => {
      if (e.target === panel) {
        this.hide();
      }
    });
  }

  /**
   * Refresh the panel content
   */
  private refreshPanel(): void {
    if (!this.isVisible || !this.container) return;

    const currentLevel = this.objectiveSystem.getCurrentLevel();
    if (!currentLevel) return;

    // Update objectives
    const objectivesList = this.container.querySelector(".objectives-list");
    if (objectivesList) {
      objectivesList.innerHTML = this.createObjectivesHTML(
        currentLevel.objectives
      );
    }

    // Update user stats
    const userProgress = this.objectiveSystem.getUserProgress();
    const pointsSpan = this.container.querySelector(".points");
    const badgesSpan = this.container.querySelector(".badges");

    if (pointsSpan)
      pointsSpan.textContent = `🏆 ${userProgress.totalPoints} pts`;
    if (badgesSpan) badgesSpan.textContent = `🏅 ${userProgress.badges.length}`;
  }

  /**
   * Show level completed notification
   */
  private showLevelCompletedNotification(): void {
    const notification = document.createElement("div");
    notification.className = "level-completed-notification";
    notification.innerHTML = `
      <div class="notification-content">
        <h3>🎉 Level Completed!</h3>
        <p>Great job! You've completed this level.</p>
      </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add("show");
    }, 100);

    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Public methods for UI interactions
   */
  public selectLevel(levelId: string): void {
    const success = this.objectiveSystem.setCurrentLevel(levelId);
    if (success) {
      this.refreshPanel();
      // Emit event to update toolbar
      window.dispatchEvent(
        new CustomEvent("levelChanged", { detail: { levelId } })
      );
    }
  }

  public resetProgress(): void {
    if (
      confirm(
        "Are you sure you want to reset all progress? This cannot be undone."
      )
    ) {
      this.objectiveSystem.resetProgress();
      this.refreshPanel();
      window.dispatchEvent(new CustomEvent("progressReset"));
    }
  }

  /**
   * Utility methods
   */
  private getComponentIcon(type: string): string {
    const icons: Record<string, string> = {
      motor: "⚡",
      gear: "⚙️",
      pulley: "🔗",
      forklift: "🏗️",
      belt: "🔗",
    };
    return icons[type] || "📦";
  }

  private getComponentName(type: string): string {
    const names: Record<string, string> = {
      motor: "Motor",
      gear: "Gear",
      pulley: "Pulley",
      forklift: "Forklift",
      belt: "Belt",
    };
    return names[type] || type.charAt(0).toUpperCase() + type.slice(1);
  }
}

// Make globally accessible
declare global {
  interface Window {
    objectiveUI: ObjectiveUI;
  }
}
