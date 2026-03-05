import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { SHAPE_DEFAULTS, FLAT_TYPES } from './store';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/fonts/helvetiker_regular.typeface.json';

function createHeartShape(size) {
  const s = new THREE.Shape();
  const x = 0, y = 0;
  s.moveTo(x, y + size * 0.35);
  s.bezierCurveTo(x, y + size * 0.35, x - size * 0.05, y + size * 0.7, x - size * 0.45, y + size * 0.7);
  s.bezierCurveTo(x - size * 0.9, y + size * 0.7, x - size * 0.9, y + size * 0.35, x - size * 0.9, y + size * 0.35);
  s.bezierCurveTo(x - size * 0.9, y + size * 0.1, x - size * 0.7, y - size * 0.25, x, y - size * 0.6);
  s.bezierCurveTo(x + size * 0.7, y - size * 0.25, x + size * 0.9, y + size * 0.1, x + size * 0.9, y + size * 0.35);
  s.bezierCurveTo(x + size * 0.9, y + size * 0.35, x + size * 0.9, y + size * 0.7, x + size * 0.45, y + size * 0.7);
  s.bezierCurveTo(x + size * 0.05, y + size * 0.7, x, y + size * 0.35, x, y + size * 0.35);
  return s;
}

function createStarShape(outerR, innerR, points) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) s.moveTo(px, py);
    else s.lineTo(px, py);
  }
  s.closePath();
  return s;
}

function createGeometry(type, params) {
  const p = params;
  switch (type) {
    case 'box': case 'wall':
      return new THREE.BoxGeometry(p.width, p.height, p.depth);
    case 'sphere':
      return new THREE.SphereGeometry(p.radius, 32, 32);
    case 'cylinder':
      return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 32);
    case 'cone': case 'pyramid':
      return new THREE.ConeGeometry(p.radius, p.height, p.radialSegments || 32);
    case 'torus': case 'tube':
      return new THREE.TorusGeometry(p.radius, p.tube, p.radialSegments || 16, p.tubularSegments || 48);
    case 'hemisphere': {
      const dome = new THREE.SphereGeometry(p.radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const cap = new THREE.CircleGeometry(p.radius, 32);
      cap.rotateX(Math.PI / 2);
      const geo = mergeGeometries([dome, cap]);
      geo.translate(0, -p.radius / 2, 0);
      return geo;
    }
    case 'heart': {
      const shape = createHeartShape(p.size);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: p.depth, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.3, bevelSegments: 3 });
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      geo.translate(0, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
      return geo;
    }
    case 'star': {
      const shape = createStarShape(p.outerRadius, p.innerRadius, p.points);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: p.depth, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.3, bevelSegments: 3 });
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      geo.translate(0, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
      return geo;
    }
    case 'wedge': {
      const w = p.width / 2, hh = p.height / 2, d = p.depth / 2;
      const positions = new Float32Array([-w,-hh,d, w,-hh,d, w,-hh,-d, -w,-hh,-d, w,hh,-d, -w,hh,-d]);
      const indices = [0,2,1, 0,3,2, 3,5,4, 3,4,2, 0,1,4, 0,4,5, 0,5,3, 1,2,4];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      return g;
    }
    default:
      return new THREE.BoxGeometry(20, 20, 20);
  }
}

const SIZE = 64;
const PIXEL_RATIO = 2;

let cache = null;
let cachePromise = null;

function loadFont() {
  return new Promise((resolve, reject) => {
    new FontLoader().load(FONT_URL, resolve, undefined, reject);
  });
}

function renderIcon(renderer, scene, camera, gradientMap, type, geometry, color) {
  const baseColor = new THREE.Color(color);
  if (type === 'wall') {
    baseColor.offsetHSL(0, 0.15, 0.3);
  } else {
    baseColor.offsetHSL(0, 0.1, 0.15);
  }
  const material = new THREE.MeshToonMaterial({ color: baseColor, gradientMap });
  const mesh = new THREE.Mesh(geometry, material);

  if (FLAT_TYPES.includes(type)) {
    mesh.rotation.x = -Math.PI / 2;
  }

  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  mesh.position.sub(center);

  const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360)) * 1.6;
  if (type === 'text') {
    camera.position.set(dist * 0.4, dist * 0.5, dist * 0.6);
  } else if (type === 'wall') {
    camera.position.set(dist * 0.3, dist * 0.5, dist);
  } else {
    camera.position.set(dist * 0.7, dist * 0.5, dist);
  }
  camera.lookAt(0, 0, 0);

  scene.add(mesh);
  renderer.render(scene, camera);
  scene.remove(mesh);

  const dataUrl = renderer.domElement.toDataURL('image/png');
  geometry.dispose();
  material.dispose();
  return dataUrl;
}

async function generateIcons() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(PIXEL_RATIO);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(3, 4, 5);
  scene.add(dirLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
  fillLight.position.set(-2, 1, -3);
  scene.add(fillLight);

  const toonData = new Uint8Array([40, 120, 180, 255]);
  const gradientMap = new THREE.DataTexture(toonData, toonData.length, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;

  const results = {};

  const nonTextTypes = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'wall', 'pyramid',
    'heart', 'star', 'hemisphere', 'tube', 'wedge'];

  for (const type of nonTextTypes) {
    const defaults = SHAPE_DEFAULTS[type] || SHAPE_DEFAULTS.box;
    let geoParams = type === 'wall'
      ? { ...defaults.geometry, depth: 6 }
      : defaults.geometry;
    const geometry = createGeometry(type, geoParams);
    results[type] = renderIcon(renderer, scene, camera, gradientMap, type, geometry, defaults.color);
  }

  try {
    const font = await loadFont();
    const textGeo = new TextGeometry('hello', {
      font,
      size: 8,
      depth: 5,
      curveSegments: 8,
      bevelEnabled: true,
      bevelThickness: 0.5,
      bevelSize: 0.4,
      bevelSegments: 3,
    });
    textGeo.computeBoundingBox();
    const bb = textGeo.boundingBox;
    textGeo.translate(
      -(bb.min.x + bb.max.x) / 2,
      -(bb.min.y + bb.max.y) / 2,
      -(bb.min.z + bb.max.z) / 2,
    );
    textGeo.rotateX(Math.PI / 2);
    results.text = renderIcon(renderer, scene, camera, gradientMap, 'text', textGeo, SHAPE_DEFAULTS.text.color);
  } catch {
    const fallback = new THREE.BoxGeometry(20, 10, 5);
    results.text = renderIcon(renderer, scene, camera, gradientMap, 'text', fallback, SHAPE_DEFAULTS.text.color);
  }

  gradientMap.dispose();
  renderer.dispose();

  cache = results;
  return results;
}

export function getShapeIcons() {
  if (cache) return cache;
  if (!cachePromise) {
    cachePromise = generateIcons();
  }
  return cachePromise;
}
