import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateShort } from '../../../lib/utils';
import DropdownMenu from '../../DropdownMenu';
import DropdownItem from '../../DropdownItem';

/**
 * The ONE day selector — a `< [DAY N] >` group used by BOTH the Days page and
 * the call-sheet editor header. The whole group is the menu trigger (so the
 * dropdown opens aligned with the group's left edge); the chevron is dropped
 * because the row is obviously clickable. `theme` adapts to the light Days
 * page or the dark call-sheet editor; both headers share this component.
 */
export interface DayPickerOption {
  sectionIndex: number;
  chronoDay: number;
  date: string;
  /** Conflict count shown as a red dot in the list (no sidebar day list). */
  conflicts?: number;
}

export interface DayPickerProps {
  options: DayPickerOption[];
  selectedIndex: number;
  onSelect: (sectionIndex: number) => void;
  theme?: 'light' | 'dark';
  disabled?: boolean;
}

function weekStart(date: string): string {
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return date;
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

const DayPicker: React.FC<DayPickerProps> = ({ options, selectedIndex, onSelect, theme = 'light', disabled }) => {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const dark = theme === 'dark';

  const i = options.findIndex(o => o.sectionIndex === selectedIndex);
  const selected = i >= 0 ? options[i] : undefined;
  const canPrev = i > 0;
  const canNext = i >= 0 && i < options.length - 1;
  const step = (delta: number) => {
    const n = options[i + delta];
    if (n) { onSelect(n.sectionIndex); setOpen(false); }
  };

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

  const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };
  const arrowCls = `px-1.5 py-1 ${dark ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'} disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-inherit rounded transition-colors`;

  return (
    <DropdownMenu
      open={open}
      onClose={() => setOpen(false)}
      onOpenChange={setOpen}
      theme={dark ? 'dark' : 'light'}
      align="left"
      width="w-64"
      trigger={
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-label={`Select day${selected ? `, currently DAY ${selected.chronoDay}` : ''}`}
          className={`inline-flex items-center rounded border ${dark ? 'border-zinc-700 bg-zinc-950 text-zinc-200' : 'border-zinc-300 bg-white text-zinc-800 shadow-sm'} disabled:opacity-50`}
        >
          <span
            role="button"
            aria-label="Previous day"
            className={arrowCls}
            onClick={e => { stop(e); step(-1); }}
            onPointerDown={stop}
          >
            <ChevronLeft className="w-4 h-4" />
          </span>
          <span className={`px-2 text-xs font-bold whitespace-nowrap ${dark ? 'text-zinc-200' : 'text-zinc-800'}`}>
            DAY {selected?.chronoDay ?? '—'}
          </span>
          <span
            role="button"
            aria-label="Next day"
            className={arrowCls}
            onClick={e => { stop(e); step(1); }}
            onPointerDown={stop}
          >
            <ChevronRight className="w-4 h-4" />
          </span>
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
                  trailing={d.conflicts ? (
                    <span className="inline-flex items-center rounded-full bg-red-500 text-white px-1.5 text-[9px] font-bold" title={`${d.conflicts} conflict${d.conflicts !== 1 ? 's' : ''}`}>
                      {d.conflicts}
                    </span>
                  ) : undefined}
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
