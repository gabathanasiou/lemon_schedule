import React from 'react';
import { Plus, Pencil, Link2 } from 'lucide-react';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import ColorField from '../ColorField';
import { IconGrid } from '../elements/IconGrid';
import { Seg } from '@gabriel/ui-kit';

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
          <label className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSubmit(); }}
            autoFocus
            className="w-full mt-1 px-3 py-2 bg-[var(--ui-panel-bg)] border border-[color:var(--ui-input-border)] rounded-md text-xs text-[color:var(--ui-input-text)] placeholder:text-[color:var(--ui-text-faint)] outline-none focus:border-[color:var(--ui-input-focus-border)]"
            placeholder="e.g. Rehearsal, Wrap, Tech Scout..."
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider">Icon</label>
          <IconGrid value={icon} onChange={onIconChange} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider">Color</label>
          <div className="mt-1">
            <ColorField value={color || '#000000'} onChange={onColorChange} size="sm" hexVariant="sm" />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Attach cast &amp; elements
          </label>
          <p className="text-[10px] text-[color:var(--ui-text-faint)] mt-0.5">When a day is marked with this type, let it carry per-day cast/element lists (DOODs codes like travel/hold).</p>
          <div className="mt-1">
            <Seg
              variant="track"
              theme="dark"
              stretch
              value={attachable ? 'yes' : 'no'}
              options={[{ v: 'yes', l: 'Yes' }, { v: 'no', l: 'No' }]}
              onChange={v => onAttachableChange(v === 'yes')}
              ariaLabel="Attach cast & elements"
            />
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