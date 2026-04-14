import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useCameraController } from "../../labs/robotics/view/useCameraController";
import { buildPerspectivePose } from "../../labs/robotics/view/cameraPresets";
import { overlayOpacityForMode } from "../../labs/robotics/view/overlayManager";
import { toonGradientMap } from "../../lib/three/cartoonStyle";
import { DistanceRayOverlay } from "../../labs/robotics/view/overlays/DistanceRayOverlay";
import { HeadingOverlay } from "../../labs/robotics/view/overlays/HeadingOverlay";
import { LineSensorOverlay } from "../../labs/robotics/view/overlays/LineSensorOverlay";
import { PathTrailOverlay } from "../../labs/robotics/view/overlays/PathTrailOverlay";
import type { CameraPose, CameraState, OverlayState, RobotPoseForCamera, WorldSizeCm } from "../../labs/robotics/view/types";
import type { RoboticsCameraController } from "../../labs/robotics/view/cameraController";

type PointerEvent3D = any;

interface Position2D {
  x?: number;
  y?: number;
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
  sensorValues?: SensorValues;
  cameraState?: CameraState;
  overlayState?: OverlayState;
  pathTrailResetToken?: number;
  cameraResetToken?: number;
  cameraFocusToken?: number;
  editable?: boolean;
  worldSizeCm?: WorldSizeCm;
  onObjectMove?: (objectId: string, x: number, z: number) => void;
  onObjectDragStart?: (objectId: string) => void;
  onObjectDragEnd?: (objectId: string) => void;
  onObjectSelect?: (objectId: string) => void;
  selectedObjectId?: string | null;
  robotStartPose?: SimulatorPose;
  onRobotStartMove?: (x: number, z: number) => void;
  onRobotStartMoveEnd?: (x: number, z: number) => void;
  backgroundColor?: string;
  ghostObject?: WorldObjectData | null;
  onProjectClientToWorkplaneReady?: ((project: (clientX: number, clientY: number) => { x: number; z: number } | null) => void) | null;
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
  onObjectMove?: (objectId: string, x: number, z: number) => void;
  onObjectDragStart?: (objectId: string) => void;
  onObjectDragEnd?: (objectId: string) => void;
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

interface DragState {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetZ: number;
}

interface RobotDragState {
  pointerId: number;
  offsetX: number;
  offsetZ: number;
}

interface RenderedRobotState {
  x: number;
  z: number;
  heading_deg: number;
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
  const cellGeo = useMemo(() => buildGridLines(width, depth, 20, 0.06), [width, depth]);
  const sectionGeo = useMemo(() => buildGridLines(width, depth, 100, 0.1), [width, depth]);

