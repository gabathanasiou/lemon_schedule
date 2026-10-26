import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ThemeScope, useSlidingPill, TAB_PILL } from '@gabriel/ui-kit';
import { ArrowLeft, CalendarDays, ChevronDown, Clapperboard, Clock, Copy, ExternalLink, Flag, Info, LayoutGrid, MapPin, Plus, UsersRound } from 'lucide-react';
import ProductionDetailsModal from './ProductionDetailsModal';
import CallTimesSettingsModal from './CallTimesSettingsModal';
import { useProject, useProjectTheme } from '../../../store';
import { useDayViews, type DayView } from '../../../lib/dayView';
import { useFollowView } from '../../../lib/supabase/useFollowView';
import { patchDayMeta } from '../../../lib/dayMeta';
import { projectAccentOf } from '../../../lib/projectTheme';
import { CHROME_TAB_GAP } from '../../../lib/chromeSpacing';
import { assignSlotPerson, slotsForDay } from '../../../lib/dayCrew';
import { locationFromPick } from '../../../lib/locations';
import type { PickedLocation } from '../../../lib/places';
import { rulesRelevantToDay } from '../../../lib/rulesEngine';
import { IS_COARSE } from '../../../lib/device';
import { usePersistState } from '../../../lib/persist';
import DaySectionCard from './DaySectionCard';
import DayPicker from './DayPicker';
import Button from '../../Button';
import DropdownMenu from '../../DropdownMenu';
import DropdownItem from '../../DropdownItem';
import DropdownDivider from '../../DropdownDivider';
import { DAY_SECTIONS } from './daySectionRegistry';
import type { DaySectionActions } from './daySectionTypes';
import { DAY_MANAGER_TAB_LABELS, isDayManagerTab, type DayManagerTab } from '../../../lib/dayTabs';
import { DayEventsModal } from '../../calendar/DayEventsModal';
import { EventAdderModal } from '../../calendar/EventAdderModal';
import { EventModal } from '../../calendar/EventModal';
import CopyDayModal from './CopyDayModal';
import CallSheetEditPage from './CallSheetEditPage';
import AddCrewMemberModal from '../../crew/AddCrewMemberModal';
import { findDesignCallSheetZone } from '../../../lib/reportBlocks';
import type { DayMeta, ReportBlock, ReportDesign, ScheduleRow } from '../../../types';
import { useReportCtx } from '../../../lib/useReportCtx';
import { daySunWeather } from '../../../lib/reportWeather';
import { useSunWeather } from '../../../lib/useSunWeather';

const PREFS_KEY = 'lemon_schedule_day_manager';

interface DayManagerPrefs {
  selectedIndex: number;
  collapsed: string[];
  callSheetDesignId: string;
  /** Last category tab — the uncontrolled (pop-out) source and the main
   *  window's fallback when the URL has no tab. */
  tab: DayManagerTab;
}

const DEFAULT_PREFS: DayManagerPrefs = { selectedIndex: -1, collapsed: [], callSheetDesignId: '', tab: 'overview' };

/** The category strip — the same labelled icon tabs as the mini bars. */
const DAY_TAB_OPTIONS: { id: DayManagerTab; label: string; title: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: DAY_MANAGER_TAB_LABELS.overview, title: 'Day details, breaks & notes, events and conflicts', icon: <Info className="w-3.5 h-3.5" /> },
  { id: 'all', label: DAY_MANAGER_TAB_LABELS.all, title: 'Show every card', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  { id: 'locations', label: DAY_MANAGER_TAB_LABELS.locations, title: 'Locations', icon: <MapPin className="w-3.5 h-3.5" /> },
  { id: 'scenes', label: DAY_MANAGER_TAB_LABELS.scenes, title: 'Scenes', icon: <Clapperboard className="w-3.5 h-3.5" /> },
  { id: 'callTimes', label: DAY_MANAGER_TAB_LABELS.callTimes, title: 'Call times', icon: <Clock className="w-3.5 h-3.5" /> },
  { id: 'crew', label: DAY_MANAGER_TAB_LABELS.crew, title: 'Crew', icon: <UsersRound className="w-3.5 h-3.5" /> },
];

