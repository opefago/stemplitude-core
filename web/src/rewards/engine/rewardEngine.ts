import { RewardQueue, type RewardAnimationRequest, type RewardAnimationType, type RewardIntensity } from "./rewardQueue";

export interface RewardEngineConfig {
  enabled: boolean;
  theme: "classic" | "celebration";
  maxIntensity: RewardIntensity;
  allowBigWin: boolean;
  maxDurationMs: number;
  defaultDurations: Record<RewardIntensity, number>;
}

export interface RewardTriggerInput {
  type: RewardAnimationType;
  intensity: RewardIntensity;
  duration?: number;
  metadata?: RewardAnimationRequest["metadata"];
}

export interface ActiveRewardAnimation extends RewardAnimationRequest {
  id: string;
}

type Listener = (animation: ActiveRewardAnimation | null) => void;

const DEFAULT_CONFIG: RewardEngineConfig = {
  enabled: true,
  theme: "classic",
  maxIntensity: "high",
  allowBigWin: true,
  maxDurationMs: 4200,
  defaultDurations: {
    low: 2200,
    medium: 2800,
    high: 3600,
  },
};

function clampIntensity(
  value: RewardIntensity,
  cap: RewardIntensity,
): RewardIntensity {
  if (cap === "high") return value;
  if (cap === "medium") return value === "high" ? "medium" : value;
  return "low";
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `reward-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export class RewardEngine {
  private readonly queue = new RewardQueue();

  private readonly listeners = new Set<Listener>();

  private active: ActiveRewardAnimation | null = null;

  private config: RewardEngineConfig = { ...DEFAULT_CONFIG };

  trigger(input: RewardTriggerInput): void {
    if (!this.config.enabled) return;
    const intensity = clampIntensity(input.intensity, this.config.maxIntensity);
    const bigWin = Boolean(input.metadata?.bigWin) && this.config.allowBigWin;
    const duration = Math.min(
      this.config.maxDurationMs,
      Math.max(
        1100,
        Math.floor(
          (input.duration ?? this.config.defaultDurations[intensity]) + (bigWin ? 500 : 0),
        ),
      ),
    );
    this.queue.enqueue({
      type: input.type,
      intensity,
      duration,
      metadata: { ...input.metadata, bigWin, theme: this.config.theme },
      queuedAt: Date.now(),
    });
    this.advance();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.active);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getActive(): ActiveRewardAnimation | null {
    return this.active;
  }

  getConfig(): RewardEngineConfig {
    return this.config;
  }

  complete(id: string): void {
    if (!this.active || this.active.id !== id) return;
    this.active = null;
    this.emit();
    this.advance();
  }

  setConfig(next: Partial<RewardEngineConfig>): void {
    this.config = {
      ...this.config,
      ...next,
      defaultDurations: {
        ...this.config.defaultDurations,
        ...(next.defaultDurations ?? {}),
      },
    };
  }

  clear(): void {
    this.queue.clear();
    this.active = null;
    this.emit();
  }

  private advance(): void {
    if (this.active) return;
    const next = this.queue.dequeue();
    if (!next) return;
    this.active = { id: randomId(), ...next };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.active);
    }
  }
}

export const rewardEngine = new RewardEngine();

