import type { CSSProperties, DragEvent } from "react";
import type { SimulatorObjectDefinition } from "../../objectPalette/types";

interface ObjectItemCardProps {
  item: SimulatorObjectDefinition;
  onAdd: (item: SimulatorObjectDefinition) => void;
  onDragStart: (item: SimulatorObjectDefinition, event: DragEvent<HTMLButtonElement>) => void;
}

export function ObjectItemCard({ item, onAdd, onDragStart }: ObjectItemCardProps) {
  const snapshotStyle = {
    "--snapshot-color": item.placement.color,
  } as CSSProperties;
  const snapshotShapeClass = `is-${item.placement.shape}`;
  const bodyClass = `is-${item.placement.physicsBody}`;

  return (
    <button
      className="robotics-object-item-card"
      draggable
      onDragStart={(event) => onDragStart(item, event)}
      onClick={() => onAdd(item)}
      title={item.description}
      aria-label={`Add ${item.displayName}`}
    >
      <span className={`robotics-object-item-card__snapshot ${snapshotShapeClass} ${bodyClass}`} style={snapshotStyle} aria-hidden>
        <span className="robotics-object-item-card__snapshot-floor" />
        <span className="robotics-object-item-card__snapshot-shape" />
        <span className="robotics-object-item-card__snapshot-glow" />
        <span className="robotics-object-item-card__snapshot-icon">{item.icon}</span>
      </span>
      <span className="robotics-object-item-card__content">
        <strong>{item.displayName}</strong>
        <small>{item.description}</small>
        <span className="robotics-object-item-card__meta">
          {item.difficulty === "beginner" ? "Beginner" : "Advanced"} ·{" "}
          {item.placement.physicsBody === "dynamic" ? "Dynamic" : item.placement.physicsBody === "kinematic" ? "Kinematic" : "Static"}
        </span>
      </span>
    </button>
  );
}

