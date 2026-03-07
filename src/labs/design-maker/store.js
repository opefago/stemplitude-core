import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { BufferGeometryLoader } from 'three';
import { getFloorY, getWorldBounds, overlapsXZ } from './dimensions';

/**
 * Central shape registry. Add new shapes here — every derived list
 * (FLAT_TYPES, ICON_TYPES, TYPE_ICONS, etc.) updates automatically.
 *
 * Properties:
 *   geometry – default geometry params for this shape
 *   color    – default object color
 *   icon     – unicode glyph shown in the scene tree
 *   flat     – geometry created in XY plane, needs FLAT_ROTATION on drop
 *   isText   – rendered via Text3D, icon generated separately
 */
export const SHAPE_DEFAULTS = {
  box:        { geometry: { width: 20, height: 20, depth: 20, edgeRadius: 0, edgeStyle: 'none' }, color: '#6366f1',
                icon: 'M3 5.5L8 3l5 2.5v5L8 13l-5-2.5z M3 5.5L8 8l5-2.5 M8 8v5' },
  sphere:     { geometry: { radius: 10, widthSegments: 32, heightSegments: 32 }, color: '#ec4899',
                icon: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z M2.5 8h11 M8 2c-2 0-3.5 2.7-3.5 6s1.5 6 3.5 6 3.5-2.7 3.5-6S10 2 8 2z' },
  cylinder:   { geometry: { radiusTop: 10, radiusBottom: 10, height: 20, radialSegments: 32, edgeRadius: 0, edgeStyle: 'none' }, color: '#14b8a6',
                icon: 'M3 4.5c0-1.1 2.2-2 5-2s5 .9 5 2v7c0 1.1-2.2 2-5 2s-5-.9-5-2z M3 4.5c0 1.1 2.2 2 5 2s5-.9 5-2' },
  cone:       { geometry: { radius: 10, height: 20, radialSegments: 32 }, color: '#f97316',
                icon: 'M8 2L3 12.5c0 .8 2.2 1.5 5 1.5s5-.7 5-1.5z M3 12.5c0 .8 2.2 1.5 5 1.5s5-.7 5-1.5' },
  torus:      { geometry: { radius: 10, tube: 3, radialSegments: 16, tubularSegments: 48 }, color: '#8b5cf6', flat: true,
                icon: 'M8 4C4.1 4 1 5.8 1 8s3.1 4 7 4 7-1.8 7-4-3.1-4-7-4z M8 6c1.7 0 3 .9 3 2s-1.3 2-3 2-3-.9-3-2 1.3-2 3-2z' },
  text:       { geometry: { text: 'Hello', size: 10, height: 5, font: 'helvetiker' }, color: '#3b82f6', flat: true, isText: true,
                icon: 'M3 4h10 M8 4v9 M5.5 4v0 M10.5 4v0' },
  wall:       { geometry: { width: 40, height: 20, depth: 2, edgeRadius: 0, edgeStyle: 'none' }, color: '#64748b',
                icon: 'M2 4h12v7H2z M2 4l2-1.5h12L14 4 M14 4h2V11l-2 0 M14 2.5v7' },
  pyramid:    { geometry: { radius: 10, height: 20, radialSegments: 4 }, color: '#22c55e',
                icon: 'M8 2L2 12h12z M8 2l4.5 8 M8 2L3.5 10' },
  heart:      { geometry: { size: 10, depth: 5 }, color: '#ef4444', flat: true,
                icon: 'M8 13.7C4 10.3 1.5 7.8 1.5 5.5 1.5 3.4 3.2 2 5.2 2c1.2 0 2.3.6 2.8 1.4C8.5 2.6 9.6 2 10.8 2c2 0 3.7 1.4 3.7 3.5 0 2.3-2.5 4.8-6.5 8.2z' },
  star:       { geometry: { outerRadius: 10, innerRadius: 5, points: 5, depth: 5 }, color: '#eab308', flat: true,
                icon: 'M8 1.5l2 4.5 4.9.7-3.5 3.4.8 4.9L8 12.5 3.8 15l.8-4.9L1.1 6.7 6 6z' },
  hemisphere: { geometry: { radius: 10 }, color: '#06b6d4',
                icon: 'M2 10a6 6 0 0 1 12 0z M2 10h12' },
  tube:       { geometry: { radius: 10, tube: 2, radialSegments: 8, tubularSegments: 48 }, color: '#a855f7', flat: true,
                icon: 'M8 3C4.7 3 2 5.2 2 8s2.7 5 6 5 6-2.2 6-5-2.7-5-6-5z M8 5.5c1.9 0 3.5 1.1 3.5 2.5S9.9 10.5 8 10.5 4.5 9.4 4.5 8 6.1 5.5 8 5.5z' },
  wedge:      { geometry: { width: 20, height: 20, depth: 20 }, color: '#84cc16',
                icon: 'M3 12L3 4 13 12z M3 4l5-1.5L13 12 M8 2.5L3 4' },
  tetrahedron:{ geometry: { radius: 10 }, color: '#10b981',
                icon: 'M8 2L2 13h12z M8 2l4 7 M6 9h4' },
  dodecahedron:{ geometry: { radius: 10 }, color: '#f59e0b',
                icon: 'M8 2l5 4v4l-5 4-5-4V6z M3 6l5 2 5-2 M8 8v6' },
  octahedron: { geometry: { radius: 10 }, color: '#06b6d4',
                icon: 'M8 1l6 7-6 7-6-7z M2 8h12' },
  icosahedron:{ geometry: { radius: 10 }, color: '#7c3aed',
                icon: 'M8 2L3 5v6l5 3 5-3V5z M3 5l5 2 5-2 M8 7v7' },
  ellipsoid:  { geometry: { radiusX: 12, radiusY: 8, radiusZ: 10 }, color: '#db2777',
                icon: 'M8 3C4 3 1.5 5.5 1.5 8S4 13 8 13s6.5-2.5 6.5-5S12 3 8 3z M1.5 8h13' },
  triangularPrism: { geometry: { radius: 10, height: 20 }, color: '#0d9488',
                icon: 'M4 12L8 3l4 9H4z M8 3l3.5 6 M4 12l1.5-1h5l1.5 1' },
  hexagonalPrism: { geometry: { radius: 10, height: 20 }, color: '#4f46e5',
                icon: 'M5 2.5L2 8l3 5.5h6L14 8l-3-5.5z M5 2.5l1.5 1h3l1.5-1' },
  pentagonalPrism: { geometry: { radius: 10, height: 20 }, color: '#9333ea',
                icon: 'M8 2L3 5.5l2 7h6l2-7z M3 5.5l5 1.5 5-1.5' },
  pentagonalPyramid: { geometry: { radius: 10, height: 20 }, color: '#ea580c',
                icon: 'M8 2L3 7l2 6h6l2-6z M3 7h10' },
  squarePyramid: { geometry: { radius: 10, height: 20 }, color: '#16a34a',
                icon: 'M8 2L2 12h12z M8 2l4.5 8 M8 2L3.5 10 M2 12h12' },
  ring:       { geometry: { outerRadius: 10, innerRadius: 6, height: 3 }, color: '#ca8a04', flat: true,
                icon: 'M8 4C4.7 4 2 5.8 2 8s2.7 4 6 4 6-1.8 6-4-2.7-4-6-4z M8 6c2 0 3.5.9 3.5 2S10 10 8 10 4.5 9.1 4.5 8 6 6 8 6z' },
  paraboloid: { geometry: { radius: 10, height: 20 }, color: '#e11d48',
                icon: 'M3 12c0-5 2.2-9 5-9s5 4 5 9z M3 12h10' },
  starSix:    { geometry: { outerRadius: 10, innerRadius: 5, points: 6, depth: 5 }, color: '#d97706', flat: true,
                icon: 'M8 1l2.5 4.5H15L12.5 8 15 10.5h-4.5L8 15l-2.5-4.5H1L3.5 8 1 5.5h4.5z' },
};

const IMPORTED_ICON = 'M4 2l4 2 4-2v8l-4 2-4-2z M4 4l4 2 4-2 M8 6v6';

export const TYPE_ICON_PATHS = Object.fromEntries([
  ...Object.entries(SHAPE_DEFAULTS).map(([k, v]) => [k, v.icon]),
  ['imported', IMPORTED_ICON],
]);

export const ALL_SHAPE_TYPES = Object.keys(SHAPE_DEFAULTS);

export const FLAT_TYPES = Object.entries(SHAPE_DEFAULTS)
  .filter(([, v]) => v.flat)
  .map(([k]) => k);

export const ICON_TYPES = Object.entries(SHAPE_DEFAULTS)
  .filter(([, v]) => !v.isText)
  .map(([k]) => k);

export const FLAT_ROTATION = [-Math.PI / 2, 0, 0];
export const DEFAULT_SHAPE_ROTATIONS = {
  tetrahedron: [1.219916915922639, 0.9086510911493443, 1.219916915922639],
};

// Mutable cursor state for high-frequency drag position updates (not in Zustand for perf)
export const dragCursor = { x: 0, y: 0, active: false };
export const sceneCamera = { current: null };
export const sceneInteracting = { active: false };

export { getFloorY };

const MAX_HISTORY = 50;

function cloneObjects(objects) {
  return objects.map((o) => ({
    ...o,
    position: [...o.position],
    rotation: [...o.rotation],
    scale: [...o.scale],
    geometry: { ...o.geometry },
  }));
}

function cloneGroups(groups) {
  return groups.map((g) => ({
    ...g,
  }));
}

function cloneSnapshot(objects, groups) {
  return {
    objects: cloneObjects(objects),
    groups: cloneGroups(groups || []),
  };
}

function buildGroupMembers(objects) {
  const map = new Map();
  for (const o of objects) {
    if (!o.groupId) continue;
    if (!map.has(o.groupId)) map.set(o.groupId, []);
    map.get(o.groupId).push(o.id);
  }
  return map;
}

function expandSelection(objects, selectedIds) {
  const members = buildGroupMembers(objects);
  const expanded = new Set(selectedIds);
  for (const id of selectedIds) {
    const obj = objects.find((o) => o.id === id);
    if (!obj?.groupId) continue;
    const ids = members.get(obj.groupId) || [];
    ids.forEach((gid) => expanded.add(gid));
  }
  return [...expanded];
}

function reconcileGroups(objects, groups) {
  const members = buildGroupMembers(objects);
  const validGroupIds = new Set();
  members.forEach((ids, gid) => {
    if (ids.length >= 2) {
      validGroupIds.add(gid);
    }
  });

  const filtered = (groups || []).filter((g) => validGroupIds.has(g.id));
  const known = new Set(filtered.map((g) => g.id));
  validGroupIds.forEach((gid) => {
    if (!known.has(gid)) filtered.push({ id: gid, name: "Group" });
  });
  return filtered;
}

export function getEffectiveSelectionIdsFromState(state) {
  return expandSelection(state.objects, state.selectedIds);
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
  groups: [],
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
  mirrorHint: null,
  mirrorMode: false,
  arrayPreview: null,
  workplaneMode: false,

  zoomIn: () => set({ _cameraCmd: 'in' }),
  zoomOut: () => set({ _cameraCmd: 'out' }),
  cameraHome: () => set({ _cameraCmd: 'home' }),
  cameraFit: () => set({ _cameraCmd: 'fit' }),
  clearCameraCmd: () => set({ _cameraCmd: null }),

  setPendingDrop: (drop) => set({ pendingDrop: drop }),
  clearPendingDrop: () => set({ pendingDrop: null }),
  setDraggingShape: (shape) => set({ draggingShape: shape }),
  clearDraggingShape: () => set({ draggingShape: null }),
  setArrayPreview: (preview) => set({ arrayPreview: preview }),
  clearArrayPreview: () => set({ arrayPreview: null }),

  _saveSnapshot: () => {
    const { objects, groups, _past } = get();
    const snap = cloneSnapshot(objects, groups);
    const past = _past.length >= MAX_HISTORY ? _past.slice(1) : [..._past];
    past.push(snap);
    set({ _past: past, _future: [] });
  },

  undo: () => {
    const { objects, groups, _past, _future } = get();
    if (_past.length === 0) return;
    const prev = _past[_past.length - 1];
    set({
      _past: _past.slice(0, -1),
      _future: [..._future, cloneSnapshot(objects, groups)],
      objects: prev.objects,
      groups: prev.groups || [],
      selectedIds: [],
      isDirty: true,
    });
  },

  redo: () => {
    const { objects, groups, _past, _future } = get();
    if (_future.length === 0) return;
    const next = _future[_future.length - 1];
    set({
      _future: _future.slice(0, -1),
      _past: [..._past, cloneSnapshot(objects, groups)],
      objects: next.objects,
      groups: next.groups || [],
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
      groupId: null,
      visible: true,
      geometry: { ...defaults.geometry },
      ...overrides,
    };
    if (FLAT_TYPES.includes(type) && !overrides.rotation) {
      obj.rotation = [...FLAT_ROTATION];
    } else if (DEFAULT_SHAPE_ROTATIONS[type] && !overrides.rotation) {
      obj.rotation = [...DEFAULT_SHAPE_ROTATIONS[type]];
    }
    const floorY = getFloorY(type, obj.geometry, obj.rotation, obj.scale);
    obj.position = [obj.position[0], floorY, obj.position[2]];
    set(state => ({
      objects: [...state.objects, obj],
      groups: reconcileGroups([...state.objects, obj], state.groups),
      selectedIds: [obj.id],
      isDirty: true,
    }));
    return obj.id;
  },

  removeObject: (id) => { get()._saveSnapshot(); set((state) => {
    const objects = state.objects.filter((o) => o.id !== id);
    const groups = reconcileGroups(objects, state.groups);
    return {
      objects,
      groups,
      selectedIds: state.selectedIds.filter((s) => s !== id),
      isDirty: true,
    };
  }); },

  removeSelected: () => { get()._saveSnapshot(); set((state) => {
    const effective = new Set(expandSelection(state.objects, state.selectedIds));
    const objects = state.objects.filter((o) => !effective.has(o.id));
    return {
      objects,
      groups: reconcileGroups(objects, state.groups),
      selectedIds: [],
      isDirty: true,
    };
  }); },

  updateObject: (id, updates) => { get()._saveSnapshot(); set(state => ({
    objects: state.objects.map(o => o.id === id ? { ...o, ...updates } : o),
    isDirty: true,
  })); },

  updateObjectSilent: (id, updates) => set(state => ({
    objects: state.objects.map(o => o.id === id ? { ...o, ...updates } : o),
    isDirty: true,
  })),

  batchUpdateObjects: (updates) => set(state => ({
    objects: state.objects.map(o => {
      const u = updates[o.id];
      return u ? { ...o, ...u } : o;
    }),
    isDirty: true,
  })),

  toggleLock: (id) => set(state => ({
    objects: state.objects.map(o => o.id === id ? { ...o, locked: !o.locked } : o),
  })),

  duplicateSelected: () => {
    get()._saveSnapshot();
    const state = get();
    const effective = expandSelection(state.objects, state.selectedIds);
    const selected = state.objects.filter((o) => effective.includes(o.id));
    const groupMap = new Map();
    const dupes = selected.map((o) => {
      let newGroupId = null;
      if (o.groupId) {
        if (!groupMap.has(o.groupId)) groupMap.set(o.groupId, uuidv4());
        newGroupId = groupMap.get(o.groupId);
      }
      return ({
      ...o,
      id: uuidv4(),
      name: `${o.name} Copy`,
      position: [o.position[0] + 10, o.position[1], o.position[2] + 10],
      groupId: newGroupId,
    });
    });
    const nextObjects = [...state.objects, ...dupes];
    const extraGroups = [...groupMap.values()].map((id, i) => ({ id, name: `Group Copy ${i + 1}` }));
    set({
      objects: nextObjects,
      groups: reconcileGroups(nextObjects, [...state.groups, ...extraGroups]),
      selectedIds: dupes.map(o => o.id),
      isDirty: true,
    });
  },

  arraySelected: (axis, count, spacing) => {
    get()._saveSnapshot();
    const state = get();
    const effective = expandSelection(state.objects, state.selectedIds);
    const selected = state.objects.filter((o) => effective.includes(o.id));
    const ai = { x: 0, y: 1, z: 2 }[axis];
    const allDupes = [];
    const groupMap = new Map();
    for (let i = 1; i <= count; i++) {
      selected.forEach((o) => {
        const pos = [...o.position];
        pos[ai] += spacing * i;
        let groupId = null;
        if (o.groupId) {
          const key = `${o.groupId}:${i}`;
          if (!groupMap.has(key)) groupMap.set(key, uuidv4());
          groupId = groupMap.get(key);
        }
        allDupes.push({ ...o, id: uuidv4(), name: `${o.name} ${i + 1}`, position: pos, groupId });
      });
    }
    const nextObjects = [...state.objects, ...allDupes];
    const extraGroups = [...new Set([...groupMap.values()])].map((id, i) => ({ id, name: `Array Group ${i + 1}` }));
    set({
      objects: nextObjects,
      groups: reconcileGroups(nextObjects, [...state.groups, ...extraGroups]),
      selectedIds: [...state.selectedIds, ...allDupes.map(o => o.id)],
      isDirty: true,
    });
  },

  setSelectedIds: (ids) => set((state) => ({
    selectedIds: expandSelection(state.objects, ids),
  })),

  selectObject: (id, addToSelection = false) => set((state) => {
    if (!id) return { selectedIds: [] };
    const obj = state.objects.find((o) => o.id === id);
    const targetIds = obj?.groupId
      ? state.objects.filter((o) => o.groupId === obj.groupId).map((o) => o.id)
      : [id];
    if (addToSelection) {
      const allSelected = targetIds.every((tid) => state.selectedIds.includes(tid));
      if (allSelected) {
        return {
          selectedIds: state.selectedIds.filter((sid) => !targetIds.includes(sid)),
        };
      }
      return { selectedIds: [...new Set([...state.selectedIds, ...targetIds])] };
    }
    return { selectedIds: targetIds };
  }),

  groupSelected: () => {
    get()._saveSnapshot();
    const state = get();
    const ids = expandSelection(state.objects, state.selectedIds);
    if (ids.length < 2) return;
    const groupId = uuidv4();
    const objects = state.objects.map((o) => (ids.includes(o.id) ? { ...o, groupId } : { ...o }));
    const groups = reconcileGroups(objects, [...state.groups, { id: groupId, name: `Group ${state.groups.length + 1}` }]);
    set({
      objects,
      groups,
      selectedIds: ids,
      isDirty: true,
    });
  },

  ungroupSelected: () => {
    get()._saveSnapshot();
    const state = get();
    const ids = expandSelection(state.objects, state.selectedIds);
    const selectedGroups = new Set(
      state.objects.filter((o) => ids.includes(o.id) && o.groupId).map((o) => o.groupId),
    );
    if (selectedGroups.size === 0) return;
    const objects = state.objects.map((o) => (
      selectedGroups.has(o.groupId) ? { ...o, groupId: null } : { ...o }
    ));
    const groups = reconcileGroups(objects, state.groups);
    set({
      objects,
      groups,
      selectedIds: ids,
      isDirty: true,
    });
  },

  clearSelection: () => set({ selectedIds: [], mirrorMode: false, workplaneMode: false }),
  selectAll: () => set(state => ({ selectedIds: state.objects.map(o => o.id) })),
  setTransformMode: (mode) => set({ transformMode: mode }),
  toggleMirrorMode: () => set((state) => ({ mirrorMode: !state.mirrorMode })),
  setMirrorMode: (v) => set({ mirrorMode: !!v }),
  toggleWorkplaneMode: () => set((state) => ({ workplaneMode: !state.workplaneMode })),
  setWorkplaneMode: (v) => set({ workplaneMode: !!v }),
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
    const effective = expandSelection(state.objects, state.selectedIds);
    if (effective.length < 2) return;
    get()._saveSnapshot();
    const selected = state.objects.filter(o => effective.includes(o.id));
    const ai = { x: 0, y: 1, z: 2 }[axis];
    let target;
    if (edge === 'min') target = Math.min(...selected.map(o => o.position[ai]));
    else if (edge === 'max') target = Math.max(...selected.map(o => o.position[ai]));
    else target = selected.reduce((s, o) => s + o.position[ai], 0) / selected.length;
    set({
      objects: state.objects.map(o => {
        if (!effective.includes(o.id)) return o;
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
    const selectedSet = new Set(expandSelection(state.objects, state.selectedIds));
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
    const effective = expandSelection(state.objects, state.selectedIds);
    const ai = { x: 0, y: 1, z: 2 }[axis];
    const selected = state.objects.filter(o => effective.includes(o.id));
    const center = selected.reduce((sum, o) => sum + o.position[ai], 0) / (selected.length || 1);
    set({
      objects: state.objects.map(o => {
        if (!effective.includes(o.id)) return o;
        const pos = [...o.position];
        pos[ai] = 2 * center - pos[ai];
        const scale = [...o.scale];
        scale[ai] *= -1;
        return { ...o, position: pos, scale };
      }),
      mirrorHint: { axis, at: Date.now() },
      mirrorMode: false,
      isDirty: true,
    });
  },

  replaceObjects: (oldIds, newObj) => { get()._saveSnapshot(); set(state => ({
    objects: [...state.objects.filter(o => !oldIds.includes(o.id)), { ...newObj, groupId: null }],
    groups: reconcileGroups([...state.objects.filter(o => !oldIds.includes(o.id)), { ...newObj, groupId: null }], state.groups),
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
      groupId: null,
      visible: true,
      geometry: { bufferGeometry },
    };
    set(state => ({
      objects: [...state.objects, obj],
      groups: reconcileGroups([...state.objects, obj], state.groups),
      selectedIds: [obj.id],
      isDirty: true,
    }));
  },

  saveProject: () => {
    const state = get();
    let id = state.projectId || uuidv4();
    const saveable = state.objects.map(o => {
      const { geometry, ...rest } = o;
      if (o.type === 'imported') {
        if (geometry.bufferGeometry) {
          try {
            return { ...rest, geometry: { bufferGeometryJSON: geometry.bufferGeometry.toJSON() } };
          } catch { return { ...rest, geometry: {} }; }
        }
        return { ...rest, geometry: {} };
      }
      return { ...rest, geometry };
    });
    const project = {
      id,
      name: state.projectName,
      objects: saveable,
      groups: state.groups || [],
      backgroundColor: state.backgroundColor,
      objectCounter,
      updatedAt: Date.now(),
    };
    const list = loadProjectList().filter(p => p.id !== id);
    list.unshift(project);
    try { saveProjectList(list); } catch (e) { console.warn('Project save failed (storage full?):', e); }
    set({ projectId: id, isDirty: false });
  },

  loadProject: (id) => {
    const list = loadProjectList();
    const project = list.find(p => p.id === id);
    if (!project) return;
    objectCounter = project.objectCounter || project.objects.length;
    const restoredObjects = project.objects.map(o => {
      if (o.type === 'imported' && o.geometry.bufferGeometryJSON) {
        try {
          const loader = new BufferGeometryLoader();
          return { ...o, geometry: { bufferGeometry: loader.parse(o.geometry.bufferGeometryJSON) } };
        } catch { return o; }
      }
      return o;
    });
    set({
      objects: restoredObjects,
      groups: project.groups || [],
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
      groups: [],
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
