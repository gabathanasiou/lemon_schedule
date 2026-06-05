import React, { useState, useMemo } from 'react';
import { useProject } from '../../store';
import { X } from 'lucide-react';
import { EntityDropdown } from '../EntityDropdown';
import { Scene, ScheduleRow, ShootDayMeta, CastMember } from '../../types';

export interface DoodOptions {
  castIds: string[];
  dayInts: number[];
  includeNonShooting: boolean;
  showTotals: boolean;
}

interface DoodDialogProps {
  onPrint: (opts: DoodOptions) => void;
  onClose: () => void;
}

function formatDayDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function DoodDialog({ onPrint, onClose }: DoodDialogProps) {
  const { state } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const dayEntries = useMemo(() =>
    (Object.entries(activeVersion?.dayMeta || {}) as [string, { date?: string; unitCall?: string }][])
      .map(([k, v]) => ({ dayInt: Number(k), date: v.date ?? '', unitCall: v.unitCall ?? '08:00' }))
      .sort((a, b) => (a.date).localeCompare(b.date))
      .map((d, i) => ({ ...d, chrono: i + 1 })),
  [activeVersion]);

  const chronoToDayInt = useMemo(() => {
    const m: Record<number, number> = {};
    dayEntries.forEach(d => { m[d.chrono] = d.dayInt; });
    return m;
  }, [dayEntries]);

  const allCastIds = useMemo(() => {
    const ids = new Set<string>();
    for (const scene of project.scenes) {
      for (const id of scene.cast.split(',').map(c => c.trim()).filter(Boolean)) {
        ids.add(id);
      }
    }
    for (const m of project.castMembers || []) ids.add(m.id);
    return [...ids].sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.localeCompare(b);
    });
  }, [project.scenes, project.castMembers]);

  const [selectedCastIds, setSelectedCastIds] = useState<string[]>(allCastIds);
  const [selectedDayInts, setSelectedDayInts] = useState<Set<number>>(new Set(dayEntries.map(d => d.dayInt)));
  const [includeNonShooting, setIncludeNonShooting] = useState(true);
  const [showTotals, setShowTotals] = useState(true);

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

  const castItems = useMemo(() => allCastIds.map(id => ({
    id,
    name: project.castMembers?.find(m => m.id === id)?.name || '—',
  })), [allCastIds, project.castMembers]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[580px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-bold text-zinc-900">Day Out of Days</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200 space-y-4">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
                Cast Members
              </label>
              <EntityDropdown
                value={selectedCastIds.join(', ')}
                onChange={val => setSelectedCastIds(val.split(',').map(x => x.trim()).filter(Boolean))}
                items={castItems}
                positioning="fixed"
                mode="multi"
                displayMode="id"
                placeholder="e.g. 1, 2, 3"
                className="text-xs"
                renderItem={(item) => (
                  <>
                    <span className="text-zinc-400 shrink-0">{item.id}.</span>
                    <span className="truncate flex-1">{item.name || '—'}</span>
                  </>
                )}
              />
            </div>
            <div>
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
                renderItem={(item) => {
                  const entry = dayEntries.find(d => d.chrono === Number(item.id));
                  return (
                    <>
                      <span className="truncate flex-1 font-medium">{item.name}</span>
                      {entry?.date && <span className="text-xs text-zinc-500 shrink-0">{formatDayDateLong(entry.date)}</span>}
                    </>
                  );
                }}
              />
            </div>
          </div>

          <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200 space-y-3">
            <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-wider">Options</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={includeNonShooting} onChange={e => setIncludeNonShooting(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-zinc-700 font-medium">Include non-shooting days (grey columns)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={showTotals} onChange={e => setShowTotals(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-zinc-700 font-medium">Show totals columns</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
          <button
            onClick={() => onPrint({
              castIds: selectedCastIds,
              dayInts: [...selectedDayInts].sort((a, b) => a - b),
              includeNonShooting,
              showTotals,
            })}
            disabled={selectedCastIds.length === 0 || selectedDayInts.size === 0}
            className="px-6 py-2 bg-zinc-900 text-white text-sm font-bold rounded-lg hover:bg-zinc-800 transition-colors shadow-lg shadow-black/10 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
