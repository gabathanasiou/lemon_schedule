import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useProject } from '../../store';
import { NonShootDate, RuleViolation } from '../../types';
import { EventCard, categoryLabel } from '../../lib/events';
import { getDayHeaderColors, getSelectedStripColors } from '../../lib/ribbonUtils';
import { typeIconComponent, dayTypeTextColor, DayTypeVisual } from '../../lib/dayTypes';
import { formatFullDate } from './calendarUtils';
import { Flag, Plus, MessageSquare } from 'lucide-react';
import { RULE_TYPE_META, describeRuleDetailed } from '../rules/ruleMeta';
import { ViolationTooltip } from '../ViolationTooltip';
import { HoverTooltip } from '../HoverTooltip';
import { isAllKeys, resolveElementName } from '../../lib/nonShootHelpers';
import { DayStatusBadges } from './DayStatusBadges';
import { IS_COARSE } from '../../lib/device';

/** Coarse-pointer bump for the event cards — mirrors the strips-mode SceneCard
 *  scale (same text, taller padding for bigger tap targets). */
const CARD_SZ = IS_COARSE ? 'px-2 py-1 text-[10px]' : 'px-1.5 py-0.5 text-[10px]';

export interface EventDropZoneProp {
  dateKey: string;
  zone: 'swap' | 'insert';
  side?: 'before' | 'after';
}

/** The events-mode day cell: attachment cards + add affordance. Whole-day
 *  info (status, conflicts) lives in the day header — no status/flag cards.
 *  The header is draggable (date permutation); the cell is a drop target. */
