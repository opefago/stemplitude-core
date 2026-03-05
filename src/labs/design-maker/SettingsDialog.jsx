import React from 'react';
import { X } from 'lucide-react';
import { useDesignStore } from './store';
import CustomSelect from './CustomSelect';

export default function SettingsDialog() {
  const settingsOpen = useDesignStore(s => s.settingsOpen);
  const units = useDesignStore(s => s.units);
  const zoomSpeed = useDesignStore(s => s.zoomSpeed);
  const backgroundColor = useDesignStore(s => s.backgroundColor);
  const snapIncrement = useDesignStore(s => s.snapIncrement);
  const shadowsEnabled = useDesignStore(s => s.shadowsEnabled);

  const setSettingsOpen = useDesignStore(s => s.setSettingsOpen);
  const setUnits = useDesignStore(s => s.setUnits);
  const setZoomSpeed = useDesignStore(s => s.setZoomSpeed);
  const setBackgroundColor = useDesignStore(s => s.setBackgroundColor);
  const setSnapIncrement = useDesignStore(s => s.setSnapIncrement);
  const toggleShadows = useDesignStore(s => s.toggleShadows);

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
            <CustomSelect
              value={units}
              onChange={(v) => setUnits(v)}
              options={[
                { value: 'mm', label: 'Millimeters (mm)' },
                { value: 'in', label: 'Inches (in)' },
              ]}
            />
          </div>

          <div className="dml-setting-row">
            <label>Default Snap</label>
            <CustomSelect
              value={snapIncrement}
              onChange={(v) => setSnapIncrement(Number(v))}
              options={[
                { value: 0, label: 'Off' },
                { value: 0.1, label: `0.1 ${units}` },
                { value: 0.25, label: `0.25 ${units}` },
                { value: 0.5, label: `0.5 ${units}` },
                { value: 1, label: `1 ${units}` },
                { value: 2, label: `2 ${units}` },
                { value: 5, label: `5 ${units}` },
                { value: 10, label: `10 ${units}` },
              ]}
            />
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
            <label>Shadows</label>
            <div className="dml-toggle" onClick={toggleShadows}>
              <input
                type="checkbox"
                checked={shadowsEnabled}
                readOnly
              />
              <span className="dml-toggle-label">{shadowsEnabled ? 'On' : 'Off'}</span>
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
