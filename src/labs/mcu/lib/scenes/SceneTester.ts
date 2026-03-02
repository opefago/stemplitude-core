import { LevelSceneManager } from "./LevelSceneManager";
import { MotorBasicsScene } from "./MotorBasicsScene";
import { GearIntroductionScene } from "./GearIntroductionScene";
import { BeltSystemsScene } from "./BeltSystemsScene";
import { ForkliftChallengeScene } from "./ForkliftChallengeScene";

/**
 * Scene Testing Utility
 * Provides easy ways to test individual scenes and the level system
 */
export class SceneTester {
  private levelManager: LevelSceneManager;

  constructor() {
    this.levelManager = new LevelSceneManager();
    this.setupGlobalAccess();
    this.createTestingUI();
  }

  /**
   * Make testing functions globally accessible
   */
  private setupGlobalAccess(): void {
    (window as any).levelSceneManager = this.levelManager;
    (window as any).sceneTester = this;

    // Add individual scene testers
    (window as any).testMotorBasics = () => this.testScene("motor_basics");
    (window as any).testGearIntroduction = () =>
      this.testScene("gear_introduction");
    (window as any).testBeltSystems = () => this.testScene("belt_systems");
    (window as any).testForkliftChallenge = () =>
      this.testScene("forklift_challenge");

    // Add utility functions
    (window as any).unlockAllLevels = () => this.unlockAllLevels();
    (window as any).resetProgress = () => this.resetProgress();
    (window as any).showLevelMenu = () =>
      this.levelManager.showLevelSelection();
    (window as any).completeCurrentObjective = () =>
      this.completeCurrentObjective();
    (window as any).skipToNextLevel = () => this.skipToNextLevel();
  }

