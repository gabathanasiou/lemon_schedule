import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import DayPicker, { type DayPickerOption } from './DayPicker';

/**
 * The shared `< [DAY ▾] >` day navigator — one bordered group used by BOTH the
 * Days page header and the call-sheet editor header so the two chrome rows
 * match (prev arrow · day dropdown · next arrow, single theme).
 */
export interface DayNavProps {
  options: DayPickerOption[];
  selectedIndex: number;
  onSelect: (sectionIndex: number) => void;
  theme?: 'light' | 'dark';
  disabled?: boolean;
}

const DayNav: React.FC<DayNavProps> = ({ options, selectedIndex, onSelect, theme = 'light', disabled }) => {
  const dark = theme === 'dark';
  const i = options.findIndex(o => o.sectionIndex === selectedIndex);
  const canPrev = i > 0;
  const canNext = i >= 0 && i < options.length - 1;
  const step = (delta: number) => {
    const n = options[i + delta];
    if (n) onSelect(n.sectionIndex);
  };
  const edgeBtn = `p-1 ${dark ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'} disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit rounded transition-colors`;

  return (
    <div className={`inline-flex items-center rounded border ${dark ? 'border-zinc-700 bg-zinc-950' : 'border-zinc-300 bg-white shadow-sm'}`}>
      <button type="button" disabled={disabled || !canPrev} aria-label="Previous day" onClick={() => step(-1)} className={edgeBtn}>
        <ChevronLeft className="w-4 h-4" />
      </button>
      <DayPicker
        className="px-1"
        bare
        theme={theme}
        options={options}
        selectedIndex={selectedIndex}
        onSelect={onSelect}
        disabled={disabled}
      />
      <button type="button" disabled={disabled || !canNext} aria-label="Next day" onClick={() => step(1)} className={edgeBtn}>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default DayNav;
