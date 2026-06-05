import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface DatePickerProps {
  selected: string[];
  onChange: (dates: string[]) => void;
}

export const DatePicker: React.FC<DatePickerProps> = ({ selected, onChange }) => {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (key: string) => {
    if (selectedSet.has(key)) {
      onChange(selected.filter(d => d !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  const days = useMemo(() => {
    const total = daysInMonth(viewYear, viewMonth);
    const startDay = firstDayOfMonth(viewYear, viewMonth);
    const cells: { key: string; day: number; empty: boolean }[] = [];
    for (let i = 0; i < startDay; i++) cells.push({ key: `pad-${i}`, day: 0, empty: true });
    for (let d = 1; d <= total; d++) cells.push({ key: formatKey(viewYear, viewMonth, d), day: d, empty: false });
    return cells;
  }, [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const monthLabel = new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden w-full">
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 border-b border-zinc-200">
        <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-zinc-200 text-zinc-600">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-zinc-800">{monthLabel}</span>
        <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-zinc-200 text-zinc-600">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {DAYS.map(d => (
          <div key={d} className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider py-1.5 border-b border-zinc-100">{d}</div>
        ))}
        {days.map(cell => (
          cell.empty ? (
            <div key={cell.key} />
          ) : (
            <button
              key={cell.key}
              type="button"
              onClick={() => toggle(cell.key)}
              className={cn(
                'py-1.5 text-xs font-medium transition-colors border-b border-zinc-50 hover:bg-zinc-100',
                selectedSet.has(cell.key)
                  ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                  : 'text-zinc-700'
              )}
            >
              {cell.day}
            </button>
          )
        ))}
      </div>
      {selected.length > 0 && (
        <div className="px-3 py-2 border-t border-zinc-200 bg-zinc-50">
          <div className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-1.5">
            {selected.length} date{selected.length !== 1 ? 's' : ''} selected
          </div>
          <div className="flex flex-wrap gap-1">
            {selected.map(d => {
              const date = new Date(d + 'T00:00:00');
              const label = date.toLocaleString('default', { month: 'short', day: 'numeric' });
              return (
                <span key={d} className="inline-flex items-center gap-1 bg-zinc-200 text-zinc-700 rounded px-1.5 py-0.5 text-[10px] font-medium">
                  {label}
                  <button type="button" onClick={() => toggle(d)} className="hover:text-zinc-900 leading-none">&times;</button>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