export interface DayManagerPageProps {
  headerTarget?: HTMLElement | null;
  /** Second toolbar slot, immediately left of the view switcher (roadmap 177):
   *  the day selector portals there in BOTH Days views. */
  dayPickerTarget?: HTMLElement | null;
  initialDayIndex?: number | null;
  onTargetSeen?: () => void;
  /** Production → Days sub-sub mode (roadmap 176). Uncontrolled when omitted
   *  (pop-out day windows); the main window passes App's history-backed state. */
  dayMode?: 'manager' | 'callsheet';
  onDayModeChange?: (mode: 'manager' | 'callsheet') => void;
  /** Category tab (roadmap 315). Uncontrolled when omitted (pop-out windows
   *  remember their own tab); the main window passes the history-backed place. */
  dayTab?: DayManagerTab;
  onDayTabChange?: (tab: DayManagerTab) => void;
  onOpenScene?: (sceneId: string) => void;
  onPrintCallSheet?: (day: DayView, design: ReportDesign, zoneBlocks?: ReportBlock[]) => void;
  onPopOutDay?: (day: DayView) => void;
  /** The call-sheet editor is a full-surface dark mode — report it so the
   *  host can darken the surrounding sub-tab chrome while it is open. */
  onChromeModeChange?: (dark: boolean) => void;
}

const templateZoneBlocks = (design: ReportDesign): ReportBlock[] =>
  findDesignCallSheetZone(design)?.children || [];

