import React from 'react';
import { NonShootDate } from '../../types';
import { getDayType, typeIconComponent } from '../../lib/dayTypes';
import { getStatusesWithLists } from '../../lib/nonShootHelpers';
import { TravelHoldTooltip } from './TravelHoldTooltip';
import { Star } from 'lucide-react';

/** The status badge cluster in a calendar day header — shared by the strips
 *  and events day cells. Icons + colours come from the Day Breakdown manager
 *  (`project.dayTypes`), never hardcoded. Rules:
 *  - The day's OWN type never badges the header — its identity lives on the
 *    day (label + colour) and on its attachment cards (first card's icon).
 *  - One FOREIGN event type (attachments under a type that isn't the day
 *    status) shows its icon — the cards alone wouldn't say "also this".
 *  - Several types with attachments collapse to the amber star. */
export const DayStatusBadges: React.FC<{
  travelHoldEntry?: NonShootDate | null;
  project: any;
  onEdit?: (dateKey: string) => void;
}> = ({ travelHoldEntry, project, onEdit }) => {
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
      ) : statusesWithLists.length === 1 && entry?.status !== statusesWithLists[0] ? (
        typeButton(typeIcon(statusesWithLists[0], 'w-2.5 h-2.5'))
      ) : null}
    </span>
  );
};
