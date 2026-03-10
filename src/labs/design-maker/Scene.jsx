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
  Hud,
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
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
import {
  getObjectDimensions,
  getObjectWorldDims,
  getFloorY,
  getWorldBounds,
  getRawExtents,
} from "./dimensions";
import { getObjectBehavior } from "./behaviors/ObjectBehaviorFactory";

const DROP_SURFACE_EPSILON = 0.01;

function getDefaultDropRotation(type) {
  if (FLAT_TYPES.includes(type)) return [...FLAT_ROTATION];
  if (DEFAULT_SHAPE_ROTATIONS[type]) return [...DEFAULT_SHAPE_ROTATIONS[type]];
  return [0, 0, 0];
}

function getLocalSupportNormal(type) {
  return FLAT_TYPES.includes(type)
    ? new THREE.Vector3(0, 0, -1)
    : new THREE.Vector3(0, -1, 0);
}

function quantizeToAxis(vec) {
  const ax = Math.abs(vec.x);
  const ay = Math.abs(vec.y);
  const az = Math.abs(vec.z);
  if (ax >= ay && ax >= az) return new THREE.Vector3(Math.sign(vec.x) || 1, 0, 0);
  if (ay >= az) return new THREE.Vector3(0, Math.sign(vec.y) || 1, 0);
  return new THREE.Vector3(0, 0, Math.sign(vec.z) || 1);
}

function clamp(value, min, max) {
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

function getSupportDistanceFromBounds(bounds, worldNormal) {
  if (Math.abs(worldNormal.x) > 0.5) {
    return worldNormal.x > 0 ? -bounds.min[0] : bounds.max[0];
  }
  if (Math.abs(worldNormal.y) > 0.5) {
    return worldNormal.y > 0 ? -bounds.min[1] : bounds.max[1];
  }
  return worldNormal.z > 0 ? -bounds.min[2] : bounds.max[2];
}

function findSceneObjectNode(node) {
  let cur = node;
  while (cur) {
    if (cur.userData?.isSceneObject) return cur;
    cur = cur.parent;
  }
  return null;
}

function collectSceneMeshes(meshRefs) {
  const meshes = [];
  Object.values(meshRefs.current).forEach((group) => {
    group?.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });
  });
  return meshes;
}

function getDropRotationForNormal(type, worldNormal) {
  const defaultRotation = getDefaultDropRotation(type);
  const defaultQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...defaultRotation, "XYZ"),
  );
  const baseSupportNormal = getLocalSupportNormal(type)
    .clone()
    .applyQuaternion(defaultQuat)
    .normalize();
  const targetSupportNormal = worldNormal.clone().normalize().multiplyScalar(-1);
  const alignQuat = new THREE.Quaternion().setFromUnitVectors(
    baseSupportNormal,
    targetSupportNormal,
  );
  const finalQuat = alignQuat.multiply(defaultQuat);
  const finalEuler = new THREE.Euler().setFromQuaternion(finalQuat, "XYZ");
  return [finalEuler.x, finalEuler.y, finalEuler.z];
}

function clampDropPointToFace(hitPoint, supportBounds, candidateBounds, worldNormal) {
  const point = hitPoint.clone();
  if (Math.abs(worldNormal.x) > 0.5) {
    const halfY = (candidateBounds.max[1] - candidateBounds.min[1]) / 2;
    const halfZ = (candidateBounds.max[2] - candidateBounds.min[2]) / 2;
    point.x = worldNormal.x > 0 ? supportBounds.max[0] : supportBounds.min[0];
    point.y = clamp(point.y, supportBounds.min[1] + halfY, supportBounds.max[1] - halfY);
    point.z = clamp(point.z, supportBounds.min[2] + halfZ, supportBounds.max[2] - halfZ);
    return point;
  }
  if (Math.abs(worldNormal.y) > 0.5) {
    const halfX = (candidateBounds.max[0] - candidateBounds.min[0]) / 2;
    const halfZ = (candidateBounds.max[2] - candidateBounds.min[2]) / 2;
    point.y = worldNormal.y > 0 ? supportBounds.max[1] : supportBounds.min[1];
    point.x = clamp(point.x, supportBounds.min[0] + halfX, supportBounds.max[0] - halfX);
    point.z = clamp(point.z, supportBounds.min[2] + halfZ, supportBounds.max[2] - halfZ);
    return point;
  }
  const halfX = (candidateBounds.max[0] - candidateBounds.min[0]) / 2;
  const halfY = (candidateBounds.max[1] - candidateBounds.min[1]) / 2;
  point.z = worldNormal.z > 0 ? supportBounds.max[2] : supportBounds.min[2];
  point.x = clamp(point.x, supportBounds.min[0] + halfX, supportBounds.max[0] - halfX);
  point.y = clamp(point.y, supportBounds.min[1] + halfY, supportBounds.max[1] - halfY);
  return point;
}

function shouldClampDropToFace(supportObject) {
  return supportObject?.type === "box";
}

function resolveDropPlacement({
  camera,
  ndc,
  meshRefs,
  objects,
  type,
  geometry,
  scale = [1, 1, 1],
  snapIncrement,
  raycaster = new THREE.Raycaster(),
}) {
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);

  const targetMeshes = collectSceneMeshes(meshRefs);
  const surfaceHits =
    targetMeshes.length > 0 ? raycaster.intersectObjects(targetMeshes, false) : [];

  let mode = "floor";
  let hitPoint = new THREE.Vector3();
  let worldNormal = new THREE.Vector3(0, 1, 0);
  let supportObject = null;

  const meshHit = surfaceHits.find((hit) => {
    const sceneNode = findSceneObjectNode(hit.object);
    if (!sceneNode || !hit.face) return false;
    supportObject =
      objects.find((obj) => obj.id === sceneNode.userData?.objectId) || null;
    return true;
  });

  if (meshHit) {
    mode = "surface";
    hitPoint.copy(meshHit.point);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(meshHit.object.matrixWorld);
    worldNormal
      .copy(meshHit.face.normal)
      .applyMatrix3(normalMatrix)
      .normalize();
    worldNormal.copy(quantizeToAxis(worldNormal));
  } else {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    if (!raycaster.ray.intersectPlane(plane, hitPoint)) return null;
  }

  const rotation = getDropRotationForNormal(type, worldNormal);
  const candidateBounds = getWorldBounds(type, geometry, rotation, scale, [0, 0, 0]);

  if (mode === "floor") {
    if (snapIncrement) {
      hitPoint.x = Math.round(hitPoint.x / snapIncrement) * snapIncrement;
      hitPoint.z = Math.round(hitPoint.z / snapIncrement) * snapIncrement;
    }
    hitPoint.y = 0;
  } else if (supportObject && shouldClampDropToFace(supportObject)) {
    const supportBounds = getWorldBounds(
      supportObject.type,
      supportObject.geometry,
      supportObject.rotation,
      supportObject.scale,
      supportObject.position,
    );
    hitPoint = clampDropPointToFace(
      hitPoint,
      supportBounds,
      candidateBounds,
      worldNormal,
    );
  }

  const supportDistance =
    getSupportDistanceFromBounds(candidateBounds, worldNormal) + DROP_SURFACE_EPSILON;
  const position = hitPoint.clone().addScaledVector(worldNormal, supportDistance);

  return {
    mode,
    position: [position.x, position.y, position.z],
    rotation,
    worldNormal: [worldNormal.x, worldNormal.y, worldNormal.z],
    supportObjectId: supportObject?.id ?? null,
  };
}

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

