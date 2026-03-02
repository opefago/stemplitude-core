import { LevelScene } from "./LevelScene";
import { MotorBasicsScene } from "./MotorBasicsScene";
import { GearIntroductionScene } from "./GearIntroductionScene";
import { BeltSystemsScene } from "./BeltSystemsScene";
import { ForkliftChallengeScene } from "./ForkliftChallengeScene";

/**
 * Manages level-based scenes and progression
 * Handles scene transitions and progress tracking
 */
export class LevelSceneManager {
  private currentScene: LevelScene | null = null;
  private availableLevels: Map<string, () => LevelScene> = new Map();
  private completedLevels: Set<string> = new Set();

  constructor() {
    this.initializeAvailableLevels();
    this.loadProgress();
  }

  /**
   * Initialize all available level scenes
   */
  private initializeAvailableLevels(): void {
    this.availableLevels.set("motor_basics", () => new MotorBasicsScene());
    this.availableLevels.set(
      "gear_introduction",
      () => new GearIntroductionScene()
    );
    this.availableLevels.set("belt_systems", () => new BeltSystemsScene());
    this.availableLevels.set(
      "forklift_challenge",
      () => new ForkliftChallengeScene()
    );
  }

  /**
   * Load progress from localStorage
   */
  private loadProgress(): void {
    try {
      const saved = localStorage.getItem("stemplitude_level_progress");
      if (saved) {
        const progress = JSON.parse(saved);
        this.completedLevels = new Set(progress.completedLevels || []);
      }
    } catch (error) {
      console.error("Failed to load level progress:", error);
    }
  }

  /**
   * Save progress to localStorage
   */
  private saveProgress(): void {
    try {
      const progress = {
        completedLevels: Array.from(this.completedLevels),
        lastUpdated: new Date().toISOString(),
      };
      localStorage.setItem("stemplitude_level_progress", JSON.stringify(progress));
    } catch (error) {
      console.error("Failed to save level progress:", error);
    }
  }

  /**
   * Start a specific level
   */
  public startLevel(levelId: string): boolean {
    // Check if level exists
    if (!this.availableLevels.has(levelId)) {
      console.error(`Level not found: ${levelId}`);
      return false;
    }

    // Check if level is unlocked
    if (!this.isLevelUnlocked(levelId)) {
      console.warn(`Level is locked: ${levelId}`);
      return false;
    }

    // Deactivate current scene
    if (this.currentScene) {
      this.currentScene.onSceneDeactivated();
    }

    // Create and activate new scene
    const sceneFactory = this.availableLevels.get(levelId)!;
    this.currentScene = sceneFactory();

    // Setup level completion handler
    this.setupLevelCompletionHandler(this.currentScene, levelId);

    this.currentScene.onSceneActivated();

    console.log(`🎯 Started level: ${levelId}`);
    return true;
  }

  /**
   * Check if a level is unlocked
   */
  public isLevelUnlocked(levelId: string): boolean {
    // First level is always unlocked
    if (levelId === "motor_basics") return true;

    // Check prerequisites
    const levelOrder = [
      "motor_basics",
      "gear_introduction",
      "belt_systems",
      "forklift_challenge",
    ];
    const levelIndex = levelOrder.indexOf(levelId);

    if (levelIndex === -1) return false;
    if (levelIndex === 0) return true;

    // Check if previous level is completed
    const previousLevel = levelOrder[levelIndex - 1];
    return this.completedLevels.has(previousLevel);
  }

  /**
   * Mark a level as completed
   */
  public markLevelCompleted(levelId: string): void {
    this.completedLevels.add(levelId);
    this.saveProgress();

    console.log(`✅ Level completed: ${levelId}`);

    // Emit completion event
    window.dispatchEvent(
      new CustomEvent("levelCompleted", {
        detail: { levelId, completedLevels: Array.from(this.completedLevels) },
      })
    );
  }

  /**
   * Get next level in sequence
   */
  public getNextLevel(currentLevelId: string): string | null {
    const levelOrder = [
      "motor_basics",
      "gear_introduction",
      "belt_systems",
      "forklift_challenge",
    ];
    const currentIndex = levelOrder.indexOf(currentLevelId);

    if (currentIndex === -1 || currentIndex === levelOrder.length - 1) {
      return null; // No next level
    }

    return levelOrder[currentIndex + 1];
  }

