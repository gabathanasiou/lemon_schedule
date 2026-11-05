import React from 'react';
import { FolderTree, Plus, Trash2 } from 'lucide-react';
import type { BudgetAccount, BudgetCategory, BudgetGroupKind, BudgetSettings } from '../../types';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import ColorField from '../ColorField';
import { BudgetInput } from './fields';
import { SettingSelect } from './SettingSelect';
import { formatMoney } from '../../lib/budget/format';

const GROUP_OPTIONS: { v: BudgetGroupKind; l: string }[] = [
  { v: 'atl', l: 'ATL' },
  { v: 'btl', l: 'BTL' },
  { v: 'post', l: 'Post' },
  { v: 'other', l: 'Other' },
];

export interface BudgetNodeRollup {
  budgetCents: number;
  actualCents?: number;
  committedCents?: number;
  efcCents?: number;
}

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
  onUpdateCategory, onUpdateAccount, onDelete, onAdd, rollup, settings,
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
  /** Item 357 — the band's live rollup, so the (i) modal explains the money
   *  without closing it and hunting the sheet. */
  rollup?: BudgetNodeRollup;
  settings?: BudgetSettings;
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
        {rollup && (
          <div className="grid grid-cols-2 gap-2 rounded-md border border-[color:var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2">
            {([
              ['Budget', rollup.budgetCents],
              ['Actual', rollup.actualCents],
              ['Committed', rollup.committedCents],
              ['EFC', rollup.efcCents],
            ] as const).map(([name, cents]) => (
              <div key={name} className="flex flex-col gap-0.5">
                <span className="text-[9px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">{name}</span>
                <span className="text-xs font-semibold text-[color:var(--ui-text-strong)]">
                  {cents == null ? '—' : formatMoney(cents, settings)}
                </span>
              </div>
            ))}
          </div>
        )}
        <Field label="Number">
          <BudgetInput value={label.number} onCommit={v => update({ number: v.trim() })} readOnly={readOnly} placeholder="1000" />
        </Field>
        <Field label="Name">
          <BudgetInput value={label.name} onCommit={v => update({ name: v })} readOnly={readOnly} />
        </Field>
        {kind === 'category' && category && (
          <Field label="Group">
            <SettingSelect
              value={category.group}
              options={GROUP_OPTIONS}
              onChange={v => onUpdateCategory({ group: v as BudgetGroupKind })}
              disabled={readOnly}
              ariaLabel="Category group"
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
