import React, { useEffect, useState } from 'react';
import Tip from './Tip';
import CustomSelect from './CustomSelect';
import {
  Grid3X3, Box, BoxSelect, Ruler, PencilRuler,
  Copy, Trash2, FlipHorizontal,
  AlignCenterHorizontal, AlignCenterVertical,
  Undo2, Redo2, LayoutGrid, Magnet, ArrowDownToLine,
} from 'lucide-react';
import { useDesignStore, getEffectiveSelectionIdsFromState } from './store';

export default function Toolbar() {
  const gridVisible = useDesignStore(s => s.gridVisible);
  const wireframe = useDesignStore(s => s.wireframe);
  const snapIncrement = useDesignStore(s => s.snapIncrement);
  const selectedIds = useDesignStore(s => s.selectedIds);

  const toggleGrid = useDesignStore(s => s.toggleGrid);
  const toggleWireframe = useDesignStore(s => s.toggleWireframe);
  const rulerVisible = useDesignStore(s => s.rulerVisible);
  const toggleRuler = useDesignStore(s => s.toggleRuler);
  const measureActive = useDesignStore(s => s.measureActive);
  const toggleMeasure = useDesignStore(s => s.toggleMeasure);
  const faceSnap = useDesignStore(s => s.faceSnap);
  const toggleFaceSnap = useDesignStore(s => s.toggleFaceSnap);
  const workplaneMode = useDesignStore(s => s.workplaneMode);
  const toggleWorkplaneMode = useDesignStore(s => s.toggleWorkplaneMode);
  const setSnapIncrement = useDesignStore(s => s.setSnapIncrement);
  const removeSelected = useDesignStore(s => s.removeSelected);
  const duplicateSelected = useDesignStore(s => s.duplicateSelected);
  const dropToFloor = useDesignStore(s => s.dropToFloor);
  const objects = useDesignStore(s => s.objects);

  const effectiveSelectedIds = getEffectiveSelectionIdsFromState({ objects, selectedIds });
  const selectionHasLocked = effectiveSelectedIds.some(id => {
    const o = objects.find(obj => obj.id === id);
    return o?.locked;
  });
  const mirrorMode = useDesignStore(s => s.mirrorMode);
  const toggleMirrorMode = useDesignStore(s => s.toggleMirrorMode);
  const arraySelected = useDesignStore(s => s.arraySelected);
  const setArrayPreview = useDesignStore(s => s.setArrayPreview);
  const clearArrayPreview = useDesignStore(s => s.clearArrayPreview);
  const alignObjects = useDesignStore(s => s.alignObjects);
  const undo = useDesignStore(s => s.undo);
  const redo = useDesignStore(s => s.redo);
  const canUndo = useDesignStore(s => s._past.length > 0);
  const canRedo = useDesignStore(s => s._future.length > 0);

  const [arrayOpen, setArrayOpen] = useState(false);
  const [arrayAxis, setArrayAxis] = useState('x');
  const [arrayCount, setArrayCount] = useState(3);
  const [arraySpacing, setArraySpacing] = useState(25);

  const hasSelection = selectedIds.length > 0;
  const hasMulti = selectedIds.length > 1;

  useEffect(() => {
    if (!arrayOpen || !hasSelection || selectionHasLocked) {
      clearArrayPreview();
      return;
    }
    setArrayPreview({
      axis: arrayAxis,
      count: Math.max(1, arrayCount),
      spacing: Number(arraySpacing) || 0,
    });
    return () => clearArrayPreview();
  }, [
    arrayOpen,
    hasSelection,
    selectionHasLocked,
    arrayAxis,
    arrayCount,
    arraySpacing,
    setArrayPreview,
    clearArrayPreview,
  ]);

  return (
    <div className="dml-toolbar">
      <div className="dml-toolbar-group">
        <Tip label="Undo" shortcut="Ctrl+Z">
          <button className="dml-tool-btn" onClick={undo} disabled={!canUndo}>
            <Undo2 size={20} />
          </button>
        </Tip>
        <Tip label="Redo" shortcut="Ctrl+Shift+Z">
          <button className="dml-tool-btn" onClick={redo} disabled={!canRedo}>
            <Redo2 size={20} />
          </button>
        </Tip>
      </div>

      <div className="dml-toolbar-sep" />

      <div className="dml-toolbar-group">
        <div className="dml-btn-joined">
          <Tip label="Solid View">
            <button
              className={`dml-joined-btn ${!wireframe ? 'active' : ''}`}
              onClick={() => { if (wireframe) toggleWireframe(); }}
            >
              <Box size={18} />
            </button>
          </Tip>
          <Tip label="Wireframe">
            <button
              className={`dml-joined-btn ${wireframe ? 'active' : ''}`}
              onClick={() => { if (!wireframe) toggleWireframe(); }}
            >
              <BoxSelect size={18} />
            </button>
          </Tip>
        </div>
        <div className="dml-toolbar-vsep" />
        <Tip label="Grid" shortcut="G">
          <button
            className={`dml-tool-btn ${gridVisible ? 'active' : ''}`}
            onClick={toggleGrid}
          >
            <Grid3X3 size={20} />
          </button>
        </Tip>
        <Tip label="Ruler">
          <button
            className={`dml-tool-btn ${rulerVisible ? 'active' : ''}`}
            onClick={toggleRuler}
          >
            <Ruler size={20} />
          </button>
        </Tip>
        <Tip label="Measure" shortcut="M">
          <button
            className={`dml-tool-btn ${measureActive ? 'active' : ''}`}
            onClick={toggleMeasure}
          >
            <PencilRuler size={20} />
          </button>
        </Tip>
        <Tip label="Snap to Face">
          <button
            className={`dml-tool-btn ${faceSnap ? 'active' : ''}`}
            onClick={toggleFaceSnap}
          >
            <Magnet size={20} />
          </button>
        </Tip>
        <Tip label="Follow Shape">
          <button
            className={`dml-tool-btn ${workplaneMode ? 'active' : ''}`}
            onClick={toggleWorkplaneMode}
            disabled={!hasSelection || selectedIds.length !== 1}
          >
            <span className="dml-tool-mini-text">FS</span>
          </button>
        </Tip>
      </div>

      <div className="dml-toolbar-sep" />

      <div className="dml-toolbar-group">
        <span className="dml-toolbar-label">Snap</span>
        <CustomSelect
          className="dml-snap-select"
          value={snapIncrement}
          onChange={(v) => setSnapIncrement(Number(v))}
          options={[
            { value: 0, label: 'Off' },
            { value: 0.1, label: '0.1mm' },
            { value: 0.25, label: '0.25mm' },
            { value: 0.5, label: '0.5mm' },
            { value: 1, label: '1mm' },
            { value: 2, label: '2mm' },
            { value: 5, label: '5mm' },
            { value: 10, label: '10mm' },
          ]}
        />
      </div>

      {hasSelection && (
        <>
          <div className="dml-toolbar-sep" />
          <div className="dml-toolbar-group">
            <Tip label="Drop to Floor">
              <button className="dml-tool-btn" onClick={dropToFloor} disabled={selectionHasLocked}>
                <ArrowDownToLine size={20} />
              </button>
            </Tip>
            <Tip label="Duplicate" shortcut="Ctrl+D">
              <button className="dml-tool-btn" onClick={duplicateSelected} disabled={selectionHasLocked}>
                <Copy size={20} />
              </button>
            </Tip>
            <Tip label="Mirror (Pick X/Y/Z in scene)">
              <button
                className={`dml-tool-btn ${mirrorMode ? 'active' : ''}`}
                onClick={toggleMirrorMode}
                disabled={selectionHasLocked}
              >
                <FlipHorizontal size={20} />
              </button>
            </Tip>
            <div className="dml-array-wrap">
              <Tip label="Linear Array">
                <button
                  className={`dml-tool-btn ${arrayOpen ? 'active' : ''}`}
                  onClick={() => {
                    if (arrayOpen) clearArrayPreview();
                    setArrayOpen(!arrayOpen);
                  }}
                  disabled={selectionHasLocked}
                >
                  <LayoutGrid size={20} />
                </button>
              </Tip>
              {arrayOpen && (
                <div className="dml-array-popover">
                  <div className="dml-array-row">
                    <label>Axis</label>
                    <CustomSelect
                      value={arrayAxis}
                      onChange={(v) => setArrayAxis(v)}
                      options={[
                        { value: 'x', label: 'X' },
                        { value: 'y', label: 'Y' },
                        { value: 'z', label: 'Z' },
                      ]}
                    />
                  </div>
                  <div className="dml-array-row">
                    <label>Count</label>
                    <input type="number" value={arrayCount} min={1} max={20} onChange={e => setArrayCount(Math.max(1, parseInt(e.target.value) || 1))} />
                  </div>
                  <div className="dml-array-row">
                    <label>Spacing</label>
                    <input type="number" value={arraySpacing} step={5} onChange={e => setArraySpacing(parseFloat(e.target.value) || 10)} />
                  </div>
                  <div className="dml-array-actions">
                    <button
                      className="dml-array-apply"
                      onClick={() => {
                        arraySelected(arrayAxis, arrayCount, arraySpacing);
                        clearArrayPreview();
                        setArrayOpen(false);
                      }}
                    >
                      Apply
                    </button>
                    <button
                      className="dml-array-cancel"
                      onClick={() => {
                        clearArrayPreview();
                        setArrayOpen(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            <Tip label="Delete" shortcut="Del">
              <button className="dml-tool-btn danger" onClick={removeSelected} disabled={selectionHasLocked}>
                <Trash2 size={20} />
              </button>
            </Tip>
          </div>
        </>
      )}

      {hasMulti && (
        <>
          <div className="dml-toolbar-sep" />
          <div className="dml-toolbar-group">
            <span className="dml-toolbar-label">Align</span>
            <Tip label="Align X">
              <button className="dml-tool-btn" onClick={() => alignObjects('x', 'center')}>
                <AlignCenterHorizontal size={20} />
              </button>
            </Tip>
            <Tip label="Align Y">
              <button className="dml-tool-btn" onClick={() => alignObjects('y', 'min')}>
                <AlignCenterVertical size={20} />
              </button>
            </Tip>
            <Tip label="Align Z">
              <button className="dml-tool-btn" onClick={() => alignObjects('z', 'center')}>
                <AlignCenterHorizontal size={20} />
              </button>
            </Tip>
          </div>
        </>
      )}
    </div>
  );
}
