import React from 'react';
import { NonShootDate } from '../../types';
import { getTravelHoldGroups, resolveElementName } from '../../lib/nonShootHelpers';
import { getLabel, DEFAULT_CATEGORY_LABELS } from '../../lib/categories';
import { HoverTooltip } from '../HoverTooltip';
import { Plane, Pause } from 'lucide-react';

export const TravelHoldContent: React.FC<{
  entry?: NonShootDate | null;
  project: any;
}> = ({ entry, project }) => {
  const groups = getTravelHoldGroups(entry, project);
  if (groups.length === 0) {
    return <div className="text-[10px] text-zinc-400">No travel or hold entries</div>;
  }
  const travel = groups.filter(g => g.kind === 'travel');
  const hold = groups.filter(g => g.kind === 'hold');
  return (
    <>
      {travel.length > 0 && (
        <div>
          <div className="flex items-center gap-1 font-bold text-[10px] text-purple-300">
            <Plane className="w-2.5 h-2.5" /> Traveling
          </div>
          {travel.map(g => (
            <div key={`t-${g.category}`} className="text-[10px] ml-1">
              <span className="text-zinc-400">{getLabel(g.category, DEFAULT_CATEGORY_LABELS[g.category] || g.category, project.categoryLabels)}: </span>
              {g.keys.map(k => resolveElementName(k, g.category, project)).join(', ')}
            </div>
          ))}
        </div>
      )}
      {hold.length > 0 && (
        <div className={travel.length > 0 ? 'mt-1.5 pt-1 border-t border-zinc-700' : ''}>
          <div className="flex items-center gap-1 font-bold text-[10px] text-red-300">
            <Pause className="w-2.5 h-2.5" /> On Hold
          </div>
          {hold.map(g => (
            <div key={`h-${g.category}`} className="text-[10px] ml-1">
              <span className="text-zinc-400">{getLabel(g.category, DEFAULT_CATEGORY_LABELS[g.category] || g.category, project.categoryLabels)}: </span>
              {g.keys.map(k => resolveElementName(k, g.category, project)).join(', ')}
            </div>
          ))}
        </div>
      )}
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
