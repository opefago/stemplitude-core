import React, { useRef, useMemo, useCallback, useEffect, Suspense, forwardRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import {
  OrbitControls, TransformControls, Grid,
  GizmoHelper, GizmoViewcube,
  PerspectiveCamera, OrthographicCamera,
  Text3D, Center, Html, Line, Environment,
} from '@react-three/drei';
import * as THREE from 'three';
import { useDesignStore, SHAPE_DEFAULTS, getHalfHeight, dragCursor } from './store';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/fonts/helvetiker_regular.typeface.json';

function ToyMaterial({ color, wireframe, transparent, opacity, side }) {
  return (
    <meshPhysicalMaterial
      color={color}
      wireframe={wireframe}
      transparent={transparent}
      opacity={opacity}
      side={side}
      roughness={0.35}
      metalness={0.0}
      clearcoat={0.4}
      clearcoatRoughness={0.25}
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

function ObjectGeometry({ type, params }) {
  const geo = useMemo(() => {
    const p = params;
    switch (type) {
      case 'heart': {
        const shape = createHeartShape(p.size);
        return new THREE.ExtrudeGeometry(shape, {
          depth: p.depth, bevelEnabled: true,
          bevelThickness: 0.5, bevelSize: 0.3, bevelSegments: 3,
        });
      }
      case 'star': {
        const shape = createStarShape(p.outerRadius, p.innerRadius, p.points);
        return new THREE.ExtrudeGeometry(shape, {
          depth: p.depth, bevelEnabled: true,
          bevelThickness: 0.5, bevelSize: 0.3, bevelSegments: 3,
        });
      }
      case 'wedge': {
        const w = p.width / 2, h = p.height, d = p.depth / 2;
        const positions = new Float32Array([
          -w, 0, d, w, 0, d, w, 0, -d, -w, 0, -d, w, h, -d, -w, h, -d,
        ]);
        const indices = [0, 2, 1, 0, 3, 2, 3, 5, 4, 3, 4, 2, 0, 1, 4, 0, 4, 5, 0, 5, 3, 1, 2, 4];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        g.setIndex(indices);
        g.computeVertexNormals();
        return g;
      }
      default:
        return null;
    }
  }, [type, params]);

  if (geo) return <primitive object={geo} attach="geometry" />;

  const p = params;
  switch (type) {
    case 'box': case 'wall':
      return <boxGeometry args={[p.width, p.height, p.depth]} />;
    case 'sphere':
      return <sphereGeometry args={[p.radius, p.widthSegments || 32, p.heightSegments || 32]} />;
    case 'cylinder':
      return <cylinderGeometry args={[p.radiusTop, p.radiusBottom, p.height, p.radialSegments || 32]} />;
    case 'cone': case 'pyramid':
      return <coneGeometry args={[p.radius, p.height, p.radialSegments || 32]} />;
    case 'torus': case 'tube':
      return <torusGeometry args={[p.radius, p.tube, p.radialSegments || 16, p.tubularSegments || 48]} />;
    case 'hemisphere':
      return <sphereGeometry args={[p.radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />;
    case 'imported':
      if (p.bufferGeometry) return <primitive object={p.bufferGeometry} attach="geometry" />;
      return <boxGeometry args={[20, 20, 20]} />;
    default:
      return <boxGeometry args={[20, 20, 20]} />;
  }
}

function SelectionEdges({ type, params }) {
  const edges = useMemo(() => {
    const p = params;
    let base;
    switch (type) {
      case 'box': case 'wall': case 'wedge':
        base = new THREE.BoxGeometry(p.width, p.height, p.depth); break;
      case 'sphere':
        base = new THREE.SphereGeometry(p.radius, 16, 12); break;
      case 'hemisphere':
        base = new THREE.SphereGeometry(p.radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); break;
      case 'cylinder':
        base = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 24); break;
      case 'cone': case 'pyramid':
        base = new THREE.ConeGeometry(p.radius, p.height, type === 'pyramid' ? 4 : 24); break;
      case 'torus': case 'tube':
        base = new THREE.TorusGeometry(p.radius, p.tube, 12, 24); break;
      case 'imported':
        if (p.bufferGeometry) { base = p.bufferGeometry; break; }
        base = new THREE.BoxGeometry(20, 20, 20); break;
      default:
        base = new THREE.BoxGeometry(20, 20, 20);
    }
    return new THREE.EdgesGeometry(base, 30);
  }, [type, params]);

  return <primitive object={edges} attach="geometry" />;
}

const SceneObject = forwardRef(function SceneObject({ obj, isSelected, wireframe, onSelect }, ref) {
  const color = obj.isHole ? '#ff4444' : obj.color;
  const opacity = obj.isHole ? 0.4 : 1;
  const hasMirror = obj.scale[0] < 0 || obj.scale[1] < 0 || obj.scale[2] < 0;
  const side = (obj.isHole || hasMirror) ? THREE.DoubleSide : THREE.FrontSide;

  const outlineRatio = 1.03;
  const cartoonRatio = 1.025;

  if (obj.type === 'text') {
    return (
      <group
        ref={ref}
        position={obj.position}
        rotation={obj.rotation}
        scale={obj.scale}
        onClick={onSelect}
      >
        <Suspense fallback={
          <mesh>
            <boxGeometry args={[20, 10, 5]} />
            <meshStandardMaterial color="#555" transparent opacity={0.3} />
          </mesh>
        }>
          <Center>
            <Text3D
              font={FONT_URL}
              size={obj.geometry.size || 10}
              height={obj.geometry.height || 5}
              curveSegments={12}
              bevelEnabled
              bevelThickness={0.3}
              bevelSize={0.2}
              castShadow
            >
              {obj.geometry.text || 'Text'}
              <ToyMaterial color={color} wireframe={wireframe} transparent={obj.isHole} opacity={opacity} side={side} />
            </Text3D>
          </Center>
        </Suspense>
      </group>
    );
  }

  return (
    <group
      ref={ref}
      position={obj.position}
      rotation={obj.rotation}
      scale={obj.scale}
      onClick={onSelect}
    >
      <mesh castShadow receiveShadow>
        <ObjectGeometry type={obj.type} params={obj.geometry} />
        <ToyMaterial color={color} wireframe={wireframe} transparent={obj.isHole} opacity={opacity} side={side} />
      </mesh>
      {!wireframe && (
        <mesh scale={[cartoonRatio, cartoonRatio, cartoonRatio]}>
          <ObjectGeometry type={obj.type} params={obj.geometry} />
          <meshBasicMaterial color="#2a2a2a" side={THREE.BackSide} />
        </mesh>
      )}
      {isSelected && (
        <lineSegments
          scale={[outlineRatio, outlineRatio, outlineRatio]}
          renderOrder={999}
        >
          <SelectionEdges type={obj.type} params={obj.geometry} />
          <lineBasicMaterial
            color="#7c6df0"
            transparent
            opacity={0.8}
            depthTest={false}
            linewidth={2}
          />
        </lineSegments>
      )}
    </group>
  );
});

function CameraSetup() {
  const cameraMode = useDesignStore(s => s.cameraMode);
  return (
    <>
      <PerspectiveCamera
        makeDefault={cameraMode === 'perspective'}
        position={[60, 60, 60]}
        fov={50}
        near={0.1}
        far={10000}
      />
      <OrthographicCamera
        makeDefault={cameraMode === 'orthographic'}
        position={[60, 60, 60]}
        zoom={4}
        near={-10000}
        far={10000}
      />
    </>
  );
}

function CameraControls({ orbitRef }) {
  const zoomSpeed = useDesignStore(s => s.zoomSpeed);
  const cameraCmd = useDesignStore(s => s._cameraCmd);
  const clearCameraCmd = useDesignStore(s => s.clearCameraCmd);
  const objects = useDesignStore(s => s.objects);
  const selectedIds = useDesignStore(s => s.selectedIds);

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

    if (cameraCmd === 'in' || cameraCmd === 'out') {
      const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
      dir.multiplyScalar(cameraCmd === 'in' ? 0.75 : 1.35);
      camera.position.copy(controls.target).add(dir);
    } else if (cameraCmd === 'home') {
      camera.position.set(60, 60, 60);
      controls.target.set(0, 0, 0);
    } else if (cameraCmd === 'fit') {
      const targets = selectedIds.length > 0
        ? objects.filter(o => selectedIds.includes(o.id))
        : objects;
      if (targets.length > 0) {
        const box = new THREE.Box3();
        targets.forEach(o => {
          const p = new THREE.Vector3(...o.position);
          box.expandByPoint(p);
        });
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z, 20);
        const dist = maxDim * 2.5;
        const offset = new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(dist);
        camera.position.copy(center).add(offset);
        controls.target.copy(center);
      }
    }

    controls.update();
    clearCameraCmd();
  }, [cameraCmd, clearCameraCmd, orbitRef, objects, selectedIds]);

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
  const draggingShape = useDesignStore(s => s.draggingShape);
  const snapIncrement = useDesignStore(s => s.snapIncrement);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hitPoint = useMemo(() => new THREE.Vector3(), []);

  const defaults = draggingShape ? (SHAPE_DEFAULTS[draggingShape.type] || SHAPE_DEFAULTS.box) : null;
  const halfH = defaults ? getHalfHeight(draggingShape.type, defaults.geometry) : 10;
  const color = draggingShape?.isHole ? '#ff4444' : (defaults?.color || '#6366f1');

  useFrame(() => {
    if (!groupRef.current) return;
    if (!dragCursor.active || !draggingShape) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;
    raycaster.setFromCamera(dragCursor, camera);
    if (raycaster.ray.intersectPlane(plane, hitPoint)) {
      const snap = snapIncrement;
      groupRef.current.position.set(
        Math.round(hitPoint.x / snap) * snap,
        halfH,
        Math.round(hitPoint.z / snap) * snap
      );
    }
  });

  if (!draggingShape || !defaults) return null;

  const previewType = draggingShape.type === 'text' ? 'box' : draggingShape.type;
  const previewParams = draggingShape.type === 'text'
    ? { width: 20, height: 10, depth: 5 }
    : defaults.geometry;

  return (
    <group ref={groupRef} visible={false}>
      <mesh renderOrder={998}>
        <ObjectGeometry type={previewType} params={previewParams} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>
      <mesh renderOrder={999}>
        <ObjectGeometry type={previewType} params={previewParams} />
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
    case 'box': case 'wall': case 'wedge':
      w = g.width; h = g.height; d = g.depth;
      break;
    case 'sphere':
      w = g.radius * 2; h = g.radius * 2; d = g.radius * 2;
      break;
    case 'hemisphere':
      w = g.radius * 2; h = g.radius; d = g.radius * 2;
      break;
    case 'cylinder':
      w = Math.max(g.radiusTop, g.radiusBottom) * 2; h = g.height; d = Math.max(g.radiusTop, g.radiusBottom) * 2;
      break;
    case 'cone': case 'pyramid':
      w = g.radius * 2; h = g.height; d = g.radius * 2;
      break;
    case 'torus': case 'tube':
      w = (g.radius + g.tube) * 2; h = g.tube * 2; d = (g.radius + g.tube) * 2;
      break;
    case 'heart': case 'star':
      w = (g.outerRadius || g.size) * 2; h = (g.outerRadius || g.size) * 2; d = g.depth;
      break;
    case 'text':
      w = 20; h = g.size || 10; d = g.height || 5;
      break;
    case 'imported':
      if (g.bufferGeometry) {
        if (!g.bufferGeometry.boundingBox) g.bufferGeometry.computeBoundingBox();
        const bb = g.bufferGeometry.boundingBox;
        w = bb.max.x - bb.min.x;
        h = bb.max.y - bb.min.y;
        d = bb.max.z - bb.min.z;
      } else {
        w = 20; h = 20; d = 20;
      }
      break;
    default:
      w = 20; h = 20; d = 20;
  }
  return {
    width: Math.abs(w * s[0]),
    height: Math.abs(h * s[1]),
    depth: Math.abs(d * s[2]),
  };
}

function DimensionLine({ start, end, label, color = '#ff9f43', offset = [0, 0, 0] }) {
  const mid = useMemo(() => [
    (start[0] + end[0]) / 2 + offset[0],
    (start[1] + end[1]) / 2 + offset[1],
    (start[2] + end[2]) / 2 + offset[2],
  ], [start, end, offset]);

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
      {/* End caps */}
      <Line points={[
        [start[0], start[1] - 0.8, start[2]],
        [start[0], start[1] + 0.8, start[2]]
      ]} color={color} lineWidth={1.5} />
      <Line points={[
        [end[0], end[1] - 0.8, end[2]],
        [end[0], end[1] + 0.8, end[2]]
      ]} color={color} lineWidth={1.5} />
      <Html position={mid} center style={{ pointerEvents: 'none' }}>
        <div className="dml-ruler-label">{label}</div>
      </Html>
    </group>
  );
}

