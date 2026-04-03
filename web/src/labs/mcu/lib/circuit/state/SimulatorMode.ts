export type SimulatorModeType = "safe-learning" | "realistic";

export interface SimulatorModeConfig {
  mode: SimulatorModeType;
  allowPermanentDamage: boolean;
  showWarningBadges: boolean;
  showTeachingOverlays: boolean;
  showStressIndicators: boolean;
  autoProtectComponents: boolean;
  maxDamageLevel: 0 | 1 | 2 | 3;
}

const SAFE_LEARNING_CONFIG: SimulatorModeConfig = {
  mode: "safe-learning",
  allowPermanentDamage: false,
  showWarningBadges: true,
  showTeachingOverlays: true,
  showStressIndicators: true,
  autoProtectComponents: true,
  maxDamageLevel: 1,
};

const REALISTIC_CONFIG: SimulatorModeConfig = {
  mode: "realistic",
  allowPermanentDamage: true,
  showWarningBadges: true,
  showTeachingOverlays: false,
  showStressIndicators: true,
  autoProtectComponents: false,
  maxDamageLevel: 3,
};

/**
 * Manages the simulator mode (safe-learning vs realistic)
 * and provides the appropriate configuration.
 */
export class SimulatorMode {
  private currentMode: SimulatorModeType = "safe-learning";
  private config: SimulatorModeConfig = { ...SAFE_LEARNING_CONFIG };
  private listeners: Array<(config: SimulatorModeConfig) => void> = [];

  getMode(): SimulatorModeType {
    return this.currentMode;
  }

  getConfig(): Readonly<SimulatorModeConfig> {
    return this.config;
  }

  setMode(mode: SimulatorModeType): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    this.config =
      mode === "safe-learning"
        ? { ...SAFE_LEARNING_CONFIG }
        : { ...REALISTIC_CONFIG };
    this.notifyListeners();
  }

  toggle(): void {
    this.setMode(
      this.currentMode === "safe-learning" ? "realistic" : "safe-learning"
    );
  }

  isRealistic(): boolean {
    return this.currentMode === "realistic";
  }

  isSafeLearning(): boolean {
    return this.currentMode === "safe-learning";
  }

  onChange(listener: (config: SimulatorModeConfig) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.config);
    }
  }
}
