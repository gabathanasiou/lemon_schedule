import React, { useState, useMemo, useEffect, useCallback } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { useProject } from '../store';
import { Printer, ChevronDown, Check } from 'lucide-react';
import { RibbonCell } from '../types';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import { getFieldValueFromSample, FIELD_MAP, getRibbonCellBaseStyle, resolveSceneColor, getCellBorderProps, computeMergeGroups, formatCellText } from '../lib/ribbonUtils';
import { RibbonCellText } from './RibbonCellText';
import { useViewMode, useCellBorders, CellBorders } from '../lib/persist';

function formatDayDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const day = d.getDate();
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const suffix = (day >= 11 && day <= 13) ? 'th' : suffixes[day % 10] || 'th';
  return `${weekday}, ${day}${suffix}`;
}

const PREVIEW_SAMPLES = [
  { intExt: 'INT', dayNight: 'DAY' },
  { intExt: 'EXT', dayNight: 'DAY' },
  { intExt: 'INT', dayNight: 'NIGHT' },
];

export interface PrintOptions {
  showTimes: boolean;
  showDurations: boolean;
  showCastList: boolean;
  showExportDate: boolean;
  showPageNumbers: boolean;
  selectedDays: number[];
  includeStatusDays: boolean;
  selectedRibbonId?: string;
  cellBorders?: CellBorders;
  viewMode?: import('../lib/persist').ViewMode;
}

