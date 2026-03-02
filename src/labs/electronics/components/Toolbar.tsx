import React from "react";
import { ComponentType } from "../types/Circuit";
import {
  useSelectedTool,
  useIsSimulating,
  useCircuitActions,
  useComponents,
  useConnections,
} from "../store/circuitStore";

interface ToolbarProps {
  // No props needed - using Zustand store
}

const componentButtons: {
  type: ComponentType;
  label: string;
  emoji: string;
}[] = [
  { type: "battery", label: "Battery", emoji: "🔋" },
  { type: "resistor", label: "Resistor", emoji: "⚡" },
  { type: "led", label: "LED", emoji: "💡" },
  { type: "switch", label: "Switch", emoji: "🔘" },
  { type: "capacitor", label: "Capacitor", emoji: "⚪" },
  { type: "diode", label: "Diode", emoji: "▶️" },
  { type: "voltmeter", label: "Voltmeter", emoji: "📊" },
  { type: "ground", label: "Ground", emoji: "🌍" },
];

const Toolbar: React.FC<ToolbarProps> = () => {
  // Use Zustand store
  const selectedTool = useSelectedTool();
  const isSimulating = useIsSimulating();
  const components = useComponents();
  const connections = useConnections();
  const { setSelectedTool, setIsSimulating, clearCircuit } =
    useCircuitActions();
  const handleSimulation = () => {
    setIsSimulating(!isSimulating);
    console.log("🟢 Zustand: Toggled simulation to", !isSimulating);
  };

  const handleClear = () => {
    clearCircuit();
  };

  return (
    <div className="toolbar">
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <span
          style={{ color: "white", fontWeight: "bold", marginRight: "1rem" }}
        >
          Components:
        </span>
        {componentButtons.map((component) => (
          <button
            key={component.type}
            className={`component-button ${selectedTool === component.type ? "selected" : ""}`}
            onClick={() =>
              setSelectedTool(
                selectedTool === component.type ? null : component.type
              )
            }
            onDragStart={(e) => {
              e.dataTransfer.setData("componentType", component.type);
              e.dataTransfer.setData("componentLabel", component.label);
              e.dataTransfer.setData("componentEmoji", component.emoji);
              e.dataTransfer.effectAllowed = "copy";
            }}
            draggable={true}
            title={`${component.label} - Click to select or drag to place`}
            style={{
              background:
                selectedTool === component.type
                  ? "rgba(255, 255, 255, 0.4)"
                  : "rgba(255, 255, 255, 0.2)",
              cursor: "grab",
            }}
            onMouseDown={(e) => {
              if (e.currentTarget) e.currentTarget.style.cursor = "grabbing";
            }}
            onMouseUp={(e) => {
              if (e.currentTarget) e.currentTarget.style.cursor = "grab";
            }}
          >
            {component.emoji} {component.label}
          </button>
        ))}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
        <button
          className="component-button"
          onClick={handleSimulation}
          style={{
            background: isSimulating
              ? "rgba(255, 100, 100, 0.6)"
              : "rgba(100, 255, 100, 0.6)",
          }}
        >
          {isSimulating ? "⏹️ Stop" : "▶️ Simulate"}
        </button>

        <button
          className="component-button"
          onClick={handleClear}
          style={{ background: "rgba(255, 150, 100, 0.6)" }}
        >
          🗑️ Clear
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
