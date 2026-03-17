import { Application } from "pixi.js";
import GameManager from "./lib/GameManager";
import { DemoScene } from "./lib/DemoScene";

// Create a new application
const app = new Application();
(async () => {
  await preload();

  // Initialize GameManager
  GameManager.create(app);

  // Create demo scene
  const demoScene = new DemoScene();

  // Create and add interactive controls
  const controls = demoScene.createInteractiveControls();
  document.body.appendChild(controls);

  // Load the main demo scene by default
  demoScene.createDemoScene();
})();

async function preload() {
  // Initialize the application
  const container = document.getElementById("pixi-container")!;
  await app.init({
    background: "#2c3e50",
    resizeTo: container,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
  });

  // Append the application canvas to the document body
  document.getElementById("pixi-container")!.appendChild(app.canvas);
}
