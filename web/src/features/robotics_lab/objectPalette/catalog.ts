import { OBJECT_CATEGORIES, OBJECT_CATEGORY_BY_ID } from "./categories";
import { SIMULATOR_OBJECT_BY_ID, SIMULATOR_OBJECT_LIBRARY } from "./objects";
import type { ObjectCategoryDefinition, ObjectCategoryId, SimulatorObjectDefinition } from "./types";

export interface ObjectCatalog {
  categories: ObjectCategoryDefinition[];
  objects: SimulatorObjectDefinition[];
}

export const OBJECT_CATALOG: ObjectCatalog = {
  categories: OBJECT_CATEGORIES,
  objects: SIMULATOR_OBJECT_LIBRARY,
};

export function getObjectDefinitionById(id: string): SimulatorObjectDefinition | null {
  if (!id) return null;
  return SIMULATOR_OBJECT_BY_ID.get(id) || null;
}

export function getCategoryById(id: string): ObjectCategoryDefinition | null {
  if (!id) return null;
  return OBJECT_CATEGORY_BY_ID.get(id as ObjectCategoryId) || null;
}

