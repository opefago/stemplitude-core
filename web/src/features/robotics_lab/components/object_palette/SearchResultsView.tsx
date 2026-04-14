import type { DragEvent } from "react";
import type { SearchableObjectResult } from "../../objectPalette/search";
import type { SimulatorObjectDefinition } from "../../objectPalette/types";
import { ObjectItemCard } from "./ObjectItemCard";
import { EmptySearchState } from "./EmptySearchState";

interface SearchResultsViewProps {
  query: string;
  results: SearchableObjectResult[];
  onAdd: (item: SimulatorObjectDefinition) => void;
  onDragStart: (item: SimulatorObjectDefinition, event: DragEvent<HTMLButtonElement>) => void;
}

export function SearchResultsView({ query, results, onAdd, onDragStart }: SearchResultsViewProps) {
  if (results.length === 0) return <EmptySearchState query={query} />;

  return (
    <section className="robotics-object-search-results">
      <div className="robotics-object-search-results__header">
        <strong>Search results</strong>
        <span>{results.length} found</span>
      </div>
      <div className="robotics-object-search-results__items">
        {results.map((result) => (
          <ObjectItemCard key={result.object.id} item={result.object} onAdd={onAdd} onDragStart={onDragStart} />
        ))}
      </div>
    </section>
  );
}

