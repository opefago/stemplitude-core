import React from "react";
import { Link } from "react-router-dom";

export const MainMenu: React.FC = () => {
  return (
    <div className="menu-container">
      <div className="menu-content">
        <h1 className="menu-title">STEMplitude</h1>
        <p className="menu-subtitle">Interactive STEM Learning Platform</p>
        <p className="menu-description">
          Master STEM concepts through hands-on simulations and experiments.
          Explore mechanical systems, electrical circuits, and engineering
          principles through interactive learning experiences.
        </p>

        <div className="menu-grid">
          <Link to="/simple-machines" className="menu-card">
            <span className="menu-card-icon">⚙️</span>
            <h3 className="menu-card-title">Simple Machines</h3>
            <p className="menu-card-description">
              Discover the fundamental building blocks of mechanical
              engineering. Learn about levers, pulleys, gears, and basic
              mechanical principles.
            </p>
          </Link>

          <Link to="/circuit-lab" className="menu-card">
            <span className="menu-card-icon">🔌</span>
            <h3 className="menu-card-title">Circuit Lab</h3>
            <p className="menu-card-description">
              Build and analyze electrical circuits with resistors, capacitors,
              and other components. Learn circuit theory through simulation.
            </p>
          </Link>

          <div
            className="menu-card"
            style={{ opacity: 0.6, cursor: "not-allowed" }}
          >
            <span className="menu-card-icon">🏭</span>
            <h3 className="menu-card-title">Industrial Applications</h3>
            <p className="menu-card-description">
              Real-world industrial machinery and manufacturing systems. Coming
              soon...
            </p>
          </div>

          <div
            className="menu-card"
            style={{ opacity: 0.6, cursor: "not-allowed" }}
          >
            <span className="menu-card-icon">🎓</span>
            <h3 className="menu-card-title">Learning Center</h3>
            <p className="menu-card-description">
              Comprehensive tutorials, theory, and educational resources. Coming
              soon...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
