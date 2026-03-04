import React, { useRef, useMemo, useCallback, useEffect, Suspense, forwardRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  OrbitControls, TransformControls, Grid,
  GizmoHelper, GizmoViewcube,
  PerspectiveCamera, OrthographicCamera,
  Text3D, Center,
} from '@react-three/drei';
import * as THREE from 'three';
import { useDesignStore } from './store';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/fonts/helvetiker_regular.typeface.json';

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

const SceneObject = forwardRef(function SceneObject({ obj, isSelected, wireframe, onSelect }, ref) {
  const color = obj.isHole ? '#ff4444' : obj.color;
  const opacity = obj.isHole ? 0.4 : 1;

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
              <meshStandardMaterial
                color={color}
                wireframe={wireframe}
                transparent={obj.isHole}
                opacity={opacity}
              />
            </Text3D>
          </Center>
        </Suspense>
      </group>
    );
  }

  return (
    <mesh
      ref={ref}
      position={obj.position}
      rotation={obj.rotation}
      scale={obj.scale}
      onClick={onSelect}
      castShadow
      receiveShadow
    >
      <ObjectGeometry type={obj.type} params={obj.geometry} />
      <meshStandardMaterial
        color={color}
        wireframe={wireframe}
        transparent={obj.isHole}
        opacity={opacity}
        side={obj.isHole ? THREE.DoubleSide : THREE.FrontSide}
      />
    </mesh>
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

  useEffect(() => {
    if (orbitRef.current) {
      orbitRef.current.mouseButtons = {
        LEFT: undefined,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      };
    }
  }, [orbitRef]);

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
