import React from 'react';
import { CalendarDays } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { getTypeListGroups, isAllKeys, resolveElementName } from '../../../../lib/nonShootHelpers';
import { getDayType } from '../../../../lib/dayTypes';
import { getLabel } from '../../../../lib/categories';

const EventsSection: React.FC<DaySectionProps> = ({ day, project, actions }) => {
  const groups = getTypeListGroups(day.event);
  const statusType = day.status ? getDayType(project, day.status) : null;

  if (!statusType && groups.length === 0) {
    return (
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">No events on this day.</p>
        <button type="button" onClick={() => actions.openEvents?.(day.date)} className="text-xs font-medium text-zinc-600 hover:text-zinc-900">Add events…</button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {statusType && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Day status</span>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium" style={statusType.color ? { backgroundColor: `${statusType.color}22`, color: statusType.color } : undefined}>
            {statusType.label}
          </span>
        </div>
      )}
      {groups.map((g, i) => {
        const t = getDayType(project, g.status);
        const names = g.keys.map(k => isAllKeys(g.keys) ? `All ${getLabel(g.category, g.category, project.categoryLabels)}` : resolveElementName(k, g.category, project));
        return (
          <div key={`${g.status}-${g.category}-${i}`} className="rounded-md border border-zinc-200 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={t?.color ? { color: t.color } : undefined}>{t?.label || g.status}</span>
              <span className="text-[10px] text-zinc-400">{getLabel(g.category, g.category, project.categoryLabels)}</span>
            </div>
            <div className="text-xs text-zinc-700 mt-0.5">{names.join(', ')}</div>
          </div>
        );
      })}
      <div className="flex justify-end">
        <button type="button" onClick={() => actions.openEvents?.(day.date)} className="text-xs font-medium text-zinc-600 hover:text-zinc-900">Manage events…</button>
      </div>
    </div>
  );
};

export const EventsIcon = CalendarDays;

export default EventsSection;
