import * as THREE from "three";

function createToonGradient(stops) {
  const data = new Uint8Array(stops);
  const texture = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

// Shared toon ramps used across 3D labs for consistent shading.
export const toonGradientMap = createToonGradient([60, 100, 160, 220, 255]);
export const smoothToonGradientMap = createToonGradient([96, 124, 152, 180, 208, 236, 255]);
