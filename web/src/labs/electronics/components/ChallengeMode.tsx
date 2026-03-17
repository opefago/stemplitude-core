import React, { useState } from "react";
import { CircuitState } from "../types/Circuit";
import { useComponents, useConnections } from "../store/circuitStore";

interface Challenge {
  id: string;
  title: string;
  description: string;
  objective: string;
  hint: string;
  emoji: string;
  difficulty: "easy" | "medium" | "hard";
  validateSolution: (circuitState: CircuitState) => {
    passed: boolean;
    message: string;
  };
}

interface ChallengeModeProps {
  // No props needed - using Zustand store!
  isVisible: boolean;
  onClose: () => void;
}

const challenges: Challenge[] = [
  {
    id: "first-light",
    title: "First Light",
    description: "Make your first LED glow!",
    objective:
      "Connect a battery, resistor, and LED to create a simple circuit.",
    hint: "Remember: Battery → Resistor → LED → Ground. Don't forget the ground connection!",
    emoji: "💡",
    difficulty: "easy",
    validateSolution: (circuit) => {
      const hasBattery = circuit.components.some((c) => c.type === "battery");
      const hasLED = circuit.components.some((c) => c.type === "led");
      const hasResistor = circuit.components.some((c) => c.type === "resistor");
      const hasGround = circuit.components.some((c) => c.type === "ground");
      const hasConnections = circuit.connections.length >= 3;
      const isSimulating = circuit.isSimulating;

      if (!hasBattery)
        return {
          passed: false,
          message: "You need a battery to power your circuit!",
        };
      if (!hasLED)
        return { passed: false, message: "Add an LED to see the light!" };
      if (!hasResistor)
        return { passed: false, message: "Add a resistor to protect the LED!" };
      if (!hasGround)
        return { passed: false, message: "Add a ground connection!" };
      if (!hasConnections)
        return {
          passed: false,
          message: "Connect your components with wires!",
        };
      if (!isSimulating)
        return {
          passed: false,
          message: "Press simulate to test your circuit!",
        };

      const ledComponent = circuit.components.find((c) => c.type === "led");
      const ledCurrent =
        circuit.results?.componentCurrents[ledComponent?.id || ""] || 0;

      if (ledCurrent > 0.005) {
        return {
          passed: true,
          message:
            "Amazing! Your LED is glowing bright! You've mastered basic circuits!",
        };
      }

      return {
        passed: false,
        message: "Check your connections - the LED isn't lighting up!",
      };
    },
  },
  {
    id: "bright-vs-dim",
    title: "Bright vs Dim",
    description: "Learn how resistors control LED brightness!",
    objective:
      "Build two circuits: one with a 100Ω resistor and one with a 1000Ω resistor.",
    hint: "Lower resistance = higher current = brighter LED. But be careful not to burn out the LED!",
    emoji: "🔆",
    difficulty: "medium",
    validateSolution: (circuit) => {
      const resistors = circuit.components.filter((c) => c.type === "resistor");
      const leds = circuit.components.filter((c) => c.type === "led");
      const batteries = circuit.components.filter((c) => c.type === "battery");

      if (batteries.length < 1)
        return { passed: false, message: "You need at least one battery!" };
      if (leds.length < 2)
        return {
          passed: false,
          message: "You need two LEDs to compare brightness!",
        };
      if (resistors.length < 2)
        return { passed: false, message: "You need two different resistors!" };

      const hasLowResistor = resistors.some(
        (r) => (r.properties.resistance || 1000) <= 200
      );
      const hasHighResistor = resistors.some(
        (r) => (r.properties.resistance || 1000) >= 800
      );

      if (!hasLowResistor || !hasHighResistor) {
        return {
          passed: false,
          message:
            "You need one low resistance (≤200Ω) and one high resistance (≥800Ω)!",
        };
      }

      return {
        passed: true,
        message:
          "Excellent! You can see how resistance affects LED brightness!",
      };
    },
  },
  {
    id: "switch-control",
    title: "Switch Master",
    description: "Control your circuit with switches!",
    objective:
      "Create a circuit where you can turn an LED on and off with a switch.",
    hint: "A switch can break or complete the circuit. When open, no current flows!",
    emoji: "🔘",
    difficulty: "easy",
    validateSolution: (circuit) => {
      const hasSwitch = circuit.components.some((c) => c.type === "switch");
      const hasLED = circuit.components.some((c) => c.type === "led");
      const hasBattery = circuit.components.some((c) => c.type === "battery");

      if (!hasSwitch)
        return {
          passed: false,
          message: "Add a switch to control your circuit!",
        };
      if (!hasLED)
        return { passed: false, message: "Add an LED to see the effect!" };
      if (!hasBattery)
        return { passed: false, message: "You need a battery for power!" };

      return {
        passed: true,
        message: "Great! You can now control electricity with a switch!",
      };
    },
  },
];

