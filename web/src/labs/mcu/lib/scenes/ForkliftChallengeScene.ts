import { LevelScene } from "./LevelScene";
import { Level, Objective } from "../ObjectiveSystem";

/**
 * Level 4: Forklift Engineering Challenge
 * Design and optimize a forklift lifting system
 */
export class ForkliftChallengeScene extends LevelScene {
  constructor() {
    super("forklift_challenge");
  }

  protected initializeLevelData(levelId: string): void {
    this.levelData = {
      id: "forklift_challenge",
      title: "Forklift Engineering Challenge",
      description: "Design a complete forklift lifting system",
      difficulty: "advanced",
      allowedComponents: [
        {
          type: "motor",
          maxCount: 2,
          unlocked: true,
          description: "Electric motor",
        },
        {
          type: "gear",
          maxCount: 4,
          unlocked: true,
          description: "Mechanical gear",
        },
        {
          type: "pulley",
          maxCount: 3,
          unlocked: true,
          description: "Belt pulley",
        },
        {
          type: "forklift",
          maxCount: 1,
          unlocked: true,
          description: "Industrial forklift",
        },
      ],
      objectives: [], // Will be set in setupLevelObjectives
      reward: {
        points: 500,
        badge: "forklift_master",
      },
      estimatedMinutes: 25,
    };
  }

  protected setupLevelObjectives(): void {
    this.levelObjectives = [
      {
        id: "place_forklift",
        description: "Place a forklift on the canvas",
        type: "place",
        target: { component: "forklift", count: 1 },
        points: 100,
        completed: false,
        progress: 0,
      },
      {
        id: "place_motor",
        description: "Place a motor to power the forklift",
        type: "place",
        target: { component: "motor", count: 1 },
        points: 75,
        completed: false,
        progress: 0,
      },
      {
        id: "power_forklift",
        description: "Connect motor power to the forklift using belts",
        type: "connect",
        target: { action: "forklift_power" },
        points: 150,
        completed: false,
        progress: 0,
      },
      {
        id: "test_lift",
        description: "Start simulation and test the lifting mechanism",
        type: "simulate",
        target: { action: "start" },
        points: 100,
        completed: false,
        progress: 0,
      },
      {
        id: "save_design",
        description: "Save your completed forklift design",
        type: "save",
        target: { action: "save_project" },
        points: 75,
        completed: false,
        progress: 0,
      },
    ];

    this.levelData.objectives = this.levelObjectives;
  }

  protected defineAvailableComponents(): string[] {
    return ["motor", "gear", "pulley", "forklift"];
  }

  protected defineAvailableTools(): string[] {
    return ["belt"]; // Belt tool needed to connect motor to forklift
  }

  protected onLevelStart(): void {
    console.log("🎯 Starting Forklift Challenge level");

    // Show comprehensive guidance for this advanced level
    setTimeout(() => {
      this.showHint(
        "Welcome to the Forklift Challenge! This is an advanced level. Take your time to build a complete lifting system."
      );
    }, 3000);

    // Show additional guidance after initial hint
    setTimeout(() => {
      this.showEngineeringTip(
        "Engineering Tip: Forklifts use motor power transmitted through belts or gears to lift heavy loads vertically."
      );
    }, 8000);
  }

  protected onLevelComplete(): void {
    console.log("🎉 Forklift Challenge level completed!");
    this.saveProgress();

    // Show special completion message for final level
    setTimeout(() => {
      this.showCongratulations();
    }, 2000);
  }

  protected goToNextLevel(): void {
    console.log("🏆 All levels completed!");
    // This is the final level, show completion screen
    this.showFinalCompletion();
  }

  /**
   * Show engineering tips specific to forklift design
   */
  private showEngineeringTip(message: string): void {
    const tip = document.createElement("div");
    tip.style.cssText = `
      position: fixed;
      top: 120px;
      right: 20px;
      background: linear-gradient(135deg, #9b59b6, #8e44ad);
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 300px;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    tip.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">🔧 Engineering Tip</div>
      <div style="font-size: 14px;">${message}</div>
    `;

    document.body.appendChild(tip);

    setTimeout(() => (tip.style.opacity = "1"), 100);
    setTimeout(() => {
      tip.style.opacity = "0";
      setTimeout(() => tip.remove(), 300);
    }, 12000);
  }

  /**
   * Show regular hints
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
      max-width: 500px;
      text-align: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    hint.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">💡 Forklift Challenge</div>
      <div>${message}</div>
    `;

    document.body.appendChild(hint);

    setTimeout(() => (hint.style.opacity = "1"), 100);
    setTimeout(() => {
      hint.style.opacity = "0";
      setTimeout(() => hint.remove(), 300);
    }, 10000);
  }

  /**
   * Show congratulations for completing the challenge
   */
  private showCongratulations(): void {
    const congrats = document.createElement("div");
    congrats.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #27ae60, #229954);
      color: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      z-index: 11000;
      text-align: center;
      max-width: 400px;
    `;

    congrats.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 20px;">🏆</div>
      <h2 style="margin: 0 0 15px 0;">Congratulations, Engineer!</h2>
      <p style="margin: 0 0 20px 0;">You've successfully completed the Forklift Engineering Challenge!</p>
      <p style="margin: 0; font-size: 14px; opacity: 0.9;">
        You've mastered motors, gears, belts, and complex mechanical systems. 
        You're now ready to tackle real engineering challenges!
      </p>
    `;

    document.body.appendChild(congrats);

    setTimeout(() => congrats.remove(), 8000);
  }