function computeSurfaceIds(geometry, startSurfaceId) {
  const count = geometry?.attributes?.position?.count || 0;
  if (!count)
    return { ids: new Float32Array(0), nextSurfaceId: startSurfaceId + 1 };

  const pos = geometry.attributes.position.array;
  const rawIndex = geometry.index?.array || null;
  const indexArray =
    rawIndex || Uint32Array.from({ length: count }, (_, i) => i);
  const ids = new Float32Array(count);
  const triCount = Math.floor(indexArray.length / 3);
  if (triCount === 0) {
    ids.fill(startSurfaceId);
    return { ids, nextSurfaceId: startSurfaceId + 1 };
  }

  // Build logical vertices by position only (merges split triangulation vertices).
  const posQuant = 1e4;
  const logicalKeyToId = new Map();
  const vertexToLogical = new Uint32Array(count);
  let logicalCount = 0;
  for (let i = 0; i < count; i += 1) {
    const key = `${Math.round(pos[i * 3] * posQuant)}|${Math.round(pos[i * 3 + 1] * posQuant)}|${Math.round(pos[i * 3 + 2] * posQuant)}`;
    let lid = logicalKeyToId.get(key);
    if (lid === undefined) {
      lid = logicalCount;
      logicalCount += 1;
      logicalKeyToId.set(key, lid);
    }
    vertexToLogical[i] = lid;
  }

  // Triangle normals and edge-sharing adjacency.
  const triNormals = new Float32Array(triCount * 3);
  const triNeighbors = Array.from({ length: triCount }, () => new Set());
  const edgeMap = new Map();
  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const addEdge = (a, b, tri) => {
    const key = edgeKey(a, b);
    const arr = edgeMap.get(key);
    if (arr) arr.push(tri);
    else edgeMap.set(key, [tri]);
  };

  for (let t = 0; t < triCount; t += 1) {
    const i0 = indexArray[t * 3];
    const i1 = indexArray[t * 3 + 1];
    const i2 = indexArray[t * 3 + 2];

    const ax = pos[i0 * 3];
    const ay = pos[i0 * 3 + 1];
    const az = pos[i0 * 3 + 2];
    const bx = pos[i1 * 3];
    const by = pos[i1 * 3 + 1];
    const bz = pos[i1 * 3 + 2];
    const cx = pos[i2 * 3];
    const cy = pos[i2 * 3 + 1];
    const cz = pos[i2 * 3 + 2];

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    triNormals[t * 3] = nx;
    triNormals[t * 3 + 1] = ny;
    triNormals[t * 3 + 2] = nz;

    const l0 = vertexToLogical[i0];
    const l1 = vertexToLogical[i1];
    const l2 = vertexToLogical[i2];
    addEdge(l0, l1, t);
    addEdge(l1, l2, t);
    addEdge(l2, l0, t);
  }

  edgeMap.forEach((tris) => {
    if (tris.length < 2) return;
    for (let i = 0; i < tris.length; i += 1) {
      for (let j = i + 1; j < tris.length; j += 1) {
        triNeighbors[tris[i]].add(tris[j]);
        triNeighbors[tris[j]].add(tris[i]);
      }
    }
  });

  // Grow surfaces across smooth triangle neighbors only.
  const triVisited = new Uint8Array(triCount);
  const minDot = Math.cos((40 * Math.PI) / 180);
  let surfaceId = startSurfaceId;

  for (let t = 0; t < triCount; t += 1) {
    if (triVisited[t]) continue;
    const stack = [t];
    triVisited[t] = 1;
    while (stack.length > 0) {
      const tri = stack.pop();
      const i0 = indexArray[tri * 3];
      const i1 = indexArray[tri * 3 + 1];
      const i2 = indexArray[tri * 3 + 2];
      ids[i0] = surfaceId;
      ids[i1] = surfaceId;
      ids[i2] = surfaceId;

      const nx = triNormals[tri * 3];
      const ny = triNormals[tri * 3 + 1];
      const nz = triNormals[tri * 3 + 2];
      triNeighbors[tri].forEach((nTri) => {
        if (triVisited[nTri]) return;
        const dot =
          nx * triNormals[nTri * 3] +
          ny * triNormals[nTri * 3 + 1] +
          nz * triNormals[nTri * 3 + 2];
        if (dot < minDot) return;
        triVisited[nTri] = 1;
        stack.push(nTri);
      });
    }
    surfaceId += 1;
  }

  return { ids, nextSurfaceId: surfaceId };
}

const IMPORTED_SURFACE_LAYER = 29;