  return (
    <group>
      <lineSegments geometry={cellGeo}>
        <lineBasicMaterial color="#a0aec0" transparent opacity={0.45} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={sectionGeo}>
        <lineBasicMaterial color="#7a8ba0" transparent opacity={0.7} depthWrite={false} />
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
  const syRaw = Math.max(2, (object.size_cm?.y ?? 20) * OBJECT_SCALE);
  const sz = Math.max(4, (object.size_cm?.z ?? 20) * OBJECT_SCALE);
  const isZone = object.type === "target_zone" || object.type === "color_zone";
  const yawDeg = Number(object?.rotation_deg?.y) || 0;
  const yawRad = (yawDeg * Math.PI) / 180;
  const rollXRad = ((Number(object?.metadata?.roll_x_deg) || 0) * Math.PI) / 180;
  const rollZRad = ((Number(object?.metadata?.roll_z_deg) || 0) * Math.PI) / 180;
  const sy = isZone ? Math.min(8, syRaw) : syRaw;
  const y = sy / 2;
  const renderShape = typeof object?.metadata?.render_shape === "string" ? object.metadata.render_shape : "default";
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
              <meshBasicMaterial color="#00d4ff" transparent opacity={0.22} side={THREE.BackSide} />
            </mesh>
          ) : null}
        </group>
      );
    }

    const radius = Math.max(6, Math.min(sx, sz) / 2);
    return (
      <group position={[x, y, z]} rotation={[0, yawRad, 0]} {...commonProps}>
        <mesh>
          <cylinderGeometry args={[radius, radius * 0.9, sy, 24]} />
          <meshToonMaterial {...toonMaterialProps} />
        </mesh>
        <mesh scale={[1.02, 1.02, 1.02]} raycast={() => null}>
          <cylinderGeometry args={[radius, radius * 0.9, sy, 24]} />
          <meshBasicMaterial color="#0d0d0d" side={THREE.BackSide} />
        </mesh>
        {selected ? (
          <mesh scale={[1.06, 1.06, 1.06]} raycast={() => null}>
            <cylinderGeometry args={[radius, radius * 0.9, sy, 24]} />
            <meshBasicMaterial color="#00d4ff" transparent opacity={0.22} side={THREE.BackSide} />
          </mesh>
        ) : null}
      </group>
    );
  }

  if (isZone) {
    return (
      <group rotation={[0, yawRad, 0]} {...commonProps}>
        <mesh position={[x, y, z]}>
          <cylinderGeometry args={[Math.max(sx, sz) / 2, Math.max(sx, sz) / 2, sy, 28]} />
          <meshToonMaterial {...toonMaterialProps} transparent opacity={0.82} />
        </mesh>
        <mesh position={[x, y, z]} scale={[1.015, 1.015, 1.015]} raycast={() => null}>
          <cylinderGeometry args={[Math.max(sx, sz) / 2, Math.max(sx, sz) / 2, sy, 28]} />
          <meshBasicMaterial color="#0d0d0d" side={THREE.BackSide} />
        </mesh>
        {selected ? (
          <mesh position={[x, y, z]} scale={[1.045, 1.045, 1.045]} raycast={() => null}>
            <cylinderGeometry args={[Math.max(sx, sz) / 2, Math.max(sx, sz) / 2, sy, 28]} />
            <meshBasicMaterial color="#00d4ff" transparent opacity={0.2} side={THREE.BackSide} />
          </mesh>
        ) : null}
        <mesh position={[x, y + sy / 2 + 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(sx, sz) * 0.18, Math.max(sx, sz) * 0.38, 40]} />
          <meshBasicMaterial color="#f8fafc" transparent opacity={0.75} />
        </mesh>
      </group>
    );
  }

  return (
    <group position={[x, y, z]} rotation={[0, yawRad, 0]} {...commonProps}>
      <mesh>
        <boxGeometry args={[sx, sy, sz]} />
        <meshToonMaterial {...toonMaterialProps} />
      </mesh>
      <mesh scale={[1.02, 1.02, 1.02]} raycast={() => null}>
        <boxGeometry args={[sx, sy, sz]} />
        <meshBasicMaterial color="#0d0d0d" side={THREE.BackSide} />
      </mesh>
      {selected ? (
        <mesh scale={[1.055, 1.055, 1.055]} raycast={() => null}>
          <boxGeometry args={[sx, sy, sz]} />
          <meshBasicMaterial color="#00d4ff" transparent opacity={0.22} side={THREE.BackSide} />
        </mesh>
      ) : null}
    </group>
  );
}

function EditableObjectsLayer({
  objects,
  selectedObjectId,
  worldSizeCm,
  onObjectMove,
  onObjectDragStart,
  onObjectDragEnd,
  onDragStateChange,
  onObjectSelect,
}: EditableObjectsLayerProps) {
  const { camera } = useThree();
  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const dragHit = useMemo(() => new THREE.Vector3(), []);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const handlePointerDown = useCallback(
    (event: PointerEvent3D, object: WorldObjectData) => {
      event.stopPropagation();
      onObjectSelect?.(object.id);
      if (!onObjectMove) return;
      event.target.setPointerCapture?.(event.pointerId);
      if (!event.ray.intersectPlane(dragPlane, dragHit)) return;
      setDragState({
        id: object.id,
        pointerId: event.pointerId,
        offsetX: dragHit.x - (object.position?.x ?? 0),
        offsetZ: dragHit.z - (object.position?.z ?? 0),
      });
      onObjectDragStart?.(object.id);
      onDragStateChange?.(true);
    },
    [dragHit, dragPlane, onDragStateChange, onObjectDragStart, onObjectMove, onObjectSelect],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent3D, object: WorldObjectData) => {
      if (!dragState || dragState.id !== object.id) return;
      event.stopPropagation();
      if (!event.ray.intersectPlane(dragPlane, dragHit)) return;
      const sizeX = Math.max(4, object.size_cm?.x ?? 20);
      const sizeZ = Math.max(4, object.size_cm?.z ?? 20);
      const nextX = clamp(dragHit.x - dragState.offsetX, sizeX / 2, worldSizeCm.width - sizeX / 2);
      const nextZ = clamp(dragHit.z - dragState.offsetZ, sizeZ / 2, worldSizeCm.depth - sizeZ / 2);
      onObjectMove?.(object.id, nextX, nextZ);
    },
    [dragHit, dragPlane, dragState, onObjectMove, worldSizeCm.depth, worldSizeCm.width],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent3D, object: WorldObjectData) => {
      if (!dragState || dragState.id !== object.id) return;
      event.stopPropagation();
      if (dragState.pointerId !== event.pointerId) return;
      event.target.releasePointerCapture?.(event.pointerId);
      setDragState(null);
      onObjectDragEnd?.(object.id);
      onDragStateChange?.(false);
    },
    [dragState, onDragStateChange, onObjectDragEnd],
  );

  useEffect(() => {
    camera.updateProjectionMatrix();
  }, [camera]);

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
    </>
  );
}

