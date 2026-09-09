import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Copy, ExternalLink, FileText, Flag } from 'lucide-react';
import { useProject } from '../../../store';
import { useDayViews, type DayView } from '../../../lib/dayView';
import { patchDayMeta } from '../../../lib/dayMeta';
import { rulesRelevantToDay } from '../../../lib/rulesEngine';
import { IS_COARSE } from '../../../lib/device';
import { usePersistState } from '../../../lib/persist';
import DaySectionCard from './DaySectionCard';
import DayNav from './DayNav';
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
}

const templateZoneBlocks = (design: ReportDesign): ReportBlock[] =>
  findCallSheetZone(design.blocks || [])?.children || [];

const DayManagerPage: React.FC<DayManagerPageProps> = ({
  initialDayIndex,
  onTargetSeen,
  onOpenScene,
  onPrintCallSheet,
  onPopOutDay,
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
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-xs text-zinc-400">
        No production days yet — add day breaks on the stripboard.
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
            <FileText className="w-3.5 h-3.5" /> Call Sheet <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <DayNav options={navOptions} selectedIndex={selected.sectionIndex} onSelect={selectDay} theme="light" />

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

      <div className="flex-1 min-w-0 overflow-y-auto bg-gray-50 p-4 space-y-3" data-day-sections>
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
    </div>
  );
};

export default DayManagerPage;
