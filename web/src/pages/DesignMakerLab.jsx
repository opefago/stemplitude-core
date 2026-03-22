import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLabSession } from '../features/labs/useLabSession';
import RichTip from '../labs/design-maker/RichTip';
import TC from '../labs/design-maker/tooltipContent';
import {
  Settings, Upload, Download, Share2, X, Pencil,
  FolderOpen, ChevronDown, Search,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';
import Scene, { setMarqueeActive } from '../labs/design-maker/Scene';
import { createGeometry } from '../labs/design-maker/geometryFactory';
import { getRawExtents } from '../labs/design-maker/dimensions';
import ShapeLibrary from '../labs/design-maker/ShapeLibrary';
import Toolbar from '../labs/design-maker/Toolbar';
import ObjectProperties from '../labs/design-maker/ObjectProperties';
import SceneTree from '../labs/design-maker/SceneTree';
import SettingsDialog from '../labs/design-maker/SettingsDialog';
import ViewControls from '../labs/design-maker/ViewControls';
import {
  useDesignStore,
  dragCursor,
  sceneCamera,
  sceneInteracting,
  getEffectiveSelectionIdsFromState,
} from '../labs/design-maker/store';
import { unionCSG, mergeCSG, subtractCSG, intersectCSG } from '../labs/design-maker/csgUtils';
import './DesignMakerLab.css';

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
  const _pos = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const _scale = new THREE.Vector3();
  const _euler = new THREE.Euler();
  const _matrix = new THREE.Matrix4();

  objects.forEach(obj => {
    const srcGeo = createGeometry(obj.type, obj.geometry);
    const geometry = srcGeo.clone();
    const material = new THREE.MeshStandardMaterial({ color: obj.color });

    _pos.set(...obj.position);
    _euler.set(...obj.rotation);
    _quat.setFromEuler(_euler);
    _scale.set(...obj.scale);
    _matrix.compose(_pos, _quat, _scale);
    geometry.applyMatrix4(_matrix);

    const negCount = obj.scale.filter(s => s < 0).length;
    if (negCount % 2 === 1) {
      const idx = geometry.index;
      if (idx) {
        const arr = idx.array;
        for (let i = 0; i < arr.length; i += 3) {
          const tmp = arr[i];
          arr[i] = arr[i + 2];
          arr[i + 2] = tmp;
        }
        idx.needsUpdate = true;
      }
    }
    geometry.computeVertexNormals();

    scene.add(new THREE.Mesh(geometry, material));
  });
  return scene;
}

