import React from 'react';
import { Plus, Pencil, Link2 } from 'lucide-react';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import ColorField from '../ColorField';
import { IconGrid } from '../elements/IconGrid';

interface DayTypeFormProps {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  name: string;
  onNameChange: (v: string) => void;
  icon: string;
  onIconChange: (v: string) => void;
  color: string;
  onColorChange: (v: string) => void;
  attachable: boolean;
  onAttachableChange: (v: boolean) => void;
  onSubmit: () => void;
}

function DayTypeFormModal({ open, onClose, title, submitLabel, name, onNameChange, icon, onIconChange, color, onColorChange, attachable, onAttachableChange, onSubmit }: DayTypeFormProps) {
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title={title} width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={onSubmit} disabled={!name.trim()}>{submitLabel}</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-4">
        <div>
          <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSubmit(); }}
            autoFocus
            className="w-full mt-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
            placeholder="e.g. Rehearsal, Wrap, Tech Scout..."
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Icon</label>
          <IconGrid value={icon} onChange={onIconChange} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Color</label>
          <div className="mt-1">
            <ColorField value={color || '#000000'} onChange={onColorChange} size="sm" hexVariant="sm" />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Attach cast &amp; elements
          </label>
          <p className="text-[10px] text-zinc-600 mt-0.5">When a day is marked with this type, let it carry per-day cast/element lists (DOODs codes like travel/hold).</p>
          <div className="mt-1 flex gap-1">
            <button
              type="button"
              onClick={() => onAttachableChange(true)}
              className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${attachable ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => onAttachableChange(false)}
              className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${!attachable ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
            >
              No
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function AddDayTypeModal(props: Omit<DayTypeFormProps, 'open' | 'title' | 'submitLabel'> & { open: boolean }) {
  return <DayTypeFormModal {...props} title="Add Day Type" submitLabel="Create" />;
}

export function EditDayTypeModal(props: Omit<DayTypeFormProps, 'open' | 'title' | 'submitLabel'> & { open: boolean }) {
  return <DayTypeFormModal {...props} title="Edit Day Type" submitLabel="Save" />;
}