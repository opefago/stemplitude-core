import React from 'react';
import { Eye, EyeOff, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useDesignStore } from './store';

const TYPE_ICONS = {
  box: '▣', sphere: '●', cylinder: '◎', cone: '▲', torus: '◉',
  wall: '▬', pyramid: '△', heart: '♥', star: '★', hemisphere: '◓',
  tube: '○', wedge: '◢', text: 'T', imported: '◆',
};

export default function SceneTree() {
  const objects = useDesignStore(s => s.objects);
  const selectedIds = useDesignStore(s => s.selectedIds);
  const selectObject = useDesignStore(s => s.selectObject);
  const updateObject = useDesignStore(s => s.updateObject);
  const removeObject = useDesignStore(s => s.removeObject);

  const moveObject = (index, dir) => {
    const newObjects = [...objects];
    const target = index + dir;
    if (target < 0 || target >= newObjects.length) return;
    [newObjects[index], newObjects[target]] = [newObjects[target], newObjects[index]];
    useDesignStore.setState({ objects: newObjects });
  };

  if (objects.length === 0) {
    return (
      <div className="dml-scene-tree">
        <p className="dml-tree-empty">No objects in scene</p>
      </div>
    );
  }

  return (
    <div className="dml-scene-tree">
      {objects.map((obj, i) => {
        const isSelected = selectedIds.includes(obj.id);
        return (
          <div
            key={obj.id}
            className={`dml-tree-item ${isSelected ? 'selected' : ''}`}
            onClick={(e) => selectObject(obj.id, e.shiftKey)}
          >
            <span className="dml-tree-icon" style={{ color: obj.isHole ? '#ff6b81' : obj.color }}>
              {TYPE_ICONS[obj.type] || '◆'}
            </span>
            <span className="dml-tree-name">{obj.name}</span>
            <div className="dml-tree-actions">
              <button
                className="dml-tree-btn"
                onClick={(e) => { e.stopPropagation(); moveObject(i, -1); }}
                disabled={i === 0}
              >
                <ChevronUp size={12} />
              </button>
              <button
                className="dml-tree-btn"
                onClick={(e) => { e.stopPropagation(); moveObject(i, 1); }}
                disabled={i === objects.length - 1}
              >
                <ChevronDown size={12} />
              </button>
              <button
                className="dml-tree-btn"
                onClick={(e) => { e.stopPropagation(); updateObject(obj.id, { visible: !obj.visible }); }}
              >
                {obj.visible !== false ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
              <button
                className="dml-tree-btn danger"
                onClick={(e) => { e.stopPropagation(); removeObject(obj.id); }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
