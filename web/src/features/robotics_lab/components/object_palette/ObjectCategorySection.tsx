import type { DragEvent } from "react";
import type { ObjectCategoryDefinition, SimulatorObjectDefinition } from "../../objectPalette/types";
import { ObjectItemCard } from "./ObjectItemCard";

interface ObjectCategorySectionProps {
  category: ObjectCategoryDefinition;
  items: SimulatorObjectDefinition[];
  collapsed: boolean;
  onToggle: () => void;
  onAdd: (item: SimulatorObjectDefinition) => void;
  onDragStart: (item: SimulatorObjectDefinition, event: DragEvent<HTMLButtonElement>) => void;
}

export function ObjectCategorySection({
  category,
  items,
  collapsed,
  onToggle,
  onAdd,
  onDragStart,
}: ObjectCategorySectionProps) {
  return (
    <section className="robotics-object-category-section">
      <button className="robotics-object-category-section__header" onClick={onToggle} type="button">
        <span className="robotics-object-category-section__title">
          <span className="robotics-object-category-section__icon">{category.icon}</span>
          <strong>{category.displayName}</strong>
        </span>
        <span className="robotics-object-category-section__count">{items.length}</span>
      </button>
      {!collapsed ? (
        <>
          <p className="robotics-object-category-section__description">{category.description}</p>
          <div className="robotics-object-category-section__items">
            {items.map((item) => (
              <ObjectItemCard key={item.id} item={item} onAdd={onAdd} onDragStart={onDragStart} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

