/**
 * Simplified Objective System for STEMplitude
 * Focus: Simple, maintainable, level-based progression with component restrictions
 */

export interface ComponentRestriction {
  type: string;
  maxCount?: number;
  unlocked: boolean;
  description?: string;
}

export interface Level {
  id: string;
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";

  // Component restrictions for this level
  allowedComponents: ComponentRestriction[];

  // Objectives
  objectives: Objective[];

  // Completion rewards
  reward: {
    points: number;
    unlocksNext?: string; // Next level ID
    badge?: string;
  };

  // Estimated completion time
  estimatedMinutes: number;
}

export interface Objective {
  id: string;
  description: string;
  type: "place" | "connect" | "simulate" | "achieve" | "save";

  // Target specification
  target: {
    component?: string;
    count?: number;
    value?: number;
    action?: string;
  };

  points: number;
  completed: boolean;
  progress: number; // 0-100
}

export interface UserProgress {
  currentLevel: string;
  completedLevels: string[];
  totalPoints: number;
  unlockedComponents: string[];
  badges: string[];
}

export class ObjectiveSystem {
  private levels: Map<string, Level> = new Map();
  private userProgress: UserProgress;
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor() {
    this.userProgress = this.loadProgress();
    this.initializeLevels();
    this.setupEventHandlers();
  }

  /**
   * Initialize all levels with component restrictions
   */
  private initializeLevels(): void {
    // Level 1: Motor Basics
    this.addLevel({
      id: "motor_basics",
      title: "Motor Basics",
      description: "Learn to place and control motors",
      difficulty: "beginner",
      estimatedMinutes: 5,
      allowedComponents: [
        {
          type: "motor",
          maxCount: 2,
          unlocked: true,
          description: "Electric motor",
        },
      ],
      objectives: [
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
      ],
      reward: {
        points: 100,
        unlocksNext: "gear_introduction",
        badge: "first_motor",
      },
    });

    // Level 2: Gear Introduction
    this.addLevel({
      id: "gear_introduction",
      title: "Gear Introduction",
      description: "Learn about gears and gear meshing",
      difficulty: "beginner",
      estimatedMinutes: 10,
      allowedComponents: [
        { type: "motor", maxCount: 1, unlocked: true },
        {
          type: "gear",
          maxCount: 3,
          unlocked: true,
          description: "Mechanical gear",
        },
      ],
      objectives: [
        {
          id: "place_gears",
          description: "Place two gears on the canvas",
          type: "place",
          target: { component: "gear", count: 2 },
          points: 75,
          completed: false,
          progress: 0,
        },
        {
          id: "mesh_gears",
          description: "Position gears close enough to mesh together",
          type: "connect",
          target: { action: "gear_mesh" },
          points: 75,
          completed: false,
          progress: 0,
        },
      ],
      reward: {
        points: 150,
        unlocksNext: "belt_systems",
        badge: "gear_master",
      },
    });

    // Level 3: Belt Systems
    this.addLevel({
      id: "belt_systems",
      title: "Belt Drive Systems",
      description: "Master belt connections and pulleys",
      difficulty: "intermediate",
      estimatedMinutes: 15,
      allowedComponents: [
        { type: "motor", maxCount: 1, unlocked: true },
        {
          type: "pulley",
          maxCount: 3,
          unlocked: true,
          description: "Belt pulley",
        },
        { type: "gear", maxCount: 2, unlocked: true },
      ],
      objectives: [
        {
          id: "place_pulleys",
          description: "Place two pulleys on the canvas",
          type: "place",
          target: { component: "pulley", count: 2 },
          points: 100,
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
          id: "achieve_speed",
          description: "Achieve 300 RPM output speed",
          type: "achieve",
          target: { value: 300 },
          points: 100,
          completed: false,
          progress: 0,
        },
      ],
      reward: {
        points: 300,
        unlocksNext: "forklift_challenge",
        badge: "belt_engineer",
      },
    });

    // Level 4: Forklift Challenge
    this.addLevel({
      id: "forklift_challenge",
      title: "Forklift Engineering",
      description: "Design a complete forklift lifting system",
      difficulty: "advanced",
      estimatedMinutes: 25,
      allowedComponents: [
        { type: "motor", maxCount: 2, unlocked: true },
        { type: "gear", maxCount: 4, unlocked: true },
        { type: "pulley", maxCount: 3, unlocked: true },
        {
          type: "forklift",
          maxCount: 1,
          unlocked: true,
          description: "Industrial forklift",
        },
      ],
      objectives: [
        {
          id: "place_forklift",
          description: "Place a forklift on the canvas",
          type: "place",
          target: { component: "forklift", count: 1 },
          points: 150,
          completed: false,
          progress: 0,
        },
        {
          id: "power_forklift",
          description: "Connect motor power to the forklift",
          type: "connect",
          target: { action: "forklift_power" },
          points: 200,
          completed: false,
          progress: 0,
        },
        {
          id: "lift_load",
          description: "Successfully lift a 500kg load",
          type: "achieve",
          target: { value: 500 },
          points: 250,
          completed: false,
          progress: 0,
        },
        {
          id: "save_design",
          description: "Save your completed forklift design",
          type: "save",
          target: { action: "save_project" },
          points: 100,
          completed: false,
          progress: 0,
        },
      ],
      reward: {
        points: 700,
        badge: "forklift_master",
      },
    });
  }