export function ThreeSimViewport({
  worldScene,
  pose,
  sensorValues = {},
  cameraState,
  overlayState,
  pathTrailResetToken = 0,
  cameraResetToken = 0,
  cameraFocusToken = 0,
  editable = false,
  worldSizeCm,
  onObjectMove,
  onObjectDragStart,
  onObjectDragEnd,
  onObjectSelect,
  selectedObjectId,
  robotStartPose,
  onRobotStartMove,
  onRobotStartMoveEnd,
  backgroundColor = "#f4f6f8",
  ghostObject = null,
  onProjectClientToWorkplaneReady = null,
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
        <directionalLight position={[180, 260, 160]} intensity={0.88} />
        <pointLight position={[0, 140, 0]} intensity={0.28} />
        <group name="worldRoot">
          <group name="floorLayer">
            {resolvedOverlayState.showGrid ? <WorkspaceGrid width={worldWidth} depth={worldDepth} /> : null}
            <mesh position={[worldCenter.x, 0, worldCenter.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[worldWidth, worldDepth]} />
              <meshStandardMaterial color="#e8edf5" />
            </mesh>
          </group>
          <group name="objectLayer">
            {editable ? (
              <>
                <EditableObjectsLayer
                  objects={(worldScene?.objects ?? []).filter((object) => !object?.metadata?.hidden)}
                  selectedObjectId={selectedObjectId}
                  worldSizeCm={worldSizeCm || { width: worldWidth, depth: worldDepth }}
                  onObjectMove={onObjectMove}
                  onObjectDragStart={onObjectDragStart}
                  onObjectDragEnd={onObjectDragEnd}
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
          <AnimatedRobot pose={pose} />
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
        <OrbitControls ref={orbitRef} makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>
      {import.meta.env.DEV && debugPose ? (
        <div className="robotics-camera-debug">
          <strong>{resolvedCameraState.mode}</strong>{" "}
          p({Math.round(debugPose.position.x)},{Math.round(debugPose.position.y)},{Math.round(debugPose.position.z)}) t(
          {Math.round(debugPose.target.x)},{Math.round(debugPose.target.y)},{Math.round(debugPose.target.z)})
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
    if (!import.meta.env.DEV) return;
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

function AnimatedRobot({ pose }: { pose?: SimulatorPose }) {
  const robotRef = useRef<THREE.Group | null>(null);
  const initializedRef = useRef(false);
  const targetRef = useRef<RenderedRobotState>({
    x: pose?.position?.x ?? 0,
    z: pose?.position?.y ?? 0,
    heading_deg: pose?.heading_deg ?? 0,
  });
  const renderedRef = useRef<RenderedRobotState>({
    x: pose?.position?.x ?? 0,
    z: pose?.position?.y ?? 0,
    heading_deg: pose?.heading_deg ?? 0,
  });

  useEffect(() => {
    targetRef.current = {
      x: pose?.position?.x ?? 0,
      z: pose?.position?.y ?? 0,
      heading_deg: pose?.heading_deg ?? 0,
    };
  }, [pose]);

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
    rendered.x += (target.x - rendered.x) * smoothing;
    rendered.z += (target.z - rendered.z) * smoothing;
    rendered.heading_deg += normalizeHeadingDelta(target.heading_deg - rendered.heading_deg) * smoothing;

    robotRef.current.position.set(rendered.x, 5, rendered.z);
    robotRef.current.rotation.set(0, -(rendered.heading_deg * Math.PI) / 180, 0);
  });

  return (
    <group ref={robotRef}>
      <mesh>
        <boxGeometry args={[20, 10, 24]} />
        <meshToonMaterial color="#38bdf8" gradientMap={toonGradientMap} />
      </mesh>
      <mesh scale={[1.03, 1.03, 1.03]} raycast={() => null}>
        <boxGeometry args={[20, 10, 24]} />
        <meshBasicMaterial color="#0d0d0d" side={THREE.BackSide} />
      </mesh>
      <mesh position={[13, 2, 0]}>
        <boxGeometry args={[3, 4, 14]} />
        <meshToonMaterial color="#f97316" gradientMap={toonGradientMap} />
      </mesh>
      <mesh position={[8, 6, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[4, 8, 4]} />
        <meshToonMaterial color="#f97316" gradientMap={toonGradientMap} />
      </mesh>
    </group>
  );
}
