import React, { useState } from 'react';
import { useProject } from '../store';
import { X, CheckSquare, Square } from 'lucide-react';

function pad(n: number): string { return String(n).padStart(2, '0'); }

function formatDays(days: number[]): string {
  if (days.length === 0) return 'None';
  let consecutive = true;
  for (let i = 1; i < days.length; i++) {
    if (days[i] !== days[i - 1] + 1) { consecutive = false; break; }
  }
  if (consecutive && days.length > 1) {
    return `Days#${pad(days[0])}-#${pad(days[days.length - 1])}`;
  }
  return `Day${days.map(d => `#${pad(d)}`).join('')}`;
}

function formatDayDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const year = d.getFullYear();
  const suffixes = ['TH', 'ST', 'ND', 'RD'];
  const suffix = (day >= 11 && day <= 13) ? 'TH' : suffixes[day % 10] || 'TH';
  return `${weekday} ${day}${suffix} ${month} ${year}`;
}

export interface PrintOptions {
  showTimes: boolean;
  showDurations: boolean;
  selectedDays: number[];
}

export default function PrintDialog({ onPrint, onClose }: { onPrint: (options: PrintOptions) => void; onClose: () => void }) {
  const { state } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const [showTimes, setShowTimes] = useState(true);
  const [showDurations, setShowDurations] = useState(true);

  const dayEntries = (Object.entries(activeVersion?.dayMeta || {}) as [string, { date?: string; unitCall?: string }][])
    .map(([k, v]) => ({ dayInt: Number(k), date: v.date ?? '', unitCall: v.unitCall ?? '08:00' }))
    .sort((a, b) => (a.date).localeCompare(b.date));

  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set(dayEntries.map(d => d.dayInt)));

  const toggleAll = () => {
    if (selectedDays.size === dayEntries.length) {
      setSelectedDays(new Set());
    } else {
      setSelectedDays(new Set(dayEntries.map(d => d.dayInt)));
    }
  };

  const toggleDay = (dayInt: number) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayInt)) next.delete(dayInt); else next.add(dayInt);
      return next;
    });
  };

  const versionName = activeVersion?.name || '';
  const versionShort = `V${(versionName.match(/\d+/) || ['1'])[0].padStart(2, '0')}`;
  const sanitizedTitle = (project.title || 'Schedule').replace(/[<>:"/\\|?*]/g, '');
  const timesPart = showTimes ? 'Timed' : 'NoTimes';
  const daysList = [...selectedDays].sort((a: number, b: number) => a - b);
  const daysPart = formatDays(daysList);
  const fileName = `${sanitizedTitle}_${versionShort}_${timesPart}_${daysPart}`;

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
          <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200 space-y-3">
            <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-wider">Columns</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={showTimes} onChange={e => setShowTimes(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-zinc-700 font-medium">Call Times</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={showDurations} onChange={e => setShowDurations(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-zinc-700 font-medium">Durations</span>
            </label>
          </div>

          <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-wider">Days to Print</h3>
              <button onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                {selectedDays.size === dayEntries.length ? (
                  <><Square className="w-3.5 h-3.5" /> Deselect all</>
                ) : (
                  <><CheckSquare className="w-3.5 h-3.5" /> Select all</>
                )}
              </button>
            </div>
            <div className="max-h-[300px] overflow-y-auto space-y-0.5">
              {dayEntries.map(({ dayInt, date }) => (
                <label
                  key={dayInt}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${selectedDays.has(dayInt) ? 'bg-white border border-zinc-200' : 'hover:bg-zinc-100'}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedDays.has(dayInt)}
                    onChange={() => toggleDay(dayInt)}
                    className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-zinc-800 font-medium">Day {dayInt}</span>
                  {date && <span className="text-xs text-zinc-500 truncate">{formatDayDateLong(date)}</span>}
                </label>
              ))}
              {dayEntries.length === 0 && (
                <p className="text-xs text-zinc-500 py-4 text-center">No days with dates configured yet.</p>
              )}
            </div>
          </div>

          <div className="bg-zinc-950 rounded-lg p-3 text-center">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">File name</span>
            <p className="text-white text-xs font-mono mt-0.5 break-all">{fileName}.pdf</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
          <button
            onClick={() => onPrint({
              showTimes,
              showDurations,
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