const ChallengeMode: React.FC<ChallengeModeProps> = ({
  isVisible,
  onClose,
}) => {
  // 🚀 Use Zustand store instead of props
  const components = useComponents();
  const connections = useConnections();
  const circuitState = {
    components,
    connections,
    isSimulating: false,
    selectedComponent: null,
    results: null,
    selectedTool: null,
    showGrid: true,
  };
  const [currentChallenge, setCurrentChallenge] = useState<Challenge>(
    challenges[0]
  );
  const [completedChallenges, setCompletedChallenges] = useState<Set<string>>(
    new Set()
  );
  const [showCelebration, setShowCelebration] = useState(false);

  const handleValidate = () => {
    const result = currentChallenge.validateSolution(circuitState);

    if (result.passed && !completedChallenges.has(currentChallenge.id)) {
      setCompletedChallenges(
        new Set([...completedChallenges, currentChallenge.id])
      );
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 3000);
    }

    // Circuit state updates now handled automatically by Zustand
    // Result feedback is displayed in the UI directly
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy":
        return "#90EE90";
      case "medium":
        return "#FFD700";
      case "hard":
        return "#FF6B6B";
      default:
        return "#87CEEB";
    }
  };

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.8)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          backgroundColor: "#1e3c72",
          padding: "2rem",
          borderRadius: "12px",
          maxWidth: "800px",
          width: "90%",
          maxHeight: "80%",
          overflow: "auto",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            background: "none",
            border: "none",
            color: "white",
            fontSize: "1.5rem",
            cursor: "pointer",
          }}
        >
          ✖️
        </button>

        <h2
          style={{ color: "white", marginBottom: "2rem", textAlign: "center" }}
        >
          🎮 Challenge Mode
        </h2>

        {showCelebration && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              backgroundColor: "#4CAF50",
              color: "white",
              padding: "2rem",
              borderRadius: "12px",
              textAlign: "center",
              fontSize: "1.5rem",
              zIndex: 1001,
            }}
          >
            🎉 Challenge Complete! 🎉
          </div>
        )}

        <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ color: "#ffd700", marginBottom: "1rem" }}>
              Available Challenges
            </h3>
            {challenges.map((challenge, index) => (
              <div
                key={challenge.id}
                onClick={() => setCurrentChallenge(challenge)}
                style={{
                  padding: "1rem",
                  marginBottom: "0.5rem",
                  backgroundColor:
                    currentChallenge.id === challenge.id
                      ? "rgba(255,255,255,0.2)"
                      : "rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  cursor: "pointer",
                  borderLeft: `4px solid ${getDifficultyColor(challenge.difficulty)}`,
                  opacity: completedChallenges.has(challenge.id) ? 0.7 : 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "1.2rem" }}>{challenge.emoji}</span>
                  <span style={{ color: "white", fontWeight: "bold" }}>
                    {challenge.title}
                  </span>
                  {completedChallenges.has(challenge.id) && (
                    <span style={{ color: "#90EE90" }}>✅</span>
                  )}
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.8)",
                    fontSize: "0.9em",
                    marginTop: "0.5rem",
                  }}
                >
                  {challenge.description}
                </div>
              </div>
            ))}
          </div>

          <div style={{ flex: 2 }}>
            <div
              style={{
                backgroundColor: "rgba(255,255,255,0.1)",
                padding: "1.5rem",
                borderRadius: "8px",
                marginBottom: "1rem",
              }}
            >
              <h3
                style={{
                  color: "#ffd700",
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {currentChallenge.emoji} {currentChallenge.title}
                <span
                  style={{
                    fontSize: "0.8rem",
                    padding: "0.2rem 0.5rem",
                    backgroundColor: getDifficultyColor(
                      currentChallenge.difficulty
                    ),
                    color: "black",
                    borderRadius: "4px",
                    textTransform: "uppercase",
                  }}
                >
                  {currentChallenge.difficulty}
                </span>
              </h3>

              <div style={{ color: "white", marginBottom: "1rem" }}>
                <strong>Objective:</strong> {currentChallenge.objective}
              </div>

              <div
                style={{
                  color: "rgba(255,255,255,0.8)",
                  backgroundColor: "rgba(255,255,255,0.1)",
                  padding: "1rem",
                  borderRadius: "4px",
                  marginBottom: "1rem",
                  borderLeft: "4px solid #87CEEB",
                }}
              >
                <strong>💡 Hint:</strong> {currentChallenge.hint}
              </div>

              <button
                onClick={handleValidate}
                style={{
                  backgroundColor: "#4CAF50",
                  color: "white",
                  border: "none",
                  padding: "1rem 2rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "1rem",
                  fontWeight: "bold",
                }}
              >
                🔍 Check My Solution
              </button>
            </div>

            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.9em" }}>
              <p>
                <strong>Progress:</strong> {completedChallenges.size}/
                {challenges.length} challenges completed
              </p>
              <div
                style={{
                  width: "100%",
                  backgroundColor: "rgba(255,255,255,0.2)",
                  borderRadius: "4px",
                  height: "8px",
                }}
              >
                <div
                  style={{
                    width: `${(completedChallenges.size / challenges.length) * 100}%`,
                    backgroundColor: "#4CAF50",
                    height: "100%",
                    borderRadius: "4px",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChallengeMode;
