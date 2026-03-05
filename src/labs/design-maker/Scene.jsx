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
  PerspectiveCamera,
  OrthographicCamera,
  Text3D,
  Center,
  Html,
  Line,
  Environment,
} from "@react-three/drei";
import { EffectComposer, Outline } from "@react-three/postprocessing";
import { KernelSize } from "postprocessing";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  useDesignStore,
  SHAPE_DEFAULTS,
  getHalfHeight,
  dragCursor,
  sceneCamera,
  sceneInteracting,
} from "./store";

const toonGradientMap = (() => {
  const colors = new Uint8Array([60, 100, 160, 220, 255]);
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

function ToyMaterial({ color, wireframe, transparent, opacity, side }) {
  return (
    <meshToonMaterial
      color={color}
      wireframe={wireframe}
      transparent={transparent}
      opacity={opacity}
      side={side}
      gradientMap={toonGradientMap}
    />
  );
}

function createHeartShape(size = 10) {
  const s = size;
  const shape = new THREE.Shape();
  shape.moveTo(0, s * 0.3);
  shape.bezierCurveTo(0, s * 0.5, -s * 0.5, s * 0.7, -s * 0.5, s * 0.3);
  shape.bezierCurveTo(-s * 0.5, -s * 0.1, 0, -s * 0.3, 0, -s * 0.6);
  shape.bezierCurveTo(0, -s * 0.3, s * 0.5, -s * 0.1, s * 0.5, s * 0.3);
  shape.bezierCurveTo(s * 0.5, s * 0.7, 0, s * 0.5, 0, s * 0.3);
  return shape;
}

function createStarShape(outer = 10, inner = 5, points = 5) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

// Fillet: smooth curved edges
function createFilletBoxGeometry(width, height, depth, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  const hw = width / 2 - r;
  const hh = height / 2 - r;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, hh + r);
  shape.quadraticCurveTo(-hw - r, hh + r, -hw - r, hh);
  shape.lineTo(-hw - r, -hh);
  shape.quadraticCurveTo(-hw - r, -hh - r, -hw, -hh - r);
  shape.lineTo(hw, -hh - r);
  shape.quadraticCurveTo(hw + r, -hh - r, hw + r, -hh);
  shape.lineTo(hw + r, hh);
  shape.quadraticCurveTo(hw + r, hh + r, hw, hh + r);
  shape.lineTo(-hw, hh + r);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: Math.max(3, Math.ceil(r * 2)),
    curveSegments: Math.max(4, Math.ceil(r * 2)),
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateX(Math.PI / 2);
  return geo;
}

// Chamfer: flat 45-degree angled cut
function createChamferBoxGeometry(width, height, depth, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  const hw = width / 2 - r;
  const hh = height / 2 - r;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, hh + r);
  shape.lineTo(-hw - r, hh);
  shape.lineTo(-hw - r, -hh);
  shape.lineTo(-hw, -hh - r);
  shape.lineTo(hw, -hh - r);
  shape.lineTo(hw + r, -hh);
  shape.lineTo(hw + r, hh);
  shape.lineTo(hw, hh + r);
  shape.lineTo(-hw, hh + r);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateX(Math.PI / 2);
  return geo;
}

function createFilletCylinderGeometry(
  radiusTop,
  radiusBottom,
  height,
  radialSegments,
  edgeRadius,
) {
  const r = Math.min(edgeRadius, height / 2, radiusTop, radiusBottom);
  const halfH = height / 2;
  const pts = [];
  const segments = Math.max(4, Math.ceil(r * 2));
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * (Math.PI / 2);
    pts.push(
      new THREE.Vector2(
        radiusTop - r + Math.cos(t) * r,
        halfH - r + Math.sin(t) * r,
      ),
    );
  }
  const bodySegments = 4;
  for (let i = 1; i <= bodySegments; i++) {
    const t = i / bodySegments;
    const rad = radiusTop + (radiusBottom - radiusTop) * t;
    const y = halfH - t * height;
    if (i < bodySegments) pts.push(new THREE.Vector2(rad, y));
  }
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * (Math.PI / 2);
    pts.push(
      new THREE.Vector2(
        radiusBottom - r + Math.cos(Math.PI / 2 - t) * r,
        -halfH + r - Math.sin(Math.PI / 2 - t) * r,
      ),
    );
  }
  return new THREE.LatheGeometry(pts, radialSegments || 32);
}

