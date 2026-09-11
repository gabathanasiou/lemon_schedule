import React from 'react';
import { GripVertical } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Checkbox from '../Checkbox';
import type { ImportCharacter } from '../../lib/import';

function SortableCastRow({ character, index, id }: { character: ImportCharacter; index: number; id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: character.name });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <tr ref={setNodeRef} style={style} className={`border-b border-zinc-800/50 ${index % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/50'}`}>
      <td className="px-3 py-2 text-zinc-300 text-xs font-mono font-medium w-10">{id}</td>
      <td className="px-3 py-2 text-zinc-200 text-xs font-medium">{character.name}</td>
      <td className="px-3 py-2 text-zinc-500 text-[10px] font-mono">
        {character.scenes.slice(0, 5).join(', ')}{character.scenes.length > 5 ? '...' : ''}
      </td>
      <td className="px-3 py-2 w-8">
        <button {...attributes} {...listeners} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 cursor-grab active:cursor-grabbing transition-colors">
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

/** Board ID assignment table — shared by the append-review and script-diff stages. */
export function CastAssignmentTable({ castOrder, onReorder, startId, ids }: {
  castOrder: ImportCharacter[];
  onReorder: (next: ImportCharacter[]) => void;
  startId: number;
  ids?: (string | undefined)[];
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = castOrder.findIndex(c => c.name === active.id);
    const newIndex = castOrder.findIndex(c => c.name === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(castOrder, oldIndex, newIndex));
  };
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Board ID Assignment</h3>
      <p className="text-zinc-500 text-[10px] mb-2">Drag rows to reorder. Board IDs are assigned by row position (starting from {startId}).</p>
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={castOrder.map(c => c.name)} strategy={verticalListSortingStrategy}>
            <table className="w-full">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-10">#</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Name</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-24">In Scenes</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {castOrder.map((ch, i) => (
                  <SortableCastRow key={ch.name} character={ch} index={i} id={ids?.[i] ?? String(startId + i)} />
                ))}
              </tbody>
            </table>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

/** New / hidden category checklists — shared by the append-review and script-diff stages. */
export function CategoryChecklist({ title, hint, items, selected, onToggle }: {
  title: string;
  hint: string;
  items: { key: string; label: string }[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">{title}</h3>
      <p className="text-zinc-500 text-[10px] mb-2">{hint}</p>
      <div className="space-y-1.5">
        {items.map(({ key, label }) => (
          <div
            key={key}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors"
            onClick={() => onToggle(key)}
          >
            <Checkbox variant="plain" checked={selected.has(key)} onChange={() => onToggle(key)} labelClassName="text-zinc-300" />
            <span className="text-zinc-300 text-xs">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RenameProjectField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider shrink-0">Rename Project</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Leave blank to keep current title"
        className="flex-1 bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs px-3 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-zinc-600"
      />
    </div>
  );
}
