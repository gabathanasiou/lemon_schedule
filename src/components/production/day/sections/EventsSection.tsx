import React from 'react';
import { CalendarDays, Pencil } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { computeDayEvents } from '../../../../lib/events';
import { getDayType } from '../../../../lib/dayTypes';
import { EventCardView } from '../../../calendar/EventDayCell';
import Button from '../../../Button';

/**
 * The day's events as the SAME per-element cards the Calendar shows: a status
 * chip, one card per element attachment (type tint/icon + name + note marker),
 * and a Manage action. Clicking an element card opens the single-event editor
 * directly; whole-category/status surfaces open the day editor. Empty returns
 * null — the card header carries the single Add event CTA (roadmap 312).
 */
const EventsSection: React.FC<DaySectionProps> = ({ day, project, actions }) => {
  const statusType = day.status ? getDayType(project, day.status) : null;
  const cards = computeDayEvents(project, day.date, day.event, day.violations, project.rules || [])
    .filter(card => card.kind === 'attachment');

  if (!statusType && cards.length === 0) return null;

  const openCard = (card: (typeof cards)[number]) => {
    if (card.kind === 'attachment' && !card.all && actions.openEvent) {
      actions.openEvent(day.date, card.status, card.category, card.key);
    } else {
      actions.openEvents?.(day.date);
    }
  };

  return (
    <div className="space-y-2">
      {statusType && (
        <button
          type="button"
          onClick={() => actions.openEvents?.(day.date)}
          title="Edit this day's events"
          className="flex w-full items-center gap-2 rounded-md border border-zinc-200 px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-50"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Day status</span>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={statusType.color ? { backgroundColor: `${statusType.color}22`, color: statusType.color } : undefined}
          >
            {statusType.label}
          </span>
          <Pencil className="ml-auto w-3 h-3 shrink-0 text-zinc-400" aria-hidden />
        </button>
      )}

      {cards.length > 0 && (
        <div className="flex flex-col gap-1">
          {cards.map(card => (
            <div
              key={card.id}
              role="button"
              tabIndex={0}
              title="Click to edit"
              onClick={() => openCard(card)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openCard(card);
                }
              }}
              className="w-full cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <EventCardView card={card} project={project} size="md" />
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="subtle" onClick={() => actions.openEvents?.(day.date)}>Manage events…</Button>
      </div>
    </div>
  );
};

export const EventsIcon = CalendarDays;

export default EventsSection;
