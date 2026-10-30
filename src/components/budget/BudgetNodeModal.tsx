import React from 'react';
import { FolderTree, Plus, Trash2 } from 'lucide-react';
import { Seg } from '@gabriel/ui-kit';
import type { BudgetAccount, BudgetCategory, BudgetGroupKind } from '../../types';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import ColorField from '../ColorField';
import { BudgetInput } from './fields';

const GROUP_OPTIONS: { v: BudgetGroupKind; l: string }[] = [
  { v: 'atl', l: 'ATL' },
  { v: 'btl', l: 'BTL' },
  { v: 'post', l: 'Post' },
  { v: 'other', l: 'Other' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-[color:var(--ui-text-muted)]">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </label>
  );
}

/** Category/account editor opened from the sheet's chevron action. Keeps the
 *  chart's numbers and names in one place — number is a label, ids stay stable. */
export function BudgetNodeModal({
  open, kind, category, account, readOnly, onClose,
  onUpdateCategory, onUpdateAccount, onDelete, onAdd,
}: {
  open: boolean;
  kind: 'category' | 'account';
  category?: BudgetCategory;
  account?: BudgetAccount;
  readOnly: boolean;
  onClose: () => void;
  onUpdateCategory: (updates: Partial<BudgetCategory>) => void;
  onUpdateAccount: (updates: Partial<BudgetAccount>) => void;
  onDelete: () => void;
  onAdd: () => void;
}) {
  const label = kind === 'category' ? category : account;
  if (!label) return null;
  const update = (updates: Partial<BudgetCategory> | Partial<BudgetAccount>) => {
    if (kind === 'category') onUpdateCategory(updates as Partial<BudgetCategory>);
    else onUpdateAccount(updates as Partial<BudgetAccount>);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${kind === 'category' ? 'Category' : 'Account'} — ${label.number} ${label.name}`}
      icon={<FolderTree className="w-3.5 h-3.5" />}
      width="max-w-md"
      footer={
        <ModalFooter>
          <Button variant="subtle" onClick={onAdd} disabled={readOnly}>
            <Plus className="w-3.5 h-3.5" /> {kind === 'category' ? 'Add account' : 'Add line'}
          </Button>
          <Button variant="subtle" className="text-red-600" onClick={onDelete} disabled={readOnly}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
          <ModalFooterButton onClick={onClose}>Done</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-5 py-4 space-y-3">
        <Field label="Number">
          <BudgetInput value={label.number} onCommit={v => update({ number: v.trim() })} readOnly={readOnly} placeholder="1000" />
        </Field>
        <Field label="Name">
          <BudgetInput value={label.name} onCommit={v => update({ name: v })} readOnly={readOnly} />
        </Field>
        {kind === 'category' && category && (
          <Field label="Group">
            <Seg
              variant="track"
              theme="dark"
              value={category.group}
              options={GROUP_OPTIONS}
              onChange={v => onUpdateCategory({ group: v as BudgetGroupKind })}
              disabled={readOnly}
            />
          </Field>
        )}
        {kind === 'category' && category && (
          <Field label="Color">
            <ColorField value={category.color || ''} onChange={(v) => onUpdateCategory({ color: v || undefined })} />
          </Field>
        )}
        <Field label="Notes">
          <BudgetInput value={label.notes || ''} onCommit={v => update({ notes: v })} readOnly={readOnly} />
        </Field>
      </div>
    </Modal>
  );
}
