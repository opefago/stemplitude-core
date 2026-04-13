import type { RoboticsProjectDocument } from "./types";

export const ROBOTICS_PROJECT_SCHEMA_VERSION = 1;

export function createRoboticsProjectDocument(
  seed?: Partial<RoboticsProjectDocument>,
): RoboticsProjectDocument {
  return {
    schema_version: ROBOTICS_PROJECT_SCHEMA_VERSION,
    title: seed?.title || "Untitled Robotics Project",
    robot_vendor: seed?.robot_vendor || "vex",
    robot_type: seed?.robot_type || "vex_vr",
    mode: seed?.mode || "blocks",
    source: seed?.source || {},
    metadata: seed?.metadata || {},
  };
}

export function migrateRoboticsProjectDocument(
  doc: RoboticsProjectDocument,
): RoboticsProjectDocument {
  if (doc.schema_version === ROBOTICS_PROJECT_SCHEMA_VERSION) {
    return doc;
  }

  // Phase-0 migration hook: preserve content and normalize defaults.
  return {
    ...doc,
    schema_version: ROBOTICS_PROJECT_SCHEMA_VERSION,
    metadata: doc.metadata || {},
    source: doc.source || {},
  };
}

