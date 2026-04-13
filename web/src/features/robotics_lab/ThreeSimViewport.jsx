import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useCameraController } from "../../labs/robotics/view/useCameraController";
import { overlayOpacityForMode } from "../../labs/robotics/view/overlayManager";
import { DistanceRayOverlay } from "../../labs/robotics/view/overlays/DistanceRayOverlay";
import { HeadingOverlay } from "../../labs/robotics/view/overlays/HeadingOverlay";
import { LineSensorOverlay } from "../../labs/robotics/view/overlays/LineSensorOverlay";
import { PathTrailOverlay } from "../../labs/robotics/view/overlays/PathTrailOverlay";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildGridLines(width, depth, step, y) {
  const points = [];
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

function WorkspaceGrid({ width, depth }) {
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

function WorldObject({ object, editable = false, selected = false, onPointerDown, onPointerMove, onPointerUp }) {
  const OBJECT_SCALE = 1.25;
  const x = object.position?.x ?? 0;
  const z = object.position?.z ?? 0;
  const sx = Math.max(4, (object.size_cm?.x ?? 20) * OBJECT_SCALE);
  const syRaw = Math.max(2, (object.size_cm?.y ?? 20) * OBJECT_SCALE);
  const sz = Math.max(4, (object.size_cm?.z ?? 20) * OBJECT_SCALE);
  const isZone = object.type === "target_zone" || object.type === "color_zone";
  const yawDeg = Number(object?.rotation_deg?.y) || 0;
  const yawRad = (yawDeg * Math.PI) / 180;
  const sy = isZone ? Math.min(8, syRaw) : syRaw;
  const y = sy / 2;
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

  const baseMaterialProps = {
    color,
    metalness: object.type === "wall" ? 0.2 : 0.05,
    roughness: object.type === "wall" ? 0.65 : 0.45,
    emissive: selected ? "#1d4ed8" : "#000000",
    emissiveIntensity: selected ? 0.35 : 0,
  };

  const commonProps = editable
    ? {
        onPointerDown: (event) => onPointerDown?.(event, object),
        onPointerMove: (event) => onPointerMove?.(event, object),
        onPointerUp: (event) => onPointerUp?.(event, object),
      }
    : {};

  if (object.type === "obstacle") {
    const radius = Math.max(6, Math.min(sx, sz) / 2);
    return (
      <mesh position={[x, y, z]} rotation={[0, yawRad, 0]} {...commonProps}>
        <cylinderGeometry args={[radius, radius * 0.9, sy, 24]} />
        <meshStandardMaterial {...baseMaterialProps} />
      </mesh>
    );
  }

  if (isZone) {
    return (
      <group rotation={[0, yawRad, 0]} {...commonProps}>
        <mesh position={[x, y, z]}>
          <cylinderGeometry args={[Math.max(sx, sz) / 2, Math.max(sx, sz) / 2, sy, 28]} />
          <meshStandardMaterial {...baseMaterialProps} transparent opacity={0.82} />
        </mesh>
        <mesh position={[x, y + sy / 2 + 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(sx, sz) * 0.18, Math.max(sx, sz) * 0.38, 40]} />
          <meshBasicMaterial color="#f8fafc" transparent opacity={0.75} />
        </mesh>
      </group>
    );
  }

  return (
    <mesh position={[x, y, z]} rotation={[0, yawRad, 0]} {...commonProps}>
      <boxGeometry args={[sx, sy, sz]} />
      <meshStandardMaterial {...baseMaterialProps} />
    </mesh>
  );
}

function EditableObjectsLayer({
  objects,
  worldSizeCm,
  onObjectMove,
  onObjectDragStart,
  onObjectDragEnd,
  onDragStateChange,
  onObjectSelect,
}) {
  const { camera } = useThree();
  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const dragHit = useMemo(() => new THREE.Vector3(), []);
  const [dragState, setDragState] = useState(null);

  const handlePointerDown = useCallback(
    (event, object) => {
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
    (event, object) => {
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
    (event, object) => {
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
          selected={dragState?.id === object.id}
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
  robotStartPose,
  onRobotStartMove,
  onRobotStartMoveEnd,
}) {
  const orbitRef = useRef(null);
  const worldWidth = Math.max(200, worldSizeCm?.width ?? 1000);
  const worldDepth = Math.max(200, worldSizeCm?.depth ?? 1000);
  const robotPose = useMemo(
    () => ({
      x: pose?.position?.x ?? 0,
      z: pose?.position?.y ?? 0,
      headingDeg: pose?.heading_deg ?? 0,
    }),
    [pose?.heading_deg, pose?.position?.x, pose?.position?.y],
  );
  const resolvedCameraState = useMemo(
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
  const resolvedOverlayState = useMemo(
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
  const planeSize = useMemo(() => Math.max(1000, Math.max(worldWidth, worldDepth) + 280), [worldDepth, worldWidth]);
  const controller = useCameraController(resolvedCameraState, { width: worldWidth, depth: worldDepth }, robotPose);
  const [isDraggingObject, setIsDraggingObject] = useState(false);
  const [debugPose, setDebugPose] = useState(null);
  const handleDragStateChange = useCallback((isDragging) => {
    setIsDraggingObject(isDragging);
    if (orbitRef.current) orbitRef.current.enabled = !isDragging;
  }, []);
  const overlayOpacity = overlayOpacityForMode(resolvedCameraState.mode);

  return (
    <div className="robotics-three-viewport">
      <Canvas
        camera={{ position: [robotPose.x - 620, 440, robotPose.z - 100], fov: 46, near: 0.1, far: 7000 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
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
        <ambientLight intensity={0.62} />
        <directionalLight position={[180, 260, 160]} intensity={0.88} />
        <pointLight position={[0, 140, 0]} intensity={0.28} />
        <group name="worldRoot">
          <group name="floorLayer">
            {resolvedOverlayState.showGrid ? (
              <WorkspaceGrid width={worldWidth} depth={worldDepth} />
            ) : null}
            <mesh position={[worldCenter.x, 0, worldCenter.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[worldWidth, worldDepth]} />
              <meshStandardMaterial color="#e8edf5" />
            </mesh>
          </group>
          <group name="objectLayer">
            {editable ? (
              <EditableObjectsLayer
            objects={(worldScene?.objects ?? []).filter((object) => !object?.metadata?.hidden)}
                worldSizeCm={worldSizeCm || { width: worldWidth, depth: worldDepth }}
                onObjectMove={onObjectMove}
                onObjectDragStart={onObjectDragStart}
                onObjectDragEnd={onObjectDragEnd}
                onDragStateChange={handleDragStateChange}
                onObjectSelect={onObjectSelect}
              />
            ) : (
          (worldScene?.objects ?? [])
            .filter((object) => !object?.metadata?.hidden)
            .map((object) => <WorldObject key={object.id} object={object} />)
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
            <PathTrailOverlay
              robot={robotPose}
              enabled
              opacity={overlayOpacity.trail}
              resetKey={pathTrailResetToken}
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
          {resolvedOverlayState.showHeading ? (
            <HeadingOverlay robot={robotPose} opacity={overlayOpacity.heading} />
          ) : null}
          {resolvedOverlayState.showRobotFootprint ? (
            <mesh position={[robotPose.x, 0.15, robotPose.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[8, 10, 32]} />
              <meshBasicMaterial color="#14b8a6" transparent opacity={0.65} />
            </mesh>
          ) : null}
        </group>
        <OrbitControls
          ref={orbitRef}
          makeDefault
          enableDamping
          dampingFactor={0.08}
        />
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

function EditableRobotStart({
  robotStartPose,
  worldSizeCm,
  onDragStateChange,
  onRobotStartMove,
  onRobotStartMoveEnd,
}) {
  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const dragHit = useMemo(() => new THREE.Vector3(), []);
  const [dragState, setDragState] = useState(null);
  const x = robotStartPose?.position?.x ?? 0;
  const z = robotStartPose?.position?.y ?? 0;
  const heading = Number(robotStartPose?.heading_deg) || 0;
  const headingRad = (heading * Math.PI) / 180;

  const handleDown = useCallback(
    (event) => {
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
    (event) => {
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
    (event) => {
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
        position={[x, 8, z]}
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
}) {
  const { camera } = useThree();
  const lastModeRef = useRef(cameraState.mode);
  const lastResetRef = useRef(cameraResetToken);
  const lastFocusRef = useRef(cameraFocusToken);

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
        controls.target.set(snapshot.pose.target.x, snapshot.pose.target.y, snapshot.pose.target.z);
        controls.update();
      } else {
        camera.lookAt(snapshot.pose.target.x, snapshot.pose.target.y, snapshot.pose.target.z);
      }
    } else if (controls) {
      controls.update();
    }
    onDebugPose?.(snapshot.pose);
  });

  return null;
}

function normalizeHeadingDelta(delta) {
  return ((delta + 540) % 360) - 180;
}

function AnimatedRobot({ pose }) {
  const robotRef = useRef(null);
  const initializedRef = useRef(false);
  const targetRef = useRef({
    x: pose?.position?.x ?? 0,
    z: pose?.position?.y ?? 0,
    heading_deg: pose?.heading_deg ?? 0,
  });
  const renderedRef = useRef({
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

    robotRef.current.position.set(rendered.x, 10, rendered.z);
    robotRef.current.rotation.set(0, -(rendered.heading_deg * Math.PI) / 180, 0);
  });

  return (
    <group ref={robotRef}>
      <mesh>
        <boxGeometry args={[20, 10, 24]} />
        <meshStandardMaterial color="#38bdf8" />
      </mesh>
      <mesh position={[13, 2, 0]}>
        <boxGeometry args={[3, 4, 14]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
      <mesh position={[8, 6, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[4, 8, 4]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
    </group>
  );
}