function createChamferCylinderGeometry(
  radiusTop,
  radiusBottom,
  height,
  radialSegments,
  edgeRadius,
) {
  const r = Math.min(edgeRadius, height / 2, radiusTop, radiusBottom);
  const halfH = height / 2;
  const pts = [
    new THREE.Vector2(radiusTop - r, halfH),
    new THREE.Vector2(radiusTop, halfH - r),
    new THREE.Vector2(radiusBottom, -halfH + r),
    new THREE.Vector2(radiusBottom - r, -halfH),
  ];
  return new THREE.LatheGeometry(pts, radialSegments || 32);
}

// Fix #2: Memoize all geometry creation (including primitives) in a single useMemo
function useObjectGeometry(type, params) {
  return useMemo(() => {
    const p = params;
    switch (type) {
      case "box":
      case "wall":
        if (p.edgeRadius > 0 && p.edgeStyle === "fillet") {
          return createFilletBoxGeometry(
            p.width,
            p.height,
            p.depth,
            p.edgeRadius,
          );
        }
        if (p.edgeRadius > 0 && p.edgeStyle === "chamfer") {
          return createChamferBoxGeometry(
            p.width,
            p.height,
            p.depth,
            p.edgeRadius,
          );
        }
        return new THREE.BoxGeometry(p.width, p.height, p.depth);
      case "sphere":
        return new THREE.SphereGeometry(
          p.radius,
          p.widthSegments || 32,
          p.heightSegments || 32,
        );
      case "cylinder":
        if (p.edgeRadius > 0 && p.edgeStyle === "fillet") {
          return createFilletCylinderGeometry(
            p.radiusTop,
            p.radiusBottom,
            p.height,
            p.radialSegments || 32,
            p.edgeRadius,
          );
        }
        if (p.edgeRadius > 0 && p.edgeStyle === "chamfer") {
          return createChamferCylinderGeometry(
            p.radiusTop,
            p.radiusBottom,
            p.height,
            p.radialSegments || 32,
            p.edgeRadius,
          );
        }
        return new THREE.CylinderGeometry(
          p.radiusTop,
          p.radiusBottom,
          p.height,
          p.radialSegments || 32,
        );
      case "cone":
      case "pyramid":
        return new THREE.ConeGeometry(
          p.radius,
          p.height,
          p.radialSegments || 32,
        );
      case "torus":
      case "tube":
        return new THREE.TorusGeometry(
          p.radius,
          p.tube,
          p.radialSegments || 16,
          p.tubularSegments || 48,
        );
      case "hemisphere": {
        const dome = new THREE.SphereGeometry(
          p.radius,
          32,
          16,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        );
        const cap = new THREE.CircleGeometry(p.radius, 32);
        cap.rotateX(Math.PI / 2);
        const geo = mergeGeometries([dome, cap]);
        geo.translate(0, -p.radius / 2, 0);
        return geo;
      }
      case "heart": {
        const shape = createHeartShape(p.size);
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: p.depth,
          bevelEnabled: true,
          bevelThickness: 0.5,
          bevelSize: 0.3,
          bevelSegments: 3,
        });
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        geo.translate(
          0,
          -(bb.min.y + bb.max.y) / 2,
          -(bb.min.z + bb.max.z) / 2,
        );
        return geo;
      }
      case "star": {
        const shape = createStarShape(p.outerRadius, p.innerRadius, p.points);
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: p.depth,
          bevelEnabled: true,
          bevelThickness: 0.5,
          bevelSize: 0.3,
          bevelSegments: 3,
        });
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        geo.translate(
          0,
          -(bb.min.y + bb.max.y) / 2,
          -(bb.min.z + bb.max.z) / 2,
        );
        return geo;
      }
      case "wedge": {
        const w = p.width / 2,
          hh = p.height / 2,
          d = p.depth / 2;
        const positions = new Float32Array([
          -w,
          -hh,
          d,
          w,
          -hh,
          d,
          w,
          -hh,
          -d,
          -w,
          -hh,
          -d,
          w,
          hh,
          -d,
          -w,
          hh,
          -d,
        ]);
        const indices = [
          0, 2, 1, 0, 3, 2, 3, 5, 4, 3, 4, 2, 0, 1, 4, 0, 4, 5, 0, 5, 3, 1, 2,
          4,
        ];
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        g.setIndex(indices);
        g.computeVertexNormals();
        return g;
      }
      case "imported":
        return p.bufferGeometry || new THREE.BoxGeometry(20, 20, 20);
      default:
        return new THREE.BoxGeometry(20, 20, 20);
    }
  }, [type, params]);
}

