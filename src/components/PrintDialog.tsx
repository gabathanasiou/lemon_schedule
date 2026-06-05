import React, { useState, useMemo } from 'react';
import { useProject } from '../store';
import { X } from 'lucide-react';
import { EntityDropdown } from './EntityDropdown';

function formatDayDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const year = d.getFullYear();
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const suffix = (day >= 11 && day <= 13) ? 'th' : suffixes[day % 10] || 'th';
  return `${weekday} ${day}${suffix} ${month} ${year}`;
}

export interface PrintOptions {
  showTimes: boolean;
  showDurations: boolean;
  showCastList: boolean;
  showExportDate: boolean;
  showPageNumbers: boolean;
  selectedDays: number[];
}

export default function PrintDialog({ onPrint, onClose }: { onPrint: (options: PrintOptions) => void; onClose: () => void }) {
  const { state } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const [showTimes, setShowTimes] = useState(true);
  const [showDurations, setShowDurations] = useState(true);
  const [showCastList, setShowCastList] = useState(true);
  const [showExportDate, setShowExportDate] = useState(true);
  const [showPageNumbers, setShowPageNumbers] = useState(true);

  const dayEntries = (Object.entries(activeVersion?.dayMeta || {}) as [string, { date?: string; unitCall?: string }][])
    .map(([k, v]) => ({ dayInt: Number(k), date: v.date ?? '', unitCall: v.unitCall ?? '08:00' }))
    .sort((a, b) => (a.date).localeCompare(b.date))
    .map((d, i) => ({ ...d, chrono: i + 1 }));

  const chronoToDayInt = useMemo(() => {
    const m: Record<number, number> = {};
    dayEntries.forEach(d => { m[d.chrono] = d.dayInt; });
    return m;
  }, [dayEntries]);

  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set(dayEntries.map(d => d.dayInt)));

  const toggleAll = () => {
    if (selectedDays.size === dayEntries.length) {
      setSelectedDays(new Set());
    } else {
      setSelectedDays(new Set(dayEntries.map(d => d.dayInt)));
    }
  };

  const dayItems = useMemo(() => dayEntries.map(d => ({
    id: String(d.chrono),
    name: `Day ${d.chrono}`,
  })), [dayEntries]);

  const dayValue = useMemo(() =>
    [...selectedDays]
      .map(d => dayEntries.find(e => e.dayInt === d)?.chrono)
      .filter((c): c is number => c != null)
      .sort((a, b) => a - b)
      .join(', ')
  , [selectedDays, dayEntries]);

  const handleDayChange = (val: string) => {
    const chronos = val.split(',').map(x => Number(x.trim())).filter(n => !isNaN(n) && chronoToDayInt[n]);
    setSelectedDays(new Set(chronos.map(c => chronoToDayInt[c])));
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-bold text-zinc-900">Print Schedule</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-wider mb-3">Schedule</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={showCastList} onChange={e => setShowCastList(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-zinc-700 font-medium">Cast List</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={showTimes} onChange={e => setShowTimes(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-zinc-700 font-medium">Call Times</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={showDurations} onChange={e => setShowDurations(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-zinc-700 font-medium">Durations</span>
                </label>
              </div>
            </div>
            <div className="border-t border-zinc-200 pt-4">
              <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-wider mb-3">Page Style</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={showExportDate} onChange={e => setShowExportDate(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-zinc-700 font-medium">Export Date</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={showPageNumbers} onChange={e => setShowPageNumbers(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-zinc-700 font-medium">Page Numbers</span>
                </label>
              </div>
            </div>
          </div>

          <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-wider">Days to Print</h3>
              <button onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                {selectedDays.size === dayEntries.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
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
            {dayEntries.length === 0 && (
              <p className="text-xs text-zinc-500 py-4 text-center">No days with dates configured yet.</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
          <button
            onClick={() => onPrint({
              showTimes,
              showDurations,
              showCastList,
              showExportDate,
              showPageNumbers,
              selectedDays: [...selectedDays].sort((a: number, b: number) => a - b),
            })}
            disabled={selectedDays.size === 0}
            className="px-6 py-2 bg-zinc-900 text-white text-sm font-bold rounded-lg hover:bg-zinc-800 transition-colors shadow-lg shadow-black/10 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
