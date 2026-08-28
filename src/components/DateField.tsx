import React, { useState } from 'react';
import DropdownMenu from './DropdownMenu';
import DatePicker from './DatePicker';
import { X } from 'lucide-react';

/**
 * DateField — a date button that spawns the calendar in a floating chrome
 * panel (roadmap 46). A thin COMPOSITION of kit parts: the kit `DropdownMenu`
 * (dark panel, flip, outside/Escape close) hosts the kit `DatePicker`
 * (themeable dark). No custom positioning/portal code — the kit owns the
 * chrome, so this component is a candidate for promotion into `@gabriel/ui-kit`
 * (item 56's process, same as DatePicker → v0.1.34).
 *
 * - `variant="chrome"` (default): the chip button spawns the calendar panel.
 * - `variant="inline"`: the calendar renders directly (the rule editor's
 *   Dates box — seeing every date at once matters for multi-pick).
 * - `multi`: the picker stays open and its chip row removes individual dates
 *   (single mode collapses to the LATEST pick — the kit picker is a toggle).
 */
interface DateFieldProps {
  /** ISO `YYYY-MM-DD` keys ([] = none picked). */
  value: string[];
  onChange: (dates: string[]) => void;
  placeholder?: string;
  multi?: boolean;
  /** `chrome` (button → floating panel) or `inline` (calendar always visible). */
  variant?: 'chrome' | 'inline';
}

function shortLabel(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function summaryLabel(value: string[], placeholder: string): string {
  if (value.length === 0) return placeholder;
  const sorted = [...value].sort();
  if (sorted.length === 1) return shortLabel(sorted[0]);
  if (sorted.length === 2) return `${shortLabel(sorted[0])}, ${shortLabel(sorted[1])}`;
  return `${shortLabel(sorted[0])}, ${shortLabel(sorted[1])} +${sorted.length - 2}`;
}

const Picker = ({ value, onChange, multi }: { value: string[]; onChange: (dates: string[]) => void; multi?: boolean }) => (
  <DatePicker
    selected={value}
    onChange={(ds) => {
      // The kit picker is a TOGGLE (add/remove) — single mode collapses
      // to the latest pick (the last element), never the stale first.
      if (multi) {
        onChange(ds);
      } else {
        onChange(ds.length > 0 ? [ds[ds.length - 1]] : []);
      }
    }}
    theme="dark"
  />
);

export default function DateField({ value, onChange, placeholder = 'Pick a date', multi, variant = 'chrome' }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const hasValue = value.length > 0;

  if (variant === 'inline') {
    return (
      <div>
        <Picker value={value} onChange={onChange} multi={multi} />
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <DropdownMenu
        open={open}
        onOpenChange={setOpen}
        width="w-64"
        theme="dark"
        trigger={
          <button
            type="button"
            title={hasValue ? 'Change date' : placeholder}
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors select-none"
          >
            <span className="truncate">{summaryLabel(value, placeholder)}</span>
          </button>
        }
      >
        <Picker
          value={value}
          onChange={(ds) => {
            onChange(ds);
            if (!multi) setOpen(false);
          }}
          multi={multi}
        />
      </DropdownMenu>
      {hasValue && (
        <button
          type="button"
          aria-label="Clear date"
          title="Clear date"
          onClick={() => onChange([])}
          className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}