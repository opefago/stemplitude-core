import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { createGeometry } from './geometryFactory';
import { SHAPE_DEFAULTS, FLAT_TYPES, ICON_TYPES } from './store';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/fonts/helvetiker_regular.typeface.json';

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

  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.BackSide,
    polygonOffset: true,
    polygonOffsetFactor: 5,
    polygonOffsetUnits: 5,
  });
  const outlineMesh = new THREE.Mesh(geometry, outlineMat);
  outlineMesh.scale.multiplyScalar(1.1);

  const edges = new THREE.EdgesGeometry(geometry, 18);
  const lineGeo = new LineSegmentsGeometry();
  lineGeo.setPositions(edges.attributes.position.array);
  edges.dispose();
  const res = SIZE * PIXEL_RATIO;
  const lineMat = new LineMaterial({
    color: 0x000000,
    linewidth: 2.5,
    transparent: true,
    opacity: 0.85,
    worldUnits: false,
    resolution: new THREE.Vector2(res, res),
  });
  const edgeLines = new LineSegments2(lineGeo, lineMat);

  if (FLAT_TYPES.includes(type)) {
    mesh.rotation.x = -Math.PI / 2;
    outlineMesh.rotation.x = -Math.PI / 2;
    edgeLines.rotation.x = -Math.PI / 2;
  }

  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  mesh.position.sub(center);
  outlineMesh.position.copy(mesh.position);
  edgeLines.position.copy(mesh.position);

  const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360)) * 1.6;
  if (type === 'text') {
    camera.position.set(dist * 0.4, dist * 0.5, dist * 0.6);
  } else if (type === 'wall') {
    camera.position.set(dist * 0.3, dist * 0.5, dist);
  } else {
    camera.position.set(dist * 0.7, dist * 0.5, dist);
  }
  camera.lookAt(0, 0, 0);

  scene.add(outlineMesh);
  scene.add(mesh);
  scene.add(edgeLines);
  renderer.render(scene, camera);
  scene.remove(edgeLines);
  scene.remove(mesh);
  scene.remove(outlineMesh);

  const dataUrl = renderer.domElement.toDataURL('image/png');
  geometry.dispose();
  material.dispose();
  outlineMat.dispose();
  lineGeo.dispose();
  lineMat.dispose();
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

  for (const type of ICON_TYPES) {
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
