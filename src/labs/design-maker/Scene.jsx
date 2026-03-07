import React, {
  useRef,
  useState,
  useMemo,
  useCallback,
  useEffect,
  Suspense,
  forwardRef,
} from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewcube,
  GizmoViewport,
  PerspectiveCamera,
  OrthographicCamera,
  Text3D,
  Center,
  Html,
  Line,
  Environment,
} from "@react-three/drei";
import { EffectComposer, Outline } from "@react-three/postprocessing";
import { BlendFunction, KernelSize } from "postprocessing";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

import {
  useDesignStore,
  SHAPE_DEFAULTS,
  FLAT_TYPES,
  FLAT_ROTATION,
  DEFAULT_SHAPE_ROTATIONS,
  dragCursor,
  sceneCamera,
  sceneInteracting,
} from "./store";
import { createGeometry } from "./geometryFactory";
import { getObjectDimensions, getFloorY } from "./dimensions";

const toonGradientMap = (() => {
  const colors = new Uint8Array([60, 100, 160, 220, 255]);
  const tex = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

const smoothToonGradientMap = (() => {
  const colors = new Uint8Array([96, 124, 152, 180, 208, 236, 255]);
  const tex = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

const FONT_BASE = "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/fonts";
export const FONT_MAP = {
  helvetiker: `${FONT_BASE}/helvetiker_regular.typeface.json`,
  "helvetiker-bold": `${FONT_BASE}/helvetiker_bold.typeface.json`,
  gentilis: `${FONT_BASE}/gentilis_regular.typeface.json`,
  "gentilis-bold": `${FONT_BASE}/gentilis_bold.typeface.json`,
  optimer: `${FONT_BASE}/optimer_regular.typeface.json`,
  "optimer-bold": `${FONT_BASE}/optimer_bold.typeface.json`,
  "droid-sans": `${FONT_BASE}/droid/droid_sans_regular.typeface.json`,
  "droid-sans-bold": `${FONT_BASE}/droid/droid_sans_bold.typeface.json`,
  "droid-serif": `${FONT_BASE}/droid/droid_serif_regular.typeface.json`,
  "droid-mono": `${FONT_BASE}/droid/droid_sans_mono_regular.typeface.json`,
};
export const FONT_LABELS = {
  helvetiker: "Helvetiker",
  "helvetiker-bold": "Helvetiker Bold",
  gentilis: "Gentilis",
  "gentilis-bold": "Gentilis Bold",
  optimer: "Optimer",
  "optimer-bold": "Optimer Bold",
  "droid-sans": "Droid Sans",
  "droid-sans-bold": "Droid Sans Bold",
  "droid-serif": "Droid Serif",
  "droid-mono": "Droid Mono",
};

// Fix #5: Hoist axis line geometry data to module-level constants
const X_AXIS_POSITIONS = new Float32Array([-200, 0, 0, 200, 0, 0]);
const Z_AXIS_POSITIONS = new Float32Array([0, 0, -200, 0, 0, 200]);

const holeCheckerTex = (() => {
  const sz = 4;
  const data = new Uint8Array(sz * sz * 4);
  for (let y = 0; y < sz; y++) {
    for (let x = 0; x < sz; x++) {
      const i = (y * sz + x) * 4;
      const isLight = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0;
      const v = isLight ? 230 : 210;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, sz, sz, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

function ToyMaterial({
  color,
  wireframe,
  transparent,
  opacity,
  side,
  isHole,
  isImported,
}) {
  if (isHole && !wireframe) {
    return (
      <meshBasicMaterial
        map={holeCheckerTex}
        transparent
        opacity={0.85}
        side={side}
        depthWrite={false}
      />
    );
  }
  return (
    <meshToonMaterial
      color={color}
      wireframe={wireframe}
      transparent={transparent}
      opacity={opacity}
      side={side}
      gradientMap={isImported ? smoothToonGradientMap : toonGradientMap}
    />
  );
}

function useObjectGeometry(type, params) {
  return useMemo(() => createGeometry(type, params), [type, params]);
}

function ThickEdges({
  geometry,
  opacity = 0.8,
  lineWidth = 1.5,
  depthTest = true,
  depthWrite = true,
  thresholdAngle = 18,
}) {
  const gl = useThree((s) => s.gl);

  const lineObj = useMemo(() => {
    const edges = new THREE.EdgesGeometry(geometry, thresholdAngle);
    const geo = new LineSegmentsGeometry();
    geo.setPositions(edges.attributes.position.array);
    edges.dispose();
    const rendererSize = gl.getSize(new THREE.Vector2());
    const mat = new LineMaterial({
      color: 0x000000,
      linewidth: lineWidth,
      transparent: true,
      opacity,
      depthTest,
      depthWrite,
      worldUnits: false,
      resolution: rendererSize,
    });
    const obj = new LineSegments2(geo, mat);
    obj.renderOrder = 1;
    return obj;
  }, [geometry, lineWidth, opacity, depthTest, depthWrite, thresholdAngle, gl]);

  useEffect(() => {
    const onResize = () => {
      const s = gl.getSize(new THREE.Vector2());
      lineObj.material.resolution.set(s.x, s.y);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [lineObj, gl]);

  useEffect(
    () => () => {
      lineObj.geometry.dispose();
      lineObj.material.dispose();
    },
    [lineObj],
  );

  return <primitive object={lineObj} />;
}

const SceneObject = forwardRef(function SceneObject(
  { obj, isSelected, wireframe, onSelect, onDragStart },
  ref,
) {
  const color = obj.isHole ? "#ff4444" : obj.color;
  const opacity = obj.isHole ? 0.4 : 1;
  const side = obj.isHole ? THREE.DoubleSide : THREE.FrontSide;
  const cartoonRatio = 1.012;

  if (obj.type === "text") {
    return (
      <group
        ref={ref}
        position={obj.position}
        rotation={obj.rotation}
        scale={obj.scale}
        userData={{ isSceneObject: true }}
        onPointerDown={(e) => {
          sceneInteracting.active = true;
          if (e.button === 0) onDragStart(e, obj.id);
        }}
        onPointerUp={() => {
          sceneInteracting.active = false;
        }}
        onClick={onSelect}
      >
        <Suspense
          fallback={
            <mesh>
              <boxGeometry args={[20, 10, 5]} />
              <meshStandardMaterial color="#555" transparent opacity={0.3} />
            </mesh>
          }
        >
          <Center>
            <Text3D
              font={FONT_MAP[obj.geometry.font] || FONT_MAP.helvetiker}
              size={obj.geometry.size || 10}
              height={obj.geometry.height || 5}
              curveSegments={12}
              bevelEnabled
              bevelThickness={0.3}
              bevelSize={0.2}
              castShadow
            >
              {obj.geometry.text || "Text"}
              <ToyMaterial
                color={color}
                wireframe={wireframe}
                transparent={obj.isHole}
                opacity={opacity}
                side={side}
                isHole={obj.isHole}
              />
            </Text3D>
          </Center>
          {!wireframe && !obj.isHole && (
            <Center>
              <Text3D
                font={FONT_MAP[obj.geometry.font] || FONT_MAP.helvetiker}
                size={obj.geometry.size || 10}
                height={obj.geometry.height || 5}
                curveSegments={8}
                bevelEnabled
                bevelThickness={0.3}
                bevelSize={0.2}
                scale={[cartoonRatio, cartoonRatio, cartoonRatio]}
              >
                {obj.geometry.text || "Text"}
                <meshBasicMaterial
                  color="#1a1a1a"
                  side={THREE.BackSide}
                  polygonOffset
                  polygonOffsetFactor={5}
                  polygonOffsetUnits={5}
                />
              </Text3D>
            </Center>
          )}
        </Suspense>
      </group>
    );
  }

  const geometry = useObjectGeometry(obj.type, obj.geometry);

  const isTorus = obj.type === "torus" || obj.type === "tube";
  const isImported = obj.type === "imported";
  const roundedHoleEdges = obj.isHole && HOLE_ROUNDED_EDGE_TYPES.has(obj.type);
  const edgeThresholdAngle = roundedHoleEdges
    ? (HOLE_EDGE_THRESHOLD_BY_TYPE[obj.type] ?? 14)
    : isImported
      ? 50
      : isTorus
        ? 50
        : 18;
  const edgeOpacity = isImported ? 1 : obj.isHole ? 0.6 : 0.8;
  const showInnerEdges = !isImported;
  const showCartoonHull = !obj.isHole;
  const hullScale = cartoonRatio;
  const hullOffset = 5;
  const outlineGeo = useMemo(() => {
    if (!isTorus) return null;
    const p = obj.geometry;
    return new THREE.TorusGeometry(
      p.radius,
      p.tube + 0.4,
      p.radialSegments || 16,
      p.tubularSegments || 48,
    );
  }, [isTorus, obj.geometry]);

  return (
    <group
      ref={ref}
      position={obj.position}
      rotation={obj.rotation}
      scale={obj.scale}
      userData={{ isSceneObject: true }}
      onPointerDown={(e) => {
        sceneInteracting.active = true;
        if (e.button === 0) onDragStart(e, obj.id);
      }}
      onPointerUp={() => {
        sceneInteracting.active = false;
      }}
      onClick={onSelect}
    >
      <mesh castShadow={!obj.isHole} receiveShadow geometry={geometry}>
        <ToyMaterial
          color={color}
          wireframe={wireframe}
          transparent={obj.isHole}
          opacity={opacity}
          side={side}
          isHole={obj.isHole}
          isImported={isImported}
        />
      </mesh>
      {!wireframe && (
        <>
          {showCartoonHull && (
            <mesh
              scale={isTorus ? undefined : [hullScale, hullScale, hullScale]}
              geometry={isTorus ? outlineGeo : geometry}
            >
              <meshBasicMaterial
                color="#0d0d0d"
                side={THREE.BackSide}
                depthWrite={true}
                polygonOffset
                polygonOffsetFactor={hullOffset}
                polygonOffsetUnits={hullOffset}
              />
            </mesh>
          )}
          {showInnerEdges && (
            <ThickEdges
              geometry={geometry}
              lineWidth={isImported ? 2.6 : 2}
              opacity={edgeOpacity}
              depthTest
              depthWrite={!obj.isHole}
              thresholdAngle={edgeThresholdAngle}
            />
          )}
        </>
      )}
    </group>
  );
});

function CameraSetup() {
  const cameraMode = useDesignStore((s) => s.cameraMode);
  return (
    <>
      <PerspectiveCamera
        makeDefault={cameraMode === "perspective"}
        position={[60, 60, 60]}
        fov={50}
        near={0.5}
        far={10000}
      />
      <OrthographicCamera
        makeDefault={cameraMode === "orthographic"}
        position={[60, 60, 60]}
        zoom={4}
        near={-10000}
        far={10000}
      />
    </>
  );
}

// Fix #7: Read objects/selectedIds lazily from store only when 'fit' command fires
function CameraControls({ orbitRef }) {
  const zoomSpeed = useDesignStore((s) => s.zoomSpeed);
  const cameraCmd = useDesignStore((s) => s._cameraCmd);
  const clearCameraCmd = useDesignStore((s) => s.clearCameraCmd);
  const { gl } = useThree();

  useEffect(() => {
    if (orbitRef.current) {
      orbitRef.current.mouseButtons = {
        LEFT: undefined,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      };
    }
  }, [orbitRef]);

  useEffect(() => {
    const dom = gl.domElement;
    const handleDown = (e) => {
      if (!orbitRef.current || e.button !== 0) return;
      if (e.shiftKey) {
        orbitRef.current.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      } else if (e.ctrlKey || e.metaKey) {
        orbitRef.current.mouseButtons.LEFT = THREE.MOUSE.PAN;
      } else {
        orbitRef.current.mouseButtons.LEFT = undefined;
      }
    };
    dom.addEventListener("pointerdown", handleDown, { capture: true });
    return () =>
      dom.removeEventListener("pointerdown", handleDown, { capture: true });
  }, [gl, orbitRef]);

  useEffect(() => {
    if (!cameraCmd || !orbitRef.current) return;
    const controls = orbitRef.current;
    const camera = controls.object;

    if (cameraCmd === "in" || cameraCmd === "out") {
      const dir = new THREE.Vector3().subVectors(
        camera.position,
        controls.target,
      );
      dir.multiplyScalar(cameraCmd === "in" ? 0.75 : 1.35);
      camera.position.copy(controls.target).add(dir);
    } else if (cameraCmd === "home") {
      camera.position.set(60, 60, 60);
      controls.target.set(0, 0, 0);
    } else if (cameraCmd === "fit") {
      const { objects, selectedIds } = useDesignStore.getState();
      const targets =
        selectedIds.length > 0
          ? objects.filter((o) => selectedIds.includes(o.id))
          : objects;
      if (targets.length > 0) {
        const box = new THREE.Box3();
        targets.forEach((o) => {
          const p = new THREE.Vector3(...o.position);
          box.expandByPoint(p);
        });
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z, 20);
        const dist = maxDim * 2.5;
        const offset = new THREE.Vector3(1, 1, 1)
          .normalize()
          .multiplyScalar(dist);
        camera.position.copy(center).add(offset);
        controls.target.copy(center);
      }
    }

    controls.update();
    clearCameraCmd();
  }, [cameraCmd, clearCameraCmd, orbitRef]);

  return (
    <OrbitControls
      ref={orbitRef}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      zoomSpeed={zoomSpeed}
      minDistance={1}
      maxDistance={2000}
    />
  );
}

function DragPreview() {
  const groupRef = useRef();
  const { camera } = useThree();
  const draggingShape = useDesignStore((s) => s.draggingShape);
  const snapIncrement = useDesignStore((s) => s.snapIncrement);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    [],
  );
  const hitPoint = useMemo(() => new THREE.Vector3(), []);

  const defaults = draggingShape
    ? SHAPE_DEFAULTS[draggingShape.type] || SHAPE_DEFAULTS.box
    : null;
  const previewRotation =
    draggingShape && FLAT_TYPES.includes(draggingShape.type)
      ? FLAT_ROTATION
      : draggingShape && DEFAULT_SHAPE_ROTATIONS[draggingShape.type]
        ? DEFAULT_SHAPE_ROTATIONS[draggingShape.type]
        : [0, 0, 0];
  const halfH = defaults
    ? getFloorY(draggingShape.type, defaults.geometry, previewRotation)
    : 10;
  const color = draggingShape?.isHole
    ? "#ff4444"
    : defaults?.color || "#6366f1";

  const previewType = draggingShape
    ? draggingShape.type === "text"
      ? "box"
      : draggingShape.type
    : "box";
  const previewParams = draggingShape
    ? draggingShape.type === "text"
      ? { width: 20, height: 10, depth: 5 }
      : defaults?.geometry || SHAPE_DEFAULTS.box.geometry
    : SHAPE_DEFAULTS.box.geometry;
  const previewGeo = useObjectGeometry(previewType, previewParams);

  useFrame(() => {
    if (!groupRef.current) return;
    if (!dragCursor.active || !draggingShape) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;
    raycaster.setFromCamera(dragCursor, camera);
    if (raycaster.ray.intersectPlane(plane, hitPoint)) {
      const sx = snapIncrement
        ? Math.round(hitPoint.x / snapIncrement) * snapIncrement
        : hitPoint.x;
      const sz = snapIncrement
        ? Math.round(hitPoint.z / snapIncrement) * snapIncrement
        : hitPoint.z;
      groupRef.current.position.set(sx, halfH, sz);
    }
  });

  if (!draggingShape || !defaults) return null;

  return (
    <group ref={groupRef} visible={false} rotation={previewRotation}>
      <mesh renderOrder={998} geometry={previewGeo}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>
      <mesh renderOrder={999} geometry={previewGeo}>
        <meshBasicMaterial
          color="#ffffff"
          wireframe
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function ArrayPreviewGhost({ obj, position }) {
  const previewType = obj.type === "text" ? "box" : obj.type;
  const previewParams =
    obj.type === "text"
      ? {
          width: 20,
          height: obj.geometry.size || 10,
          depth: obj.geometry.height || 5,
        }
      : obj.geometry;
  const previewGeo = useObjectGeometry(previewType, previewParams);

  return (
    <group position={position} rotation={obj.rotation} scale={obj.scale}>
      <mesh geometry={previewGeo} renderOrder={996}>
        <meshBasicMaterial
          color="#00f0ff"
          transparent
          opacity={0.14}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={previewGeo} renderOrder={997}>
        <meshBasicMaterial
          color="#00f0ff"
          wireframe
          transparent
          opacity={0.7}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}

function ArrayPreview() {
  const arrayPreview = useDesignStore((s) => s.arrayPreview);
  const selectedIds = useDesignStore((s) => s.selectedIds);
  const objects = useDesignStore((s) => s.objects);
  if (!arrayPreview || selectedIds.length === 0) return null;

  const ai = { x: 0, y: 1, z: 2 }[arrayPreview.axis];
  const count = Math.max(1, arrayPreview.count || 1);
  const spacing = Number(arrayPreview.spacing) || 0;
  const selected = objects.filter((o) => selectedIds.includes(o.id));
  if (selected.length === 0) return null;

  const ghosts = [];
  for (let i = 1; i <= count; i++) {
    selected.forEach((obj) => {
      const pos = [...obj.position];
      pos[ai] += spacing * i;
      ghosts.push({ obj, pos, key: `${obj.id}-${i}` });
    });
  }

  return (
    <>
      {ghosts.map((g) => (
        <ArrayPreviewGhost key={g.key} obj={g.obj} position={g.pos} />
      ))}
    </>
  );
}

function WorkplaneOverlay({ meshRefs, selectedId }) {
  const workplaneMode = useDesignStore((s) => s.workplaneMode);
  const objects = useDesignStore((s) => s.objects);
  if (!workplaneMode || !selectedId) return null;
  const obj = objects.find((o) => o.id === selectedId);
  const mesh = meshRefs.current[selectedId];
  if (!obj || !mesh) return null;

  const dims = getObjectDimensions(obj);
  const planeSize = Math.max(dims.width, dims.depth, 40) * 1.5;
  const half = planeSize / 2;
  const wpY = -dims.height / 2 - 0.25;
  const worldPos = new THREE.Vector3();
  mesh.getWorldPosition(worldPos);

  const gridCount = 10;
  const step = planeSize / gridCount;
  const gridLines = [];
  for (let i = 0; i <= gridCount; i++) {
    const offset = -half + i * step;
    gridLines.push(
      <Line
        key={`gx${i}`}
        points={[
          [-half, wpY, offset],
          [half, wpY, offset],
        ]}
        color="#4de8ff"
        lineWidth={0.6}
        transparent
        opacity={i === gridCount / 2 ? 0 : 0.3}
      />,
      <Line
        key={`gz${i}`}
        points={[
          [offset, wpY, -half],
          [offset, wpY, half],
        ]}
        color="#4de8ff"
        lineWidth={0.6}
        transparent
        opacity={i === gridCount / 2 ? 0 : 0.3}
      />,
    );
  }

  return (
    <group
      position={[worldPos.x, worldPos.y, worldPos.z]}
      quaternion={mesh.quaternion}
    >
      {/* Filled surface - depthTest off for guaranteed stability, very low opacity */}
      <mesh
        position={[0, wpY, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={-1}
      >
        <planeGeometry args={[planeSize, planeSize]} />
        <meshBasicMaterial
          color="#4de8ff"
          transparent
          opacity={0.06}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {gridLines}
      {/* Frame border */}
      <Line
        points={[
          [-half, wpY, -half],
          [half, wpY, -half],
          [half, wpY, half],
          [-half, wpY, half],
          [-half, wpY, -half],
        ]}
        color="#7af3ff"
        lineWidth={2}
        transparent
        opacity={0.9}
      />
      {/* Center crosshairs */}
      <Line
        points={[
          [-half, wpY, 0],
          [half, wpY, 0],
        ]}
        color="#b0f8ff"
        lineWidth={1.5}
        transparent
        opacity={0.8}
      />
      <Line
        points={[
          [0, wpY, -half],
          [0, wpY, half],
        ]}
        color="#b0f8ff"
        lineWidth={1.5}
        transparent
        opacity={0.8}
      />
      {/* Center dot */}
      <mesh
        position={[0, wpY + 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={996}
      >
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial
          color="#eaffff"
          transparent
          opacity={0.9}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// getObjectDimensions imported from ./dimensions

function DimensionLine({
  start,
  end,
  label,
  color = "#ff9f43",
  offset = [0, 0, 0],
}) {
  const mid = useMemo(
    () => [
      (start[0] + end[0]) / 2 + offset[0],
      (start[1] + end[1]) / 2 + offset[1],
      (start[2] + end[2]) / 2 + offset[2],
    ],
    [start, end, offset],
  );

  return (
    <group>
      <Line
        points={[start, end]}
        color={color}
        lineWidth={1.5}
        dashed
        dashSize={1}
        gapSize={0.5}
      />
      <Line
        points={[
          [start[0], start[1] - 0.8, start[2]],
          [start[0], start[1] + 0.8, start[2]],
        ]}
        color={color}
        lineWidth={1.5}
      />
      <Line
        points={[
          [end[0], end[1] - 0.8, end[2]],
          [end[0], end[1] + 0.8, end[2]],
        ]}
        color={color}
        lineWidth={1.5}
      />
      <Html position={mid} center style={{ pointerEvents: "none" }}>
        <div className="dml-ruler-label">{label}</div>
      </Html>
    </group>
  );
}

// Fix #6: Targeted selector — only subscribe to the single selected object, not the full array
function DimensionRuler({ meshRefs }) {
  const groupRef = useRef();
  const rulerVisible = useDesignStore((s) => s.rulerVisible);
  const units = useDesignStore((s) => s.units);
  const importedSizeRef = useRef(null);
  const obj = useDesignStore((s) => {
    if (!s.rulerVisible || s.selectedIds.length !== 1) return null;
    return s.objects.find((o) => o.id === s.selectedIds[0]) || null;
  });
  const fallbackDims = obj ? getObjectDimensions(obj) : null;

  useFrame(() => {
    if (!groupRef.current) return;
    if (!obj || !fallbackDims) {
      groupRef.current.visible = false;
      return;
    }
    const mesh = meshRefs.current[obj.id];
    if (!mesh) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;
    if (obj.type === "imported") {
      const box = new THREE.Box3().setFromObject(mesh);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      importedSizeRef.current = {
        width: size.x,
        height: size.y,
        depth: size.z,
      };
      groupRef.current.position.copy(center);
    } else {
      importedSizeRef.current = null;
      groupRef.current.position.copy(mesh.position);
    }
  });

  if (!obj || !fallbackDims) return null;

  const dims = importedSizeRef.current || fallbackDims;
  const halfW = dims.width / 2;
  const halfH = dims.height / 2;
  const halfD = dims.depth / 2;
  const gap = 4;
  const baseY = -halfH;
  const fmt = (v) => `${v.toFixed(1)} ${units}`;

  return (
    <group ref={groupRef}>
      <DimensionLine
        start={[-halfW, baseY, halfD + gap]}
        end={[halfW, baseY, halfD + gap]}
        label={fmt(dims.width)}
        color="#ff6b6b"
      />
      <DimensionLine
        start={[halfW + gap, baseY, halfD + gap]}
        end={[halfW + gap, halfH, halfD + gap]}
        label={fmt(dims.height)}
        color="#51cf66"
        offset={[1, 0, 0]}
      />
      <DimensionLine
        start={[halfW + gap, baseY, -halfD]}
        end={[halfW + gap, baseY, halfD]}
        label={fmt(dims.depth)}
        color="#339af0"
      />
    </group>
  );
}

function DropHandler() {
  const { camera } = useThree();
  const pendingDrop = useDesignStore((s) => s.pendingDrop);
  const clearPendingDrop = useDesignStore((s) => s.clearPendingDrop);
  const addObject = useDesignStore((s) => s.addObject);
  const snapIncrement = useDesignStore((s) => s.snapIncrement);

  useEffect(() => {
    if (!pendingDrop) return;

    const { ndc, type, isHole, text } = pendingDrop;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const intersected = raycaster.ray.intersectPlane(plane, hit);

    if (intersected) {
      const x = snapIncrement
        ? Math.round(hit.x / snapIncrement) * snapIncrement
        : hit.x;
      const z = snapIncrement
        ? Math.round(hit.z / snapIncrement) * snapIncrement
        : hit.z;

      const overrides = { position: [x, 0, z] };
      if (isHole) overrides.isHole = true;
      if (type === "text" && text) {
        overrides.geometry = { text, size: 10, height: 5, font: "helvetiker" };
      }
      addObject(type, overrides);
    }

    clearPendingDrop();
  }, [pendingDrop, camera, addObject, clearPendingDrop, snapIncrement]);

  return null;
}

// Fix #9: Hoist MeasureTool allocations to refs/useMemo
function MeasureTool() {
  const { camera, gl } = useThree();
  const measureActive = useDesignStore((s) => s.measureActive);
  const measurePoints = useDesignStore((s) => s.measurePoints);
  const addMeasurePoint = useDesignStore((s) => s.addMeasurePoint);
  const snapIncrement = useDesignStore((s) => s.snapIncrement);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const plane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    [],
  );
  const hit = useMemo(() => new THREE.Vector3(), []);

  const handleClick = useCallback(
    (e) => {
      if (!measureActive) return;
      if (e.button !== 0) return;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) {
        const x = snapIncrement
          ? Math.round(hit.x / snapIncrement) * snapIncrement
          : hit.x;
        const z = snapIncrement
          ? Math.round(hit.z / snapIncrement) * snapIncrement
          : hit.z;
        addMeasurePoint([x, 0, z]);
      }
    },
    [
      measureActive,
      camera,
      gl,
      addMeasurePoint,
      snapIncrement,
      raycaster,
      ndc,
      plane,
      hit,
    ],
  );

  useEffect(() => {
    const el = gl.domElement;
    el.addEventListener("click", handleClick);
    return () => el.removeEventListener("click", handleClick);
  }, [gl, handleClick]);

  if (!measureActive || measurePoints.length === 0) return null;

  const p1 = measurePoints[0];
  const p2 = measurePoints.length === 2 ? measurePoints[1] : null;

  const fmt = (v) => `${Math.abs(v).toFixed(1)}`;

  return (
    <group>
      <mesh position={p1}>
        <sphereGeometry args={[0.6, 16, 16]} />
        <meshBasicMaterial color="#ff6b6b" />
      </mesh>

      {p2 && (
        <>
          <mesh position={p2}>
            <sphereGeometry args={[0.6, 16, 16]} />
            <meshBasicMaterial color="#ff6b6b" />
          </mesh>

          <Line
            points={[p1, [p2[0], 0, p1[2]]]}
            color="#ef4444"
            lineWidth={2}
            dashed
            dashSize={1}
            gapSize={0.5}
          />
          <Line
            points={[[p2[0], 0, p1[2]], p2]}
            color="#3b82f6"
            lineWidth={2}
            dashed
            dashSize={1}
            gapSize={0.5}
          />
          <Line
            points={[p1, p2]}
            color="#22c55e"
            lineWidth={1.5}
            dashed
            dashSize={1.5}
            gapSize={0.8}
          />

          {Math.abs(p2[0] - p1[0]) > 0.01 && (
            <Html
              position={[(p1[0] + p2[0]) / 2, 1.5, p1[2]]}
              center
              className="dml-measure-label dml-measure-x"
            >
              X: {fmt(p2[0] - p1[0])}
            </Html>
          )}
          {Math.abs(p2[2] - p1[2]) > 0.01 && (
            <Html
              position={[p2[0], 1.5, (p1[2] + p2[2]) / 2]}
              center
              className="dml-measure-label dml-measure-z"
            >
              Z: {fmt(p2[2] - p1[2])}
            </Html>
          )}
          <Html
            position={[(p1[0] + p2[0]) / 2, 3.5, (p1[2] + p2[2]) / 2]}
            center
            className="dml-measure-label dml-measure-total"
          >
            {Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[2] - p1[2]) ** 2).toFixed(1)}
          </Html>
        </>
      )}
    </group>
  );
}

// --- Tinkercad-style Object Handles ---
// All handle types visible simultaneously: scale squares, rotation arcs, translate arrows
const AXIS_COLORS = ["#ef4444", "#22c55e", "#3b82f6"];
const AXIS_LABELS = ["X", "Y", "Z"];
const HOLE_ROUNDED_EDGE_TYPES = new Set([
  "sphere",
  "halfSphere",
  "cylinder",
  "halfCylinder",
  "cone",
  "torus",
  "tube",
  "ellipsoid",
  "paraboloid",
  "ring",
]);
const HOLE_EDGE_THRESHOLD_BY_TYPE = {
  torus: 10,
  tube: 10,
  ring: 10,
  cylinder: 20,
  halfCylinder: 20,
  cone: 20,
  sphere: 14,
  halfSphere: 14,
  ellipsoid: 2,
  paraboloid: 14,
};

const HANDLE_OFFSET = 3;

function getScaleHandles(type, geometry, objectDims = null) {
  const handles = [];
  const g = geometry;
  const o = HANDLE_OFFSET;
  switch (type) {
    case "box":
    case "wall":
    case "wedge": {
      const by = -g.height / 2;
      handles.push({
        param: "width",
        dir: [1, 0, 0],
        pos: [g.width / 2 + o, by, 0],
        label: "W",
      });
      handles.push({
        param: "width",
        dir: [-1, 0, 0],
        pos: [-g.width / 2 - o, by, 0],
        label: "W",
      });
      handles.push({
        param: "depth",
        dir: [0, 0, 1],
        pos: [0, by, g.depth / 2 + o],
        label: "D",
      });
      handles.push({
        param: "depth",
        dir: [0, 0, -1],
        pos: [0, by, -g.depth / 2 - o],
        label: "D",
      });
      handles.push({
        param: "height",
        dir: [0, 1, 0],
        pos: [0, g.height / 2 + o, 0],
        label: "H",
      });
      break;
    }
    case "sphere": {
      const by = -g.radius;
      handles.push({
        param: "radius",
        dir: [1, 0, 0],
        pos: [g.radius + o, by, 0],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [-1, 0, 0],
        pos: [-g.radius - o, by, 0],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [0, 0, 1],
        pos: [0, by, g.radius + o],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [0, 1, 0],
        pos: [0, g.radius + o, 0],
        label: "R",
      });
      break;
    }
    case "hemisphere": {
      // Hemisphere geometry is centered around Y after construction:
      // base at -r/2 and top at +r/2.
      const by = -g.radius / 2;
      handles.push({
        param: "radius",
        dir: [1, 0, 0],
        pos: [g.radius + o, by, 0],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [-1, 0, 0],
        pos: [-g.radius - o, by, 0],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [0, 0, 1],
        pos: [0, by, g.radius + o],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [0, 1, 0],
        pos: [0, g.radius / 2 + o, 0],
        label: "R",
      });
      break;
    }
    case "cylinder": {
      const by = -g.height / 2;
      handles.push({
        param: "radiusBottom",
        linkedParam: "radiusTop",
        dir: [1, 0, 0],
        pos: [g.radiusBottom + o, by, 0],
        label: "R",
      });
      handles.push({
        param: "radiusBottom",
        linkedParam: "radiusTop",
        dir: [-1, 0, 0],
        pos: [-g.radiusBottom - o, by, 0],
        label: "R",
      });
      if (Math.abs((g.radiusTop ?? 0) - (g.radiusBottom ?? 0)) > 0.001) {
        handles.push({
          param: "radiusTop",
          dir: [1, 0, 0],
          pos: [g.radiusTop + o, g.height / 2, 0],
          label: "Rt",
        });
      }
      handles.push({
        param: "height",
        dir: [0, 1, 0],
        pos: [0, g.height / 2 + o, 0],
        label: "H",
      });
      break;
    }
    case "cone":
    case "pyramid": {
      const by = -g.height / 2;
      handles.push({
        param: "radius",
        dir: [1, 0, 0],
        pos: [g.radius + o, by, 0],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [-1, 0, 0],
        pos: [-g.radius - o, by, 0],
        label: "R",
      });
      handles.push({
        param: "height",
        dir: [0, 1, 0],
        pos: [0, g.height / 2 + o, 0],
        label: "H",
      });
      break;
    }
    case "torus":
    case "tube":
      handles.push({
        param: "radius",
        dir: [1, 0, 0],
        pos: [g.radius + g.tube + o, 0, 0],
        label: "R",
      });
      handles.push({
        param: "tube",
        dir: [0, 0, 1],
        pos: [g.radius, 0, g.tube + o],
        label: "T",
      });
      break;
    case "heart":
      handles.push({
        param: "size",
        dir: [1, 0, 0],
        pos: [g.size + o, -g.depth / 2, 0],
        label: "S",
      });
      handles.push({
        param: "depth",
        dir: [0, 1, 0],
        pos: [0, g.depth / 2 + o, 0],
        label: "D",
      });
      break;
    case "star":
    case "starSix":
      handles.push({
        param: "outerRadius",
        dir: [1, 0, 0],
        pos: [g.outerRadius + o, -g.depth / 2, 0],
        label: "R",
      });
      handles.push({
        param: "outerRadius",
        dir: [0, 0, 1],
        pos: [0, -g.depth / 2, g.outerRadius + o],
        label: "R",
      });
      handles.push({
        param: "depth",
        dir: [0, 1, 0],
        pos: [0, g.depth / 2 + o, 0],
        label: "D",
      });
      break;
    case "tetrahedron":
    case "dodecahedron":
    case "octahedron":
    case "icosahedron": {
      const by = -g.radius;
      handles.push({
        param: "radius",
        dir: [1, 0, 0],
        pos: [g.radius + o, by, 0],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [-1, 0, 0],
        pos: [-g.radius - o, by, 0],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [0, 0, 1],
        pos: [0, by, g.radius + o],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [0, 1, 0],
        pos: [0, g.radius + o, 0],
        label: "R",
      });
      break;
    }
    case "ellipsoid": {
      const by = -g.radiusY;
      handles.push({
        param: "radiusX",
        dir: [1, 0, 0],
        pos: [g.radiusX + o, by, 0],
        label: "Rx",
      });
      handles.push({
        param: "radiusX",
        dir: [-1, 0, 0],
        pos: [-g.radiusX - o, by, 0],
        label: "Rx",
      });
      handles.push({
        param: "radiusZ",
        dir: [0, 0, 1],
        pos: [0, by, g.radiusZ + o],
        label: "Rz",
      });
      handles.push({
        param: "radiusZ",
        dir: [0, 0, -1],
        pos: [0, by, -g.radiusZ - o],
        label: "Rz",
      });
      handles.push({
        param: "radiusY",
        dir: [0, 1, 0],
        pos: [0, g.radiusY + o, 0],
        label: "Ry",
      });
      break;
    }
    case "triangularPrism":
    case "hexagonalPrism":
    case "pentagonalPrism": {
      const by = -g.height / 2;
      handles.push({
        param: "radius",
        dir: [1, 0, 0],
        pos: [g.radius + o, by, 0],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [-1, 0, 0],
        pos: [-g.radius - o, by, 0],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [0, 0, 1],
        pos: [0, by, g.radius + o],
        label: "R",
      });
      handles.push({
        param: "height",
        dir: [0, 1, 0],
        pos: [0, g.height / 2 + o, 0],
        label: "H",
      });
      break;
    }
    case "pentagonalPyramid":
    case "squarePyramid": {
      const by = -g.height / 2;
      handles.push({
        param: "radius",
        dir: [1, 0, 0],
        pos: [g.radius + o, by, 0],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [-1, 0, 0],
        pos: [-g.radius - o, by, 0],
        label: "R",
      });
      handles.push({
        param: "height",
        dir: [0, 1, 0],
        pos: [0, g.height / 2 + o, 0],
        label: "H",
      });
      break;
    }
    case "ring": {
      handles.push({
        param: "outerRadius",
        dir: [1, 0, 0],
        pos: [g.outerRadius + o, -g.height / 2, 0],
        label: "R",
      });
      handles.push({
        param: "outerRadius",
        dir: [0, 0, 1],
        pos: [0, -g.height / 2, g.outerRadius + o],
        label: "R",
      });
      handles.push({
        param: "innerRadius",
        dir: [-1, 0, 0],
        pos: [-g.innerRadius - o, -g.height / 2, 0],
        label: "Ri",
      });
      handles.push({
        param: "height",
        dir: [0, 1, 0],
        pos: [0, g.height / 2 + o, 0],
        label: "H",
      });
      break;
    }
    case "paraboloid": {
      const by = -g.height / 2;
      handles.push({
        param: "radius",
        dir: [1, 0, 0],
        pos: [g.radius + o, by, 0],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [-1, 0, 0],
        pos: [-g.radius - o, by, 0],
        label: "R",
      });
      handles.push({
        param: "radius",
        dir: [0, 0, 1],
        pos: [0, by, g.radius + o],
        label: "R",
      });
      handles.push({
        param: "height",
        dir: [0, 1, 0],
        pos: [0, g.height / 2 + o, 0],
        label: "H",
      });
      break;
    }
    case "imported": {
      const d = objectDims || { width: 20, height: 20, depth: 20 };
      const by = -d.height / 2;
      handles.push({
        scaleAxis: 0,
        dir: [1, 0, 0],
        pos: [d.width / 2 + o, by, 0],
        label: "W",
      });
      handles.push({
        scaleAxis: 0,
        dir: [-1, 0, 0],
        pos: [-d.width / 2 - o, by, 0],
        label: "W",
      });
      handles.push({
        scaleAxis: 2,
        dir: [0, 0, 1],
        pos: [0, by, d.depth / 2 + o],
        label: "D",
      });
      handles.push({
        scaleAxis: 2,
        dir: [0, 0, -1],
        pos: [0, by, -d.depth / 2 - o],
        label: "D",
      });
      handles.push({
        scaleAxis: 1,
        dir: [0, 1, 0],
        pos: [0, d.height / 2 + o, 0],
        label: "H",
      });
      break;
    }
    default:
      break;
  }
  return handles;
}

function ObjectHandles({ meshRefs, selectedId, orbitRef, setTransforming }) {
  const updateObjectSilent = useDesignStore((s) => s.updateObjectSilent);
  const workplaneMode = useDesignStore((s) => s.workplaneMode);
  const obj = useDesignStore((s) => {
    if (s.selectedIds.length !== 1) return null;
    const o = s.objects.find((o) => o.id === s.selectedIds[0]);
    if (!o || o.locked) return null;
    return o;
  });
  const snapIncrement = useDesignStore((s) => s.snapIncrement);
  const { camera, gl } = useThree();

  const drag = useRef(null);
  const startPt = useMemo(() => new THREE.Vector3(), []);
  const startValue = useRef(0);
  const startLinkedValue = useRef(0);
  const startObjScale = useRef([1, 1, 1]);
  const startPosition = useRef([0, 0, 0]);
  const prevAngleRef = useRef(0);
  const accumDelta = useRef(0);
  const startRotation = useRef([0, 0, 0]);
  const startQuat = useRef(new THREE.Quaternion());
  const objIdRef = useRef(null);

  const [hoveredArc, setHoveredArc] = useState(null);
  const [angleInfo, setAngleInfo] = useState(null);

  const interactionPlane = useMemo(() => new THREE.Plane(), []);
  const hitPoint = useMemo(() => new THREE.Vector3(), []);
  const caster = useMemo(() => new THREE.Raycaster(), []);
  const centerPt = useMemo(() => new THREE.Vector3(), []);
  const identityQuat = useMemo(() => new THREE.Quaternion(), []);

  const active = !!obj;
  const dims = active
    ? getObjectDimensions(obj)
    : { width: 20, height: 20, depth: 20 };
  const rawDims = active
    ? {
        width: dims.width / Math.abs(obj.scale[0]),
        height: dims.height / Math.abs(obj.scale[1]),
        depth: dims.depth / Math.abs(obj.scale[2]),
      }
    : dims;
  const maxDim = Math.max(rawDims.width, rawDims.height, rawDims.depth);
  const arcR = maxDim * 0.45 + 3;

  const arcBand = 2.0;
  const arcGeo = useMemo(
    () =>
      new THREE.RingGeometry(
        arcR - arcBand,
        arcR + arcBand,
        48,
        1,
        0,
        Math.PI / 2,
      ),
    [arcR],
  );
  const hoverRingGeo = useMemo(
    () =>
      new THREE.RingGeometry(
        arcR - arcBand,
        arcR + arcBand,
        64,
        1,
        0,
        Math.PI * 2,
      ),
    [arcR],
  );
  const scaleTriGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 1.5);
    s.lineTo(-1.3, -0.9);
    s.lineTo(1.3, -0.9);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.25,
      bevelEnabled: false,
    });
    geo.translate(0, 0, -0.125);
    return geo;
  }, []);
  const scaleTriEdges = useMemo(
    () => new THREE.EdgesGeometry(scaleTriGeo),
    [scaleTriGeo],
  );

  useEffect(() => {
    if (obj) objIdRef.current = obj.id;
  }, [obj]);

  useEffect(() => {
    return () => {
      if (drag.current) {
        drag.current = null;
        sceneInteracting.active = false;
        if (orbitRef.current) orbitRef.current.enabled = true;
      }
    };
  }, [orbitRef]);

  if (!active) return null;

  const mesh = meshRefs.current[selectedId];
  if (!mesh) return null;

  const worldPos = new THREE.Vector3();
  mesh.getWorldPosition(worldPos);
  let hw = dims.width / 2;
  let hh = dims.height / 2;
  let hd = dims.depth / 2;

  // Imported/CSG meshes may carry a local pivot offset; anchor handles to
  // world AABB center/base so base handles don't drift below the visual mesh.
  if (obj.type === "imported") {
    const box = new THREE.Box3().setFromObject(mesh);
    const boxSize = box.getSize(new THREE.Vector3());
    box.getCenter(worldPos);
    hw = boxSize.x / 2;
    hh = boxSize.y / 2;
    hd = boxSize.z / 2;
  }

  const scaleHandles = getScaleHandles(obj.type, obj.geometry, rawDims);

  const arrowGap = 10;
  const translateArrows = [
    {
      dir: [1, 0, 0],
      pos: [hw + arrowGap, 0, 0],
      rot: [0, 0, -Math.PI / 2],
      color: "#ef4444",
    },
    {
      dir: [-1, 0, 0],
      pos: [-hw - arrowGap, 0, 0],
      rot: [0, 0, Math.PI / 2],
      color: "#ef4444",
    },
    {
      dir: [0, 1, 0],
      pos: [0, hh + arrowGap, 0],
      rot: [0, 0, 0],
      color: "#22c55e",
    },
    {
      dir: [0, 0, 1],
      pos: [0, 0, hd + arrowGap],
      rot: [Math.PI / 2, 0, 0],
      color: "#3b82f6",
    },
    {
      dir: [0, 0, -1],
      pos: [0, 0, -hd - arrowGap],
      rot: [-Math.PI / 2, 0, 0],
      color: "#3b82f6",
    },
  ];

  const rotationArcs = [
    {
      axis: 0,
      pos: [-hw - 3, hh / 2, hd + 3],
      arcRot: [0, Math.PI / 2, 0],
      color: "#ef4444",
    },
    {
      axis: 1,
      pos: [hw + 3, -hh, 0],
      arcRot: [-Math.PI / 2, 0, 0],
      color: "#22c55e",
    },
    { axis: 2, pos: [hw + 3, 0, hd + 3], arcRot: [0, 0, 0], color: "#3b82f6" },
  ];

  const makeDragPlane = (axisDir, point) => {
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const pn = new THREE.Vector3()
      .crossVectors(axisDir, camDir)
      .cross(axisDir)
      .normalize();
    if (pn.lengthSq() < 0.001) pn.copy(camDir);
    interactionPlane.setFromNormalAndCoplanarPoint(pn, point);
  };

  const resolveScaleParams = (targetObj, handle, targetMesh) => {
    const axisParamMap = {
      box: ["width", "height", "depth"],
      wall: ["width", "height", "depth"],
      wedge: ["width", "height", "depth"],
      sphere: ["radius", "radius", "radius"],
      hemisphere: ["radius", "radius", "radius"],
      cylinder: ["radiusBottom", "height", "radiusBottom"],
      cone: ["radius", "height", "radius"],
      pyramid: ["radius", "height", "radius"],
      torus: ["radius", "tube", "radius"],
      tube: ["radius", "tube", "radius"],
      heart: ["size", "depth", "size"],
      star: ["outerRadius", "depth", "outerRadius"],
      starSix: ["outerRadius", "depth", "outerRadius"],
      text: ["size", "height", "size"],
      tetrahedron: ["radius", "radius", "radius"],
      dodecahedron: ["radius", "radius", "radius"],
      octahedron: ["radius", "radius", "radius"],
      icosahedron: ["radius", "radius", "radius"],
      ellipsoid: ["radiusX", "radiusY", "radiusZ"],
      triangularPrism: ["radius", "height", "radius"],
      hexagonalPrism: ["radius", "height", "radius"],
      pentagonalPrism: ["radius", "height", "radius"],
      pentagonalPyramid: ["radius", "height", "radius"],
      squarePyramid: ["radius", "height", "radius"],
      ring: ["outerRadius", "height", "outerRadius"],
      paraboloid: ["radius", "height", "radius"],
    };
    const axisLinkedMap = {
      cylinder: ["radiusTop", null, "radiusTop"],
    };

    const paramAxes = axisParamMap[targetObj.type];
    if (!paramAxes)
      return { param: handle.param, linkedParam: handle.linkedParam };

    const q = new THREE.Quaternion();
    targetMesh.getWorldQuaternion(q);
    const invQ = q.clone().invert();
    const localDir = new THREE.Vector3(...handle.dir)
      .applyQuaternion(invQ)
      .normalize();
    const ax = Math.abs(localDir.x);
    const ay = Math.abs(localDir.y);
    const az = Math.abs(localDir.z);
    const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;

    return {
      param: paramAxes[axis] || handle.param,
      linkedParam:
        (axisLinkedMap[targetObj.type] &&
          axisLinkedMap[targetObj.type][axis]) ||
        handle.linkedParam,
    };
  };

  const handleDomMove = (domEvent) => {
    if (!drag.current) return;
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((domEvent.clientX - rect.left) / rect.width) * 2 - 1,
      -((domEvent.clientY - rect.top) / rect.height) * 2 + 1,
    );
    caster.setFromCamera(ndc, camera);
    const id = objIdRef.current;

    if (drag.current.type === "scale") {
      if (caster.ray.intersectPlane(interactionPlane, hitPoint)) {
        const d = hitPoint.clone().sub(startPt).dot(drag.current.dirW);
        if (drag.current.handle.scaleAxis !== undefined) {
          const axis = drag.current.handle.scaleAxis;
          const base = Math.max(drag.current.baseSize || 1, 1);
          let factor = 1 + d / base;
          if (!Number.isFinite(factor)) factor = 1;
          const scale = [...startObjScale.current];
          scale[axis] = Math.max(0.01, startObjScale.current[axis] * factor);
          updateObjectSilent(id, { scale });
          return;
        }
        const val = Math.max(
          0.5,
          Math.round((startValue.current + d) * 10) / 10,
        );
        const cur = useDesignStore.getState().objects.find((o) => o.id === id);
        if (cur) {
          const geoUpdate = {
            ...cur.geometry,
            [drag.current.param]: val,
          };
          if (drag.current.linkedParam) {
            const delta = val - startValue.current;
            const linkedStart = startLinkedValue.current;
            geoUpdate[drag.current.linkedParam] = Math.max(
              0.5,
              Math.round((linkedStart + delta) * 10) / 10,
            );
          }
          updateObjectSilent(id, { geometry: geoUpdate });
        }
      }
    } else if (drag.current.type === "translate") {
      if (caster.ray.intersectPlane(interactionPlane, hitPoint)) {
        const d = hitPoint.clone().sub(startPt).dot(drag.current.dirW);
        const si = useDesignStore.getState().snapIncrement;
        const snapped = si ? Math.round(d / si) * si : d;
        const pos = [...startPosition.current];
        for (let i = 0; i < 3; i++)
          pos[i] += drag.current.dirW.getComponent(i) * snapped;
        updateObjectSilent(id, { position: pos });
      }
    } else if (drag.current.type === "rotate") {
      const rect = gl.domElement.getBoundingClientRect();
      const mx = domEvent.clientX - rect.left;
      const my = domEvent.clientY - rect.top;
      const cur = Math.atan2(
        my - drag.current.screenCy,
        mx - drag.current.screenCx,
      );

      let step = cur - prevAngleRef.current;
      while (step > Math.PI) step -= 2 * Math.PI;
      while (step < -Math.PI) step += 2 * Math.PI;
      step *= drag.current.sign;

      accumDelta.current += step;
      prevAngleRef.current = cur;
      let total = accumDelta.current;
      if (domEvent.shiftKey) {
        const snap = THREE.MathUtils.degToRad(15);
        total = Math.round(total / snap) * snap;
      }
      const deltaQ = new THREE.Quaternion().setFromAxisAngle(
        drag.current.worldAxis,
        total,
      );
      const newQ = deltaQ.multiply(startQuat.current.clone());
      const euler = new THREE.Euler().setFromQuaternion(newQ, "XYZ");
      updateObjectSilent(id, { rotation: [euler.x, euler.y, euler.z] });
      setAngleInfo({
        axis: drag.current.axis,
        deg: Math.round(THREE.MathUtils.radToDeg(total)),
      });
    }
  };

  const handleDomUp = () => {
    if (!drag.current) return;
    if (drag.current.type === "translate") setTransforming(false);
    if (drag.current.type === "rotate") {
      setHoveredArc(null);
      setAngleInfo(null);
    }
    drag.current = null;
    sceneInteracting.active = false;
    if (orbitRef.current) orbitRef.current.enabled = true;
    window.removeEventListener("pointermove", handleDomMove);
    window.removeEventListener("pointerup", handleDomUp);
  };

  const beginDrag = (e) => {
    e.stopPropagation();
    sceneInteracting.active = true;
    if (orbitRef.current) orbitRef.current.enabled = false;
    useDesignStore.getState()._saveSnapshot();
    window.addEventListener("pointermove", handleDomMove);
    window.addEventListener("pointerup", handleDomUp);
  };

  const onScaleDown = (e, handle) => {
    beginDrag(e);
    const dirW = new THREE.Vector3(...handle.dir).normalize();
    if (workplaneMode) {
      const q = new THREE.Quaternion();
      mesh.getWorldQuaternion(q);
      dirW.applyQuaternion(q).normalize();
    }
    makeDragPlane(dirW, e.point);
    const { param, linkedParam } =
      workplaneMode || handle.scaleAxis !== undefined
        ? { param: handle.param, linkedParam: handle.linkedParam }
        : resolveScaleParams(obj, handle, mesh);
    const baseSize =
      handle.scaleAxis === 0
        ? rawDims.width
        : handle.scaleAxis === 1
          ? rawDims.height
          : handle.scaleAxis === 2
            ? rawDims.depth
            : undefined;
    drag.current = {
      type: "scale",
      handle,
      dirW,
      param,
      linkedParam,
      baseSize,
    };
    startPt.copy(e.point);
    startObjScale.current = [...obj.scale];
    startValue.current = param ? obj.geometry[param] : 0;
    startLinkedValue.current = linkedParam ? obj.geometry[linkedParam] : 0;
  };

  const onTranslateDown = (e, arrow) => {
    beginDrag(e);
    setTransforming(true);
    const dirW = new THREE.Vector3(...arrow.dir).normalize();
    if (workplaneMode) {
      const q = new THREE.Quaternion();
      mesh.getWorldQuaternion(q);
      dirW.applyQuaternion(q).normalize();
    }
    makeDragPlane(dirW, e.point);
    drag.current = { type: "translate", dirW };
    startPt.copy(e.point);
    startPosition.current = [...obj.position];
  };

  const localAxes = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];

  const onRotateDown = (e, arc) => {
    beginDrag(e);
    centerPt.copy(worldPos);
    const worldAxis = localAxes[arc.axis].clone();
    if (workplaneMode) {
      worldAxis.applyQuaternion(mesh.quaternion).normalize();
    }

    const projected = centerPt.clone().project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    const cx = ((projected.x + 1) / 2) * rect.width;
    const cy = ((1 - projected.y) / 2) * rect.height;

    const ne = e.nativeEvent || e;
    const initAngle = Math.atan2(
      ne.clientY - rect.top - cy,
      ne.clientX - rect.left - cx,
    );
    prevAngleRef.current = initAngle;
    accumDelta.current = 0;
    startRotation.current = [...obj.rotation];
    startQuat.current.copy(mesh.quaternion);

    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const sign = worldAxis.dot(camDir) >= 0 ? 1 : -1;

    drag.current = {
      type: "rotate",
      axis: arc.axis,
      worldAxis,
      screenCx: cx,
      screenCy: cy,
      sign,
    };
    setHoveredArc(arc.axis);
  };

  const rotating = hoveredArc !== null && drag.current?.type === "rotate";

  return (
    <>
      {!rotating && (
        <group position={worldPos}>
          {/* Scale/Translate handles - world or local based on workplane mode */}
          <group quaternion={workplaneMode ? mesh.quaternion : identityQuat}>
            {scaleHandles.map((h, i) => {
              const [dx, dy, dz] = h.dir;
              let rotation;
              if (dy > 0) {
                rotation = [0, 0, 0];
              } else if (dy < 0) {
                rotation = [Math.PI, 0, 0];
              } else if (dx > 0) {
                rotation = [-Math.PI / 2, 0, -Math.PI / 2];
              } else if (dx < 0) {
                rotation = [-Math.PI / 2, 0, Math.PI / 2];
              } else if (dz > 0) {
                rotation = [-Math.PI / 2, 0, Math.PI];
              } else {
                rotation = [-Math.PI / 2, 0, 0];
              }
              return (
                <group key={`sc${i}`} position={h.pos} rotation={rotation}>
                  <mesh
                    onPointerDown={(e) => onScaleDown(e, h)}
                    renderOrder={999}
                    geometry={scaleTriGeo}
                    userData={{ isTransformHandle: true }}
                  >
                    <meshBasicMaterial
                      color="#1a1a2e"
                      depthTest={false}
                      depthWrite={false}
                    />
                  </mesh>
                  <lineSegments renderOrder={1000} geometry={scaleTriEdges}>
                    <lineBasicMaterial
                      color="white"
                      depthTest={false}
                      depthWrite={false}
                    />
                  </lineSegments>
                </group>
              );
            })}

            {/* Translate arrows - small cones outside each face */}
            {translateArrows.map((a, i) => (
              <mesh
                key={`tr${i}`}
                position={a.pos}
                rotation={a.rot}
                onPointerDown={(e) => onTranslateDown(e, a)}
                renderOrder={999}
                userData={{ isTransformHandle: true }}
              >
                <coneGeometry args={[1.2, 3, 6]} />
                <meshBasicMaterial
                  color={a.color}
                  depthTest={false}
                  depthWrite={false}
                  transparent
                  opacity={0.65}
                />
              </mesh>
            ))}
          </group>
        </group>
      )}

      {/* Rotation arcs - world-space, don't rotate with the object */}
      <group position={worldPos}>
        <group quaternion={workplaneMode ? mesh.quaternion : identityQuat}>
          {rotationArcs.map((arc) => {
            if (rotating && hoveredArc !== arc.axis) return null;
            return (
              <group
                key={`rot${arc.axis}`}
                position={arc.pos}
                rotation={arc.arcRot}
              >
                {hoveredArc === arc.axis && (
                  <mesh geometry={hoverRingGeo} renderOrder={998}>
                    <meshBasicMaterial
                      color={arc.color}
                      transparent
                      opacity={0.25}
                      depthTest={false}
                      depthWrite={false}
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                )}
                <mesh
                  geometry={arcGeo}
                  onPointerEnter={() => setHoveredArc(arc.axis)}
                  onPointerLeave={() => {
                    if (!drag.current || drag.current.type !== "rotate")
                      setHoveredArc(null);
                  }}
                  onPointerDown={(e) => onRotateDown(e, arc)}
                  renderOrder={999}
                  userData={{ isTransformHandle: true }}
                >
                  <meshBasicMaterial
                    color={arc.color}
                    transparent
                    opacity={0.65}
                    depthTest={false}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              </group>
            );
          })}
        </group>

        {/* Rotation angle indicator */}
        {angleInfo && (
          <Html
            center
            style={{ pointerEvents: "none" }}
            position={[0, hh + arcR + 4, 0]}
          >
            <div
              className="dml-rotation-label"
              style={{ color: AXIS_COLORS[angleInfo.axis] }}
            >
              {AXIS_LABELS[angleInfo.axis]}: {angleInfo.deg}°
            </div>
          </Html>
        )}
      </group>
    </>
  );
}

function GroupObjectHandles({
  meshRefs,
  selectedIds,
  orbitRef,
  setTransforming,
}) {
  const updateObjectSilent = useDesignStore((s) => s.updateObjectSilent);
  const batchUpdateObjects = useDesignStore((s) => s.batchUpdateObjects);
  const snapIncrement = useDesignStore((s) => s.snapIncrement);
  const objects = useDesignStore((s) => s.objects);
  const { camera, gl } = useThree();

  const selectedObjects = objects.filter((o) => selectedIds.includes(o.id));
  if (selectedObjects.length < 2) return null;
  if (selectedObjects.some((o) => o.locked)) return null;

  const box = new THREE.Box3();
  let hasMesh = false;
  selectedIds.forEach((id) => {
    const m = meshRefs.current[id];
    if (!m) return;
    const b = new THREE.Box3().setFromObject(m);
    if (!hasMesh) {
      box.copy(b);
      hasMesh = true;
    } else {
      box.union(b);
    }
  });
  if (!hasMesh) return null;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const hw = size.x / 2;
  const hh = size.y / 2;
  const hd = size.z / 2;
  const maxDim = Math.max(size.x, size.y, size.z);
  const arcR = maxDim * 0.55 + 5;

  const drag = useRef(null);
  const startPt = useMemo(() => new THREE.Vector3(), []);
  const interactionPlane = useMemo(() => new THREE.Plane(), []);
  const hitPoint = useMemo(() => new THREE.Vector3(), []);
  const caster = useMemo(() => new THREE.Raycaster(), []);
  const prevAngleRef = useRef(0);
  const accumDelta = useRef(0);
  const [hoveredArc, setHoveredArc] = useState(null);
  const [angleInfo, setAngleInfo] = useState(null);

  const arcBand = 2.0;
  const arcGeo = useMemo(
    () =>
      new THREE.RingGeometry(
        arcR - arcBand,
        arcR + arcBand,
        48,
        1,
        0,
        Math.PI / 2,
      ),
    [arcR],
  );
  const hoverRingGeo = useMemo(
    () =>
      new THREE.RingGeometry(
        arcR - arcBand,
        arcR + arcBand,
        64,
        1,
        0,
        Math.PI * 2,
      ),
    [arcR],
  );
  const scaleTriGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 1.5);
    s.lineTo(-1.3, -0.9);
    s.lineTo(1.3, -0.9);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.25,
      bevelEnabled: false,
    });
    geo.translate(0, 0, -0.125);
    return geo;
  }, []);
  const scaleTriEdges = useMemo(
    () => new THREE.EdgesGeometry(scaleTriGeo),
    [scaleTriGeo],
  );

  const makeDragPlane = (axisDir, point) => {
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const pn = new THREE.Vector3()
      .crossVectors(axisDir, camDir)
      .cross(axisDir)
      .normalize();
    if (pn.lengthSq() < 0.001) pn.copy(camDir);
    interactionPlane.setFromNormalAndCoplanarPoint(pn, point);
  };

  const handleDomMove = (domEvent) => {
    if (!drag.current) return;
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((domEvent.clientX - rect.left) / rect.width) * 2 - 1,
      -((domEvent.clientY - rect.top) / rect.height) * 2 + 1,
    );
    caster.setFromCamera(ndc, camera);

    if (drag.current.type === "translate") {
      if (caster.ray.intersectPlane(interactionPlane, hitPoint)) {
        const d = hitPoint.clone().sub(startPt).dot(drag.current.dirW);
        const si = useDesignStore.getState().snapIncrement;
        const snapped = si ? Math.round(d / si) * si : d;
        const updates = {};
        drag.current.ids.forEach((id) => {
          const s = drag.current.start[id];
          if (!s) return;
          updates[id] = {
            position: [
              s.position[0] + drag.current.dirW.x * snapped,
              s.position[1] + drag.current.dirW.y * snapped,
              s.position[2] + drag.current.dirW.z * snapped,
            ],
          };
        });
        batchUpdateObjects(updates);
      }
      return;
    }

    if (drag.current.type === "scale") {
      if (caster.ray.intersectPlane(interactionPlane, hitPoint)) {
        const d = hitPoint.clone().sub(startPt).dot(drag.current.dirW);
        let factor = Math.max(0.05, 1 + d / drag.current.baseSize);
        if (domEvent.shiftKey) factor = Math.round(factor * 10) / 10;
        const axis = drag.current.axis;
        const c = drag.current.center;
        const updates = {};
        drag.current.ids.forEach((id) => {
          const s = drag.current.start[id];
          if (!s) return;
          const pos = [...s.position];
          pos[axis] = c[axis] + (s.position[axis] - c[axis]) * factor;
          const scale = [...s.scale];
          scale[axis] = s.scale[axis] * factor;
          updates[id] = { position: pos, scale };
        });
        batchUpdateObjects(updates);
      }
      return;
    }

    if (drag.current.type === "rotate") {
      const mx = domEvent.clientX - rect.left;
      const my = domEvent.clientY - rect.top;
      const cur = Math.atan2(
        my - drag.current.screenCy,
        mx - drag.current.screenCx,
      );
      let step = cur - prevAngleRef.current;
      while (step > Math.PI) step -= 2 * Math.PI;
      while (step < -Math.PI) step += 2 * Math.PI;
      step *= drag.current.sign;
      accumDelta.current += step;
      prevAngleRef.current = cur;
      let total = accumDelta.current;
      if (domEvent.shiftKey) {
        const snap = THREE.MathUtils.degToRad(15);
        total = Math.round(total / snap) * snap;
      }
      const deltaQ = new THREE.Quaternion().setFromAxisAngle(
        drag.current.worldAxis,
        total,
      );
      const c = new THREE.Vector3(...drag.current.center);
      const updates = {};
      drag.current.ids.forEach((id) => {
        const s = drag.current.start[id];
        if (!s) return;
        const p = new THREE.Vector3(...s.position)
          .sub(c)
          .applyQuaternion(deltaQ)
          .add(c);
        const qStart = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(s.rotation[0], s.rotation[1], s.rotation[2], "XYZ"),
        );
        const qNew = deltaQ.clone().multiply(qStart);
        const e = new THREE.Euler().setFromQuaternion(qNew, "XYZ");
        updates[id] = { position: [p.x, p.y, p.z], rotation: [e.x, e.y, e.z] };
      });
      batchUpdateObjects(updates);
      setAngleInfo({
        axis: drag.current.axis,
        deg: Math.round(THREE.MathUtils.radToDeg(total)),
      });
    }
  };

  const handleDomUp = () => {
    if (!drag.current) return;
    if (drag.current.type === "translate") setTransforming(false);
    if (drag.current.type === "rotate") {
      setHoveredArc(null);
      setAngleInfo(null);
    }
    drag.current = null;
    sceneInteracting.active = false;
    if (orbitRef.current) orbitRef.current.enabled = true;
    window.removeEventListener("pointermove", handleDomMove);
    window.removeEventListener("pointerup", handleDomUp);
  };

  const beginDrag = (e) => {
    e.stopPropagation();
    sceneInteracting.active = true;
    if (orbitRef.current) orbitRef.current.enabled = false;
    useDesignStore.getState()._saveSnapshot();
    window.addEventListener("pointermove", handleDomMove);
    window.addEventListener("pointerup", handleDomUp);
  };

  const captureStart = () => {
    const state = useDesignStore.getState();
    const start = {};
    selectedIds.forEach((id) => {
      const o = state.objects.find((x) => x.id === id);
      if (!o) return;
      start[id] = {
        position: [...o.position],
        rotation: [...o.rotation],
        scale: [...o.scale],
      };
    });
    return start;
  };

  const onTranslateDown = (e, dir) => {
    beginDrag(e);
    setTransforming(true);
    const dirW = new THREE.Vector3(...dir).normalize();
    makeDragPlane(dirW, e.point);
    drag.current = {
      type: "translate",
      ids: [...selectedIds],
      start: captureStart(),
      dirW,
    };
    startPt.copy(e.point);
  };

  const onScaleDown = (e, axis) => {
    beginDrag(e);
    const dirMap = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ];
    const dirW = dirMap[axis].clone();
    makeDragPlane(dirW, e.point);
    drag.current = {
      type: "scale",
      ids: [...selectedIds],
      start: captureStart(),
      axis,
      dirW,
      center: [center.x, center.y, center.z],
      baseSize: Math.max(axis === 0 ? size.x : axis === 1 ? size.y : size.z, 1),
    };
    startPt.copy(e.point);
  };

  const onRotateDown = (e, axis) => {
    beginDrag(e);
    const localAxes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ];
    const worldAxis = localAxes[axis].clone();
    const projected = center.clone().project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    const cx = ((projected.x + 1) / 2) * rect.width;
    const cy = ((1 - projected.y) / 2) * rect.height;
    const ne = e.nativeEvent || e;
    prevAngleRef.current = Math.atan2(
      ne.clientY - rect.top - cy,
      ne.clientX - rect.left - cx,
    );
    accumDelta.current = 0;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const sign = worldAxis.dot(camDir) >= 0 ? 1 : -1;
    drag.current = {
      type: "rotate",
      ids: [...selectedIds],
      start: captureStart(),
      axis,
      worldAxis,
      center: [center.x, center.y, center.z],
      screenCx: cx,
      screenCy: cy,
      sign,
    };
    setHoveredArc(axis);
  };

  const rotating = hoveredArc !== null && drag.current?.type === "rotate";

  const translateArrows = [
    {
      dir: [1, 0, 0],
      pos: [hw + 10, 0, 0],
      rot: [0, 0, -Math.PI / 2],
      color: "#ef4444",
    },
    {
      dir: [-1, 0, 0],
      pos: [-hw - 10, 0, 0],
      rot: [0, 0, Math.PI / 2],
      color: "#ef4444",
    },
    { dir: [0, 1, 0], pos: [0, hh + 10, 0], rot: [0, 0, 0], color: "#22c55e" },
    {
      dir: [0, 0, 1],
      pos: [0, 0, hd + 10],
      rot: [Math.PI / 2, 0, 0],
      color: "#3b82f6",
    },
    {
      dir: [0, 0, -1],
      pos: [0, 0, -hd - 10],
      rot: [-Math.PI / 2, 0, 0],
      color: "#3b82f6",
    },
  ];
  const scaleHandles = [
    // X/Z handles sit on the base ring of the combined selection (y = -hh)
    {
      axis: 0,
      pos: [hw + 5, -hh, 0],
      rot: [-Math.PI / 2, 0, -Math.PI / 2],
      color: "#ef4444",
    },
    {
      axis: 0,
      pos: [-hw - 5, -hh, 0],
      rot: [-Math.PI / 2, 0, Math.PI / 2],
      color: "#ef4444",
    },
    {
      axis: 2,
      pos: [0, -hh, hd + 5],
      rot: [Math.PI / 2, 0, 0],
      color: "#3b82f6",
    },
    {
      axis: 2,
      pos: [0, -hh, -hd - 5],
      rot: [-Math.PI / 2, 0, 0],
      color: "#3b82f6",
    },
    // Y handle remains at top
    { axis: 1, pos: [0, hh + 5, 0], rot: [0, 0, 0], color: "#22c55e" },
  ];
  const rotationArcs = [
    {
      axis: 0,
      pos: [-hw - 3, hh / 2, hd + 3],
      arcRot: [0, Math.PI / 2, 0],
      color: "#ef4444",
    },
    {
      axis: 1,
      pos: [hw + 3, -hh, 0],
      arcRot: [-Math.PI / 2, 0, 0],
      color: "#22c55e",
    },
    { axis: 2, pos: [hw + 3, 0, hd + 3], arcRot: [0, 0, 0], color: "#3b82f6" },
  ];

  return (
    <>
      {!rotating && (
        <group position={[center.x, center.y, center.z]}>
          {scaleHandles.map((h, i) => (
            <group key={`gsc${i}`} position={h.pos} rotation={h.rot}>
              <mesh
                onPointerDown={(e) => onScaleDown(e, h.axis)}
                renderOrder={999}
                geometry={scaleTriGeo}
                userData={{ isTransformHandle: true }}
              >
                <meshBasicMaterial
                  color="#1a1a2e"
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>
              <lineSegments renderOrder={1000} geometry={scaleTriEdges}>
                <lineBasicMaterial
                  color="white"
                  depthTest={false}
                  depthWrite={false}
                />
              </lineSegments>
            </group>
          ))}
          {translateArrows.map((a, i) => (
            <mesh
              key={`gtr${i}`}
              position={a.pos}
              rotation={a.rot}
              onPointerDown={(e) => onTranslateDown(e, a.dir)}
              renderOrder={999}
              userData={{ isTransformHandle: true }}
            >
              <coneGeometry args={[1.2, 3, 6]} />
              <meshBasicMaterial
                color={a.color}
                depthTest={false}
                depthWrite={false}
                transparent
                opacity={0.65}
              />
            </mesh>
          ))}
        </group>
      )}
      <group position={[center.x, center.y, center.z]}>
        {rotationArcs.map((arc) => {
          if (rotating && hoveredArc !== arc.axis) return null;
          return (
            <group
              key={`grot${arc.axis}`}
              position={arc.pos}
              rotation={arc.arcRot}
            >
              {hoveredArc === arc.axis && (
                <mesh geometry={hoverRingGeo} renderOrder={998}>
                  <meshBasicMaterial
                    color={arc.color}
                    transparent
                    opacity={0.25}
                    depthTest={false}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              )}
              <mesh
                geometry={arcGeo}
                onPointerEnter={() => setHoveredArc(arc.axis)}
                onPointerLeave={() => {
                  if (!drag.current || drag.current.type !== "rotate")
                    setHoveredArc(null);
                }}
                onPointerDown={(e) => onRotateDown(e, arc.axis)}
                renderOrder={999}
                userData={{ isTransformHandle: true }}
              >
                <meshBasicMaterial
                  color={arc.color}
                  transparent
                  opacity={0.65}
                  depthTest={false}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          );
        })}
        {angleInfo && (
          <Html
            center
            style={{ pointerEvents: "none" }}
            position={[0, hh + arcR + 4, 0]}
          >
            <div
              className="dml-rotation-label"
              style={{ color: AXIS_COLORS[angleInfo.axis] }}
            >
              {AXIS_LABELS[angleInfo.axis]}: {angleInfo.deg}°
            </div>
          </Html>
        )}
      </group>
    </>
  );
}

