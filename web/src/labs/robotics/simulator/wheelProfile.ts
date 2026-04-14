import type { SimulatorRobotModel } from "./types";

export interface ResolvedWheelProfile {
  wheelRadiusCm: number;
  wheelWidthCm: number;
  trackWidthCm: number;
  wheelbaseCm: number;
  tractionLongitudinal: number;
  tractionLateral: number;
  rollingResistance: number;
  maxWheelAccelCmS2: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

export function resolveWheelProfile(robot: SimulatorRobotModel): ResolvedWheelProfile {
  const width = Math.max(6, Number(robot.width_cm) || 16);
  const length = Math.max(6, Number(robot.length_cm) || 18);
  const inferredRadius = Math.max(2.8, Math.min(width, length) * 0.2);
  const wheelRadiusCm = clamp(safeNumber(robot.wheel_radius_cm) ?? inferredRadius, 2.2, 14);
  const wheelWidthCm = clamp(safeNumber(robot.wheel_width_cm) ?? wheelRadiusCm * 0.62, 1.6, 9.5);
  const trackWidthCm = clamp(safeNumber(robot.track_width_cm) ?? width * 0.85, 8, width * 1.1);
  const wheelbaseCm = clamp(
    safeNumber(robot.wheelbase_cm) ?? safeNumber(robot.wheel_base_cm) ?? length * 0.72,
    8,
    length * 1.2,
  );
  const tractionLongitudinal = clamp(safeNumber(robot.traction_longitudinal) ?? 0.92, 0.2, 1.2);
  const tractionLateral = clamp(safeNumber(robot.traction_lateral) ?? 0.9, 0.2, 1.2);
  const rollingResistance = clamp(safeNumber(robot.rolling_resistance) ?? 4.2, 0, 20);
  const maxWheelAccelCmS2 = clamp(safeNumber(robot.max_wheel_accel_cm_s2) ?? 140, 30, 650);
  return {
    wheelRadiusCm,
    wheelWidthCm,
    trackWidthCm,
    wheelbaseCm,
    tractionLongitudinal,
    tractionLateral,
    rollingResistance,
    maxWheelAccelCmS2,
  };
}

