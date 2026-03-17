import React, { useRef, useEffect, useState, useCallback } from "react";
import * as PIXI from "pixi.js";
import { v4 as uuidv4 } from "uuid";
import {
  CircuitComponent,
  Point,
  ComponentType,
  Connection,
} from "../types/Circuit";
import { CircuitSolver } from "../engine/CircuitSolver";
import { ElectronAnimator } from "../engine/ElectronAnimator";
import {
  useComponents,
  useConnections,
  useSelectedTool,
  useShowGrid,
  useSelectedComponent,
  useResults,
  useCircuitActions,
} from "../store/circuitStore";

interface CircuitSimulatorProps {
  // No props needed - using Zustand store!
}

const GRID_SIZE = 20;
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 600;

// Routing constants
const COMPONENT_PADDING = 40; // Extra space around components for routing

const CircuitSimulator: React.FC<CircuitSimulatorProps> = () => {
  // 🚀 Use Zustand store - always fresh, no stale closures!
  const components = useComponents();
  const connections = useConnections();
  const selectedTool = useSelectedTool();
  const showGrid = useShowGrid();
  const selectedComponent = useSelectedComponent();
  const results = useResults();
  const {
    addComponent,
    moveComponent,
    addConnection,
    getFreshComponents,
    setShowGrid,
  } = useCircuitActions();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const componentGraphics = useRef<Map<string, PIXI.Graphics>>(new Map());
  const electronAnimator = useRef<ElectronAnimator | null>(null);
  const animationLayer = useRef<PIXI.Container | null>(null);

  // 🟢 No more stale closure refs needed with Zustand!
  console.log("🟢 ZUSTAND Fresh state:", {
    selectedTool,
    componentCount: components.length,
    connectionCount: connections.length,
  });

  // Wire drawing state for HTML5 Canvas
  const [html5WireState, setHtml5WireState] = useState<{
    isDrawing: boolean;
    fromPin: { componentId: string; pinId: string; position: Point } | null;
    currentPos: Point | null;
  }>({ isDrawing: false, fromPin: null, currentPos: null });

  // Component dragging state
  const [html5DragState, setHtml5DragState] = useState<{
    isDragging: boolean;
    component: CircuitComponent | null;
    offset: Point;
  }>({ isDragging: false, component: null, offset: { x: 0, y: 0 } });
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    component: CircuitComponent | null;
    offset: Point;
  }>({ isDragging: false, component: null, offset: { x: 0, y: 0 } });
  // Wire state consolidated to html5WireState only

  const [isDragOver, setIsDragOver] = useState(false);
  // 🟢 showGrid now comes from Zustand store, no local state needed

  // 🟢 No more selectedTool ref needed with Zustand!

  // Browser and graphics diagnostics
  useEffect(() => {
    console.log("🔍 Browser/Graphics Diagnostics:");
    console.log("User Agent:", navigator.userAgent);
    console.log("Platform:", navigator.platform);
    console.log("Hardware Concurrency:", navigator.hardwareConcurrency);
    console.log("🔴 GRID SIZE SET TO:", GRID_SIZE, "pixels");

    if (canvasRef.current) {
      const canvas = canvasRef.current;
      console.log("Canvas support tests:");
      console.log("- getContext('2d'):", !!canvas.getContext("2d"));
      console.log("- getContext('webgl'):", !!canvas.getContext("webgl"));
      console.log("- getContext('webgl2'):", !!canvas.getContext("webgl2"));

      const gl =
        canvas.getContext("webgl") ||
        (canvas.getContext("experimental-webgl") as WebGLRenderingContext);
      if (gl) {
        console.log("WebGL Info:");
        console.log("- Vendor:", gl.getParameter(gl.VENDOR));
        console.log("- Renderer:", gl.getParameter(gl.RENDERER));
        console.log("- Version:", gl.getParameter(gl.VERSION));
        console.log(
          "- Max Texture Size:",
          gl.getParameter(gl.MAX_TEXTURE_SIZE)
        );
      }
    }
  }, []);

  // Initialize PixiJS
  useEffect(() => {
    if (!canvasRef.current || appRef.current) return;

    try {
      console.log("🟢 ATTEMPTING PIXIJS INITIALIZATION");
      // PixiJS v6.5.10 configuration - much more stable
      const app = new PIXI.Application({
        view: canvasRef.current,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: 0x2a3f5f,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        // Legacy option removed in PixiJS v6
        powerPreference: "high-performance",
        backgroundAlpha: 1,
      });

      appRef.current = app;
      console.log("✅ PIXIJS INITIALIZED SUCCESSFULLY - WebGL Mode");

      // Create layers
      const gridLayer = new PIXI.Container();
      const wireLayer = new PIXI.Container();
      const componentLayer = new PIXI.Container();
      const animationLayerContainer = new PIXI.Container();

      app.stage.addChild(gridLayer);
      app.stage.addChild(wireLayer);
      app.stage.addChild(componentLayer);
      app.stage.addChild(animationLayerContainer);

      animationLayer.current = animationLayerContainer;

      // Initialize electron animator
      electronAnimator.current = new ElectronAnimator(animationLayerContainer);

      // Draw grid
      drawGrid(gridLayer);

      // Add keyboard listener for grid toggle and ESC to exit wire mode
      const handleKeyPress = (e: KeyboardEvent) => {
        if (e.key === "g" || e.key === "G") {
          setShowGrid(!showGrid); // Use Zustand store action
        } else if (e.key === "Escape") {
          // Exit wire drawing mode
          setHtml5WireState({
            isDrawing: false,
            fromPin: null,
            currentPos: null,
          });
          console.log("🟡 ESC pressed - exited wire drawing mode");
        }
      };

      window.addEventListener("keydown", handleKeyPress);

      // Add interactivity to the stage - PixiJS v6 style
      app.stage.interactive = true;

      // Add a transparent background to catch clicks
      const background = new PIXI.Graphics();
      background.beginFill(0x000000, 0.01); // Nearly transparent
      background.drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      background.endFill();
      background.interactive = true;
      background.buttonMode = true;
      background.on("pointerdown", handleStageClick);
      background.on("pointermove", handleStageMove);
      background.on("pointerup", handleStageUp);

      // Add background as first layer
      app.stage.addChildAt(background, 0);

      console.log("🔴 PIXIJS SETUP COMPLETE - Background click handler added");

      // Setup drag and drop for the canvas
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        canvas.addEventListener("dragover", handleDragOver);
        canvas.addEventListener("drop", handleDrop);
        canvas.addEventListener("dragenter", handleDragEnter);
        canvas.addEventListener("dragleave", handleDragLeave);
      }

      // Animation loop
      app.ticker.add(() => {
        if (electronAnimator.current) {
          // Electron animation currently disabled
          // electronAnimator.current.updateElectrons();
        }
      });

      return () => {
        if (app) {
          app.destroy(true, {
            children: true,
            texture: true,
            baseTexture: true,
          });
          appRef.current = null;
        }

        // Clean up drag and drop listeners
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          canvas.removeEventListener("dragover", handleDragOver);
          canvas.removeEventListener("drop", handleDrop);
          canvas.removeEventListener("dragenter", handleDragEnter);
          canvas.removeEventListener("dragleave", handleDragLeave);
        }

        // Clean up keyboard listener
        window.removeEventListener("keydown", handleKeyPress);
      };
    } catch (error) {
      console.error("Failed to initialize PixiJS:", error);

      // Try PixiJS Canvas renderer fallback
      try {
        console.log("Attempting PixiJS Canvas fallback...");

        const app = new PIXI.Application({
          view: canvasRef.current,
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          backgroundColor: 0x2a3f5f,
          antialias: false,
          forceCanvas: true, // Force Canvas renderer
          resolution: 1,
          autoDensity: true,
          // Legacy mode for compatibility
        });

        console.log("✅ PIXIJS CANVAS FALLBACK SUCCESSFUL");
        appRef.current = app;

        // Create layers for fallback
        const gridLayer = new PIXI.Container();
        const wireLayer = new PIXI.Container();
        const componentLayer = new PIXI.Container();
        const animationLayerContainer = new PIXI.Container();

        app.stage.addChild(gridLayer);
        app.stage.addChild(wireLayer);
        app.stage.addChild(componentLayer);
        app.stage.addChild(animationLayerContainer);

        animationLayer.current = animationLayerContainer;
        electronAnimator.current = new ElectronAnimator(
          animationLayerContainer
        );
        drawGrid(gridLayer);

        // Add interactivity - PixiJS v6 style
        app.stage.interactive = true;

        // Add background for interactions
        const background = new PIXI.Graphics();
        background.beginFill(0x000000, 0.01);
        background.drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        background.endFill();
        background.interactive = true;
        background.on("pointerdown", handleStageClick);
        background.on("pointermove", handleStageMove);
        background.on("pointerup", handleStageUp);
        app.stage.addChildAt(background, 0);

        // Setup drag and drop
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          canvas.addEventListener("dragover", handleDragOver);
          canvas.addEventListener("drop", handleDrop);
          canvas.addEventListener("dragenter", handleDragEnter);
          canvas.addEventListener("dragleave", handleDragLeave);
        }

        // Add keyboard listener for grid toggle and ESC to exit wire mode
        const handleKeyPress = (e: KeyboardEvent) => {
          if (e.key === "g" || e.key === "G") {
            setShowGrid(!showGrid); // Use Zustand store action
          } else if (e.key === "Escape") {
            // Exit wire drawing mode
            setHtml5WireState({
              isDrawing: false,
              fromPin: null,
              currentPos: null,
            });
            console.log("🟡 ESC pressed - exited wire drawing mode");
          }
        };
        window.addEventListener("keydown", handleKeyPress);

        app.ticker.add(() => {
          if (electronAnimator.current) {
            // Electron animation currently disabled
            // electronAnimator.current.updateElectrons();
          }
        });

        // Cleanup function
        return () => {
          if (app) {
            app.destroy(true, {
              children: true,
              texture: true,
              baseTexture: true,
            });
            appRef.current = null;
          }
          if (canvasRef.current) {
            const canvas = canvasRef.current;
            canvas.removeEventListener("dragover", handleDragOver);
            canvas.removeEventListener("drop", handleDrop);
            canvas.removeEventListener("dragenter", handleDragEnter);
            canvas.removeEventListener("dragleave", handleDragLeave);
          }
          window.removeEventListener("keydown", handleKeyPress);
        };
      } catch (fallbackError) {
        console.error("PixiJS Canvas fallback also failed:", fallbackError);

        // Ultimate fallback: Pure HTML5 Canvas implementation
        try {
          console.log("Attempting pure HTML5 Canvas fallback...");
          initializeHTML5CanvasFallback();
        } catch (html5Error) {
          console.error("HTML5 Canvas fallback failed:", html5Error);

          // Ultimate DOM-based fallback
          try {
            console.log("Attempting DOM-based fallback (no canvas)...");
            initializeDOMFallback();
          } catch (domError) {
            console.error("DOM fallback also failed:", domError);
            showCanvasError();
          }
        }
      }
    }
  }, []);

  // Update circuit visualization when state changes
  useEffect(() => {
    console.log(
      "🟢 useEffect triggered - components:",
      components.length,
      "connections:",
      connections.length
    );
    if (!appRef.current) {
      // If PixiJS failed, redraw with HTML5 Canvas
      if (canvasRef.current && canvasRef.current.getContext) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          console.log(
            "🟢 Redrawing HTML5 canvas with",
            connections.length,
            "connections"
          );
          // Redraw HTML5 canvas
          ctx.fillStyle = "#2a3f5f";
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          if (showGrid) drawHTML5Grid(ctx);
          components.forEach((component) => {
            drawHTML5Component(ctx, component);
          });
          // Draw permanent wires
          drawHTML5Wires(ctx);
        }
      }
      return;
    }
    redrawCircuit();
    drawWires();
  }, [components, connections]); // Use Zustand state

  // Update cursor when selected tool changes
  useEffect(() => {
    if (!appRef.current) return;
    const background = appRef.current.stage.children[0] as PIXI.Graphics;
    if (background) {
      background.cursor = selectedTool ? "crosshair" : "default";
    }
  }, [selectedTool]);

  // Run simulation when needed
  useEffect(() => {
    if (false && components.length > 0) {
      runSimulation();
    }
  }, [
    false, // TODO: Use Zustand isSimulating
    components, // Use Zustand state
    connections, // Use Zustand state
  ]);

  // Redraw grid when visibility changes
  useEffect(() => {
    if (!appRef.current) {
      // If PixiJS failed, redraw HTML5 Canvas grid
      if (canvasRef.current && canvasRef.current.getContext) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#2a3f5f";
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          if (showGrid) drawHTML5Grid(ctx);
          components.forEach((component) => {
            drawHTML5Component(ctx, component);
          });
          // Draw permanent wires
          drawHTML5Wires(ctx);
        }
      }
      return;
    }
    const gridLayer = appRef.current.stage.children[1] as PIXI.Container;
    if (gridLayer) {
      drawGrid(gridLayer);
    }
  }, [showGrid]);

  // HTML5 Canvas event listeners (separate useEffect to fix stale closure)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || appRef.current) return; // Only for HTML5 fallback mode

    console.log(
      "🟢 SETTING UP HTML5 EVENT LISTENERS WITH selectedTool:",
      selectedTool
    );

    const handleCanvasClick = (e: MouseEvent) => {
      console.log("🔴 HTML5 CANVAS CLICK DETECTED!");
      console.log("🟢 Current selectedTool:", selectedTool);

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const clickPos = { x, y };

      console.log("🔴 HTML5 Click at:", clickPos);

      // Priority 1: ALWAYS check pins first - wire creation takes precedence
      console.log("🔴 CHECKING FOR PIN CLICK at:", clickPos);
      console.log("🔴 USING FRESH COMPONENTS:", getFreshComponents().length);
      const clickedPin = findPinAtPosition(clickPos); // Uses getFreshComponents internally
      if (clickedPin) {
        console.log("🔴 CLICKED ON PIN:", clickedPin);
        handleHTML5PinClick(clickedPin, clickPos);
        return; // Stop here - no component placement on pins
      }
      console.log("🔴 NO PIN CLICKED, proceeding...");

      // Priority 2: Component placement (if tool selected and NOT on a pin)
      if (selectedTool) {
        console.log("🟢 ZUSTAND: PLACING COMPONENT");
        console.log("🔴 Creating component with selectedTool:", selectedTool);
        const component = createComponent(
          selectedTool as ComponentType,
          clickPos
        );
        console.log("🟢 Adding component using Zustand:", component);
        addComponent(component.type, component.position);
        return;
      }

      // Priority 3: If no tool selected, just log (dragging handled by mousedown)
      console.log("🔴 No tool selected, no pin clicked - click ignored");
    };

    const handleCanvasMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const mousePos = { x, y };

      // Handle wire drawing - update cursor position for real-time Manhattan routing
      if (html5WireState.isDrawing) {
        console.log("🟢 DRAWING WIRE - updating currentPos:", mousePos);
        setHtml5WireState((prev) => ({
          ...prev,
          currentPos: mousePos,
        }));
        // Redraw canvas to show updated routed path
        requestAnimationFrame(() => redrawHTML5Canvas());
      }

      // Handle component dragging
      if (html5DragState.isDragging && html5DragState.component) {
        const newPosition = snapToGrid({
          x: mousePos.x - html5DragState.offset.x,
          y: mousePos.y - html5DragState.offset.y,
        });

        console.log("🔴 DRAGGING component to:", newPosition);

        // Use Zustand moveComponent action for dragging
        moveComponent(html5DragState.component!.id, newPosition);
      }
    };

    const handleCanvasMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const mousePos = { x, y };

      console.log("🔴 MOUSEDOWN at:", mousePos);

      // Don't start dragging if we're drawing a wire or placing components
      if (html5WireState.isDrawing || selectedTool) {
        console.log("🔴 MOUSEDOWN ignored - wire drawing or tool selected");
        return;
      }

      // Check if mousedown is on a pin - ignore for dragging
      const clickedPin = findPinAtPosition(mousePos);
      if (clickedPin) {
        console.log("🔴 MOUSEDOWN on pin - ignoring for drag");
        return;
      }

      // Check if mousedown is on a component body for dragging
      const clickedComponent = findComponentAtPosition(
        mousePos,
        getFreshComponents()
      );
      if (clickedComponent) {
        console.log(
          "🔴 MOUSEDOWN on component body - starting drag:",
          clickedComponent.type
        );
        setHtml5DragState({
          isDragging: true,
          component: clickedComponent,
          offset: {
            x: mousePos.x - clickedComponent.position.x,
            y: mousePos.y - clickedComponent.position.y,
          },
        });
      }
    };

    const handleCanvasMouseUp = (_e: MouseEvent) => {
      // End component dragging
      if (html5DragState.isDragging) {
        console.log("🔴 DRAG ENDED");
        setHtml5DragState({
          isDragging: false,
          component: null,
          offset: { x: 0, y: 0 },
        });
      }
    };

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "g" || e.key === "G") {
        setShowGrid(!showGrid);
        // Redraw canvas
        requestAnimationFrame(() => {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#2a3f5f";
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            if (showGrid) drawHTML5Grid(ctx);
            components.forEach((component) => {
              drawHTML5Component(ctx, component);
            });
            // Draw permanent wires
            drawHTML5Wires(ctx);
          }
        });
      } else if (e.key === "Escape") {
        // Exit wire drawing mode
        setHtml5WireState({
          isDrawing: false,
          fromPin: null,
          currentPos: null,
        });
        console.log("🟡 ESC pressed - exited wire drawing mode");
        // Redraw canvas to clear temporary wire
        requestAnimationFrame(() => redrawHTML5Canvas());
      }
    };

    // Add event listeners
    canvas.addEventListener("mousedown", handleCanvasMouseDown);
    canvas.addEventListener("click", handleCanvasClick);
    canvas.addEventListener("mousemove", handleCanvasMouseMove);
    canvas.addEventListener("mouseup", handleCanvasMouseUp);
    window.addEventListener("keydown", handleKeyPress);

    // Cleanup function
    return () => {
      canvas.removeEventListener("mousedown", handleCanvasMouseDown);
      canvas.removeEventListener("click", handleCanvasClick);
      canvas.removeEventListener("mousemove", handleCanvasMouseMove);
      canvas.removeEventListener("mouseup", handleCanvasMouseUp);
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [selectedTool, html5WireState, html5DragState, showGrid, components]);

  // HTML5 Canvas fallback implementation
  const initializeHTML5CanvasFallback = () => {
    console.log("✅ HTML5 CANVAS FALLBACK ACTIVE");

    if (!canvasRef.current) {
      console.error("Canvas ref is null");
      throw new Error("Canvas element not available");
    }

    const canvas = canvasRef.current;
    console.log("Canvas element:", canvas);
    console.log("Canvas tag name:", canvas.tagName);
    console.log("Canvas width/height:", canvas.width, canvas.height);

    // Try to get 2D context with different options
    let ctx = canvas.getContext("2d");
    if (!ctx) {
      console.log("Standard 2D context failed, trying with options...");
      ctx = canvas.getContext("2d", { alpha: true });
    }
    if (!ctx) {
      console.log("2D context with alpha failed, trying webgl...");
      const webglCtx =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      console.log("WebGL context available:", !!webglCtx);
      throw new Error("Cannot get 2D context - graphics system unavailable");
    }

    console.log("2D context successfully obtained:", ctx);

    // Set canvas size
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // Background
    ctx.fillStyle = "#2a3f5f";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw grid if enabled
    if (showGrid) {
      drawHTML5Grid(ctx);
    }

    // Draw components
    console.log("🔴 HTML5: Drawing", components.length, "components");
    console.log(
      "🔴 HTML5: Components list:",
      components.map((c) => `${c.type}@${c.position.x},${c.position.y}`)
    );
    components.forEach((component, index) => {
      console.log(
        `🔴 HTML5: Drawing component [${index}]:`,
        component.type,
        "at",
        component.position,
        "ID:",
        component.id
      );
      drawHTML5Component(ctx, component);
    });

    // Draw wires
    drawHTML5Wires(ctx);

    // Temporary wire drawing is handled in redrawHTML5Canvas with Manhattan routing

    // Add HTML5 Canvas mode indicator with background
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(5, 5, 300, 125);

    ctx.fillStyle = "#ffaa00";
    ctx.font = "bold 16px Arial";
    ctx.fillText("✅ HTML5 Canvas Mode ACTIVE", 10, 25);

    ctx.fillStyle = "#ffffff";
    ctx.font = "14px Arial";
    ctx.fillText("🔹 Click detection: READY", 10, 45);
    ctx.fillText(`🔹 Selected tool: ${selectedTool || "none"}`, 10, 65);
    ctx.fillText(
      `🔹 Wire mode: ${html5WireState.isDrawing ? "DRAWING" : "OFF"}`,
      10,
      85
    );
    ctx.fillText(
      `🔹 Drag mode: ${html5DragState.isDragging ? "DRAGGING" : "OFF"}`,
      10,
      105
    );

    // Event handlers are now properly defined in useEffect to avoid stale closures

    // Drag and drop handlers (kept here since they're not moved to useEffect)
    canvas.addEventListener("dragover", handleDragOver);
    canvas.addEventListener("drop", handleDrop);
    canvas.addEventListener("dragenter", handleDragEnter);
    canvas.addEventListener("dragleave", handleDragLeave);

    // Store cleanup function for drag handlers only
    return () => {
      canvas.removeEventListener("dragover", handleDragOver);
      canvas.removeEventListener("drop", handleDrop);
      canvas.removeEventListener("dragenter", handleDragEnter);
      canvas.removeEventListener("dragleave", handleDragLeave);
    };
  };

  const drawHTML5Grid = (ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = "#4a6382";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;

    // Draw grid lines
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    // Draw grid dots
    ctx.fillStyle = "#8fa4c7";
    ctx.globalAlpha = 0.4;
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE) {
      for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  const drawHTML5Component = (
    ctx: CanvasRenderingContext2D,
    component: CircuitComponent
  ) => {
    const { x, y } = component.position;

    ctx.save();
    ctx.translate(x, y);

    // Set common styles
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.fillStyle = "#ffffff";

    switch (component.type) {
      case "battery":
        // Draw battery symbol
        ctx.beginPath();
        ctx.moveTo(-15, -10);
        ctx.lineTo(-15, 10);
        ctx.moveTo(-5, -15);
        ctx.lineTo(-5, 15);
        ctx.moveTo(5, -10);
        ctx.lineTo(5, 10);
        ctx.moveTo(15, -15);
        ctx.lineTo(15, 15);
        ctx.stroke();
        break;

      case "resistor":
        // Draw resistor zigzag
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(-15, 0);
        ctx.lineTo(-10, -8);
        ctx.lineTo(-5, 8);
        ctx.lineTo(0, -8);
        ctx.lineTo(5, 8);
        ctx.lineTo(10, -8);
        ctx.lineTo(15, 0);
        ctx.lineTo(20, 0);
        ctx.stroke();
        break;

      case "led":
        // Draw LED symbol
        ctx.beginPath();
        ctx.moveTo(-10, -10);
        ctx.lineTo(10, 0);
        ctx.lineTo(-10, 10);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = component.properties.color || "#ff0000";
        ctx.fill();
        break;

      case "ground":
        // Draw ground symbol
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.lineTo(0, 5);
        ctx.moveTo(-10, 5);
        ctx.lineTo(10, 5);
        ctx.moveTo(-6, 10);
        ctx.lineTo(6, 10);
        ctx.moveTo(-2, 15);
        ctx.lineTo(2, 15);
        ctx.stroke();
        break;
    }

    // Draw component pins with enhanced visibility
    component.pins.forEach((pin) => {
      const pinX = pin.position.x - x;
      const pinY = pin.position.y - y;

      // Draw pin background (larger circle for easier clicking)
      ctx.fillStyle = "#444444";
      ctx.beginPath();
      ctx.arc(pinX, pinY, 6, 0, Math.PI * 2);
      ctx.fill();

      // Draw pin foreground
      ctx.fillStyle = "#00ff00";
      ctx.beginPath();
      ctx.arc(pinX, pinY, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw label
    if (component.properties.label) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.fillText(component.properties.label, 0, 30);
    }

    ctx.restore();
  };

  // Old handleHTML5Click useCallback removed - now handled directly in event listeners

  // Pin detection for HTML5 Canvas (increased radius for easier clicking)
  const findPinAtPosition = (
    clickPos: Point
  ): { componentId: string; pinId: string; position: Point } | null => {
    const PIN_CLICK_RADIUS = 25; // Increased for better detection

    console.log("🔴 FINDING PIN at:", clickPos, "radius:", PIN_CLICK_RADIUS);
    console.log("🔴 SEARCHING through", components.length, "components");

    for (const component of components) {
      console.log(
        "🔴 CHECKING component:",
        component.type,
        "at",
        component.position,
        "with",
        component.pins.length,
        "pins"
      );

      for (const pin of component.pins) {
        const dx = clickPos.x - pin.position.x;
        const dy = clickPos.y - pin.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        console.log(
          "🔴 PIN",
          pin.id,
          "at",
          pin.position,
          "distance:",
          distance.toFixed(2)
        );

        if (distance <= PIN_CLICK_RADIUS) {
          console.log(
            `🔴 FOUND PIN MATCH! Distance ${distance.toFixed(1)}px:`,
            pin.id
          );
          return {
            componentId: component.id,
            pinId: pin.id,
            position: pin.position,
          };
        }
      }
    }

    console.log(
      "🔴 NO PIN FOUND at:",
      clickPos,
      "- checked",
      components.reduce((sum, c) => sum + c.pins.length, 0),
      "total pins"
    );
    return null;
  };

  // Component body detection for HTML5 Canvas
  const findComponentAtPosition = useCallback(
    (
      clickPos: Point,
      components: CircuitComponent[] // Pass components directly
    ): CircuitComponent | null => {
      const COMPONENT_CLICK_RADIUS = 30; // pixels

      for (const component of components) {
        const dx = clickPos.x - component.position.x;
        const dy = clickPos.y - component.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if click is within component body but NOT on pins
        if (distance <= COMPONENT_CLICK_RADIUS) {
          // Make sure it's not on a pin
          const onPin = component.pins.some((pin) => {
            const pinDx = clickPos.x - pin.position.x;
            const pinDy = clickPos.y - pin.position.y;
            const pinDistance = Math.sqrt(pinDx * pinDx + pinDy * pinDy);
            return pinDistance <= 15; // PIN_CLICK_RADIUS
          });

          if (!onPin) {
            return component;
          }
        }
      }
      return null;
    },
    []
  );

  // Note: Component dragging is now handled in mousedown event

  // Handle pin click for wire drawing
  const handleHTML5PinClick = useCallback(
    (
      clickedPin: { componentId: string; pinId: string; position: Point },
      clickPos: Point
    ) => {
      console.log(
        "🔴 PIN CLICK HANDLER - Wire state:",
        html5WireState.isDrawing
      );

      if (!html5WireState.isDrawing) {
        // Start wire drawing
        console.log("🔴 STARTING WIRE from pin:", clickedPin);
        console.log(
          "🔴 BEFORE setState - isDrawing:",
          html5WireState.isDrawing
        );
        setHtml5WireState({
          isDrawing: true,
          fromPin: clickedPin,
          currentPos: clickPos,
        });
        console.log(
          "🔴 AFTER setState - Wire state should now be isDrawing: true"
        );
        console.log("🔴 NEW WIRE STATE:", {
          isDrawing: true,
          fromPin: clickedPin,
          currentPos: clickPos,
        });

        // Force immediate redraw to show we're in wire mode
        console.log("🔴 SCHEDULING FORCE REDRAW after wire start");
        requestAnimationFrame(() => {
          console.log("🔴 EXECUTING FORCE REDRAW after wire start");
          console.log("🔴 Wire state in force redraw:", html5WireState);
          redrawHTML5Canvas();
        });
      } else if (html5WireState.fromPin) {
        // Complete wire connection
        console.log("🔴 COMPLETING WIRE to pin:", clickedPin);

        if (html5WireState.fromPin.pinId !== clickedPin.pinId) {
          // Create routed path using Manhattan routing with pin exclusions
          const routedPath = findManhattanPath(
            html5WireState.fromPin.position,
            clickedPin.position,
            html5WireState.fromPin.pinId, // Start pin ID
            clickedPin.pinId // End pin ID
          );

          // Create new wire connection with routed path
          const newConnection: Connection = {
            id: uuidv4(),
            fromPin: html5WireState.fromPin.pinId,
            toPin: clickedPin.pinId,
            points: [html5WireState.fromPin.position, clickedPin.position], // Original endpoints
            routedPath: routedPath, // Auto-routed path
            current: 0,
          };

          console.log("🔴 Creating routed wire connection:", newConnection);

          // Use Zustand action to add connection with routed path
          addConnection(
            html5WireState.fromPin.pinId,
            clickedPin.pinId,
            [html5WireState.fromPin.position, clickedPin.position], // Direct points
            routedPath // Manhattan routed path
          );
        }

        // Reset wire drawing state
        setHtml5WireState({
          isDrawing: false,
          fromPin: null,
          currentPos: null,
        });

        console.log(
          "🟢 Wire connection created, letting React handle redraw naturally"
        );
      }
    },
    [html5WireState.isDrawing, html5WireState.fromPin, addConnection] // Use Zustand action
  );

  // Manhattan routing with obstacle avoidance
  const findManhattanPath = useCallback(
    (
      startPos: Point,
      endPos: Point,
      startPinId?: string,
      endPinId?: string
    ): Point[] => {
      console.log(
        "🟢 SMART ROUTING from",
        startPos,
        "to",
        endPos,
        "pins:",
        startPinId,
        "->",
        endPinId
      );

      // Extract component IDs from pin IDs (pin format: "componentId-pin1" or "componentId-pin2")
      const startComponentId = startPinId
        ? startPinId.replace(/-pin\d+$/, "")
        : null;
      const endComponentId = endPinId ? endPinId.replace(/-pin\d+$/, "") : null;
      const excludedComponentIds = new Set(
        [startComponentId, endComponentId].filter(Boolean)
      );

      console.log("🟢 EXCLUDING COMPONENTS:", Array.from(excludedComponentIds));

      // Only create obstacles if we have components
      if (components.length === 0) {
        console.log("🟢 NO COMPONENTS - direct line");
        return [startPos, endPos];
      }

      // Create realistic obstacles with proper component dimensions + padding
      // Exclude obstacles for components that own the start/end pins
      const COMPONENT_BASE_WIDTH = 80;
      const COMPONENT_BASE_HEIGHT = 60;
      const obstacles = components
        .filter((comp) => !excludedComponentIds.has(comp.id)) // Exclude start/end component obstacles
        .map((comp) => ({
          x: comp.position.x - COMPONENT_BASE_WIDTH / 2 - COMPONENT_PADDING,
          y: comp.position.y - COMPONENT_BASE_HEIGHT / 2 - COMPONENT_PADDING,
          width: COMPONENT_BASE_WIDTH + COMPONENT_PADDING * 2,
          height: COMPONENT_BASE_HEIGHT + COMPONENT_PADDING * 2,
          name: comp.type, // For debugging
          componentPos: comp.position, // Original position for debugging
          componentId: comp.id, // Include component ID for debugging
        }));

      console.log("🟢 Created obstacles:");
      obstacles.forEach((obs, i) => {
        console.log(
          `  ${i + 1}. ${obs.name} at (${obs.componentPos.x},${obs.componentPos.y}) -> obstacle (${obs.x},${obs.y}) ${obs.width}x${obs.height}`
        );
      });

      // Helper function to check if a point is inside any obstacle
      const pointInObstacles = (point: Point): boolean => {
        return obstacles.some(
          (obstacle) =>
            point.x >= obstacle.x &&
            point.x <= obstacle.x + obstacle.width &&
            point.y >= obstacle.y &&
            point.y <= obstacle.y + obstacle.height
        );
      };

      // Check if a point is inside a specific rectangle
      const pointInRect = (
        point: Point,
        rect: { x: number; y: number; width: number; height: number }
      ): boolean => {
        return (
          point.x >= rect.x &&
          point.x <= rect.x + rect.width &&
          point.y >= rect.y &&
          point.y <= rect.y + rect.height
        );
      };

      // Proper line-rectangle intersection (not just bounding box overlap)
      const lineIntersectsRect = (
        p1: Point,
        p2: Point,
        rect: {
          x: number;
          y: number;
          width: number;
          height: number;
          name?: string;
        }
      ): boolean => {
        // Check if either endpoint is inside THIS specific rectangle
        if (pointInRect(p1, rect) || pointInRect(p2, rect)) {
          console.log(`🔴 Line endpoint inside ${rect.name || "obstacle"}:`, {
            p1,
            p2,
            rect,
          });
          return true;
        }

        const { x: rx, y: ry, width: rw, height: rh } = rect;

        // Check intersection with each edge of the rectangle
        const edges = [
          { x1: rx, y1: ry, x2: rx + rw, y2: ry }, // Top edge
          { x1: rx + rw, y1: ry, x2: rx + rw, y2: ry + rh }, // Right edge
          { x1: rx + rw, y1: ry + rh, x2: rx, y2: ry + rh }, // Bottom edge
          { x1: rx, y1: ry + rh, x2: rx, y2: ry }, // Left edge
        ];

        const intersects = edges.some((edge) =>
          linesIntersect(
            p1.x,
            p1.y,
            p2.x,
            p2.y,
            edge.x1,
            edge.y1,
            edge.x2,
            edge.y2
          )
        );

        if (intersects) {
          console.log(`🔴 Line intersects ${rect.name || "obstacle"}:`, {
            p1,
            p2,
            rect,
          });
        }

        return intersects;
      };

      // Helper to check if two line segments intersect
      const linesIntersect = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        x3: number,
        y3: number,
        x4: number,
        y4: number
      ): boolean => {
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-10) return false; // Lines are parallel

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
      };

      // Simple bounding box test for backup
      const lineCrossesComponentArea = (p1: Point, p2: Point): boolean => {
        return obstacles.some((obs) => {
          // Simple AABB (Axis-Aligned Bounding Box) test
          const lineMinX = Math.min(p1.x, p2.x);
          const lineMaxX = Math.max(p1.x, p2.x);
          const lineMinY = Math.min(p1.y, p2.y);
          const lineMaxY = Math.max(p1.y, p2.y);

          const rectMinX = obs.x;
          const rectMaxX = obs.x + obs.width;
          const rectMinY = obs.y;
          const rectMaxY = obs.y + obs.height;

          const overlaps = !(
            lineMaxX < rectMinX ||
            lineMinX > rectMaxX ||
            lineMaxY < rectMinY ||
            lineMinY > rectMaxY
          );

          if (overlaps) {
            console.log(`🟡 Line bounding box overlaps ${obs.name}:`, {
              lineBox: { lineMinX, lineMaxX, lineMinY, lineMaxY },
              rectBox: { rectMinX, rectMaxX, rectMinY, rectMaxY },
            });
          }

          return overlaps;
        });
      };

      // Check if line intersects any obstacle
      const lineIntersectsObstacles = (p1: Point, p2: Point): boolean => {
        const boundingBoxHit = lineCrossesComponentArea(p1, p2);
        const preciseHit = obstacles.some((obstacle) =>
          lineIntersectsRect(p1, p2, obstacle)
        );

        console.log(`🟢 Line intersection test:`, {
          boundingBoxHit,
          preciseHit,
          line: { p1, p2 },
        });

        return preciseHit || boundingBoxHit; // Use bounding box as backup
      };

      // Try direct connection first (highest priority)
      const hasDirectObstacles = lineIntersectsObstacles(startPos, endPos);
      console.log("🟢 Direct line test:", {
        hasDirectObstacles,
        startPos,
        endPos,
      });

      if (!hasDirectObstacles) {
        console.log("🟢 DIRECT LINE - no obstacles detected");
        return [startPos, endPos];
      }

      console.log("🔴 DIRECT LINE BLOCKED - finding detour...");

      // Calculate which L-shape makes more sense based on distance

      // Try simple L-shaped routing (second priority)
      const horizontalMid = { x: endPos.x, y: startPos.y };
      if (
        !pointInObstacles(horizontalMid) &&
        !lineIntersectsObstacles(startPos, horizontalMid) &&
        !lineIntersectsObstacles(horizontalMid, endPos)
      ) {
        console.log("🟢 HORIZONTAL L-SHAPE");
        return [startPos, horizontalMid, endPos];
      }

      const verticalMid = { x: startPos.x, y: endPos.y };
      if (
        !pointInObstacles(verticalMid) &&
        !lineIntersectsObstacles(startPos, verticalMid) &&
        !lineIntersectsObstacles(verticalMid, endPos)
      ) {
        console.log("🟢 VERTICAL L-SHAPE");
        return [startPos, verticalMid, endPos];
      }

      // If simple L-shapes don't work, try minimal detour routes
      console.log("🔶 Trying minimal detour routes...");

      const minOffset = 120; // Larger offset to ensure clearance around 160x140 obstacles

      // Try simple detour above
      const simpleTopRoute = [
        startPos,
        { x: endPos.x, y: startPos.y - minOffset },
        endPos,
      ];

      console.log(`🔶 TOP ROUTE COORDS: ${JSON.stringify(simpleTopRoute)}`);

      const topRouteBlocked1 = lineIntersectsObstacles(
        startPos,
        simpleTopRoute[1]
      );
      const topRouteBlocked2 = lineIntersectsObstacles(
        simpleTopRoute[1],
        endPos
      );
      console.log(
        `🔶 TOP ROUTE: segment1=${topRouteBlocked1}, segment2=${topRouteBlocked2}`
      );

      if (!topRouteBlocked1 && !topRouteBlocked2) {
        console.log("🟢 SIMPLE TOP DETOUR SUCCESS!");
        return simpleTopRoute;
      }

      // Try simple detour below
      const simpleBottomRoute = [
        startPos,
        { x: endPos.x, y: startPos.y + minOffset },
        endPos,
      ];

      if (
        !lineIntersectsObstacles(startPos, simpleBottomRoute[1]) &&
        !lineIntersectsObstacles(simpleBottomRoute[1], endPos)
      ) {
        console.log("🟢 SIMPLE BOTTOM DETOUR");
        return simpleBottomRoute;
      }

      // Try simple detour left
      const simpleLeftRoute = [
        startPos,
        { x: startPos.x - minOffset, y: endPos.y },
        endPos,
      ];

      if (
        !lineIntersectsObstacles(startPos, simpleLeftRoute[1]) &&
        !lineIntersectsObstacles(simpleLeftRoute[1], endPos)
      ) {
        console.log("🟢 SIMPLE LEFT DETOUR");
        return simpleLeftRoute;
      }

      // Try simple detour right
      const simpleRightRoute = [
        startPos,
        { x: startPos.x + minOffset, y: endPos.y },
        endPos,
      ];

      if (
        !lineIntersectsObstacles(startPos, simpleRightRoute[1]) &&
        !lineIntersectsObstacles(simpleRightRoute[1], endPos)
      ) {
        console.log("🟢 SIMPLE RIGHT DETOUR");
        return simpleRightRoute;
      }

      // Final fallback - use the preferred L-shape even if not perfect
      console.log("🔴 FALLBACK - using preferred L-shape");
      const fallbackDx = Math.abs(endPos.x - startPos.x);
      const fallbackDy = Math.abs(endPos.y - startPos.y);
      const fallbackHorizontalMid = { x: endPos.x, y: startPos.y };
      const fallbackVerticalMid = { x: startPos.x, y: endPos.y };

      return fallbackDx > fallbackDy
        ? [startPos, fallbackHorizontalMid, endPos]
        : [startPos, fallbackVerticalMid, endPos];
    },
    [components] // Include components as dependency for obstacle detection
  );

  // Smart obstacle avoidance routing with proper line-rectangle intersection

  // Draw wire connections with routed paths
  const drawHTML5Wires = (ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    connections.forEach((connection) => {
      if (connection.points.length >= 2) {
        // Use routed path if available, otherwise recalculate with simplified routing
        let routedPath = connection.routedPath;
        if (!routedPath && connection.points.length >= 2) {
          // Recalculate using simplified Manhattan routing with pin exclusions
          routedPath = findManhattanPath(
            connection.points[0],
            connection.points[connection.points.length - 1],
            connection.fromPin, // Start pin ID
            connection.toPin // End pin ID
          );
        }
        routedPath = routedPath || connection.points; // Final fallback to direct points

        ctx.beginPath();
        ctx.moveTo(routedPath[0].x, routedPath[0].y);

        // Draw segments
        for (let i = 1; i < routedPath.length; i++) {
          ctx.lineTo(routedPath[i].x, routedPath[i].y);
        }

        ctx.stroke();

        // Draw connection points as small circles
        routedPath.forEach((point, index) => {
          if (index > 0 && index < routedPath.length - 1) {
            // Skip start/end points
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }
    });
  };

  // Redraw HTML5 canvas (for wire drawing updates) - with fresh state
  const redrawHTML5Canvas = useCallback(() => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    console.log("🔴 REDRAW CANVAS - Wire state:", {
      isDrawing: html5WireState.isDrawing,
      hasFromPin: !!html5WireState.fromPin,
      hasCurrentPos: !!html5WireState.currentPos,
    });

    // Clear canvas
    ctx.fillStyle = "#2a3f5f";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Redraw grid
    if (showGrid) {
      drawHTML5Grid(ctx);
    }

    // Redraw components
    components.forEach((component) => {
      drawHTML5Component(ctx, component);
    });

    // Redraw wires
    drawHTML5Wires(ctx);

    // Draw temporary routed wire if drawing
    if (
      html5WireState.isDrawing &&
      html5WireState.fromPin &&
      html5WireState.currentPos
    ) {
      console.log(
        "🔴 DRAWING TEMP ROUTED WIRE from",
        html5WireState.fromPin.position,
        "to",
        html5WireState.currentPos
      );

      // Generate temporary routed path (only have fromPin during drawing)
      const tempRoutedPath = findManhattanPath(
        html5WireState.fromPin.position,
        html5WireState.currentPos,
        html5WireState.fromPin.pinId, // Start pin ID
        undefined // No end pin yet during drawing
      );

      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 3; // Make it thicker for visibility
      ctx.setLineDash([8, 8]); // Make dashes more visible
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Draw routed path
      ctx.beginPath();
      ctx.moveTo(tempRoutedPath[0].x, tempRoutedPath[0].y);
      for (let i = 1; i < tempRoutedPath.length; i++) {
        ctx.lineTo(tempRoutedPath[i].x, tempRoutedPath[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw intermediate points
      tempRoutedPath.forEach((point, index) => {
        if (index > 0 && index < tempRoutedPath.length - 1) {
          ctx.fillStyle = "#00ff00";
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    } else {
      console.log("🔴 NOT DRAWING TEMP WIRE:", {
        isDrawing: html5WireState.isDrawing,
        fromPin: html5WireState.fromPin,
        currentPos: html5WireState.currentPos,
      });
    }

    // Redraw status indicator
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(5, 5, 300, 125);

    ctx.fillStyle = "#ffaa00";
    ctx.font = "bold 16px Arial";
    ctx.fillText("✅ HTML5 Canvas Mode ACTIVE", 10, 25);

    ctx.fillStyle = "#ffffff";
    ctx.font = "14px Arial";
    ctx.fillText("🔹 Click detection: READY", 10, 45);
    ctx.fillText(`🔹 Selected tool: ${selectedTool || "none"}`, 10, 65);
    ctx.fillText(
      `🔹 Wire mode: ${html5WireState.isDrawing ? "DRAWING" : "OFF"}`,
      10,
      85
    );
    ctx.fillText(
      `🔹 Drag mode: ${html5DragState.isDragging ? "DRAGGING" : "OFF"}`,
      10,
      105
    );
  }, [html5WireState, html5DragState, components, connections, showGrid]);

  // DOM-based fallback (no canvas required)
  const initializeDOMFallback = () => {
    console.log("✅ DOM FALLBACK MODE ACTIVE");

    if (!canvasRef.current) {
      throw new Error("Container element not available");
    }

    const container = canvasRef.current.parentElement;
    if (!container) {
      throw new Error("Parent container not available");
    }

    // Hide the canvas and create DOM-based simulator
    canvasRef.current.style.display = "none";

    // Create DOM workspace
    const workspace = document.createElement("div");
    workspace.style.width = CANVAS_WIDTH + "px";
    workspace.style.height = CANVAS_HEIGHT + "px";
    workspace.style.backgroundColor = "#2a3f5f";
    workspace.style.position = "relative";
    workspace.style.border = "2px solid #4a6382";
    workspace.style.borderRadius = "8px";
    workspace.style.overflow = "hidden";
    workspace.className = "dom-circuit-workspace";

    // Add grid background
    if (showGrid) {
      workspace.style.backgroundImage = `
        linear-gradient(to right, rgba(74, 99, 130, 0.3) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(74, 99, 130, 0.3) 1px, transparent 1px)
      `;
      workspace.style.backgroundSize = `${GRID_SIZE}px ${GRID_SIZE}px`;
    }

    // Add instructions
    const instructions = document.createElement("div");
    instructions.innerHTML = `
      <div style="position: absolute; top: 20px; left: 20px; color: white; font-size: 14px; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 5px;">
        <div style="font-weight: bold; margin-bottom: 5px;">🔧 DOM Mode (Graphics Fallback)</div>
        <div>✅ Drag components from toolbar</div>
        <div>✅ Click to place components</div>
        <div>⚠️ Limited visual effects</div>
      </div>
    `;
    workspace.appendChild(instructions);

    // Add click handler for component placement
    workspace.addEventListener("click", (e) => {
      if (selectedTool) {
        const rect = workspace.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        handleDOMComponentPlacement({ x, y });
      }
    });

    // Add drag and drop support
    workspace.addEventListener("dragover", handleDragOver);
    workspace.addEventListener("drop", (e) => {
      e.preventDefault();
      const rect = workspace.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      console.log("DOM Mode: Drop at", { x, y });
      const componentType = e.dataTransfer?.getData("componentType");
      if (componentType) {
        handleDOMComponentPlacement({ x, y }, componentType);
      }
    });
    workspace.addEventListener("dragenter", handleDragEnter);
    workspace.addEventListener("dragleave", handleDragLeave);

    // Insert the workspace
    container.appendChild(workspace);

    // Render existing components
    components.forEach((component) => {
      renderDOMComponent(workspace, component);
    });

    console.log("DOM-based fallback initialized successfully");

    return () => {
      workspace.remove();
      if (canvasRef.current) {
        canvasRef.current.style.display = "block";
      }
    };
  };

  const handleDOMComponentPlacement = (
    point: Point,
    componentType?: string
  ) => {
    const type = componentType || selectedTool;
    if (!type) return;

    console.log("DOM Mode: Placing component at", point);
    // Note: createComponent will handle the snap-to-grid internally
    createComponent(type as ComponentType, point);

    // TODO: Replace with proper Zustand actions
    // Removed broken object literal syntax
    // TODO: Use Zustand addComponent action directly
    console.log("🔧 Using addComponent instead");
  };

  const renderDOMComponent = (
    workspace: HTMLElement,
    component: CircuitComponent
  ) => {
    const element = document.createElement("div");
    element.style.position = "absolute";
    element.style.left = component.position.x - 25 + "px";
    element.style.top = component.position.y - 25 + "px";
    element.style.width = "50px";
    element.style.height = "50px";
    element.style.display = "flex";
    element.style.alignItems = "center";
    element.style.justifyContent = "center";
    element.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
    element.style.border = "2px solid white";
    element.style.borderRadius = "8px";
    element.style.color = "white";
    element.style.fontSize = "24px";
    element.style.cursor = "pointer";
    element.style.userSelect = "none";
    element.title = `${component.type} - ${component.properties.label || ""}`;

    // Set component icon/symbol
    const symbols: Record<ComponentType, string> = {
      battery: "🔋",
      resistor: "⚡",
      led: "💡",
      ground: "🌍",
      capacitor: "⚡",
      switch: "🔘",
      inductor: "🔄",
      diode: "🔻",
      voltmeter: "📐",
      ammeter: "🔢",
      wire: "━",
    };

    element.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 20px;">${symbols[component.type] || "⚡"}</div>
        <div style="font-size: 10px; margin-top: 2px;">${component.properties.label || component.type}</div>
      </div>
    `;

    // Add click handler
    element.addEventListener("click", (e) => {
      e.stopPropagation();
      console.log(`Clicked ${component.type}:`, component);
    });

    workspace.appendChild(element);
  };

  const showCanvasError = () => {
    console.log("Showing canvas error fallback");
    if (!canvasRef.current) {
      console.error("Cannot show error - canvas ref is null");
      return;
    }

    const canvas = canvasRef.current;

    // Try to create a new canvas if the current one is problematic
    try {
      // Clear any existing content
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;

      // Try different context methods
      let ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        ctx = canvas.getContext("2d");
      }

      if (ctx) {
        console.log("Drawing error message with 2D context");
        ctx.fillStyle = "#ffcccc";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.fillStyle = "#cc0000";
        ctx.font = "24px Arial";
        ctx.textAlign = "center";
        ctx.fillText(
          "Graphics initialization failed",
          CANVAS_WIDTH / 2,
          CANVAS_HEIGHT / 2 - 60
        );
        ctx.font = "16px Arial";
        ctx.fillText(
          "PixiJS and HTML5 Canvas both failed to initialize",
          CANVAS_WIDTH / 2,
          CANVAS_HEIGHT / 2 - 20
        );
        ctx.fillText("Please try:", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
        ctx.fillText(
          "1. Refreshing the page",
          CANVAS_WIDTH / 2,
          CANVAS_HEIGHT / 2 + 45
        );
        ctx.fillText(
          "2. Using a different browser (Chrome, Firefox, Safari)",
          CANVAS_WIDTH / 2,
          CANVAS_HEIGHT / 2 + 70
        );
        ctx.fillText(
          "3. Updating your graphics drivers",
          CANVAS_WIDTH / 2,
          CANVAS_HEIGHT / 2 + 95
        );
      } else {
        console.error("Cannot draw error message - no 2D context available");
        // Fallback: modify canvas style to show error
        canvas.style.backgroundColor = "#ffcccc";
        canvas.style.border = "3px solid #cc0000";

        // Create text overlay using DOM
        const errorDiv = document.createElement("div");
        errorDiv.style.position = "absolute";
        errorDiv.style.top = "50%";
        errorDiv.style.left = "50%";
        errorDiv.style.transform = "translate(-50%, -50%)";
        errorDiv.style.color = "#cc0000";
        errorDiv.style.fontSize = "18px";
        errorDiv.style.textAlign = "center";
        errorDiv.style.fontFamily = "Arial, sans-serif";
        errorDiv.style.backgroundColor = "rgba(255, 255, 255, 0.9)";
        errorDiv.style.padding = "20px";
        errorDiv.style.borderRadius = "8px";
        errorDiv.innerHTML = `
          <div style="font-size: 24px; font-weight: bold; margin-bottom: 15px;">⚠️ Graphics Error</div>
          <div>Your browser cannot render the circuit simulator.</div>
          <div style="margin-top: 10px;">Please try:</div>
          <div style="margin-top: 5px;">• Refreshing the page</div>
          <div>• Using Chrome, Firefox, or Safari</div>
          <div>• Enabling hardware acceleration</div>
        `;

        if (canvas.parentNode) {
          canvas.parentNode.appendChild(errorDiv);
        }
      }
    } catch (error) {
      console.error("Failed to show error message:", error);
    }
  };

  const drawGrid = (gridLayer: PIXI.Container) => {
    // Clear existing grid
    gridLayer.removeChildren();

    if (!showGrid) return;

    const grid = new PIXI.Graphics();

    // Draw major grid lines (every 100px = 5 grid units) - more visible
    grid.lineStyle(1, 0x6b8db5, 0.8);
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE * 5) {
      grid.moveTo(x, 0);
      grid.lineTo(x, CANVAS_HEIGHT);
    }
    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE * 5) {
      grid.moveTo(0, y);
      grid.lineTo(CANVAS_WIDTH, y);
    }

    // Draw minor grid lines (every 20px = 1 grid unit) - more visible
    grid.lineStyle(1, 0x4a6382, 0.5);
    for (let x = GRID_SIZE; x < CANVAS_WIDTH; x += GRID_SIZE) {
      if (x % (GRID_SIZE * 5) !== 0) {
        // Skip major grid lines
        grid.moveTo(x, 0);
        grid.lineTo(x, CANVAS_HEIGHT);
      }
    }
    for (let y = GRID_SIZE; y < CANVAS_HEIGHT; y += GRID_SIZE) {
      if (y % (GRID_SIZE * 5) !== 0) {
        // Skip major grid lines
        grid.moveTo(0, y);
        grid.lineTo(CANVAS_WIDTH, y);
      }
    }

    // Add grid dots at intersections for better visibility - brighter
    grid.lineStyle(0);
    grid.beginFill(0x8fa4c7, 0.6);
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE) {
      for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE) {
        grid.drawCircle(x, y, 1.5);
      }
    }
    grid.endFill();

    gridLayer.addChild(grid);
  };

  const snapToGrid = (point: Point): Point => {
    const snapped = {
      x: Math.round(point.x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(point.y / GRID_SIZE) * GRID_SIZE,
    };

    // Very obvious debug logging
    console.log("🔴 SNAP TO GRID DEBUG:");
    console.log("  Original:", point);
    console.log("  Snapped:", snapped);
    console.log("  Grid Size:", GRID_SIZE);
    console.log("  Difference:", {
      x: snapped.x - point.x,
      y: snapped.y - point.y,
    });

    return snapped;
  };

  const createComponent = (
    type: ComponentType,
    position: Point
  ): CircuitComponent => {
    const id = uuidv4();
    const snappedPosition = snapToGrid(position);

    console.log(
      "Creating component:",
      type,
      "at original:",
      position,
      "snapped:",
      snappedPosition
    );

    // Create pins based on component type
    const pins = [
      {
        id: `${id}-pin1`,
        position: { x: snappedPosition.x - 20, y: snappedPosition.y },
        type: "bidirectional" as const,
      },
      {
        id: `${id}-pin2`,
        position: { x: snappedPosition.x + 20, y: snappedPosition.y },
        type: "bidirectional" as const,
      },
    ];

    // Set default properties based on component type
    const properties: any = {};
    switch (type) {
      case "resistor":
        properties.resistance = 1000;
        properties.label = "1kΩ";
        break;
      case "battery":
        properties.voltage = 9;
        properties.label = "9V";
        break;
      case "led":
        properties.forwardVoltage = 2.0;
        properties.maxCurrent = 0.02;
        properties.color = "red";
        properties.label = "LED";
        break;
      case "capacitor":
        properties.capacitance = 0.001;
        properties.label = "1mF";
        break;
      case "ground":
        pins.splice(1); // Ground only has one pin
        break;
    }

    return {
      id,
      type,
      position: snappedPosition,
      rotation: 0,
      properties,
      pins,
    };
  };

  const drawComponent = (component: CircuitComponent): PIXI.Graphics => {
    const graphics = new PIXI.Graphics();
    const { x, y } = component.position;

    // Component styling
    const isSelected = selectedComponent?.id === component.id;
    const lineColor = isSelected ? 0xffff00 : 0xffffff;
    const fillColor = getComponentColor(component.type);

    graphics.lineStyle(2, lineColor, 1);
    graphics.beginFill(fillColor, 0.8);

    switch (component.type) {
      case "resistor":
        drawResistor(graphics, x, y);
        break;
      case "battery":
        drawBattery(graphics, x, y);
        break;
      case "led":
        drawLED(
          graphics,
          x,
          y,
          component.properties.color || "red",
          component.id
        );
        break;
      case "capacitor":
        drawCapacitor(graphics, x, y);
        break;
      case "ground":
        drawGround(graphics, x, y);
        break;
      case "switch":
        drawSwitch(graphics, x, y, component.properties.isOpen || false);
        break;
    }

    graphics.endFill();

    // Draw component pins
    drawComponentPins(component, graphics);

    // Add label
    if (component.properties.label) {
      const text = new PIXI.Text(component.properties.label, {
        fontSize: 12,
        fill: 0xffffff,
        align: "center",
      });
      text.anchor.set(0.5);
      text.position.set(x, y + 30);
      graphics.addChild(text);
    }

    // Make interactive
    graphics.interactive = true;
    graphics.buttonMode = true;
    graphics.on("pointerdown", (e) => handleComponentClick(e, component));
    graphics.on("pointerover", () => {
      graphics.tint = 0xdddddd;
    });
    graphics.on("pointerout", () => {
      graphics.tint = 0xffffff;
    });

    return graphics;
  };

  const drawResistor = (graphics: PIXI.Graphics, x: number, y: number) => {
    const width = 40;
    const height = 12;
    graphics.drawRect(x - width / 2, y - height / 2, width, height);

    // Draw zigzag pattern
    graphics.lineStyle(1, 0x000000, 1);
    const zigzagPoints = [];
    for (let i = 0; i < 6; i++) {
      const px = x - width / 2 + (i * width) / 5;
      const py = y + (i % 2 === 0 ? -height / 4 : height / 4);
      zigzagPoints.push(px, py);
    }
    graphics.drawPolygon(zigzagPoints);
  };

  const drawBattery = (graphics: PIXI.Graphics, x: number, y: number) => {
    // Positive terminal (thick line)
    graphics.lineStyle(4, 0xffffff, 1);
    graphics.moveTo(x - 5, y - 15);
    graphics.lineTo(x - 5, y + 15);

    // Negative terminal (thin line)
    graphics.lineStyle(2, 0xffffff, 1);
    graphics.moveTo(x + 5, y - 10);
    graphics.lineTo(x + 5, y + 10);

    // Draw + and - symbols
    const plusText = new PIXI.Text("+", { fontSize: 16, fill: 0xffffff });
    plusText.anchor.set(0.5);
    plusText.position.set(x - 15, y);
    graphics.addChild(plusText);

    const minusText = new PIXI.Text("-", { fontSize: 16, fill: 0xffffff });
    minusText.anchor.set(0.5);
    minusText.position.set(x + 15, y);
    graphics.addChild(minusText);
  };

  const drawLED = (
    graphics: PIXI.Graphics,
    x: number,
    y: number,
    color: string,
    componentId?: string
  ) => {
    // Draw diode triangle
    graphics.moveTo(x - 10, y - 10);
    graphics.lineTo(x + 10, y);
    graphics.lineTo(x - 10, y + 10);
    graphics.lineTo(x - 10, y - 10);

    // Draw vertical line
    graphics.lineStyle(2, 0xffffff, 1);
    graphics.moveTo(x + 10, y - 10);
    graphics.lineTo(x + 10, y + 10);

    // Add glow effect if LED is on (based on simulation results)
    if (componentId && results?.componentCurrents[componentId]) {
      const isOn = results.componentCurrents[componentId] > 0.001;
      if (isOn && false) {
        graphics.beginFill(getColorFromString(color), 0.5);
        graphics.drawCircle(x, y, 25);
        graphics.endFill();
      }
    }
  };

  const drawCapacitor = (graphics: PIXI.Graphics, x: number, y: number) => {
    graphics.lineStyle(3, 0xffffff, 1);
    // Left plate
    graphics.moveTo(x - 5, y - 15);
    graphics.lineTo(x - 5, y + 15);
    // Right plate
    graphics.moveTo(x + 5, y - 15);
    graphics.lineTo(x + 5, y + 15);
  };

  const drawGround = (graphics: PIXI.Graphics, x: number, y: number) => {
    graphics.lineStyle(2, 0xffffff, 1);
    // Vertical line
    graphics.moveTo(x, y - 10);
    graphics.lineTo(x, y + 10);
    // Ground symbol
    graphics.moveTo(x - 15, y + 10);
    graphics.lineTo(x + 15, y + 10);
    graphics.moveTo(x - 10, y + 15);
    graphics.lineTo(x + 10, y + 15);
    graphics.moveTo(x - 5, y + 20);
    graphics.lineTo(x + 5, y + 20);
  };

  const drawSwitch = (
    graphics: PIXI.Graphics,
    x: number,
    y: number,
    isOpen: boolean
  ) => {
    graphics.lineStyle(3, 0xffffff, 1);
    graphics.drawCircle(x - 15, y, 3);
    graphics.drawCircle(x + 15, y, 3);

    if (isOpen) {
      graphics.moveTo(x - 12, y);
      graphics.lineTo(x + 5, y - 10);
    } else {
      graphics.moveTo(x - 12, y);
      graphics.lineTo(x + 12, y);
    }
  };

  const getComponentColor = (type: ComponentType): number => {
    switch (type) {
      case "resistor":
        return 0x8b4513;
      case "battery":
        return 0x32cd32;
      case "led":
        return 0xff4500;
      case "capacitor":
        return 0x4169e1;
      case "ground":
        return 0x8b4513;
      case "switch":
        return 0xffd700;
      default:
        return 0x808080;
    }
  };

  const getColorFromString = (color: string): number => {
    const colors: Record<string, number> = {
      red: 0xff0000,
      green: 0x00ff00,
      blue: 0x0000ff,
      yellow: 0xffff00,
      white: 0xffffff,
    };
    return colors[color] || 0xff0000;
  };

  const redrawCircuit = () => {
    if (!appRef.current) return;

    // Get the component layer (4th child - index 3, after background, grid, wire layers)
    const componentLayer = appRef.current.stage.children[3] as PIXI.Container;
    if (!componentLayer) return;

    // Clear existing component graphics
    componentGraphics.current.forEach((graphic) => {
      componentLayer.removeChild(graphic);
    });
    componentGraphics.current.clear();

    // Draw all components
    components.forEach((component) => {
      const graphic = drawComponent(component);
      componentGraphics.current.set(component.id, graphic);
      componentLayer.addChild(graphic);
    });
  };

  const handleStageClick = (event: PIXI.InteractionEvent) => {
    if (!selectedTool || !appRef.current) return;

    // Get position relative to the canvas, not the global screen position
    const position = event.data.getLocalPosition(appRef.current.stage);
    console.log("🔴 PIXIJS CLICK - Raw position:", position);
    console.log("🔴 PIXIJS CLICK - Selected tool:", selectedTool);

    // Note: createComponent will handle the snap-to-grid internally
    createComponent(selectedTool as ComponentType, position);

    // TODO: Use Zustand addComponent action directly
    console.log("🔧 Using addComponent instead");

    console.log("🔴 PIXIJS CLICK - Component created and state updated");
  };

  const handleComponentClick = (
    event: PIXI.InteractionEvent,
    component: CircuitComponent
  ) => {
    event.stopPropagation();

    // TODO: Use Zustand setSelectedComponent action
    console.log("🔧 Should use setSelectedComponent action here");

    // Start dragging
    setDragState({
      isDragging: true,
      component,
      offset: {
        x: event.data.global.x - component.position.x,
        y: event.data.global.y - component.position.y,
      },
    });
  };

  const handleStageMove = (event: PIXI.InteractionEvent) => {
    if (!dragState.isDragging || !dragState.component) return;

    const newPosition = snapToGrid({
      x: event.data.global.x - dragState.offset.x,
      y: event.data.global.y - dragState.offset.y,
    });

    components.map((comp) =>
      comp.id === dragState.component!.id
        ? { ...comp, position: newPosition }
        : comp
    );

    // TODO: Use Zustand moveComponent action for updated components
    console.log("🔧 Should use Zustand actions for component updates");
  };

  const handleStageUp = () => {
    setDragState({
      isDragging: false,
      component: null,
      offset: { x: 0, y: 0 },
    });
  };

  const runSimulation = () => {
    const solver = new CircuitSolver(components, connections);
    const results = solver.solve();

    // Update electron animations if simulation is valid
    if (results.isValid && electronAnimator.current) {
      electronAnimator.current.clearElectrons();
      connections.forEach((connection) => {
        const current = results.componentCurrents[connection.id] || 0;
        electronAnimator.current!.createElectronsForConnection(
          connection,
          current,
          components
        );
      });
    }

    // TODO: Use Zustand actions for results update
    console.log("🔧 Should update results with Zustand");
  };

  const drawWires = () => {
    if (!appRef.current) return;

    const wireContainer = appRef.current.stage.children[2] as PIXI.Container; // Wire layer (index 2, after background and grid)
    wireContainer.removeChildren();

    connections.forEach((connection) => {
      const wireGraphic = new PIXI.Graphics();
      const isHighlighted = connection.isHighlighted;

      wireGraphic.lineStyle(3, isHighlighted ? 0xffff00 : 0xffffff, 1);

      // Use routed path if available, otherwise recalculate with routing
      let pathToRender = connection.routedPath;
      if (!pathToRender && connection.points.length >= 2) {
        // Recalculate using Manhattan routing with pin exclusions if no routed path exists
        pathToRender = findManhattanPath(
          connection.points[0],
          connection.points[connection.points.length - 1],
          connection.fromPin, // Start pin ID
          connection.toPin // End pin ID
        );
      }
      pathToRender = pathToRender || connection.points; // Final fallback to direct points

      // Draw wire path using the routed path
      if (pathToRender.length > 0) {
        wireGraphic.moveTo(pathToRender[0].x, pathToRender[0].y);
        for (let i = 1; i < pathToRender.length; i++) {
          wireGraphic.lineTo(pathToRender[i].x, pathToRender[i].y);
        }
      }

      wireContainer.addChild(wireGraphic);
    });
  };

  const drawComponentPins = (
    component: CircuitComponent,
    graphics: PIXI.Graphics
  ) => {
    component.pins.forEach((pin) => {
      const pinGraphic = new PIXI.Graphics();
      pinGraphic.beginFill(0xffd700, 0.8);
      pinGraphic.drawCircle(0, 0, 4);
      pinGraphic.endFill();
      pinGraphic.position.set(pin.position.x, pin.position.y);

      // Make pin interactive
      pinGraphic.interactive = true;
      pinGraphic.buttonMode = true;
      pinGraphic.on("pointerdown", (e) => handlePinClick(e, pin.id));

      graphics.addChild(pinGraphic);
    });
  };

  // PixiJS pin click handler (not used in HTML5 Canvas fallback mode)
  const handlePinClick = (event: PIXI.InteractionEvent, pinId: string) => {
    event.stopPropagation();
    console.log(
      "PixiJS pin click handler (not active - using HTML5 Canvas instead)",
      { pinId } // Suppress unused variable warning
    );
  };

  // Drag and Drop handlers with useCallback for proper dependencies
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "copy";
  }, []);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    const componentType = e.dataTransfer?.getData("componentType");
    if (componentType) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    // Only hide if we're actually leaving the canvas (not moving to a child element)
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX;
      const y = e.clientY;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        setIsDragOver(false);
      }
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const componentType = e.dataTransfer?.getData("componentType");
      if (!componentType || !canvasRef.current) return;

      // Get the canvas bounding rect
      const rect = canvasRef.current.getBoundingClientRect();

      // Calculate position relative to canvas
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Create component at drop position using Zustand action
      console.log("Main canvas drop at", { x, y }, "type:", componentType);
      addComponent(componentType as ComponentType, { x, y });
    },
    [addComponent]
  );

  return (
    <div
      style={{
        position: "relative",
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        border: isDragOver ? "3px dashed #4CAF50" : "3px solid transparent",
        borderRadius: "8px",
        transition: "border-color 0.2s ease",
      }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{
          display: "block",
          backgroundColor: "#2a3f5f",
        }}
      />
      {isDragOver && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(76, 175, 80, 0.9)",
            color: "white",
            padding: "1rem 2rem",
            borderRadius: "8px",
            fontSize: "1.2rem",
            fontWeight: "bold",
            pointerEvents: "none",
            zIndex: 1000,
          }}
        >
          🎯 Drop component here!
        </div>
      )}
    </div>
  );
};

export default CircuitSimulator;
