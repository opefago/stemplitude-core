import { describe, expect, it } from "vitest";
import { OBJECT_CATEGORIES } from "../../../src/features/robotics_lab/objectPalette/categories";
import { OBJECT_CATALOG, getObjectDefinitionById } from "../../../src/features/robotics_lab/objectPalette/catalog";
import { filterByDifficulty, groupObjectsByCategory } from "../../../src/features/robotics_lab/objectPalette/grouping";
import { createSceneObjectFromPalette } from "../../../src/features/robotics_lab/objectPalette/paletteToScene";
import { searchObjectLibrary } from "../../../src/features/robotics_lab/objectPalette/search";

describe("object palette catalog", () => {
  it("seeds at least 20 objects across all required categories", () => {
    expect(OBJECT_CATALOG.objects.length).toBeGreaterThanOrEqual(20);
    const covered = new Set(OBJECT_CATALOG.objects.map((entry) => entry.categoryId));
    for (const category of OBJECT_CATEGORIES) {
      expect(covered.has(category.id)).toBe(true);
    }
  });

  it("supports alias/tag search ranking", () => {
    const vexResults = searchObjectLibrary(OBJECT_CATALOG.objects, "vex ball");
    expect(vexResults.length).toBeGreaterThan(0);
    expect(vexResults[0].object.id).toBe("physics_rolling_ball");

    const goalResults = searchObjectLibrary(OBJECT_CATALOG.objects, "goal");
    expect(goalResults.length).toBeGreaterThan(0);
    expect(goalResults.some((result) => result.object.tags.includes("goal") || (result.object.aliases || []).includes("goal"))).toBe(true);
  });

  it("groups by deterministic category order", () => {
    const grouped = groupObjectsByCategory(OBJECT_CATALOG.objects);
    expect(grouped[0].categoryId).toBe(OBJECT_CATEGORIES[0].id);
    expect(grouped[grouped.length - 1].categoryId).toBe(OBJECT_CATEGORIES[OBJECT_CATEGORIES.length - 1].id);
  });

  it("filters beginner-safe objects", () => {
    const beginner = filterByDifficulty(OBJECT_CATALOG.objects, "beginner");
    expect(beginner.length).toBeGreaterThan(0);
    expect(beginner.every((entry) => entry.difficulty === "beginner")).toBe(true);
  });

  it("adapts palette objects into simulator scene shape", () => {
    const definition = getObjectDefinitionById("physics_rolling_ball");
    expect(definition).toBeTruthy();
    if (!definition) return;
    const sceneObject = createSceneObjectFromPalette(definition, 120, 160);
    expect(sceneObject.type).toBe(definition.placement.objectType);
    expect(sceneObject.position).toEqual({ x: 120, y: 0, z: 160 });
    expect(sceneObject.metadata?.palette_object_id).toBe(definition.id);
    expect(sceneObject.metadata?.render_shape).toBe("sphere");
    expect(sceneObject.metadata?.contact_mode).toBe("solid");
    expect(sceneObject.metadata?.friction_coefficient).toBeCloseTo(0.7, 3);
    expect(sceneObject.metadata?.restitution_coefficient).toBeCloseTo(0.3, 3);
  });

  it("propagates ramp contact metadata for slope-limited traversal", () => {
    const definition = getObjectDefinitionById("nav_ramp");
    expect(definition).toBeTruthy();
    if (!definition) return;
    const sceneObject = createSceneObjectFromPalette(definition, 80, 80);
    expect(sceneObject.metadata?.surface_type).toBe("ramp");
    expect(sceneObject.metadata?.slope_deg).toBeGreaterThan(0);
    expect(sceneObject.metadata?.ramp_entry_side).toBe("positive_x");
    expect(sceneObject.metadata?.ramp_side_blocking).toBe(true);
    expect(sceneObject.metadata?.support_surface_mode).toBe("ramp_profile");
    expect(sceneObject.metadata?.support_priority).toBe(30);
    expect(sceneObject.metadata?.friction_combine).toBe("average");
  });
});