export default function DesignMakerLab() {
  const navigate = useNavigate();
  const { exitLab } = useLabSession();
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
  const setSelectedIds = useDesignStore(s => s.setSelectedIds);
  const setTransformMode = useDesignStore(s => s.setTransformMode);
  const toggleGrid = useDesignStore(s => s.toggleGrid);
  const addImportedObject = useDesignStore(s => s.addImportedObject);
  const replaceObjects = useDesignStore(s => s.replaceObjects);
  const setPendingDrop = useDesignStore(s => s.setPendingDrop);
  const clearDraggingShape = useDesignStore(s => s.clearDraggingShape);
  const undo = useDesignStore(s => s.undo);
  const redo = useDesignStore(s => s.redo);
  const dropToFloor = useDesignStore(s => s.dropToFloor);
  const groupSelected = useDesignStore(s => s.groupSelected);
  const ungroupSelected = useDesignStore(s => s.ungroupSelected);
  const toggleMeasure = useDesignStore(s => s.toggleMeasure);
  const saveProject = useDesignStore(s => s.saveProject);
  const loadProject = useDesignStore(s => s.loadProject);
  const newProject = useDesignStore(s => s.newProject);
  const deleteProject = useDesignStore(s => s.deleteProject);
  const getProjectList = useDesignStore(s => s.getProjectList);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projectList, setProjectList] = useState([]);
  const projectsRef = useRef(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [dialogSearch, setDialogSearch] = useState('');
  const [dialogPage, setDialogPage] = useState(0);
  const [dialogProjects, setDialogProjects] = useState([]);
  const DIALOG_PAGE_SIZE = 8;
  const filteredDialogProjects = dialogProjects.filter(p =>
    p.name.toLowerCase().includes(dialogSearch.toLowerCase())
  );
  const totalDialogPages = Math.max(1, Math.ceil(filteredDialogProjects.length / DIALOG_PAGE_SIZE));
  const paginatedDialogProjects = filteredDialogProjects.slice(
    dialogPage * DIALOG_PAGE_SIZE,
    (dialogPage + 1) * DIALOG_PAGE_SIZE
  );
  const [sidebarTab, setSidebarTab] = useState('properties');

  useEffect(() => {
    if (!projectsOpen) return;
    const handleClick = (e) => {
      if (projectsRef.current && !projectsRef.current.contains(e.target)) {
        setProjectsOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [projectsOpen]);

  useEffect(() => {
    if (projectDialogOpen) {
      setDialogProjects(getProjectList());
      setDialogSearch('');
      setDialogPage(0);
    }
  }, [projectDialogOpen, getProjectList]);

  useEffect(() => {
    if (!projectDialogOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') setProjectDialogOpen(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [projectDialogOpen]);

  const saveBeforeProjectSwitch = useCallback(async () => {
    if (useDesignStore.getState().isDirty) {
      await saveProject();
    }
  }, [saveProject]);

  const handleOpenProject = useCallback(async (id) => {
    await saveBeforeProjectSwitch();
    await loadProject(id);
  }, [saveBeforeProjectSwitch, loadProject]);

  const handleNewProject = useCallback(async () => {
    await saveBeforeProjectSwitch();
    newProject();
  }, [saveBeforeProjectSwitch, newProject]);

  const [marquee, setMarquee] = useState(null);
  const marqueeStart = useRef(null);
  const MIN_MARQUEE = 5;

  const handleMarqueeDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (e.target.tagName !== 'CANVAS') return;
    if (useDesignStore.getState().draggingShape) return;
    if (sceneInteracting.active) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
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
      const euler = new THREE.Euler();
      const quat = new THREE.Quaternion();

      const mx1 = marquee.x, my1 = marquee.y;
      const mx2 = marquee.x + marquee.w, my2 = marquee.y + marquee.h;

      for (const obj of objs) {
        if (obj.visible === false) continue;
        const [ehx, ehy, ehz] = getRawExtents(obj.type, obj.geometry);
        let hw = ehx * Math.abs(obj.scale[0]);
        let hh = ehy * Math.abs(obj.scale[1]);
        let hd = ehz * Math.abs(obj.scale[2]);

        euler.set(obj.rotation[0], obj.rotation[1], obj.rotation[2]);
        quat.setFromEuler(euler);

        let sxMin = Infinity, sxMax = -Infinity, syMin = Infinity, syMax = -Infinity;
        let inFront = false;
        for (let cx = -1; cx <= 1; cx += 2) {
          for (let cy = -1; cy <= 1; cy += 2) {
            for (let cz = -1; cz <= 1; cz += 2) {
              v.set(cx * hw, cy * hh, cz * hd);
              v.applyQuaternion(quat);
              v.x += obj.position[0];
              v.y += obj.position[1];
              v.z += obj.position[2];
              v.project(cam);
              if (v.z >= -1 && v.z <= 1) inFront = true;
              const sx = ((v.x + 1) / 2) * rect.width;
              const sy = ((1 - v.y) / 2) * rect.height;
              if (sx < sxMin) sxMin = sx;
              if (sx > sxMax) sxMax = sx;
              if (sy < syMin) syMin = sy;
              if (sy > syMax) syMax = sy;
            }
          }
        }
        if (inFront && sxMax >= mx1 && sxMin <= mx2 && syMax >= my1 && syMin <= my2) {
          hits.push(obj.id);
        }
      }
      if (hits.length > 0) {
        setSelectedIds(hits);
      } else {
        clearSelection();
      }
    }
    marqueeStart.current = null;
    setMarquee(null);
    setTimeout(() => setMarqueeActive(false), 50);
  }, [marquee, clearSelection, setSelectedIds]);

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

      const state = useDesignStore.getState();
      const effectiveIds = getEffectiveSelectionIdsFromState(state);
      const hasLocked = effectiveIds.some(id => state.objects.find(o => o.id === id)?.locked);

      switch (e.key) {
        case 'z': case 'Z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
          }
          break;
        case 'Delete': case 'Backspace':
          if (!hasLocked) removeSelected();
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
          if ((e.ctrlKey || e.metaKey) && !hasLocked) { e.preventDefault(); duplicateSelected(); }
          break;
        case 'a': case 'A':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); selectAll(); }
          break;
        case 'g': case 'G':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              if (!hasLocked) ungroupSelected();
            } else if (!hasLocked) {
              groupSelected();
            }
          } else {
            toggleGrid();
          }
          break;
        case 'f': case 'F':
          if (!e.ctrlKey && !e.metaKey && !hasLocked) dropToFloor();
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
  }, [undo, redo, removeSelected, setTransformMode, duplicateSelected, selectAll, clearSelection, toggleGrid, dropToFloor, toggleMeasure, saveProject, groupSelected, ungroupSelected]);

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

  const effectiveSelectedIds = getEffectiveSelectionIdsFromState({ objects, selectedIds });
  const selectionHasLocked = effectiveSelectedIds.some(id => {
    const o = objects.find((obj) => obj.id === id);
    return o?.locked;
  });
  const canGroup = effectiveSelectedIds.length > 1;
  const canUngroup = effectiveSelectedIds.some((id) => {
    const o = objects.find((obj) => obj.id === id);
    return !!o?.groupId;
  });

  const getCSGTransform = useCallback((result, fallback) => {
    if (result?.position && result?.quaternion && result?.scale) {
      const euler = new THREE.Euler().setFromQuaternion(result.quaternion, 'XYZ');
      return {
        position: [result.position.x, result.position.y, result.position.z],
        rotation: [euler.x, euler.y, euler.z],
        scale: [result.scale.x, result.scale.y, result.scale.z],
      };
    }
    return {
      position: [...(fallback?.position || [0, 0, 0])],
      rotation: [...(fallback?.rotation || [0, 0, 0])],
      scale: [...(fallback?.scale || [1, 1, 1])],
    };
  }, []);

  const normalizeImportedPivot = useCallback((bufferGeometry, tx) => {
    if (!bufferGeometry) return { geometry: bufferGeometry, tx };
    const geometry = bufferGeometry.clone();
    // 1) Bake CSG transform into geometry so object transform can be canonical.
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(tx.rotation[0], tx.rotation[1], tx.rotation[2], 'XYZ'),
    );
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(tx.position[0], tx.position[1], tx.position[2]),
      q,
      new THREE.Vector3(tx.scale[0], tx.scale[1], tx.scale[2]),
    );
    geometry.applyMatrix4(m);

    // 2) Recenter geometry around local origin (true midpoint pivot).
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (!bb) {
      geometry.computeBoundingSphere();
      return { geometry, tx };
    }
    const center = new THREE.Vector3();
    bb.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    // 3) Canonical transform: centered pivot with no residual rotation/scale.
    return {
      geometry,
      tx: {
        position: [center.x, center.y, center.z],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    };
  }, []);

  const handleMerge = useCallback(() => {
    if (selectedIds.length < 2) return;
    const selected = objects.filter(o => selectedIds.includes(o.id));
    const solids = selected.filter(o => !o.isHole);
    try {
      const result = mergeCSG(selected);
      if (result) {
        const anchor = solids[0] || selected[0];
        const tx = getCSGTransform(result, anchor);
        const normalized = normalizeImportedPivot(result.geometry, tx);
        replaceObjects(selectedIds, {
          id: uuidv4(),
          name: 'Merge',
          type: 'imported',
          position: normalized.tx.position,
          rotation: normalized.tx.rotation,
          scale: normalized.tx.scale,
          color: (solids[0] || selected[0]).color,
          isHole: false,
          visible: true,
          geometry: { bufferGeometry: normalized.geometry },
        });
      }
    } catch (err) {
      console.error('Merge failed:', err);
    }
  }, [selectedIds, objects, replaceObjects, getCSGTransform, normalizeImportedPivot]);

  const handleSubtract = useCallback(() => {
    if (selectedIds.length < 2) return;
    const selected = objects.filter(o => selectedIds.includes(o.id));
    const target = selected[0];
    const tools = selected.slice(1);
    try {
      const result = subtractCSG(target, tools);
      if (result) {
        const tx = getCSGTransform(result, target);
        const normalized = normalizeImportedPivot(result.geometry, tx);
        replaceObjects(selectedIds, {
          id: uuidv4(),
          name: 'Subtraction',
          type: 'imported',
          position: normalized.tx.position,
          rotation: normalized.tx.rotation,
          scale: normalized.tx.scale,
          color: target.color,
          isHole: false,
          visible: true,
          geometry: { bufferGeometry: normalized.geometry },
        });
      }
    } catch (err) {
      console.error('Subtract failed:', err);
    }
  }, [selectedIds, objects, replaceObjects, getCSGTransform, normalizeImportedPivot]);

  const handleIntersect = useCallback(() => {
    if (selectedIds.length < 2) return;
    const selected = objects.filter(o => selectedIds.includes(o.id));
    try {
      const result = intersectCSG(selected);
      if (result) {
        const tx = getCSGTransform(result, selected[0]);
        const normalized = normalizeImportedPivot(result.geometry, tx);
        replaceObjects(selectedIds, {
          id: uuidv4(),
          name: 'Intersection',
          type: 'imported',
          position: normalized.tx.position,
          rotation: normalized.tx.rotation,
          scale: normalized.tx.scale,
          color: selected[0].color,
          isHole: false,
          visible: true,
          geometry: { bufferGeometry: normalized.geometry },
        });
      }
    } catch (err) {
      console.error('Intersect failed:', err);
    }
  }, [selectedIds, objects, replaceObjects, getCSGTransform, normalizeImportedPivot]);

  return (
    <div className="dml-container">
      <header className="dml-header">
        <div className="dml-header-left">
          <div className="dml-logo" onClick={() => navigate('/playground')}>
            <span className="dml-logo-icon">◆</span>
            <span className="dml-logo-text">Design Maker</span>
          </div>
          <div className="dml-divider" />
          <div className="dml-project-info">
            {/* Projects trigger — sits LEFT of the name input */}
            <div className="dml-projects-trigger" ref={projectsRef}>
              <button
                className={`dml-projects-btn ${projectsOpen ? 'active' : ''}`}
                onClick={() => { setProjectList(getProjectList()); setProjectsOpen(!projectsOpen); }}
              >
                <FolderOpen size={14} />
                <span>Projects</span>
                <ChevronDown size={11} className={`dml-projects-chevron ${projectsOpen ? 'open' : ''}`} />
              </button>

              {projectsOpen && (
                <div className="dml-projects-dropdown">
                  <button
                    className="dml-projects-new"
                    onClick={() => { handleNewProject(); setProjectsOpen(false); }}
                  >
                    <span className="dml-projects-new-icon">+</span>
                    New Project
                  </button>

                  {projectList.length > 0 && (
                    <div className="dml-projects-section-label">Recent</div>
                  )}

                  {projectList.length === 0
                    ? <p className="dml-projects-empty">No saved projects yet</p>
                    : projectList.slice(0, 5).map(p => (
                        <div key={p.id} className="dml-projects-item">
                          <button
                            className="dml-projects-item-name"
                            onClick={() => { handleOpenProject(p.id); setProjectsOpen(false); }}
                          >
                            <span className="dml-projects-item-title">{p.name}</span>
                            <span className="dml-projects-item-date">
                              {new Date(p.updatedAt).toLocaleDateString()}
                            </span>
                          </button>
                          <button
                            className="dml-projects-item-del"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(p); }}
                            title="Delete"
                          >×</button>
                        </div>
                      ))
                  }

                  {projectList.length > 0 && (
                    <button
                      className="dml-projects-browse"
                      onClick={() => { setProjectDialogOpen(true); setProjectsOpen(false); }}
                    >
                      Browse all projects
                      <ChevronDown size={11} style={{ transform: 'rotate(-90deg)' }} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Project name input */}
            <div className="dml-project-name-wrap">
              <input
                className="dml-project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                spellCheck={false}
              />
              <Pencil size={12} className="dml-edit-icon" />
            </div>

            <span className={`dml-save-indicator ${isDirty ? 'unsaved' : 'saved'}`}>
              {isDirty ? '● Unsaved' : '✓ Saved'}
            </span>
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
          <RichTip label="Import STL/OBJ" description={TC.importModel.description} video={TC.importModel.video}>
            <button className="dml-header-btn" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              <span>Import</span>
            </button>
          </RichTip>

          <div className="dml-dropdown" onMouseLeave={() => setExportOpen(false)}>
            <RichTip label="Export" description={TC.exportModel.description} video={TC.exportModel.video} disabled={exportOpen}>
              <button
                className="dml-header-btn"
                onClick={() => setExportOpen(!exportOpen)}
              >
                <Download size={16} />
                <span>Export</span>
              </button>
            </RichTip>
            {exportOpen && (
              <div className="dml-dropdown-menu">
                <button onClick={handleExportSTL}>Export as STL</button>
                <button onClick={handleExportGLB}>Export as GLB</button>
              </div>
            )}
          </div>

          <RichTip label="Share">
            <button className="dml-header-btn" onClick={() => alert('Share link copied!')}>
              <Share2 size={16} />
              <span>Share</span>
            </button>
          </RichTip>

          <div className="dml-divider" />

          <RichTip label="Settings" description={TC.settings.description} video={TC.settings.video}>
            <button className="dml-header-btn icon-only" onClick={() => setSettingsOpen(true)}>
              <Settings size={18} />
            </button>
          </RichTip>
          <RichTip label="Exit to Playground">
            <button className="dml-header-btn dml-exit-btn icon-only" onClick={exitLab}>
              <X size={18} />
            </button>
          </RichTip>
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
              <RichTip label="Group" shortcut="Ctrl+G" description={TC.group.description} video={TC.group.video} placement="bottom">
                <button
                  className="dml-csg-btn dml-csg-icon-btn dml-csg-group"
                  onClick={groupSelected}
                  disabled={!canGroup || selectionHasLocked}
                >
                  <img src="/assets/floating-object/group.svg" alt="Group" />
                </button>
              </RichTip>
              <RichTip label="Ungroup" shortcut="Ctrl+Shift+G" description={TC.ungroup.description} video={TC.ungroup.video} placement="bottom">
                <button
                  className="dml-csg-btn dml-csg-icon-btn dml-csg-ungroup"
                  onClick={ungroupSelected}
                  disabled={!canUngroup || selectionHasLocked}
                >
                  <img src="/assets/floating-object/ungroup.svg" alt="Ungroup" />
                </button>
              </RichTip>
              <div className="dml-csg-sep" />
              <div className="dml-csg-ops">
              <RichTip label="Merge" description={TC.merge.description} video={TC.merge.video} placement="bottom">
                <button className="dml-csg-btn dml-csg-icon-btn dml-csg-union" onClick={handleMerge} disabled={selectionHasLocked}>
                  <img src="/assets/floating-object/union.svg" alt="Merge" />
                </button>
              </RichTip>
              <RichTip label="Subtract" description={TC.subtract.description} video={TC.subtract.video} placement="bottom">
                <button className="dml-csg-btn dml-csg-icon-btn dml-csg-subtract" onClick={handleSubtract} disabled={selectionHasLocked}>
                  <img src="/assets/floating-object/subtract.svg" alt="Subtract" />
                </button>
              </RichTip>
              <RichTip label="Intersect" description={TC.intersect.description} video={TC.intersect.video} placement="bottom">
                <button className="dml-csg-btn dml-csg-icon-btn dml-csg-intersect" onClick={handleIntersect} disabled={selectionHasLocked}>
                  <img src="/assets/floating-object/intersect.svg" alt="Intersect" />
                </button>
              </RichTip>
              </div>
              <span className="dml-csg-hint">{selectionHasLocked ? 'Unlock objects first' : 'First selected = target'}</span>
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

      {/* ── Full Project Browser Dialog ── */}
      {projectDialogOpen && (
        <div className="dml-pdialog-overlay" onClick={() => setProjectDialogOpen(false)}>
          <div className="dml-pdialog" onClick={(e) => e.stopPropagation()}>
            <div className="dml-pdialog-header">
              <div className="dml-pdialog-title">
                <FolderOpen size={18} />
                <h2>My Projects</h2>
              </div>
              <button className="dml-pdialog-close" onClick={() => setProjectDialogOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="dml-pdialog-search-wrap">
              <Search size={14} className="dml-pdialog-search-icon" />
              <input
                className="dml-pdialog-search"
                placeholder="Search projects…"
                value={dialogSearch}
                onChange={(e) => { setDialogSearch(e.target.value); setDialogPage(0); }}
                autoFocus
              />
              {dialogSearch && (
                <button className="dml-pdialog-search-clear" onClick={() => setDialogSearch('')}>
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="dml-pdialog-list">
              {filteredDialogProjects.length === 0 ? (
                <p className="dml-pdialog-empty">
                  {dialogSearch ? `No projects matching "${dialogSearch}"` : 'No saved projects yet'}
                </p>
              ) : (
                paginatedDialogProjects.map(p => (
                  <div key={p.id} className="dml-pdialog-item">
                    <div className="dml-pdialog-item-info">
                      <span className="dml-pdialog-item-name">{p.name}</span>
                      <span className="dml-pdialog-item-date">
                        {new Date(p.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="dml-pdialog-item-actions">
                      <button
                        className="dml-pdialog-open"
                        onClick={() => { handleOpenProject(p.id); setProjectDialogOpen(false); }}
                      >Open</button>
                      <button
                        className="dml-pdialog-del"
                        onClick={() => setDeleteConfirm(p)}
                        title="Delete project"
                      >×</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {totalDialogPages > 1 && (
              <div className="dml-pdialog-pagination">
                <button
                  className="dml-pdialog-page-btn"
                  disabled={dialogPage === 0}
                  onClick={() => setDialogPage(p => p - 1)}
                >‹</button>
                <span className="dml-pdialog-page-info">
                  {dialogPage + 1} / {totalDialogPages}
                </span>
                <button
                  className="dml-pdialog-page-btn"
                  disabled={dialogPage >= totalDialogPages - 1}
                  onClick={() => setDialogPage(p => p + 1)}
                >›</button>
              </div>
            )}

            <div className="dml-pdialog-footer">
              <button
                className="dml-pdialog-new"
                onClick={() => { handleNewProject(); setProjectDialogOpen(false); }}
              >
                <span>+</span> New Project
              </button>
              <span className="dml-pdialog-count">
                {filteredDialogProjects.length} project{filteredDialogProjects.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="dml-confirm-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="dml-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dml-confirm-icon">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>
            <h3 className="dml-confirm-title">Delete Project</h3>
            <p className="dml-confirm-msg">
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone.
            </p>
            <div className="dml-confirm-actions">
              <button className="dml-confirm-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="dml-confirm-delete" onClick={() => {
                deleteProject(deleteConfirm.id);
                const fresh = getProjectList();
                setProjectList(fresh);
                setDialogProjects(fresh);
                setDeleteConfirm(null);
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
