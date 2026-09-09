import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Copy, ExternalLink, FileText, Flag, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Printer, Search } from 'lucide-react';
import { useProject } from '../../../store';
import { useDayViews, type DayView } from '../../../lib/dayView';
import { patchDayMeta } from '../../../lib/dayMeta';
import { getMarkableDayTypes } from '../../../lib/dayTypes';
import { rulesRelevantToDay } from '../../../lib/rulesEngine';
import { upsertNonShootDate } from '../../../lib/nonShootHelpers';
import { formatDateShort } from '../../../lib/utils';
import { usePersistState } from '../../../lib/persist';
import DropdownMenu from '../../DropdownMenu';
import DropdownItem from '../../DropdownItem';
import DropdownDivider from '../../DropdownDivider';
import Button from '../../Button';
import TimeField from '../../TimeField';
import DaySectionCard from './DaySectionCard';
import { DAY_SECTIONS } from './daySectionRegistry';
import type { DaySectionActions } from './daySectionTypes';
import { DayEventsModal } from '../../calendar/DayEventsModal';
import { EventAdderModal } from '../../calendar/EventAdderModal';
import DayReportPreview from '../../reports/DayReportPreview';
import CopyDayModal from './CopyDayModal';
import type { DayMeta, ScheduleRow } from '../../../types';

const PREFS_KEY = 'lemon_schedule_day_manager';

interface DayManagerPrefs {
  selectedIndex: number;
  collapsed: string[];
  previewOpen: boolean;
  search: string;
  callSheetDesignId: string;
  sidebarOpen: boolean;
}

const DEFAULT_PREFS: DayManagerPrefs = { selectedIndex: -1, collapsed: [], previewOpen: true, search: '', callSheetDesignId: '', sidebarOpen: false };