  /**
   * Show final completion screen
   */
  private showFinalCompletion(): void {
    const final = document.createElement("div");
    final.style.cssText = `
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

    final.innerHTML = `
      <div style="text-align: center; max-width: 600px; padding: 40px;">
        <div style="font-size: 72px; margin-bottom: 30px;">🎓</div>
        <h1 style="margin: 0 0 20px 0; font-size: 36px;">Course Complete!</h1>
        <p style="margin: 0 0 30px 0; font-size: 18px; line-height: 1.6;">
          You've successfully completed all levels of the STEMplitude Mechanical Engineering Course!
          You've learned about motors, gears, belts, and complex mechanical systems.
        </p>
        
        <div style="margin: 30px 0;">
          <h3 style="margin: 0 0 15px 0;">Your Achievements:</h3>
          <div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap;">
            <div style="background: rgba(52, 152, 219, 0.2); padding: 10px 15px; border-radius: 8px;">
              🏅 Motor Master
            </div>
            <div style="background: rgba(52, 152, 219, 0.2); padding: 10px 15px; border-radius: 8px;">
              ⚙️ Gear Expert
            </div>
            <div style="background: rgba(52, 152, 219, 0.2); padding: 10px 15px; border-radius: 8px;">
              🔗 Belt Engineer
            </div>
            <div style="background: rgba(52, 152, 219, 0.2); padding: 10px 15px; border-radius: 8px;">
              🏗️ Forklift Master
            </div>
          </div>
        </div>
        
        <button onclick="location.reload()" style="
          background: linear-gradient(135deg, #3498db, #2980b9);
          border: none;
          color: white;
          padding: 15px 30px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
          margin-top: 20px;
        ">🔄 Start New Course</button>
      </div>
    `;

    document.body.appendChild(final);
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
      courseCompleted: true,
    };

    localStorage.setItem(
      "forklift_challenge_progress",
      JSON.stringify(progress)
    );
    localStorage.setItem("stemplitude_course_completed", "true");
  }

  /**
   * Override validation for forklift-specific objectives
   */
  protected override validateObjective(
    objective: Objective,
    gameState: any
  ): boolean {
    switch (objective.id) {
      case "place_forklift":
        const forkliftCount = this.countComponents(gameState, "forklift");
        objective.progress = Math.min((forkliftCount / 1) * 100, 100);
        return forkliftCount >= 1;

      case "place_motor":
        const motorCount = this.countComponents(gameState, "motor");
        objective.progress = Math.min((motorCount / 1) * 100, 100);
        return motorCount >= 1;

      case "power_forklift":
        const hasForkliftPower = this.checkForkliftPower(gameState);
        objective.progress = hasForkliftPower ? 100 : 0;
        return hasForkliftPower;

      case "test_lift":
        const isRunning = gameState.isSimulationRunning;
        objective.progress = isRunning ? 100 : 0;
        return isRunning;

      case "save_design":
        const hasSaved = gameState.lastSaveTime > 0;
        objective.progress = hasSaved ? 100 : 0;
        return hasSaved;

      default:
        return super.validateObjective(objective, gameState);
    }
  }

  /**
   * Check if forklift is properly powered
   */
  private checkForkliftPower(gameState: any): boolean {
    if (!gameState.connections) return false;

    return gameState.connections.some((conn: any) => {
      if (conn.type !== "belt_connection") return false;

      const comp1Type = conn.component1?.getComponentType?.() || "";
      const comp2Type = conn.component2?.getComponentType?.() || "";

      // Check if there's a connection involving a forklift and a power source
      return (
        (comp1Type === "forklift" &&
          ["motor", "gear", "pulley"].includes(comp2Type)) ||
        (comp2Type === "forklift" &&
          ["motor", "gear", "pulley"].includes(comp1Type))
      );
    });
  }

  /**
   * Provide specific feedback for forklift construction
   */
  protected override onComponentPlaced(componentType: string): void {
    super.onComponentPlaced(componentType);

    if (componentType === "forklift") {
      setTimeout(() => {
        this.showHint(
          "Excellent! You've placed the forklift. Now add a motor to power it."
        );
      }, 1000);

      setTimeout(() => {
        this.showEngineeringTip(
          "Forklifts need significant torque to lift heavy loads. Consider the gear ratios in your design."
        );
      }, 5000);
    } else if (componentType === "motor") {
      const motorCount = this.countComponents(
        this.getCurrentGameState(),
        "motor"
      );
      const forkliftCount = this.countComponents(
        this.getCurrentGameState(),
        "forklift"
      );

      if (forkliftCount > 0 && motorCount >= 1) {
        setTimeout(() => {
          this.showHint(
            "Great! Now use the belt tool to connect your motor to the forklift's pulley system."
          );
        }, 1000);
      }
    }
  }

  /**
   * Provide feedback when forklift is powered
   */
  protected override onConnectionCreated(connectionType: string): void {
    super.onConnectionCreated(connectionType);

    if (connectionType === "belt_connection") {
      const gameState = this.getCurrentGameState();
      if (this.checkForkliftPower(gameState)) {
        setTimeout(() => {
          this.showHint(
            "Perfect! Your forklift is now powered. Start the simulation to test the lifting mechanism!"
          );
        }, 1000);
      }
    }
  }

  /**
   * Provide feedback when simulation starts
   */
  protected override onSimulationStarted(): void {
    super.onSimulationStarted();

    setTimeout(() => {
      this.showHint(
        "Excellent! Watch your forklift in action. The motor power is transmitted through belts to lift the forks!"
      );
    }, 1500);

    setTimeout(() => {
      this.showEngineeringTip(
        "In real forklifts, hydraulic systems often provide the lifting force, but the principles of power transmission remain the same."
      );
    }, 8000);
  }
}