function DimensionRuler({ meshRefs }) {
  const groupRef = useRef();
  const objects = useDesignStore(s => s.objects);
  const selectedIds = useDesignStore(s => s.selectedIds);
  const rulerVisible = useDesignStore(s => s.rulerVisible);
  const units = useDesignStore(s => s.units);

  const obj = (rulerVisible && selectedIds.length === 1)
    ? objects.find(o => o.id === selectedIds[0])
    : null;
  const dims = obj ? getObjectDimensions(obj) : null;

  useFrame(() => {
    if (!groupRef.current) return;
    if (!obj || !dims) { groupRef.current.visible = false; return; }
    const mesh = meshRefs.current[obj.id];
    if (!mesh) { groupRef.current.visible = false; return; }
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
      {/* Width (X) — along bottom front */}
      <DimensionLine
        start={[-halfW, -halfH - gap, halfD]}
        end={[halfW, -halfH - gap, halfD]}
        label={fmt(dims.width)}
        color="#ff6b6b"
      />
      {/* Height (Y) — along right side */}
      <DimensionLine
        start={[halfW + gap, -halfH, halfD]}
        end={[halfW + gap, halfH, halfD]}
        label={fmt(dims.height)}
        color="#51cf66"
        offset={[1, 0, 0]}
      />
      {/* Depth (Z) — along bottom right */}
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
  const pendingDrop = useDesignStore(s => s.pendingDrop);
  const clearPendingDrop = useDesignStore(s => s.clearPendingDrop);
  const addObject = useDesignStore(s => s.addObject);
  const snapIncrement = useDesignStore(s => s.snapIncrement);

  useEffect(() => {
    if (!pendingDrop) return;

    const { ndc, type, isHole, text } = pendingDrop;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const intersected = raycaster.ray.intersectPlane(plane, hit);

    if (intersected) {
      const snap = snapIncrement;
      const x = Math.round(hit.x / snap) * snap;
      const z = Math.round(hit.z / snap) * snap;

      const overrides = { position: [x, 0, z] };
      if (isHole) overrides.isHole = true;
      if (type === 'text' && text) {
        overrides.geometry = { text, size: 10, height: 5 };
      }
      addObject(type, overrides);
    }

    clearPendingDrop();
  }, [pendingDrop, camera, addObject, clearPendingDrop, snapIncrement]);

  return null;
}

function SceneContent() {
  const meshRefs = useRef({});
  const orbitRef = useRef();

  const objects = useDesignStore(s => s.objects);
  const selectedIds = useDesignStore(s => s.selectedIds);
  const transformMode = useDesignStore(s => s.transformMode);
  const gridVisible = useDesignStore(s => s.gridVisible);
  const wireframe = useDesignStore(s => s.wireframe);
  const snapIncrement = useDesignStore(s => s.snapIncrement);
  const clearSelection = useDesignStore(s => s.clearSelection);
  const updateObject = useDesignStore(s => s.updateObject);
  const selectObject = useDesignStore(s => s.selectObject);

  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectedMesh = selectedId ? meshRefs.current[selectedId] : null;

  const handleTransformEnd = useCallback(() => {
    if (!selectedId || !meshRefs.current[selectedId]) return;
    const mesh = meshRefs.current[selectedId];
    updateObject(selectedId, {
      position: mesh.position.toArray(),
      rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
      scale: mesh.scale.toArray(),
    });
  }, [selectedId, updateObject]);

  return (
    <>
      <CameraSetup />

      <ambientLight intensity={0.4} />
      <directionalLight
        position={[50, 100, 50]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={500}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
      />
      <directionalLight position={[-30, 60, -40]} intensity={0.3} />
      <hemisphereLight args={['#b1e1ff', '#b97a20', 0.25]} />
      <Environment preset="city" environmentIntensity={0.3} />

      {gridVisible && (
        <Grid
          position={[0, -0.01, 0]}
          args={[200, 200]}
          cellSize={snapIncrement}
          sectionSize={snapIncrement * 10}
          fadeDistance={200}
          fadeStrength={1}
          cellColor="#4a4a6a"
          sectionColor="#6a6a8a"
          infiniteGrid
        />
      )}

      {/* X-axis line */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([-200, 0, 0, 200, 0, 0])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#ef4444" opacity={0.4} transparent />
      </line>
      {/* Z-axis line */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([0, 0, -200, 0, 0, 200])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#3b82f6" opacity={0.4} transparent />
      </line>

      {objects.map(obj => (
        <SceneObject
          key={obj.id}
          ref={el => {
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

      {selectedMesh && (
        <TransformControls
          object={selectedMesh}
          mode={transformMode}
          translationSnap={snapIncrement}
          rotationSnap={THREE.MathUtils.degToRad(15)}
          scaleSnap={0.1}
          size={0.7}
          onMouseDown={() => { if (orbitRef.current) orbitRef.current.enabled = false; }}
          onMouseUp={() => {
            if (orbitRef.current) orbitRef.current.enabled = true;
            handleTransformEnd();
          }}
        />
      )}

      <DimensionRuler meshRefs={meshRefs} />
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
    </>
  );
}

export default function Scene() {
  const backgroundColor = useDesignStore(s => s.backgroundColor);
  const clearSelection = useDesignStore(s => s.clearSelection);

  return (
    <Canvas
      shadows
      gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onPointerMissed={(e) => {
        if (e.button === 0) clearSelection();
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