function weekStart(date: string): string {
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return date;
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

export interface DayManagerPageProps {
  headerTarget?: HTMLElement | null;
  initialDayIndex?: number | null;
  onTargetSeen?: () => void;
  onOpenScene?: (sceneId: string) => void;
  onOpenCallSheet?: (day: DayView) => void;
  onPrintCallSheet?: (day: DayView) => void;
  onPopOutDay?: (day: DayView) => void;
}

const DayManagerPage: React.FC<DayManagerPageProps> = ({
  initialDayIndex,
  onTargetSeen,
  onOpenScene,
  onOpenCallSheet,
  onPrintCallSheet,
  onPopOutDay,
}) => {
  const { state, dispatch, readOnly, activeCalendarVersion } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const { days, byIndex } = useDayViews();
  const [prefs, setPrefs] = usePersistState<DayManagerPrefs>(PREFS_KEY, DEFAULT_PREFS);
  const [eventsDate, setEventsDate] = useState<string | null>(null);
  const [adderDate, setAdderDate] = useState<string | null>(null);
  const [narrowPreview, setNarrowPreview] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [dayMenuOpen, setDayMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const dayListRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => {
    if (initialDayIndex != null && byIndex.has(initialDayIndex)) return byIndex.get(initialDayIndex)!;
    if (prefs.selectedIndex >= 0 && byIndex.has(prefs.selectedIndex)) return byIndex.get(prefs.selectedIndex)!;
    return days[0];
  }, [initialDayIndex, byIndex, prefs.selectedIndex, days]);

  useEffect(() => {
    if (selected && prefs.selectedIndex !== selected.sectionIndex) {
      setPrefs(p => ({ ...p, selectedIndex: selected.sectionIndex }));
    }
  }, [selected?.sectionIndex]);

  useEffect(() => {
    if (initialDayIndex != null) onTargetSeen?.();
  }, [initialDayIndex, onTargetSeen]);

  // Open the day menu scrolled to the current day (centred, so there's a little
  // padding above and below) — mirrors the DatePicker's relevant-month open.
  useEffect(() => {
    if (!dayMenuOpen) return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      dayListRef.current?.querySelector(`[data-day="${selected.sectionIndex}"]`)?.scrollIntoView({ block: 'center' });
    }));
    return () => cancelAnimationFrame(raf);
  }, [dayMenuOpen]);

  const filteredDays = useMemo(() => {
    const q = prefs.search.trim().toLowerCase();
    if (!q) return days;
    return days.filter(d =>
      d.label.toLowerCase().includes(q) ||
      d.date.includes(q) ||
      d.scenes.some(s => s.scene?.sceneNumber.toLowerCase().includes(q) || s.scene?.description.toLowerCase().includes(q)),
    );
  }, [days, prefs.search]);

  const weeks = useMemo(() => {
    const groups: { key: string; days: DayView[] }[] = [];
    for (const d of filteredDays) {
      const key = weekStart(d.date);
      let g = groups.find(x => x.key === key);
      if (!g) { g = { key, days: [] }; groups.push(g); }
      g.days.push(d);
    }
    return groups;
  }, [filteredDays]);

  const patchMeta = useCallback((patch: Partial<DayMeta>) => {
    if (!selected?.daybreakRow || !activeVersion) return;
    patchDayMeta(dispatch, activeVersion.id, selected.daybreakRow, patch);
  }, [selected?.daybreakRow, activeVersion, dispatch]);

  const patchRow = useCallback((updates: Partial<ScheduleRow>) => {
    if (!selected?.daybreakRow || !activeVersion) return;
    dispatch({ type: 'UPDATE_ROW', payload: { versionId: activeVersion.id, rowId: selected.daybreakRow.id, updates } });
  }, [selected?.daybreakRow, activeVersion, dispatch]);

  const setStatus = useCallback((date: string, statusKey: string | null) => {
    if (!activeCalendarVersion) return;
    const existing = (activeCalendarVersion.nonShootDates || []).find(n => n.date === date);
    const next = upsertNonShootDate(activeCalendarVersion.nonShootDates, date, {
      ...(existing || {}),
      date,
      status: statusKey || undefined,
    });
    dispatch({ type: 'UPDATE_CALENDAR_VERSION', payload: { id: activeCalendarVersion.id, nonShootDates: next } });
  }, [activeCalendarVersion, dispatch]);

  const callSheetDesign = useMemo(() => {
    const designs = project.reportDesigns || [];
    return designs.find(d => d.id === prefs.callSheetDesignId)
      || designs.find(d => /call\s*sheet/i.test(d.name))
      || designs.find(d => d.id === project.activeReportId)
      || designs[0];
  }, [project.reportDesigns, project.activeReportId, prefs.callSheetDesignId]);

  const actions: DaySectionActions = useMemo(() => ({
    openScene: onOpenScene,
    openEvents: date => setEventsDate(date),
    addEvents: date => setAdderDate(date),
    openCallSheet: () => selected && onOpenCallSheet?.(selected),
    printCallSheet: () => selected && onPrintCallSheet?.(selected),
    callSheetDesignId: callSheetDesign?.id || '',
    selectCallSheetDesign: id => setPrefs(p => ({ ...p, callSheetDesignId: id })),
  }), [onOpenScene, onOpenCallSheet, onPrintCallSheet, selected, callSheetDesign?.id, setPrefs]);

  const toggleSection = (id: string) => setPrefs(p => ({
    ...p,
    collapsed: p.collapsed.includes(id) ? p.collapsed.filter(x => x !== id) : [...p.collapsed, id],
  }));

  const selectDay = (index: number) => setPrefs(p => ({ ...p, selectedIndex: index }));

  const step = (delta: number) => {
    if (!selected) return;
    const i = days.findIndex(d => d.sectionIndex === selected.sectionIndex);
    const next = days[i + delta];
    if (next) selectDay(next.sectionIndex);
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
  };

  if (!selected) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-xs text-zinc-400">
        No production days yet — add day breaks on the stripboard.
      </div>
    );
  }

  const markable = getMarkableDayTypes(project);
  const relevantRules = rulesRelevantToDay(project.rules || [], selected.date);

  const sidebar = prefs.sidebarOpen && (
    <aside className="w-52 shrink-0 border-r border-zinc-200 bg-zinc-50 flex flex-col overflow-hidden">
      <div className="p-2 border-b border-zinc-200 flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={prefs.search}
            onChange={e => setPrefs(p => ({ ...p, search: e.target.value }))}
            placeholder="Search days…"
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-white border border-zinc-300 rounded outline-none focus:border-zinc-500"
          />
        </div>
        <button type="button" aria-label="Collapse day list" onClick={() => setPrefs(p => ({ ...p, sidebarOpen: false }))} className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200">
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>
      <div ref={listRef} tabIndex={0} onKeyDown={onListKeyDown} className="flex-1 overflow-y-auto py-1 outline-none">
        {weeks.map(week => (
          <div key={week.key}>
            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Week of {formatDateShort(week.key)}</div>
            {week.days.map(d => {
              const active = d.sectionIndex === selected.sectionIndex;
              return (
                <button
                  key={d.sectionIndex}
                  type="button"
                  onClick={() => selectDay(d.sectionIndex)}
                  className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-left transition-colors ${active ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-200/60 text-zinc-700'}`}
                >
                  <span className="text-xs font-semibold w-11 shrink-0">DAY {d.chronoDay}</span>
                  <span className={`text-[11px] truncate flex-1 min-w-0 ${active ? 'text-zinc-300' : 'text-zinc-500'}`}>{formatDateShort(d.date)}</span>
                  {d.violations.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500 text-white px-1.5 text-[10px] font-bold shrink-0" title={`${d.violations.length} conflict(s)`}>
                      <Flag className="w-2.5 h-2.5" />{d.violations.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        {filteredDays.length === 0 && <div className="px-3 py-4 text-xs text-zinc-400">No days match.</div>}
      </div>
    </aside>
  );

  const editor = (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <header className="shrink-0 bg-white border-b border-zinc-200 px-3 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          {!prefs.sidebarOpen && (
            <button type="button" aria-label="Show day list" onClick={() => setPrefs(p => ({ ...p, sidebarOpen: true }))} className="p-1.5 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100">
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center">
            <button type="button" onClick={() => step(-1)} aria-label="Previous day" className="p-1 rounded text-zinc-500 hover:bg-zinc-100"><ChevronLeft className="w-4 h-4" /></button>
            <button type="button" onClick={() => step(1)} aria-label="Next day" className="p-1 rounded text-zinc-500 hover:bg-zinc-100"><ChevronRight className="w-4 h-4" /></button>
          </div>

          <DropdownMenu
            open={dayMenuOpen}
            onClose={() => setDayMenuOpen(false)}
            onOpenChange={setDayMenuOpen}
            theme="light"
            width="w-60"
            trigger={
              <button type="button" className="flex items-center gap-2 rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-800 shadow-sm hover:bg-zinc-50">
                <span className="font-bold">DAY {selected.chronoDay}</span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
              </button>
            }
          >
            <div ref={dayListRef} className="flex flex-col">
              {weeks.map(week => (
                <React.Fragment key={week.key}>
                  <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Week of {formatDateShort(week.key)}</div>
                  {week.days.map(d => (
                    <div key={String(d.sectionIndex)} data-day={d.sectionIndex}>
                      <DropdownItem
                        selected={d.sectionIndex === selected.sectionIndex}
                        onClick={() => { selectDay(d.sectionIndex); setDayMenuOpen(false); }}
                      >
                        DAY {d.chronoDay} · {formatDateShort(d.date)}
                      </DropdownItem>
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </DropdownMenu>
          <span className="text-xs text-zinc-500">{formatDateShort(selected.date)}</span>

          <DropdownMenu
            open={statusOpen}
            onClose={() => setStatusOpen(false)}
            onOpenChange={setStatusOpen}
            theme="light"
            width="w-52"
            trigger={
              <Button variant="subtle" disabled={readOnly}>
                {selected.status ? (markable.find(t => t.key === selected.status)?.label || selected.status) : 'Work'}
                <ChevronDown className="w-3 h-3" />
              </Button>
            }
          >
            <DropdownItem selected={!selected.status} onClick={() => { setStatus(selected.date, null); setStatusOpen(false); }}>Work (default)</DropdownItem>
            {markable.map(t => (
              <DropdownItem key={t.key} selected={selected.status === t.key} onClick={() => { setStatus(selected.date, t.key); setStatusOpen(false); }}>{t.label}</DropdownItem>
            ))}
            <DropdownDivider />
            <DropdownItem onClick={() => { setEventsDate(selected.date); setStatusOpen(false); }}>Manage events…</DropdownItem>
          </DropdownMenu>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Call</span>
            <TimeField
              value={selected.daybreakRow?.daybreakCallTime || '08:00'}
              onChange={v => patchRow({ daybreakCallTime: v })}
              readOnly={readOnly}
              className="w-28"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Wrap</span>
            <span className="text-xs text-zinc-700 tabular-nums">{selected.wrap || '—'}</span>
          </div>

          {selected.violations.length > 0 && (
            <button
              type="button"
              onClick={() => document.querySelector('[data-section="conflicts"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 text-red-600 px-2 py-0.5 text-[11px] font-semibold hover:bg-red-100"
            >
              <Flag className="w-3 h-3" /> {selected.violations.length} conflict{selected.violations.length !== 1 ? 's' : ''}
            </button>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setNarrowPreview(v => !v)} className="lg:hidden inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-zinc-600 hover:text-zinc-900">
              <FileText className="w-3.5 h-3.5" /> {narrowPreview ? 'Manage' : 'Call Sheet'}
            </button>
            <DropdownMenu
              open={moreOpen}
              onClose={() => setMoreOpen(false)}
              onOpenChange={setMoreOpen}
              theme="light"
              width="w-52"
              trigger={
                <button type="button" aria-label="More day actions" className="p-1.5 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              }
            >
              <DropdownItem icon={<Copy className="w-3.5 h-3.5" />} onClick={() => { setCopyOpen(true); setMoreOpen(false); }}>Copy from day…</DropdownItem>
              <DropdownItem icon={<Printer className="w-3.5 h-3.5" />} onClick={() => { onPrintCallSheet?.(selected); setMoreOpen(false); }}>Print call sheet</DropdownItem>
              <DropdownItem icon={<ExternalLink className="w-3.5 h-3.5" />} onClick={() => { onPopOutDay?.(selected); setMoreOpen(false); }}>Pop out day</DropdownItem>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className={`flex-1 min-w-0 overflow-y-auto bg-gray-50 p-4 space-y-3 ${narrowPreview ? 'hidden lg:block' : ''}`} data-day-sections>
          {DAY_SECTIONS.map(def => {
            const Section = def.Component;
            const empty = def.isEmpty?.(selected) ?? false;
            return (
              <DaySectionCard
                key={def.id}
                data-section={def.id}
                title={def.title}
                icon={def.icon}
                summary={def.summary(selected)}
                collapsed={prefs.collapsed.includes(def.id)}
                onToggle={() => toggleSection(def.id)}
              >
                {empty ? <p className="text-xs text-zinc-400">Nothing here yet.</p> : (
                  <Section
                    day={selected}
                    patchMeta={patchMeta}
                    patchRow={patchRow}
                    readOnly={readOnly}
                    project={project}
                    dispatch={dispatch}
                    actions={actions}
                  />
                )}
              </DaySectionCard>
            );
          })}
        </div>

        {prefs.previewOpen && (
          <div className={`w-[46%] max-w-[640px] shrink-0 border-l border-zinc-200 flex flex-col overflow-hidden bg-zinc-100 ${narrowPreview ? '' : 'hidden lg:flex'}`} data-day-callsheet-pane>
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-200 bg-white shrink-0">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                <FileText className="w-3.5 h-3.5" /> Call Sheet · {callSheetDesign?.name || '—'}
              </span>
              <button type="button" onClick={() => setPrefs(p => ({ ...p, previewOpen: false }))} className="text-[11px] text-zinc-500 hover:text-zinc-900">Hide</button>
            </div>
            {callSheetDesign ? (
              <DayReportPreview design={callSheetDesign} sectionIndex={selected.sectionIndex} embedded onExit={() => {}} />
            ) : (
              <div className="flex-1 flex items-center justify-center p-4 text-xs text-zinc-400 text-center">No call-sheet design yet.</div>
            )}
          </div>
        )}
        {!prefs.previewOpen && (
          <button type="button" onClick={() => setPrefs(p => ({ ...p, previewOpen: true }))} className="hidden lg:flex items-center gap-1 px-2 border-l border-zinc-200 bg-white text-[11px] text-zinc-500 hover:text-zinc-900" style={{ writingMode: 'vertical-rl' }}>
            Call Sheet
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50" data-day-manager>
      {sidebar}
      {editor}
      {eventsDate && (
        <DayEventsModal
          dateKey={eventsDate}
          violations={byIndex.get(selected.sectionIndex)?.violations}
          rules={relevantRules}
          onClose={() => setEventsDate(null)}
        />
      )}
      {adderDate && <EventAdderModal date={adderDate} onClose={() => setAdderDate(null)} />}
      {copyOpen && <CopyDayModal target={selected} days={days} onClose={() => setCopyOpen(false)} />}
    </div>
  );
};

export default DayManagerPage;
