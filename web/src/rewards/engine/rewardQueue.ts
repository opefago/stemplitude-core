export type RewardAnimationType = "confetti" | "stars" | "trophy" | "rocket";
export type RewardIntensity = "low" | "medium" | "high";

export interface RewardAnimationRequest {
  type: RewardAnimationType;
  intensity: RewardIntensity;
  duration: number;
  metadata?: {
    studentId?: string;
    studentName?: string;
    rewardName?: string;
    points?: number;
    classroomId?: string;
    sessionId?: string;
    message?: string;
    bigWin?: boolean;
    theme?: "classic" | "celebration";
  };
  queuedAt: number;
}

const INTENSITY_ORDER: RewardIntensity[] = ["low", "medium", "high"];

function bumpIntensity(current: RewardIntensity): RewardIntensity {
  const index = INTENSITY_ORDER.indexOf(current);
  return INTENSITY_ORDER[Math.min(INTENSITY_ORDER.length - 1, index + 1)];
}

export class RewardQueue {
  private readonly items: RewardAnimationRequest[] = [];

  enqueue(next: RewardAnimationRequest): void {
    const last = this.items[this.items.length - 1];
    if (
      last &&
      last.type === next.type &&
      next.queuedAt - last.queuedAt <= 900
    ) {
      // Merge bursts of the same reward into one stronger animation.
      last.intensity = bumpIntensity(last.intensity);
      last.duration = Math.min(4200, Math.max(last.duration, next.duration) + 300);
      last.metadata = { ...last.metadata, ...next.metadata };
      return;
    }

    this.items.push(next);
  }

  dequeue(): RewardAnimationRequest | null {
    return this.items.shift() ?? null;
  }

  clear(): void {
    this.items.length = 0;
  }

  get size(): number {
    return this.items.length;
  }
}

