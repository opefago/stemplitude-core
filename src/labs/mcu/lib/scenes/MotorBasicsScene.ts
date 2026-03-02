import { LevelScene } from "./LevelScene";
import { Level, Objective } from "../ObjectiveSystem";

/**
 * Level 1: Motor Basics
 * Learn to place and control motors
 */
export class MotorBasicsScene extends LevelScene {
  constructor() {
    super("motor_basics");
  }

  protected initializeLevelData(levelId: string): void {
    this.levelData = {
      id: "motor_basics",
      title: "Motor Basics",
      description: "Learn to place and control motors",
      difficulty: "beginner",
      allowedComponents: [
        {
          type: "motor",
          maxCount: 2,
          unlocked: true,
          description: "Electric motor",
        },
      ],
      objectives: [], // Will be set in setupLevelObjectives
      reward: {
        points: 100,
        unlocksNext: "gear_introduction",
        badge: "first_motor",
      },
      estimatedMinutes: 5,
    };
  }

  protected setupLevelObjectives(): void {
    this.levelObjectives = [
      {
        id: "place_motor",
        description: "Place your first motor on the canvas",
        type: "place",
        target: { component: "motor", count: 1 },
        points: 50,
        completed: false,
        progress: 0,
      },
      {
        id: "start_simulation",
        description: "Start the simulation to see your motor spin",
        type: "simulate",
        target: { action: "start" },
        points: 50,
        completed: false,
        progress: 0,
      },
    ];

    this.levelData.objectives = this.levelObjectives;
  }

  protected defineAvailableComponents(): string[] {
    return ["motor"];
  }

  protected defineAvailableTools(): string[] {
    return []; // No connection tools needed for this level
  }

  protected onLevelStart(): void {
    console.log("🎯 Starting Motor Basics level");

    // Show helpful hint after a delay
    setTimeout(() => {
      this.showHint(
        "Drag a motor from the toolbar on the right onto the canvas to get started!"
      );
    }, 3000);
  }

  protected onLevelComplete(): void {
    console.log("🎉 Motor Basics level completed!");

    // Save progress
    this.saveProgress();
  }

  protected goToNextLevel(): void {
    // Navigate to gear introduction level
    console.log("➡️ Going to Gear Introduction level");

    // In a real implementation, you'd use your scene manager to switch scenes
    // this.getSceneManager().switchToScene(new GearIntroductionScene());

    // For now, just show a message
    alert("Next level: Gear Introduction (not implemented yet)");
  }

  /**
   * Show a helpful hint to the user
   */
  private showHint(message: string): void {
    const hint = document.createElement("div");
    hint.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #f39c12, #e67e22);
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 400px;
      text-align: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    hint.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">💡 Hint</div>
      <div>${message}</div>
    `;

    document.body.appendChild(hint);

    // Animate in
    setTimeout(() => {
      hint.style.opacity = "1";
    }, 100);

    // Remove after delay
    setTimeout(() => {
      hint.style.opacity = "0";
      setTimeout(() => hint.remove(), 300);
    }, 8000);
  }

  /**
   * Save level progress
   */
  private saveProgress(): void {
    const progress = {
      levelId: this.levelData.id,
      completed: true,
      completedAt: new Date().toISOString(),
      objectives: this.levelObjectives.map((obj) => ({
        id: obj.id,
        completed: obj.completed,
      })),
    };

    localStorage.setItem("motor_basics_progress", JSON.stringify(progress));
  }

  /**
   * Override to provide motor-specific validation
   */
  protected override validateObjective(
    objective: Objective,
    gameState: any
  ): boolean {
    switch (objective.id) {
      case "place_motor":
        const motorCount = this.countComponents(gameState, "motor");
        objective.progress = Math.min((motorCount / 1) * 100, 100);
        return motorCount >= 1;

      case "start_simulation":
        const isRunning = gameState.isSimulationRunning;
        console.log(`🎯 MotorBasics: Validating start_simulation - isRunning: ${isRunning}`);
        console.log(`🎯 MotorBasics: GameState:`, gameState);
        objective.progress = isRunning ? 100 : 0;
        return isRunning;

      default:
        return super.validateObjective(objective, gameState);
    }
  }

  /**
   * Override component placement to provide immediate feedback
   */
  protected override onComponentPlaced(componentType: string): void {
    super.onComponentPlaced(componentType);

    if (componentType === "motor") {
      // Show encouraging message
      setTimeout(() => {
        this.showHint(
          "Great! Now click the play button ▶️ to start the simulation and see your motor spin!"
        );
      }, 1000);
    }
  }

  /**
   * Override simulation start to provide feedback
   */
  protected override onSimulationStarted(): void {
    super.onSimulationStarted();

    // Show congratulations message
    setTimeout(() => {
      this.showHint(
        "Excellent! You've successfully started the simulation. Watch your motor spin! 🎉"
      );
    }, 1000);
  }
}
