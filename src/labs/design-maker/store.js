import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export const SHAPE_DEFAULTS = {
  box: { geometry: { width: 20, height: 20, depth: 20, edgeRadius: 0, edgeStyle: 'none' }, color: '#6366f1' },
  sphere: { geometry: { radius: 10, widthSegments: 32, heightSegments: 32 }, color: '#ec4899' },
  cylinder: { geometry: { radiusTop: 10, radiusBottom: 10, height: 20, radialSegments: 32, edgeRadius: 0, edgeStyle: 'none' }, color: '#14b8a6' },
  cone: { geometry: { radius: 10, height: 20, radialSegments: 32 }, color: '#f97316' },
  torus: { geometry: { radius: 10, tube: 3, radialSegments: 16, tubularSegments: 48 }, color: '#8b5cf6' },
  text: { geometry: { text: 'Hello', size: 10, height: 5, font: 'helvetiker' }, color: '#3b82f6' },
  wall: { geometry: { width: 40, height: 20, depth: 2, edgeRadius: 0, edgeStyle: 'none' }, color: '#64748b' },
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

export const FLAT_TYPES = ['heart', 'star', 'tube', 'torus', 'text'];
export const FLAT_ROTATION = [-Math.PI / 2, 0, 0];

function getRawExtents(type, geometry) {
  let hx, hy, hz;
  switch (type) {
    case 'box': case 'wall': case 'wedge':
      hx = geometry.width / 2; hy = geometry.height / 2; hz = geometry.depth / 2;
      break;
    case 'sphere':
      hx = hy = hz = geometry.radius;
      break;
    case 'hemisphere':
      hx = hz = geometry.radius; hy = geometry.radius / 2;
      break;
    case 'cylinder':
      hx = hz = Math.max(geometry.radiusTop, geometry.radiusBottom); hy = geometry.height / 2;
      break;
    case 'cone': case 'pyramid':
      hx = hz = geometry.radius; hy = geometry.height / 2;
      break;
    case 'torus': case 'tube':
      // TorusGeometry is oriented around Z by default:
      // X/Y extent = radius + tube, Z extent = tube.
      hx = geometry.radius + geometry.tube;
      hy = geometry.radius + geometry.tube;
      hz = geometry.tube;
      break;
    case 'heart':
      // Heart shape is centered on Y/Z in Scene geometry construction.
      // X/Y come from 2D shape profile; Z comes from extrude depth + bevel.
      hx = geometry.size * 0.55;
      hy = geometry.size * 0.7;
      hz = (geometry.depth + 1.0) / 2;
      break;
    case 'star':
      // Star profile radius in XY; Z comes from extrude depth + bevel.
      hx = geometry.outerRadius;
      hy = geometry.outerRadius;
      hz = (geometry.depth + 1.0) / 2;
      break;
    case 'text':
      // Text is centered by <Center/> in Scene; width scales with glyph count.
      hx = Math.max((geometry.size || 10), ((geometry.text || 'Text').length * (geometry.size || 10) * 0.3));
      hy = (geometry.size || 10) / 2;
      hz = ((geometry.height || 5) + 0.6) / 2;
      break;
    default:
      hx = hy = hz = 10;
  }
  return [hx, hy, hz];
}

export function getFloorY(type, geometry, rotation, scale) {
  const [hx, hy, hz] = getRawExtents(type, geometry);
  const sx = scale ? Math.abs(scale[0]) : 1;
  const sy = scale ? Math.abs(scale[1]) : 1;
  const sz = scale ? Math.abs(scale[2]) : 1;

  if (!rotation || (rotation[0] === 0 && rotation[1] === 0 && rotation[2] === 0)) {
    return hy * sy;
  }

  const [rx, ry, rz] = rotation;
  const cx = Math.cos(rx), sx_ = Math.sin(rx);
  const cy = Math.cos(ry), sy_ = Math.sin(ry);
  const cz = Math.cos(rz), sz_ = Math.sin(rz);

  const corners = [
    [-hx * sx, -hy * sy, -hz * sz], [ hx * sx, -hy * sy, -hz * sz],
    [-hx * sx,  hy * sy, -hz * sz], [ hx * sx,  hy * sy, -hz * sz],
    [-hx * sx, -hy * sy,  hz * sz], [ hx * sx, -hy * sy,  hz * sz],
    [-hx * sx,  hy * sy,  hz * sz], [ hx * sx,  hy * sy,  hz * sz],
  ];

  let minY = Infinity;
  for (const [x, y, z] of corners) {
    // Euler XYZ: R = Rz · Ry · Rx
    const x1 = x,               y1 = y * cx - z * sx_, z1 = y * sx_ + z * cx;
    const x2 = x1 * cy + z1 * sy_, y2 = y1,            z2 = -x1 * sy_ + z1 * cy;
    const ry3 = x2 * sz_ + y2 * cz;
    if (ry3 < minY) minY = ry3;
  }

  return -minY;
}

function getWorldBounds(type, geometry, rotation, scale, position) {
  const [hx, hy, hz] = getRawExtents(type, geometry);
  const sx = scale ? Math.abs(scale[0]) : 1;
  const sy = scale ? Math.abs(scale[1]) : 1;
  const sz = scale ? Math.abs(scale[2]) : 1;
  const [px, py, pz] = position || [0, 0, 0];

  const [rx, ry, rz] = rotation || [0, 0, 0];
  const cx = Math.cos(rx), sx_ = Math.sin(rx);
  const cy = Math.cos(ry), sy_ = Math.sin(ry);
  const cz = Math.cos(rz), sz_ = Math.sin(rz);

  const corners = [
    [-hx * sx, -hy * sy, -hz * sz], [ hx * sx, -hy * sy, -hz * sz],
    [-hx * sx,  hy * sy, -hz * sz], [ hx * sx,  hy * sy, -hz * sz],
    [-hx * sx, -hy * sy,  hz * sz], [ hx * sx, -hy * sy,  hz * sz],
    [-hx * sx,  hy * sy,  hz * sz], [ hx * sx,  hy * sy,  hz * sz],
  ];

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const [x, y, z] of corners) {
    // Euler XYZ: R = Rz · Ry · Rx
    const x1 = x,               y1 = y * cx - z * sx_, z1 = y * sx_ + z * cx;
    const x2 = x1 * cy + z1 * sy_, y2 = y1,            z2 = -x1 * sy_ + z1 * cy;
    const x3 = x2 * cz - y2 * sz_;
    const y3 = x2 * sz_ + y2 * cz;
    const z3 = z2;

    const wx = x3 + px;
    const wy = y3 + py;
    const wz = z3 + pz;

    if (wx < minX) minX = wx;
    if (wy < minY) minY = wy;
    if (wz < minZ) minZ = wz;
    if (wx > maxX) maxX = wx;
    if (wy > maxY) maxY = wy;
    if (wz > maxZ) maxZ = wz;
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

function overlapsXZ(a, b) {
  return (
    a.min[0] <= b.max[0] &&
    a.max[0] >= b.min[0] &&
    a.min[2] <= b.max[2] &&
    a.max[2] >= b.min[2]
  );
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
  shadowsEnabled: true,
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
      locked: false,
      visible: true,
      geometry: { ...defaults.geometry },
      ...overrides,
    };
    if (FLAT_TYPES.includes(type) && !overrides.rotation) {
      obj.rotation = [...FLAT_ROTATION];
    }
    const floorY = getFloorY(type, obj.geometry, obj.rotation, obj.scale);
    obj.position = [obj.position[0], floorY, obj.position[2]];
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

  updateObjectSilent: (id, updates) => set(state => ({
    objects: state.objects.map(o => o.id === id ? { ...o, ...updates } : o),
    isDirty: true,
  })),

  toggleLock: (id) => set(state => ({
    objects: state.objects.map(o => o.id === id ? { ...o, locked: !o.locked } : o),
  })),

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
  toggleShadows: () => set(state => ({ shadowsEnabled: !state.shadowsEnabled })),
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
    const selectedSet = new Set(state.selectedIds);
    set({
      objects: state.objects.map(o => {
        if (!selectedSet.has(o.id)) return o;
        const curBounds = getWorldBounds(
          o.type,
          o.geometry,
          o.rotation,
          o.scale,
          o.position,
        );
        let targetY = 0;

        if (state.faceSnap) {
          for (const other of state.objects) {
            if (selectedSet.has(other.id) || other.id === o.id) continue;
            const otherBounds = getWorldBounds(
              other.type,
              other.geometry,
              other.rotation,
              other.scale,
              other.position,
            );
            const beneath = otherBounds.max[1] <= curBounds.min[1] + 0.001;
            if (beneath && overlapsXZ(curBounds, otherBounds)) {
              targetY = Math.max(targetY, otherBounds.max[1]);
            }
          }
        }

        const pos = [...o.position];
        pos[1] += targetY - curBounds.min[1];
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
