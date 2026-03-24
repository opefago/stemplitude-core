import type { RewardAnimationRequest, RewardAnimationType, RewardIntensity } from "./rewardQueue";
import type { RewardEngineConfig } from "./rewardEngine";

const REWARD_MIN_MS = 1000;
const REWARD_MAX_DURATION_MS = 5000;
const REWARD_LOW_MAX_MS = 3000;
const REWARD_MEDIUM_MAX_MS = 4000;
const REWARD_HIGH_MAX_MS = 5000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export interface RewardGrantedPayload {
  student_id?: string;
  student_name?: string;
  reward_type?: string;
  points?: number;
  message?: string;
  classroom_id?: string;
  session_id?: string;
  big_win?: boolean;
  reward_config?: {
    enabled?: boolean;
    theme?: "classic" | "celebration";
    max_intensity?: RewardIntensity;
    max_duration_ms?: number;
    big_win_enabled?: boolean;
    durations?: Partial<Record<RewardIntensity, number>>;
  };
}

function resolveRewardType(payload: RewardGrantedPayload): RewardAnimationType {
  const rewardType = (payload.reward_type ?? "").toLowerCase();
  if (rewardType.includes("badge")) return "confetti";
  if (rewardType.includes("callout")) return "stars";
  if (rewardType.includes("high_five")) return "rocket";
  if (rewardType.includes("points")) return "trophy";
  return "confetti";
}

function resolveIntensity(payload: RewardGrantedPayload): RewardIntensity {
  const points = Number(payload.points ?? 0);
  if (Number.isFinite(points) && points >= 25) return "high";
  if (Number.isFinite(points) && points >= 10) return "medium";
  if ((payload.reward_type ?? "").toLowerCase().includes("callout")) return "medium";
  return "low";
}

function resolveDuration(intensity: RewardIntensity): number {
  if (intensity === "high") return 3600;
  if (intensity === "medium") return 2800;
  return 2200;
}

export function mapRewardToAnimation(payload: RewardGrantedPayload): Omit<RewardAnimationRequest, "queuedAt"> {
  const type = resolveRewardType(payload);
  const intensity = resolveIntensity(payload);
  return {
    type,
    intensity,
    duration: resolveDuration(intensity),
    metadata: {
      studentId: payload.student_id,
      studentName: payload.student_name,
      rewardName: payload.reward_type,
      points: payload.points,
      classroomId: payload.classroom_id,
      sessionId: payload.session_id,
      message: payload.message,
      bigWin: Boolean(payload.big_win),
    },
  };
}

export function mapRewardConfig(
  payload: RewardGrantedPayload,
): Partial<RewardEngineConfig> | null {
  const cfg = payload.reward_config;
  if (!cfg) return null;
  const next: Partial<RewardEngineConfig> = {};
  if (typeof cfg.enabled === "boolean") next.enabled = cfg.enabled;
  if (cfg.theme === "classic" || cfg.theme === "celebration") next.theme = cfg.theme;
  if (
    cfg.max_intensity === "low" ||
    cfg.max_intensity === "medium" ||
    cfg.max_intensity === "high"
  ) {
    next.maxIntensity = cfg.max_intensity;
  }
  if (typeof cfg.max_duration_ms === "number" && Number.isFinite(cfg.max_duration_ms)) {
    next.maxDurationMs = clamp(
      cfg.max_duration_ms,
      REWARD_MIN_MS,
      REWARD_MAX_DURATION_MS,
    );
  }
  if (typeof cfg.big_win_enabled === "boolean") {
    next.allowBigWin = cfg.big_win_enabled;
  }
  if (cfg.durations && typeof cfg.durations === "object") {
    next.defaultDurations = {
      low:
        typeof cfg.durations.low === "number"
          ? clamp(cfg.durations.low, REWARD_MIN_MS, REWARD_LOW_MAX_MS)
          : 2200,
      medium:
        typeof cfg.durations.medium === "number"
          ? clamp(cfg.durations.medium, REWARD_MIN_MS, REWARD_MEDIUM_MAX_MS)
          : 2800,
      high:
        typeof cfg.durations.high === "number"
          ? clamp(cfg.durations.high, REWARD_MIN_MS, REWARD_HIGH_MAX_MS)
          : 3600,
    };
  }
  return next;
}

