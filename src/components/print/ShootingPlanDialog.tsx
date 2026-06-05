import React, { useState, useMemo } from 'react';
import { useProject } from '../../store';
import { X } from 'lucide-react';
import { EntityDropdown } from '../EntityDropdown';

export interface ShootingPlanOptions {
  dayInts: number[];
}

interface ShootingPlanDialogProps {
  onPrint: (opts: ShootingPlanOptions) => void;
  onClose: () => void;
}

export default function ShootingPlanDialog({ onPrint, onClose }: ShootingPlanDialogProps) {
  const { state } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const dayEntries = useMemo(() =>
    (Object.entries(activeVersion?.dayMeta || {}) as [string, { date?: string }][])
      .map(([k, v]) => ({ dayInt: Number(k), date: v.date ?? '' }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d, i) => ({ ...d, chrono: i + 1 })),
  [activeVersion]);

  const chronoToDayInt = useMemo(() => {
    const m: Record<number, number> = {};
    dayEntries.forEach(d => { m[d.chrono] = d.dayInt; });
    return m;
  }, [dayEntries]);

  const [selectedDayInts, setSelectedDayInts] = useState<Set<number>>(new Set(dayEntries.map(d => d.dayInt)));

  const dayItems = useMemo(() => dayEntries.map(d => ({
    id: String(d.chrono),
    name: `Day ${d.chrono}`,
  })), [dayEntries]);

  const dayValue = useMemo(() =>
    [...selectedDayInts]
      .map(d => dayEntries.find(e => e.dayInt === d)?.chrono)
      .filter((c): c is number => c != null)
      .sort((a, b) => a - b)
      .join(', ')
  , [selectedDayInts, dayEntries]);

  const handleDayChange = (val: string) => {
    const chronos = val.split(',').map(x => Number(x.trim())).filter(n => !isNaN(n) && chronoToDayInt[n]);
    setSelectedDayInts(new Set(chronos.map(c => chronoToDayInt[c])));
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-bold text-zinc-900">Shooting Plan</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200">
            <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
              Days to Include
            </label>
            <EntityDropdown
              value={dayValue}
              onChange={handleDayChange}
              items={dayItems}
              positioning="fixed"
              standalone
              mode="multi"
              placeholder="e.g. 1, 2, 3"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
          <button
            onClick={() => onPrint({
              dayInts: [...selectedDayInts].sort((a, b) => a - b),
            })}
            disabled={selectedDayInts.size === 0}
            className="px-6 py-2 bg-zinc-900 text-white text-sm font-bold rounded-lg hover:bg-zinc-800 transition-colors shadow-lg shadow-black/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