const HANDLES_LAYER = 31;

function HandlesOverlay({ children }) {
  const groupRef = useRef();
  const { gl, scene, camera, raycaster } = useThree();

  useEffect(() => {
    raycaster.layers.enable(HANDLES_LAYER);
    return () => raycaster.layers.disable(HANDLES_LAYER);
  }, [raycaster]);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.traverse((child) => {
      if (child.layers.isEnabled(0)) {
        child.layers.disable(0);
        child.layers.enable(HANDLES_LAYER);
      }
    });
  }, -1);

  useFrame(() => {
    if (!groupRef.current || groupRef.current.children.length === 0) return;
    gl.autoClear = false;
    gl.setRenderTarget(null);
    gl.clearDepth();
    camera.layers.set(HANDLES_LAYER);
    gl.render(scene, camera);
    camera.layers.set(0);
  }, 2);

  return <group ref={groupRef}>{children}</group>;
}

const SNAP_THRESHOLD = 3;
const AXES = ["x", "y", "z"];
const SNAP_COLORS = ["#ef4444", "#22c55e", "#3b82f6"];
const SNAP_DIRS = [
  [0, 0, 1],
  [1, 0, 0],
  [1, 0, 0],
];

// Fix #3 + #4: Pre-allocate Box3; replace JSON.stringify with value comparison
function FaceSnapper({ meshRefs, selectedId, active }) {
  const faceSnap = useDesignStore((s) => s.faceSnap);
  const objects = useDesignStore((s) => s.objects);
  const snapLines = useRef([]);
  const [lines, setLines] = useState([]);

  const selBox = useMemo(() => new THREE.Box3(), []);
  const tgtBox = useMemo(() => new THREE.Box3(), []);
  const midVec = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!active || !faceSnap || !selectedId || !meshRefs.current[selectedId]) {
      if (snapLines.current.length > 0) {
        snapLines.current = [];
        setLines([]);
      }
      return;
    }
    const selMesh = meshRefs.current[selectedId];
    selBox.setFromObject(selMesh);
    const newLines = [];

    for (const obj of objects) {
      if (obj.id === selectedId) continue;
      const tgtMesh = meshRefs.current[obj.id];
      if (!tgtMesh) continue;
      tgtBox.setFromObject(tgtMesh);

      for (let ax = 0; ax < 3; ax++) {
        const a = AXES[ax];
        const pairs = [
          { sf: selBox.max[a], tf: tgtBox.min[a] },
          { sf: selBox.min[a], tf: tgtBox.max[a] },
          { sf: selBox.min[a], tf: tgtBox.min[a] },
          { sf: selBox.max[a], tf: tgtBox.max[a] },
        ];

        for (const { sf, tf } of pairs) {
          const dist = Math.abs(sf - tf);
          if (dist < SNAP_THRESHOLD) {
            const delta = tf - sf;
            selMesh.position[a] += delta;
            selBox.min[a] += delta;
            selBox.max[a] += delta;

            midVec.x =
              (selBox.min.x + selBox.max.x + tgtBox.min.x + tgtBox.max.x) / 4;
            midVec.y =
              (selBox.min.y + selBox.max.y + tgtBox.min.y + tgtBox.max.y) / 4;
            midVec.z =
              (selBox.min.z + selBox.max.z + tgtBox.min.z + tgtBox.max.z) / 4;
            midVec[a] = tf;
            newLines.push({ pos: midVec.toArray(), axis: ax });
            break;
          }
        }
      }
    }

    const prev = snapLines.current;
    let changed = prev.length !== newLines.length;
    if (!changed) {
      for (let i = 0; i < newLines.length; i++) {
        if (
          prev[i].axis !== newLines[i].axis ||
          prev[i].pos[0] !== newLines[i].pos[0] ||
          prev[i].pos[1] !== newLines[i].pos[1] ||
          prev[i].pos[2] !== newLines[i].pos[2]
        ) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      snapLines.current = newLines;
      setLines(newLines);
    }
  });

  return (
    <>
      {lines.map((l, i) => {
        const d = SNAP_DIRS[l.axis];
        const p = l.pos;
        return (
          <Line
            key={i}
            points={[
              [p[0] - d[0] * 30, p[1] - d[1] * 30, p[2] - d[2] * 30],
              [p[0] + d[0] * 30, p[1] + d[1] * 30, p[2] + d[2] * 30],
            ]}
            color={SNAP_COLORS[l.axis]}
            lineWidth={1.5}
            dashed
            dashSize={2}
            gapSize={1}
            transparent
            opacity={0.6}
          />
        );
      })}
    </>
  );
}

