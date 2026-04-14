import { OBJECT_CATEGORIES } from "./categories";
import type { ObjectCategoryId, ObjectDifficulty, SimulatorObjectDefinition } from "./types";

export interface GroupedObjectCategory {
  categoryId: ObjectCategoryId;
  items: SimulatorObjectDefinition[];
}

export type DifficultyFilterMode = "all" | ObjectDifficulty;

export function filterByDifficulty(
  objects: SimulatorObjectDefinition[],
  difficultyMode: DifficultyFilterMode,
): SimulatorObjectDefinition[] {
  if (difficultyMode === "all") return objects;
  return objects.filter((object) => object.difficulty === difficultyMode);
}

export function groupObjectsByCategory(objects: SimulatorObjectDefinition[]): GroupedObjectCategory[] {
  const grouped = new Map<ObjectCategoryId, SimulatorObjectDefinition[]>();
  for (const object of objects) {
    const bucket = grouped.get(object.categoryId) || [];
    bucket.push(object);
    grouped.set(object.categoryId, bucket);
  }
  return OBJECT_CATEGORIES.map((category) => ({
    categoryId: category.id,
    items: grouped.get(category.id) || [],
  })).filter((group) => group.items.length > 0);
}

export function createDefaultCollapsedMap(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const category of OBJECT_CATEGORIES) {
    result[category.id] = false;
  }
  return result;
}

