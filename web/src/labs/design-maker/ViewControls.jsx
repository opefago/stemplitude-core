import React from 'react';
import Tip from './Tip';
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
      <Tip label="Home" placement="left">
        <button className="dml-vc-btn" onClick={cameraHome}>
          <Home size={20} />
        </button>
      </Tip>

      <Tip label="Fit All" placement="left">
        <button className="dml-vc-btn" onClick={cameraFit}>
          <Maximize size={20} />
        </button>
      </Tip>

      <div className="dml-vc-sep" />

      <Tip label="Zoom In" placement="left">
        <button className="dml-vc-btn" onClick={zoomIn}>
          <Plus size={20} />
        </button>
      </Tip>
      <Tip label="Zoom Out" placement="left">
        <button className="dml-vc-btn" onClick={zoomOut}>
          <Minus size={20} />
        </button>
      </Tip>

      <div className="dml-vc-sep" />

      <Tip label={cameraMode === 'perspective' ? 'Orthographic' : 'Perspective'} placement="left">
        <button
          className={`dml-vc-btn dml-vc-cube ${cameraMode === 'orthographic' ? 'active' : ''}`}
          onClick={() => setCameraMode(cameraMode === 'perspective' ? 'orthographic' : 'perspective')}
        >
          {cameraMode === 'perspective' ? <Cuboid size={22} /> : <Box size={22} />}
        </button>
      </Tip>
    </div>
  );
}
