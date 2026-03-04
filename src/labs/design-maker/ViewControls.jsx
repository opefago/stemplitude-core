import React from 'react';
import Tippy from '@tippyjs/react';
import { Home, Maximize, Plus, Minus, Box, Cuboid } from 'lucide-react';
import { useDesignStore } from './store';

export default function ViewControls() {
  const cameraMode = useDesignStore(s => s.cameraMode);
  const setCameraMode = useDesignStore(s => s.setCameraMode);
  const cameraHome = useDesignStore(s => s.cameraHome);
  const cameraFit = useDesignStore(s => s.cameraFit);
  const zoomIn = useDesignStore(s => s.zoomIn);
  const zoomOut = useDesignStore(s => s.zoomOut);

  return (
    <div className="dml-view-controls">
      <Tippy content="Home View" placement="left">
        <button className="dml-vc-btn" onClick={cameraHome}>
          <Home size={18} />
        </button>
      </Tippy>

      <Tippy content="Fit to View" placement="left">
        <button className="dml-vc-btn" onClick={cameraFit}>
          <Maximize size={18} />
        </button>
      </Tippy>

      <div className="dml-vc-sep" />

      <Tippy content="Zoom In" placement="left">
        <button className="dml-vc-btn" onClick={zoomIn}>
          <Plus size={18} />
        </button>
      </Tippy>
      <Tippy content="Zoom Out" placement="left">
        <button className="dml-vc-btn" onClick={zoomOut}>
          <Minus size={18} />
        </button>
      </Tippy>

      <div className="dml-vc-sep" />

      <Tippy content={cameraMode === 'perspective' ? 'Switch to Orthographic' : 'Switch to Perspective'} placement="left">
        <button
          className={`dml-vc-btn dml-vc-cube ${cameraMode === 'orthographic' ? 'active' : ''}`}
          onClick={() => setCameraMode(cameraMode === 'perspective' ? 'orthographic' : 'perspective')}
        >
          {cameraMode === 'perspective' ? <Cuboid size={20} /> : <Box size={20} />}
        </button>
      </Tippy>
    </div>
  );
}