function MirrorHintOverlay() {
  const mirrorHint = useDesignStore((s) => s.mirrorHint);
  const [show, setShow] = useState(null);

  useEffect(() => {
    if (!mirrorHint) return;
    setShow(mirrorHint);
    const t = setTimeout(() => setShow(null), 900);
    return () => clearTimeout(t);
  }, [mirrorHint]);

  if (!show) return null;

  const label =
    show.axis === "x"
      ? "Mirror X \u2194"
      : show.axis === "y"
        ? "Mirror Y \u2195"
        : "Mirror Z \u2194";

  return (
    <Html fullscreen style={{ pointerEvents: "none" }}>
      <div className="dml-mirror-hint">{label}</div>
    </Html>
  );
}

function MirrorPreviewObject({ obj, axis, centerAxis }) {
  const previewType = obj.type === "text" ? "box" : obj.type;
  const previewParams =
    obj.type === "text"
      ? {
          width: 20,
          height: obj.geometry.size || 10,
          depth: obj.geometry.height || 5,
        }
      : obj.geometry;
  const geometry = useObjectGeometry(previewType, previewParams);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  const pos = [...obj.position];
  const scale = [...obj.scale];
  const ai = { x: 0, y: 1, z: 2 }[axis];
  pos[ai] = 2 * centerAxis - pos[ai];
  scale[ai] *= -1;

  return (
    <group position={pos} rotation={obj.rotation} scale={scale}>
      <mesh geometry={geometry} renderOrder={997} raycast={() => null}>
        <meshBasicMaterial
          color="#00f0ff"
          transparent
          opacity={0.12}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={edges} renderOrder={998} raycast={() => null}>
        <lineBasicMaterial color="#00f0ff" depthTest={false} />
      </lineSegments>
    </group>
  );
}

