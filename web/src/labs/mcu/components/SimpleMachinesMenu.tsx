import React from "react";
import { Link } from "react-router-dom";

export const SimpleMachinesMenu: React.FC = () => {
  return (
    <div className="menu-container">
      <Link to="/" className="back-button">
        ← Back to Main Menu
      </Link>

      <div className="menu-content">
        <h1 className="menu-title">Simple Machines</h1>
        <p className="menu-subtitle">Fundamental Mechanical Components</p>
        <p className="menu-description">
          Master the basic building blocks of mechanical engineering. Each
          section provides interactive simulations and progressive learning
          experiences.
        </p>

        <div className="menu-grid">
          <Link to="/gears" className="menu-card">
            <span className="menu-card-icon">⚙️</span>
            <h3 className="menu-card-title">Gears & Power Transmission</h3>
            <p className="menu-card-description">
              Learn about gears, motors, belts, and power transmission systems.
              Interactive lessons from basic motors to complex forklift
              mechanisms.
            </p>
          </Link>

          <div
            className="menu-card"
            style={{ opacity: 0.6, cursor: "not-allowed" }}
          >
            <span className="menu-card-icon">🔗</span>
            <h3 className="menu-card-title">Levers & Linkages</h3>
            <p className="menu-card-description">
              Explore mechanical advantage through levers, linkages, and
              mechanical systems. Coming soon...
            </p>
          </div>

          <div
            className="menu-card"
            style={{ opacity: 0.6, cursor: "not-allowed" }}
          >
            <span className="menu-card-icon">🔄</span>
            <h3 className="menu-card-title">Wheels & Axles</h3>
            <p className="menu-card-description">
              Understand rotational motion, torque, and wheel-based mechanical
              systems. Coming soon...
            </p>
          </div>

          <div
            className="menu-card"
            style={{ opacity: 0.6, cursor: "not-allowed" }}
          >
            <span className="menu-card-icon">📐</span>
            <h3 className="menu-card-title">Inclined Planes</h3>
            <p className="menu-card-description">
              Study ramps, wedges, screws, and the physics of inclined surfaces.
              Coming soon...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
