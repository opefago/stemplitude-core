import type { SimulatorSceneObject } from "../../../labs/robotics/simulator/types";
import type { SimulatorObjectDefinition } from "./types";

function resolveDefaultContactMode(objectType: string): "solid" | "sensor_only" | "pass_through" {
  if (objectType === "obstacle" || objectType === "wall") return "solid";
  return "pass_through";
}

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
    contact_mode: resolveDefaultContactMode(placement.objectType),
    surface_type: "default",
  };
  if (placement.renderShape) {
    metadata.render_shape = placement.renderShape;
  }
  if (definition.runtimeMetadata) {
    Object.assign(metadata, definition.runtimeMetadata);
  }
  if (definition.physicsBehavior.friction !== undefined) {
    metadata.friction_coefficient = definition.physicsBehavior.friction;
  }
  if (definition.physicsBehavior.restitution !== undefined) {
    metadata.restitution_coefficient = definition.physicsBehavior.restitution;
    // Keep existing simulator compatibility field while migrating.
    metadata.restitution = definition.physicsBehavior.restitution;
  }
  if (definition.physicsBehavior.damping !== undefined) {
    metadata.linear_damping = definition.physicsBehavior.damping;
  }
  if (definition.contactBehavior) {
    if (definition.contactBehavior.contactMode) metadata.contact_mode = definition.contactBehavior.contactMode;
    if (definition.contactBehavior.surfaceType) metadata.surface_type = definition.contactBehavior.surfaceType;
    if (definition.contactBehavior.frictionCoefficient !== undefined) {
      metadata.friction_coefficient = definition.contactBehavior.frictionCoefficient;
    }
    if (definition.contactBehavior.restitutionCoefficient !== undefined) {
      metadata.restitution_coefficient = definition.contactBehavior.restitutionCoefficient;
      metadata.restitution = definition.contactBehavior.restitutionCoefficient;
    }
    if (definition.contactBehavior.slopeDeg !== undefined) metadata.slope_deg = definition.contactBehavior.slopeDeg;
    if (definition.contactBehavior.maxClimbSlopeDeg !== undefined) {
      metadata.max_climb_slope_deg = definition.contactBehavior.maxClimbSlopeDeg;
    }
    if (definition.contactBehavior.isRampEntryBlocking !== undefined) {
      metadata.is_ramp_entry_blocking = definition.contactBehavior.isRampEntryBlocking;
    }
    if (definition.contactBehavior.rampEntrySide) {
      metadata.ramp_entry_side = definition.contactBehavior.rampEntrySide;
    }
    if (definition.contactBehavior.rampSideBlocking !== undefined) {
      metadata.ramp_side_blocking = definition.contactBehavior.rampSideBlocking;
    }
    if (definition.contactBehavior.rampDescentAssist !== undefined) {
      metadata.ramp_descent_assist = definition.contactBehavior.rampDescentAssist;
    }
    if (definition.contactBehavior.pushResistance !== undefined) {
      metadata.push_resistance = definition.contactBehavior.pushResistance;
    }
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