function MirrorAxisGizmo({ meshRefs, selectedIds }) {
  const mirrorMode = useDesignStore((s) => s.mirrorMode);
  const mirrorSelected = useDesignStore((s) => s.mirrorSelected);
  const objects = useDesignStore((s) => s.objects);
  const [hoveredAxis, setHoveredAxis] = useState(null);

  if (!mirrorMode || selectedIds.length === 0) return null;
  const selected = objects.filter((o) => selectedIds.includes(o.id));
  if (selected.some((o) => o.locked)) return null;

  const box = new THREE.Box3();
  let hasMesh = false;
  selectedIds.forEach((id) => {
    const m = meshRefs.current[id];
    if (!m) return;
    const b = new THREE.Box3().setFromObject(m);
    if (!hasMesh) {
      box.copy(b);
      hasMesh = true;
    } else {
      box.union(b);
    }
  });
  if (!hasMesh) return null;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const len = Math.max(size.x, size.y, size.z) * 0.7 + 10;
  const axisCenter = {
    x:
      selected.reduce((sum, o) => sum + o.position[0], 0) /
      Math.max(selected.length, 1),
    y:
      selected.reduce((sum, o) => sum + o.position[1], 0) /
      Math.max(selected.length, 1),
    z:
      selected.reduce((sum, o) => sum + o.position[2], 0) /
      Math.max(selected.length, 1),
  };

  const axes = [
    {
      axis: "x",
      color: "#ef4444",
      dir: [1, 0, 0],
      conePos: [len, 0, 0],
      coneNeg: [-len, 0, 0],
      rotPos: [-Math.PI / 2, 0, -Math.PI / 2],
      rotNeg: [-Math.PI / 2, 0, Math.PI / 2],
      labelPos: [len + 4, 0, 0],
    },
    {
      axis: "y",
      color: "#22c55e",
      dir: [0, 1, 0],
      conePos: [0, len, 0],
      coneNeg: [0, -len, 0],
      rotPos: [0, 0, 0],
      rotNeg: [Math.PI, 0, 0],
      labelPos: [0, len + 4, 0],
    },
    {
      axis: "z",
      color: "#3b82f6",
      dir: [0, 0, 1],
      conePos: [0, 0, len],
      coneNeg: [0, 0, -len],
      rotPos: [Math.PI / 2, 0, 0],
      rotNeg: [-Math.PI / 2, 0, 0],
      labelPos: [0, 0, len + 4],
    },
  ];

  return (
    <>
      {hoveredAxis &&
        selected.map((obj) => (
          <MirrorPreviewObject
            key={`mirror-preview-${obj.id}`}
            obj={obj}
            axis={hoveredAxis}
            centerAxis={axisCenter[hoveredAxis]}
          />
        ))}
      <group position={[center.x, center.y, center.z]}>
        {axes.map((a) => (
          <group key={a.axis}>
            <Line
              points={[
                [-a.dir[0] * len, -a.dir[1] * len, -a.dir[2] * len],
                [a.dir[0] * len, a.dir[1] * len, a.dir[2] * len],
              ]}
              color={a.color}
              lineWidth={2}
              transparent
              opacity={0.95}
            />
            <mesh
              position={a.conePos}
              rotation={a.rotPos}
              onPointerEnter={() => setHoveredAxis(a.axis)}
              onPointerLeave={() => setHoveredAxis(null)}
              onPointerDown={(e) => {
                e.stopPropagation();
                mirrorSelected(a.axis);
                setHoveredAxis(null);
              }}
              renderOrder={1000}
            >
              <coneGeometry args={[1.4, 3.2, 8]} />
              <meshBasicMaterial
                color={a.color}
                depthTest={false}
                transparent
                opacity={0.95}
              />
            </mesh>
            <mesh
              position={a.coneNeg}
              rotation={a.rotNeg}
              onPointerEnter={() => setHoveredAxis(a.axis)}
              onPointerLeave={() => setHoveredAxis(null)}
              onPointerDown={(e) => {
                e.stopPropagation();
                mirrorSelected(a.axis);
                setHoveredAxis(null);
              }}
              renderOrder={1000}
            >
              <coneGeometry args={[1.4, 3.2, 8]} />
              <meshBasicMaterial
                color={a.color}
                depthTest={false}
                transparent
                opacity={0.95}
              />
            </mesh>
            <Html
              position={a.labelPos}
              center
              style={{ pointerEvents: "none" }}
            >
              <div className="dml-mirror-axis-label">
                {a.axis.toUpperCase()}
              </div>
            </Html>
          </group>
        ))}
      </group>
    </>
  );
}

