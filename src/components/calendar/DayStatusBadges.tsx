import React from 'react';
import { NonShootDate } from '../../types';
import { DayTypeVisual } from '../../lib/dayTypes';
import { getStatusesWithLists, hasTravel, hasHold } from '../../lib/nonShootHelpers';
import { TravelHoldTooltip } from './TravelHoldTooltip';
import { Star, Plane, Pause } from 'lucide-react';

/** The status badge cluster in a calendar day header (travel/hold buttons,
 *  day-type code chip) — shared by the strips and events day cells. */
export const DayStatusBadges: React.FC<{
  travelHoldEntry?: NonShootDate | null;
  project: any;
  dayTypeCode?: string;
  dayTypeVisual?: DayTypeVisual | null;
  onEdit?: (dateKey: string) => void;
}> = ({ travelHoldEntry, project, dayTypeCode, dayTypeVisual, onEdit }) => {
  const visual = dayTypeVisual || null;
  return (
    <span className="w-5 shrink-0 flex justify-start items-center gap-0.5">
      {travelHoldEntry?.status && travelHoldEntry.status !== 'hold' && travelHoldEntry.status !== 'travel' && getStatusesWithLists(travelHoldEntry).includes(travelHoldEntry.status) ? (
        <TravelHoldTooltip entry={travelHoldEntry} project={project}>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onEdit?.(travelHoldEntry.date); }}
            className="pointer-events-auto shrink-0"
            title={dayTypeCode ? `${dayTypeCode} — ${visual?.label || ''}` : undefined}
          >
            <span
              className="w-3 h-3 rounded-sm text-[7px] font-bold text-white flex items-center justify-center leading-none"
              style={visual?.color ? { background: visual.color } : { background: '#52525b' }}
            >
              {dayTypeCode || '•'}
            </span>
          </button>
        </TravelHoldTooltip>
      ) : hasTravel(travelHoldEntry) && hasHold(travelHoldEntry) ? (
        <TravelHoldTooltip entry={travelHoldEntry} project={project}>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onEdit?.(travelHoldEntry.date); }}
            className="pointer-events-auto"
          >
            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
          </button>
        </TravelHoldTooltip>
      ) : (
        <>
          {hasTravel(travelHoldEntry) && (
            <TravelHoldTooltip entry={travelHoldEntry} project={project}>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onEdit?.(travelHoldEntry.date); }}
                className="pointer-events-auto"
              >
                <Plane className="w-2.5 h-2.5 fill-purple-400 text-purple-400" />
              </button>
            </TravelHoldTooltip>
          )}
          {hasHold(travelHoldEntry) && (
            <TravelHoldTooltip entry={travelHoldEntry} project={project}>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onEdit?.(travelHoldEntry.date); }}
                className="pointer-events-auto"
              >
                <Pause className="w-2.5 h-2.5 fill-red-400 text-red-400" />
              </button>
            </TravelHoldTooltip>
          )}
        </>
      )}
    </span>
  );
};