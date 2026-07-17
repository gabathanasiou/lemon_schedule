import React, { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUpDown } from 'lucide-react';
import Modal, { ModalFooter } from './Modal';
import { IS_COARSE } from '../lib/device';

const SortableOption: React.FC<{ id: string; label: string }> = ({ id, label }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`px-3 py-2 rounded border border-zinc-800 bg-zinc-900/60 cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50 z-50' : ''}`}
    >
      <span className="text-xs text-zinc-200 select-none">{label}</span>
    </div>
  );
};

export function useCustomOrderSort() {
  const [customOrderModal, setCustomOrderModal] = useState<{
    open: boolean;
    criterion: string;
    title: string;
    options: string[];
  } | null>(null);

  const openCustomOrderModal = (criterion: string, title: string, options: string[]) => {
    setCustomOrderModal({ open: true, criterion, title, options });
  };

  const closeCustomOrderModal = () => {
    setCustomOrderModal(null);
  };

  return { customOrderModal, openCustomOrderModal, closeCustomOrderModal };
}

interface CustomOrderSortModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  options: string[];
  onSort: (order: string[]) => void;
}

export function CustomOrderSortModal({ open, onClose, title, options, onSort }: CustomOrderSortModalProps) {
  const [order, setOrder] = useState<string[]>(() => [...options]);

  React.useEffect(() => {
    if (open) {
      setOrder([...options]);
    }
  }, [open, options]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as string);
    const newIndex = order.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    setOrder(arrayMove(order, oldIndex, newIndex));
  };

  const handleReverse = () => {
    setOrder(prev => [...prev].reverse());
  };

  const handleSort = () => {
    onSort(order);
    onClose();
  };

  const itemPad = IS_COARSE ? 'px-4 py-2.5 text-sm' : 'px-3 py-1.5 text-xs';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-sm"
      footer={
        <ModalFooter>
          <div className="flex items-center gap-2">
            <div className="flex-1" />
            <button
              onClick={onClose}
              className={`${itemPad} rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors`}
            >
              Cancel
            </button>
            <button
              onClick={handleSort}
              className={`${itemPad} rounded bg-white text-zinc-900 font-semibold hover:bg-zinc-200 transition-colors`}
            >
              Sort
            </button>
          </div>
        </ModalFooter>
      }
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-zinc-400">Drag to reorder. Top items come first.</p>
          <button
            onClick={handleReverse}
            className="px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1 text-[10px]"
            title="Reverse order"
          >
            <ArrowUpDown className="w-3 h-3" />
            Reverse
          </button>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {order.map(item => (
                <SortableOption key={item} id={item} label={item} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </Modal>
  );
}
