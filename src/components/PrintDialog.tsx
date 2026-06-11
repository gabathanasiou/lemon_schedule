import React, { useState, useMemo } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { useProject } from '../store';
import { Printer, ChevronDown, Check } from 'lucide-react';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import { getFieldValueFromSample, getDefaultRibbonRows, FIELD_MAP } from '../lib/ribbonUtils';

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
  includeStatusDays: boolean;
  selectedRibbonId?: string;
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
  const [includeStatusDays, setIncludeStatusDays] = useState(true);
  const [selectedRibbonId, setSelectedRibbonId] = useState<string>(project.activeRibbonId || '');

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

  const toggleDayInt = (d: number) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  const ribbonDesigns = project.ribbonDesigns || [];

  return (
    <Modal open onClose={onClose} title="Print Schedule" icon={<Printer className="w-4 h-4" />} width="max-w-2xl"
      footer={
        <ModalFooter>
          <button onClick={onClose} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onPrint({ showTimes, showDurations, showCastList, showExportDate, showPageNumbers, includeStatusDays, selectedDays: [...selectedDays].sort((a, b) => a - b), selectedRibbonId })}
            disabled={selectedDays.size === 0}
            className="px-6 py-2 bg-zinc-900 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </button>
        </ModalFooter>
      }
    >
      <div className="px-6 py-4 space-y-5">
        <div className="space-y-4">
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-1.5 mb-3">Schedule</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={showCastList} onChange={e => setShowCastList(e.target.checked)} className="w-4 h-4 rounded border-zinc-600 bg-zinc-800" />
                <span className="text-xs text-zinc-300">Cast List</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={showTimes} onChange={e => setShowTimes(e.target.checked)} className="w-4 h-4 rounded border-zinc-600 bg-zinc-800" />
                <span className="text-xs text-zinc-300">Call Times</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={showDurations} onChange={e => setShowDurations(e.target.checked)} className="w-4 h-4 rounded border-zinc-600 bg-zinc-800" />
                <span className="text-xs text-zinc-300">Durations</span>
              </label>
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-1.5 mb-3">Page Style</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={showExportDate} onChange={e => setShowExportDate(e.target.checked)} className="w-4 h-4 rounded border-zinc-600 bg-zinc-800" />
                <span className="text-xs text-zinc-300">Export Date</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={showPageNumbers} onChange={e => setShowPageNumbers(e.target.checked)} className="w-4 h-4 rounded border-zinc-600 bg-zinc-800" />
                <span className="text-xs text-zinc-300">Page Numbers</span>
              </label>
            </div>
          </div>
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={includeStatusDays} onChange={e => setIncludeStatusDays(e.target.checked)} className="w-4 h-4 rounded border-zinc-600 bg-zinc-800" />
              <span className="text-xs text-zinc-300">Include hold / travel / holiday days</span>
            </label>
          </div>
        </div>

        {ribbonDesigns.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-1.5">Ribbon Layout</h3>
            <RadixDropdownMenu.Root>
              <RadixDropdownMenu.Trigger asChild>
                <button className="w-full flex items-center justify-between px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-xs text-zinc-200 hover:bg-zinc-900 transition-colors">
                  <span>{selectedRibbonId ? (ribbonDesigns.find(d => d.id === selectedRibbonId)?.name || 'Unknown') : 'Default layout'}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                </button>
              </RadixDropdownMenu.Trigger>
              <RadixDropdownMenu.Portal>
                <RadixDropdownMenu.Content
                  className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[10001] p-1 min-w-[180px]"
                  align="start"
                  sideOffset={4}
                  collisionPadding={8}
                >
                  <RadixDropdownMenu.Item
                    onSelect={() => setSelectedRibbonId('')}
                    className={`flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors outline-none cursor-pointer select-none ${selectedRibbonId === '' ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                  >
                    <span className="flex-1">Default layout</span>
                    {selectedRibbonId === '' && <Check className="w-3 h-3 shrink-0" />}
                  </RadixDropdownMenu.Item>
                  {ribbonDesigns.map(d => (
                    <RadixDropdownMenu.Item
                      key={d.id}
                      onSelect={() => setSelectedRibbonId(d.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors outline-none cursor-pointer select-none ${selectedRibbonId === d.id ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                    >
                      <span className="flex-1">{d.name}</span>
                      {selectedRibbonId === d.id && <Check className="w-3 h-3 shrink-0" />}
                    </RadixDropdownMenu.Item>
                  ))}
                </RadixDropdownMenu.Content>
              </RadixDropdownMenu.Portal>
            </RadixDropdownMenu.Root>
            {(() => {
              const rows = selectedRibbonId
                ? ribbonDesigns.find(d => d.id === selectedRibbonId)?.rows
                : getDefaultRibbonRows();
              if (!rows) return null;
              const sample = { sceneNumber: '5', intExt: 'INT', set: 'KITCHEN', dayNight: 'DAY', cast: '1, 2, 4', pageCount: '2 3/8', description: 'John makes breakfast.' };
              return (
                <div className="border border-zinc-700 rounded overflow-hidden bg-black text-white" style={{ fontFamily: 'Helvetica, sans-serif', fontSize: '8pt', lineHeight: 1.1 }}>
                  <div className="flex flex-col min-w-0">
                    {rows.map((row, ri) => (
                      <div key={row.id || ri} className="flex min-w-0" style={ri < rows.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.1)' } : {}}>
                        {row.cells.map((c, ci) => {
                          const val = c.field === 'text' ? (c.textContent || '') : getFieldValueFromSample(c.field);
                          const catLabel = (project.customCategories || []).find(x => x.key === c.field)?.label;
                          const fieldLabel = FIELD_MAP[c.field]?.label || catLabel || '';
                          const display = val ? `${c.prefix || ''}${c.prefix && val ? '\u00A0' : ''}${val}${c.suffix && val ? '\u00A0' : ''}${c.suffix || ''}` : fieldLabel;
                          return (
                            <div key={c.id} style={{
                              flex: `0 0 ${c.width}%`,
                              minWidth: 0,
                              padding: '3px 3px',
                              borderRight: ci < row.cells.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: c.wrap ? 'normal' : 'nowrap',
                              textAlign: c.align || 'left',
                              textTransform: c.field === 'set' ? 'uppercase' : 'none',
                              fontWeight: c.field === 'sceneNumber' ? 700 : 500,
                            }}>
                              {display || ''}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Days to Print</h3>
            <button onClick={toggleAll} className="text-[10px] text-zinc-400 hover:text-zinc-200 font-medium">
              {selectedDays.size === dayEntries.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="bg-zinc-950 border border-zinc-700 rounded-md overflow-y-auto max-h-48">
            {dayEntries.map(d => {
              const checked = selectedDays.has(d.dayInt);
              return (
                <button
                  key={d.dayInt}
                  onClick={() => toggleDayInt(d.dayInt)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${checked ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'}`}
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${checked ? 'bg-zinc-600 border-zinc-500' : 'border-zinc-600'}`}>
                    {checked && <svg className="w-3 h-3 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </span>
                  <span className="font-medium">Day {d.chrono}</span>
                  {d.date && <span className="text-zinc-500 ml-auto">{formatDayDateLong(d.date)}</span>}
                </button>
              );
            })}
            {dayEntries.length === 0 && (
              <div className="px-3 py-4 text-xs text-zinc-600 text-center">No days with dates configured yet.</div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
