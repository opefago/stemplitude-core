import * as THREE from 'three';
import { Evaluator, Brush, ADDITION, SUBTRACTION } from 'three-bvh-csg';

const evaluator = new Evaluator();

function createGeometryForCSG(obj) {
  const p = obj.geometry;
  switch (obj.type) {
    case 'box': case 'wall': case 'wedge':
      return new THREE.BoxGeometry(p.width, p.height, p.depth);
    case 'sphere':
      return new THREE.SphereGeometry(p.radius, p.widthSegments || 32, p.heightSegments || 32);
    case 'cylinder':
      return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, p.radialSegments || 32);
    case 'cone': case 'pyramid':
      return new THREE.ConeGeometry(p.radius, p.height, p.radialSegments || 32);
    case 'torus': case 'tube':
      return new THREE.TorusGeometry(p.radius, p.tube, p.radialSegments || 16, p.tubularSegments || 48);
    case 'hemisphere':
      return new THREE.SphereGeometry(p.radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    case 'imported':
      if (p.bufferGeometry) return p.bufferGeometry.clone();
      return new THREE.BoxGeometry(20, 20, 20);
    default:
      return new THREE.BoxGeometry(20, 20, 20);
  }
}

function createBrush(obj) {
  const geometry = createGeometryForCSG(obj);
  const material = new THREE.MeshStandardMaterial({ color: obj.color });
  const brush = new Brush(geometry, material);
  brush.position.set(...obj.position);
  brush.rotation.set(...obj.rotation);
  brush.scale.set(...obj.scale);
  brush.updateMatrixWorld(true);
  return brush;
}

export function performCSG(objectsData) {
  const solids = objectsData.filter(o => !o.isHole);
  const holes = objectsData.filter(o => o.isHole);

  if (solids.length === 0) return null;

  let resultBrush = createBrush(solids[0]);
  for (let i = 1; i < solids.length; i++) {
    const brush = createBrush(solids[i]);
    resultBrush = evaluator.evaluate(resultBrush, brush, ADDITION);
  }

  for (const hole of holes) {
    const brush = createBrush(hole);
    resultBrush = evaluator.evaluate(resultBrush, brush, SUBTRACTION);
  }

  return resultBrush;
}
