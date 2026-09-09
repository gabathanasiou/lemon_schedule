import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Clock, Copy, ExternalLink, Flag, Info } from 'lucide-react';
import ProductionDetailsModal from './ProductionDetailsModal';
import CallTimesSettingsModal from './CallTimesSettingsModal';
import { useProject } from '../../../store';
import { useDayViews, type DayView } from '../../../lib/dayView';
import { patchDayMeta } from '../../../lib/dayMeta';
import { rulesRelevantToDay } from '../../../lib/rulesEngine';
import { IS_COARSE } from '../../../lib/device';
import { usePersistState } from '../../../lib/persist';
import DaySectionCard from './DaySectionCard';
import DayPicker from './DayPicker';
import { DAY_SECTIONS } from './daySectionRegistry';
import type { DaySectionActions } from './daySectionTypes';
import { DayEventsModal } from '../../calendar/DayEventsModal';
import { EventAdderModal } from '../../calendar/EventAdderModal';
import CopyDayModal from './CopyDayModal';
import CallSheetEditPage from './CallSheetEditPage';
import { findCallSheetZone } from '../../../lib/reportBlocks';
import type { DayMeta, ReportBlock, ReportDesign, ScheduleRow } from '../../../types';

const PREFS_KEY = 'lemon_schedule_day_manager';

interface DayManagerPrefs {
  selectedIndex: number;
  collapsed: string[];
  callSheetDesignId: string;
}

const DEFAULT_PREFS: DayManagerPrefs = { selectedIndex: -1, collapsed: [], callSheetDesignId: '' };

export interface DayManagerPageProps {
  headerTarget?: HTMLElement | null;
  initialDayIndex?: number | null;
  onTargetSeen?: () => void;
  onOpenScene?: (sceneId: string) => void;
  onPrintCallSheet?: (day: DayView, design: ReportDesign, zoneBlocks?: ReportBlock[]) => void;
  onPopOutDay?: (day: DayView) => void;
  /** The call-sheet editor is a full-surface dark mode — report it so the
   *  host can darken the surrounding sub-tab chrome while it is open. */
  onChromeModeChange?: (dark: boolean) => void;
}

const templateZoneBlocks = (design: ReportDesign): ReportBlock[] =>
  findCallSheetZone(design.blocks || [])?.children || [];

