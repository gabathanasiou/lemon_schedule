import React, { useState } from 'react';
import DropdownMenu from './DropdownMenu';
import DatePicker from './DatePicker';
import { DD_CHIP_TRIGGER_CLASS } from '../lib/dropdown';
import { ChevronDown } from 'lucide-react';

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
  /** Chrome only: when set, the wrapper + trigger stretch to fill their
   *  column (`flex w-full`, trigger `flex-1 justify-between`) — the event
   *  editor's Date / Event Type row. */
  className?: string;
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

export default function DateField({ value, onChange, placeholder = 'Pick a date', multi, variant = 'chrome', className }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const hasValue = value.length > 0;
  const fullWidth = !!className;

  if (variant === 'inline') {
    return (
      <div>
        <Picker value={value} onChange={onChange} multi={multi} />
      </div>
    );
  }

  return (
    <div className={`${fullWidth ? 'flex w-full' : 'inline-flex'} items-center gap-1 ${className || ''}`}>
      <DropdownMenu
        open={open}
        onOpenChange={setOpen}
        width="w-64"
        theme="dark"
        trigger={
          <button
            type="button"
            title={hasValue ? 'Change date' : placeholder}
            className={`${DD_CHIP_TRIGGER_CLASS} text-xs select-none transition-colors ${fullWidth ? 'flex-1 min-w-0 justify-between' : ''}`}
          >
            <span className="truncate">{summaryLabel(value, placeholder)}</span>
            <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
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
    </div>
  );
}