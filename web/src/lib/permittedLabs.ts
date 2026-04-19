/** Display names stored in classroom `schedule.permitted_labs` and curriculum defaults. */
export const PERMITTED_LAB_OPTIONS = [
  "Circuit Maker",
  "Micro Maker",
  "Robo Maker",
  "Python Game Maker",
  "Game Maker",
  "Design Maker",
] as const;

export type PermittedLabLabel = (typeof PERMITTED_LAB_OPTIONS)[number];

const OPTION_SET = new Set<string>(PERMITTED_LAB_OPTIONS);

/** Keep only values that match known launcher labels (drops unknown / stale strings). */
export function filterToPermittedLabOptions(
  values: string[] | null | undefined,
): string[] {
  if (!values?.length) return [];
  return values.filter((v) => OPTION_SET.has(v));
}