function ImportedSurfaceIdOutline({
  meshRefs,
  visibleObjects,
  enabled = true,
}) {
  const { gl, scene, camera, size } = useThree();
  const geometryCacheRef = useRef(new WeakMap());
  const nextSurfaceIdRef = useRef(1);
  const clearColorRef = useMemo(() => new THREE.Color(), []);

  const target = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    rt.texture.minFilter = THREE.NearestFilter;
    rt.texture.magFilter = THREE.NearestFilter;
    rt.texture.type = THREE.HalfFloatType;
    rt.texture.generateMipmaps = false;
    rt.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    rt.depthTexture.minFilter = THREE.NearestFilter;
    rt.depthTexture.magFilter = THREE.NearestFilter;
    return rt;
  }, []);

  const depthOnlyMaterial = useMemo(() => {
    const mat = new THREE.MeshDepthMaterial();
    mat.depthTest = true;
    mat.depthWrite = true;
    mat.colorWrite = false;
    return mat;
  }, []);

  const surfaceIdMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          maxSurfaceId: { value: 1 },
        },
        vertexShader: `
          attribute float surfaceId;
          varying float vSurfaceId;
          void main() {
            vSurfaceId = surfaceId;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying float vSurfaceId;
          uniform float maxSurfaceId;
          void main() {
            float sid = round(vSurfaceId) / max(maxSurfaceId, 1.0);
            gl_FragColor = vec4(sid, 0.0, 0.0, 1.0);
          }
        `,
      }),
    [],
  );

  const overlayMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          tSurface: { value: target.texture },
          tDepth: { value: target.depthTexture },
          texel: { value: new THREE.Vector2(1, 1) },
          outlineColor: { value: new THREE.Color(0x0d0d0d) },
          cameraNear: { value: camera.near },
          cameraFar: { value: camera.far },
          depthParams: { value: new THREE.Vector2(1.05, 24.0) },
          depthWeight: { value: 0.0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          #include <packing>
          varying vec2 vUv;
          uniform sampler2D tSurface;
          uniform sampler2D tDepth;
          uniform vec2 texel;
          uniform vec3 outlineColor;
          uniform float cameraNear;
          uniform float cameraFar;
          uniform vec2 depthParams;
          uniform float depthWeight;

          float readDepth(vec2 uv) {
            float fragCoordZ = texture2D(tDepth, uv).x;
            float viewZ = perspectiveDepthToViewZ(fragCoordZ, cameraNear, cameraFar);
            return viewZToOrthographicDepth(viewZ, cameraNear, cameraFar);
          }

          float sampleSid(vec2 uv) {
            return texture2D(tSurface, uv).r;
          }

          void main() {
            float sid = sampleSid(vUv);
            if (sid <= 0.00001) {
              gl_FragColor = vec4(0.0);
              return;
            }

            float sidDiff = 0.0;
            sidDiff += abs(sid - sampleSid(vUv + vec2(texel.x, 0.0)));
            sidDiff += abs(sid - sampleSid(vUv + vec2(-texel.x, 0.0)));
            sidDiff += abs(sid - sampleSid(vUv + vec2(0.0, texel.y)));
            sidDiff += abs(sid - sampleSid(vUv + vec2(0.0, -texel.y)));
            sidDiff += abs(sid - sampleSid(vUv + vec2(texel.x, texel.y)));
            sidDiff += abs(sid - sampleSid(vUv + vec2(-texel.x, texel.y)));
            sidDiff += abs(sid - sampleSid(vUv + vec2(texel.x, -texel.y)));
            sidDiff += abs(sid - sampleSid(vUv + vec2(-texel.x, -texel.y)));

            float d = readDepth(vUv);
            float dd = 0.0;
            dd += abs(d - readDepth(vUv + vec2(texel.x, 0.0)));
            dd += abs(d - readDepth(vUv + vec2(-texel.x, 0.0)));
            dd += abs(d - readDepth(vUv + vec2(0.0, texel.y)));
            dd += abs(d - readDepth(vUv + vec2(0.0, -texel.y)));

            float depthEdge = clamp(pow(clamp(dd * depthParams.y, 0.0, 1.0), depthParams.x), 0.0, 1.0);
            float sidEdge = sidDiff > 0.00001 ? 1.0 : 0.0;
            float edge = clamp(sidEdge + depthEdge * depthWeight, 0.0, 1.0);
            gl_FragColor = vec4(outlineColor, edge);
          }
        `,
      }),
    [camera.far, camera.near, target.depthTexture, target.texture],
  );

  useEffect(() => {
    target.setSize(size.width, size.height);
    overlayMaterial.uniforms.texel.value.set(1 / size.width, 1 / size.height);
  }, [overlayMaterial, size.height, size.width, target]);

  useEffect(
    () => () => {
      depthOnlyMaterial.dispose();
      surfaceIdMaterial.dispose();
      overlayMaterial.dispose();
      target.dispose();
    },
    [depthOnlyMaterial, overlayMaterial, surfaceIdMaterial, target],
  );

  useFrame(() => {
    if (!enabled) return;

    const importedGroups = [];
    visibleObjects.forEach((obj) => {
      if (obj.type !== "imported") return;
      const group = meshRefs.current[obj.id];
      if (group) importedGroups.push(group);
    });
    if (importedGroups.length === 0) return;

    let maxSurfaceId = 1;
    const touchedMeshes = [];

    importedGroups.forEach((group) => {
      group.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        const geom = child.geometry;
        let cached = geometryCacheRef.current.get(geom);
        if (!cached) {
          const { ids, nextSurfaceId } = computeSurfaceIds(
            geom,
            nextSurfaceIdRef.current,
          );
          geom.setAttribute("surfaceId", new THREE.BufferAttribute(ids, 1));
          cached = { maxSurfaceId: nextSurfaceId - 1 };
          geometryCacheRef.current.set(geom, cached);
          nextSurfaceIdRef.current = nextSurfaceId;
        }
        maxSurfaceId = Math.max(maxSurfaceId, cached.maxSurfaceId);
        child.layers.enable(IMPORTED_SURFACE_LAYER);
        touchedMeshes.push(child);
      });
    });

    surfaceIdMaterial.uniforms.maxSurfaceId.value = Math.max(maxSurfaceId, 1);
    overlayMaterial.uniforms.cameraNear.value = camera.near;
    overlayMaterial.uniforms.cameraFar.value = camera.far;

    const prevTarget = gl.getRenderTarget();
    const prevOverride = scene.overrideMaterial;
    const prevMask = camera.layers.mask;
    const prevAutoClear = gl.autoClear;
    const prevClearAlpha = gl.getClearAlpha();
    gl.getClearColor(clearColorRef);

    gl.setRenderTarget(target);
    gl.autoClear = true;
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, true);

    scene.overrideMaterial = depthOnlyMaterial;
    camera.layers.set(0);
    gl.render(scene, camera);

    scene.overrideMaterial = surfaceIdMaterial;
    camera.layers.set(IMPORTED_SURFACE_LAYER);
    gl.render(scene, camera);

    touchedMeshes.forEach((m) => m.layers.disable(IMPORTED_SURFACE_LAYER));

    scene.overrideMaterial = prevOverride;
    camera.layers.mask = prevMask;
    gl.setRenderTarget(prevTarget);
    gl.autoClear = prevAutoClear;
    gl.setClearColor(clearColorRef, prevClearAlpha);
  });

  return (
    <Hud renderPriority={2}>
      <mesh frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
        <primitive object={overlayMaterial} attach="material" />
      </mesh>
    </Hud>
  );
}

function ThickEdges({
  geometry,
  opacity = 0.8,
  lineWidth = 1.5,
  depthTest = true,
  depthWrite = true,
  thresholdAngle = 18,
  cleanForEdges = false,
  loopOnly = false,
}) {
  const gl = useThree((s) => s.gl);

  const lineObj = useMemo(() => {
    let edgeSource = geometry;
    if (cleanForEdges) {
      const prep = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      prep.deleteAttribute("normal");
      prep.deleteAttribute("uv");
      prep.deleteAttribute("uv2");
      prep.computeBoundingBox();
      const bb = prep.boundingBox;
      const maxDim = bb
        ? Math.max(
            bb.max.x - bb.min.x,
            bb.max.y - bb.min.y,
            bb.max.z - bb.min.z,
          )
        : 1;
      const weldTolerance = Math.max(1e-3, maxDim * 2e-3);
      edgeSource = mergeVertices(prep, weldTolerance);
      prep.dispose();
    }
    const edges = new THREE.EdgesGeometry(edgeSource, thresholdAngle);
    if (edgeSource !== geometry) edgeSource.dispose();
    const geo = new LineSegmentsGeometry();
    let positions = edges.attributes.position.array;

    if (loopOnly && positions.length > 0) {
      const quant = 1e5;
      const keyOf = (x, y, z) =>
        `${Math.round(x * quant)}|${Math.round(y * quant)}|${Math.round(z * quant)}`;
      const vertexMap = new Map();
      const degree = new Map();
      const segs = [];
      let vid = 0;

      for (let i = 0; i < positions.length; i += 6) {
        const a = [positions[i], positions[i + 1], positions[i + 2]];
        const b = [positions[i + 3], positions[i + 4], positions[i + 5]];
        const ka = keyOf(a[0], a[1], a[2]);
        const kb = keyOf(b[0], b[1], b[2]);
        if (!vertexMap.has(ka)) vertexMap.set(ka, vid++);
        if (!vertexMap.has(kb)) vertexMap.set(kb, vid++);
        const ia = vertexMap.get(ka);
        const ib = vertexMap.get(kb);
        segs.push({ ia, ib, a, b });
        degree.set(ia, (degree.get(ia) || 0) + 1);
        degree.set(ib, (degree.get(ib) || 0) + 1);
      }

      const adjacency = new Map();
      segs.forEach((s, idx) => {
        if (!adjacency.has(s.ia)) adjacency.set(s.ia, []);
        if (!adjacency.has(s.ib)) adjacency.set(s.ib, []);
        adjacency.get(s.ia).push(idx);
        adjacency.get(s.ib).push(idx);
      });

      const visited = new Array(segs.length).fill(false);
      const kept = [];

      for (let i = 0; i < segs.length; i++) {
        if (visited[i]) continue;
        const queue = [i];
        visited[i] = true;
        const component = [];
        const verts = new Set();

        while (queue.length > 0) {
          const eIdx = queue.pop();
          const s = segs[eIdx];
          component.push(eIdx);
          verts.add(s.ia);
          verts.add(s.ib);
          const next = [
            ...(adjacency.get(s.ia) || []),
            ...(adjacency.get(s.ib) || []),
          ];
          next.forEach((nIdx) => {
            if (!visited[nIdx]) {
              visited[nIdx] = true;
              queue.push(nIdx);
            }
          });
        }

        const hasDangling = Array.from(verts).some(
          (v) => (degree.get(v) || 0) <= 1,
        );
        if (!hasDangling) kept.push(...component);
      }

      const filtered = [];
      kept.forEach((idx) => {
        const s = segs[idx];
        filtered.push(s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2]);
      });
      positions = new Float32Array(filtered);
    }

    geo.setPositions(positions);
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
  }, [
    geometry,
    lineWidth,
    opacity,
    depthTest,
    depthWrite,
    thresholdAngle,
    cleanForEdges,
    loopOnly,
    gl,
  ]);

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
        userData={{ isSceneObject: true, objectId: obj.id }}
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
      ? 88
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
      userData={{ isSceneObject: true, objectId: obj.id }}
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
              cleanForEdges={isImported}
              loopOnly={isImported}
            />
          )}
        </>
      )}
    </group>
  );
});

function CameraSetup({ orbitRef }) {
  const cameraMode = useDesignStore((s) => s.cameraMode);
  const perspRef = useRef();
  const orthoRef = useRef();
  const prevMode = useRef(cameraMode);
  const { size } = useThree();

  useEffect(() => {
    if (prevMode.current === cameraMode) return;
    const controls = orbitRef?.current;
    const fromCam = prevMode.current === "perspective" ? perspRef.current : orthoRef.current;
    const toCam   = cameraMode      === "perspective" ? perspRef.current : orthoRef.current;
    if (!fromCam || !toCam) { prevMode.current = cameraMode; return; }

    // Preserve position (and therefore viewing direction)
    toCam.position.copy(fromCam.position);

    if (cameraMode === "orthographic") {
      // Derive ortho zoom from perspective distance + fov so the scene looks the same size
      const target = controls ? controls.target : new THREE.Vector3();
      const distance = fromCam.position.distanceTo(target);
      const fov = fromCam.fov ?? 50;
      const viewHeight = 2 * Math.tan((fov * Math.PI) / 360) * distance;
      toCam.zoom = size.height / viewHeight;
    } else {
      // Derive perspective distance from ortho zoom so the scene looks the same size
      const target = controls ? controls.target : new THREE.Vector3();
      const viewHeight = size.height / (fromCam.zoom ?? 4);
      const fov = toCam.fov ?? 50;
      const distance = viewHeight / (2 * Math.tan((fov * Math.PI) / 360));
      const dir = new THREE.Vector3()
        .subVectors(fromCam.position, target)
        .normalize();
      toCam.position.copy(target).addScaledVector(dir, distance);
    }

    toCam.updateProjectionMatrix();

    // Re-point OrbitControls at the new camera so it doesn't jerk
    if (controls) {
      controls.object = toCam;
      controls.update();
    }

    prevMode.current = cameraMode;
  }, [cameraMode, orbitRef, size]);

  return (
    <>
      <PerspectiveCamera
        ref={perspRef}
        makeDefault={cameraMode === "perspective"}
        position={[60, 60, 60]}
        fov={50}
        near={0.5}
        far={10000}
      />
      <OrthographicCamera
        ref={orthoRef}
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
      zoomSpeed={-zoomSpeed}
      minDistance={1}
      maxDistance={10000}
    />
  );
}

function DragPreview({ meshRefs, objects }) {
  const groupRef = useRef();
  const { camera } = useThree();
  const draggingShape = useDesignStore((s) => s.draggingShape);
  const snapIncrement = useDesignStore((s) => s.snapIncrement);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const defaults = draggingShape
    ? SHAPE_DEFAULTS[draggingShape.type] || SHAPE_DEFAULTS.box
    : null;
  const color = draggingShape?.isHole
    ? "#ff4444"
    : defaults?.color || "#6366f1";

  const previewType = draggingShape ? draggingShape.type : "box";
  const previewParams = draggingShape
    ? draggingShape.type === "text"
      ? {
          ...(defaults?.geometry || {}),
          text: draggingShape.text || defaults?.geometry?.text || "Text",
        }
      : defaults?.geometry || SHAPE_DEFAULTS.box.geometry
    : SHAPE_DEFAULTS.box.geometry;
  const previewGeo = useObjectGeometry(previewType, previewParams);

  useFrame(() => {
    if (!groupRef.current) return;
    if (!dragCursor.active || !draggingShape) {
      groupRef.current.visible = false;
      return;
    }
    const placement = resolveDropPlacement({
      camera,
      ndc: dragCursor,
      meshRefs,
      objects,
      type: previewType,
      geometry: previewParams,
      snapIncrement,
      raycaster,
    });
    if (!placement) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;
    groupRef.current.position.set(...placement.position);
    groupRef.current.rotation.set(...placement.rotation);
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

function ArrayPreviewGhost({ obj, position }) {
  const previewType = obj.type;
  const previewParams = obj.geometry;
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
  const fallbackDims = obj ? getObjectWorldDims(obj) : null;

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

function DropHandler({ meshRefs, objects }) {
  const { camera } = useThree();
  const pendingDrop = useDesignStore((s) => s.pendingDrop);
  const clearPendingDrop = useDesignStore((s) => s.clearPendingDrop);
  const addObject = useDesignStore((s) => s.addObject);
  const snapIncrement = useDesignStore((s) => s.snapIncrement);

  useEffect(() => {
    if (!pendingDrop) return;

    const { ndc, type, isHole, text } = pendingDrop;
    const raycaster = new THREE.Raycaster();
    const baseGeometry =
      type === "text" && text
        ? { text, size: 10, height: 5, font: "helvetiker" }
        : SHAPE_DEFAULTS[type]?.geometry || SHAPE_DEFAULTS.box.geometry;
    const placement = resolveDropPlacement({
      camera,
      ndc,
      meshRefs,
      objects,
      type,
      geometry: baseGeometry,
      snapIncrement,
      raycaster,
    });

    if (placement) {
      const overrides = {
        position: placement.position,
        rotation: placement.rotation,
      };
      if (isHole) overrides.isHole = true;
      if (type === "text" && text) overrides.geometry = baseGeometry;
      addObject(type, overrides);
    }

    clearPendingDrop();
  }, [pendingDrop, camera, addObject, clearPendingDrop, snapIncrement, meshRefs, objects]);

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
const ROTATION_ARC_RADIUS = 15;
const ROTATION_ARC_BAND = 2.0;
const ROTATION_ARC_INNER = ROTATION_ARC_RADIUS - ROTATION_ARC_BAND;
const ROTATION_ARC_SPACING = 4;
const HOLE_ROUNDED_EDGE_TYPES = new Set([
  "sphere",
  "halfSphere",
  "cylinder",
  "capsule",
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
  capsule: 20,
  halfCylinder: 20,
  cone: 20,
  sphere: 14,
  halfSphere: 14,
  ellipsoid: 2,
  paraboloid: 14,
};

function ObjectHandles({
  meshRefs,
  selectedId,
  orbitRef,
  setTransforming,
  transforming = false,
}) {
  const updateObjectSilent = useDesignStore((s) => s.updateObjectSilent);
  const workplaneMode = useDesignStore((s) => s.workplaneMode);
  const obj = useDesignStore((s) => {
    if (s.selectedIds.length !== 1) return null;
    const o = s.objects.find((o) => o.id === s.selectedIds[0]);
    if (!o || o.locked) return null;
    return o;
  });
  const snapIncrement = useDesignStore((s) => s.snapIncrement);
  const { camera, gl, scene } = useThree();

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
  const inverseQuatRef = useRef(new THREE.Quaternion());
  const objIdRef = useRef(null);
  const handleContainerRef = useRef(null);
  const composePosRef = useRef(new THREE.Vector3());
  const composeQuatRef = useRef(new THREE.Quaternion());
  const composeScaleRef = useRef(new THREE.Vector3());
  const composeEulerRef = useRef(new THREE.Euler(0, 0, 0, "XYZ"));
  const composeMatrixRef = useRef(new THREE.Matrix4());
  const parentInvRef = useRef(new THREE.Matrix4());

  const [hoveredArc, setHoveredArc] = useState(null);
  const [angleInfo, setAngleInfo] = useState(null);
  const [liveScale, setLiveScale] = useState(null);
  const [meshBounds, setMeshBounds] = useState(null);

  const interactionPlane = useMemo(() => new THREE.Plane(), []);
  const hitPoint = useMemo(() => new THREE.Vector3(), []);
  const caster = useMemo(() => new THREE.Raycaster(), []);
  const centerPt = useMemo(() => new THREE.Vector3(), []);
  const identityQuat = useMemo(() => new THREE.Quaternion(), []);
  const objectQuat = useMemo(() => {
    const q = new THREE.Quaternion();
    if (obj?.rotation) {
      q.setFromEuler(
        new THREE.Euler(
          obj.rotation[0] || 0,
          obj.rotation[1] || 0,
          obj.rotation[2] || 0,
          "XYZ",
        ),
      );
    }
    return q;
  }, [obj?.rotation?.[0], obj?.rotation?.[1], obj?.rotation?.[2]]);

  const active = !!obj;
  const behavior = active ? getObjectBehavior(obj.type) : null;
  const effectiveObj = active && liveScale ? { ...obj, scale: liveScale } : obj;
  const dims = active
    ? getObjectWorldDims(effectiveObj)
    : { width: 20, height: 20, depth: 20 };
  const rawDims = active
    ? {
        width: dims.width / Math.abs(effectiveObj.scale[0]),
        height: dims.height / Math.abs(effectiveObj.scale[1]),
        depth: dims.depth / Math.abs(effectiveObj.scale[2]),
      }
    : dims;
  const arcR = ROTATION_ARC_RADIUS;
  const arcBand = ROTATION_ARC_BAND;
  const arcGeo = useMemo(
    () =>
      new THREE.RingGeometry(
        ROTATION_ARC_INNER,
        ROTATION_ARC_RADIUS + ROTATION_ARC_BAND,
        48,
        1,
        0,
        Math.PI / 2,
      ),
    [],
  );
  const hoverRingGeo = useMemo(
    () =>
      new THREE.RingGeometry(
        ROTATION_ARC_INNER,
        ROTATION_ARC_RADIUS + ROTATION_ARC_BAND,
        64,
        1,
        0,
        Math.PI * 2,
      ),
    [],
  );
  const rotationProgressArcGeo = useMemo(() => {
    if (!angleInfo) return null;
    const rad = (angleInfo.deg * Math.PI) / 180;
    const start = rad >= 0 ? 0 : rad;
    const len = rad >= 0 ? rad : -rad;
    if (Math.abs(len) < 0.001) return null;
    return new THREE.RingGeometry(
      0,
      ROTATION_ARC_RADIUS + ROTATION_ARC_BAND,
      24,
      1,
      start,
      len,
    );
  }, [angleInfo?.axis, angleInfo?.deg]);
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
  const scaleCubeGeo = useMemo(
    () => new THREE.BoxGeometry(1.4, 1.4, 1.4),
    [],
  );
  const scaleCubeEdges = useMemo(
    () => new THREE.EdgesGeometry(scaleCubeGeo),
    [scaleCubeGeo],
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

  const scaleBoxRef = useRef(new THREE.Box3());
  const scaleSizeRef = useRef(new THREE.Vector3());
  const scaleCenterRef = useRef(new THREE.Vector3());

  useFrame(
    () => {
      if (!active) {
        if (meshBounds) setMeshBounds(null);
        return;
      }
      const id = objIdRef.current;
      if (!id) return;
      const mesh = meshRefs.current[id];
      if (!mesh) return;
      const o = useDesignStore
        .getState()
        .objects.find((ob) => ob.id === id);

      // Sync handle container to object (store) so handles follow scale/position/rotation.
      // Derive bounds from store when we have the object so container and bounds never desync
      // (e.g. after proportional then non-proportional scale).
      if (o) {
        // Freeze bounds while rotating so handles stay fixed at their drag-start positions.
        // The AABB changes every frame during rotation (non-spherical objects), which would
        // cause hw/hh/hd to shift and all handles to dance around their pivot point.
        if (drag.current?.type !== "rotate") {
          const d = getObjectWorldDims(o);
          const px = o.position[0] ?? 0;
          const py = o.position[1] ?? 0;
          const pz = o.position[2] ?? 0;
          setMeshBounds({
            hw: d.width / 2,
            hh: d.height / 2,
            hd: d.depth / 2,
            cx: px,
            cy: py,
            cz: pz,
          });
        }
      } else {
        mesh.updateMatrixWorld(true);
        scaleBoxRef.current.setFromObject(mesh);
        scaleBoxRef.current.getSize(scaleSizeRef.current);
        scaleBoxRef.current.getCenter(scaleCenterRef.current);
        setMeshBounds({
          hw: scaleSizeRef.current.x / 2,
          hh: scaleSizeRef.current.y / 2,
          hd: scaleSizeRef.current.z / 2,
          cx: scaleCenterRef.current.x,
          cy: scaleCenterRef.current.y,
          cz: scaleCenterRef.current.z,
        });
      }

      if (handleContainerRef.current) {
        handleContainerRef.current.matrixAutoUpdate = false;
        let targetWorld = composeMatrixRef.current;
        if (o) {
          composePosRef.current.set(
            o.position[0] ?? 0,
            o.position[1] ?? 0,
            o.position[2] ?? 0,
          );
          composeEulerRef.current.set(0, 0, 0);
          composeQuatRef.current.identity();
          composeScaleRef.current.set(1, 1, 1);
          targetWorld.compose(
            composePosRef.current,
            composeQuatRef.current,
            composeScaleRef.current,
          );
        } else {
          targetWorld.copy(mesh.matrixWorld);
        }
        const parent = handleContainerRef.current.parent;
        if (!parent) {
          handleContainerRef.current.matrix.copy(targetWorld);
        } else {
          parentInvRef.current.copy(parent.matrixWorld).invert();
          handleContainerRef.current.matrix
            .copy(targetWorld)
            .premultiply(parentInvRef.current);
        }
        scene.updateMatrixWorld(true);
      }
    },
    1,
  );

  if (!active) return null;

  const mesh = meshRefs.current[selectedId];
  if (!mesh) return null;

  const useStateDrivenHandles = !transforming && !drag.current;
  const meshQuat = new THREE.Quaternion();
  mesh.getWorldQuaternion(meshQuat);
  const handleQuat = useStateDrivenHandles ? objectQuat : meshQuat;
  if (angleInfo) inverseQuatRef.current.copy(handleQuat).invert();

  // Use store-driven dimensions (dims / effectiveObj) so handle layout updates immediately
  // on proportional or axis scale, including during drag (liveScale).
  const hw = dims.width / 2;
  const hh = dims.height / 2;
  const hd = dims.depth / 2;

  const objectDims = { width: dims.width, height: dims.height, depth: dims.depth };
  const isRingOrTorusLike = obj.type === "torus" || obj.type === "tube" || obj.type === "ring";
  const scaleHandlesFromBehavior = behavior.getScaleHandles(obj, objectDims);
  const uniformScaleHandle = {
    uniformScale: true,
    dir: [0, 1, 0],
    pos: [0, hh + 15, 0],
    label: "U",
  };

  const rawExtents = getRawExtents(obj.type, obj.geometry);
  const rawHx = rawExtents[0];
  const rawHy = rawExtents[1];
  const rawHz = rawExtents[2];
  // Container has no scale; all handle positions in dimension space (hw, hh, hd).
  const toDimension = (pos) => [
    (pos[0] * hw) / (rawHx || 1e-6),
    (pos[1] * hh) / (rawHy || 1e-6),
    (pos[2] * hd) / (rawHz || 1e-6),
  ];

  // Scale handles: avoid overshoot by putting the face in dimension space then adding a
  // fixed offset in world units (behavior offset is in geometry space and was being scaled).
  const scaleHandleOffset = behavior.handleOffset ?? 3;
  // For ring/torus/tube the behavior already positions handles at the face + offset;
  // add a small gap so they sit just outside without overlapping translate arrows.
  const scaleHandleFixedGap = isRingOrTorusLike ? 0 : 2;
  // Torus/tube behavior returns scale handle positions in dimension space; add fixed gap in handle direction.
  // Ring uses default handle family (geometry space) so it goes through toDimension below. Imported: use as-is.
  const scaleHandlesFromBehaviorInDim = scaleHandlesFromBehavior.map((h) => {
    if (obj.type === "imported") {
      return { ...h, pos: [...h.pos] };
    }
    if (obj.type === "torus" || obj.type === "tube" || obj.type === "ring") {
      const [dx, dy, dz] = h.dir;
      return {
        ...h,
        pos: [
          h.pos[0] + dx * scaleHandleFixedGap,
          h.pos[1] + dy * scaleHandleFixedGap,
          h.pos[2] + dz * scaleHandleFixedGap,
        ],
      };
    }
    const [dx, dy, dz] = h.dir;
    const faceRaw = [
      h.pos[0] - dx * scaleHandleOffset,
      h.pos[1] - dy * scaleHandleOffset,
      h.pos[2] - dz * scaleHandleOffset,
    ];
    const faceDim = toDimension(faceRaw);
    const pos = [
      faceDim[0] + dx * scaleHandleFixedGap,
      faceDim[1] + dy * scaleHandleFixedGap,
      faceDim[2] + dz * scaleHandleFixedGap,
    ];
    return { ...h, pos };
  });
  const scaleHandles = [
    ...scaleHandlesFromBehaviorInDim,
    { ...uniformScaleHandle, pos: [0, hh + 15, 0] },
  ];

  const translateArrowsRaw = behavior.getTranslateArrows({ hw, hh, hd });
  // Ring/torus/tube: arrows further out than scale handles (which are at face+handleOffset=face+3)
  // so they don't overlap. handleOffset=3 → scale handle at face+3; arrow at face+8.
  const arrowGap = isRingOrTorusLike ? 8 : (behavior.translateArrowGap ?? 10);
  const translateArrows = translateArrowsRaw.map((a) => {
    const [dx, dy, dz] = a.dir;
    const pos =
      dx !== 0
        ? [dx > 0 ? hw + arrowGap : -hw - arrowGap, 0, 0]
        : dy !== 0
          ? [0, dy > 0 ? hh + arrowGap : -hh - arrowGap, 0]
          : [0, 0, dz > 0 ? hd + arrowGap : -hd - arrowGap];
    return { ...a, pos };
  });

  const rotationArcsRaw = behavior.getRotationArcs({ hw, hh, hd });
  // For ring/torus/tube (flat, small height): place arcs just outside the bounding box faces
  // with a small 2-unit gap. The ROTATION_ARC_INNER formula overshoots for small flat shapes
  // because ROTATION_ARC_INNER (13) is larger than the object's radius.
  // For normal shapes: use the existing corner-based formula.
  const rotationArcs = rotationArcsRaw.map((arc) => {
    let pos;
    if (isRingOrTorusLike) {
      // Simple face-relative placement: just outside each face by 2 units
      pos =
        arc.axis === 0
          ? [-(hw + 2), 0, 0]       // just outside left face, in YZ plane
          : arc.axis === 1
            ? [hw + 2, -hh, hd]     // right-front at base, in XZ plane
            : [hw + 2, 0, hd];      // right at depth face, in XY plane
    } else {
      pos =
        arc.axis === 0
          ? [-hw - ROTATION_ARC_INNER - ROTATION_ARC_SPACING, hh / 2, hd + ROTATION_ARC_INNER + ROTATION_ARC_SPACING]
          : arc.axis === 1
            ? [hw + ROTATION_ARC_SPACING, -hh, 0]
            : [hw + ROTATION_ARC_SPACING, 0, hd];
    }
    return { ...arc, pos };
  });

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

  const resolveScaleParams = (targetObj, handle) => {
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        targetObj.rotation?.[0] || 0,
        targetObj.rotation?.[1] || 0,
        targetObj.rotation?.[2] || 0,
        "XYZ",
      ),
    );
    const invQ = q.invert();
    const localDir = new THREE.Vector3(...handle.dir)
      .applyQuaternion(invQ)
      .normalize();
    const ax = Math.abs(localDir.x);
    const ay = Math.abs(localDir.y);
    const az = Math.abs(localDir.z);
    const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    return behavior.resolveScaleParams(targetObj, handle, axis);
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
        const base = Math.max(drag.current.baseSize || 1, 1);
        let factor = 1 + d / base;
        if (!Number.isFinite(factor)) factor = 1;

        if (drag.current.handle.uniformScale) {
          const scale = startObjScale.current.map((s) =>
            Math.max(0.01, s * factor),
          );
          updateObjectSilent(id, { scale });
          return;
        }
        if (drag.current.handle.scaleAxis !== undefined) {
          const axis = drag.current.handle.scaleAxis;
          const scale = [...startObjScale.current];
          scale[axis] = Math.max(0.01, startObjScale.current[axis] * factor);
          const pos = [...startPosition.current];
          const dir = drag.current.handleDir;
          const raw = drag.current.rawExtents;
          pos[axis] =
            startPosition.current[axis] +
            (dir[axis] || 0) * (scale[axis] - startObjScale.current[axis]) * (raw[axis] ?? 10);
          updateObjectSilent(id, { scale, position: pos });
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
          // Box-like params: full dimension → shift center by delta/2
          const paramToAxis = { width: 0, height: 1, depth: 2 };
          // Radius params: half-dimension → shift center by full delta (no /2)
          // The axis is inferred from the handle direction since the same param
          // (e.g. "radius") can be dragged along X or Z.
          const radiusParams = new Set(["tube", "radius", "outerRadius"]);
          const inferAxisFromDir = (dir) => {
            const [dx, dy, dz] = dir.map(Math.abs);
            return dx >= dy && dx >= dz ? 0 : dy >= dz ? 1 : 2;
          };
          let axis = paramToAxis[drag.current.param];
          let halfFactor = 0.5; // full-dimension params: shift by half
          if (axis === undefined && drag.current.handleDir && radiusParams.has(drag.current.param)) {
            axis = inferAxisFromDir(drag.current.handleDir);
            halfFactor = 1; // radius params: shift by full delta
          }
          // ring "height" is a full dimension on Y, same as box height
          if (axis === undefined && drag.current.param === "height" && drag.current.handleDir) {
            axis = 1;
            halfFactor = 0.5;
          }
          const pos = axis !== undefined ? [...cur.position] : cur.position;
          if (axis !== undefined && drag.current.handleDir) {
            const dir = drag.current.handleDir;
            const scaleA = cur.scale?.[axis] ?? 1;
            pos[axis] =
              startPosition.current[axis] +
              (dir[axis] || 0) * ((val - startValue.current) * halfFactor) * scaleA;
          }
          updateObjectSilent(id, {
            geometry: geoUpdate,
            ...(axis !== undefined && drag.current.handleDir ? { position: pos } : {}),
          });
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
      while (accumDelta.current > Math.PI) accumDelta.current -= 2 * Math.PI;
      while (accumDelta.current < -Math.PI) accumDelta.current += 2 * Math.PI;
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
    if (drag.current.type === "scale") {
      setLiveScale(null);
    }
    drag.current = null;
    sceneInteracting.active = false;
    if (orbitRef.current) orbitRef.current.enabled = true;
    document.removeEventListener("pointermove", handleDomMove);
    document.removeEventListener("pointerup", handleDomUp);
  };

  const beginDrag = (e) => {
    e.stopPropagation();
    sceneInteracting.active = true;
    if (orbitRef.current) orbitRef.current.enabled = false;
    useDesignStore.getState()._saveSnapshot();
    document.addEventListener("pointermove", handleDomMove);
    document.addEventListener("pointerup", handleDomUp);
  };

  const onScaleDown = (e, handle) => {
    beginDrag(e);
    const ne = e.nativeEvent || e;
    const shiftKey = !!(ne && ne.shiftKey);
    const uniformScale =
      handle.uniformScale ||
      (shiftKey && (handle.scaleAxis !== undefined || handle.param != null));
    const dirW = new THREE.Vector3(...handle.dir).normalize();
    if (workplaneMode) {
      dirW.applyQuaternion(handleQuat).normalize();
    }
    makeDragPlane(dirW, e.point);
    const { param, linkedParam } =
      uniformScale ||
      workplaneMode ||
      handle.scaleAxis !== undefined
        ? { param: handle.param, linkedParam: handle.linkedParam }
        : resolveScaleParams(obj, handle);
    const baseSize =
      uniformScale || handle.uniformScale
        ? (rawDims.width + rawDims.height + rawDims.depth) / 3
        : handle.scaleAxis === 0
          ? rawDims.width
          : handle.scaleAxis === 1
            ? rawDims.height
            : handle.scaleAxis === 2
              ? rawDims.depth
              : undefined;
    drag.current = {
      type: "scale",
      handle: { ...handle, uniformScale: uniformScale || handle.uniformScale },
      dirW,
      param,
      linkedParam,
      baseSize,
      handleDir: [...handle.dir],
      rawExtents: getRawExtents(obj.type, obj.geometry),
    };
    startPt.copy(e.point);
    startObjScale.current = [...obj.scale];
    startPosition.current = [...obj.position];
    startValue.current = param ? obj.geometry[param] : 0;
    startLinkedValue.current = linkedParam ? obj.geometry[linkedParam] : 0;
  };

  const onTranslateDown = (e, arrow) => {
    beginDrag(e);
    setTransforming(true);
    const dirW = new THREE.Vector3(...arrow.dir).normalize();
    if (workplaneMode) {
      dirW.applyQuaternion(handleQuat).normalize();
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
    mesh.getWorldPosition(centerPt);
    const worldAxis = localAxes[arc.axis].clone();
    if (workplaneMode) {
      worldAxis.applyQuaternion(handleQuat).normalize();
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
    startQuat.current.copy(handleQuat);

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
    <group ref={handleContainerRef}>
      {!rotating && (
        <group quaternion={workplaneMode ? handleQuat : identityQuat}>
          {/* Scale/Translate in mesh local space so they follow scale */}
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
              const isUniform = h.uniformScale;
              const geo = isUniform ? scaleCubeGeo : scaleTriGeo;
              const edges = isUniform ? scaleCubeEdges : scaleTriEdges;
              return (
                <group key={`sc${i}`} position={h.pos} rotation={rotation}>
                  <mesh
                    onPointerDown={(e) => onScaleDown(e, h)}
                    renderOrder={999}
                    geometry={geo}
                    userData={{ isTransformHandle: true }}
                  >
                    <meshBasicMaterial
                      color="#1a1a2e"
                      depthTest={false}
                      depthWrite={false}
                    />
                  </mesh>
                  <lineSegments renderOrder={1000} geometry={edges}>
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
      )}

      {/* Rotation arcs - same local space as scale/translate */}
      <group quaternion={workplaneMode ? handleQuat : identityQuat}>
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
                      opacity={0.2}
                      depthTest={false}
                      depthWrite={false}
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                )}
                {angleInfo?.axis === arc.axis && rotationProgressArcGeo && (
                  <mesh geometry={rotationProgressArcGeo} renderOrder={997}>
                    <meshBasicMaterial
                      color={arc.color}
                      transparent
                      opacity={0.7}
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
                  renderOrder={1000}
                  userData={{ isTransformHandle: true }}
                >
                  <meshBasicMaterial
                    color={arc.color}
                    transparent
                    opacity={0.4}
                    depthTest={false}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              </group>
            );
          })}
        </group>

        {/* Rotation: visual arc (sweep) + label in counter-rotated group so label stays upright */}
        {angleInfo && (
          <group quaternion={inverseQuatRef.current}>
            <Html
              center
              style={{ pointerEvents: "none" }}
              position={[0, hh + 10, 0]}
            >
              <div
                className="dml-rotation-label"
                style={{
                  color: AXIS_COLORS[angleInfo.axis],
                  borderColor: AXIS_COLORS[angleInfo.axis],
                }}
              >
                <span className="dml-rotation-label-axis">{AXIS_LABELS[angleInfo.axis]}</span>
                <span className="dml-rotation-label-angle">
                  {angleInfo.deg >= 0 ? "+" : ""}{angleInfo.deg}°
                </span>
              </div>
            </Html>
          </group>
        )}
    </group>
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
  const arcR = ROTATION_ARC_RADIUS;

  const drag = useRef(null);
  const startPt = useMemo(() => new THREE.Vector3(), []);
  const interactionPlane = useMemo(() => new THREE.Plane(), []);
  const hitPoint = useMemo(() => new THREE.Vector3(), []);
  const caster = useMemo(() => new THREE.Raycaster(), []);
  const prevAngleRef = useRef(0);
  const accumDelta = useRef(0);
  const [hoveredArc, setHoveredArc] = useState(null);
  const [angleInfo, setAngleInfo] = useState(null);

  const arcGeo = useMemo(
    () =>
      new THREE.RingGeometry(
        ROTATION_ARC_INNER,
        ROTATION_ARC_RADIUS + ROTATION_ARC_BAND,
        48,
        1,
        0,
        Math.PI / 2,
      ),
    [],
  );
  const hoverRingGeo = useMemo(
    () =>
      new THREE.RingGeometry(
        ROTATION_ARC_INNER,
        ROTATION_ARC_RADIUS + ROTATION_ARC_BAND,
        64,
        1,
        0,
        Math.PI * 2,
      ),
    [],
  );
  const rotationProgressArcGeo = useMemo(() => {
    if (!angleInfo) return null;
    const rad = (angleInfo.deg * Math.PI) / 180;
    const start = rad >= 0 ? 0 : rad;
    const len = rad >= 0 ? rad : -rad;
    if (Math.abs(len) < 0.001) return null;
    return new THREE.RingGeometry(
      0,
      ROTATION_ARC_RADIUS + ROTATION_ARC_BAND,
      24,
      1,
      start,
      len,
    );
  }, [angleInfo?.axis, angleInfo?.deg]);
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
      while (accumDelta.current > Math.PI) accumDelta.current -= 2 * Math.PI;
      while (accumDelta.current < -Math.PI) accumDelta.current += 2 * Math.PI;
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
      pos: [-hw - ROTATION_ARC_INNER - ROTATION_ARC_SPACING, hh / 2, hd + ROTATION_ARC_INNER + ROTATION_ARC_SPACING],
      arcRot: [0, Math.PI / 2, 0],
      color: "#ef4444",
    },
    {
      axis: 1,
      pos: [hw + ROTATION_ARC_SPACING, -hh, 0],
      arcRot: [-Math.PI / 2, 0, 0],
      color: "#22c55e",
    },
    { axis: 2, pos: [hw + ROTATION_ARC_SPACING, 0, hd], arcRot: [0, 0, 0], color: "#3b82f6" },
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
                    opacity={0.2}
                    depthTest={false}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              )}
              {angleInfo?.axis === arc.axis && rotationProgressArcGeo && (
                <mesh geometry={rotationProgressArcGeo} renderOrder={997}>
                  <meshBasicMaterial
                    color={arc.color}
                    transparent
                    opacity={0.7}
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
                renderOrder={1000}
                userData={{ isTransformHandle: true }}
              >
                <meshBasicMaterial
                  color={arc.color}
                  transparent
                  opacity={0.4}
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
              style={{
                color: AXIS_COLORS[angleInfo.axis],
                borderColor: AXIS_COLORS[angleInfo.axis],
              }}
            >
              <span className="dml-rotation-label-axis">{AXIS_LABELS[angleInfo.axis]}</span>
              <span className="dml-rotation-label-angle">
                {angleInfo.deg >= 0 ? "+" : ""}{angleInfo.deg}°
              </span>
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

function RaycasterCameraSync() {
  const { camera, raycaster } = useThree();
  useFrame(() => {
    if (raycaster && camera) raycaster.camera = camera;
  }, -100);
  return null;
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
            surfaceRaycaster.camera = camera;
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
      <CameraSetup orbitRef={orbitRef} />
      <RaycasterCameraSync />

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
        transforming={transforming}
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
      <DragPreview meshRefs={meshRefs} objects={objects} />
      <ArrayPreview />
      <WorkplaneOverlay meshRefs={meshRefs} selectedId={selectedId} />
      <DropHandler meshRefs={meshRefs} objects={objects} />
      <MirrorHintOverlay />

      <CameraControls orbitRef={orbitRef} />
      <ImportedSurfaceIdOutline
        meshRefs={meshRefs}
        visibleObjects={visibleObjects}
        enabled={false}
      />
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
