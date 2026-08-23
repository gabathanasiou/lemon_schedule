import React from 'react';
import { NonShootDate } from '../../types';
import { getTypeListGroups, isAllKeys, resolveElementName } from '../../lib/nonShootHelpers';
import { getLabel, DEFAULT_CATEGORY_LABELS } from '../../lib/categories';
import { getDayType } from '../../lib/dayTypes';
import { HoverTooltip } from '../HoverTooltip';
import { Plane, Pause } from 'lucide-react';

/** Hover tooltip for a day's attachments — one section per day type with
 *  lists (travel/hold built-ins keep their plane/pause accents). */
export const TravelHoldContent: React.FC<{
  entry?: NonShootDate | null;
  project: any;
}> = ({ entry, project }) => {
  const groups = getTypeListGroups(entry);
  if (groups.length === 0) {
    return <div className="text-[10px] text-zinc-400">No travel or hold entries</div>;
  }
  const byStatus: { status: string; category: string; keys: string[] }[][] = [];
  const seen = new Map<string, number>();
  for (const g of groups) {
    const idx = seen.get(g.status);
    if (idx === undefined) {
      seen.set(g.status, byStatus.length);
      byStatus.push([]);
      byStatus[byStatus.length - 1].push(g);
    } else {
      byStatus[idx].push(g);
    }
  }
  const renderGroup = (g: { category: string; keys: string[] }) => {
    const isAll = isAllKeys(g.keys);
    const label = getLabel(g.category, DEFAULT_CATEGORY_LABELS[g.category] || g.category, project.categoryLabels);
    return (
      <div key={`${g.category}-${isAll ? 'all' : g.keys.join(',')}`} className="text-[10px] ml-1">
        {isAll
          ? <span className="font-semibold">All {label}</span>
          : <><span className="text-zinc-400">{label}: </span>{g.keys.map(k => resolveElementName(k, g.category, project)).join(', ')}</>}
      </div>
    );
  };
  return (
    <>
      {byStatus.map((sg, i) => {
        const def = getDayType(project, sg[0].status);
        const label = def?.label || sg[0].status;
        const isTravel = sg[0].status === 'travel';
        const isHold = sg[0].status === 'hold';
        return (
          <div key={sg[0].status} className={i > 0 ? 'mt-1.5 pt-1 border-t border-zinc-700' : ''}>
            <div className="flex items-center gap-1 font-bold text-[10px] text-zinc-200">
              <span className="w-2 h-2 rounded-full shrink-0 border border-zinc-600" style={def?.color ? { background: def.color } : undefined} />
              {isTravel ? <Plane className="w-2.5 h-2.5 text-purple-300" /> : isHold ? <Pause className="w-2.5 h-2.5 text-red-300" /> : null}
              <span>{isTravel ? 'Traveling' : isHold ? 'On Hold' : label}</span>
            </div>
            {sg.map(renderGroup)}
          </div>
        );
      })}
    </>
  );
};

export const TravelHoldTooltip: React.FC<{
  entry?: NonShootDate | null;
  project: any;
  children: React.ReactNode;
}> = ({ entry, project, children }) => (
  <HoverTooltip content={<TravelHoldContent entry={entry} project={project} />}>
    {children}
  </HoverTooltip>
);