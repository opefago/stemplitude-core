import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Html } from "@react-three/drei";
import { EffectComposer, SSAO, Bloom } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useCameraController } from "../../labs/robotics/view/useCameraController";
import { buildPerspectivePose } from "../../labs/robotics/view/cameraPresets";
import { overlayOpacityForMode } from "../../labs/robotics/view/overlayManager";
import { toonGradientMap } from "../../lib/three/cartoonStyle";
import { DistanceRayOverlay } from "../../labs/robotics/view/overlays/DistanceRayOverlay";
import { HeadingOverlay } from "../../labs/robotics/view/overlays/HeadingOverlay";
import { LineSensorOverlay } from "../../labs/robotics/view/overlays/LineSensorOverlay";
import { MeasurementOverlay } from "../../labs/robotics/view/overlays/MeasurementOverlay";
import { PathTrailOverlay } from "../../labs/robotics/view/overlays/PathTrailOverlay";
import type { CameraPose, CameraState, OverlayState, RobotPoseForCamera, WorldSizeCm } from "../../labs/robotics/view/types";
import type { RoboticsCameraController } from "../../labs/robotics/view/cameraController";
import type { SimulatorRobotModel } from "../../labs/robotics/simulator/types";
import { resolveWheelProfile } from "../../labs/robotics/simulator/wheelProfile";
import { GRID_CELL_CM } from "./workspaceDefaults";

type PointerEvent3D = any;
type ViteLikeImportMeta = ImportMeta & { env?: { DEV?: boolean } };
const IS_DEV_MODE = Boolean((import.meta as ViteLikeImportMeta).env?.DEV);

interface Position2D {
  x?: number;
  y?: number;
  z?: number;
}

interface Rotation3D {
  y?: number;
}

interface Size3D {
  x?: number;
  y?: number;
  z?: number;
}

interface WorldObjectData {
  id: string;
  type: string;
  position?: Position2D;
  rotation_deg?: Rotation3D;
  size_cm?: Size3D;
  metadata?: {
    color?: string;
    hidden?: boolean;
    [key: string]: unknown;
  };
}

interface WorldSceneData {
  objects?: WorldObjectData[];
}

interface SimulatorPose {
  position?: Position2D;
  heading_deg?: number;
}

interface SensorValues {
  distance?: number | null;
  line?: boolean;
  [key: string]: unknown;
}

interface ThreeSimViewportProps {
  worldScene?: WorldSceneData;
  pose?: SimulatorPose;
  robotModel?: SimulatorRobotModel | null;
  sensorValues?: SensorValues;
  cameraState?: CameraState;
  overlayState?: OverlayState;
  pathTrailResetToken?: number;
  measurementResetToken?: number;
  runtimeState?: string;
  cameraResetToken?: number;
  cameraFocusToken?: number;
  editable?: boolean;
  worldSizeCm?: WorldSizeCm;
  onObjectMove?: (objectId: string, x: number, z: number) => void;
  onObjectDragStart?: (objectId: string) => void;
  onObjectDragEnd?: (objectId: string) => void;
  onObjectRotate?: (objectId: string, yawDeg: number) => void;
  onObjectRotateEnd?: (objectId: string) => void;
  onObjectSelect?: (objectId: string) => void;
  selectedObjectId?: string | null;
  robotStartPose?: SimulatorPose;
  onRobotStartMove?: (x: number, z: number) => void;
  onRobotStartMoveEnd?: (x: number, z: number) => void;
  backgroundColor?: string;
  ghostObject?: WorldObjectData | null;
  onProjectClientToWorkplaneReady?: ((project: (clientX: number, clientY: number) => { x: number; z: number } | null) => void) | null;
  onWorkplaneClick?: ((x: number, z: number) => void) | null;
  snapEnabled?: boolean;
}

interface WorldObjectProps {
  object: WorldObjectData;
  editable?: boolean;
  selected?: boolean;
  ghost?: boolean;
  onPointerDown?: (event: PointerEvent3D, object: WorldObjectData) => void;
  onPointerMove?: (event: PointerEvent3D, object: WorldObjectData) => void;
  onPointerUp?: (event: PointerEvent3D, object: WorldObjectData) => void;
}

interface EditableObjectsLayerProps {
  objects: WorldObjectData[];
  selectedObjectId?: string | null;
  worldSizeCm: WorldSizeCm;
  snapEnabled?: boolean;
  onObjectMove?: (objectId: string, x: number, z: number) => void;
  onObjectDragStart?: (objectId: string) => void;
  onObjectDragEnd?: (objectId: string) => void;
  onObjectRotate?: (objectId: string, yawDeg: number) => void;
  onObjectRotateEnd?: (objectId: string) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onObjectSelect?: (objectId: string) => void;
}

interface EditableRobotStartProps {
  robotStartPose: SimulatorPose;
  worldSizeCm: WorldSizeCm;
  onDragStateChange?: (isDragging: boolean) => void;
  onRobotStartMove?: (x: number, z: number) => void;
  onRobotStartMoveEnd?: (x: number, z: number) => void;
}

interface SceneCameraRigProps {
  controller: RoboticsCameraController;
  cameraState: CameraState;
  worldSize: WorldSizeCm;
  robotPose: RobotPoseForCamera;
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
  cameraResetToken: number;
  cameraFocusToken: number;
  isDraggingObject: boolean;
  onDebugPose?: (pose: CameraPose) => void;
}

interface PendingDrag {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetZ: number;
  startHitX: number;
  startHitZ: number;
}

interface DragState {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetZ: number;
}

const DRAG_THRESHOLD_CM = 3;

import { OverlayRenderPass, useDragDistanceOverlay } from "../../hooks/useDragDistanceOverlay";

interface RobotDragState {
  pointerId: number;
  offsetX: number;
  offsetZ: number;
}

interface RenderedRobotState {
  x: number;
  z: number;
  heading_deg: number;
  elevation_cm: number;
  pitch_deg: number;
  roll_deg: number;
}

