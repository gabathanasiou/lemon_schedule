import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatDateShort } from '../../../lib/utils';
import DropdownMenu from '../../DropdownMenu';
import DropdownItem from '../../DropdownItem';

/**
 * Shared day switcher — the ONE day picker the Day Manager and the call-sheet
 * editor both use (extracted from the Days page header, roadmap 98). A DAY N
 * trigger opens a week-grouped production-day list, auto-scrolled to the
 * selected day. `theme` lets it sit on the light Days page or the dark
 * call-sheet editor header.
 */
export interface DayPickerOption {
  sectionIndex: number;
  chronoDay: number;
  date: string;
}

export interface DayPickerProps {
  options: DayPickerOption[];
  selectedIndex: number;
  onSelect: (sectionIndex: number) => void;
  theme?: 'light' | 'dark';
  /** Extra trigger width (dark header wants a fixed width so the chrome sits
   *  evenly). */
  className?: string;
  disabled?: boolean;
}

function weekStart(date: string): string {
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return date;
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

const DayPicker: React.FC<DayPickerProps> = ({ options, selectedIndex, onSelect, theme = 'light', className = '', disabled }) => {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const dark = theme === 'dark';

  const selected = options.find(o => o.sectionIndex === selectedIndex);

  // Scroll the menu to the current day (centred) on open.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-day="${selectedIndex}"]`)?.scrollIntoView({ block: 'center' });
    }));
    return () => cancelAnimationFrame(raf);
  }, [open, selectedIndex]);

  const weeks: { key: string; days: DayPickerOption[] }[] = [];
  for (const o of options) {
    const key = weekStart(o.date);
    let w = weeks.find(x => x.key === key);
    if (!w) { w = { key, days: [] }; weeks.push(w); }
    w.days.push(o);
  }

  return (
    <DropdownMenu
      open={open}
      onClose={() => setOpen(false)}
      onOpenChange={setOpen}
      theme={dark ? 'dark' : 'light'}
      width="w-60"
      trigger={
        <button
          type="button"
          disabled={disabled}
          className={
            dark
              ? `flex items-center gap-2 rounded bg-zinc-950 border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-50 ${className}`
              : `flex items-center gap-2 rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 ${className}`
          }
        >
          <span className="font-bold">DAY {selected?.chronoDay ?? '—'}</span>
          <ChevronDown className={`w-3.5 h-3.5 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`} />
        </button>
      }
    >
      <div ref={listRef} className="flex flex-col">
        {weeks.length === 0 && <div className="px-3 py-2 text-xs text-zinc-500">No production days yet.</div>}
        {weeks.map(week => (
          <React.Fragment key={week.key}>
            <div className={`px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Week of {formatDateShort(week.key)}
            </div>
            {week.days.map(d => (
              <div key={d.sectionIndex} data-day={d.sectionIndex}>
                <DropdownItem
                  selected={d.sectionIndex === selectedIndex}
                  onClick={() => { onSelect(d.sectionIndex); setOpen(false); }}
                >
                  DAY {d.chronoDay} · {formatDateShort(d.date)}
                </DropdownItem>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </DropdownMenu>
  );
};

export default DayPicker;
