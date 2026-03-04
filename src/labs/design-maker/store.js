import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export const SHAPE_DEFAULTS = {
  box: { geometry: { width: 20, height: 20, depth: 20 }, color: '#6366f1' },
  sphere: { geometry: { radius: 10, widthSegments: 32, heightSegments: 32 }, color: '#ec4899' },
  cylinder: { geometry: { radiusTop: 10, radiusBottom: 10, height: 20, radialSegments: 32 }, color: '#14b8a6' },
  cone: { geometry: { radius: 10, height: 20, radialSegments: 32 }, color: '#f97316' },
  torus: { geometry: { radius: 10, tube: 3, radialSegments: 16, tubularSegments: 48 }, color: '#8b5cf6' },
  text: { geometry: { text: 'Hello', size: 10, height: 5, font: 'helvetiker' }, color: '#3b82f6' },
  wall: { geometry: { width: 40, height: 20, depth: 2 }, color: '#64748b' },
  pyramid: { geometry: { radius: 10, height: 20, radialSegments: 4 }, color: '#22c55e' },
  heart: { geometry: { size: 10, depth: 5 }, color: '#ef4444' },
  star: { geometry: { outerRadius: 10, innerRadius: 5, points: 5, depth: 5 }, color: '#eab308' },
  hemisphere: { geometry: { radius: 10 }, color: '#06b6d4' },
  tube: { geometry: { radius: 10, tube: 2, radialSegments: 8, tubularSegments: 48 }, color: '#a855f7' },
  wedge: { geometry: { width: 20, height: 20, depth: 20 }, color: '#84cc16' },
};

// Mutable cursor state for high-frequency drag position updates (not in Zustand for perf)
export const dragCursor = { x: 0, y: 0, active: false };
export const sceneCamera = { current: null };
export const sceneInteracting = { active: false };

export function getHalfHeight(type, geometry) {
  switch (type) {
    case 'box': case 'wall': case 'wedge':
      return geometry.height / 2;
    case 'sphere': case 'hemisphere':
      return geometry.radius;
    case 'cylinder': case 'cone': case 'pyramid':
      return geometry.height / 2;
    case 'torus': case 'tube':
      return geometry.tube + geometry.radius;
    case 'heart': case 'star':
      return geometry.depth / 2;
    case 'text':
      return geometry.height / 2;
    default:
      return 10;
  }
}

const MAX_HISTORY = 50;

function cloneObjects(objects) {
  return objects.map(o => ({
    ...o,
    position: [...o.position],
    rotation: [...o.rotation],
    scale: [...o.scale],
    geometry: { ...o.geometry },
  }));
}

let objectCounter = 0;

const STORAGE_KEY = 'dml-projects';