declare global {
  interface Window {
    __roboticsCameraDebug?: unknown;
    getRoboticsCameraDebug?: () => string;
    copyRoboticsCameraDebug?: () => Promise<string>;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const SNAP_WORLD_EDGE = 14;
const SNAP_OBJECT_EDGE = 10;
const SNAP_GRID = 8;

function computeSnappedPosition(
  rawCenter: number,
  halfSize: number,
  worldMin: number,
  worldMax: number,
  otherEdges: number[],
  gridStep: number,
): number {
  const objMin = rawCenter - halfSize;
  const objMax = rawCenter + halfSize;

  // Priority 1 — world boundary (object edge flush to world edge)
  if (Math.abs(objMin - worldMin) <= SNAP_WORLD_EDGE) return worldMin + halfSize;
  if (Math.abs(objMax - worldMax) <= SNAP_WORLD_EDGE) return worldMax - halfSize;

  // Priority 2 — object-to-object edge alignment
  let bestObj: number | null = null;
  let bestObjDist = SNAP_OBJECT_EDGE + 1;
  for (const edge of otherEdges) {
    const dMin = Math.abs(objMin - edge);
    const dMax = Math.abs(objMax - edge);
    if (dMin <= SNAP_OBJECT_EDGE && dMin < bestObjDist) {
      bestObj = edge + halfSize;
      bestObjDist = dMin;
    }
    if (dMax <= SNAP_OBJECT_EDGE && dMax < bestObjDist) {
      bestObj = edge - halfSize;
      bestObjDist = dMax;
    }
  }
  if (bestObj !== null) return clamp(bestObj, worldMin + halfSize, worldMax - halfSize);

  // Priority 3 — grid snapping (edge-align then center-align, pick closest)
  let bestGrid: number | null = null;
  let bestGridDist = SNAP_GRID + 1;

  const nearGridMin = Math.round(objMin / gridStep) * gridStep;
  const dGridMin = Math.abs(objMin - nearGridMin);
  if (dGridMin < bestGridDist) { bestGrid = nearGridMin + halfSize; bestGridDist = dGridMin; }

  const nearGridMax = Math.round(objMax / gridStep) * gridStep;
  const dGridMax = Math.abs(objMax - nearGridMax);
  if (dGridMax < bestGridDist) { bestGrid = nearGridMax - halfSize; bestGridDist = dGridMax; }

  const gridHalf = gridStep / 2;
  const nearCenter = Math.round((rawCenter - gridHalf) / gridStep) * gridStep + gridHalf;
  const dCenter = Math.abs(rawCenter - nearCenter);
  if (dCenter < bestGridDist) { bestGrid = nearCenter; bestGridDist = dCenter; }

  if (bestGrid !== null) return clamp(bestGrid, worldMin + halfSize, worldMax - halfSize);

  return clamp(rawCenter, worldMin + halfSize, worldMax - halfSize);
}

function collectOtherEdges(objects: WorldObjectData[], dragId: string, axis: "x" | "z"): number[] {
  const edges: number[] = [];
  for (const obj of objects) {
    if (obj.id === dragId) continue;
    const pos = axis === "x" ? (obj.position?.x ?? 0) : (obj.position?.z ?? 0);
    const sizeX = Math.max(4, obj.size_cm?.x ?? 20);
    const sizeZ = Math.max(4, obj.size_cm?.z ?? 20);
    const yawRad = ((Number(obj.rotation_deg?.y) || 0) * Math.PI) / 180;
    const cosA = Math.abs(Math.cos(yawRad));
    const sinA = Math.abs(Math.sin(yawRad));
    const halfExtent = axis === "x"
      ? (sizeX * cosA + sizeZ * sinA) / 2
      : (sizeX * sinA + sizeZ * cosA) / 2;
    edges.push(pos - halfExtent, pos + halfExtent);
  }
  return edges;
}

function buildGridLines(width: number, depth: number, step: number, y: number): THREE.BufferGeometry {
  const points: number[] = [];
  for (let x = 0; x <= width; x += step) {
    points.push(x, y, 0, x, y, depth);
  }
  for (let z = 0; z <= depth; z += step) {
    points.push(0, y, z, width, y, z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geo;
}

function WorkspaceGrid({ width, depth }: { width: number; depth: number }) {
  const cellGeo = useMemo(() => buildGridLines(width, depth, 20, 0.02), [width, depth]);
  const sectionGeo = useMemo(() => buildGridLines(width, depth, 100, 0.02), [width, depth]);

  return (
    <group>
      <lineSegments geometry={cellGeo}>
        <lineBasicMaterial color="#5f7f9f" transparent opacity={0.35} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </lineSegments>
      <lineSegments geometry={sectionGeo}>
        <lineBasicMaterial color="#3f6488" transparent opacity={0.55} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </lineSegments>
    </group>
  );
}

function WorldObject({
  object,
  editable = false,
  selected = false,
  ghost = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: WorldObjectProps) {
  const OBJECT_SCALE = 1;
  const x = object.position?.x ?? 0;
  const z = object.position?.z ?? 0;
  const sx = Math.max(4, (object.size_cm?.x ?? 20) * OBJECT_SCALE);
  const isLineTrack = object.type === "line_segment";
  const syRaw = isLineTrack
    ? Math.max(0.4, (object.size_cm?.y ?? 1) * OBJECT_SCALE)
    : Math.max(2, (object.size_cm?.y ?? 20) * OBJECT_SCALE);
  const sz = Math.max(4, (object.size_cm?.z ?? 20) * OBJECT_SCALE);
  const isZone = object.type === "target_zone" || object.type === "color_zone";
  const yawDeg = Number(object?.rotation_deg?.y) || 0;
  const yawRad = (yawDeg * Math.PI) / 180;
  const rollXRad = ((Number(object?.metadata?.roll_x_deg) || 0) * Math.PI) / 180;
  const rollZRad = ((Number(object?.metadata?.roll_z_deg) || 0) * Math.PI) / 180;
  const sy = isLineTrack ? Math.min(1.2, syRaw) : isZone ? Math.min(8, syRaw) : syRaw;
  const y = (Number(object.position?.y) || 0) + sy / 2;
  const renderShape = typeof object?.metadata?.render_shape === "string" ? object.metadata.render_shape : "default";
  const placementShape = typeof object?.metadata?.placement_shape === "string" ? object.metadata.placement_shape : null;
  const metadataColor =
    typeof object?.metadata?.color === "string" && object.metadata.color.trim() ? object.metadata.color : null;
  const color =
    metadataColor ||
    (object.type === "obstacle"
      ? "#ef4444"
      : object.type === "wall"
        ? "#64748b"
        : object.type === "target_zone"
          ? "#16a34a"
          : object.type === "color_zone"
            ? "#f59e0b"
            : "#3b82f6");

  const toonMaterialProps = {
    color: ghost ? "#60a5fa" : color,
    gradientMap: toonGradientMap,
    transparent: ghost,
    opacity: ghost ? 0.45 : 1,
  };

  const commonProps = editable
    ? {
        onPointerDown: (event: PointerEvent3D) => onPointerDown?.(event, object),
        onPointerMove: (event: PointerEvent3D) => onPointerMove?.(event, object),
        onPointerUp: (event: PointerEvent3D) => onPointerUp?.(event, object),
      }
    : {};

  const rampGeometry = useMemo(() => {
    if (renderShape !== "ramp") return null;
    const shape = new THREE.Shape();
    shape.moveTo(-sx / 2, -sy / 2);
    shape.lineTo(sx / 2, -sy / 2);
    shape.lineTo(-sx / 2, sy / 2);
    shape.lineTo(-sx / 2, -sy / 2);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: sz,
      bevelEnabled: false,
      steps: 1,
    });
    geometry.translate(0, 0, -sz / 2);
    geometry.computeVertexNormals();
    return geometry;
  }, [renderShape, sx, sy, sz]);

  if (renderShape === "waypoint_marker") {
    const baseRadius = Math.max(6, Math.min(sx, sz) / 2);
    const poleHeight = Math.max(10, sy * 1.8);
    return (
      <group position={[x, 0, z]} rotation={[0, yawRad, 0]} {...commonProps}>
        <mesh position={[0, Math.max(0.8, sy * 0.35), 0]}>
          <cylinderGeometry args={[baseRadius, baseRadius, Math.max(1, sy * 0.7), 24]} />
          <meshToonMaterial {...toonMaterialProps} />
        </mesh>
        <mesh position={[0, Math.max(1.2, sy * 0.7) + poleHeight / 2, 0]}>
          <cylinderGeometry args={[Math.max(1.8, baseRadius * 0.22), Math.max(1.8, baseRadius * 0.22), poleHeight, 16]} />
          <meshToonMaterial color={ghost ? "#67e8f9" : "#e2e8f0"} gradientMap={toonGradientMap} transparent={ghost} opacity={ghost ? 0.45 : 1} />
        </mesh>
        <mesh position={[0, Math.max(1.2, sy * 0.7) + poleHeight + Math.max(2.8, baseRadius * 0.28), 0]}>
          <sphereGeometry args={[Math.max(2.8, baseRadius * 0.28), 16, 16]} />
          <meshToonMaterial {...toonMaterialProps} />
        </mesh>
        {selected ? (
          <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[baseRadius + 2, baseRadius + 4, 48]} />
            <meshBasicMaterial color="#00d4ff" transparent opacity={0.5} side={THREE.DoubleSide} depthTest={false} />
          </mesh>
        ) : null}
      </group>
    );
  }

  if (renderShape === "ramp" && rampGeometry) {
    return (
      <group position={[x, y, z]} rotation={[0, yawRad, 0]} {...commonProps}>
        <mesh geometry={rampGeometry}>
          <meshToonMaterial {...toonMaterialProps} />
        </mesh>
        <mesh geometry={rampGeometry} scale={[1.02, 1.02, 1.02]} raycast={() => null}>
          <meshBasicMaterial color="#0d0d0d" side={THREE.BackSide} />
        </mesh>
        {selected ? (
          <mesh geometry={rampGeometry} scale={[1.06, 1.06, 1.06]} raycast={() => null}>
            <meshBasicMaterial color="#00d4ff" transparent opacity={0.35} side={THREE.BackSide} depthTest={false} />
          </mesh>
        ) : null}
      </group>
    );
  }

  if (isLineTrack || renderShape === "flat_rect") {
    return (
      <group position={[x, y, z]} rotation={[0, yawRad, 0]} {...commonProps}>
        <mesh>
          <boxGeometry args={[sx, sy, sz]} />
          <meshToonMaterial {...toonMaterialProps} />
        </mesh>
        <mesh scale={[1.02, 1.12, 1.02]} raycast={() => null}>
          <boxGeometry args={[sx, sy, sz]} />
          <meshBasicMaterial color="#0d0d0d" side={THREE.BackSide} />
        </mesh>
        {selected ? (
          <mesh scale={[1.06, 1.2, 1.06]} raycast={() => null}>
            <boxGeometry args={[sx, sy, sz]} />
            <meshBasicMaterial color="#00d4ff" transparent opacity={0.35} side={THREE.BackSide} depthTest={false} />
          </mesh>
        ) : null}
      </group>
    );
  }

  if (renderShape === "ring") {
    const ringRadius = Math.max(4, Math.min(sx, sz) * 0.36);
    const tubeRadius = Math.max(1.2, sy * 0.22);
    return (
      <group position={[x, y, z]} rotation={[Math.PI / 2, 0, yawRad]} {...commonProps}>
        <mesh>
          <torusGeometry args={[ringRadius, tubeRadius, 18, 36]} />
          <meshToonMaterial {...toonMaterialProps} />
        </mesh>
        <mesh scale={[1.03, 1.03, 1.03]} raycast={() => null}>
          <torusGeometry args={[ringRadius, tubeRadius, 18, 36]} />
          <meshBasicMaterial color="#0d0d0d" side={THREE.BackSide} />
        </mesh>
        {selected ? (
          <mesh scale={[1.08, 1.08, 1.08]} raycast={() => null}>
            <torusGeometry args={[ringRadius, tubeRadius, 18, 36]} />
            <meshBasicMaterial color="#00d4ff" transparent opacity={0.35} side={THREE.BackSide} depthTest={false} />
          </mesh>
        ) : null}
      </group>
    );
  }

  if (object.type === "obstacle") {
    if (renderShape === "sphere") {
      const radius = Math.max(5, Math.min(sx, sy, sz) / 2);
      return (
        <group position={[x, y, z]} rotation={[0, yawRad, 0]} {...commonProps}>
          <mesh rotation={[rollXRad, 0, rollZRad]}>
            <sphereGeometry args={[radius, 24, 24]} />
            <meshToonMaterial {...toonMaterialProps} />
          </mesh>
          <mesh rotation={[rollXRad, 0, rollZRad]} scale={[1.02, 1.02, 1.02]} raycast={() => null}>
            <sphereGeometry args={[radius, 24, 24]} />
            <meshBasicMaterial color="#0d0d0d" side={THREE.BackSide} />
          </mesh>
          {selected ? (
            <mesh rotation={[rollXRad, 0, rollZRad]} scale={[1.06, 1.06, 1.06]} raycast={() => null}>
              <sphereGeometry args={[radius, 24, 24]} />
              <meshBasicMaterial color="#00d4ff" transparent opacity={0.35} side={THREE.BackSide} depthTest={false} />
            </mesh>
          ) : null}
        </group>
      );
    }
    if (renderShape === "cylinder" || renderShape === "disc") {
      const radius = Math.max(6, Math.min(sx, sz) / 2);
      return (
        <group position={[x, y, z]} rotation={[0, yawRad, 0]} {...commonProps}>
          <mesh>
            <cylinderGeometry args={[radius, radius * 0.94, Math.max(1.6, sy), 24]} />
            <meshToonMaterial {...toonMaterialProps} />
          </mesh>
          <mesh scale={[1.02, 1.02, 1.02]} raycast={() => null}>
            <cylinderGeometry args={[radius, radius * 0.94, Math.max(1.6, sy), 24]} />
            <meshBasicMaterial color="#0d0d0d" side={THREE.BackSide} />
          </mesh>
          {selected ? (
            <mesh scale={[1.06, 1.06, 1.06]} raycast={() => null}>
              <cylinderGeometry args={[radius, radius * 0.94, Math.max(1.6, sy), 24]} />
              <meshBasicMaterial color="#00d4ff" transparent opacity={0.35} side={THREE.BackSide} depthTest={false} />
            </mesh>
          ) : null}
        </group>
      );
    }
  }

  if (isZone) {
    const zoneAsRect = placementShape === "flat_zone" || renderShape === "flat_rect" || renderShape === "box";
    if (zoneAsRect) {
      return (
        <group position={[x, y, z]} rotation={[0, yawRad, 0]} {...commonProps}>
          <mesh>
            <boxGeometry args={[sx, sy, sz]} />
            <meshToonMaterial {...toonMaterialProps} transparent opacity={0.82} />
          </mesh>
          <mesh scale={[1.02, 1.08, 1.02]} raycast={() => null}>
            <boxGeometry args={[sx, sy, sz]} />
            <meshBasicMaterial color="#0d0d0d" side={THREE.BackSide} />
          </mesh>
          <mesh position={[0, sy / 2 + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[Math.min(sx, sz) * 0.18, Math.min(sx, sz) * 0.34, 36]} />
            <meshBasicMaterial color="#f8fafc" transparent opacity={0.7} />
          </mesh>
          {selected ? (
            <mesh scale={[1.06, 1.1, 1.06]} raycast={() => null}>
              <boxGeometry args={[sx, sy, sz]} />
              <meshBasicMaterial color="#00d4ff" transparent opacity={0.35} side={THREE.BackSide} depthTest={false} />
            </mesh>
          ) : null}
        </group>
      );
    }
    return (
      <group position={[x, y, z]} rotation={[0, yawRad, 0]} {...commonProps}>
        <mesh>
          <cylinderGeometry args={[Math.max(sx, sz) / 2, Math.max(sx, sz) / 2, sy, 28]} />
          <meshToonMaterial {...toonMaterialProps} transparent opacity={0.82} />
        </mesh>
        <mesh scale={[1.015, 1.015, 1.015]} raycast={() => null}>
          <cylinderGeometry args={[Math.max(sx, sz) / 2, Math.max(sx, sz) / 2, sy, 28]} />
          <meshBasicMaterial color="#0d0d0d" side={THREE.BackSide} />
        </mesh>
        {selected ? (
          <mesh scale={[1.06, 1.06, 1.06]} raycast={() => null}>
            <cylinderGeometry args={[Math.max(sx, sz) / 2, Math.max(sx, sz) / 2, sy, 28]} />
            <meshBasicMaterial color="#00d4ff" transparent opacity={0.35} side={THREE.BackSide} depthTest={false} />
          </mesh>
        ) : null}
      </group>
    );
  }

  const rotationGizmoRadius = Math.max(sx, sz) * 0.65;

  return (
    <group position={[x, y, z]} rotation={[0, yawRad, 0]} {...commonProps}>
      <mesh castShadow>
        <boxGeometry args={[sx, sy, sz]} />
        <meshToonMaterial {...toonMaterialProps} />
      </mesh>
      <mesh scale={[1.02, 1.02, 1.02]} raycast={() => null}>
        <boxGeometry args={[sx, sy, sz]} />
        <meshBasicMaterial color="#0d0d0d" side={THREE.BackSide} />
      </mesh>
      {selected ? (
        <>
          <mesh scale={[1.06, 1.06, 1.06]} raycast={() => null}>
            <boxGeometry args={[sx, sy, sz]} />
            <meshBasicMaterial color="#00d4ff" transparent opacity={0.35} side={THREE.BackSide} depthTest={false} />
          </mesh>
          <mesh position={[0, -sy / 2 + 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[rotationGizmoRadius - 0.8, rotationGizmoRadius + 0.8, 64]} />
            <meshBasicMaterial color="#00d4ff" transparent opacity={0.5} side={THREE.DoubleSide} depthTest={false} />
          </mesh>
        </>
      ) : null}
    </group>
  );
}

const ROTATION_HANDLE_COLOR = "#22c55e";
const ROTATION_SNAP_DEG = 15;
const HANDLE_BAND = 3.5;

interface RotationHandleProps {
  object: WorldObjectData;
  onRotate: (objectId: string, yawDeg: number) => void;
  onRotateEnd: (objectId: string) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}

function RotationHandle({ object, onRotate, onRotateEnd, onDragStateChange }: RotationHandleProps) {
  const { camera, gl } = useThree();
  const [hovered, setHovered] = useState(false);
  const [angleDelta, setAngleDelta] = useState<number | null>(null);
  const dragRef = useRef<{
    screenCx: number;
    screenCy: number;
    sign: number;
    startYawDeg: number;
    prevAngle: number;
    accumDelta: number;
  } | null>(null);

  const sx = Math.max(4, object.size_cm?.x ?? 20);
  const sz = Math.max(4, object.size_cm?.z ?? 20);
  const sy = Math.max(2, object.size_cm?.y ?? 20);
  const objX = object.position?.x ?? 0;
  const objZ = object.position?.z ?? 0;
  const yawDeg = Number(object.rotation_deg?.y) || 0;
  const radius = Math.max(sx, sz) * 0.65;
  const innerRadius = radius - HANDLE_BAND;
  const outerRadius = radius + HANDLE_BAND;
  const objY = (Number(object.position?.y) || 0) + sy / 2;

  const progressArcGeo = useMemo(() => {
    if (angleDelta == null || Math.abs(angleDelta) < 0.5) return null;
    const rad = (angleDelta * Math.PI) / 180;
    const start = rad >= 0 ? 0 : rad;
    const len = Math.abs(rad);
    return new THREE.RingGeometry(0, outerRadius, 48, 1, start, len);
  }, [angleDelta, outerRadius]);

  useEffect(() => {
    const handleDomMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const rect = gl.domElement.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cur = Math.atan2(my - dragRef.current.screenCy, mx - dragRef.current.screenCx);
      let step = cur - dragRef.current.prevAngle;
      while (step > Math.PI) step -= 2 * Math.PI;
      while (step < -Math.PI) step += 2 * Math.PI;
      step *= dragRef.current.sign;
      dragRef.current.accumDelta += step;
      dragRef.current.prevAngle = cur;
      let totalRad = dragRef.current.accumDelta;
      if (e.shiftKey) {
        const snap = THREE.MathUtils.degToRad(ROTATION_SNAP_DEG);
        totalRad = Math.round(totalRad / snap) * snap;
      }
      const totalDeg = THREE.MathUtils.radToDeg(totalRad);
      const newYaw = ((dragRef.current.startYawDeg + totalDeg) % 360 + 360) % 360;
      setAngleDelta(Math.round(totalDeg));
      onRotate(object.id, newYaw);
    };
    const handleDomUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setAngleDelta(null);
      setHovered(false);
      onDragStateChange?.(false);
      onRotateEnd(object.id);
      document.removeEventListener("pointermove", handleDomMove);
      document.removeEventListener("pointerup", handleDomUp);
    };
    if (dragRef.current) {
      document.addEventListener("pointermove", handleDomMove);
      document.addEventListener("pointerup", handleDomUp);
    }
    return () => {
      document.removeEventListener("pointermove", handleDomMove);
      document.removeEventListener("pointerup", handleDomUp);
    };
  });

  const onPointerDown = useCallback(
    (e: PointerEvent3D) => {
      e.stopPropagation();
      onDragStateChange?.(true);
      const centerPt = new THREE.Vector3(objX, objY, objZ);
      const projected = centerPt.clone().project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      const cx = ((projected.x + 1) / 2) * rect.width;
      const cy = ((1 - projected.y) / 2) * rect.height;
      const ne = e.nativeEvent || e;
      const initAngle = Math.atan2(ne.clientY - rect.top - cy, ne.clientX - rect.left - cx);
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const yAxis = new THREE.Vector3(0, 1, 0);
      const sign = yAxis.dot(camDir) >= 0 ? 1 : -1;
      dragRef.current = {
        screenCx: cx,
        screenCy: cy,
        sign,
        startYawDeg: yawDeg,
        prevAngle: initAngle,
        accumDelta: 0,
      };
    },
    [camera, gl, objX, objY, objZ, yawDeg, onDragStateChange],
  );

  const isRotating = angleDelta !== null;

  return (
    <group position={[objX, (Number(object.position?.y) || 0) + 0.5, objZ]}>
      {/* Hover: full ring highlight */}
      {(hovered || isRotating) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={998} raycast={() => null}>
          <ringGeometry args={[innerRadius, outerRadius, 64]} />
          <meshBasicMaterial
            color={ROTATION_HANDLE_COLOR}
            transparent
            opacity={isRotating ? 0.5 : 0.25}
            depthTest={false}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {/* Progress arc — filled pie-slice dial from center to outer edge */}
      {isRotating && progressArcGeo && (
        <mesh geometry={progressArcGeo} rotation={[-Math.PI / 2, 0, 0]} renderOrder={997} raycast={() => null}>
          <meshBasicMaterial
            color={ROTATION_HANDLE_COLOR}
            transparent
            opacity={0.3}
            depthTest={false}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {/* Interactive ring — thick band for easy grabbing */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1000}
        onPointerEnter={() => { if (!dragRef.current) setHovered(true); }}
        onPointerLeave={() => { if (!dragRef.current) setHovered(false); }}
        onPointerDown={onPointerDown}
        userData={{ isTransformHandle: true }}
      >
        <ringGeometry args={[innerRadius, outerRadius, 64]} />
        <meshBasicMaterial
          color={ROTATION_HANDLE_COLOR}
          transparent
          opacity={hovered || isRotating ? 0.65 : 0.4}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Angle label */}
      {isRotating && (
        <Html center style={{ pointerEvents: "none" }} position={[0, sy + 8, 0]}>
          <div style={{
            background: "rgba(34,197,94,0.92)",
            color: "#fff",
            padding: "3px 10px",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 700,
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}>
            {angleDelta >= 0 ? "+" : ""}{angleDelta}°
          </div>
        </Html>
      )}
    </group>
  );
}

function EditableObjectsLayer({
  objects,
  selectedObjectId,
  worldSizeCm,
  snapEnabled = true,
  onObjectMove,
  onObjectDragStart,
  onObjectDragEnd,
  onObjectRotate,
  onObjectRotateEnd,
  onDragStateChange,
  onObjectSelect,
}: EditableObjectsLayerProps) {
  const { camera } = useThree();
  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const dragHit = useMemo(() => new THREE.Vector3(), []);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const pendingDragRef = useRef<PendingDrag | null>(null);
  const handleApplyDelta = useCallback(
    (objectId: string, deltaDx: number, deltaDz: number) => {
      const obj = objects.find((o) => o.id === objectId);
      if (!obj || !onObjectMove) return;
      const curX = obj.position?.x ?? 0;
      const curZ = obj.position?.z ?? 0;
      const newX = clamp(curX + deltaDx, 0, worldSizeCm.width);
      const newZ = clamp(curZ + deltaDz, 0, worldSizeCm.depth);
      onObjectDragStart?.(objectId);
      onObjectMove(objectId, newX, newZ);
      onObjectDragEnd?.(objectId);
    },
    [objects, onObjectMove, onObjectDragStart, onObjectDragEnd, worldSizeCm.width, worldSizeCm.depth],
  );
  const overlay = useDragDistanceOverlay({ onApplyDelta: handleApplyDelta });

  const handlePointerDown = useCallback(
    (event: PointerEvent3D, object: WorldObjectData) => {
      event.stopPropagation();
      onObjectSelect?.(object.id);
      onDragStateChange?.(true);
      if (!onObjectMove) return;
      event.target.setPointerCapture?.(event.pointerId);
      if (!event.ray.intersectPlane(dragPlane, dragHit)) return;
      pendingDragRef.current = {
        id: object.id,
        pointerId: event.pointerId,
        offsetX: dragHit.x - (object.position?.x ?? 0),
        offsetZ: dragHit.z - (object.position?.z ?? 0),
        startHitX: dragHit.x,
        startHitZ: dragHit.z,
      };
    },
    [dragHit, dragPlane, onDragStateChange, onObjectMove, onObjectSelect],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent3D, object: WorldObjectData) => {
      if (!event.ray.intersectPlane(dragPlane, dragHit)) return;

      const pending = pendingDragRef.current;
      if (pending && pending.id === object.id && !dragState) {
        const dx = dragHit.x - pending.startHitX;
        const dz = dragHit.z - pending.startHitZ;
        if (dx * dx + dz * dz < DRAG_THRESHOLD_CM * DRAG_THRESHOLD_CM) return;
        pendingDragRef.current = null;
        setDragState({
          id: pending.id,
          pointerId: pending.pointerId,
          offsetX: pending.offsetX,
          offsetZ: pending.offsetZ,
        });
        onObjectDragStart?.(pending.id);
        onDragStateChange?.(true);

        const objX = object.position?.x ?? 0;
        const objZ = object.position?.z ?? 0;
        overlay.startTracking(pending.id, objX, objZ);
      }

      if (!dragState || dragState.id !== object.id) return;
      event.stopPropagation();
      const sizeX = Math.max(4, object.size_cm?.x ?? 20);
      const sizeZ = Math.max(4, object.size_cm?.z ?? 20);
      const yawRad = ((Number(object.rotation_deg?.y) || 0) * Math.PI) / 180;
      const cosA = Math.abs(Math.cos(yawRad));
      const sinA = Math.abs(Math.sin(yawRad));
      const halfExtentX = (sizeX * cosA + sizeZ * sinA) / 2;
      const halfExtentZ = (sizeX * sinA + sizeZ * cosA) / 2;
      const rawX = dragHit.x - dragState.offsetX;
      const rawZ = dragHit.z - dragState.offsetZ;
      let nextX: number;
      let nextZ: number;
      if (snapEnabled) {
        const otherEdgesX = collectOtherEdges(objects, object.id, "x");
        const otherEdgesZ = collectOtherEdges(objects, object.id, "z");
        nextX = computeSnappedPosition(rawX, halfExtentX, 0, worldSizeCm.width, otherEdgesX, GRID_CELL_CM);
        nextZ = computeSnappedPosition(rawZ, halfExtentZ, 0, worldSizeCm.depth, otherEdgesZ, GRID_CELL_CM);
      } else {
        nextX = clamp(rawX, 0, worldSizeCm.width);
        nextZ = clamp(rawZ, 0, worldSizeCm.depth);
      }
      onObjectMove?.(object.id, nextX, nextZ);
      overlay.updateTracking(object.id, nextX, nextZ);
    },
    [dragHit, dragPlane, dragState, objects, onDragStateChange, onObjectDragStart, onObjectMove, overlay, snapEnabled, worldSizeCm.depth, worldSizeCm.width],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent3D, object: WorldObjectData) => {
      if (pendingDragRef.current?.id === object.id) {
        pendingDragRef.current = null;
        event.target.releasePointerCapture?.(event.pointerId);
        onDragStateChange?.(false);
        return;
      }
      if (!dragState || dragState.id !== object.id) return;
      event.stopPropagation();
      if (dragState.pointerId !== event.pointerId) return;
      event.target.releasePointerCapture?.(event.pointerId);
      setDragState(null);
      onObjectDragEnd?.(object.id);
      onDragStateChange?.(false);
      overlay.stopTracking();
    },
    [dragState, onDragStateChange, onObjectDragEnd, overlay],
  );

  useEffect(() => {
    camera.updateProjectionMatrix();
  }, [camera]);

  const selectedObject = selectedObjectId ? objects.find((o) => o.id === selectedObjectId) : null;

  return (
    <>
      {objects.map((object) => (
        <WorldObject
          key={object.id}
          object={object}
          editable
          selected={selectedObjectId === object.id || dragState?.id === object.id}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      ))}
      {selectedObject && onObjectRotate && onObjectRotateEnd && (
        <RotationHandle
          object={selectedObject}
          onRotate={onObjectRotate}
          onRotateEnd={onObjectRotateEnd}
          onDragStateChange={onDragStateChange}
        />
      )}
      {overlay.overlayElement}
    </>
  );
}

export function ThreeSimViewport({
  worldScene,
  pose,
  robotModel,
  sensorValues = {},
  cameraState,
  overlayState,
  pathTrailResetToken = 0,
  measurementResetToken = 0,
  runtimeState = "idle",
  cameraResetToken = 0,
  cameraFocusToken = 0,
  editable = false,
  worldSizeCm,
  onObjectMove,
  onObjectDragStart,
  onObjectDragEnd,
  onObjectRotate,
  onObjectRotateEnd,
  onObjectSelect,
  selectedObjectId,
  robotStartPose,
  onRobotStartMove,
  onRobotStartMoveEnd,
  backgroundColor = "#f4f6f8",
  ghostObject = null,
  onProjectClientToWorkplaneReady = null,
  onWorkplaneClick = null,
  snapEnabled = true,
}: ThreeSimViewportProps) {
  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const worldWidth = Math.max(200, worldSizeCm?.width ?? 1000);
  const worldDepth = Math.max(200, worldSizeCm?.depth ?? 1000);
  const robotPose = useMemo<RobotPoseForCamera>(
    () => ({
      x: pose?.position?.x ?? 0,
      z: pose?.position?.y ?? 0,
      headingDeg: pose?.heading_deg ?? 0,
    }),
    [pose?.heading_deg, pose?.position?.x, pose?.position?.y],
  );
  const resolvedCameraState = useMemo<CameraState>(
    () =>
      cameraState || {
        mode: "top",
        previousMode: undefined,
        transitionMs: 280,
        isTransitioning: false,
        topZoom: 1,
        followDistance: 88,
        followHeight: 48,
        lockFollowHeading: true,
        followPositionLerp: 6.5,
        followTargetLerp: 8,
      },
    [cameraState],
  );
  const resolvedOverlayState = useMemo<OverlayState>(
    () =>
      overlayState || {
        showGrid: true,
        showSensors: true,
        showPathTrail: true,
        showHeading: true,
        showRobotFootprint: false,
        showMeasurements: true,
        showMeasurementLabels: true,
        showTurnAngles: true,
        showTurnArcs: true,
        showMeasurementHeading: false,
        showMeasurementGuides: true,
        measurementLabelSize: "large",
      },
    [overlayState],
  );
  const worldCenter = useMemo(
    () => ({
      x: worldWidth / 2,
      z: worldDepth / 2,
    }),
    [worldDepth, worldWidth],
  );
  const controller = useCameraController(resolvedCameraState, { width: worldWidth, depth: worldDepth }, robotPose);
  const [isDraggingObject, setIsDraggingObject] = useState(false);
  const [debugPose, setDebugPose] = useState<CameraPose | null>(null);
  const initialPerspectivePose = useMemo(
    () => buildPerspectivePose({ width: worldWidth, depth: worldDepth }, robotPose),
    [robotPose, worldDepth, worldWidth],
  );
  const handleDragStateChange = useCallback((isDragging: boolean) => {
    setIsDraggingObject(isDragging);
    if (orbitRef.current) orbitRef.current.enabled = !isDragging;
  }, []);
  const overlayOpacity = overlayOpacityForMode(resolvedCameraState.mode);
  const physicsDebug = useMemo(() => {
    const groundedRaw = sensorValues?.__physics_grounded;
    const elevationRaw = sensorValues?.__physics_elevation_cm;
    const supportRaw = sensorValues?.__physics_support;
    const grounded = typeof groundedRaw === "boolean" ? groundedRaw : null;
    const elevationCm =
      typeof elevationRaw === "number"
        ? elevationRaw
        : typeof elevationRaw === "string"
          ? Number(elevationRaw)
          : null;
    const support = typeof supportRaw === "string" && supportRaw.trim() ? supportRaw : null;
    return {
      grounded,
      elevationCm: Number.isFinite(elevationCm as number) ? (elevationCm as number) : null,
      support,
    };
  }, [sensorValues]);

  return (
    <div className="robotics-three-viewport">
      <Canvas
        camera={{
          position: [
            initialPerspectivePose.position.x,
            initialPerspectivePose.position.y,
            initialPerspectivePose.position.z,
          ],
          fov: 46,
          near: 0.1,
          far: 7000,
        }}
        dpr={[1, 1.5]}
        shadows
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={[backgroundColor]} />
        <SceneCameraRig
          controller={controller}
          cameraState={resolvedCameraState}
          worldSize={{ width: worldWidth, depth: worldDepth }}
          robotPose={robotPose}
          orbitRef={orbitRef}
          cameraResetToken={cameraResetToken}
          cameraFocusToken={cameraFocusToken}
          isDraggingObject={isDraggingObject}
          onDebugPose={setDebugPose}
        />
        <WorkplaneProjectorBridge onReady={onProjectClientToWorkplaneReady} />
        <ambientLight intensity={0.62} />
        <directionalLight
          position={[180, 260, 160]}
          intensity={0.88}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-500}
          shadow-camera-right={500}
          shadow-camera-top={500}
          shadow-camera-bottom={-500}
          shadow-camera-near={1}
          shadow-camera-far={800}
          shadow-bias={-0.002}
        />
        <pointLight position={[0, 140, 0]} intensity={0.28} />
        <group name="worldRoot">
          <group name="floorLayer">
            {resolvedOverlayState.showGrid ? <WorkspaceGrid width={worldWidth} depth={worldDepth} /> : null}
            <mesh
              position={[worldCenter.x, 0, worldCenter.z]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
              onPointerDown={
                editable && onWorkplaneClick
                  ? (event: PointerEvent3D) => {
                      if (!event.point) return;
                      onWorkplaneClick(event.point.x, event.point.z);
                    }
                  : undefined
              }
            >
              <planeGeometry args={[worldWidth, worldDepth]} />
              <meshStandardMaterial color="#e8edf5" polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
            </mesh>
          </group>
          <group name="objectLayer">
            {editable ? (
              <>
                <EditableObjectsLayer
                  objects={(worldScene?.objects ?? []).filter((object) => !object?.metadata?.hidden)}
                  selectedObjectId={selectedObjectId}
                  worldSizeCm={worldSizeCm || { width: worldWidth, depth: worldDepth }}
                  snapEnabled={snapEnabled}
                  onObjectMove={onObjectMove}
                  onObjectDragStart={onObjectDragStart}
                  onObjectDragEnd={onObjectDragEnd}
                  onObjectRotate={onObjectRotate}
                  onObjectRotateEnd={onObjectRotateEnd}
                  onDragStateChange={handleDragStateChange}
                  onObjectSelect={onObjectSelect}
                />
                {ghostObject ? <WorldObject key={`ghost-${ghostObject.id}`} object={ghostObject} ghost /> : null}
              </>
            ) : (
              (worldScene?.objects ?? [])
                .filter((object) => !object?.metadata?.hidden)
                .map((object) => <WorldObject key={object.id} object={object} selected={selectedObjectId === object.id} />)
            )}
          </group>
        </group>
        <group name="robotLayer">
          <AnimatedRobot pose={pose} robotModel={robotModel} sensorValues={sensorValues} />
          {editable && robotStartPose ? (
            <EditableRobotStart
              robotStartPose={robotStartPose}
              worldSizeCm={worldSizeCm || { width: worldWidth, depth: worldDepth }}
              onDragStateChange={handleDragStateChange}
              onRobotStartMove={onRobotStartMove}
              onRobotStartMoveEnd={onRobotStartMoveEnd}
            />
          ) : null}
        </group>
        <group name="overlayLayer">
          {resolvedOverlayState.showPathTrail ? (
            <PathTrailOverlay robot={robotPose} enabled opacity={overlayOpacity.trail} resetKey={pathTrailResetToken} />
          ) : null}
          {resolvedOverlayState.showMeasurements ? (
            <MeasurementOverlay
              robot={robotPose}
              runtimeState={runtimeState}
              resetKey={measurementResetToken}
              opacity={overlayOpacity.measurement}
              config={{
                showSegmentLabels: resolvedOverlayState.showMeasurementLabels,
                showTurnLabels: resolvedOverlayState.showTurnAngles,
                showTurnArcs: resolvedOverlayState.showTurnArcs,
                showHeadingMarker: resolvedOverlayState.showMeasurementHeading,
                showDimensionGuides: resolvedOverlayState.showMeasurementGuides,
                labelSize: resolvedOverlayState.measurementLabelSize,
              }}
            />
          ) : null}
          {resolvedOverlayState.showSensors ? (
            <>
              <DistanceRayOverlay
                robot={robotPose}
                distanceCm={typeof sensorValues?.distance === "number" ? sensorValues.distance : null}
                opacity={overlayOpacity.sensor}
              />
              <LineSensorOverlay
                robot={robotPose}
                active={Boolean(sensorValues?.line)}
                opacity={overlayOpacity.sensor * 0.9}
              />
            </>
          ) : null}
          {resolvedOverlayState.showHeading ? <HeadingOverlay robot={robotPose} opacity={overlayOpacity.heading} /> : null}
          {resolvedOverlayState.showRobotFootprint ? (
            <mesh position={[robotPose.x, 0.15, robotPose.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[8, 10, 32]} />
              <meshBasicMaterial color="#14b8a6" transparent opacity={0.65} />
            </mesh>
          ) : null}
        </group>
        <ContactShadows
          position={[worldCenter.x, 0.01, worldCenter.z]}
          opacity={0.35}
          scale={Math.max(worldWidth, worldDepth) * 1.2}
          blur={2}
          far={50}
          resolution={512}
        />
        <EffectComposer multisampling={0}>
          <SSAO radius={0.08} intensity={12} luminanceInfluence={0.4} />
        </EffectComposer>
        <OverlayRenderPass />
        <OrbitControls ref={orbitRef} makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>
      {IS_DEV_MODE && debugPose ? (
        <div className="robotics-camera-debug">
          <div className="robotics-camera-debug-line">
            <strong>{resolvedCameraState.mode}</strong>{" "}
            p({Math.round(debugPose.position.x)},{Math.round(debugPose.position.y)},{Math.round(debugPose.position.z)}) t(
            {Math.round(debugPose.target.x)},{Math.round(debugPose.target.y)},{Math.round(debugPose.target.z)})
          </div>
          {physicsDebug.grounded !== null || physicsDebug.elevationCm !== null || physicsDebug.support ? (
            <div className="robotics-camera-debug-line">
              phys: {physicsDebug.grounded === null ? "?" : physicsDebug.grounded ? "grounded" : "airborne"} | elev{" "}
              {physicsDebug.elevationCm === null ? "?" : `${physicsDebug.elevationCm.toFixed(1)}cm`} | support{" "}
              {physicsDebug.support || "none"}
            </div>
          ) : null}
          {typeof sensorValues?.__physics_pitch_deg === "number" || typeof sensorValues?.__physics_roll_deg === "number" ? (
            <div className="robotics-camera-debug-line">
              tilt: pitch{" "}
              {typeof sensorValues?.__physics_pitch_deg === "number"
                ? `${Number(sensorValues.__physics_pitch_deg).toFixed(1)}deg`
                : "?"}{" "}
              | roll{" "}
              {typeof sensorValues?.__physics_roll_deg === "number"
                ? `${Number(sensorValues.__physics_roll_deg).toFixed(1)}deg`
                : "?"}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WorkplaneProjectorBridge({
  onReady,
}: {
  onReady: ((project: (clientX: number, clientY: number) => { x: number; z: number } | null) => void) | null;
}) {
  const { camera, gl } = useThree();
  const raycasterRef = useRef(new THREE.Raycaster());
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const hitRef = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!onReady) return;
    const projector = (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
      raycasterRef.current.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      if (!raycasterRef.current.ray.intersectPlane(planeRef.current, hitRef.current)) return null;
      return { x: hitRef.current.x, z: hitRef.current.z };
    };
    onReady(projector);
    return () => onReady(() => null);
  }, [camera, gl.domElement, onReady]);

  return null;
}

function EditableRobotStart({
  robotStartPose,
  worldSizeCm,
  onDragStateChange,
  onRobotStartMove,
  onRobotStartMoveEnd,
}: EditableRobotStartProps) {
  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const dragHit = useMemo(() => new THREE.Vector3(), []);
  const [dragState, setDragState] = useState<RobotDragState | null>(null);
  const x = robotStartPose?.position?.x ?? 0;
  const z = robotStartPose?.position?.y ?? 0;
  const heading = Number(robotStartPose?.heading_deg) || 0;
  const headingRad = (heading * Math.PI) / 180;

  const handleDown = useCallback(
    (event: PointerEvent3D) => {
      event.stopPropagation();
      event.target.setPointerCapture?.(event.pointerId);
      if (!event.ray.intersectPlane(dragPlane, dragHit)) return;
      setDragState({
        pointerId: event.pointerId,
        offsetX: dragHit.x - x,
        offsetZ: dragHit.z - z,
      });
      onDragStateChange?.(true);
    },
    [dragHit, dragPlane, onDragStateChange, x, z],
  );

  const handleMove = useCallback(
    (event: PointerEvent3D) => {
      if (!dragState) return;
      event.stopPropagation();
      if (!event.ray.intersectPlane(dragPlane, dragHit)) return;
      const margin = 12;
      const nextX = clamp(dragHit.x - dragState.offsetX, margin, worldSizeCm.width - margin);
      const nextZ = clamp(dragHit.z - dragState.offsetZ, margin, worldSizeCm.depth - margin);
      onRobotStartMove?.(nextX, nextZ);
    },
    [dragHit, dragPlane, dragState, onRobotStartMove, worldSizeCm.depth, worldSizeCm.width],
  );

  const handleUp = useCallback(
    (event: PointerEvent3D) => {
      if (!dragState) return;
      if (dragState.pointerId !== event.pointerId) return;
      event.stopPropagation();
      event.target.releasePointerCapture?.(event.pointerId);
      setDragState(null);
      onDragStateChange?.(false);
      onRobotStartMoveEnd?.(x, z);
    },
    [dragState, onDragStateChange, onRobotStartMoveEnd, x, z],
  );

  return (
    <group>
      <mesh position={[x, 0.2, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[12, 14, 40]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.7} />
      </mesh>
      <mesh
        position={[x, 5, z]}
        rotation={[0, -headingRad, 0]}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
      >
        <boxGeometry args={[20, 10, 24]} />
        <meshStandardMaterial color="#0ea5e9" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function SceneCameraRig({
  controller,
  cameraState,
  worldSize,
  robotPose,
  orbitRef,
  cameraResetToken,
  cameraFocusToken,
  isDraggingObject,
  onDebugPose,
}: SceneCameraRigProps) {
  const { camera } = useThree();
  const lastModeRef = useRef(cameraState.mode);
  const lastResetRef = useRef(cameraResetToken);
  const lastFocusRef = useRef(cameraFocusToken);
  const debugRafRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!controller || initializedRef.current) return;
    const controls = orbitRef.current;
    if (!controls) return;

    const snapshot = controller.update(0, cameraState, worldSize, robotPose);
    const targetY = cameraState.mode === "perspective" || cameraState.mode === "top" ? 0 : snapshot.pose.target.y;

    camera.position.set(snapshot.pose.position.x, snapshot.pose.position.y, snapshot.pose.position.z);
    controls.target.set(snapshot.pose.target.x, targetY, snapshot.pose.target.z);
    camera.lookAt(snapshot.pose.target.x, targetY, snapshot.pose.target.z);
    controls.update();
    initializedRef.current = true;
  }, [camera, cameraState, controller, orbitRef, robotPose, worldSize]);

  useEffect(() => {
    if (!controller) return;
    if (lastModeRef.current !== cameraState.mode) {
      controller.setMode(cameraState.mode, cameraState, worldSize, robotPose);
      lastModeRef.current = cameraState.mode;
    }
  }, [cameraState, controller, robotPose, worldSize]);

  useEffect(() => {
    if (!controller) return;
    if (lastResetRef.current !== cameraResetToken) {
      controller.reset(cameraState, worldSize, robotPose);
      const controls = orbitRef.current;
      if (controls) {
        const snapshot = controller.update(0, cameraState, worldSize, robotPose);
        camera.position.set(snapshot.pose.position.x, snapshot.pose.position.y, snapshot.pose.position.z);
        controls.target.set(snapshot.pose.target.x, snapshot.pose.target.y, snapshot.pose.target.z);
        controls.update();
      }
      lastResetRef.current = cameraResetToken;
    }
  }, [camera, cameraResetToken, cameraState, controller, orbitRef, robotPose, worldSize]);

  useEffect(() => {
    if (!controller) return;
    if (lastFocusRef.current !== cameraFocusToken) {
      controller.focusRobot(robotPose);
      const controls = orbitRef.current;
      if (controls) {
        controls.target.set(robotPose.x, 6, robotPose.z);
        controls.update();
      }
      lastFocusRef.current = cameraFocusToken;
    }
  }, [cameraFocusToken, controller, orbitRef, robotPose]);

  useEffect(() => {
    if (!IS_DEV_MODE) return;
    const controls = orbitRef.current;
    if (!controls) return;

    const buildCameraDebugPayload = () => {
      const target = controls.target;
      const deltaX = camera.position.x - target.x;
      const deltaY = camera.position.y - target.y;
      const deltaZ = camera.position.z - target.z;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
      const fov = "fov" in camera ? camera.fov : 0;
      const zoom = "zoom" in camera ? camera.zoom : 1;
      return {
        mode: cameraState.mode,
        position: {
          x: Number(camera.position.x.toFixed(2)),
          y: Number(camera.position.y.toFixed(2)),
          z: Number(camera.position.z.toFixed(2)),
        },
        target: {
          x: Number(target.x.toFixed(2)),
          y: Number(target.y.toFixed(2)),
          z: Number(target.z.toFixed(2)),
        },
        rotationDeg: {
          x: Number(THREE.MathUtils.radToDeg(camera.rotation.x).toFixed(2)),
          y: Number(THREE.MathUtils.radToDeg(camera.rotation.y).toFixed(2)),
          z: Number(THREE.MathUtils.radToDeg(camera.rotation.z).toFixed(2)),
        },
        quaternion: {
          x: Number(camera.quaternion.x.toFixed(4)),
          y: Number(camera.quaternion.y.toFixed(4)),
          z: Number(camera.quaternion.z.toFixed(4)),
          w: Number(camera.quaternion.w.toFixed(4)),
        },
        orbit: {
          distance: Number(distance.toFixed(2)),
          azimuthDeg: Number(THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()).toFixed(2)),
          polarDeg: Number(THREE.MathUtils.radToDeg(controls.getPolarAngle()).toFixed(2)),
        },
        lens: {
          fov: Number(fov.toFixed(2)),
          zoom: Number(zoom.toFixed(2)),
        },
      };
    };

    const emitCameraDebug = () => {
      const payload = buildCameraDebugPayload();

      window.__roboticsCameraDebug = payload;
      window.getRoboticsCameraDebug = () => JSON.stringify(payload, null, 2);
      window.copyRoboticsCameraDebug = async () => {
        const text = JSON.stringify(payload, null, 2);
        await navigator.clipboard.writeText(text);
        return text;
      };
    };

    const onControlsChange = () => {
      if (debugRafRef.current != null) return;
      debugRafRef.current = requestAnimationFrame(() => {
        debugRafRef.current = null;
        emitCameraDebug();
      });
    };
    const onControlsEnd = () => emitCameraDebug();

    controls.addEventListener("change", onControlsChange);
    controls.addEventListener("end", onControlsEnd);
    emitCameraDebug();

    return () => {
      controls.removeEventListener("change", onControlsChange);
      controls.removeEventListener("end", onControlsEnd);
      if (debugRafRef.current != null) {
        cancelAnimationFrame(debugRafRef.current);
        debugRafRef.current = null;
      }
    };
  }, [camera, cameraState.mode, orbitRef]);

  useFrame((_, delta) => {
    if (!controller) return;
    const controls = orbitRef.current;
    const snapshot = controller.update(delta, cameraState, worldSize, robotPose);
    if (controls) {
      controls.enabled = snapshot.orbit.enabled && !isDraggingObject;
      controls.enablePan = snapshot.orbit.enablePan;
      controls.enableRotate = snapshot.orbit.enableRotate;
      controls.minDistance = snapshot.orbit.minDistance;
      controls.maxDistance = snapshot.orbit.maxDistance;
      controls.minPolarAngle = snapshot.orbit.minPolarAngle;
      controls.maxPolarAngle = snapshot.orbit.maxPolarAngle;
    }

    const shouldDriveCamera = cameraState.mode === "follow" || controller.isTransitioning();
    if (shouldDriveCamera) {
      camera.position.set(snapshot.pose.position.x, snapshot.pose.position.y, snapshot.pose.position.z);
      if (controls) {
        const targetY = cameraState.mode === "perspective" || cameraState.mode === "top" ? 0 : snapshot.pose.target.y;
        controls.target.set(snapshot.pose.target.x, targetY, snapshot.pose.target.z);
        controls.update();
      } else {
        camera.lookAt(snapshot.pose.target.x, snapshot.pose.target.y, snapshot.pose.target.z);
      }
    } else if (controls) {
      if (cameraState.mode === "perspective" || cameraState.mode === "top") {
        controls.target.y = 0;
      }
      controls.update();
    }
    onDebugPose?.(snapshot.pose);
  });

  return null;
}

function normalizeHeadingDelta(delta: number): number {
  return ((delta + 540) % 360) - 180;
}

function AnimatedRobot({
  pose,
  robotModel,
  sensorValues,
}: {
  pose?: SimulatorPose;
  robotModel?: SimulatorRobotModel | null;
  sensorValues?: SensorValues;
}) {
  const robotRef = useRef<THREE.Group | null>(null);
  const wheelGroupRefs = useRef<Array<THREE.Group | null>>([]);
  const initializedRef = useRef(false);
  const wheelSpinRef = useRef({ left: 0, right: 0 });
  const steeringAngleRef = useRef(0);
  const targetRef = useRef<RenderedRobotState>({
    x: pose?.position?.x ?? 0,
    z: pose?.position?.y ?? 0,
    heading_deg: pose?.heading_deg ?? 0,
    elevation_cm: 0,
    pitch_deg: 0,
    roll_deg: 0,
  });
  const renderedRef = useRef<RenderedRobotState>({
    x: pose?.position?.x ?? 0,
    z: pose?.position?.y ?? 0,
    heading_deg: pose?.heading_deg ?? 0,
    elevation_cm: 0,
    pitch_deg: 0,
    roll_deg: 0,
  });
  const resolvedRobotModel = useMemo(
    () =>
      robotModel || {
        wheel_base_cm: 14,
        width_cm: 16,
        length_cm: 18,
        sensors: [],
      },
    [robotModel],
  );
  const wheelProfile = useMemo(() => resolveWheelProfile(resolvedRobotModel), [resolvedRobotModel]);
  const chassisLength = Math.max(12, Number(resolvedRobotModel.length_cm) || 18);
  const chassisWidth = Math.max(12, Number(resolvedRobotModel.width_cm) || 16);
  const chassisHeight = Math.max(7, Math.min(14, wheelProfile.wheelRadiusCm * 2.3));
  const wheelRadius = wheelProfile.wheelRadiusCm;
  const wheelWidth = wheelProfile.wheelWidthCm;
  const wheelbaseOffset = wheelProfile.wheelbaseCm / 2;
  const trackOffset = wheelProfile.trackWidthCm / 2;
  const wheelY = -chassisHeight / 2 + wheelRadius;

  const numericSensor = useCallback(
    (key: string): number => {
      const value = sensorValues?.[key];
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    },
    [sensorValues],
  );

  useEffect(() => {
    targetRef.current = {
      x: pose?.position?.x ?? 0,
      z: pose?.position?.y ?? 0,
      heading_deg: pose?.heading_deg ?? 0,
      elevation_cm: numericSensor("__physics_elevation_cm"),
      pitch_deg: numericSensor("__physics_pitch_deg"),
      roll_deg: numericSensor("__physics_roll_deg"),
    };
  }, [numericSensor, pose]);

  useFrame((_, delta) => {
    if (!robotRef.current) return;
    if (!initializedRef.current) {
      renderedRef.current = { ...targetRef.current };
      initializedRef.current = true;
    }

    // Exponential smoothing keeps motion fluid, even when simulator pose updates are discrete.
    const smoothing = 1 - Math.exp(-8 * delta);
    const rendered = renderedRef.current;
    const target = targetRef.current;
    const previousX = rendered.x;
    const previousZ = rendered.z;
    const previousHeadingDeg = rendered.heading_deg;
    rendered.x += (target.x - rendered.x) * smoothing;
    rendered.z += (target.z - rendered.z) * smoothing;
    rendered.heading_deg += normalizeHeadingDelta(target.heading_deg - rendered.heading_deg) * smoothing;
    // Keep elevation/tilt tightly synced to physics support probes.
    // Position/heading stay smoothed for camera-friendly motion.
    rendered.elevation_cm = target.elevation_cm;
    rendered.pitch_deg = target.pitch_deg;
    rendered.roll_deg = target.roll_deg;

    const headingDeltaRad = (normalizeHeadingDelta(rendered.heading_deg - previousHeadingDeg) * Math.PI) / 180;
    const dx = rendered.x - previousX;
    const dz = rendered.z - previousZ;
    const headingRad = (rendered.heading_deg * Math.PI) / 180;
    const forwardDistance = dx * Math.cos(headingRad) + dz * Math.sin(headingRad);
    const leftDistance = forwardDistance - (headingDeltaRad * wheelProfile.trackWidthCm) / 2;
    const rightDistance = forwardDistance + (headingDeltaRad * wheelProfile.trackWidthCm) / 2;
    wheelSpinRef.current.left += leftDistance / Math.max(0.5, wheelRadius);
    wheelSpinRef.current.right += rightDistance / Math.max(0.5, wheelRadius);
    const absForward = Math.max(0.001, Math.abs(forwardDistance));
    const rawSteerAngle = Math.atan2(wheelProfile.wheelbaseCm * headingDeltaRad, absForward);
    const maxSteerAngle = Math.PI / 5;
    const targetSteerAngle = clamp(rawSteerAngle, -maxSteerAngle, maxSteerAngle);
    steeringAngleRef.current += (targetSteerAngle - steeringAngleRef.current) * Math.min(1, delta * 12);
    const spins = [
      wheelSpinRef.current.left,
      wheelSpinRef.current.left,
      wheelSpinRef.current.right,
      wheelSpinRef.current.right,
    ];
    spins.forEach((spin, index) => {
      const wheelGroup = wheelGroupRefs.current[index];
      if (!wheelGroup) return;
      const isFrontWheel = index === 0 || index === 2;
      wheelGroup.rotation.set(0, isFrontWheel ? -steeringAngleRef.current : 0, spin);
    });

    const baseY = wheelRadius + chassisHeight / 2 - 0.2;
    robotRef.current.position.set(rendered.x, baseY + Math.max(0, rendered.elevation_cm), rendered.z);
    // Robot forward axis is local +X, so:
    // - roll rotates around X
    // - pitch rotates around Z
    robotRef.current.rotation.set(
      (rendered.roll_deg * Math.PI) / 180,
      -(rendered.heading_deg * Math.PI) / 180,
      (rendered.pitch_deg * Math.PI) / 180,
      "YXZ",
    );
  });

  return (
    <group ref={robotRef}>
      <mesh position={[0, wheelRadius, 0]}>
        <boxGeometry args={[chassisLength, chassisHeight, chassisWidth]} />
        <meshToonMaterial color="#38bdf8" gradientMap={toonGradientMap} />
      </mesh>
      <mesh position={[0, wheelRadius, 0]} scale={[1.03, 1.03, 1.03]} raycast={() => null}>
        <boxGeometry args={[chassisLength, chassisHeight, chassisWidth]} />
        <meshBasicMaterial color="#0d0d0d" side={THREE.BackSide} />
      </mesh>
      <mesh position={[chassisLength / 2 + 2.2, wheelRadius + 1.8, 0]}>
        <boxGeometry args={[3, 4, 14]} />
        <meshToonMaterial color="#f97316" gradientMap={toonGradientMap} />
      </mesh>
      <mesh position={[chassisLength / 2 - 3, wheelRadius + chassisHeight * 0.55, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[4, 8, 4]} />
        <meshToonMaterial color="#f97316" gradientMap={toonGradientMap} />
      </mesh>
      {[
        { x: wheelbaseOffset, z: -trackOffset },
        { x: -wheelbaseOffset, z: -trackOffset },
        { x: wheelbaseOffset, z: trackOffset },
        { x: -wheelbaseOffset, z: trackOffset },
      ].map((wheel, index) => (
        <group
          key={`wheel_${index}`}
          position={[wheel.x, wheelY, wheel.z]}
          ref={(node) => {
            wheelGroupRefs.current[index] = node;
          }}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 22]} />
            <meshToonMaterial color="#111827" gradientMap={toonGradientMap} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1.04, 1.04, 1.04]} raycast={() => null}>
            <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 22]} />
            <meshBasicMaterial color="#090909" side={THREE.BackSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
