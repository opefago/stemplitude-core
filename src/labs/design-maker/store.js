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
      if (o.type === 'imported') return { ...rest, geometry: {} };
      return { ...rest, geometry };
    });
    const project = {
      id,
      name: state.projectName,
      objects: saveable,
      groups: state.groups || [],
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
