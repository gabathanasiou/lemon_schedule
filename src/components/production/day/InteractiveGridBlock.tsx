import React, { useMemo } from 'react';
import type { DayMeta, Project, ReportBlock } from '../../../types';
import type { DayView } from '../../../lib/dayView';
import { getCallTimeSettings } from '../../../lib/callTimes';
import { excludedDeptsForDay, setDeptPrecall, slotsForDay } from '../../../lib/dayCrew';
import { getLabel } from '../../../lib/categories';
import { isReportGridCollection } from '../../../lib/reportGrids';
import DayTimesGlide from './DayTimesGlide';
import PrecallsGlide from './PrecallsGlide';
import CrewRosterEditor, { CrewAddRoleMenu } from './CrewRosterEditor';

/**
 * Interactive host for the day-scoped GRID blocks (items 111/112/159) in the
 * Call Sheet → Edit canvas. Template-level `days`-repeat children render as the
 * live surfaces — one InlineGlide per staged element category, the SHARED
 * `CrewRosterEditor` for the crew table (person swap, add crew/role, remove,
 * include/exclude, pre-call + call editing — the Day Manager surface, so the
 * two can never drift) and the `PrecallsGlide` for the precalls table — all
 * writing `daybreakMeta` through `patchMeta`, one dispatch per edit op.
 */
export interface InteractiveGridBlockProps {
  block: ReportBlock;
  day: DayView;
  project: Project;
  patchMeta: (patch: Partial<DayMeta>) => void;
  readOnly?: boolean;
  /** Header right-click on a live grid → "Edit Call Time Stages…". */
  onEditCallTimesSettings?: () => void;
  /** Hovered element row's first scene (item 115) → highlight its strip. */
  onHighlightScene?: (sceneId: string | null) => void;
  /** Item 169: with the Call Sheet's Times toggle OFF, the hover previews
   *  (which show call time/duration context) must not appear. Undefined =
   *  show (other hosts, e.g. the Day Manager). */
  showTimes?: boolean;
  /** The Day Manager's shared Add Crew Member modal (item 146) — the crew
   *  table's person swap / Add role flows open it here too. */
  openAddCrewMember?: (opts?: { role?: string; name?: string; slotId?: string }) => void;
  /** The design's optional block title (item 140), built by the host — the
   *  ONE `ReportBlockTitle` text renderer, rendered above every live grid so
   *  the editing canvas reads like the printed sheet (item 222). */
  title?: React.ReactNode;
}

const InteractiveGridBlock: React.FC<InteractiveGridBlockProps> = ({ block, day, project, patchMeta, readOnly, onEditCallTimesSettings, onHighlightScene, showTimes, openAddCrewMember, title }) => {
  const collection = isReportGridCollection(block.collection) ? block.collection : 'elementCallsOfDay';
  const settings = useMemo(() => getCallTimeSettings(project), [project]);
  // The title (item 140) sits above the grid in every branch — the hardcoded
  // "Precalls"/category bars stay as the table's own heading row.
  const withTitle = (body: React.ReactNode) => (title ? <>{title}{body}</> : body);

  const stagedCategories = useMemo(() => {
    const cats: string[] = [];
    if (day.cast.length) cats.push('cast');
    for (const k of Object.keys(day.elements)) if ((day.elements[k] || []).length) cats.push(k);
    const staged = cats.filter(c => (settings.categoryStages[c] || []).length > 0);
    return block.category ? staged.filter(c => c === block.category) : staged;
  }, [day, settings, block.category]);

  if (collection === 'departmentCallsOfDay') {
    return withTitle(
      <div className="rounded-lg border border-zinc-200 overflow-hidden bg-white" data-report-grid="precalls">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 border-b border-zinc-200">
          <span className="text-[11px] font-semibold text-zinc-700">Precalls</span>
        </div>
        <PrecallsGlide
          day={day}
          project={project}
          patchMeta={patchMeta}
          readOnly={readOnly}
          includeAll={block.precallsAll}
          include={block.precallsDepts}
          layout={block.precallsLayout}
          onEditCallTimesSettings={onEditCallTimesSettings}
        />
      </div>,
    );
  }

  if (collection === 'crewOfDay') {
    const template = project.crewTemplate || {};
    const slots = day.meta.crewSlots ?? slotsForDay(project, day.meta);
    const excluded = excludedDeptsForDay(project, day.meta);
    const effectivePrecalls = { ...(template.departmentPrecalls || {}), ...(day.meta.departmentPrecalls || {}) };
    return withTitle(
      <div data-report-grid="crew">
        {!readOnly && (
          <div className="flex items-center justify-end mb-2">
            <CrewAddRoleMenu project={project} slots={slots} onSlotsChange={next => patchMeta({ crewSlots: next })} />
          </div>
        )}
        <CrewRosterEditor
          dataAttr="data-crew-roster"
          contacts
          slots={slots}
          excludedDepts={excluded}
          effectivePrecalls={effectivePrecalls}
          templatePrecalls={template.departmentPrecalls || {}}
          dayCall={day.callTime}
          project={project}
          readOnly={readOnly}
          onSlotsChange={next => patchMeta({ crewSlots: next })}
          onExcludedChange={next => patchMeta({ excludedCrewDepts: next.length ? next : undefined })}
          onDeptPrecallChange={(dept, expr) => patchMeta(setDeptPrecall(day.meta, dept, expr))}
          onAddCrewMember={() => openAddCrewMember?.()}
          onCreatePerson={(role, name, slotId) => openAddCrewMember?.({ role, name, slotId })}
        />
      </div>,
    );
  }

  if (stagedCategories.length === 0) {
    return withTitle(<p className="px-2 py-3 text-xs text-zinc-400">No call-time elements on this day.</p>);
  }

  return withTitle(
    <div style={{ display: 'flex', flexDirection: 'column', gap: block.gap ?? 8 }} data-report-grid="elementCalls">
      {stagedCategories.map(category => (
        <div key={category} className="rounded-lg border border-zinc-200 overflow-hidden bg-white">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 border-b border-zinc-200">
            <span className="text-[11px] font-semibold text-zinc-700">{getLabel(category, category, project.categoryLabels)}</span>
          </div>
          <DayTimesGlide day={day} category={category} patchMeta={patchMeta} project={project} readOnly={readOnly} onEditCallTimesSettings={onEditCallTimesSettings} onHighlightScene={onHighlightScene} showTimes={showTimes} />
        </div>
      ))}
    </div>,
  );
};

export default InteractiveGridBlock;