const SceneObject = forwardRef(function SceneObject(
  { obj, isSelected, wireframe, onSelect },
  ref,
) {
  const color = obj.isHole ? "#ff4444" : obj.color;
  const opacity = obj.isHole ? 0.4 : 1;
  const hasMirror = obj.scale[0] < 0 || obj.scale[1] < 0 || obj.scale[2] < 0;
  const side = obj.isHole || hasMirror ? THREE.DoubleSide : THREE.FrontSide;
  const cartoonRatio = 1.025;

  if (obj.type === "text") {
    return (
      <group
        ref={ref}
        position={obj.position}
        rotation={obj.rotation}
        scale={obj.scale}
        onPointerDown={() => {
          sceneInteracting.active = true;
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
              />
            </Text3D>
          </Center>
          {!wireframe && (
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
                <meshBasicMaterial color="#1a1a1a" side={THREE.BackSide} />
              </Text3D>
            </Center>
          )}
        </Suspense>
      </group>
    );
  }

  const geometry = useObjectGeometry(obj.type, obj.geometry);

  const isTorus = obj.type === "torus" || obj.type === "tube";
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
      onPointerDown={() => {
        sceneInteracting.active = true;
      }}
      onPointerUp={() => {
        sceneInteracting.active = false;
      }}
      onClick={onSelect}
    >
      <mesh castShadow receiveShadow geometry={geometry}>
        <ToyMaterial
          color={color}
          wireframe={wireframe}
          transparent={obj.isHole}
          opacity={opacity}
          side={side}
        />
      </mesh>
      {!wireframe && (
        <mesh
          scale={
            isTorus ? undefined : [cartoonRatio, cartoonRatio, cartoonRatio]
          }
          geometry={isTorus ? outlineGeo : geometry}
        >
          <meshBasicMaterial color="#1a1a1a" side={THREE.BackSide} />
        </mesh>
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
        near={0.1}
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
  const halfH = defaults
    ? getHalfHeight(draggingShape.type, defaults.geometry)
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
    <group ref={groupRef} visible={false}>
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

function getObjectDimensions(obj) {
  const g = obj.geometry;
  const s = obj.scale;
  let w, h, d;
  switch (obj.type) {
    case "box":
    case "wall":
    case "wedge":
      w = g.width;
      h = g.height;
      d = g.depth;
      break;
    case "sphere":
      w = g.radius * 2;
      h = g.radius * 2;
      d = g.radius * 2;
      break;
    case "hemisphere":
      w = g.radius * 2;
      h = g.radius;
      d = g.radius * 2;
      break;
    case "cylinder":
      w = Math.max(g.radiusTop, g.radiusBottom) * 2;
      h = g.height;
      d = Math.max(g.radiusTop, g.radiusBottom) * 2;
      break;
    case "cone":
    case "pyramid":
      w = g.radius * 2;
      h = g.height;
      d = g.radius * 2;
      break;
    case "torus":
    case "tube":
      w = (g.radius + g.tube) * 2;
      h = g.tube * 2;
      d = (g.radius + g.tube) * 2;
      break;
    case "heart":
    case "star":
      w = (g.outerRadius || g.size) * 2;
      h = (g.outerRadius || g.size) * 2;
      d = g.depth;
      break;
    case "text":
      w = 20;
      h = g.size || 10;
      d = g.height || 5;
      break;
    case "imported":
      if (g.bufferGeometry) {
        if (!g.bufferGeometry.boundingBox)
          g.bufferGeometry.computeBoundingBox();
        const bb = g.bufferGeometry.boundingBox;
        w = bb.max.x - bb.min.x;
        h = bb.max.y - bb.min.y;
        d = bb.max.z - bb.min.z;
      } else {
        w = 20;
        h = 20;
        d = 20;
      }
      break;
    default:
      w = 20;
      h = 20;
      d = 20;
  }
  return {
    width: Math.abs(w * s[0]),
    height: Math.abs(h * s[1]),
    depth: Math.abs(d * s[2]),
  };
}

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
  const obj = useDesignStore((s) => {
    if (!s.rulerVisible || s.selectedIds.length !== 1) return null;
    return s.objects.find((o) => o.id === s.selectedIds[0]) || null;
  });
  const dims = obj ? getObjectDimensions(obj) : null;

  useFrame(() => {
    if (!groupRef.current) return;
    if (!obj || !dims) {
      groupRef.current.visible = false;
      return;
    }
    const mesh = meshRefs.current[obj.id];
    if (!mesh) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;
    groupRef.current.position.copy(mesh.position);
  });

  if (!obj || !dims) return null;

  const halfW = dims.width / 2;
  const halfH = dims.height / 2;
  const halfD = dims.depth / 2;
  const gap = 3;
  const fmt = (v) => `${v.toFixed(1)} ${units}`;

  return (
    <group ref={groupRef}>
      <DimensionLine
        start={[-halfW, -halfH - gap, halfD]}
        end={[halfW, -halfH - gap, halfD]}
        label={fmt(dims.width)}
        color="#ff6b6b"
      />
      <DimensionLine
        start={[halfW + gap, -halfH, halfD]}
        end={[halfW + gap, halfH, halfD]}
        label={fmt(dims.height)}
        color="#51cf66"
        offset={[1, 0, 0]}
      />
      <DimensionLine
        start={[halfW, -halfH - gap, -halfD]}
        end={[halfW, -halfH - gap, halfD]}
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

const HANDLE_OFFSET = 3;

function getScaleHandles(type, geometry) {
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
    case "sphere":
    case "hemisphere": {
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
      handles.push({
        param: "radiusTop",
        dir: [1, 0, 0],
        pos: [g.radiusTop + o, g.height / 2, 0],
        label: "Rt",
      });
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
    default:
      break;
  }
  return handles;
}

function ObjectHandles({ meshRefs, selectedId, orbitRef, setTransforming }) {
  const updateObjectSilent = useDesignStore((s) => s.updateObjectSilent);
  const obj = useDesignStore((s) => {
    if (s.selectedIds.length !== 1) return null;
    const o = s.objects.find((o) => o.id === s.selectedIds[0]);
    if (!o || o.type === "text" || o.type === "imported") return null;
    return o;
  });
  const snapIncrement = useDesignStore((s) => s.snapIncrement);
  const { camera, gl } = useThree();

  const drag = useRef(null);
  const startPt = useMemo(() => new THREE.Vector3(), []);
  const startValue = useRef(0);
  const startLinkedValue = useRef(0);
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

  const arcGeo = useMemo(
    () => new THREE.TorusGeometry(arcR, 0.35, 8, 32, Math.PI / 2),
    [arcR],
  );
  const hoverRingGeo = useMemo(
    () => new THREE.TorusGeometry(arcR, 0.12, 8, 64),
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

  const hw = dims.width / 2;
  const hh = dims.height / 2;
  const hd = dims.depth / 2;

  const worldPos = new THREE.Vector3();
  mesh.getWorldPosition(worldPos);

  const scaleHandles = getScaleHandles(obj.type, obj.geometry);

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
      pos: [0, hh + 3, hd + 3],
      arcRot: [0, Math.PI / 2, 0],
      color: "#ef4444",
    },
    {
      axis: 1,
      pos: [hw + 3, hh + 3, 0],
      arcRot: [Math.PI / 2, 0, 0],
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
        const val = Math.max(
          0.5,
          Math.round((startValue.current + d) * 10) / 10,
        );
        const cur = useDesignStore.getState().objects.find((o) => o.id === id);
        if (cur) {
          const geoUpdate = {
            ...cur.geometry,
            [drag.current.handle.param]: val,
          };
          if (drag.current.handle.linkedParam) {
            const delta = val - startValue.current;
            const linkedStart = startLinkedValue.current;
            geoUpdate[drag.current.handle.linkedParam] = Math.max(
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
    makeDragPlane(dirW, e.point);
    drag.current = { type: "scale", handle, dirW };
    startPt.copy(e.point);
    startValue.current = obj.geometry[handle.param];
    startLinkedValue.current = handle.linkedParam
      ? obj.geometry[handle.linkedParam]
      : 0;
  };

  const onTranslateDown = (e, arrow) => {
    beginDrag(e);
    setTransforming(true);
    const dirW = new THREE.Vector3(...arrow.dir).normalize();
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
          {/* Scale handles - flat triangles pointing outward from each face */}
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
                >
                  <meshBasicMaterial color="#1a1a2e" depthTest={false} />
                </mesh>
                <lineSegments renderOrder={1000} geometry={scaleTriEdges}>
                  <lineBasicMaterial color="white" depthTest={false} />
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
            >
              <coneGeometry args={[1.2, 3, 6]} />
              <meshBasicMaterial
                color={a.color}
                depthTest={false}
                transparent
                opacity={0.65}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* Rotation arcs - world-space, don't rotate with the object */}
      <group position={worldPos}>
        {rotationArcs.map((arc) => {
          if (rotating && hoveredArc !== arc.axis) return null;
          return (
            <group key={`rot${arc.axis}`} position={arc.pos}>
              {hoveredArc === arc.axis && (
                <mesh
                  rotation={arc.arcRot}
                  geometry={hoverRingGeo}
                  renderOrder={998}
                >
                  <meshBasicMaterial
                    color={arc.color}
                    transparent
                    opacity={0.12}
                    depthTest={false}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              )}
              <mesh
                rotation={arc.arcRot}
                geometry={arcGeo}
                onPointerEnter={() => setHoveredArc(arc.axis)}
                onPointerLeave={() => {
                  if (!drag.current || drag.current.type !== "rotate")
                    setHoveredArc(null);
                }}
                onPointerDown={(e) => onRotateDown(e, arc)}
                renderOrder={999}
              >
                <meshBasicMaterial
                  color={arc.color}
                  transparent
                  opacity={0.55}
                  depthTest={false}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          );
        })}

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

function SceneContent() {
  const meshRefs = useRef({});
  const orbitRef = useRef();
  const { camera } = useThree();
  const [transforming, setTransforming] = useState(false);

  useEffect(() => {
    sceneCamera.current = camera;
  }, [camera]);

  const objects = useDesignStore((s) => s.objects);
  const selectedIds = useDesignStore((s) => s.selectedIds);
  const gridVisible = useDesignStore((s) => s.gridVisible);
  const wireframe = useDesignStore((s) => s.wireframe);
  const snapIncrement = useDesignStore((s) => s.snapIncrement);
  const clearSelection = useDesignStore((s) => s.clearSelection);
  const selectObject = useDesignStore((s) => s.selectObject);

  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;

  const visibleObjects = useMemo(
    () => objects.filter((obj) => obj.visible !== false),
    [objects],
  );

  const selectedOutlineMeshes = useMemo(() => {
    const meshes = [];
    selectedIds.forEach((id) => {
      const group = meshRefs.current[id];
      if (!group) return;
      group.traverse((child) => {
        if (child.isMesh) meshes.push(child);
      });
    });
    return meshes;
  }, [selectedIds, visibleObjects]);

  return (
    <>
      <CameraSetup />

      <ambientLight intensity={0.4} />
      {/* Fix #8: Reduced shadow map from 2048 to 1024 */}
      <directionalLight
        position={[50, 100, 50]}
        intensity={0.8}
        castShadow
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
          position={[0, -0.01, 0]}
          args={[200, 200]}
          cellSize={snapIncrement || 1}
          sectionSize={(snapIncrement || 1) * 10}
          fadeDistance={200}
          fadeStrength={1}
          cellColor="#a8c8e8"
          sectionColor="#6a9fd8"
          cellThickness={0.6}
          sectionThickness={1.2}
          infiniteGrid
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
            selectObject(obj.id, e.shiftKey);
          }}
        />
      ))}

      <ObjectHandles
        meshRefs={meshRefs}
        selectedId={selectedId}
        orbitRef={orbitRef}
        setTransforming={setTransforming}
      />

      <FaceSnapper
        meshRefs={meshRefs}
        selectedId={selectedId}
        active={transforming}
      />
      <DimensionRuler meshRefs={meshRefs} />
      <MeasureTool />
      <DragPreview />
      <DropHandler />

      <CameraControls orbitRef={orbitRef} />

      <GizmoHelper alignment="top-right" margin={[80, 80]}>
        <GizmoViewcube
          color="#21283b"
          textColor="#e6edf3"
          strokeColor="#484f58"
          hoverColor="#6366f1"
        />
      </GizmoHelper>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        receiveShadow
      >
        <planeGeometry args={[500, 500]} />
        <shadowMaterial transparent opacity={0.15} />
      </mesh>

      <EffectComposer autoClear={false}>
        <Outline
          selection={selectedOutlineMeshes}
          edgeStrength={15}
          pulseSpeed={0.5}
          visibleEdgeColor={0x00d4ff}
          hiddenEdgeColor={0x00aadd}
          blur
          kernelSize={KernelSize.MEDIUM}
          xRay={true}
        />
      </EffectComposer>
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
