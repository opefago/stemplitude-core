import type { DragEvent } from "react";
import { useMemo, useState } from "react";
import { OBJECT_CATEGORIES } from "../../objectPalette/categories";
import { OBJECT_CATALOG } from "../../objectPalette/catalog";
import {
  createDefaultCollapsedMap,
  filterByDifficulty,
  groupObjectsByCategory,
  type DifficultyFilterMode,
} from "../../objectPalette/grouping";
import { searchObjectLibrary } from "../../objectPalette/search";
import type { SimulatorObjectDefinition } from "../../objectPalette/types";
import { ObjectCategorySection } from "./ObjectCategorySection";
import { ObjectSearchInput } from "./ObjectSearchInput";
import { SearchResultsView } from "./SearchResultsView";

interface ObjectPaletteProps {
  onAdd: (item: SimulatorObjectDefinition) => void;
  onDragStart: (item: SimulatorObjectDefinition, event: DragEvent<HTMLButtonElement>) => void;
}

export function ObjectPalette({ onAdd, onDragStart }: ObjectPaletteProps) {
  const [query, setQuery] = useState("");
  const [difficultyMode, setDifficultyMode] = useState<DifficultyFilterMode>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(createDefaultCollapsedMap);

  const filteredObjects = useMemo(
    () => filterByDifficulty(OBJECT_CATALOG.objects, difficultyMode),
    [difficultyMode],
  );
  const searchResults = useMemo(() => searchObjectLibrary(filteredObjects, query), [filteredObjects, query]);
  const grouped = useMemo(
    () => (query.trim() ? [] : groupObjectsByCategory(filteredObjects)),
    [filteredObjects, query],
  );

  return (
    <div className="robotics-object-palette">
      <ObjectSearchInput value={query} onChange={setQuery} />

      <div className="robotics-object-palette__filter-row">
        <div className="robotics-object-palette__difficulty">
          <button
            type="button"
            className={difficultyMode === "beginner" ? "is-active" : ""}
            onClick={() => setDifficultyMode("beginner")}
          >
            Beginner
          </button>
          <button type="button" className={difficultyMode === "all" ? "is-active" : ""} onClick={() => setDifficultyMode("all")}>
            All
          </button>
        </div>
        <div className="robotics-object-palette__chips" aria-hidden>
          {OBJECT_CATEGORIES.map((category) => (
            <span key={category.id}>{category.displayName}</span>
          ))}
        </div>
      </div>

      {query.trim() ? (
        <SearchResultsView query={query} results={searchResults} onAdd={onAdd} onDragStart={onDragStart} />
      ) : (
        <div className="robotics-object-palette__grouped">
          {grouped.map((group) => {
            const category = OBJECT_CATEGORIES.find((entry) => entry.id === group.categoryId);
            if (!category) return null;
            return (
              <ObjectCategorySection
                key={group.categoryId}
                category={category}
                items={group.items}
                collapsed={Boolean(collapsed[group.categoryId])}
                onToggle={() =>
                  setCollapsed((prev) => ({
                    ...prev,
                    [group.categoryId]: !prev[group.categoryId],
                  }))
                }
                onAdd={onAdd}
                onDragStart={onDragStart}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

