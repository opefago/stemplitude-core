import type { SimulatorSceneObject } from "../../../labs/robotics/simulator/types";
import type { SimulatorObjectDefinition } from "./types";

export function createSceneObjectFromPalette(
  definition: SimulatorObjectDefinition,
  x: number,
  z: number,
): SimulatorSceneObject {
  const placement = definition.placement;
  const metadata: Record<string, unknown> = {
    color: placement.color,
    physics_body: placement.physicsBody,
    placement_shape: placement.shape,
    palette_object_id: definition.id,
    palette_category_id: definition.categoryId,
    beginner_safe: definition.difficulty === "beginner",
    tags: definition.tags,
  };
  if (placement.renderShape) {
    metadata.render_shape = placement.renderShape;
  }
  if (definition.runtimeMetadata) {
    Object.assign(metadata, definition.runtimeMetadata);
  }
  return {
    id: `${placement.objectType}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    type: placement.objectType,
    position: { x, y: 0, z },
    size_cm: { ...placement.sizeCm },
    rotation_deg: { y: 0 },
    metadata,
  };
}