  /**
   * Setup level completion handler
   */
  private setupLevelCompletionHandler(
    scene: LevelScene,
    levelId: string
  ): void {
    // Override the scene's goToNextLevel method to handle progression
    const originalGoToNextLevel = scene.goToNextLevel.bind(scene);

    scene.goToNextLevel = () => {
      // Mark current level as completed
      this.markLevelCompleted(levelId);

      // Get next level
      const nextLevelId = this.getNextLevel(levelId);

      if (nextLevelId) {
        // Start next level
        setTimeout(() => {
          this.startLevel(nextLevelId);
        }, 1000);
      } else {
        // No more levels, call original method (shows completion screen)
        originalGoToNextLevel();
      }
    };

    // Also override retry level
    const originalRetryLevel = scene.retryLevel.bind(scene);
    scene.retryLevel = () => {
      originalRetryLevel();
      // Restart the same level
      setTimeout(() => {
        this.startLevel(levelId);
      }, 500);
    };
  }

  /**
   * Get current scene
   */
  public getCurrentScene(): LevelScene | null {
    return this.currentScene;
  }

  /**
   * Get all available levels with their status
   */
  public getAllLevels(): Array<{
    id: string;
    title: string;
    description: string;
    difficulty: string;
    isCompleted: boolean;
    isUnlocked: boolean;
  }> {
    const levelOrder = [
      "motor_basics",
      "gear_introduction",
      "belt_systems",
      "forklift_challenge",
    ];
    const levelInfo = {
      motor_basics: {
        title: "Motor Basics",
        description: "Learn to place and control motors",
        difficulty: "beginner",
      },
      gear_introduction: {
        title: "Gear Introduction",
        description: "Learn about gears and gear meshing",
        difficulty: "beginner",
      },
      belt_systems: {
        title: "Belt Drive Systems",
        description: "Master belt connections and pulleys",
        difficulty: "intermediate",
      },
      forklift_challenge: {
        title: "Forklift Engineering Challenge",
        description: "Design a complete forklift lifting system",
        difficulty: "advanced",
      },
    };

    return levelOrder.map((levelId) => ({
      id: levelId,
      ...levelInfo[levelId as keyof typeof levelInfo],
      isCompleted: this.completedLevels.has(levelId),
      isUnlocked: this.isLevelUnlocked(levelId),
    }));
  }

  /**
   * Get completion statistics
   */
  public getCompletionStats(): {
    completedCount: number;
    totalCount: number;
    percentage: number;
    completedLevels: string[];
  } {
    const totalCount = this.availableLevels.size;
    const completedCount = this.completedLevels.size;

    return {
      completedCount,
      totalCount,
      percentage: Math.round((completedCount / totalCount) * 100),
      completedLevels: Array.from(this.completedLevels),
    };
  }

  /**
   * Reset all progress
   */
  public resetProgress(): void {
    this.completedLevels.clear();
    this.saveProgress();

    // Clear individual level progress
    localStorage.removeItem("motor_basics_progress");
    localStorage.removeItem("gear_introduction_progress");
    localStorage.removeItem("belt_systems_progress");
    localStorage.removeItem("forklift_challenge_progress");
    localStorage.removeItem("stemplitude_course_completed");

    console.log("🔄 All progress reset");

    // Emit reset event
    window.dispatchEvent(new CustomEvent("progressReset"));
  }