  /**
   * Add a level to the system
   */
  private addLevel(level: Level): void {
    this.levels.set(level.id, level);
  }

  /**
   * Get current level
   */
  public getCurrentLevel(): Level | null {
    return this.levels.get(this.userProgress.currentLevel) || null;
  }

  /**
   * Get allowed components for current level
   */
  public getAllowedComponents(): ComponentRestriction[] {
    const currentLevel = this.getCurrentLevel();
    if (!currentLevel) return [];

    return currentLevel.allowedComponents.filter((comp) =>
      this.userProgress.unlockedComponents.includes(comp.type)
    );
  }

  /**
   * Check if component is allowed in current level
   */
  public isComponentAllowed(componentType: string): boolean {
    const allowedComponents = this.getAllowedComponents();
    return allowedComponents.some((comp) => comp.type === componentType);
  }

  /**
   * Get component count limit for current level
   */
  public getComponentLimit(componentType: string): number | null {
    const allowedComponents = this.getAllowedComponents();
    const component = allowedComponents.find(
      (comp) => comp.type === componentType
    );
    return component?.maxCount || null;
  }

  /**
   * Check objective completion
   */
  public checkObjective(objectiveId: string, gameState: any): boolean {
    const currentLevel = this.getCurrentLevel();
    if (!currentLevel) return false;

    const objective = currentLevel.objectives.find(
      (obj) => obj.id === objectiveId
    );
    if (!objective || objective.completed) return false;

    let completed = false;
    let progress = 0;

    switch (objective.type) {
      case "place":
        const componentCount = this.countComponents(
          gameState,
          objective.target.component!
        );
        progress = Math.min(
          (componentCount / (objective.target.count || 1)) * 100,
          100
        );
        completed = componentCount >= (objective.target.count || 1);
        break;

      case "connect":
        completed = this.checkConnection(gameState, objective.target.action!);
        progress = completed ? 100 : 0;
        break;

      case "simulate":
        completed = gameState.isSimulationRunning || false;
        progress = completed ? 100 : 0;
        break;

      case "achieve":
        const currentValue = this.getCurrentValue(gameState, objective);
        const targetValue = objective.target.value || 0;
        progress = Math.min((currentValue / targetValue) * 100, 100);
        completed = currentValue >= targetValue;
        break;

      case "save":
        completed = gameState.lastSaveTime > 0;
        progress = completed ? 100 : 0;
        break;
    }

    objective.progress = progress;

    if (completed && !objective.completed) {
      objective.completed = true;
      this.userProgress.totalPoints += objective.points;
      this.emit("objectiveCompleted", { objective, level: currentLevel });

      // Check if level is completed
      this.checkLevelCompletion(currentLevel);
    }

    return completed;
  }

  /**
   * Check if current level is completed
   */
  private checkLevelCompletion(level: Level): void {
    const allCompleted = level.objectives.every((obj) => obj.completed);

    if (allCompleted && !this.userProgress.completedLevels.includes(level.id)) {
      this.completeLevel(level);
    }
  }

  /**
   * Complete a level and unlock next
   */
  private completeLevel(level: Level): void {
    this.userProgress.completedLevels.push(level.id);
    this.userProgress.totalPoints += level.reward.points;

    if (level.reward.badge) {
      this.userProgress.badges.push(level.reward.badge);
    }

    // Unlock next level
    if (level.reward.unlocksNext) {
      const nextLevel = this.levels.get(level.reward.unlocksNext);
      if (nextLevel) {
        this.userProgress.currentLevel = nextLevel.id;
        // Unlock components for next level
        nextLevel.allowedComponents.forEach((comp) => {
          if (!this.userProgress.unlockedComponents.includes(comp.type)) {
            this.userProgress.unlockedComponents.push(comp.type);
          }
        });
      }
    }

    this.saveProgress();
    this.emit("levelCompleted", { level, nextLevel: level.reward.unlocksNext });

    console.log(
      `🎉 Level completed: ${level.title} (+${level.reward.points} points)`
    );
  }

