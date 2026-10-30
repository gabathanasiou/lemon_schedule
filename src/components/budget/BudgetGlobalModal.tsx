import React from 'react';
import { Globe2, Trash2 } from 'lucide-react';
import type { BudgetGlobal } from '../../types';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import { BudgetInput, NumberField } from './fields';
import { FormulaField } from './FormulaField';
import { buildFormulaBook } from '../../lib/budget/formulaBook';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-[color:var(--ui-text-muted)]">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </label>
  );
}

/**
 * The Library globals editor (roadmap 346): the ONE place a project global's
 * formula is authored with the shared `FormulaField` (autocomplete + book).
 * System globals are read-only here — the schedule owns their values.
 */
export function BudgetGlobalModal({
  open, global, globals, systemValues, readOnly, onClose, onUpdate, onDelete,
}: {
  open: boolean;
  global?: BudgetGlobal;
  globals: BudgetGlobal[];
  systemValues: Record<string, number>;
  readOnly: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<BudgetGlobal>) => void;
  onDelete: () => void;
}) {
  if (!global) return null;
  const system = !!global.system;
  const entries = buildFormulaBook(systemValues, globals);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Global — ${global.symbol}`}
      icon={<Globe2 className="w-3.5 h-3.5" />}
      width="max-w-md"
      footer={
        <ModalFooter>
          {!system && (
            <Button variant="subtle" className="text-red-600 mr-auto" onClick={onDelete} disabled={readOnly}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          )}
          <ModalFooterButton onClick={onClose}>Done</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-5 py-4 space-y-3">
        <Field label="Symbol">
          <BudgetInput value={global.symbol} onCommit={v => onUpdate({ symbol: v.trim().toUpperCase() })} readOnly={readOnly || system} placeholder="MY_RATE" />
        </Field>
        <Field label="Description">
          <BudgetInput value={global.description || ''} onCommit={v => onUpdate({ description: v || undefined })} readOnly={readOnly} />
        </Field>
        <Field label="Value">
          <NumberField value={Number(global.value) || 0} onCommit={v => onUpdate({ value: v, formula: undefined })} readOnly={readOnly || system} ariaLabel="Global value" />
        </Field>
        <Field label="Formula">
          <FormulaField
            value={global.formula || ''}
            onCommit={v => onUpdate({ formula: v || undefined })}
            entries={entries}
            readOnly={readOnly || system}
            ariaLabel={`Formula for ${global.symbol}`}
            placeholder="e.g. SHOOT_DAYS * 2"
          />
        </Field>
        {system && <p className="text-[10px] text-[color:var(--ui-text-faint)]">System globals are recomputed from the schedule and cannot be edited.</p>}
      </div>
    </Modal>
  );
}