function SceneContent() {
  const meshRefs = useRef({});
  const orbitRef = useRef();
  const { camera, gl } = useThree();
  const [transforming, setTransforming] = useState(false);

  useEffect(() => {
    sceneCamera.current = camera;
  }, [camera]);

  const objects = useDesignStore((s) => s.objects);
  const selectedIds = useDesignStore((s) => s.selectedIds);
  const gridVisible = useDesignStore((s) => s.gridVisible);
  const wireframe = useDesignStore((s) => s.wireframe);
  const snapIncrement = useDesignStore((s) => s.snapIncrement);
  const shadowsEnabled = useDesignStore((s) => s.shadowsEnabled);
  const mirrorMode = useDesignStore((s) => s.mirrorMode);
  const clearSelection = useDesignStore((s) => s.clearSelection);
  const selectObject = useDesignStore((s) => s.selectObject);
  const updateObjectSilent = useDesignStore((s) => s.updateObjectSilent);

  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;

  const objDrag = useRef(null);
  const dragPlane = useMemo(() => new THREE.Plane(), []);
  const dragRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const dragHit = useMemo(() => new THREE.Vector3(), []);
  const dragOffset = useMemo(() => new THREE.Vector3(), []);
  const surfaceRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const MIN_DRAG = 3;

  const handleObjDragMove = useCallback(
    (domEvent) => {
      if (!objDrag.current) return;
      const d = objDrag.current;
      if (!d.dragging) {
        const dx = domEvent.clientX - d.startMouse.x;
        const dy = domEvent.clientY - d.startMouse.y;
        if (Math.abs(dx) < MIN_DRAG && Math.abs(dy) < MIN_DRAG) return;
        d.dragging = true;
        useDesignStore.getState()._saveSnapshot();
        if (orbitRef.current) orbitRef.current.enabled = false;
        setTransforming(true);
      }
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((domEvent.clientX - rect.left) / rect.width) * 2 - 1,
        -((domEvent.clientY - rect.top) / rect.height) * 2 + 1,
      );
      dragRaycaster.setFromCamera(ndc, camera);
      if (dragRaycaster.ray.intersectPlane(dragPlane, dragHit)) {
        const state = useDesignStore.getState();
        const si = state.snapIncrement;
        let nx = dragHit.x - dragOffset.x;
        let nz = dragHit.z - dragOffset.z;
        if (si) {
          nx = Math.round(nx / si) * si;
          nz = Math.round(nz / si) * si;
        }
        const cur = state.objects.find((o) => o.id === d.anchorId);
        if (!cur) return;

        const draggedHalfH = getFloorY(
          cur.type,
          cur.geometry,
          cur.rotation,
          cur.scale,
        );
        let ny = cur.position[1];

        if (state.faceSnap) {
          const otherMeshes = [];
          for (const [id, group] of Object.entries(meshRefs.current)) {
            if (d.ids.includes(id)) continue;
            group.traverse((child) => {
              if (child.isMesh) otherMeshes.push(child);
            });
          }

          if (otherMeshes.length > 0) {
            surfaceRaycaster.set(
              new THREE.Vector3(nx, 500, nz),
              new THREE.Vector3(0, -1, 0),
            );
            const surfaceHits = surfaceRaycaster.intersectObjects(
              otherMeshes,
              false,
            );
            const topHit = surfaceHits.find((h) => {
              let p = h.object;
              while (p) {
                if (p.userData?.isSceneObject) return true;
                p = p.parent;
              }
              return false;
            });

            if (topHit) {
              ny = topHit.point.y + draggedHalfH;
            } else {
              ny = draggedHalfH;
            }
          } else {
            ny = draggedHalfH;
          }
        }

        const anchorStart = d.startPositions[d.anchorId];
        if (!anchorStart) return;
        const dx = nx - anchorStart[0];
        const dy = ny - anchorStart[1];
        const dz = nz - anchorStart[2];
        const dragUpdates = {};
        d.ids.forEach((id) => {
          const start = d.startPositions[id];
          if (!start) return;
          dragUpdates[id] = {
            position: [start[0] + dx, start[1] + dy, start[2] + dz],
          };
        });
        useDesignStore.getState().batchUpdateObjects(dragUpdates);
      }
    },
    [
      camera,
      gl,
      dragPlane,
      dragRaycaster,
      dragHit,
      dragOffset,
      surfaceRaycaster,
      updateObjectSilent,
    ],
  );

  const handleObjDragUp = useCallback(() => {
    if (objDrag.current?.dragging) {
      setTransforming(false);
      if (orbitRef.current) orbitRef.current.enabled = true;
    }
    objDrag.current = null;
    sceneInteracting.active = false;
    window.removeEventListener("pointermove", handleObjDragMove);
    window.removeEventListener("pointerup", handleObjDragUp);
  }, [handleObjDragMove]);

  const handleObjDragStart = useCallback(
    (e, id) => {
      const handleHit = (e.intersections || []).some((hit) => {
        let node = hit.object;
        while (node) {
          if (node.userData?.isTransformHandle) return true;
          node = node.parent;
        }
        return false;
      });
      if (handleHit) return;
      e.stopPropagation();
      const state = useDesignStore.getState();
      const obj = state.objects.find((o) => o.id === id);
      if (!obj || obj.locked) return;
      const nativeEvt = e.nativeEvent || e;
      if (!nativeEvt.shiftKey) {
        selectObject(id, false);
      }
      const selectedAfter = useDesignStore.getState().selectedIds;
      const dragIds = selectedAfter.includes(id) ? selectedAfter : [id];
      const hasLocked = dragIds.some((sid) => {
        const so = useDesignStore.getState().objects.find((o) => o.id === sid);
        return !!so?.locked;
      });
      if (hasLocked) return;
      const startPositions = {};
      dragIds.forEach((sid) => {
        const so = useDesignStore.getState().objects.find((o) => o.id === sid);
        if (so) startPositions[sid] = [...so.position];
      });
      dragPlane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(obj.position[0], obj.position[1], obj.position[2]),
      );
      dragOffset.set(
        e.point.x - obj.position[0],
        0,
        e.point.z - obj.position[2],
      );
      objDrag.current = {
        anchorId: id,
        ids: dragIds,
        startPositions,
        dragging: false,
        startMouse: {
          x: nativeEvt.clientX,
          y: nativeEvt.clientY,
        },
      };
      window.addEventListener("pointermove", handleObjDragMove);
      window.addEventListener("pointerup", handleObjDragUp);
    },
    [dragPlane, dragOffset, selectObject, handleObjDragMove, handleObjDragUp],
  );

  const visibleObjects = useMemo(
    () => objects.filter((obj) => obj.visible !== false),
    [objects],
  );

  const selectedOutlineMeshes = [];
  selectedIds.forEach((id) => {
    const group = meshRefs.current[id];
    if (!group) return;
    group.traverse((child) => {
      if (child.isMesh) selectedOutlineMeshes.push(child);
    });
  });

  return (
    <>
      <CameraSetup />

      <ambientLight intensity={0.4} />
      <directionalLight
        position={[50, 100, 50]}
        intensity={0.8}
        castShadow={shadowsEnabled}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={500}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
      />
      <directionalLight position={[-30, 60, -40]} intensity={0.3} />
      <hemisphereLight args={["#b1e1ff", "#b97a20", 0.25]} />
      <Environment preset="city" environmentIntensity={0.3} />

      {gridVisible && (
        <Grid
          position={[0, 0, 0]}
          args={[200, 200]}
          cellSize={snapIncrement || 1}
          sectionSize={(snapIncrement || 1) * 10}
          fadeDistance={300}
          fadeStrength={1.5}
          cellColor="#a8c8e8"
          sectionColor="#6a9fd8"
          cellThickness={0.6}
          sectionThickness={1.2}
          followCamera
          infiniteGrid
          side={THREE.DoubleSide}
        />
      )}

      {/* Fix #5: Use module-level constants for axis line positions */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={X_AXIS_POSITIONS}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#ef4444" opacity={0.4} transparent />
      </line>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={Z_AXIS_POSITIONS}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#3b82f6" opacity={0.4} transparent />
      </line>

      {visibleObjects.map((obj) => (
        <SceneObject
          key={obj.id}
          ref={(el) => {
            if (el) meshRefs.current[obj.id] = el;
            else delete meshRefs.current[obj.id];
          }}
          obj={obj}
          isSelected={selectedIds.includes(obj.id)}
          wireframe={wireframe}
          onSelect={(e) => {
            e.stopPropagation();
            if (!objDrag.current?.dragging) selectObject(obj.id, e.shiftKey);
          }}
          onDragStart={handleObjDragStart}
        />
      ))}

      <HandlesOverlay>
        {!mirrorMode &&
          (selectedIds.length > 1 ? (
            <GroupObjectHandles
              meshRefs={meshRefs}
              selectedIds={selectedIds}
              orbitRef={orbitRef}
              setTransforming={setTransforming}
            />
          ) : (
            <ObjectHandles
              meshRefs={meshRefs}
              selectedId={selectedId}
              orbitRef={orbitRef}
              setTransforming={setTransforming}
            />
          ))}
      </HandlesOverlay>

      <MirrorAxisGizmo meshRefs={meshRefs} selectedIds={selectedIds} />

      <FaceSnapper
        meshRefs={meshRefs}
        selectedId={selectedId}
        active={transforming}
      />
      <DimensionRuler meshRefs={meshRefs} />
      <MeasureTool />
      <DragPreview />
      <ArrayPreview />
      <WorkplaneOverlay meshRefs={meshRefs} selectedId={selectedId} />
      <DropHandler />
      <MirrorHintOverlay />

      <CameraControls orbitRef={orbitRef} />
      {shadowsEnabled && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.5, 0]}
          receiveShadow
        >
          <planeGeometry args={[500, 500]} />
          <shadowMaterial transparent opacity={0.15} />
        </mesh>
      )}

      <EffectComposer autoClear={false}>
        <Outline
          selection={selectedOutlineMeshes}
          selectionLayer={100}
          edgeStrength={30}
          pulseSpeed={0.5}
          visibleEdgeColor={0x00d4ff}
          hiddenEdgeColor={0x00d4ff}
          kernelSize={KernelSize.MEDIUM}
          xRay={true}
          blendFunction={BlendFunction.ADD}
        />
      </EffectComposer>

      <GizmoHelper alignment="top-right" margin={[80, 80]} renderPriority={2}>
        <GizmoViewcube
          color="#21283b"
          textColor="#e6edf3"
          strokeColor="#484f58"
          hoverColor="#6366f1"
        />
      </GizmoHelper>

      <GizmoHelper alignment="bottom-left" margin={[80, 80]} renderPriority={2}>
        <GizmoViewport
          axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
          labelColor="#fff"
          axisHeadScale={1}
          hideNegativeAxes={false}
        />
      </GizmoHelper>
    </>
  );
}

export let marqueeActive = false;
export function setMarqueeActive(v) {
  marqueeActive = v;
}

export default function Scene() {
  const backgroundColor = useDesignStore((s) => s.backgroundColor);
  const clearSelection = useDesignStore((s) => s.clearSelection);

  return (
    <Canvas
      shadows
      gl={{
        antialias: true,
        preserveDrawingBuffer: true,
        toneMapping: THREE.NoToneMapping,
      }}
      onPointerMissed={(e) => {
        if (e.button === 0 && !marqueeActive) clearSelection();
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{ background: backgroundColor }}
    >
      <Suspense fallback={null}>
        <SceneContent />
      </Suspense>
    </Canvas>
  );
}
