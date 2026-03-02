import { LevelScene } from "./LevelScene";
import { Level, Objective } from "../ObjectiveSystem";

/**
 * Level 3: Belt Drive Systems
 * Master belt connections and pulleys
 */
export class BeltSystemsScene extends LevelScene {
  constructor() {
    super("belt_systems");
  }

  protected initializeLevelData(levelId: string): void {
    this.levelData = {
      id: "belt_systems",
      title: "Belt Drive Systems",
      description: "Master belt connections and pulleys",
      difficulty: "intermediate",
      allowedComponents: [
        {
          type: "motor",
          maxCount: 1,
          unlocked: true,
          description: "Electric motor",
        },
        {
          type: "pulley",
          maxCount: 3,
          unlocked: true,
          description: "Belt pulley",
        },
        {
          type: "gear",
          maxCount: 2,
          unlocked: true,
          description: "Mechanical gear",
        },
      ],
      objectives: [], // Will be set in setupLevelObjectives
      reward: {
        points: 300,
        unlocksNext: "forklift_challenge",
        badge: "belt_engineer",
      },
      estimatedMinutes: 15,
    };
  }

  protected setupLevelObjectives(): void {
    this.levelObjectives = [
      {
        id: "place_motor",
        description: "Place a motor to power your belt system",
        type: "place",
        target: { component: "motor", count: 1 },
        points: 50,
        completed: false,
        progress: 0,
      },
      {
        id: "place_pulleys",
        description: "Place two pulleys on the canvas",
        type: "place",
        target: { component: "pulley", count: 2 },
        points: 75,
        completed: false,
        progress: 0,
      },
      {
        id: "create_belt",
        description: "Connect pulleys with a belt drive",
        type: "connect",
        target: { action: "belt_connection" },
        points: 100,
        completed: false,
        progress: 0,
      },
      {
        id: "start_system",
        description: "Start the simulation to see your belt system work",
        type: "simulate",
        target: { action: "start" },
        points: 75,
        completed: false,
        progress: 0,
      },
    ];

    this.levelData.objectives = this.levelObjectives;
  }

  protected defineAvailableComponents(): string[] {
    return ["motor", "pulley", "gear"];
  }

  protected defineAvailableTools(): string[] {
    return ["belt"]; // Belt tool is needed for this level
  }

  protected onLevelStart(): void {
    console.log("🎯 Starting Belt Systems level");

    // Show initial guidance
    setTimeout(() => {
      this.showHint(
        "Create a belt drive system! Place a motor and pulleys, then use the belt tool to connect them."
      );
    }, 3000);
  }

  protected onLevelComplete(): void {
    console.log("🎉 Belt Systems level completed!");
    this.saveProgress();
  }

  protected goToNextLevel(): void {
    console.log("➡️ Going to Forklift Challenge level");
    // Navigate to forklift challenge level
    alert("Next level: Forklift Engineering Challenge (not implemented yet)");
  }

  /**
   * Show helpful hints with belt-specific guidance
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
      max-width: 450px;
      text-align: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    hint.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">💡 Belt Systems Tip</div>
      <div>${message}</div>
    `;

    document.body.appendChild(hint);

    setTimeout(() => (hint.style.opacity = "1"), 100);
    setTimeout(() => {
      hint.style.opacity = "0";
      setTimeout(() => hint.remove(), 300);
    }, 10000); // Longer display for more complex instructions
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

    localStorage.setItem("belt_systems_progress", JSON.stringify(progress));
  }

  /**
   * Override validation for belt-specific objectives
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

      case "place_pulleys":
        const pulleyCount = this.countComponents(gameState, "pulley");
        objective.progress = Math.min((pulleyCount / 2) * 100, 100);
        return pulleyCount >= 2;

      case "create_belt":
        const hasBelt = this.checkConnection(gameState, "belt_connection");
        objective.progress = hasBelt ? 100 : 0;
        return hasBelt;

      case "start_system":
        const isRunning = gameState.isSimulationRunning;
        objective.progress = isRunning ? 100 : 0;
        return isRunning;

      default:
        return super.validateObjective(objective, gameState);
    }
  }

  /**
   * Provide specific feedback for belt system construction
   */
  protected override onComponentPlaced(componentType: string): void {
    super.onComponentPlaced(componentType);

    if (componentType === "motor") {
      setTimeout(() => {
        this.showHint(
          "Great start! Now place two pulleys. Pulleys are round components that belts wrap around."
        );
      }, 1000);
    } else if (componentType === "pulley") {
      const pulleyCount = this.countComponents(
        this.getCurrentGameState(),
        "pulley"
      );

      if (pulleyCount === 1) {
        setTimeout(() => {
          this.showHint(
            "Good! Place one more pulley, then use the belt tool to connect them together."
          );
        }, 1000);
      } else if (pulleyCount >= 2) {
        setTimeout(() => {
          this.showHint(
            "Perfect! Now click the Belt Tool in the toolbar, then click on each pulley to connect them with a belt."
          );
        }, 1000);
      }
    }
  }

  /**
   * Provide feedback when belt is created
   */
  protected override onConnectionCreated(connectionType: string): void {
    super.onConnectionCreated(connectionType);

    if (connectionType === "belt_connection") {
      setTimeout(() => {
        this.showHint(
          "Excellent! Your belt drive is connected. Now start the simulation to see power transfer through the belt! 🎉"
        );
      }, 1000);
    }
  }

  /**
   * Provide feedback when simulation starts
   */
  protected override onSimulationStarted(): void {
    super.onSimulationStarted();

    setTimeout(() => {
      this.showHint(
        "Amazing! Watch how the belt transfers power from one pulley to another. This is how many machines work! 🔧"
      );
    }, 1500);
  }

  /**
   * Override to check belt-specific connections
   */
  protected override checkConnection(
    gameState: any,
    actionType: string
  ): boolean {
    if (!gameState.connections) return false;

    switch (actionType) {
      case "belt_connection":
        // Check if there's a belt connection between motor and pulley, or between pulleys
        return gameState.connections.some((conn: any) => {
          if (conn.type !== "belt_connection") return false;

          const comp1Type = conn.component1?.getComponentType?.() || "";
          const comp2Type = conn.component2?.getComponentType?.() || "";

          // Valid belt connections: motor-pulley, pulley-pulley, motor-gear, etc.
          const validTypes = ["motor", "pulley", "gear"];
          return (
            validTypes.includes(comp1Type) && validTypes.includes(comp2Type)
          );
        });

      default:
        return super.checkConnection(gameState, actionType);
    }
  }
}