export const EventDayCell: React.FC<{
  dateKey: string;
  date: Date;
  isToday: boolean;
  cards: EventCard[];
  travelHoldEntry?: NonShootDate | null;
  dayTypeVisual?: DayTypeVisual | null;
  violations: RuleViolation[];
  sectionLabel?: string;
  selectedIds: Set<string>;
  onCardClick: (cardId: string, e: React.MouseEvent) => void;
  /** Card double-click opens the shared editor focused on that event type. */
  onCardDoubleClick?: (card: EventCard) => void;
  /** Right-click on a rule card (remove date / edit). */
  onCardContextMenu?: (card: EventCard, e: React.MouseEvent) => void;
  onOpenEvents: (dateKey: string) => void;
  /** Empty-day "Add event" affordance — opens the shared event adder. */
  onAddEvent?: (dateKey: string) => void;
  onContextMenu?: (e: React.MouseEvent, dateKey: string) => void;
  readOnly?: boolean;
  flash?: boolean;
  /** True when the day carries any event state (entry, chips) — enables the
   *  header drag. */
  hasEvents?: boolean;
  dropZone?: EventDropZoneProp | null;
}> = ({ dateKey, date, isToday, cards, travelHoldEntry, dayTypeVisual, violations, sectionLabel, selectedIds, onCardClick, onCardDoubleClick, onCardContextMenu, onOpenEvents, onAddEvent, onContextMenu, readOnly, flash, hasEvents, dropZone }) => {
  const { state } = useProject();
  const project = state.present;

  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateKey}`,
    data: { type: 'EVENT_DAY_CELL', date: dateKey },
  });

  const { setNodeRef: setHeaderRef, attributes, listeners, isDragging } = useDraggable({
    id: `ev-day-${dateKey}`,
    data: { type: 'EVENT_DAY', dateKey },
    disabled: readOnly || !hasEvents,
  });

  const visual = dayTypeVisual || null;
  const hdr = getDayHeaderColors(state.present.colorPalette);
  const statusHeaderStyle = visual?.color ? { background: visual.color, color: dayTypeTextColor(visual.color) } : undefined;
  const headerColor = statusHeaderStyle ? ''
    : sectionLabel ? ''
    : 'bg-zinc-200 text-zinc-600';
  const headerStyle = statusHeaderStyle || (sectionLabel ? { background: hdr.background, color: hdr.color } : undefined);
  const headerLabel = visual ? visual.label.toUpperCase() : sectionLabel || '';

  // Attachment + dated rule cards render in the cell; status/conflicts live in
  // the header. Global (every-day) rules never render a card — their home is
  // the Rules tab — so they don't count as "content" (the add affordance +
  // whole-day drag ignore them).
  const cellCards = cards.filter(c => c.kind === 'attachment' || (c.kind === 'rule' && !c.everyday));
  // Every attachment card carries its day-type icon on the LEFT — the header
  // badge for a type with cards is suppressed (DayStatusBadges), so the
  // symbol reads the type identity on each card itself (roadmap 73).
  const drop = dropZone && dropZone.dateKey === dateKey ? dropZone : null;

  return (
    <div ref={setNodeRef} data-date-key={dateKey} data-cal-day
      className={`min-h-[110px] h-full border-r border-b border-zinc-200 flex flex-col relative ${!sectionLabel && !visual ? 'bg-zinc-50' : 'bg-white'} ${flash ? 'cal-day-flash' : ''}`}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, dateKey); }}
    >
      {drop?.zone === 'insert' && drop.side === 'before' && (
        <div className="absolute inset-y-0 left-0 w-[4px] bg-blue-500 z-30 pointer-events-none" />
      )}
      {drop?.zone === 'insert' && drop.side === 'after' && (
        <div className="absolute inset-y-0 right-0 w-[4px] bg-blue-500 z-30 pointer-events-none" />
      )}
      {drop?.zone === 'swap' && (
        <div className="absolute inset-0 z-20 pointer-events-none border-2 border-blue-600 bg-blue-500/20" />
      )}
      {flash && (
        <div className="absolute inset-0 z-30 pointer-events-none cal-day-flash" />
      )}
      <div
        ref={setHeaderRef}
        {...listeners}
        {...attributes}
        onDoubleClick={(e) => { e.stopPropagation(); onOpenEvents(dateKey); }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          onOpenEvents(dateKey);
        }}
        style={{ cursor: hasEvents && !readOnly ? 'grab' : 'default', opacity: isDragging ? 0.4 : 1, ...headerStyle }}
        className={`relative flex items-center justify-between mx-0.5 my-0.5 px-1.5 py-1 select-none min-h-[34px] ${headerColor} ${isToday ? 'ring-2 ring-blue-400' : ''}`}
      >
        <DayStatusBadges
          travelHoldEntry={travelHoldEntry}
          project={project}
          onEdit={(dk) => onOpenEvents(dk)}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none leading-none gap-[3px]">
          <span className="text-[8px] font-semibold uppercase tracking-wider whitespace-nowrap opacity-60">{formatFullDate(date)}</span>
          {headerLabel && (
            <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">{headerLabel}</span>
          )}
        </div>
        <span className="w-5 shrink-0 flex justify-end items-center">
          {violations.length > 0 && (
            <ViolationTooltip violations={violations}>
              <Flag className="w-2.5 h-2.5 fill-red-400 shrink-0 text-red-400" />
            </ViolationTooltip>
          )}
        </span>
      </div>

      <div className="flex-1 min-h-0 px-1 space-y-0.5 overflow-y-auto overscroll-contain flex flex-col">
        {cellCards.map(card => (
          <DraggableEventCard key={card.id} card={card} project={project}
            selected={selectedIds.has(card.id)}
            onClick={(e) => onCardClick(card.id, e)}
            onDoubleClick={(e) => { e.stopPropagation(); onCardDoubleClick?.(card); }}
            onContextMenu={(e) => { if (card.kind === 'rule') { e.preventDefault(); e.stopPropagation(); onCardContextMenu?.(card, e); } }}
          />
        ))}
        <button
          onClick={(e) => { e.stopPropagation(); if (onAddEvent) onAddEvent(dateKey); else onOpenEvents(dateKey); }}
          className={`w-full grow flex items-center justify-center gap-1 rounded border border-dashed border-zinc-300 text-[9px] font-semibold text-zinc-400 hover:text-zinc-600 hover:border-zinc-400 transition-colors whitespace-nowrap overflow-hidden ${IS_COARSE ? 'py-1.5' : 'py-1'}`}
          title="Add event"
        >
          <Plus className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate min-w-0">Add event</span>
        </button>
      </div>
    </div>
  );
};

/** Presentational event card — shared by the cell and the drag ghost.
 *  Selection follows the stripboard's selected-strip palette colors
 *  (getSelectedStripColors), applied inline so the card's own background
 *  (inline tint or bg-* class) can't override it.
 *  Every card carries its kind icon on the LEFT and a hover tooltip naming
 *  the kind (roadmap 73). */
export const EventCardView: React.FC<{
  card: EventCard;
  project: any;
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}> = ({ card, project, selected, onClick, className = '' }) => {
  const sel = getSelectedStripColors(project?.colorPalette);
  const selStyle = selected ? { background: sel.background, color: sel.color } : undefined;
  const base = `relative w-full text-left rounded leading-snug select-none ${CARD_SZ} ${className}`;
  if (card.kind === 'status') {
    const t = (project.dayTypes || []).find((d: any) => d.key === card.statusKey);
    const color = t?.color || '#52525b';
    return (
      <div data-card-status={card.statusKey} className={`${base} text-white font-bold uppercase tracking-wide`} style={selStyle || { background: color }}>
        {t?.label || card.statusKey}
      </div>
    );
  }
  if (card.kind === 'attachment') {
    const t = (project.dayTypes || []).find((d: any) => d.key === card.status);
    const color = t?.color || '#52525b';
    const Icon = typeIconComponent(project.dayTypes, card.status);
    const names = card.all
      ? `All ${categoryLabel(card.category, project)}`
      : resolveElementName(card.key, card.category, project);
    const tip = (
      <div className="max-w-[220px]">
        <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-zinc-100 mb-0.5">
          <Icon className="w-2.5 h-2.5 shrink-0" style={{ color }} />
          <span>{t?.label || card.status} · {categoryLabel(card.category, project)}</span>
        </div>
      </div>
    );
    const inner = (
      <div data-card-status={card.status} data-card-category={card.category} data-card-key={card.key}
        data-card-comment={card.comment || ''}
        onClick={onClick}
        className={`${base} text-zinc-700 flex items-start gap-1.5`}
        style={selStyle || { background: `${color}1A` }}
      >
        {/* The tooltip anchors to the icon only — hovering the label/comment
            does not pop it. */}
        <HoverTooltip className="shrink-0 inline-flex mt-[1px]" delay={2000} content={tip}>
          <Icon className="w-3 h-3" style={{ color: selected ? sel.color : color }} />
        </HoverTooltip>
        <span className="flex-1 min-w-0">{names}</span>
        {card.comment && (
          <HoverTooltip className="shrink-0 inline-flex mt-[1px]" content={
            <div className="max-w-[220px]">
              <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-zinc-100 mb-0.5">
                <MessageSquare className="w-2.5 h-2.5 shrink-0 text-amber-400" />
                <span>Note</span>
              </div>
              <div className="text-[11px] italic text-zinc-100 leading-snug">{card.comment}</div>
            </div>
          }>
            <MessageSquare className="w-2.5 h-2.5 shrink-0 text-amber-500" style={selected ? { color: sel.color } : undefined} />
          </HoverTooltip>
        )}
      </div>
    );
    return inner;
  }
  if (card.kind === 'rule') {
    const meta = RULE_TYPE_META[card.rule.type];
    const Icon = meta.icon;
    const detail = card.violated && card.message ? card.message : describeRuleDetailed(card.rule, project.castMembers || []);
    return (
      <HoverTooltip className="w-full" content={
        <div className="max-w-[220px]">
          <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-zinc-100 mb-0.5">
            <Icon className={`w-2.5 h-2.5 shrink-0 ${meta.chipIcon}`} />
            <span>{meta.label}</span>
          </div>
          <div className="text-[11px] text-zinc-100 leading-snug">{detail}</div>
        </div>
      }>
        <div
          onClick={onClick}
          className={`${base} flex items-center gap-1 ${card.violated ? 'bg-red-100 text-red-700' : 'bg-zinc-100 text-zinc-700'}`}
          style={selStyle}
        >
          {card.violated ? (
            <Flag className="w-2.5 h-2.5 fill-red-400 text-red-400 shrink-0" style={selected ? { color: sel.color, fill: sel.color } : undefined} />
          ) : (
            <span className="shrink-0" style={selected ? { color: sel.color } : undefined}>
              <Icon className={`w-2.5 h-2.5 ${selected ? '' : meta.chipIcon}`} />
            </span>
          )}
          <span className="truncate flex-1">{describeRuleDetailed(card.rule, project.castMembers || [])}</span>
        </div>
      </HoverTooltip>
    );
  }
  return null;
};

const DraggableEventCard: React.FC<{
  card: EventCard;
  project: any;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}> = ({ card, project, selected, onClick, onDoubleClick, onContextMenu }) => {
  const dragData = card.kind === 'status'
    ? { type: 'EVENT_CARD', dateKey: card.dateKey, cardKind: 'status' as const, status: card.statusKey }
    : card.kind === 'attachment'
      ? { type: 'EVENT_CARD', dateKey: card.dateKey, cardKind: 'attachment' as const, status: card.status, category: card.category, key: card.key }
      : card.kind === 'rule'
        ? { type: 'EVENT_CARD', dateKey: card.dateKey, cardKind: 'rule' as const, ruleId: card.rule.id }
        : undefined;
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: card.id,
    data: dragData,
    disabled: !dragData,
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} data-event-key={card.id}
      {...(card.kind === 'rule' ? {
        'data-card-kind': 'rule',
        'data-card-rule': card.rule.id,
        'data-card-source': card.dateKey,
      } : {})}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={`cursor-pointer ${isDragging ? 'opacity-40' : ''}`}
    >
      <EventCardView card={card} project={project} selected={selected} onClick={onClick} />
    </div>
  );
};