  /**
   * Create testing UI overlay
   */
  private createTestingUI(): void {
    const testingPanel = document.createElement("div");
    testingPanel.id = "scene-testing-panel";
    testingPanel.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: linear-gradient(135deg, #8e44ad, #9b59b6);
      border: 2px solid #a569bd;
      border-radius: 8px;
      padding: 15px;
      color: white;
      font-family: monospace;
      font-size: 12px;
      z-index: 12000;
      max-width: 300px;
      opacity: 0.9;
      transition: opacity 0.3s ease;
    `;

    testingPanel.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 10px; text-align: center;">
        🧪 Scene Tester
        <button onclick="this.closest('#scene-testing-panel').style.display='none'" 
                style="float: right; background: none; border: none; color: white; cursor: pointer;">×</button>
      </div>
      
      <div style="margin-bottom: 10px;">
        <strong>Quick Tests:</strong><br>
        <button onclick="testMotorBasics()" class="test-btn">Motor Basics</button>
        <button onclick="testGearIntroduction()" class="test-btn">Gear Intro</button><br>
        <button onclick="testBeltSystems()" class="test-btn">Belt Systems</button>
        <button onclick="testForkliftChallenge()" class="test-btn">Forklift</button>
      </div>
      
      <div style="margin-bottom: 10px;">
        <strong>Utilities:</strong><br>
        <button onclick="showLevelMenu()" class="test-btn">Level Menu</button>
        <button onclick="unlockAllLevels()" class="test-btn">Unlock All</button><br>
        <button onclick="resetProgress()" class="test-btn">Reset Progress</button>
      </div>
      
      <div style="margin-bottom: 10px;">
        <strong>Debug:</strong><br>
        <button onclick="completeCurrentObjective()" class="test-btn">Complete Objective</button>
        <button onclick="skipToNextLevel()" class="test-btn">Skip Level</button>
      </div>
      
      <div style="font-size: 10px; opacity: 0.8; margin-top: 10px;">
        Press F12 → Console for more commands
      </div>
    `;

    // Add CSS for test buttons
    const style = document.createElement("style");
    style.textContent = `
      .test-btn {
        background: rgba(255, 255, 255, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: white;
        padding: 4px 8px;
        margin: 2px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        transition: background 0.2s ease;
      }
      .test-btn:hover {
        background: rgba(255, 255, 255, 0.3);
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(testingPanel);

    // Add keyboard shortcut to toggle testing panel
    document.addEventListener("keydown", (e) => {
      if (e.key === "F1") {
        e.preventDefault();
        const panel = document.getElementById("scene-testing-panel");
        if (panel) {
          panel.style.display =
            panel.style.display === "none" ? "block" : "none";
        }
      }
    });

    console.log(
      "🧪 Scene Tester initialized! Press F1 to toggle testing panel"
    );
    this.logTestingCommands();
  }

  /**
   * Test a specific scene
   */
  public testScene(levelId: string): void {
    console.log(`🧪 Testing scene: ${levelId}`);

    // Clear any existing scene
    this.clearCurrentScene();

    // Start the requested level
    const success = this.levelManager.startLevel(levelId);

    if (success) {
      console.log(`✅ Scene ${levelId} started successfully`);
      this.logSceneInfo(levelId);
    } else {
      console.error(`❌ Failed to start scene: ${levelId}`);
      console.log("💡 Try unlocking all levels first: unlockAllLevels()");
    }
  }

  /**
   * Unlock all levels for testing
   */
  public unlockAllLevels(): void {
    const levels = ["motor_basics", "gear_introduction", "belt_systems"];

    levels.forEach((levelId) => {
      this.levelManager.markLevelCompleted(levelId);
    });

    console.log("🔓 All levels unlocked for testing");
  }

  /**
   * Reset all progress
   */
  public resetProgress(): void {
    this.levelManager.resetProgress();
    console.log("🔄 Progress reset");
  }

  /**
   * Complete the current objective (for testing)
   */
  public completeCurrentObjective(): void {
    const currentScene = this.levelManager.getCurrentScene();
    if (!currentScene) {
      console.log("❌ No active scene");
      return;
    }

    // Find the first incomplete objective
    const incompleteObjective = (currentScene as any).levelObjectives?.find(
      (obj: any) => !obj.completed
    );

    if (incompleteObjective) {
      // Force complete the objective
      (currentScene as any).completedObjectives.add(incompleteObjective.id);
      incompleteObjective.completed = true;
      incompleteObjective.progress = 100;

      console.log(`✅ Completed objective: ${incompleteObjective.description}`);

      // Trigger completion check
      (currentScene as any).checkObjective(incompleteObjective.id);
    } else {
      console.log("🎉 All objectives already completed!");
    }
  }

  /**
   * Skip to next level
   */
  public skipToNextLevel(): void {
    const currentScene = this.levelManager.getCurrentScene();
    if (!currentScene) {
      console.log("❌ No active scene");
      return;
    }

    // Complete all objectives
    (currentScene as any).levelObjectives?.forEach((obj: any) => {
      (currentScene as any).completedObjectives.add(obj.id);
      obj.completed = true;
      obj.progress = 100;
    });

    // Trigger level completion
    (currentScene as any).isLevelCompleted = true;
    (currentScene as any).onLevelComplete();

    console.log("⏭️ Skipped to next level");
  }

  /**
   * Clear current scene
   */
  private clearCurrentScene(): void {
    const currentScene = this.levelManager.getCurrentScene();
    if (currentScene) {
      (currentScene as any).onSceneDeactivated();
    }
  }

  /**
   * Log scene information
   */
  private logSceneInfo(levelId: string): void {
    const currentScene = this.levelManager.getCurrentScene();
    if (!currentScene) return;

    const sceneData = (currentScene as any).levelData;
    const objectives = (currentScene as any).levelObjectives;

    console.log("📋 Scene Information:");
    console.log(`  Title: ${sceneData.title}`);
    console.log(`  Difficulty: ${sceneData.difficulty}`);
    console.log(
      `  Components: ${(currentScene as any).enabledComponents.join(", ")}`
    );
    console.log(
      `  Tools: ${(currentScene as any).enabledTools.join(", ") || "None"}`
    );
    console.log(`  Objectives: ${objectives.length}`);

    objectives.forEach((obj: any, index: number) => {
      console.log(`    ${index + 1}. ${obj.description} (${obj.points} pts)`);
    });
  }

  /**
   * Log available testing commands
   */
  private logTestingCommands(): void {
    console.log("🧪 Available Testing Commands:");
    console.log("");
    console.log("📚 Scene Testing:");
    console.log("  testMotorBasics()       - Test Motor Basics level");
    console.log("  testGearIntroduction()  - Test Gear Introduction level");
    console.log("  testBeltSystems()       - Test Belt Systems level");
    console.log("  testForkliftChallenge() - Test Forklift Challenge level");
    console.log("");
    console.log("🛠️ Utilities:");
    console.log("  showLevelMenu()         - Show level selection menu");
    console.log("  unlockAllLevels()       - Unlock all levels for testing");
    console.log("  resetProgress()         - Reset all progress");
    console.log("");
    console.log("🐛 Debug:");
    console.log(
      "  completeCurrentObjective() - Force complete current objective"
    );
    console.log("  skipToNextLevel()          - Skip current level");
    console.log("");
    console.log("⌨️ Shortcuts:");
    console.log("  F1 - Toggle testing panel");
    console.log("");
    console.log("💡 Example workflow:");
    console.log("  1. unlockAllLevels()");
    console.log("  2. testMotorBasics()");
    console.log("  3. completeCurrentObjective() (repeat as needed)");
    console.log("  4. skipToNextLevel()");
  }

  /**
   * Create a specific scene directly (bypasses level manager)
   */
  public createSceneDirect(sceneType: string): void {
    console.log(`🧪 Creating scene directly: ${sceneType}`);

    this.clearCurrentScene();

    let scene;
    switch (sceneType) {
      case "motor":
        scene = new MotorBasicsScene();
        break;
      case "gear":
        scene = new GearIntroductionScene();
        break;
      case "belt":
        scene = new BeltSystemsScene();
        break;
      case "forklift":
        scene = new ForkliftChallengeScene();
        break;
      default:
        console.error(`❌ Unknown scene type: ${sceneType}`);
        return;
    }

    scene.onSceneActivated();
    console.log(`✅ Scene created: ${sceneType}`);
  }

  /**
   * Get current scene status
   */
  public getSceneStatus(): any {
    const currentScene = this.levelManager.getCurrentScene();
    if (!currentScene) {
      return { active: false };
    }

    const objectives = (currentScene as any).levelObjectives || [];
    const completedObjectives =
      (currentScene as any).completedObjectives || new Set();

    return {
      active: true,
      title: (currentScene as any).levelData?.title,
      difficulty: (currentScene as any).levelData?.difficulty,
      objectives: objectives.length,
      completed: completedObjectives.size,
      progress: Math.round(
        (completedObjectives.size / objectives.length) * 100
      ),
      enabledComponents: (currentScene as any).enabledComponents,
      enabledTools: (currentScene as any).enabledTools,
    };
  }

  /**
   * Auto-test all scenes in sequence
   */
  public autoTestAll(): void {
    console.log("🤖 Starting auto-test of all scenes...");

    const scenes = [
      "motor_basics",
      "gear_introduction",
      "belt_systems",
      "forklift_challenge",
    ];
    let currentIndex = 0;

    const testNext = () => {
      if (currentIndex >= scenes.length) {
        console.log("✅ Auto-test completed!");
        return;
      }

      const sceneId = scenes[currentIndex];
      console.log(`🧪 Auto-testing: ${sceneId}`);

      this.testScene(sceneId);

      // Wait 3 seconds, then move to next
      setTimeout(() => {
        currentIndex++;
        testNext();
      }, 3000);
    };

    this.unlockAllLevels();
    testNext();
  }
}

// Add more global testing functions
declare global {
  interface Window {
    sceneTester: SceneTester;
    testMotorBasics: () => void;
    testGearIntroduction: () => void;
    testBeltSystems: () => void;
    testForkliftChallenge: () => void;
    unlockAllLevels: () => void;
    resetProgress: () => void;
    showLevelMenu: () => void;
    completeCurrentObjective: () => void;
    skipToNextLevel: () => void;
  }
}
