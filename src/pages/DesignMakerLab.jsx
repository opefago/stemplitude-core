import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Tip from '../labs/design-maker/Tip';
import {
  Settings, Upload, Download, Share2, X, Merge, Scissors, Pencil, Waypoints,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';
import Scene, { setMarqueeActive } from '../labs/design-maker/Scene';
import ShapeLibrary from '../labs/design-maker/ShapeLibrary';
import Toolbar from '../labs/design-maker/Toolbar';
import ObjectProperties from '../labs/design-maker/ObjectProperties';
import SceneTree from '../labs/design-maker/SceneTree';
import SettingsDialog from '../labs/design-maker/SettingsDialog';
import ViewControls from '../labs/design-maker/ViewControls';
import { useDesignStore, dragCursor, sceneCamera, sceneInteracting } from '../labs/design-maker/store';
import { unionCSG, subtractCSG, intersectCSG } from '../labs/design-maker/csgUtils';
import './DesignMakerLab.css';

function createGeometryFromObj(obj) {
  const p = obj.geometry;
  switch (obj.type) {
    case 'box': case 'wall': case 'wedge':
      return new THREE.BoxGeometry(p.width, p.height, p.depth);
    case 'sphere':
      return new THREE.SphereGeometry(p.radius, p.widthSegments || 32, p.heightSegments || 32);
    case 'cylinder':
      return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, p.radialSegments || 32);
    case 'cone': case 'pyramid':
      return new THREE.ConeGeometry(p.radius, p.height, p.radialSegments || 32);
    case 'torus': case 'tube':
      return new THREE.TorusGeometry(p.radius, p.tube, p.radialSegments || 16, p.tubularSegments || 48);
    case 'hemisphere':
      return new THREE.SphereGeometry(p.radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    case 'imported':
      if (p.bufferGeometry) return p.bufferGeometry.clone();
      return new THREE.BoxGeometry(20, 20, 20);
    default:
      return new THREE.BoxGeometry(20, 20, 20);
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildExportScene(objects) {
  const scene = new THREE.Scene();
  objects.forEach(obj => {
    const geometry = createGeometryFromObj(obj);
    const material = new THREE.MeshStandardMaterial({ color: obj.color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...obj.position);
    mesh.rotation.set(...obj.rotation);
    mesh.scale.set(...obj.scale);
    scene.add(mesh);
  });
  return scene;
}

export default function DesignMakerLab() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const viewportRef = useRef(null);

  const projectName = useDesignStore(s => s.projectName);
  const isDirty = useDesignStore(s => s.isDirty);
  const objects = useDesignStore(s => s.objects);
  const selectedIds = useDesignStore(s => s.selectedIds);

  const setProjectName = useDesignStore(s => s.setProjectName);
  const setSettingsOpen = useDesignStore(s => s.setSettingsOpen);
  const removeSelected = useDesignStore(s => s.removeSelected);
  const duplicateSelected = useDesignStore(s => s.duplicateSelected);
  const selectAll = useDesignStore(s => s.selectAll);
  const clearSelection = useDesignStore(s => s.clearSelection);
  const setTransformMode = useDesignStore(s => s.setTransformMode);
  const toggleGrid = useDesignStore(s => s.toggleGrid);
  const addImportedObject = useDesignStore(s => s.addImportedObject);
  const replaceObjects = useDesignStore(s => s.replaceObjects);
  const setPendingDrop = useDesignStore(s => s.setPendingDrop);
  const clearDraggingShape = useDesignStore(s => s.clearDraggingShape);
  const undo = useDesignStore(s => s.undo);
  const redo = useDesignStore(s => s.redo);
  const dropToFloor = useDesignStore(s => s.dropToFloor);
  const toggleMeasure = useDesignStore(s => s.toggleMeasure);
  const saveProject = useDesignStore(s => s.saveProject);
  const loadProject = useDesignStore(s => s.loadProject);
  const newProject = useDesignStore(s => s.newProject);
  const deleteProject = useDesignStore(s => s.deleteProject);
  const getProjectList = useDesignStore(s => s.getProjectList);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projectList, setProjectList] = useState([]);
  const projectsRef = useRef(null);
  const [sidebarTab, setSidebarTab] = useState('properties');

  useEffect(() => {
    if (!projectsOpen) return;
    const handleClick = (e) => {
      if (projectsRef.current && !projectsRef.current.contains(e.target)) {
        setProjectsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [projectsOpen]);
  const [marquee, setMarquee] = useState(null);
  const marqueeStart = useRef(null);
  const MIN_MARQUEE = 5;

  const handleMarqueeDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (e.target.tagName !== 'CANVAS') return;
    if (useDesignStore.getState().draggingShape) return;
    if (sceneInteracting.active) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    marqueeStart.current = { x, y };
  }, []);

  const handleMarqueeMove = useCallback((e) => {
    if (!marqueeStart.current) return;
    if (useDesignStore.getState().draggingShape || sceneInteracting.active) {
      marqueeStart.current = null;
      setMarquee(null);
      setMarqueeActive(false);
      return;
    }
    const rect = viewportRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = Math.abs(x - marqueeStart.current.x);
    const dy = Math.abs(y - marqueeStart.current.y);
    if (dx > MIN_MARQUEE || dy > MIN_MARQUEE) {
      setMarqueeActive(true);
      setMarquee({
        x: Math.min(marqueeStart.current.x, x),
        y: Math.min(marqueeStart.current.y, y),
        w: dx,
        h: dy,
      });
    }
  }, []);

  const handleMarqueeUp = useCallback(() => {
    if (marquee && viewportRef.current && sceneCamera.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const cam = sceneCamera.current;
      const objs = useDesignStore.getState().objects;
      const hits = [];
      const v = new THREE.Vector3();
      for (const obj of objs) {
        v.set(...obj.position);
        v.project(cam);
        const sx = ((v.x + 1) / 2) * rect.width;
        const sy = ((1 - v.y) / 2) * rect.height;
        if (
          sx >= marquee.x && sx <= marquee.x + marquee.w &&
          sy >= marquee.y && sy <= marquee.y + marquee.h &&
          v.z >= -1 && v.z <= 1
        ) {
          hits.push(obj.id);
        }
      }
      if (hits.length > 0) {
        useDesignStore.setState({ selectedIds: hits });
      } else {
        clearSelection();
      }
    }
    marqueeStart.current = null;
    setMarquee(null);
    setTimeout(() => setMarqueeActive(false), 50);
  }, [marquee, clearSelection]);

  useEffect(() => {
    window.addEventListener('mouseup', handleMarqueeUp);
    return () => window.removeEventListener('mouseup', handleMarqueeUp);
  }, [handleMarqueeUp]);

  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => saveProject(), 2000);
    return () => clearTimeout(timer);
  }, [isDirty, objects, projectName, saveProject]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

      switch (e.key) {
        case 'z': case 'Z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
          }
          break;
        case 'Delete': case 'Backspace':
          removeSelected();
          break;
        case 't': case 'T':
          setTransformMode('translate');
          break;
        case 'r': case 'R':
          if (!e.ctrlKey && !e.metaKey) setTransformMode('rotate');
          break;
        case 's': case 'S':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); saveProject(); }
          else setTransformMode('scale');
          break;
        case 'd': case 'D':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); duplicateSelected(); }
          break;
        case 'a': case 'A':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); selectAll(); }
          break;
        case 'g': case 'G':
          toggleGrid();
          break;
        case 'f': case 'F':
          if (!e.ctrlKey && !e.metaKey) dropToFloor();
          break;
        case 'm': case 'M':
          if (!e.ctrlKey && !e.metaKey) toggleMeasure();
          break;
        case 'Escape':
          clearSelection();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [removeSelected, setTransformMode, duplicateSelected, selectAll, clearSelection, toggleGrid, dropToFloor, toggleMeasure, saveProject]);

  const handleImport = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        if (ext === 'stl') {
          const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
          const loader = new STLLoader();
          const geometry = loader.parse(event.target.result);
          geometry.center();
          geometry.computeVertexNormals();
          addImportedObject(geometry, file.name.replace(`.${ext}`, ''));
        } else if (ext === 'obj') {
          const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
          const loader = new OBJLoader();
          const group = loader.parse(event.target.result);
          group.traverse((child) => {
            if (child.isMesh) {
              child.geometry.center();
              addImportedObject(child.geometry, file.name.replace(`.${ext}`, ''));
            }
          });
        }
      } catch (err) {
        console.error('Import failed:', err);
      }
    };

    if (ext === 'stl') reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
    e.target.value = '';
  }, [addImportedObject]);

  const handleExportSTL = useCallback(async () => {
    if (objects.length === 0) return;
    const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
    const exporter = new STLExporter();
    const scene = buildExportScene(objects);
    const result = exporter.parse(scene, { binary: true });
    downloadBlob(new Blob([result], { type: 'application/octet-stream' }), `${projectName}.stl`);
    setExportOpen(false);
  }, [objects, projectName]);

  const handleExportGLB = useCallback(async () => {
    if (objects.length === 0) return;
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    const exporter = new GLTFExporter();
    const scene = buildExportScene(objects);
    exporter.parse(
      scene,
      (gltf) => {
        downloadBlob(new Blob([gltf], { type: 'application/octet-stream' }), `${projectName}.glb`);
      },
      (error) => console.error('GLB export failed:', error),
      { binary: true }
    );
    setExportOpen(false);
  }, [objects, projectName]);

  const handleUnion = useCallback(() => {
    if (selectedIds.length < 2) return;
    const selected = objects.filter(o => selectedIds.includes(o.id));
    try {
      const result = unionCSG(selected);
      if (result) {
        replaceObjects(selectedIds, {
          id: uuidv4(),
          name: 'Union',
          type: 'imported',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: selected[0].color,
          isHole: false,
          visible: true,
          geometry: { bufferGeometry: result.geometry },
        });
      }
    } catch (err) {
      console.error('Union failed:', err);
    }
  }, [selectedIds, objects, replaceObjects]);

  const handleSubtract = useCallback(() => {
    if (selectedIds.length < 2) return;
    const selected = objects.filter(o => selectedIds.includes(o.id));
    const target = selected[0];
    const tools = selected.slice(1);
    try {
      const result = subtractCSG(target, tools);
      if (result) {
        replaceObjects(selectedIds, {
          id: uuidv4(),
          name: 'Subtraction',
          type: 'imported',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: target.color,
          isHole: false,
          visible: true,
          geometry: { bufferGeometry: result.geometry },
        });
      }
    } catch (err) {
      console.error('Subtract failed:', err);
    }
  }, [selectedIds, objects, replaceObjects]);

  const handleIntersect = useCallback(() => {
    if (selectedIds.length < 2) return;
    const selected = objects.filter(o => selectedIds.includes(o.id));
    try {
      const result = intersectCSG(selected);
      if (result) {
        replaceObjects(selectedIds, {
          id: uuidv4(),
          name: 'Intersection',
          type: 'imported',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: selected[0].color,
          isHole: false,
          visible: true,
          geometry: { bufferGeometry: result.geometry },
        });
      }
    } catch (err) {
      console.error('Intersect failed:', err);
    }
  }, [selectedIds, objects, replaceObjects]);

  return (
    <div className="dml-container">
      <header className="dml-header">
        <div className="dml-header-left">
          <div className="dml-logo" onClick={() => navigate('/playground')}>
            <span className="dml-logo-icon">◆</span>
            <span className="dml-logo-text">Design Maker</span>
          </div>
          <div className="dml-divider" />
          <div className="dml-project-info" ref={projectsRef}>
            <div className="dml-project-name-wrap">
              <input
                className="dml-project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                spellCheck={false}
              />
              <Pencil size={12} className="dml-edit-icon" />
            </div>
            <div className="dml-save-row">
              <span className={`dml-save-indicator ${isDirty ? 'unsaved' : 'saved'}`}>
                {isDirty ? '● Unsaved' : '✓ Saved'}
              </span>
              <button className="dml-projects-btn" onClick={() => { setProjectList(getProjectList()); setProjectsOpen(!projectsOpen); }}>
                My Projects ▾
              </button>
            </div>
            {projectsOpen && (
              <div className="dml-projects-dropdown">
                <button className="dml-projects-item dml-projects-new" onClick={() => { newProject(); setProjectsOpen(false); }}>
                  + New Project
                </button>
                {projectList.length === 0 && <p className="dml-projects-empty">No saved projects</p>}
                {projectList.map(p => (
                  <div key={p.id} className="dml-projects-item">
                    <button className="dml-projects-item-name" onClick={() => { loadProject(p.id); setProjectsOpen(false); }}>
                      {p.name}
                      <span className="dml-projects-item-date">{new Date(p.updatedAt).toLocaleDateString()}</span>
                    </button>
                    <button className="dml-projects-item-del" onClick={(e) => { e.stopPropagation(); deleteProject(p.id); setProjectList(getProjectList()); }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="dml-header-center">
          <span className="dml-object-count">{objects.length} object{objects.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="dml-header-right">
          <input
            ref={fileInputRef}
            type="file"
            accept=".stl,.obj"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
          <Tip label="Import STL/OBJ">
            <button className="dml-header-btn" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              <span>Import</span>
            </button>
          </Tip>

          <div className="dml-dropdown" onMouseLeave={() => setExportOpen(false)}>
            <Tip label="Export" disabled={exportOpen}>
              <button
                className="dml-header-btn"
                onClick={() => setExportOpen(!exportOpen)}
              >
                <Download size={16} />
                <span>Export</span>
              </button>
            </Tip>
            {exportOpen && (
              <div className="dml-dropdown-menu">
                <button onClick={handleExportSTL}>Export as STL</button>
                <button onClick={handleExportGLB}>Export as GLB</button>
              </div>
            )}
          </div>

          <Tip label="Share">
            <button className="dml-header-btn" onClick={() => alert('Share link copied!')}>
              <Share2 size={16} />
              <span>Share</span>
            </button>
          </Tip>

          <div className="dml-divider" />

          <Tip label="Settings">
            <button className="dml-header-btn icon-only" onClick={() => setSettingsOpen(true)}>
              <Settings size={18} />
            </button>
          </Tip>
          <Tip label="Exit to Playground">
            <button className="dml-header-btn dml-exit-btn icon-only" onClick={() => navigate('/playground')}>
              <X size={18} />
            </button>
          </Tip>
        </div>
      </header>

      <div className="dml-main">
        <div
          className={`dml-viewport-wrap ${dragOver ? 'drag-over' : ''}`}
          ref={viewportRef}
          onMouseDown={handleMarqueeDown}
          onMouseMove={handleMarqueeMove}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (viewportRef.current) {
              const rect = viewportRef.current.getBoundingClientRect();
              dragCursor.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
              dragCursor.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
              dragCursor.active = true;
            }
            setDragOver(true);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            if (viewportRef.current && !viewportRef.current.contains(e.relatedTarget)) {
              dragCursor.active = false;
              setDragOver(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragCursor.active = false;
            setDragOver(false);
            clearDraggingShape();
            const raw = e.dataTransfer.getData('application/x-design-shape');
            if (!raw) return;
            try {
              const data = JSON.parse(raw);
              const rect = viewportRef.current.getBoundingClientRect();
              const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
              const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
              setPendingDrop({ ...data, ndc: { x: ndcX, y: ndcY } });
            } catch { /* ignore bad data */ }
          }}
        >
          <Scene />

          {marquee && (
            <div
              className="dml-marquee"
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.w,
                height: marquee.h,
              }}
            />
          )}

          <div className="dml-viewport-top-left">
            <ShapeLibrary />
          </div>

          <div className="dml-viewport-toolbar">
            <Toolbar />
          </div>

          <div className="dml-viewport-right">
            <ViewControls />
          </div>

          {selectedIds.length >= 2 && (
            <div className="dml-csg-float">
              <button className="dml-csg-btn dml-csg-union" onClick={handleUnion}>
                <Merge size={16} />
                <span>Union</span>
              </button>
              <button className="dml-csg-btn dml-csg-subtract" onClick={handleSubtract}>
                <Scissors size={16} />
                <span>Subtract</span>
              </button>
              <button className="dml-csg-btn dml-csg-intersect" onClick={handleIntersect}>
                <Waypoints size={16} />
                <span>Intersect</span>
              </button>
              <span className="dml-csg-hint">First selected = target</span>
            </div>
          )}
        </div>

        <div className="dml-sidebar-right">
          <div className="dml-sidebar-tabs">
            <button
              className={`dml-sidebar-tab ${sidebarTab === 'properties' ? 'active' : ''}`}
              onClick={() => setSidebarTab('properties')}
            >Properties</button>
            <button
              className={`dml-sidebar-tab ${sidebarTab === 'scene' ? 'active' : ''}`}
              onClick={() => setSidebarTab('scene')}
            >Scene Tree</button>
          </div>
          <div className="dml-sidebar-body">
            {sidebarTab === 'properties' ? <ObjectProperties /> : <SceneTree />}
          </div>
        </div>
      </div>

      <SettingsDialog />
    </div>
  );
}