const DayManagerPage: React.FC<DayManagerPageProps> = ({
  initialDayIndex,
  onTargetSeen,
  onOpenScene,
  onPrintCallSheet,
  onPopOutDay,
  onChromeModeChange,
}) => {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const { days, byIndex } = useDayViews();
  const [prefs, setPrefs] = usePersistState<DayManagerPrefs>(PREFS_KEY, DEFAULT_PREFS);
  const [eventsDate, setEventsDate] = useState<string | null>(null);
  const [adderDate, setAdderDate] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [editCallSheet, setEditCallSheet] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [callTimesOpen, setCallTimesOpen] = useState(false);

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

  // Darken the surrounding sub-tab chrome while the call-sheet editor is open
  // (and restore it on close / unmount).
  useEffect(() => {
    onChromeModeChange?.(editCallSheet);
    return () => onChromeModeChange?.(false);
  }, [editCallSheet, onChromeModeChange]);

  const navOptions = useMemo(
    () => days.map(d => ({ sectionIndex: d.sectionIndex, chronoDay: d.chronoDay, date: d.date, conflicts: d.violations.length })),
    [days],
  );

  const patchMeta = useCallback((patch: Partial<DayMeta>) => {
    if (!selected?.daybreakRow || !activeVersion) return;
    patchDayMeta(dispatch, activeVersion.id, selected.daybreakRow, patch);
  }, [selected?.daybreakRow, activeVersion, dispatch]);

  const patchRow = useCallback((updates: Partial<ScheduleRow>) => {
    if (!selected?.daybreakRow || !activeVersion) return;
    dispatch({ type: 'UPDATE_ROW', payload: { versionId: activeVersion.id, rowId: selected.daybreakRow.id, updates } });
  }, [selected?.daybreakRow, activeVersion, dispatch]);

  const callSheetDesign = useMemo(() => {
    const designs = project.reportDesigns || [];
    return designs.find(d => d.id === prefs.callSheetDesignId)
      || designs.find(d => /call\s*sheet/i.test(d.name))
      || designs.find(d => d.id === project.activeReportId)
      || designs[0];
  }, [project.reportDesigns, project.activeReportId, prefs.callSheetDesignId]);

  const storedZone = callSheetDesign ? selected?.meta.callSheets?.[callSheetDesign.id] : undefined;
  const hasZoneOverride = !!storedZone;
  const zoneBlocks = useMemo(
    () => (callSheetDesign ? (storedZone ?? templateZoneBlocks(callSheetDesign)) : []),
    [callSheetDesign, storedZone],
  );

  const patchZone = useCallback((blocks: ReportBlock[]) => {
    if (!callSheetDesign) return;
    patchMeta({ callSheets: { ...(selected?.meta.callSheets || {}), [callSheetDesign.id]: blocks } });
  }, [callSheetDesign, selected?.meta.callSheets, patchMeta]);

  const resetZone = useCallback(() => {
    if (!callSheetDesign) return;
    const next = { ...(selected?.meta.callSheets || {}) };
    delete next[callSheetDesign.id];
    patchMeta({ callSheets: Object.keys(next).length ? next : undefined });
  }, [callSheetDesign, selected?.meta.callSheets, patchMeta]);

  const actions: DaySectionActions = useMemo(() => ({
    openScene: onOpenScene,
    openEvents: date => setEventsDate(date),
    addEvents: date => setAdderDate(date),
    callSheetDesignId: callSheetDesign?.id || '',
    selectCallSheetDesign: id => setPrefs(p => ({ ...p, callSheetDesignId: id })),
  }), [onOpenScene, callSheetDesign?.id, setPrefs]);

  const toggleSection = (id: string) => setPrefs(p => ({
    ...p,
    collapsed: p.collapsed.includes(id) ? p.collapsed.filter(x => x !== id) : [...p.collapsed, id],
  }));

  const selectDay = (index: number) => setPrefs(p => ({ ...p, selectedIndex: index }));

  if (!selected) {
    return (
      <div className="flex-1 flex overflow-hidden bg-gray-50" data-day-manager>
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-white border border-zinc-200 flex items-center justify-center shadow-sm">
            <CalendarDays className="w-6 h-6 text-zinc-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-700">No production days yet</p>
            <p className="text-xs text-zinc-400 mt-1.5 max-w-sm leading-relaxed">
              Days appear here once you split the stripboard with a day break — open the Schedule tab, add a
              <span className="text-zinc-500"> Day Break</span> row, and drop scenes below it. Each break becomes a
              shooting day you can manage here.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-zinc-200 bg-white text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 shadow-sm"
            >
              <Info className="w-3.5 h-3.5" /> Production Details
            </button>
            <button
              type="button"
              onClick={() => setCallTimesOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-zinc-200 bg-white text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 shadow-sm"
            >
              <Clock className="w-3.5 h-3.5" /> Call Times
            </button>
          </div>
        </div>
        {detailsOpen && <ProductionDetailsModal onClose={() => setDetailsOpen(false)} />}
        {callTimesOpen && <CallTimesSettingsModal onClose={() => setCallTimesOpen(false)} />}
      </div>
    );
  }

  const relevantRules = rulesRelevantToDay(project.rules || [], selected.date);

  if (editCallSheet && callSheetDesign) {
    return (
      <CallSheetEditPage
        day={selected}
        days={days}
        design={callSheetDesign}
        designs={project.reportDesigns || []}
        zoneBlocks={zoneBlocks}
        hasOverride={hasZoneOverride}
        onChangeZone={patchZone}
        onReset={resetZone}
        onSelectDesign={id => setPrefs(p => ({ ...p, callSheetDesignId: id }))}
        onSelectDay={index => selectDay(index)}
        onPrint={() => onPrintCallSheet?.(selected, callSheetDesign, hasZoneOverride ? zoneBlocks : undefined)}
        onBack={() => setEditCallSheet(false)}
        readOnly={readOnly}
      />
    );
  }

  const renderSection = (def: (typeof DAY_SECTIONS)[number]) => {
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
  };

  const editor = (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <header className="shrink-0 bg-white border-b border-zinc-200 px-3 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setEditCallSheet(true)}
            disabled={!callSheetDesign}
            title="Open the call sheet editor for this day"
            className="inline-flex items-center justify-center gap-1.5 w-28 px-2 py-1 rounded text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 disabled:opacity-40"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Call Sheet
          </button>

          <DayPicker theme="light" options={navOptions} selectedIndex={selected.sectionIndex} onSelect={selectDay} />

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
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              title="Project-wide details, dates and key positions"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            >
              <Info className="w-3.5 h-3.5" /> Production Details
            </button>
            <button
              type="button"
              onClick={() => setCallTimesOpen(true)}
              title="Call-stage settings, category defaults and usual crew"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            >
              <Clock className="w-3.5 h-3.5" /> Call Times
            </button>
            <button
              type="button"
              onClick={() => setCopyOpen(true)}
              title="Copy from another day"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            >
              <Copy className="w-3.5 h-3.5" /> Copy from day
            </button>
            {!IS_COARSE && (
              <button
                type="button"
                onClick={() => onPopOutDay?.(selected)}
                title="Open this day in its own window"
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Pop out
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 min-w-0 overflow-y-auto bg-gray-50 p-4" data-day-sections>
        <div className="mx-auto w-full max-w-6xl">
          {/* The narrow meta sections (Day Details + Locations/Events/Conflicts)
              render as a two-column band on TOP — Day Details in the left
              column, the rest stacked right; the wide data-dense sections
              (scenes, call times, crew) span both columns beneath. */}
          {(() => {
            const narrow = DAY_SECTIONS.filter(d => !d.wide);
            if (narrow.length === 0) return null;
            const [left, ...right] = narrow;
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                <div className="min-w-0 space-y-3">{renderSection(left)}</div>
                <div className="min-w-0 space-y-3">{right.map(renderSection)}</div>
              </div>
            );
          })()}
          {DAY_SECTIONS.filter(d => d.wide).length > 0 && (
            <div className="mt-3 space-y-3">{DAY_SECTIONS.filter(d => d.wide).map(renderSection)}</div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50" data-day-manager>
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
      {detailsOpen && <ProductionDetailsModal onClose={() => setDetailsOpen(false)} />}
      {callTimesOpen && <CallTimesSettingsModal onClose={() => setCallTimesOpen(false)} />}
    </div>
  );
};

export default DayManagerPage;
