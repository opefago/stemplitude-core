/**
 * Schematic wiring model — geometry & editor topology (electrical nets stay in solver).
 */

import type { Point } from "../../types/ComponentTypes";

export type SchematicRect = { x: number; y: number; w: number; h: number };

export type PinId = string;

export type PinExitConstraint = {
  allow: Array<"N" | "E" | "S" | "W">;
  prefer?: Array<"N" | "E" | "S" | "W">;
};

export type SchematicPin = {
  id: PinId;
  componentId: string;
  nodeId: string;
  world: Point;
  exit: PinExitConstraint;
};

export type JunctionId = string;

export type SchematicJunction = {
  id: JunctionId;
  world: Point;
  incidentWireIds: ReadonlyArray<string>;
};

export type WireEndpointRef =
  | { kind: "pin"; pinId: PinId }
  | { kind: "junction"; junctionId: JunctionId };

export type WireId = string;
export type SegmentId = string;

export type SchematicWireSegment = {
  id: SegmentId;
  wireId: WireId;
  start: Point;
  end: Point;
  axis: "H" | "V";
  index: number;
};

export type SchematicWirePath = {
  wireId: WireId;
  netId: string;
  endpoints: [WireEndpointRef, WireEndpointRef];
  segments: SchematicWireSegment[];
  lockedWaypointIds: Set<string>;
  revision: number;
};

export type SchematicNet = {
  netId: string;
  pins: Set<PinId>;
  junctions: Set<JunctionId>;
  wires: Set<WireId>;
};

export type RoutingObstacle = {
  id: string;
  rect: SchematicRect;
  padding: number;
};

export type ManualRouteConstraint = {
  waypointId: string;
  world: Point;
  lock: "position" | "direction" | "both";
};

export type WireInteractionStateName =
  | "idle"
  | "draggingFromPin"
  | "draggingFromWire"
  | "previewingRoute"
  | "reroutingEndpoint"
  | "movingWholeSegment"
  | "movingCorner"
  | "movingEndpoint"
  | "movingJunction"
  | "insertingWaypoint"
  | "deletingWaypoint"
  | "componentDragReroute";

export type HoverTarget =
  | { kind: "pin"; pinId: PinId; snap: Point }
  | { kind: "junction"; junctionId: JunctionId; snap: Point }
  | {
      kind: "segment";
      wireId: WireId;
      segmentId: SegmentId;
      t: number;
      snap: Point;
    }
  | { kind: "corner"; wireId: WireId; vertexIndex: number; snap: Point }
  | { kind: "empty"; world: Point };

export type SnapCandidate = {
  target: HoverTarget;
  priority: number;
  distPx: number;
};

export type WireEditSession = {
  sessionId: string;
  state: WireInteractionStateName;
  undoSnapshots: unknown[];
};

export type RouteCacheKey = string;
