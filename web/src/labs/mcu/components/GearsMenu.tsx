import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";

interface LevelProgress {
  completed: boolean;
  unlocked: boolean;
}

export const GearsMenu: React.FC = () => {
  const [progress, setProgress] = useState<Record<string, LevelProgress>>({
    demo: { completed: false, unlocked: true },
    motor_basics: { completed: false, unlocked: true },
    gear_introduction: { completed: false, unlocked: false },
    belt_systems: { completed: false, unlocked: false },
    forklift_challenge: { completed: false, unlocked: false },
  });

  useEffect(() => {
    // Load progress from localStorage
    loadProgress();
  }, []);

  const loadProgress = () => {
    try {
      const savedProgress = localStorage.getItem("stemplitude_level_progress");
      if (savedProgress) {
        const data = JSON.parse(savedProgress);
        const completedLevels = new Set(data.completedLevels || []);

        setProgress({
          demo: { completed: false, unlocked: true },
          motor_basics: {
            completed: completedLevels.has("motor_basics"),
            unlocked: true,
          },
          gear_introduction: {
            completed: completedLevels.has("gear_introduction"),
            unlocked: completedLevels.has("motor_basics"),
          },
          belt_systems: {
            completed: completedLevels.has("belt_systems"),
            unlocked: completedLevels.has("gear_introduction"),
          },
          forklift_challenge: {
            completed: completedLevels.has("forklift_challenge"),
            unlocked: completedLevels.has("belt_systems"),
          },
        });
      }
    } catch (error) {
      console.error("Failed to load progress:", error);
    }
  };

  const resetProgress = () => {
    if (confirm("Reset all progress? This cannot be undone.")) {
      localStorage.removeItem("stemplitude_level_progress");
      localStorage.removeItem("motor_basics_progress");
      localStorage.removeItem("gear_introduction_progress");
      localStorage.removeItem("belt_systems_progress");
      localStorage.removeItem("forklift_challenge_progress");
      localStorage.removeItem("stemplitude_course_completed");

      setProgress({
        demo: { completed: false, unlocked: true },
        motor_basics: { completed: false, unlocked: true },
        gear_introduction: { completed: false, unlocked: false },
        belt_systems: { completed: false, unlocked: false },
        forklift_challenge: { completed: false, unlocked: false },
      });
    }
  };

  const getLevelStatus = (levelId: string) => {
    const levelProgress = progress[levelId];
    if (levelProgress.completed) return "✅";
    if (levelProgress.unlocked) return "🎯";
    return "🔒";
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "beginner":
        return "rgba(39, 174, 96, 0.8)";
      case "intermediate":
        return "rgba(243, 156, 18, 0.8)";
      case "advanced":
        return "rgba(231, 76, 60, 0.8)";
      default:
        return "rgba(52, 152, 219, 0.8)";
    }
  };

  const levels = [
    {
      id: "demo",
      path: "/gears/demo",
      title: "Interactive Demo",
      description:
        "Free-form exploration of gears, motors, and mechanical systems. Build and experiment without constraints.",
      difficulty: "demo",
      icon: "🔧",
    },
    {
      id: "motor_basics",
      path: "/gears/motor-basics",
      title: "Motor Basics",
      description:
        "Learn the fundamentals of electric motors and basic mechanical motion.",
      difficulty: "beginner",
      icon: "🔌",
    },
    {
      id: "gear_introduction",
      path: "/gears/gear-introduction",
      title: "Gear Introduction",
      description:
        "Discover how gears mesh together and transfer rotational motion.",
      difficulty: "beginner",
      icon: "⚙️",
    },
    {
      id: "belt_systems",
      path: "/gears/belt-systems",
      title: "Belt Drive Systems",
      description:
        "Master belt and pulley systems for power transmission over distances.",
      difficulty: "intermediate",
      icon: "🔗",
    },
    {
      id: "forklift_challenge",
      path: "/gears/forklift-challenge",
      title: "Forklift Engineering",
      description:
        "Design and build a complete forklift lifting mechanism using all learned concepts.",
      difficulty: "advanced",
      icon: "🏗️",
    },
  ];

  return (
    <div className="menu-container">
      <Link to="/simple-machines" className="back-button">
        ← Back to Simple Machines
      </Link>

      <div className="menu-content">
        <h1 className="menu-title">Gears & Power Transmission</h1>
        <p className="menu-subtitle">Interactive Learning Journey</p>
        <p className="menu-description">
          Progress through structured lessons or explore freely in the demo.
          Each level builds upon previous concepts to create a comprehensive
          understanding of mechanical systems.
        </p>

        <div className="menu-grid">
          {levels.map((level) => {
            const levelProgress = progress[level.id];
            const isLocked = !levelProgress.unlocked && level.id !== "demo";

            return (
              <div key={level.id} className="menu-card-wrapper">
                {isLocked ? (
                  <div className={`menu-card level-card locked`}>
                    <div className="level-status">
                      {getLevelStatus(level.id)}
                    </div>
                    {level.difficulty !== "demo" && (
                      <div
                        className={`level-difficulty ${level.difficulty}`}
                        style={{
                          background: getDifficultyColor(level.difficulty),
                        }}
                      >
                        {level.difficulty}
                      </div>
                    )}
                    <span className="menu-card-icon">{level.icon}</span>
                    <h3 className="menu-card-title">{level.title}</h3>
                    <p className="menu-card-description">{level.description}</p>
                    <p
                      style={{
                        marginTop: "1rem",
                        fontSize: "0.9rem",
                        opacity: 0.7,
                      }}
                    >
                      🔒 Complete previous levels to unlock
                    </p>
                  </div>
                ) : (
                  <Link to={level.path} className={`menu-card level-card`}>
                    <div className="level-status">
                      {getLevelStatus(level.id)}
                    </div>
                    {level.difficulty !== "demo" && (
                      <div
                        className={`level-difficulty ${level.difficulty}`}
                        style={{
                          background: getDifficultyColor(level.difficulty),
                        }}
                      >
                        {level.difficulty}
                      </div>
                    )}
                    <span className="menu-card-icon">{level.icon}</span>
                    <h3 className="menu-card-title">{level.title}</h3>
                    <p className="menu-card-description">{level.description}</p>
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "3rem", textAlign: "center" }}>
          <button
            onClick={resetProgress}
            style={{
              background: "rgba(231, 76, 60, 0.2)",
              border: "1px solid rgba(231, 76, 60, 0.5)",
              color: "white",
              padding: "0.75rem 1.5rem",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.9rem",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(231, 76, 60, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(231, 76, 60, 0.2)";
            }}
          >
            🔄 Reset All Progress
          </button>
        </div>
      </div>
    </div>
  );
};
