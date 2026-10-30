import React from 'react';
import { NumberInput, inputCls } from '@gabriel/ui-kit';
import { CommitInput } from '../CommitInput';

/** Modal text input on the kit's tokenized field (never a raw white box). */
export function BudgetInput({ value, onCommit, readOnly, placeholder, autoFocus, onEscape }: {
  value: string;
  onCommit: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onEscape?: () => void;
}) {
  return (
    <CommitInput
      value={value}
      onCommit={onCommit}
      readOnly={readOnly}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onEscape={onEscape}
      className={`${inputCls('md')} w-full`}
    />
  );
}

/**
 * Budget numeric fields — thin adapters over the kit `NumberInput`, the ONE
 * numeric primitive (`docs/BUDGETING-SURFACES.md` §10). Money crosses the
 * boundary as integer cents; these only format/parse.
 */

export function NumberField({
  value, onCommit, readOnly, min = -1_000_000_000, max = 1_000_000_000, step = 1, ariaLabel, placeholder,
}: {
  value: number;
  onCommit: (value: number) => void;
  readOnly?: boolean;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  placeholder?: string;
}) {
  return (
    <NumberInput
      value={value}
      min={min}
      max={max}
      fallback={0}
      step={step}
      onCommit={onCommit}
      readOnly={readOnly}
      ariaLabel={ariaLabel}
      placeholder={placeholder}
    />
  );
}

/** Money in whole display units: value is dollars, commits cents. */
export function MoneyField({
  cents, onCommit, readOnly, symbol, ariaLabel,
}: {
  cents: number;
  onCommit: (cents: number) => void;
  readOnly?: boolean;
  symbol?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      {symbol && <span className="text-xs text-[color:var(--ui-text-faint)] shrink-0">{symbol}</span>}
      <NumberField
        value={Math.round(cents) / 100}
        step={1}
        min={-1_000_000_000}
        max={1_000_000_000}
        readOnly={readOnly}
        ariaLabel={ariaLabel}
        onCommit={v => onCommit(Math.round(v * 100))}
      />
    </div>
  );
}

export function PercentField({
  value, onCommit, readOnly, ariaLabel,
}: {
  value: number;
  onCommit: (value: number) => void;
  readOnly?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      <NumberField
        value={value}
        step={0.5}
        min={0}
        max={100}
        readOnly={readOnly}
        ariaLabel={ariaLabel}
        onCommit={onCommit}
      />
      <span className="text-xs text-[color:var(--ui-text-faint)] shrink-0">%</span>
    </div>
  );
}
