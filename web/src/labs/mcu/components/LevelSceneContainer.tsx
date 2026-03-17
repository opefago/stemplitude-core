import React, { useEffect, useRef } from "react";
import { Application } from "pixi.js";
import GameManager from "../lib/GameManager";
import { LevelSceneManager } from "../lib/scenes/LevelSceneManager";

interface LevelSceneContainerProps {
  levelId: string;
}

export const LevelSceneContainer: React.FC<LevelSceneContainerProps> = ({
  levelId,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const gameManagerRef = useRef<GameManager | null>(null);
  const levelManagerRef = useRef<LevelSceneManager | null>(null);

  useEffect(() => {
    initializeLevel();
    setupEventListeners();

    return () => {
      cleanup();
    };
  }, [levelId]);

  const initializeLevel = async () => {
    if (!canvasRef.current) return;

    try {
      // Create Pixi application
      const app = new Application();
      await app.init({
        width: canvasRef.current.clientWidth,
        height: canvasRef.current.clientHeight,
        backgroundColor: 0x1a1a2e,
        resizeTo: canvasRef.current,
      });

      // Add canvas to container
      canvasRef.current.appendChild(app.canvas);
      appRef.current = app;

      // Initialize GameManager
      const gameManager = GameManager.create(app);
      gameManagerRef.current = gameManager;

      // Initialize Level Scene Manager
      const levelManager = new LevelSceneManager();
      levelManagerRef.current = levelManager;

      // Make globally accessible for the level scenes
      (window as any).levelSceneManager = levelManager;

      // Start the specific level
      const success = levelManager.startLevel(levelId);

      if (!success) {
        console.warn(`Failed to start level: ${levelId}`);
        // Try unlocking all levels for development
        levelManager.markLevelCompleted("motor_basics");
        levelManager.markLevelCompleted("gear_introduction");
        levelManager.markLevelCompleted("belt_systems");
        levelManager.startLevel(levelId);
      }

      console.log(`🎯 Level scene initialized: ${levelId}`);
    } catch (error) {
      console.error("Failed to initialize level scene:", error);
    }
  };

  const setupEventListeners = () => {
    // File menu events
    window.addEventListener("stemplitude-save", handleSave);
    window.addEventListener("stemplitude-load", handleLoad);
    window.addEventListener("stemplitude-export", handleExport);
    window.addEventListener("stemplitude-import", handleImport);

    // Edit menu events
    window.addEventListener("stemplitude-undo", handleUndo);
    window.addEventListener("stemplitude-redo", handleRedo);
    window.addEventListener("stemplitude-clear", handleClear);

    // View menu events
    window.addEventListener("stemplitude-zoom-in", handleZoomIn);
    window.addEventListener("stemplitude-zoom-out", handleZoomOut);
    window.addEventListener("stemplitude-recenter", handleRecenter);
    window.addEventListener("stemplitude-show-objectives", handleShowObjectives);
  };

  const cleanup = () => {
    // Remove event listeners
    window.removeEventListener("stemplitude-save", handleSave);
    window.removeEventListener("stemplitude-load", handleLoad);
    window.removeEventListener("stemplitude-export", handleExport);
    window.removeEventListener("stemplitude-import", handleImport);
    window.removeEventListener("stemplitude-undo", handleUndo);
    window.removeEventListener("stemplitude-redo", handleRedo);
    window.removeEventListener("stemplitude-clear", handleClear);
    window.removeEventListener("stemplitude-zoom-in", handleZoomIn);
    window.removeEventListener("stemplitude-zoom-out", handleZoomOut);
    window.removeEventListener("stemplitude-recenter", handleRecenter);
    window.removeEventListener("stemplitude-show-objectives", handleShowObjectives);

    // Cleanup level scene
    if (levelManagerRef.current) {
      const currentScene = levelManagerRef.current.getCurrentScene();
      if (currentScene) {
        (currentScene as any).onSceneDeactivated();
      }
    }

    // Cleanup Pixi
    if (appRef.current) {
      appRef.current.destroy(true);
    }
  };

  // Event handlers
  const handleSave = () => {
    const currentScene = levelManagerRef.current?.getCurrentScene();
    if (currentScene && (currentScene as any).saveLoadSystem) {
      (currentScene as any).showSaveLoadModal();
    } else {
      alert("Save functionality not available in this level");
    }
  };

  const handleLoad = () => {
    const currentScene = levelManagerRef.current?.getCurrentScene();
    if (currentScene && (currentScene as any).saveLoadSystem) {
      (currentScene as any).showSaveLoadModal();
    } else {
      alert("Load functionality not available in this level");
    }
  };

  const handleExport = () => {
    const currentScene = levelManagerRef.current?.getCurrentScene();
    if (currentScene && (currentScene as any).saveLoadSystem) {
      const saveLoadSystem = (currentScene as any).saveLoadSystem;
      const sceneData = saveLoadSystem.exportScene();
      saveLoadSystem.exportToFile(sceneData, `${levelId}-export`);
    } else {
      alert("Export functionality not available in this level");
    }
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".stemplitude.json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      const currentScene = levelManagerRef.current?.getCurrentScene();
      if (file && currentScene && (currentScene as any).saveLoadSystem) {
        const saveLoadSystem = (currentScene as any).saveLoadSystem;
        saveLoadSystem.importFromFile(file);
      }
    };
    input.click();
  };

  const handleUndo = () => {
    // TODO: Implement undo functionality
    console.log("Undo not implemented yet");
  };

  const handleRedo = () => {
    // TODO: Implement redo functionality
    console.log("Redo not implemented yet");
  };

  const handleClear = () => {
    if (
      confirm(
        "Clear all components? This will reset your progress in this level."
      )
    ) {
      if (gameManagerRef.current) {
        // Clear all components
        const components = gameManagerRef.current.getAllMechanicalComponents();
        components.forEach((component) => {
          gameManagerRef.current?.removeComponent(component.getName());
        });

        // Recenter camera
        gameManagerRef.current.recenterCamera();
      }
    }
  };

  const handleZoomIn = () => {
    if (gameManagerRef.current) {
      gameManagerRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (gameManagerRef.current) {
      gameManagerRef.current.zoomOut();
    }
  };

  const handleRecenter = () => {
    if (gameManagerRef.current) {
      gameManagerRef.current.recenterCamera();
    }
  };

  const handleShowObjectives = () => {
    const currentScene = levelManagerRef.current?.getCurrentScene();
    if (currentScene && (currentScene as any).objectiveUI) {
      (currentScene as any).objectiveUI.show();
    } else {
      alert("Objectives not available");
    }
  };

  return (
    <div className="scene-container">
      <div
        ref={canvasRef}
        className="pixi-canvas"
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #1a1a2e, #16213e)",
        }}
      />
    </div>
  );
};