  /**
   * Show level selection menu
   */
  public showLevelSelection(): void {
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

    const levels = this.getAllLevels();
    const stats = this.getCompletionStats();

    modal.innerHTML = `
      <div style="
        background: linear-gradient(135deg, #2c3e50, #34495e);
        border: 2px solid #3498db;
        border-radius: 12px;
        padding: 30px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        color: white;
      ">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="margin: 0 0 10px 0;">🎯 Select Level</h2>
          <p style="margin: 0; opacity: 0.8;">
            Progress: ${stats.completedCount}/${stats.totalCount} levels completed (${stats.percentage}%)
          </p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 15px;">
          ${levels
            .map(
              (level) => `
            <div class="level-selection-item ${level.isCompleted ? "completed" : ""} ${!level.isUnlocked ? "locked" : ""}"
                 onclick="${level.isUnlocked ? `window.levelSceneManager.startLevel('${level.id}'); this.closest('div').remove();` : ""}"
                 style="
                   display: flex;
                   align-items: center;
                   padding: 15px;
                   background: ${level.isCompleted ? "rgba(39, 174, 96, 0.2)" : level.isUnlocked ? "rgba(52, 73, 94, 0.3)" : "rgba(52, 73, 94, 0.1)"};
                   border: 1px solid ${level.isCompleted ? "#27ae60" : level.isUnlocked ? "#34495e" : "#2c3e50"};
                   border-radius: 8px;
                   cursor: ${level.isUnlocked ? "pointer" : "not-allowed"};
                   opacity: ${level.isUnlocked ? "1" : "0.5"};
                   transition: all 0.3s ease;
                 ">
              <div style="font-size: 24px; margin-right: 15px;">
                ${level.isCompleted ? "✅" : level.isUnlocked ? "🎯" : "🔒"}
              </div>
              <div style="flex: 1;">
                <h3 style="margin: 0 0 5px 0; font-size: 16px;">${level.title}</h3>
                <p style="margin: 0 0 5px 0; font-size: 14px; opacity: 0.8;">${level.description}</p>
                <span style="
                  font-size: 12px;
                  padding: 2px 8px;
                  border-radius: 4px;
                  background: ${level.difficulty === "beginner" ? "#27ae60" : level.difficulty === "intermediate" ? "#f39c12" : "#e74c3c"};
                ">${level.difficulty.toUpperCase()}</span>
              </div>
            </div>
          `
            )
            .join("")}
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <button onclick="this.closest('div').remove()" style="
            background: rgba(52, 73, 94, 0.5);
            border: 1px solid #34495e;
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            margin-right: 10px;
          ">Cancel</button>
          
          <button onclick="window.levelSceneManager.resetProgress(); this.closest('div').remove();" style="
            background: linear-gradient(135deg, #e74c3c, #c0392b);
            border: none;
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
          ">🔄 Reset Progress</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close on background click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  /**
   * Auto-start appropriate level based on progress
   */
  public autoStart(): void {
    // Check if course is completed
    if (localStorage.getItem("stemplitude_course_completed")) {
      this.showCourseCompletedScreen();
      return;
    }

    // Find the next uncompleted level
    const levels = this.getAllLevels();
    const nextLevel = levels.find(
      (level) => level.isUnlocked && !level.isCompleted
    );

    if (nextLevel) {
      // Show level selection with recommendation
      this.showLevelSelection();
    } else {
      // All levels completed
      this.showCourseCompletedScreen();
    }
  }

  /**
   * Show course completed screen
   */
  private showCourseCompletedScreen(): void {
    const screen = document.createElement("div");
    screen.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #2c3e50, #34495e);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 11000;
      color: white;
    `;

    screen.innerHTML = `
      <div style="text-align: center; max-width: 600px; padding: 40px;">
        <div style="font-size: 72px; margin-bottom: 30px;">🎓</div>
        <h1 style="margin: 0 0 20px 0; font-size: 36px;">Course Complete!</h1>
        <p style="margin: 0 0 30px 0; font-size: 18px; line-height: 1.6;">
          Congratulations! You've mastered all levels of mechanical engineering fundamentals.
        </p>
        
        <div style="margin: 30px 0; display: flex; justify-content: center; gap: 10px;">
          <button onclick="window.levelSceneManager.showLevelSelection(); this.closest('div').remove();" style="
            background: linear-gradient(135deg, #3498db, #2980b9);
            border: none;
            color: white;
            padding: 15px 30px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
          ">📚 Review Levels</button>
          
          <button onclick="window.levelSceneManager.resetProgress(); location.reload();" style="
            background: linear-gradient(135deg, #27ae60, #229954);
            border: none;
            color: white;
            padding: 15px 30px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
          ">🔄 Start Over</button>
        </div>
      </div>
    `;

    document.body.appendChild(screen);
  }
}

// Make globally accessible
declare global {
  interface Window {
    levelSceneManager: LevelSceneManager;
  }
}