  /**
   * Helper methods for objective validation
   */
  private countComponents(gameState: any, componentType: string): number {
    if (!gameState.components) return 0;
    return Array.from(gameState.components.values()).filter(
      (comp: any) => comp.getComponentType() === componentType
    ).length;
  }

  private checkConnection(gameState: any, actionType: string): boolean {
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
      case "forklift_power":
        return gameState.connections.some(
          (conn: any) =>
            conn.type === "belt_connection" &&
            (conn.component1.getComponentType() === "forklift" ||
              conn.component2.getComponentType() === "forklift")
        );
      default:
        return false;
    }
  }

  private getCurrentValue(gameState: any, objective: SimpleObjective): number {
    // This would be implemented based on what you're measuring
    // For now, return a placeholder
    return gameState.maxRPMAchieved || 0;
  }

  /**
   * Event system
   */
  private setupEventHandlers(): void {
    // Simple event handling
  }

  public on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach((handler) => handler(data));
  }

  /**
   * Public API
   */
  public getAllLevels(): Level[] {
    return Array.from(this.levels.values());
  }

  public getUserProgress(): UserProgress {
    return { ...this.userProgress };
  }

  public setCurrentLevel(levelId: string): boolean {
    if (this.levels.has(levelId)) {
      this.userProgress.currentLevel = levelId;
      this.saveProgress();
      return true;
    }
    return false;
  }

  public resetProgress(): void {
    this.userProgress = {
      currentLevel: "motor_basics",
      completedLevels: [],
      totalPoints: 0,
      unlockedComponents: ["motor"], // Start with motor unlocked
      badges: [],
    };

    // Reset all objectives
    this.levels.forEach((level) => {
      level.objectives.forEach((obj) => {
        obj.completed = false;
        obj.progress = 0;
      });
    });

    this.saveProgress();
  }

  /**
   * Persistence
   */
  private loadProgress(): UserProgress {
    try {
      const saved = localStorage.getItem("stemplitude_objective_progress");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error("Failed to load objective progress:", error);
    }

    return {
      currentLevel: "motor_basics",
      completedLevels: [],
      totalPoints: 0,
      unlockedComponents: ["motor"],
      badges: [],
    };
  }

  private saveProgress(): void {
    try {
      localStorage.setItem(
        "stemplitude_objective_progress",
        JSON.stringify(this.userProgress)
      );
    } catch (error) {
      console.error("Failed to save objective progress:", error);
    }
  }

  /**
   * Integration methods for game events
   */
  public onComponentPlaced(componentType: string, gameState: any): void {
    const currentLevel = this.getCurrentLevel();
    if (!currentLevel) return;

    currentLevel.objectives.forEach((obj) => {
      if (obj.type === "place" && obj.target.component === componentType) {
        this.checkObjective(obj.id, gameState);
      }
    });
  }

  public onConnectionMade(connectionType: string, gameState: any): void {
    const currentLevel = this.getCurrentLevel();
    if (!currentLevel) return;

    currentLevel.objectives.forEach((obj) => {
      if (obj.type === "connect") {
        this.checkObjective(obj.id, gameState);
      }
    });
  }

  public onSimulationStarted(gameState: any): void {
    const currentLevel = this.getCurrentLevel();
    if (!currentLevel) return;

    currentLevel.objectives.forEach((obj) => {
      if (obj.type === "simulate") {
        this.checkObjective(obj.id, gameState);
      }
    });
  }

  public onPerformanceAchieved(value: number, gameState: any): void {
    const currentLevel = this.getCurrentLevel();
    if (!currentLevel) return;

    currentLevel.objectives.forEach((obj) => {
      if (obj.type === "achieve") {
        this.checkObjective(obj.id, gameState);
      }
    });
  }

  public onProjectSaved(gameState: any): void {
    const currentLevel = this.getCurrentLevel();
    if (!currentLevel) return;

    currentLevel.objectives.forEach((obj) => {
      if (obj.type === "save") {
        this.checkObjective(obj.id, gameState);
      }
    });
  }
}
