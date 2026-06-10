import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

export interface WidgetDragItem {
  id: string;
  label: string;
  hidden?: boolean;
}

export interface WidgetDragGridProps {
  items: WidgetDragItem[];
  onReorder: (ids: string[]) => void;
  onToggleHidden?: (id: string) => void;
  title?: string;
}

interface SortableRowProps {
  item: WidgetDragItem;
  onToggleHidden?: (id: string) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ item, onToggleHidden }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 rounded-lg border ${
        isDragging ? 'border-primary bg-primary/10 shadow-md z-10' : 'border-app-border bg-app-card'
      } ${item.hidden ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        className="touch-none p-1 rounded-md text-app-muted hover:text-app-text hover:bg-app-toolbar cursor-grab active:cursor-grabbing shrink-0"
        aria-label={`Drag ${item.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="flex-1 text-sm text-app-text truncate">{item.label}</span>
      {onToggleHidden && (
        <button
          type="button"
          onClick={() => onToggleHidden(item.id)}
          className="text-xs px-2 py-1 rounded-md border border-app-border text-app-muted hover:text-app-text shrink-0"
        >
          {item.hidden ? 'Show' : 'Hide'}
        </button>
      )}
    </div>
  );
};

export const WidgetDragGrid: React.FC<WidgetDragGridProps> = ({
  items,
  onReorder,
  onToggleHidden,
  title = 'Drag to reorder widgets',
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = items.map((i) => i.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-primary uppercase tracking-wide">{title}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((item) => (
              <SortableRow key={item.id} item={item} onToggleHidden={onToggleHidden} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default WidgetDragGrid;
