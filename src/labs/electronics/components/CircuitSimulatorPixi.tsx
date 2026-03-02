import React, { useEffect, useRef } from "react";
import { IntegratedPixiApp } from "../core/IntegratedPixiApp";

interface CircuitSimulatorPixiProps {
  // Props if needed in the future
}

export const CircuitSimulatorPixi: React.FC<CircuitSimulatorPixiProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<IntegratedPixiApp | null>(null);
  const isInitializingRef = useRef<boolean>(false);

  useEffect(() => {
    // Prevent multiple initializations (React StrictMode)
    if (isInitializingRef.current || appRef.current) {
      return;
    }

    if (containerRef.current) {
      isInitializingRef.current = true;

      // Initialize the PixiJS application
      appRef.current = new IntegratedPixiApp(containerRef.current);
      console.log("🚀 Integrated PixiJS 8 Circuit Simulator initialized");
    }

    // Cleanup on unmount
    return () => {
      if (appRef.current) {
        try {
          appRef.current.destroy();
          console.log("🧹 PixiJS application destroyed");
        } catch (error) {
          console.warn("Error destroying PixiJS app:", error);
        }
        appRef.current = null;
      }
      isInitializingRef.current = false;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "#1a1a1a",
        position: "relative",
        pointerEvents: "auto",
      }}
    />
  );
};

export default CircuitSimulatorPixi;
