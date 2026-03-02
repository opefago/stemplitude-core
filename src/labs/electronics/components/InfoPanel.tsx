import React from "react";
import {
  useComponents,
  useConnections,
  useSelectedComponent,
  useIsSimulating,
  useResults,
} from "../store/circuitStore";
import { KidsHelper, HintMessage } from "../utils/KidsHelper";

interface InfoPanelProps {
  // No props needed - using Zustand store
}

const InfoPanel: React.FC<InfoPanelProps> = () => {
  // Use Zustand store
  const components = useComponents();
  const connections = useConnections();
  const selectedComponent = useSelectedComponent();
  const results = useResults();
  const isSimulating = useIsSimulating();

  const hints = KidsHelper.getCircuitHints(components, results);

  const renderHintMessage = (hint: HintMessage) => {
    const colors = {
      success: "#90EE90",
      warning: "#FFD700",
      error: "#FF6B6B",
      tip: "#87CEEB",
    };

    return (
      <div
        key={hint.title}
        style={{
          marginBottom: "0.5rem",
          padding: "0.5rem",
          backgroundColor: "rgba(255,255,255,0.1)",
          borderRadius: "4px",
          borderLeft: `4px solid ${colors[hint.type]}`,
        }}
      >
        <div style={{ color: colors[hint.type], fontWeight: "bold" }}>
          {hint.emoji} {hint.title}
        </div>
        <div style={{ fontSize: "0.9em", color: "rgba(255,255,255,0.9)" }}>
          {hint.message}
        </div>
      </div>
    );
  };

  return (
    <div className="info-panel">
      <div style={{ display: "flex", gap: "2rem" }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: "0 0 1rem 0", color: "#ffd700" }}>
            📋 Component Info
          </h3>
          {selectedComponent ? (
            <div>
              <div
                style={{
                  marginBottom: "1rem",
                  padding: "0.5rem",
                  backgroundColor: "rgba(255,255,255,0.1)",
                  borderRadius: "4px",
                }}
              >
                <div
                  style={{ fontSize: "0.9em", color: "rgba(255,255,255,0.9)" }}
                >
                  {KidsHelper.getComponentDescription(selectedComponent)}
                </div>
              </div>

              <p>
                <strong>Type:</strong> {selectedComponent.type.toUpperCase()}
              </p>

              {selectedComponent.properties.resistance && (
                <p>
                  <strong>Resistance:</strong>{" "}
                  {selectedComponent.properties.resistance}Ω
                </p>
              )}
              {selectedComponent.properties.voltage && (
                <p>
                  <strong>Voltage:</strong>{" "}
                  {KidsHelper.getVoltageExplanation(
                    selectedComponent.properties.voltage
                  )}
                </p>
              )}
              {selectedComponent.properties.capacitance && (
                <p>
                  <strong>Capacitance:</strong>{" "}
                  {selectedComponent.properties.capacitance}F
                </p>
              )}

              {results && (
                <div style={{ marginTop: "1rem" }}>
                  {KidsHelper.getComponentTips(selectedComponent, results).map(
                    (tip, i) => (
                      <p
                        key={i}
                        style={{ fontSize: "0.9em", color: "#87CEEB" }}
                      >
                        {tip}
                      </p>
                    )
                  )}
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: "rgba(255,255,255,0.7)" }}>
              Click on a component to see its details and learn about it!
            </p>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <h3 style={{ margin: "0 0 1rem 0", color: "#ffd700" }}>
            ⚡ Simulation Results
          </h3>
          {isSimulating && results ? (
            <div>
              {results.isValid ? (
                <div>
                  <p style={{ color: "#90EE90" }}>
                    ✅ Circuit is working great!
                  </p>
                  {selectedComponent &&
                    results.componentCurrents[selectedComponent.id] && (
                      <div style={{ marginTop: "0.5rem" }}>
                        <p>
                          <strong>Current:</strong>{" "}
                          {KidsHelper.getCurrentExplanation(
                            results.componentCurrents[selectedComponent.id]
                          )}
                        </p>
                        <p>
                          <strong>Power:</strong>{" "}
                          {(
                            results.componentPowers[selectedComponent.id] * 1000
                          ).toFixed(2)}
                          mW
                        </p>
                      </div>
                    )}

                  {results.warnings.length > 0 && (
                    <div style={{ marginTop: "1rem" }}>
                      <p style={{ color: "#FFD700" }}>⚠️ Warnings:</p>
                      {results.warnings.map((warning, i) => (
                        <p
                          key={i}
                          style={{ color: "#FFD700", fontSize: "0.9em" }}
                        >
                          • {warning}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p style={{ color: "#FF6B6B" }}>❌ Circuit has issues:</p>
                  {results.errors.map((error, i) => (
                    <p key={i} style={{ color: "#FF6B6B", fontSize: "0.9em" }}>
                      • {error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : isSimulating ? (
            <p style={{ color: "#FFD700" }}>
              🔄 Computing your amazing circuit...
            </p>
          ) : (
            <div>
              <p style={{ color: "rgba(255,255,255,0.7)" }}>
                Press "Simulate" to bring your circuit to life!
              </p>
              {components.length > 0 && (
                <p
                  style={{
                    color: "#87CEEB",
                    fontSize: "0.9em",
                    marginTop: "1rem",
                  }}
                >
                  {KidsHelper.getRandomEncouragement()}
                </p>
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <h3 style={{ margin: "0 0 1rem 0", color: "#ffd700" }}>
            💡 Smart Hints
          </h3>
          <div style={{ maxHeight: "150px", overflowY: "auto" }}>
            {hints.length > 0 ? (
              hints.map(renderHintMessage)
            ) : (
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.9em" }}>
                You're doing great! Keep building your circuit!
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoPanel;
