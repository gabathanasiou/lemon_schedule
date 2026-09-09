import React, { useMemo } from 'react';
import type { DayMeta, Project, ReportBlock } from '../../../types';
import type { DayView } from '../../../lib/dayView';
import { getCallTimeSettings } from '../../../lib/callTimes';
import { getLabel } from '../../../lib/categories';
import { isReportGridCollection } from '../../../lib/reportGrids';
import DayTimesGlide from './DayTimesGlide';
import CrewTableGlide from './CrewTableGlide';

/**
 * Interactive host for the day-scoped GRID blocks (items 111/112) in the
 * Call Sheet → Edit canvas. Template-level `days`-repeat children render as the
 * live InlineGlide surfaces (element calls per staged category; the crew
 * `Name | Role | Call` table) writing `daybreakMeta` through `patchMeta` — one
 * dispatch per edit op, so undo restores the prior call times. Blocks placed
 * INSIDE the `callSheetEdit` zone stay static (the generic zone designer).
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
}

const InteractiveGridBlock: React.FC<InteractiveGridBlockProps> = ({ block, day, project, patchMeta, readOnly, onEditCallTimesSettings, onHighlightScene }) => {
  const collection = isReportGridCollection(block.collection) ? block.collection : 'elementCallsOfDay';
  const settings = useMemo(() => getCallTimeSettings(project), [project]);

  const stagedCategories = useMemo(() => {
    const cats: string[] = [];
    if (day.cast.length) cats.push('cast');
    for (const k of Object.keys(day.elements)) if ((day.elements[k] || []).length) cats.push(k);
    const staged = cats.filter(c => (settings.categoryStages[c] || []).length > 0);
    return block.category ? staged.filter(c => c === block.category) : staged;
  }, [day, settings, block.category]);

  if (collection === 'crewOfDay') {
    if (day.crew.length === 0) {
      return <p className="px-2 py-3 text-xs text-zinc-400">No crew on this day.</p>;
    }
    return (
      <div data-report-grid="crew">
        <CrewTableGlide day={day} project={project} patchMeta={patchMeta} readOnly={readOnly} onEditCallTimesSettings={onEditCallTimesSettings} />
      </div>
    );
  }

  if (stagedCategories.length === 0) {
    return <p className="px-2 py-3 text-xs text-zinc-400">No call-time elements on this day.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: block.gap ?? 8 }} data-report-grid="elementCalls">
      {stagedCategories.map(category => (
        <div key={category} className="rounded-lg border border-zinc-200 overflow-hidden bg-white">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 border-b border-zinc-200">
            <span className="text-[11px] font-semibold text-zinc-700">{getLabel(category, category, project.categoryLabels)}</span>
          </div>
          <DayTimesGlide day={day} category={category} patchMeta={patchMeta} project={project} readOnly={readOnly} onEditCallTimesSettings={onEditCallTimesSettings} onHighlightScene={onHighlightScene} />
        </div>
      ))}
    </div>
  );
};

export default InteractiveGridBlock;
