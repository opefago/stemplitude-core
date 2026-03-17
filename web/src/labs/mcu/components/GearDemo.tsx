import React, { useEffect, useRef } from "react";
import { Application } from "pixi.js";
import GameManager from "../lib/GameManager";
import { EditorScene } from "../lib/EditorScene";

export const GearDemo: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const gameManagerRef = useRef<GameManager | null>(null);
  const editorSceneRef = useRef<EditorScene | null>(null);

  useEffect(() => {
    initializeDemo();
    setupEventListeners();

    return () => {
      cleanup();
    };
  }, []);

  const initializeDemo = async () => {
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

      // Create and activate editor scene
      const editorScene = new EditorScene();
      editorSceneRef.current = editorScene;

      // Activate the scene
      editorScene.onSceneActivated();

      console.log("🔧 Gear Demo initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Gear Demo:", error);
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

    // Cleanup scene
    if (editorSceneRef.current) {
      editorSceneRef.current.onSceneDeactivated();
    }

    // Cleanup Pixi
    if (appRef.current) {
      appRef.current.destroy(true);
    }
  };

  // Event handlers
  const handleSave = () => {
    if (
      editorSceneRef.current &&
      (editorSceneRef.current as any).saveLoadSystem
    ) {
      (editorSceneRef.current as any).showSaveLoadModal();
    } else {
      alert("Save functionality not available");
    }
  };

  const handleLoad = () => {
    if (
      editorSceneRef.current &&
      (editorSceneRef.current as any).saveLoadSystem
    ) {
      (editorSceneRef.current as any).showSaveLoadModal();
    } else {
      alert("Load functionality not available");
    }
  };

  const handleExport = () => {
    if (
      editorSceneRef.current &&
      (editorSceneRef.current as any).saveLoadSystem
    ) {
      const saveLoadSystem = (editorSceneRef.current as any).saveLoadSystem;
      const sceneData = saveLoadSystem.exportScene();
      saveLoadSystem.exportToFile(sceneData, "gear-demo-export");
    } else {
      alert("Export functionality not available");
    }
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".stemplitude.json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (
        file &&
        editorSceneRef.current &&
        (editorSceneRef.current as any).saveLoadSystem
      ) {
        const saveLoadSystem = (editorSceneRef.current as any).saveLoadSystem;
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
    if (gameManagerRef.current) {
      // Clear all components
      const components = gameManagerRef.current.getAllMechanicalComponents();
      components.forEach((component) => {
        gameManagerRef.current?.removeComponent(component.getName());
      });

      // Recenter camera
      gameManagerRef.current.recenterCamera();
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
    alert("This is a free-form demo. No objectives - explore and experiment!");
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

      {/* Demo Instructions Overlay */}
      <div
        style={{
          position: "absolute",
          top: "20px",
          left: "20px",
          background: "rgba(0, 0, 0, 0.8)",
          color: "white",
          padding: "15px",
          borderRadius: "8px",
          maxWidth: "300px",
          fontSize: "14px",
          zIndex: 100,
        }}
      >
        <h4 style={{ margin: "0 0 10px 0", color: "#3498db" }}>
          🔧 Free Demo Mode
        </h4>
        <p style={{ margin: "0 0 10px 0", lineHeight: "1.4" }}>
          Drag components from the toolbar to build mechanical systems. Use the
          menu bar for save/load and view controls.
        </p>
        <p style={{ margin: 0, fontSize: "12px", opacity: 0.8 }}>
          No objectives or restrictions - explore freely!
        </p>
      </div>
    </div>
  );
};
