import type { ISourceOptions } from "@tsparticles/engine";
import type { RewardAnimationType, RewardIntensity } from "../engine/rewardQueue";

const INTENSITY_PARTICLE_COUNT: Record<RewardIntensity, number> = {
  low: 50,
  medium: 90,
  high: 140,
};

function basePreset(intensity: RewardIntensity): ISourceOptions {
  return {
    fullScreen: { enable: false },
    background: { color: { value: "transparent" } },
    detectRetina: true,
    fpsLimit: 60,
    particles: {
      number: { value: INTENSITY_PARTICLE_COUNT[intensity] },
      move: {
        enable: true,
        speed: intensity === "high" ? 8 : intensity === "medium" ? 6 : 4,
        direction: "bottom",
        gravity: { enable: true, acceleration: 16 },
        outModes: { default: "destroy", top: "none" },
      },
      opacity: { value: { min: 0.35, max: 0.9 } },
      size: { value: { min: 3, max: intensity === "high" ? 10 : 8 } },
    },
    emitters: {
      life: { count: 1, duration: 0.18 },
      rate: { quantity: Math.floor(INTENSITY_PARTICLE_COUNT[intensity] / 2), delay: 0.02 },
      position: { x: 50, y: 0 },
      size: { width: 100, height: 0 },
    },
  };
}

export function getTsParticlesPreset(
  type: RewardAnimationType,
  intensity: RewardIntensity,
): ISourceOptions {
  const base = basePreset(intensity);
  if (type === "stars") {
    base.particles = {
      ...base.particles,
      shape: { type: "star" },
      color: { value: ["#ffd166", "#ffb703", "#8ecae6"] },
      rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 12 } },
    };
    return base;
  }
  if (type === "trophy") {
    base.particles = {
      ...base.particles,
      shape: { type: "circle" },
      color: { value: ["#f9c74f", "#f8961e", "#90be6d"] },
    };
    return base;
  }
  if (type === "rocket") {
    base.particles = {
      ...base.particles,
      shape: { type: "triangle" },
      color: { value: ["#90e0ef", "#48cae4", "#ffb703"] },
      move: {
        ...base.particles?.move,
        speed: intensity === "high" ? 10 : 8,
      },
    };
    return base;
  }
  base.particles = {
    ...base.particles,
    shape: { type: ["square", "circle"] },
    color: { value: ["#ff6b6b", "#4ecdc4", "#ffd166", "#8ecae6", "#c77dff"] },
      tilt: { enable: true, value: { min: 0, max: 360 } },
  };
  return base;
}

