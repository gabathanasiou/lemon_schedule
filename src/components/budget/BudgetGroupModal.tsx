import React from 'react';
import { Palette, Trash2 } from 'lucide-react';
import { Seg } from '@gabriel/ui-kit';
import type { BudgetGroup } from '../../types';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import ColorField from '../ColorField';
import { BudgetInput } from './fields';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-[color:var(--ui-text-muted)]">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </label>
  );
}

/** Shared group editor — the colour box is the app's ColorField (the same
 *  picker the Colors tab uses), never a bare hex text box. */
export function BudgetGroupModal({
  open, group, readOnly, onClose, onUpdate, onDelete,
}: {
  open: boolean;
  group: BudgetGroup;
  readOnly: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<BudgetGroup>) => void;
  onDelete: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Group — ${group.name}`}
      icon={<Palette className="w-3.5 h-3.5" />}
      width="max-w-md"
      footer={
        <ModalFooter>
          <Button variant="subtle" className="text-red-600" onClick={onDelete} disabled={readOnly}>
            <Trash2 className="w-3.5 h-3.5" /> Delete group
          </Button>
          <ModalFooterButton onClick={onClose}>Done</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-5 py-4 space-y-3">
        <Field label="Name">
          <BudgetInput value={group.name} onCommit={v => onUpdate({ name: v })} readOnly={readOnly} />
        </Field>
        <Field label="Colour">
          <ColorField value={group.color || ''} onChange={(v) => onUpdate({ color: v || undefined })} />
        </Field>
        <Field label="In budget">
          <Seg
            variant="track"
            theme="dark"
            value={group.inBudget === false ? 'no' : 'yes'}
            options={[{ v: 'yes', l: 'In budget' }, { v: 'no', l: 'Excluded' }]}
            onChange={v => onUpdate({ inBudget: v === 'yes' })}
            disabled={readOnly}
          />
        </Field>
        <Field label="Notes">
          <BudgetInput value={group.notes || ''} onCommit={v => onUpdate({ notes: v })} readOnly={readOnly} />
        </Field>
      </div>
    </Modal>
  );
}
