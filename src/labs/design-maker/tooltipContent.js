/**
 * Rich tooltip content for toolbar and floating toolbar buttons.
 * Each entry maps to a RichTip via its key.
 *
 * `video` paths are relative to /public — add .mp4/.webm files there.
 * Replace the placeholder demo video with actual per-feature recordings.
 */

const DEMO = '/assets/tips/group-demo.mp4';

const TOOLTIP_CONTENT = {
  undo: {
    description: 'Step backwards through your recent changes. Each undo reverses the last action you made.',
    video: DEMO,
  },
  redo: {
    description: 'Step forward to restore changes you previously undid.',
    video: DEMO,
  },
  solidView: {
    description: 'Show shapes as solid objects with shading and colour so you can see exactly what your design will look like.',
    video: DEMO,
  },
  wireframe: {
    description: 'Show shapes as transparent wireframes so you can see inside groups and overlapping objects.',
    video: DEMO,
  },
  grid: {
    description: 'Toggle the workplane grid on or off. The grid helps you line up shapes precisely.',
    video: DEMO,
  },
  ruler: {
    description: 'Show rulers along the edges of the workplane to measure distances and align shapes.',
    video: DEMO,
  },
  measure: {
    description: 'Measure the distance between any two points in your design. Click two spots to see the distance.',
    video: DEMO,
  },
  snapToFace: {
    description: 'When dragging a shape, it will snap onto the surface of other shapes instead of the workplane.',
    video: DEMO,
  },
  followShape: {
    description: 'The workplane follows and aligns to the selected shape so you can place new objects directly on its surface.',
    video: DEMO,
  },
  dropToFloor: {
    description: 'Move the selected shapes straight down so they sit flat on the workplane.',
    video: DEMO,
  },
  duplicate: {
    description: 'Create an identical copy of the selected shapes, placed slightly offset so you can see both.',
    video: DEMO,
  },
  mirror: {
    description: 'Create a mirrored copy of the selected shapes. Pick the X, Y, or Z axis in the scene to choose the mirror direction.',
    video: DEMO,
  },
  linearArray: {
    description: 'Create multiple evenly-spaced copies of the selected shapes along an axis. Great for making patterns and repeating elements.',
    video: DEMO,
  },
  delete: {
    description: 'Permanently remove the selected shapes from the scene.',
    video: DEMO,
  },
  alignX: {
    description: 'Line up all selected shapes so their centres are aligned along the X axis (left-right).',
    video: DEMO,
  },
  alignY: {
    description: 'Line up all selected shapes so their bottoms are aligned along the Y axis (up-down).',
    video: DEMO,
  },
  alignZ: {
    description: 'Line up all selected shapes so their centres are aligned along the Z axis (front-back).',
    video: DEMO,
  },

  group: {
    description: 'Join shapes together so you can move and resize them at the same time without making them one shape.',
    video: DEMO,
  },
  ungroup: {
    description: 'Break a group apart so you can move and edit each shape individually again.',
    video: DEMO,
  },
  merge: {
    description: 'Combine all selected shapes into one. Solid shapes are joined together and any shapes marked as holes are cut out automatically.',
    video: DEMO,
  },
  subtract: {
    description: 'Cut the second shape out of the first shape, like a cookie cutter. The first selected shape is the one that stays.',
    video: DEMO,
  },
  intersect: {
    description: 'Keep only the overlapping volume where all selected shapes meet. Everything else is removed.',
    video: DEMO,
  },

  importModel: {
    description: 'Load a 3D model file (STL or OBJ) from your computer into the scene.',
    video: DEMO,
  },
  exportModel: {
    description: 'Save your design as a 3D file you can use for 3D printing or in other programs.',
    video: DEMO,
  },
  settings: {
    description: 'Adjust application preferences like units, theme, and rendering quality.',
    video: DEMO,
  },
};

export default TOOLTIP_CONTENT;
