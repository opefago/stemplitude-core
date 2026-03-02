import { LevelScene } from "./LevelScene";
import { Level, Objective } from "../ObjectiveSystem";

/**
 * Level 2: Gear Introduction
 * Learn about gears and gear meshing
 */
export class GearIntroductionScene extends LevelScene {
  constructor() {
    super("gear_introduction");
  }

  protected initializeLevelData(levelId: string): void {
    this.levelData = {
      id: "gear_introduction",
      title: "Gear Introduction",
      description: "Learn about gears and gear meshing",
      difficulty: "beginner",
      allowedComponents: [
        {
          type: "motor",
          maxCount: 1,
          unlocked: true,
          description: "Electric motor",
        },
        {
          type: "gear",
          maxCount: 3,
          unlocked: true,
          description: "Mechanical gear",
        },
      ],
      objectives: [], // Will be set in setupLevelObjectives
      reward: {
        points: 150,
        unlocksNext: "belt_systems",
        badge: "gear_master",
      },
      estimatedMinutes: 10,
    };
  }

  protected setupLevelObjectives(): void {
    this.levelObjectives = [
      {
        id: "place_motor",
        description: "Place a motor to power your gear system",
        type: "place",
        target: { component: "motor", count: 1 },
        points: 40,
        completed: false,
        progress: 0,
      },
      {
        id: "place_gears",
        description: "Place two gears on the canvas",
        type: "place",
        target: { component: "gear", count: 2 },
        points: 60,
        completed: false,
        progress: 0,
      },
      {
        id: "mesh_gears",
        description: "Position gears close enough to mesh together",
        type: "connect",
        target: { action: "gear_mesh" },
        points: 50,
        completed: false,
        progress: 0,
      },
    ];

    this.levelData.objectives = this.levelObjectives;
  }

  protected defineAvailableComponents(): string[] {
    return ["motor", "gear"];
  }

  protected defineAvailableTools(): string[] {
    return []; // Gears mesh automatically when close enough
  }

  protected onLevelStart(): void {
    console.log("🎯 Starting Gear Introduction level");

    // Show initial guidance
    setTimeout(() => {
      this.showHint(
        "Start by placing a motor, then add gears. Position gears close together to make them mesh!"
      );
    }, 3000);
  }

  protected onLevelComplete(): void {
    console.log("🎉 Gear Introduction level completed!");
    this.saveProgress();
  }

  protected goToNextLevel(): void {
    console.log("➡️ Going to Belt Systems level");
    // Navigate to belt systems level
    alert("Next level: Belt Drive Systems (not implemented yet)");
  }

  /**
   * Show helpful hints
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

    setTimeout(() => (hint.style.opacity = "1"), 100);
    setTimeout(() => {
      hint.style.opacity = "0";
      setTimeout(() => hint.remove(), 300);
    }, 8000);
  }

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

    localStorage.setItem(
      "gear_introduction_progress",
      JSON.stringify(progress)
    );
  }

  /**
   * Override validation for gear-specific objectives
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

      case "place_gears":
        const gearCount = this.countComponents(gameState, "gear");
        objective.progress = Math.min((gearCount / 2) * 100, 100);
        return gearCount >= 2;

      case "mesh_gears":
        const hasMesh = this.checkConnection(gameState, "gear_mesh");
        objective.progress = hasMesh ? 100 : 0;
        return hasMesh;

      default:
        return super.validateObjective(objective, gameState);
    }
  }

  /**
   * Provide specific feedback for gear placement
   */
  protected override onComponentPlaced(componentType: string): void {
    super.onComponentPlaced(componentType);

    if (componentType === "motor") {
      setTimeout(() => {
        this.showHint(
          "Good! Now place two gears on the canvas. You can drag them from the toolbar."
        );
      }, 1000);
    } else if (componentType === "gear") {
      const gearCount = this.countComponents(
        this.getCurrentGameState(),
        "gear"
      );

      if (gearCount === 1) {
        setTimeout(() => {
          this.showHint(
            "Great! Place one more gear, then position them close together to make them mesh."
          );
        }, 1000);
      } else if (gearCount >= 2) {
        setTimeout(() => {
          this.showHint(
            "Perfect! Now drag the gears close to each other. They'll automatically mesh when close enough!"
          );
        }, 1000);
      }
    }
  }

  /**
   * Provide feedback when gears mesh
   */
  protected override onConnectionCreated(connectionType: string): void {
    super.onConnectionCreated(connectionType);

    if (connectionType === "gear_mesh") {
      setTimeout(() => {
        this.showHint(
          "Excellent! Your gears are now meshed together. They'll rotate together when powered! 🎉"
        );
      }, 1000);
    }
  }
}