function loadProjectList() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveProjectList(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export const useDesignStore = create((set, get) => ({
  objects: [],
  selectedIds: [],
  _past: [],
  _future: [],
  projectId: null,
  transformMode: 'translate',
  cameraMode: 'perspective',
  gridVisible: true,
  snapIncrement: 1,
  wireframe: false,
  faceSnap: true,
  rulerVisible: true,
  measureActive: false,
  measurePoints: [],
  units: 'mm',
  zoomSpeed: 1,
  backgroundColor: '#f5f5f5',
  projectName: 'Untitled Project',
  isDirty: false,
  settingsOpen: false,
  pendingDrop: null,
  draggingShape: null,
  _cameraCmd: null,

  zoomIn: () => set({ _cameraCmd: 'in' }),
  zoomOut: () => set({ _cameraCmd: 'out' }),
  cameraHome: () => set({ _cameraCmd: 'home' }),
  cameraFit: () => set({ _cameraCmd: 'fit' }),
  clearCameraCmd: () => set({ _cameraCmd: null }),

  setPendingDrop: (drop) => set({ pendingDrop: drop }),
  clearPendingDrop: () => set({ pendingDrop: null }),
  setDraggingShape: (shape) => set({ draggingShape: shape }),
  clearDraggingShape: () => set({ draggingShape: null }),

  _saveSnapshot: () => {
    const { objects, _past } = get();
    const snap = cloneObjects(objects);
    const past = _past.length >= MAX_HISTORY ? _past.slice(1) : [..._past];
    past.push(snap);
    set({ _past: past, _future: [] });
  },

  undo: () => {
    const { objects, _past, _future } = get();
    if (_past.length === 0) return;
    const prev = _past[_past.length - 1];
    set({
      _past: _past.slice(0, -1),
      _future: [..._future, cloneObjects(objects)],
      objects: prev,
      selectedIds: [],
      isDirty: true,
    });
  },

  redo: () => {
    const { objects, _past, _future } = get();
    if (_future.length === 0) return;
    const next = _future[_future.length - 1];
    set({
      _future: _future.slice(0, -1),
      _past: [..._past, cloneObjects(objects)],
      objects: next,
      selectedIds: [],
      isDirty: true,
    });
  },

  addObject: (type, overrides = {}) => {
    get()._saveSnapshot();
    const defaults = SHAPE_DEFAULTS[type] || SHAPE_DEFAULTS.box;
    objectCounter++;
    const obj = {
      id: uuidv4(),
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${objectCounter}`,
      type,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: defaults.color,
      isHole: false,
      visible: true,
      geometry: { ...defaults.geometry },
      ...overrides,
    };
    const halfH = getHalfHeight(type, obj.geometry);
    obj.position = [obj.position[0], halfH, obj.position[2]];
    set(state => ({
      objects: [...state.objects, obj],
      selectedIds: [obj.id],
      isDirty: true,
    }));
    return obj.id;
  },

  removeObject: (id) => { get()._saveSnapshot(); set(state => ({
    objects: state.objects.filter(o => o.id !== id),
    selectedIds: state.selectedIds.filter(s => s !== id),
    isDirty: true,
  })); },

  removeSelected: () => { get()._saveSnapshot(); set(state => ({
    objects: state.objects.filter(o => !state.selectedIds.includes(o.id)),
    selectedIds: [],
    isDirty: true,
  })); },

  updateObject: (id, updates) => { get()._saveSnapshot(); set(state => ({
    objects: state.objects.map(o => o.id === id ? { ...o, ...updates } : o),
    isDirty: true,
  })); },

  duplicateSelected: () => {
    get()._saveSnapshot();
    const state = get();
    const selected = state.objects.filter(o => state.selectedIds.includes(o.id));
    const dupes = selected.map(o => ({
      ...o,
      id: uuidv4(),
      name: o.name + ' Copy',
      position: [o.position[0] + 10, o.position[1], o.position[2] + 10],
    }));
    set({
      objects: [...state.objects, ...dupes],
      selectedIds: dupes.map(o => o.id),
      isDirty: true,
    });
  },

  arraySelected: (axis, count, spacing) => {
    get()._saveSnapshot();
    const state = get();
    const selected = state.objects.filter(o => state.selectedIds.includes(o.id));
    const ai = { x: 0, y: 1, z: 2 }[axis];
    const allDupes = [];
    for (let i = 1; i <= count; i++) {
      selected.forEach(o => {
        const pos = [...o.position];
        pos[ai] += spacing * i;
        allDupes.push({ ...o, id: uuidv4(), name: `${o.name} ${i + 1}`, position: pos });
      });
    }
    set({
      objects: [...state.objects, ...allDupes],
      selectedIds: [...state.selectedIds, ...allDupes.map(o => o.id)],
      isDirty: true,
    });
  },

  selectObject: (id, addToSelection = false) => set(state => {
    if (addToSelection) {
      const has = state.selectedIds.includes(id);
      return { selectedIds: has ? state.selectedIds.filter(s => s !== id) : [...state.selectedIds, id] };
    }
    return { selectedIds: id ? [id] : [] };
  }),

  clearSelection: () => set({ selectedIds: [] }),
  selectAll: () => set(state => ({ selectedIds: state.objects.map(o => o.id) })),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setCameraMode: (mode) => set({ cameraMode: mode }),
  toggleGrid: () => set(state => ({ gridVisible: !state.gridVisible })),
  setSnapIncrement: (snap) => set({ snapIncrement: snap }),
  toggleWireframe: () => set(state => ({ wireframe: !state.wireframe })),
  toggleFaceSnap: () => set(state => ({ faceSnap: !state.faceSnap })),
  toggleRuler: () => set(state => ({ rulerVisible: !state.rulerVisible })),
  toggleMeasure: () => set(state => ({ measureActive: !state.measureActive, measurePoints: [] })),
  addMeasurePoint: (pt) => set(state => {
    const pts = [...state.measurePoints, pt];
    if (pts.length > 2) return { measurePoints: [pt] };
    return { measurePoints: pts };
  }),
  clearMeasure: () => set({ measurePoints: [] }),
  setBackgroundColor: (color) => set({ backgroundColor: color }),
  setUnits: (units) => set({ units }),
  setZoomSpeed: (speed) => set({ zoomSpeed: speed }),
  setProjectName: (name) => set({ projectName: name, isDirty: true }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  alignObjects: (axis, edge) => {
    const state = get();
    if (state.selectedIds.length < 2) return;
    get()._saveSnapshot();
    const selected = state.objects.filter(o => state.selectedIds.includes(o.id));
    const ai = { x: 0, y: 1, z: 2 }[axis];
    let target;
    if (edge === 'min') target = Math.min(...selected.map(o => o.position[ai]));
    else if (edge === 'max') target = Math.max(...selected.map(o => o.position[ai]));
    else target = selected.reduce((s, o) => s + o.position[ai], 0) / selected.length;
    set({
      objects: state.objects.map(o => {
        if (!state.selectedIds.includes(o.id)) return o;
        const pos = [...o.position];
        pos[ai] = target;
        return { ...o, position: pos };
      }),
      isDirty: true,
    });
  },

  dropToFloor: () => {
    get()._saveSnapshot();
    const state = get();
    set({
      objects: state.objects.map(o => {
        if (!state.selectedIds.includes(o.id)) return o;
        const halfH = getHalfHeight(o.type, o.geometry);
        const pos = [...o.position];
        pos[1] = halfH * Math.abs(o.scale[1]);
        return { ...o, position: pos };
      }),
      isDirty: true,
    });
  },

  mirrorSelected: (axis) => {
    get()._saveSnapshot();
    const state = get();
    const ai = { x: 0, y: 1, z: 2 }[axis];
    const selected = state.objects.filter(o => state.selectedIds.includes(o.id));
    const center = selected.reduce((sum, o) => sum + o.position[ai], 0) / (selected.length || 1);
    set({
      objects: state.objects.map(o => {
        if (!state.selectedIds.includes(o.id)) return o;
        const pos = [...o.position];
        pos[ai] = 2 * center - pos[ai];
        const scale = [...o.scale];
        scale[ai] *= -1;
        return { ...o, position: pos, scale };
      }),
      isDirty: true,
    });
  },

  replaceObjects: (oldIds, newObj) => { get()._saveSnapshot(); set(state => ({
    objects: [...state.objects.filter(o => !oldIds.includes(o.id)), newObj],
    selectedIds: [newObj.id],
    isDirty: true,
  })); },

  addImportedObject: (bufferGeometry, name = 'Imported') => {
    get()._saveSnapshot();
    objectCounter++;
    const obj = {
      id: uuidv4(),
      name: `${name} ${objectCounter}`,
      type: 'imported',
      position: [0, 10, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#6366f1',
      isHole: false,
      visible: true,
      geometry: { bufferGeometry },
    };
    set(state => ({
      objects: [...state.objects, obj],
      selectedIds: [obj.id],
      isDirty: true,
    }));
  },

  saveProject: () => {
    const state = get();
    let id = state.projectId || uuidv4();
    const saveable = state.objects.map(o => {
      const { geometry, ...rest } = o;
      if (o.type === 'imported') return { ...rest, geometry: {} };
      return { ...rest, geometry };
    });
    const project = {
      id,
      name: state.projectName,
      objects: saveable,
      backgroundColor: state.backgroundColor,
      updatedAt: Date.now(),
    };
    const list = loadProjectList().filter(p => p.id !== id);
    list.unshift(project);
    saveProjectList(list);
    set({ projectId: id, isDirty: false });
  },

  loadProject: (id) => {
    const list = loadProjectList();
    const project = list.find(p => p.id === id);
    if (!project) return;
    objectCounter = project.objects.length;
    set({
      objects: project.objects,
      projectId: project.id,
      projectName: project.name,
      backgroundColor: project.backgroundColor || '#f5f5f5',
      selectedIds: [],
      _past: [],
      _future: [],
      isDirty: false,
    });
  },

  newProject: () => {
    objectCounter = 0;
    set({
      objects: [],
      projectId: null,
      projectName: 'Untitled Project',
      selectedIds: [],
      _past: [],
      _future: [],
      isDirty: false,
      backgroundColor: '#f5f5f5',
    });
  },

  deleteProject: (id) => {
    const list = loadProjectList().filter(p => p.id !== id);
    saveProjectList(list);
  },

  getProjectList: () => loadProjectList(),
}));
