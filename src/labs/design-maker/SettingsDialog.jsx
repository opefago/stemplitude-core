import React from 'react';
import { X } from 'lucide-react';
import { useDesignStore } from './store';

export default function SettingsDialog() {
  const settingsOpen = useDesignStore(s => s.settingsOpen);
  const units = useDesignStore(s => s.units);
  const zoomSpeed = useDesignStore(s => s.zoomSpeed);
  const backgroundColor = useDesignStore(s => s.backgroundColor);
  const snapIncrement = useDesignStore(s => s.snapIncrement);

  const setSettingsOpen = useDesignStore(s => s.setSettingsOpen);
  const setUnits = useDesignStore(s => s.setUnits);
  const setZoomSpeed = useDesignStore(s => s.setZoomSpeed);
  const setBackgroundColor = useDesignStore(s => s.setBackgroundColor);
  const setSnapIncrement = useDesignStore(s => s.setSnapIncrement);

  if (!settingsOpen) return null;

  return (
    <div className="dml-modal-overlay" onClick={() => setSettingsOpen(false)}>
      <div className="dml-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dml-modal-header">
          <h2>Settings</h2>
          <button className="dml-modal-close" onClick={() => setSettingsOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="dml-modal-body">
          <div className="dml-setting-row">
            <label>Units</label>
            <select value={units} onChange={(e) => setUnits(e.target.value)}>
              <option value="mm">Millimeters (mm)</option>
              <option value="in">Inches (in)</option>
            </select>
          </div>

          <div className="dml-setting-row">
            <label>Default Snap</label>
            <select value={snapIncrement} onChange={(e) => setSnapIncrement(Number(e.target.value))}>
              <option value={0.1}>0.1 {units}</option>
              <option value={1}>1 {units}</option>
              <option value={5}>5 {units}</option>
              <option value={10}>10 {units}</option>
            </select>
          </div>

          <div className="dml-setting-row">
            <label>Zoom Speed</label>
            <div className="dml-range-row">
              <input
                type="range"
                min={0.1}
                max={3}
                step={0.1}
                value={zoomSpeed}
                onChange={(e) => setZoomSpeed(parseFloat(e.target.value))}
              />
              <span className="dml-range-value">{zoomSpeed.toFixed(1)}</span>
            </div>
          </div>

          <div className="dml-setting-row">
            <label>Background Color</label>
            <div className="dml-bg-picker">
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
              />
              <span>{backgroundColor}</span>
            </div>
          </div>

          <div className="dml-setting-row">
            <label>Mouse Controls</label>
            <div className="dml-mouse-info">
              <div><kbd>Scroll</kbd> Zoom</div>
              <div><kbd>Right-Click Drag</kbd> Orbit</div>
              <div><kbd>Middle-Click Drag</kbd> Pan</div>
              <div><kbd>Left-Click</kbd> Select</div>
              <div><kbd>Shift + Click</kbd> Multi-select</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
