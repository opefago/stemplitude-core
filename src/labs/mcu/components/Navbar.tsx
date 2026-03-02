import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

interface NavbarProps {
  currentSection: string;
  showSimulationControls?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentSection,
  showSimulationControls = false,
}) => {
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const navigate = useNavigate();

  const handleSave = () => {
    // Trigger save functionality
    const event = new CustomEvent("stemplitude-save");
    window.dispatchEvent(event);
    setShowFileMenu(false);
  };

  const handleLoad = () => {
    // Trigger load functionality
    const event = new CustomEvent("stemplitude-load");
    window.dispatchEvent(event);
    setShowFileMenu(false);
  };

  const handleExport = () => {
    // Trigger export functionality
    const event = new CustomEvent("stemplitude-export");
    window.dispatchEvent(event);
    setShowFileMenu(false);
  };

  const handleImport = () => {
    // Trigger import functionality
    const event = new CustomEvent("stemplitude-import");
    window.dispatchEvent(event);
    setShowFileMenu(false);
  };

  const handleUndo = () => {
    // Trigger undo functionality
    const event = new CustomEvent("stemplitude-undo");
    window.dispatchEvent(event);
    setShowEditMenu(false);
  };

  const handleRedo = () => {
    // Trigger redo functionality
    const event = new CustomEvent("stemplitude-redo");
    window.dispatchEvent(event);
    setShowEditMenu(false);
  };

  const handleClear = () => {
    if (confirm("Clear all components? This cannot be undone.")) {
      const event = new CustomEvent("stemplitude-clear");
      window.dispatchEvent(event);
    }
    setShowEditMenu(false);
  };

  const handleZoomIn = () => {
    const event = new CustomEvent("stemplitude-zoom-in");
    window.dispatchEvent(event);
    setShowViewMenu(false);
  };

  const handleZoomOut = () => {
    const event = new CustomEvent("stemplitude-zoom-out");
    window.dispatchEvent(event);
    setShowViewMenu(false);
  };

  const handleRecenter = () => {
    const event = new CustomEvent("stemplitude-recenter");
    window.dispatchEvent(event);
    setShowViewMenu(false);
  };

  const handleShowObjectives = () => {
    const event = new CustomEvent("stemplitude-show-objectives");
    window.dispatchEvent(event);
    setShowViewMenu(false);
  };

  // Simulation control handlers
  const handleStartStop = () => {
    const event = new CustomEvent("stemplitude-toggle-simulation");
    window.dispatchEvent(event);
    setIsSimulationRunning(!isSimulationRunning);
  };

  const handleReset = () => {
    const event = new CustomEvent("stemplitude-reset-simulation");
    window.dispatchEvent(event);
    setIsSimulationRunning(false);
  };

  const handleAnalyze = () => {
    const event = new CustomEvent("stemplitude-analyze-circuit");
    window.dispatchEvent(event);
  };

  const closeAllMenus = () => {
    setShowFileMenu(false);
    setShowEditMenu(false);
    setShowViewMenu(false);
    setShowHelpMenu(false);
  };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-left">
          <Link to="/gears" className="navbar-brand" onClick={closeAllMenus}>
            ⚙️ STEMplitude
          </Link>
          <span className="navbar-section">{currentSection}</span>

          {/* Menu items moved to left side after logo */}
          <div className="navbar-menu">
            <div className="navbar-menu-item">
              <button
                className="navbar-menu-button"
                onClick={() => {
                  closeAllMenus();
                  setShowFileMenu(!showFileMenu);
                }}
              >
                File
              </button>
              {showFileMenu && (
                <div className="navbar-dropdown">
                  <button onClick={handleSave}>💾 Save Project</button>
                  <button onClick={handleLoad}>📂 Load Project</button>
                  <hr />
                  <button onClick={handleExport}>📤 Export</button>
                  <button onClick={handleImport}>📥 Import</button>
                  <hr />
                  <Link to="/gears" onClick={closeAllMenus}>
                    🏠 Back to Menu
                  </Link>
                </div>
              )}
            </div>

            <div className="navbar-menu-item">
              <button
                className="navbar-menu-button"
                onClick={() => {
                  closeAllMenus();
                  setShowEditMenu(!showEditMenu);
                }}
              >
                Edit
              </button>
              {showEditMenu && (
                <div className="navbar-dropdown">
                  <button onClick={handleUndo}>↶ Undo</button>
                  <button onClick={handleRedo}>↷ Redo</button>
                  <hr />
                  <button onClick={handleClear}>🗑️ Clear All</button>
                </div>
              )}
            </div>

            <div className="navbar-menu-item">
              <button
                className="navbar-menu-button"
                onClick={() => {
                  closeAllMenus();
                  setShowViewMenu(!showViewMenu);
                }}
              >
                View
              </button>
              {showViewMenu && (
                <div className="navbar-dropdown">
                  <button onClick={handleZoomIn}>🔍 Zoom In</button>
                  <button onClick={handleZoomOut}>🔍 Zoom Out</button>
                  <button onClick={handleRecenter}>🎯 Recenter</button>
                  <hr />
                  <button onClick={handleShowObjectives}>
                    📋 Show Objectives
                  </button>
                </div>
              )}
            </div>

            <div className="navbar-menu-item">
              <button
                className="navbar-menu-button"
                onClick={() => {
                  closeAllMenus();
                  setShowHelpMenu(!showHelpMenu);
                }}
              >
                Help
              </button>
              {showHelpMenu && (
                <div className="navbar-dropdown">
                  <button
                    onClick={() => {
                      alert(
                        "Use the toolbar to drag components onto the canvas. Click the play button to start simulation."
                      );
                      setShowHelpMenu(false);
                    }}
                  >
                    ❓ Quick Help
                  </button>
                  <button
                    onClick={() => {
                      window.open(
                        "https://github.com/your-repo/stemplitude",
                        "_blank"
                      );
                      setShowHelpMenu(false);
                    }}
                  >
                    📚 Documentation
                  </button>
                  <hr />
                  <button
                    onClick={() => {
                      alert(
                        "STEMplitude v1.0 - Interactive STEM Learning Platform"
                      );
                      setShowHelpMenu(false);
                    }}
                  >
                    ℹ️ About
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Simulation Controls - Right Side */}
        {showSimulationControls && (
          <div className="navbar-simulation-controls">
            <button
              className={`sim-control-btn ${isSimulationRunning ? "stop" : "start"}`}
              onClick={handleStartStop}
              title={
                isSimulationRunning ? "Stop Simulation" : "Start Simulation"
              }
            >
              <img
                src={
                  isSimulationRunning ? "/assets/stop.svg" : "/assets/play.svg"
                }
                alt={isSimulationRunning ? "Stop" : "Start"}
                style={{
                  width: "16px",
                  height: "16px",
                  filter: "brightness(0) saturate(100%) invert(100%)",
                }}
              />
              <span>{isSimulationRunning ? "Stop" : "Start"}</span>
            </button>
            <button
              className="sim-control-btn analyze"
              onClick={handleAnalyze}
              title="Analyze Circuit"
            >
              <img
                src="/assets/toolbar/active.svg"
                alt="Analyze"
                style={{
                  width: "16px",
                  height: "16px",
                  filter: "brightness(0) saturate(100%) invert(100%)",
                }}
              />
              <span>Analyze</span>
            </button>
          </div>
        )}
      </nav>

      {/* Overlay to close menus when clicking outside */}
      {(showFileMenu || showEditMenu || showViewMenu || showHelpMenu) && (
        <div className="navbar-overlay" onClick={closeAllMenus}></div>
      )}

      <style>{`
        .navbar {
          height: 40px;
          background: linear-gradient(135deg, #2c3e50, #34495e);
          border-bottom: 1px solid #3498db;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1rem;
          color: white;
          font-size: 14px;
          position: relative;
          z-index: 1000;
        }

        .navbar-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .navbar-brand {
          font-weight: bold;
          color: #3498db;
          text-decoration: none;
          transition: color 0.3s ease;
        }

        .navbar-brand:hover {
          color: #5dade2;
        }

        .navbar-section {
          color: #ecf0f1;
          font-size: 13px;
        }

        .navbar-menu {
          display: flex;
          align-items: center;
          margin-left: 2rem;
        }

        .navbar-menu-item {
          position: relative;
        }

        .navbar-menu-button {
          background: none;
          border: none;
          color: white;
          padding: 0.5rem 1rem;
          cursor: pointer;
          transition: background-color 0.3s ease;
          border-radius: 4px;
        }

        .navbar-menu-button:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .navbar-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          background: linear-gradient(135deg, #34495e, #2c3e50);
          border: 1px solid #3498db;
          border-radius: 6px;
          min-width: 180px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          z-index: 1001;
          overflow: hidden;
        }

        .navbar-dropdown button,
        .navbar-dropdown a {
          display: block;
          width: 100%;
          padding: 0.75rem 1rem;
          background: none;
          border: none;
          color: white;
          text-align: left;
          cursor: pointer;
          transition: background-color 0.3s ease;
          text-decoration: none;
          font-size: 13px;
        }

        .navbar-dropdown button:hover,
        .navbar-dropdown a:hover {
          background: rgba(52, 152, 219, 0.2);
        }

        .navbar-dropdown hr {
          margin: 0;
          border: none;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .navbar-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 999;
          background: transparent;
        }

        .navbar-simulation-controls {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .sim-control-btn {
          background: linear-gradient(135deg, #3498db, #2980b9);
          border: 1.5px solid rgba(255, 255, 255, 0.2);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.3s ease;
          box-shadow: 0 3px 6px rgba(0, 0, 0, 0.25);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 85px;
        }

        .sim-control-btn:hover {
          background: linear-gradient(135deg, #5dade2, #3498db);
          transform: translateY(-2px);
          box-shadow: 0 5px 12px rgba(0, 0, 0, 0.35);
        }

        .sim-control-btn:active {
          transform: translateY(0);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .sim-control-btn.start {
          background: linear-gradient(135deg, #27ae60, #229954);
          border-color: rgba(255, 255, 255, 0.25);
        }

        .sim-control-btn.start:hover {
          background: linear-gradient(135deg, #58d68d, #27ae60);
        }

        .sim-control-btn.stop {
          background: linear-gradient(135deg, #e74c3c, #c0392b);
          border-color: rgba(255, 255, 255, 0.25);
        }

        .sim-control-btn.stop:hover {
          background: linear-gradient(135deg, #ec7063, #e74c3c);
        }

        .sim-control-btn.analyze {
          background: linear-gradient(135deg, #f39c12, #e67e22);
          border-color: rgba(255, 255, 255, 0.25);
        }

        .sim-control-btn.analyze:hover {
          background: linear-gradient(135deg, #f7dc6f, #f39c12);
        }

        @media (max-width: 768px) {
          .navbar {
            padding: 0 0.5rem;
          }

          .navbar-section {
            display: none;
          }

          .navbar-menu-button {
            padding: 0.5rem 0.75rem;
            font-size: 13px;
          }

          .navbar-simulation-controls {
            gap: 0.5rem;
          }

          .sim-control-btn {
            padding: 0.4rem 0.75rem;
            font-size: 12px;
            min-width: 70px;
          }
          
          .sim-control-btn img {
            width: 14px;
            height: 14px;
          }
        }
      `}</style>
    </>
  );
};
