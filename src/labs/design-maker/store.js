import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

const SHAPE_DEFAULTS = {
  box: { geometry: { width: 20, height: 20, depth: 20 }, color: '#6366f1' },
  sphere: { geometry: { radius: 10, widthSegments: 32, heightSegments: 32 }, color: '#ec4899' },
  cylinder: { geometry: { radiusTop: 10, radiusBottom: 10, height: 20, radialSegments: 32 }, color: '#14b8a6' },
  cone: { geometry: { radius: 10, height: 20, radialSegments: 32 }, color: '#f97316' },
  torus: { geometry: { radius: 10, tube: 3, radialSegments: 16, tubularSegments: 48 }, color: '#8b5cf6' },
  text: { geometry: { text: 'Hello', size: 10, height: 5 }, color: '#3b82f6' },
  wall: { geometry: { width: 40, height: 20, depth: 2 }, color: '#64748b' },
  pyramid: { geometry: { radius: 10, height: 20, radialSegments: 4 }, color: '#22c55e' },
  heart: { geometry: { size: 10, depth: 5 }, color: '#ef4444' },
  star: { geometry: { outerRadius: 10, innerRadius: 5, points: 5, depth: 5 }, color: '#eab308' },
  hemisphere: { geometry: { radius: 10 }, color: '#06b6d4' },
  tube: { geometry: { radius: 10, tube: 2, radialSegments: 8, tubularSegments: 48 }, color: '#a855f7' },
  wedge: { geometry: { width: 20, height: 20, depth: 20 }, color: '#84cc16' },
};

function getHalfHeight(type, geometry) {
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

let objectCounter = 0;

export const useDesignStore = create((set, get) => ({
  objects: [],
  selectedIds: [],
  transformMode: 'translate',
  cameraMode: 'perspective',
  gridVisible: true,
  snapIncrement: 1,
  wireframe: false,
  units: 'mm',
  zoomSpeed: 1,
  backgroundColor: '#1a1a2e',
  projectName: 'Untitled Project',
  isDirty: false,
  settingsOpen: false,

  addObject: (type, overrides = {}) => {
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

  removeObject: (id) => set(state => ({
    objects: state.objects.filter(o => o.id !== id),
    selectedIds: state.selectedIds.filter(s => s !== id),
    isDirty: true,
  })),

  removeSelected: () => set(state => ({
    objects: state.objects.filter(o => !state.selectedIds.includes(o.id)),
    selectedIds: [],
    isDirty: true,
  })),

  updateObject: (id, updates) => set(state => ({
    objects: state.objects.map(o => o.id === id ? { ...o, ...updates } : o),
    isDirty: true,
  })),

  duplicateSelected: () => {
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
  setBackgroundColor: (color) => set({ backgroundColor: color }),
  setUnits: (units) => set({ units }),
  setZoomSpeed: (speed) => set({ zoomSpeed: speed }),
  setProjectName: (name) => set({ projectName: name, isDirty: true }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  alignObjects: (axis, edge) => {
    const state = get();
    if (state.selectedIds.length < 2) return;
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

  mirrorSelected: (axis) => {
    const state = get();
    const ai = { x: 0, y: 1, z: 2 }[axis];
    set({
      objects: state.objects.map(o => {
        if (!state.selectedIds.includes(o.id)) return o;
        const scale = [...o.scale];
        scale[ai] *= -1;
        return { ...o, scale };
      }),
      isDirty: true,
    });
  },

  replaceObjects: (oldIds, newObj) => set(state => ({
    objects: [...state.objects.filter(o => !oldIds.includes(o.id)), newObj],
    selectedIds: [newObj.id],
    isDirty: true,
  })),

  addImportedObject: (bufferGeometry, name = 'Imported') => {
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
}));
