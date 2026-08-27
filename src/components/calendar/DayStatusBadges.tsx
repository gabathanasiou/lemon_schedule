import React from 'react';
import { NonShootDate } from '../../types';
import { DayTypeVisual, getDayType, typeIconComponent } from '../../lib/dayTypes';
import { getStatusesWithLists } from '../../lib/nonShootHelpers';
import { TravelHoldTooltip } from './TravelHoldTooltip';
import { Star } from 'lucide-react';

/** The status badge cluster in a calendar day header — shared by the strips
 *  and events day cells. Icons + colours come from the Day Breakdown manager
 *  (`project.dayTypes`), never hardcoded. A day carrying MORE THAN ONE event
 *  type (attachment lists under multiple status keys) collapses to a single
 *  yellow star; one custom status shows its code chip; a lone travel/hold
 *  shows its type icon. */
export const DayStatusBadges: React.FC<{
  travelHoldEntry?: NonShootDate | null;
  project: any;
  dayTypeCode?: string;
  dayTypeVisual?: DayTypeVisual | null;
  onEdit?: (dateKey: string) => void;
}> = ({ travelHoldEntry, project, dayTypeCode, dayTypeVisual, onEdit }) => {
  const visual = dayTypeVisual || null;
  const entry = travelHoldEntry || undefined;
  const statusesWithLists = getStatusesWithLists(entry);

  const typeButton = (content: React.ReactNode, title?: string) => (
    <TravelHoldTooltip entry={entry} project={project}>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onEdit?.(entry!.date); }}
        className="pointer-events-auto shrink-0"
        title={title}
      >
        {content}
      </button>
    </TravelHoldTooltip>
  );

  const typeIcon = (key: string, cls: string) => {
    const Icon = typeIconComponent(project.dayTypes, key);
    const def = getDayType(project, key);
    return <Icon className={cls} style={def?.color ? { color: def.color } : undefined} fill="currentColor" />;
  };

  return (
    <span className="w-5 shrink-0 flex justify-start items-center gap-0.5">
      {statusesWithLists.length > 1 ? (
        typeButton(<Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />, 'Multiple event types')
      ) : statusesWithLists.length === 1 ? (
        (() => {
          const key = statusesWithLists[0];
          if (entry?.status && entry.status === key && key !== 'travel' && key !== 'hold') {
            return typeButton(
              <span
                className="w-3 h-3 rounded-sm text-[7px] font-bold text-white flex items-center justify-center leading-none"
                style={visual?.color ? { background: visual.color } : { background: '#52525b' }}
              >
                {dayTypeCode || '•'}
              </span>,
              dayTypeCode ? `${dayTypeCode} — ${visual?.label || ''}` : undefined,
            );
          }
          return typeButton(typeIcon(key, 'w-2.5 h-2.5'));
        })()
      ) : null}
    </span>
  );
};
