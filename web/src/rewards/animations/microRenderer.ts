import type { RewardAnimationType, RewardIntensity } from "../engine/rewardQueue";

type PartyclesOptions = {
  number?: number;
  size?: number;
  speed?: number;
  color?: string[];
  angle?: [number, number];
  alpha?: [number, number];
};

function toPartyclesOptions(
  type: RewardAnimationType,
  intensity: RewardIntensity,
): PartyclesOptions {
  const number = intensity === "high" ? 32 : intensity === "medium" ? 22 : 12;
  const size = intensity === "high" ? 10 : 8;
  const speed = intensity === "high" ? 420 : intensity === "medium" ? 330 : 240;
  if (type === "stars") {
    return { number, size, speed, color: ["#ffd166", "#ffb703", "#8ecae6"] };
  }
  if (type === "rocket") {
    return { number, size, speed, color: ["#90e0ef", "#48cae4", "#ffb703"] };
  }
  if (type === "trophy") {
    return { number, size, speed, color: ["#f9c74f", "#f8961e", "#90be6d"] };
  }
  return { number, size, speed, color: ["#ff6b6b", "#4ecdc4", "#ffd166"] };
}

export async function fireMicroReward(
  element: HTMLElement,
  type: RewardAnimationType,
  intensity: RewardIntensity,
): Promise<void> {
  const mod = await import("partycles");
  const partycles = (mod as unknown as { default?: (el: HTMLElement, opts?: PartyclesOptions) => void }).default
    ?? (mod as unknown as (el: HTMLElement, opts?: PartyclesOptions) => void);
  partycles(element, toPartyclesOptions(type, intensity));
}