const DayManagerPage: React.FC<DayManagerPageProps> = ({
  headerTarget,
  dayPickerTarget,
  initialDayIndex,
  onTargetSeen,
  dayMode,
  onDayModeChange,
  dayTab,
  onDayTabChange,
  onOpenScene,
  onPrintCallSheet,
  onPopOutDay,
  onChromeModeChange,
}) => {
  const { state, dispatch, locked } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const { days, byIndex } = useDayViews();
  const ctx = useReportCtx();
  // ONE warm/refresh run for the selected day (roadmap 301) — the Day Details
  // weather row reads the resolved values and owns the manual refresh.
  const sunWeather = useSunWeather(ctx);
  const [prefs, setPrefs] = usePersistState<DayManagerPrefs>(PREFS_KEY, DEFAULT_PREFS);
  const tab: DayManagerTab = dayTab && isDayManagerTab(dayTab) ? dayTab : (isDayManagerTab(prefs.tab) ? prefs.tab : 'overview');
  const projectTheme = useProjectTheme();
  const accent = projectAccentOf(projectTheme);
  const tabRowRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabPill = useSlidingPill(tabRowRef, tabRefs, Math.max(0, DAY_TAB_OPTIONS.findIndex(option => option.id === tab)));
  const tabPillFill = TAB_PILL.light[accent === 'emerald' ? 'emerald' : accent ? 'blue' : 'plain'];
  const sectionsRef = useRef<HTMLDivElement>(null);
  const [eventsDate, setEventsDate] = useState<string | null>(null);
  const [adderDate, setAdderDate] = useState<string | null>(null);
  // One element's event card (calendar parity): click a card in the Events
  // section to edit that element's event; whole-category cards open the day
  // editor instead.
  const [eventEditor, setEventEditor] = useState<{ date: string; status: string; category: string; elementKey: string } | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  // Controlled by App's history-backed place when provided (main window);
  // local state keeps pop-out day windows self-contained.
  const [localEditCallSheet, setLocalEditCallSheet] = useState(false);
  const editCallSheet = dayMode !== undefined ? dayMode === 'callsheet' : localEditCallSheet;
  const setEditCallSheet = useCallback((value: boolean) => {
    if (onDayModeChange) onDayModeChange(value ? 'callsheet' : 'manager');
    else setLocalEditCallSheet(value);
  }, [onDayModeChange]);
  const setTab = useCallback((next: DayManagerTab) => {
    setPrefs(p => ({ ...p, tab: next }));
    onDayTabChange?.(next);
  }, [onDayTabChange, setPrefs]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [callTimesOpen, setCallTimesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // null = closed; object = open (optionally with role/name/slot prefilled).
  const [addCrew, setAddCrew] = useState<{ role?: string; name?: string; slotId?: string } | null>(null);

  const selected = useMemo(() => {
    if (initialDayIndex != null && byIndex.has(initialDayIndex)) return byIndex.get(initialDayIndex)!;
    if (prefs.selectedIndex >= 0 && byIndex.has(prefs.selectedIndex)) return byIndex.get(prefs.selectedIndex)!;
    return days[0];
  }, [initialDayIndex, byIndex, prefs.selectedIndex, days]);

  const weatherView = ctx && selected ? daySunWeather(ctx, selected.date) : null;

  useEffect(() => {
    if (selected && prefs.selectedIndex !== selected.sectionIndex) {
      setPrefs(p => ({ ...p, selectedIndex: selected.sectionIndex }));
    }
  }, [selected?.sectionIndex]);

  // The main window's tab is URL/place-driven; keep the local pref in sync so
  // a day pop-out opens on the same tab.
  useEffect(() => {
    if (dayTab && isDayManagerTab(dayTab) && prefs.tab !== dayTab) {
      setPrefs(p => ({ ...p, tab: dayTab }));
    }
  }, [dayTab, prefs.tab, setPrefs]);

  // A tab is a new surface: start it at the top, never at the previous tab's
  // scroll offset.
  useEffect(() => {
    sectionsRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  useEffect(() => {
    if (initialDayIndex != null) onTargetSeen?.();
  }, [initialDayIndex, onTargetSeen]);

  // Follow (roadmap 243): publish the day the peer is viewing (manager mode —
  // the call-sheet editor publishes its own view while it is open). The App
  // applier carries `daySection` in the place, so a follower's day follows.
  const follow = useFollowView({
    place: { tab: 'production', sub: 'days', mode: 'manager' },
    fields: [
      { key: 'daySection', value: selected?.sectionIndex },
      // Publish the tab with the surface's own view too — App's place publish
      // carries it, but a day change re-publishes from here and must not strip
      // it (the presence gate/follow keys on `dayTab`).
      { key: 'dayTab', value: tab },
    ],
    enabled: !editCallSheet,
  });

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

  /** Item 156 — the crew "Report to" picker's create path (shared mapping). */
  const createLocation = useCallback((picked: PickedLocation, type: string): string => {
    const location = locationFromPick(picked, type);
    dispatch({ type: 'ADD_LOCATION', payload: { location } });
    return location.id;
  }, [dispatch]);

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
    openEvent: (date, status, category, elementKey) => setEventEditor({ date, status, category, elementKey }),
    openCallTimesSettings: () => setCallTimesOpen(true),
    openAddCrewMember: opts => setAddCrew(opts ?? {}),
    callSheetDesignId: callSheetDesign?.id || '',
    selectCallSheetDesign: id => setPrefs(p => ({ ...p, callSheetDesignId: id })),
  }), [onOpenScene, callSheetDesign?.id, setPrefs]);

  const toggleSection = (id: string) => setPrefs(p => ({
    ...p,
    collapsed: p.collapsed.includes(id) ? p.collapsed.filter(x => x !== id) : [...p.collapsed, id],
  }));

  const selectDay = (index: number) => {
    // A day click is a view-changing click: it ends follow (S3 rule — parity
    // with the Sheet arrows / Calendar month arrows).
    follow.noteUserChange();
    setPrefs(p => ({ ...p, selectedIndex: index }));
  };

  if (!selected) {
    return (
      <div className="flex-1 flex overflow-hidden bg-[var(--ui-card-band)]" data-day-manager>
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--ui-panel-bg)] border border-[color:var(--ui-border)] flex items-center justify-center shadow-sm">
            <CalendarDays className="w-6 h-6 text-[color:var(--ui-text-disabled)]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[color:var(--ui-text)]">No production days yet</p>
            <p className="text-xs text-[color:var(--ui-text-faint)] mt-1.5 max-w-sm leading-relaxed">
              Days appear here once you split the stripboard with a day break — open the Schedule tab, add a
              <span className="text-[color:var(--ui-text-muted)]"> Day Break</span> row, and drop scenes below it. Each break becomes a
              shooting day you can manage here.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              data-presence-anchor="toolbar:days:details"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] text-xs font-medium text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-card-hover)] shadow-sm"
            >
              <Info className="w-3.5 h-3.5" /> Production Details
            </button>
            <button
              type="button"
              onClick={() => setCallTimesOpen(true)}
              data-presence-anchor="toolbar:days:call-times-settings"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] text-xs font-medium text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-card-hover)] shadow-sm"
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

  // Item 146 — the shared Add Crew Member modal, hosted here for BOTH the Day
  // Manager Crew section and the Call Sheet → Edit crew table.
  const crewMemberModal = addCrew ? (
    <AddCrewMemberModal
      defaultRole={addCrew.role}
      defaultName={addCrew.name}
      onClose={() => setAddCrew(null)}
      onCreated={personId => {
        if (!addCrew.slotId || !selected?.daybreakRow) return;
        const slots = selected.meta.crewSlots ?? slotsForDay(project, selected.meta);
        patchMeta({ crewSlots: assignSlotPerson(slots, addCrew.slotId, personId) });
      }}
    />
  ) : null;

  if (editCallSheet && callSheetDesign) {
    return (
      <>
        <CallSheetEditPage
          day={selected}
          days={days}
          design={callSheetDesign}
          designs={project.reportDesigns || []}
          zoneBlocks={zoneBlocks}
          hasOverride={hasZoneOverride}
          onChangeZone={patchZone}
          patchMeta={patchMeta}
          onEditCallTimesSettings={() => setCallTimesOpen(true)}
          openAddCrewMember={opts => setAddCrew(opts ?? {})}
          onCreateLocation={createLocation}
          onReset={resetZone}
          onSelectDesign={id => setPrefs(p => ({ ...p, callSheetDesignId: id }))}
          onSelectDay={index => selectDay(index)}
          onPrint={() => onPrintCallSheet?.(selected, callSheetDesign, hasZoneOverride ? zoneBlocks : undefined)}
          onBack={() => setEditCallSheet(false)}
          readOnly={locked}
          headerTarget={headerTarget}
          dayPickerTarget={dayPickerTarget}
        />
        {callTimesOpen && <CallTimesSettingsModal onClose={() => setCallTimesOpen(false)} />}
        {crewMemberModal}
      </>
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
        collapsible={!empty}
        onToggle={() => toggleSection(def.id)}
        trailing={def.id === 'events' ? (
          <Button
            variant="subtle"
            disabled={locked}
            className="shrink-0"
            onClick={() => actions.addEvents?.(selected.date)}
          >
            <Plus className="w-3 h-3" /> Add event…
          </Button>
        ) : undefined}
      >
        <Section
          day={selected}
          patchMeta={patchMeta}
          patchRow={patchRow}
          readOnly={locked}
          project={project}
          dispatch={dispatch}
          actions={actions}
          weatherView={weatherView}
          refreshWeather={sunWeather.refresh}
          weatherRefreshing={sunWeather.refreshing}
        />
      </DaySectionCard>
    );
  };

  // `hideWhenEmpty` sections (currently Conflicts) disappear entirely when
  // they have nothing to say; the rest own their empty state inside the card.
  // The active category tab then narrows the registry to its own cards.
  const tabSections = DAY_SECTIONS.filter(def => {
    if (def.hideWhenEmpty && def.isEmpty?.(selected)) return false;
    return !def.tabs || def.tabs.includes(tab);
  });
  const narrowSections = tabSections.filter(def => !def.wide);
  const wideSections = tabSections.filter(def => def.wide);
  const [leftSection, ...rightSections] = narrowSections;

  // Toolbar controls live in the shared sub-tab toolbar (roadmap 177) when a
  // header target exists (main window); pop-out day windows render them as a
  // local header (the header-portal pattern — fallback inline). The day
  // selector portals into its own slot, immediately left of the view switcher,
  // in both Days views.
  const dayPickerNode = (
    <DayPicker theme="light" options={navOptions} selectedIndex={selected.sectionIndex} onSelect={selectDay} presenceKey="toolbar:days:day-picker" />
  );

  const managerControls = (
    <>
      {/* The main window's toolbar owns the Day Manager/Call Sheet switcher
          (roadmap 177); pop-out day windows keep the local entry button. */}
      {!headerTarget && (
        <button
          type="button"
          onClick={() => setEditCallSheet(true)}
          disabled={!callSheetDesign}
          title="Open the call sheet editor for this day"
          data-presence-anchor="toolbar:days:call-sheet"
          className="inline-flex items-center justify-center gap-1.5 w-28 px-2 py-1 rounded text-xs font-medium text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-card-hover)] disabled:opacity-40"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Call Sheet
        </button>
      )}

      {!dayPickerTarget && dayPickerNode}

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
        <DropdownMenu
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          width="w-56"
          theme="light"
          trigger={
            <button
              type="button"
              title="Production details, call-time settings, day copy and pop-out"
              data-presence-anchor="toolbar:days:settings"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-card-hover)]"
            >
              Settings <ChevronDown className="w-3 h-3" />
            </button>
          }
        >
          <DropdownItem icon={<Info className="w-3.5 h-3.5" />} onClick={() => { setSettingsOpen(false); setDetailsOpen(true); }}>
            Production Details
          </DropdownItem>
          <DropdownItem icon={<Clock className="w-3.5 h-3.5" />} onClick={() => { setSettingsOpen(false); setCallTimesOpen(true); }}>
            Call Times
          </DropdownItem>
          <DropdownItem icon={<Copy className="w-3.5 h-3.5" />} onClick={() => { setSettingsOpen(false); setCopyOpen(true); }}>
            Copy from day
          </DropdownItem>
          {!IS_COARSE && (
            <>
              <DropdownDivider />
              <DropdownItem icon={<ExternalLink className="w-3.5 h-3.5" />} onClick={() => { setSettingsOpen(false); onPopOutDay?.(selected); }}>
                Pop out
              </DropdownItem>
            </>
          )}
        </DropdownMenu>
      </div>
    </>
  );

  const editor = (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {headerTarget ? createPortal(managerControls, headerTarget) : (
        <header className="shrink-0 bg-[var(--ui-panel-bg)] border-b border-[color:var(--ui-border)] px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">{managerControls}</div>
        </header>
      )}
      {dayPickerTarget && createPortal(dayPickerNode, dayPickerTarget)}

      <div ref={sectionsRef} className="flex-1 min-w-0 overflow-y-auto bg-[var(--ui-card-band)] p-4" data-day-sections>
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-3 overflow-x-auto" data-day-tabs>
            <div
              ref={tabRowRef}
              role="tablist"
              aria-label="Day Manager sections"
              className={`relative mx-auto flex w-max items-center ${CHROME_TAB_GAP}`}
            >
              {tabPill.style && (
                <span aria-hidden className={`absolute top-0 bottom-0 rounded pointer-events-none ${tabPillFill} ${tabPill.motionClass}`} style={tabPill.style} />
              )}
              {DAY_TAB_OPTIONS.map((option, i) => (
                <Button
                  key={option.id}
                  ref={el => { tabRefs.current[i] = el; }}
                  variant="tab"
                  theme="light"
                  cloud={accent}
                  active={tab === option.id}
                  icon={option.icon}
                  title={option.title}
                  role="tab"
                  aria-selected={tab === option.id}
                  data-presence-anchor={`toolbar:days:tab:${option.id}`}
                  data-day-tab={option.id}
                  onClick={() => setTab(option.id)}
                  className="shrink-0 relative z-10"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          {/* The narrow meta sections render as a two-column band on TOP —
              Day Details in the left column, the rest (Events, Conflicts when
              present) stacked right; the wide data-dense sections (locations,
              scenes, breaks & notes, call times, crew) span both columns
              beneath. */}
          {leftSection && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              <div className="min-w-0 space-y-3">{renderSection(leftSection)}</div>
              <div className="min-w-0 space-y-3">{rightSections.map(renderSection)}</div>
            </div>
          )}
          {wideSections.length > 0 && (
            <div className={leftSection ? 'mt-3 space-y-3' : 'space-y-3'}>{wideSections.map(renderSection)}</div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <ThemeScope mode="light" surface="neutral" className="flex-1 flex overflow-hidden bg-[var(--ui-card-band)]">
    <div className="flex-1 flex overflow-hidden" data-day-manager data-day-manager-day={selected.sectionIndex}>
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
      {eventEditor && (
        <EventModal
          dateKey={eventEditor.date}
          statusKey={eventEditor.status}
          category={eventEditor.category}
          elementKey={eventEditor.elementKey}
          editableElement
          onClose={() => setEventEditor(null)}
        />
      )}
      {copyOpen && <CopyDayModal target={selected} days={days} onClose={() => setCopyOpen(false)} />}
      {detailsOpen && <ProductionDetailsModal onClose={() => setDetailsOpen(false)} />}
      {callTimesOpen && <CallTimesSettingsModal onClose={() => setCallTimesOpen(false)} />}
      {crewMemberModal}
    </div>
    </ThemeScope>
  );
};

export default DayManagerPage;
