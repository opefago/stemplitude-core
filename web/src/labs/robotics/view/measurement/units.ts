import type { DistanceUnit } from "./types";

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatDistanceCm(valueCm: number, unit: DistanceUnit, gridCellCm = 20): string {
  if (!Number.isFinite(valueCm)) return "0 cm";
  if (unit === "m") return `${round(valueCm / 100, 2)} m`;
  if (unit === "in") return `${round(valueCm / 2.54, 1)} in`;
  if (unit === "tiles") return `${round(valueCm / Math.max(1, gridCellCm), 2)} tiles`;
  return `${round(valueCm, valueCm < 10 ? 2 : 1)} cm`;
}

export function formatTurnLabel(angleDeg: number): string {
  const rounded = Math.round(angleDeg);
  if (rounded > 0) return `+${rounded}\u00b0`;
  return `${rounded}\u00b0`;
}