export default function PrintDialog({ onPrint, onClose }: { onPrint: (options: PrintOptions) => void; onClose: () => void }) {
  const { state } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const [viewMode, setViewMode, viewWidth] = useViewMode();
  const [currentCellBorders] = useCellBorders();

  const dayEntries = (Object.entries(activeVersion?.dayMeta || {}) as [string, { date?: string; unitCall?: string }][])
    .map(([k, v]) => ({ dayInt: Number(k), date: v.date ?? '', unitCall: v.unitCall ?? '08:00' }))
    .sort((a, b) => (a.date).localeCompare(b.date))
    .map((d, i) => ({ ...d, chrono: i + 1 }));

  const allDayInts = dayEntries.map(d => d.dayInt);

  const storageKey = `lemon_schedule_print_${project.id}`;
  const defaultSettings = {
    showTimes: true,
    showDurations: true,
    showCastList: true,
    showExportDate: true,
    showPageNumbers: true,
    includeStatusDays: true,
    selectedRibbonId: project.activeRibbonId || (project.ribbonDesigns[0]?.id || ''),
    cellBorders: currentCellBorders,
  };

  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    } catch { return defaultSettings; }
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch {}
  }, [storageKey, settings]);

  const persistDays = useCallback((days: number[]) => {
    try { localStorage.setItem(`${storageKey}_days`, JSON.stringify(days)); } catch {}
  }, [storageKey]);

  const [selectedDays, setSelectedDays] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem(`${storageKey}_days`);
      if (stored) {
        const arr: number[] = JSON.parse(stored);
        const valid = arr.filter(d => allDayInts.includes(d));
        return valid.length > 0 ? new Set(valid) : new Set(allDayInts);
      }
    } catch {}
    return new Set(allDayInts);
  });

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
    setSelectedDays(new Set(allDayInts));
    try { localStorage.removeItem(storageKey); localStorage.removeItem(`${storageKey}_days`); } catch {}
  }, [allDayInts, defaultSettings, storageKey]);

  const updateSelectedDays = useCallback((fn: (prev: Set<number>) => Set<number>) => {
    setSelectedDays(prev => {
      const next = fn(prev);
      persistDays([...next]);
      return next;
    });
  }, [persistDays]);

  const update = (patch: Partial<typeof defaultSettings>) => setSettings(s => ({ ...s, ...patch }));

  const toggleAll = () => {
    if (selectedDays.size === dayEntries.length) {
      updateSelectedDays(() => new Set());
    } else {
      updateSelectedDays(() => new Set(allDayInts));
    }
  };

  const toggleDayInt = (d: number) => {
    updateSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  const ribbonDesigns = project.ribbonDesigns || [];

  return (
    <Modal open onClose={onClose} onReset={resetSettings} title="Print Schedule" icon={<Printer className="w-4 h-4" />} width="max-w-3xl"
      footer={
        <ModalFooter>
          <button onClick={onClose} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onPrint({ showTimes: settings.showTimes, showDurations: settings.showDurations, showCastList: settings.showCastList, showExportDate: settings.showExportDate, showPageNumbers: settings.showPageNumbers, includeStatusDays: settings.includeStatusDays, selectedDays: [...selectedDays].sort((a, b) => a - b), selectedRibbonId: settings.selectedRibbonId, cellBorders: settings.cellBorders, viewMode })}
            disabled={selectedDays.size === 0}
            className="px-6 py-2 bg-zinc-900 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </button>
        </ModalFooter>
      }
    >
      <div className="px-6 py-4 space-y-4">
        {ribbonDesigns.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center border-b border-zinc-800 pb-1.5">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Ribbon Layout</span>
                <RadixDropdownMenu.Root>
                  <RadixDropdownMenu.Trigger asChild>
                    <button className="flex items-center justify-between px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-md text-xs text-zinc-200 hover:bg-zinc-900 transition-colors gap-1.5">
                      <span className="tabular-nums truncate max-w-[120px]">{settings.selectedRibbonId ? (ribbonDesigns.find(d => d.id === settings.selectedRibbonId)?.name || 'Unknown') : (ribbonDesigns[0]?.name || 'Unknown')}</span>
                      <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                    </button>
                  </RadixDropdownMenu.Trigger>
                  <RadixDropdownMenu.Portal>
                    <RadixDropdownMenu.Content
                      className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[10001] p-1 min-w-[180px]"
                      align="start"
                      sideOffset={4}
                      collisionPadding={8}
                    >
                      {ribbonDesigns.map(d => (
                        <RadixDropdownMenu.Item
                          key={d.id}
                          onSelect={() => update({ selectedRibbonId: d.id })}
                          className={`flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors outline-none cursor-pointer select-none ${settings.selectedRibbonId === d.id ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                        >
                          <span className="flex-1">{d.name}</span>
                          {settings.selectedRibbonId === d.id && <Check className="w-3 h-3 shrink-0" />}
                        </RadixDropdownMenu.Item>
                      ))}
                    </RadixDropdownMenu.Content>
                  </RadixDropdownMenu.Portal>
                </RadixDropdownMenu.Root>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Page Size</span>
                <RadixDropdownMenu.Root>
                  <RadixDropdownMenu.Trigger asChild>
                    <button className="flex items-center justify-between px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-md text-xs text-zinc-200 hover:bg-zinc-900 transition-colors gap-1.5">
                      <span className="tabular-nums">{viewMode === 'portrait' ? 'Portrait' : viewMode === 'landscape' ? 'Landscape' : 'Full'}</span>
                      <ChevronDown className="w-3 h-3 text-zinc-500" />
                    </button>
                  </RadixDropdownMenu.Trigger>
                  <RadixDropdownMenu.Portal>
                    <RadixDropdownMenu.Content
                      className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[10001] p-1 min-w-[180px]"
                      align="end"
                      sideOffset={4}
                      collisionPadding={8}
                    >
                      <RadixDropdownMenu.Item onSelect={() => setViewMode('portrait')} className={`flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors outline-none cursor-pointer select-none ${viewMode === 'portrait' ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}>
                        <span className="flex-1">Portrait</span>
                        {viewMode === 'portrait' && <Check className="w-3 h-3 shrink-0" />}
                      </RadixDropdownMenu.Item>
                      <RadixDropdownMenu.Item onSelect={() => setViewMode('landscape')} className={`flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors outline-none cursor-pointer select-none ${viewMode === 'landscape' ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}>
                        <span className="flex-1">Landscape</span>
                        {viewMode === 'landscape' && <Check className="w-3 h-3 shrink-0" />}
                      </RadixDropdownMenu.Item>
                      <RadixDropdownMenu.Item onSelect={() => setViewMode('full')} className={`flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors outline-none cursor-pointer select-none ${viewMode === 'full' ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}>
                        <span className="flex-1">Full Width</span>
                        {viewMode === 'full' && <Check className="w-3 h-3 shrink-0" />}
                      </RadixDropdownMenu.Item>
                    </RadixDropdownMenu.Content>
                  </RadixDropdownMenu.Portal>
                </RadixDropdownMenu.Root>
              </div>
            </div>
            {(() => {
              const design = settings.selectedRibbonId ? ribbonDesigns.find(d => d.id === settings.selectedRibbonId) : ribbonDesigns[0];
              const rows = design?.rows;
              const cw = design?.colWidths ?? [];
              const cellPaddingV = design?.cellPaddingV;
              const cellPaddingH = design?.cellPaddingH;
              if (!rows) return null;
              return (
                <div style={{
                  fontFamily: 'Helvetica, sans-serif', fontSize: '8pt', lineHeight: 1.1, border: '2px solid #000', overflow: 'hidden', maxWidth: viewWidth || undefined, margin: '0 auto',
                }}>
                  {rows.length >= 1 && PREVIEW_SAMPLES.map((sample, si) => {
                    const rowStyle = resolveSceneColor(sample.intExt, sample.dayNight, project.colorPalette?.sceneColors);
                    return (
                      <div key={si} className="flex items-stretch min-w-0" style={{ borderBottom: si < PREVIEW_SAMPLES.length - 1 ? '2px solid #000' : 'none' }}>
                        <div className="flex-1 min-w-0 flex flex-col" style={{ background: rowStyle.background, color: rowStyle.color, paddingTop: design?.edgePadding ?? 2, paddingBottom: design?.edgePadding ?? 2, paddingLeft: design?.edgePadding ?? 2, paddingRight: design?.edgePadding ?? 2 }}>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: cw.map(function (w) { return w + '%'; }).join(' '),
                            gridTemplateRows: 'repeat(' + String(rows.length) + ', auto)',
                          }}>
                            {(() => {
                              const mgroups = computeMergeGroups(rows);
                              const hiddenIds: Set<string> = new Set();
                              for (var _gi = 0; _gi < mgroups.length; _gi++) {
                                var g = mgroups[_gi];
                                for (var _ri = g.rowIndex + 1; _ri < g.rowIndex + g.span; _ri++) {
                                  var cell = rows[_ri] && rows[_ri].cells[g.colIndex];
                                  if (cell) hiddenIds.add(cell.id);
                                }
                              }
                              var items: { cell: RibbonCell; col: number; row: number; span: number }[] = [];
                              for (var ri = 0; ri < rows.length; ri++) {
                                for (var ci = 0; ci < rows[ri].cells.length; ci++) {
                                  var cell = rows[ri].cells[ci];
                                  if (hiddenIds.has(cell.id)) continue;
                                  var mg = mgroups.find(function (gg) { return gg.colIndex === ci && gg.rowIndex === ri; });
                                  items.push({ cell: cell, col: ci, row: ri, span: mg ? mg.span : 1 });
                                }
                              }
                               return items.map(function (p) {
                                 var cell = p.cell;
                                 var col = p.col;
                                 var row = p.row;
                                 var span = p.span;
                                 var hidden = (cell.field === 'callTime' && !settings.showTimes) || (cell.field === 'duration' && !settings.showDurations);
                                 var val = hidden ? '' : (cell.field === 'text' ? (cell.textContent || '') : getFieldValueFromSample(cell.field));
                                 var fieldLabel = hidden ? '' : (FIELD_MAP[cell.field]?.label || (project.customCategories || []).find(function (x) { return x.key === cell.field; })?.label || '');
                                 var display = val ? formatCellText(cell.prefix, val, cell.suffix) : fieldLabel;
                                 var lastVisRow = row + span - 1;
                                 var cellBorderStyle = getCellBorderProps(settings.cellBorders, rowStyle.color, col === rows[0].cells.length - 1, lastVisRow >= rows.length - 1);
                                 return (
                                   <div key={cell.id} style={{
                                     gridColumn: col + 1,
                                     gridRow: span ? (row + 1) + ' / span ' + span : row + 1,
                                     ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, span),
                                     borderRight: col < rows[0].cells.length - 1 ? (settings.cellBorders === 'vertical' || settings.cellBorders === 'both' ? '1px solid ' + rowStyle.color : '1px solid rgba(0,0,0,0.12)') : 'none',
                                     ...cellBorderStyle,
                                   }}>
                                     <RibbonCellText cell={cell} span={span} cellPadding={cellPaddingV}>
                                       {display || ''}
                                     </RibbonCellText>
                                   </div>
                                 );
                              });
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-1.5">Cell Borders</h3>
          <div className="flex gap-1.5">
            {(['none', 'vertical', 'horizontal', 'both'] as CellBorders[]).map(m => (
              <button
                key={m}
                onClick={() => update({ cellBorders: m })}
                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${settings.cellBorders === m ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
              >
                {m === 'none' ? 'None' : m === 'vertical' ? 'Vertical' : m === 'horizontal' ? 'Horizontal' : 'Both'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8">
          <div className="space-y-4 min-w-0">
            <div>
              <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-1.5 mb-3">Stripboard</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={settings.showTimes} onChange={e => update({ showTimes: e.target.checked })} className="w-4 h-4 rounded border-zinc-600 bg-zinc-800" />
                  <span className="text-xs text-zinc-300">Call Times</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={settings.showDurations} onChange={e => update({ showDurations: e.target.checked })} className="w-4 h-4 rounded border-zinc-600 bg-zinc-800" />
                  <span className="text-xs text-zinc-300">Durations</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={settings.includeStatusDays} onChange={e => update({ includeStatusDays: e.target.checked })} className="w-4 h-4 rounded border-zinc-600 bg-zinc-800" />
                  <span className="text-xs text-zinc-300">Hold / Travel / Holiday days</span>
                </label>
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-1.5 mb-3">Page Style</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={settings.showCastList} onChange={e => update({ showCastList: e.target.checked })} className="w-4 h-4 rounded border-zinc-600 bg-zinc-800" />
                  <span className="text-xs text-zinc-300">Cast List</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={settings.showExportDate} onChange={e => update({ showExportDate: e.target.checked })} className="w-4 h-4 rounded border-zinc-600 bg-zinc-800" />
                  <span className="text-xs text-zinc-300">Export date on title</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={settings.showPageNumbers} onChange={e => update({ showPageNumbers: e.target.checked })} className="w-4 h-4 rounded border-zinc-600 bg-zinc-800" />
                  <span className="text-xs text-zinc-300">Page numbers</span>
                </label>
              </div>
            </div>

          </div>

          <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
              <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Days to Print</h3>
              <button onClick={toggleAll} className="text-[10px] text-zinc-400 hover:text-zinc-200 font-medium">
                {selectedDays.size === dayEntries.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="bg-zinc-950 border border-zinc-700 rounded-md overflow-y-auto max-h-96">
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
                    {d.date && <span className="text-zinc-500 ml-auto">{formatDayDateShort(d.date)}</span>}
                  </button>
                );
              })}
              {dayEntries.length === 0 && (
                <div className="px-3 py-4 text-xs text-zinc-600 text-center">No days with dates configured yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
