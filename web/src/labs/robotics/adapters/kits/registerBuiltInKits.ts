import { registerVexVrKit } from "./vexVrKit";

let initialized = false;

export function registerBuiltInKits() {
  if (initialized) return;
  initialized = true;
  registerVexVrKit();
}

registerBuiltInKits();

