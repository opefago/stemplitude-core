# Outline Rendering Checkpoint

**Date:** 2026-03-07

## State

- Inverted hull (cartoon hull) for all non-hole objects
- `cartoonRatio = 1.012`
- Hull uses `depthWrite={true}` for proper occlusion
- `showInnerEdges = !isImported` (ThickEdges disabled for imported/boolean objects)
- No post-processing Outline for imported objects

## Experiment: Inner Edges (threshold 65°)

Attempting ThickEdges for imported objects with high threshold to show only sharp boolean cuts.

## To Revert to Checkpoint

If crack lines appear, revert these two changes:

1. `showInnerEdges = true` → `showInnerEdges = !isImported`
2. `edgeThresholdAngle` for imported: `65` → `50` (or any value)

---

# Handle/Architecture Checkpoint

**Date:** 2026-03-08

## Current Handle State

- Text handles use axis scaling for `x/y/z` and include front/back depth handles.
- Handle spacing follows object extents (scales out/in with object size).
- Handle updates use hybrid source: state-driven when idle, mesh-driven while dragging.
- Imported and torus/tube handles use bounds-aware placement in `ObjectHandles`.

## Planned Refactor Entry Point

- Introduce behavior classes with a factory for transform-handle behavior.
- Keep Zustand state as plain serializable objects (no class instances in store).
- Add per-type overrides for `text`, `torus/tube`, and `imported`.

## Git Restore Points

- Branch checkpoint: `checkpoint/pre-oop-polymorphism`
- Tag checkpoint: `checkpoint-pre-oop-polymorphism`

## Restore Commands

- Restore from branch:
  - `git checkout checkpoint/pre-oop-polymorphism`
- Restore from tag:
  - `git checkout checkpoint-pre-oop-polymorphism`
