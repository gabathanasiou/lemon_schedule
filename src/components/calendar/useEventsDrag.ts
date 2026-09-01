import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core';
import { NonShootDate, ProjectRule, ScheduleVersion } from '../../types';
import {
  applyDatePermutation, buildPermutation, mergeItemsInto,
  moveRuleDate, removeItemsFrom, withRuleDates,
} from '../../lib/events';

/** Events-mode drag state (roadmap 45) — cards, chips and the day header all
 *  drag through one dnd-kit surface with `data-date-key` targeting. */
export interface EventsDropZone {
  dateKey: string;
  zone: 'swap' | 'insert';
  side?: 'before' | 'after';
}

export interface EventsDragMeta {
  type: 'EVENT_CARD' | 'EVENT_DAY';
  dateKey: string;
  cardKind?: 'status' | 'attachment' | 'rule';
  status?: string;
  category?: string;
  keys?: string[];
  ruleId?: string;
  run?: string[];
}

interface UseEventsDragConfig {
  activeVersion: ScheduleVersion | undefined;
  /** The active calendar version id — events data lives on the
   *  CalendarVersion (item 66), never on the ScheduleVersion. */
  activeCalendarVersionId: string;
  nonShootDates: NonShootDate[];
  rules: ProjectRule[];
  /** Sorted unique dates of the visible calendar range (permutation domain). */
  visibleDates: string[];
  selectedEventKeysRef: React.MutableRefObject<Set<string>>;
  setSelectedEventKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  calendarGridRef: React.MutableRefObject<HTMLDivElement | null>;
  setFlashDateKey: (dateKey: string) => void;
  dispatch: React.Dispatch<any>;
}

export function useEventsDrag(config: UseEventsDragConfig) {
  const {
    activeVersion, activeCalendarVersionId, nonShootDates, rules, visibleDates,
    selectedEventKeysRef, setSelectedEventKeys, calendarGridRef, setFlashDateKey, dispatch,
  } = config;

  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activeEventIds, setActiveEventIds] = useState<Set<string>>(new Set());
  const [activeMeta, setActiveMeta] = useState<EventsDragMeta | null>(null);
  const [dropZone, setDropZone] = useState<EventsDropZone | null>(null);
  /** Width of the dragged card (ghost renders at the source's size). */
  const [activeWidth, setActiveWidth] = useState<number | undefined>(undefined);
  const dragPointerRef = useRef<{ x: number; y: number } | null>(null);

  const reset = useCallback(() => {
    setActiveEventId(null);
    setActiveEventIds(new Set());
    setActiveMeta(null);
    setDropZone(null);
    setActiveWidth(undefined);
    dragPointerRef.current = null;
  }, []);

  const updateDropZone = useCallback((x: number, y: number) => {
    const container = calendarGridRef.current;
    if (!container) return;
    const isCard = activeMeta?.type === 'EVENT_CARD';
    let inside: { el: Element; rect: DOMRect; dateKey: string } | null = null;
    let nearest: { el: Element; rect: DOMRect; dateKey: string; dist: number } | null = null;
    for (const el of container.querySelectorAll('[data-cal-day]')) {
      const dateKey = el.getAttribute('data-date-key');
      if (!dateKey) continue;
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        inside = { el, rect, dateKey };
        break;
      }
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      const dist = Math.hypot(dx, dy);
      if (dist < 24 && (!nearest || dist < nearest.dist)) nearest = { el, rect, dateKey, dist };
    }
    const t = inside || nearest;
    if (!t) { setDropZone(null); return; }
    if (isCard) {
      // A card merges into the target day wherever it lands — always a
      // full-cell swap highlight (never the insert edge affordance).
      setDropZone(prev => (prev && prev.zone === 'swap' && prev.dateKey === t.dateKey ? prev : { dateKey: t.dateKey, zone: 'swap' }));
      return;
    }
    if (inside) {
      const ratio = inside.rect.width > 0 ? (x - inside.rect.left) / inside.rect.width : 0.5;
      if (ratio < 0.3) {
        setDropZone(prev => (prev && prev.zone === 'insert' && prev.side === 'before' && prev.dateKey === inside.dateKey ? prev : { dateKey: inside.dateKey, zone: 'insert', side: 'before' }));
      } else if (ratio > 0.7) {
        setDropZone(prev => (prev && prev.zone === 'insert' && prev.side === 'after' && prev.dateKey === inside.dateKey ? prev : { dateKey: inside.dateKey, zone: 'insert', side: 'after' }));
      } else {
        setDropZone(prev => (prev && prev.zone === 'swap' && prev.dateKey === inside.dateKey ? prev : { dateKey: inside.dateKey, zone: 'swap' }));
      }
      return;
    }
    const side = x < nearest!.rect.left || y < nearest!.rect.top ? 'before' : 'after';
    setDropZone(prev => (prev && prev.zone === 'insert' && prev.side === side && prev.dateKey === nearest!.dateKey ? prev : { dateKey: nearest!.dateKey, zone: 'insert', side }));
  }, [calendarGridRef, activeMeta?.type]);

  useEffect(() => {
    if (!activeMeta) { dragPointerRef.current = null; setDropZone(null); return; }
    const onMove = (e: PointerEvent) => {
      dragPointerRef.current = { x: e.clientX, y: e.clientY };
      updateDropZone(e.clientX, e.clientY);
    };
    const onUp = () => { dragPointerRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [activeMeta?.type, updateDropZone]);

  const resolveTargetDate = (overId: string | undefined, overData: any): string | null => {
    if (overData?.date) return overData.date as string;
    if (typeof overId === 'string' && overId.startsWith('day-')) return overId.slice(4);
    return null;
  };

  const batchDispatch = (updates: { type: string; payload: any }[]) => {
    if (updates.length === 0) return;
    dispatch({ type: 'BATCH_START' });
    for (const u of updates) dispatch(u);
    dispatch({ type: 'BATCH_COMMIT' });
  };

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as EventsDragMeta | undefined;
    if (!data) return;
    if (data.type !== 'EVENT_CARD' && data.type !== 'EVENT_DAY') return;
    setActiveEventId(e.active.id as string);
    setActiveMeta(data);
    if (data.type === 'EVENT_DAY') {
      setActiveEventIds(new Set([`ev-day-${data.dateKey}`]));
      return;
    }
    const el = document.querySelector(`[data-event-key="${e.active.id}"]`);
    setActiveWidth(el ? el.getBoundingClientRect().width : undefined);
    const current = selectedEventKeysRef.current;
    if (current.has(e.active.id as string) && current.size > 1) {
      setActiveEventIds(new Set(current));
    } else {
      if (current.size > 0) setSelectedEventKeys(new Set());
      setActiveEventIds(new Set([e.active.id as string]));
    }
  };

  const handleDragOver = (_e: DragOverEvent) => { /* targets are day cells; zone tracked via pointer */ };

  const handleDragEnd = (e: DragEndEvent) => {
    const { over } = e;
    const meta = activeMeta;
    const zone = dropZone;
    setActiveEventId(null);
    setActiveEventIds(new Set());
    setActiveMeta(null);
    setDropZone(null);
    dragPointerRef.current = null;
    if (!over || !meta || !activeVersion) return;

    // The pointer-tracked drop zone is the highlighted cell the user dropped
    // on; `over` (dnd-kit's last collision) is the fallback.
    const targetDateKey = zone?.dateKey || resolveTargetDate(over.id as string, over.data.current);
    if (!targetDateKey) return;

    const allUpdates: { type: string; payload: any }[] = [];
    const datesFor = (rule: ProjectRule) => (('dates' in rule && rule.dates) || undefined);

    if (meta.type === 'EVENT_DAY') {
      if (meta.dateKey === targetDateKey) return;
      const mode = zone?.zone === 'insert' ? (zone.side === 'before' ? 'before' : 'after') : 'swap';
      const mapping = buildPermutation(visibleDates, meta.dateKey, targetDateKey, mode);
      if (mapping.size === 0) return;
      const { nonShootDates: nextDates, rules: nextRules } = applyDatePermutation(nonShootDates, rules, mapping);
      allUpdates.push({ type: 'UPDATE_CALENDAR_VERSION', payload: { id: activeCalendarVersionId, nonShootDates: nextDates } });
      for (const r of nextRules) {
        const before = datesFor(r);
        const after = datesFor(rules.find(x => x.id === r.id) || r);
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          allUpdates.push({ type: 'UPDATE_RULE', payload: r });
        }
      }
      batchDispatch(allUpdates);
      setFlashDateKey(targetDateKey);
      return;
    }

    // EVENT_CARD — every drag (single or batch) applies per-card collision
    // rules: an attachment card merges into the target day's lists for its
    // status × category (removed from the source), a status card replaces
    // the target's status (source loses it + its lists travel along).
    // The day-header drag (EVENT_DAY) is the whole-day move.
    // Card metadata is resolved from DOM attrs — ids are opaque (dateKeys /
    // category keys contain dashes, never parse them).
    const entries = new Map<string, NonShootDate>(nonShootDates.map(n => [n.date, n]));
    for (const cardId of activeEventIds) {
      if (cardId.startsWith('ev-day-')) continue;
      const el = calendarGridRef.current?.querySelector(`[data-event-key="${cardId}"]`);
      if (!el) continue;
      const cell = el.closest('[data-date-key]');
      const sourceDate = cell?.getAttribute('data-date-key') || '';
      if (!sourceDate || sourceDate === targetDateKey) continue;

      // Rule cards move ONE date of their rule to the target day
      if (cardId.startsWith('ev-rule-')) {
        const ruleId = el.getAttribute('data-card-rule');
        if (!ruleId) continue;
        const rule = rules.find(r => r.id === ruleId);
        if (!rule) continue;
        const res = moveRuleDate(rule, sourceDate, targetDateKey);
        if (res.changed) allUpdates.push({ type: 'UPDATE_RULE', payload: withRuleDates(rule, res.dates) });
        continue;
      }

      const kind = cardId.startsWith('ev-status-') ? 'status' : 'attachment';
      const src = entries.get(sourceDate);
      const target = entries.get(targetDateKey);
      if (kind === 'status') {
        const statusKey = el.querySelector('[data-card-status]')?.getAttribute('data-card-status') || el.getAttribute('data-card-status') || '';
        if (!statusKey) continue;
        // source: status + its lists + its notes move away; keep other-status lists
        const srcLists = { ...(src?.lists || {}) };
        const movedLists: Record<string, string[]> = srcLists[statusKey] || {};
        delete srcLists[statusKey];
        const srcComments = { ...(src?.comments || {}) };
        const movedNotes: Record<string, Record<string, string>> | undefined = srcComments[statusKey];
        if (movedNotes) delete srcComments[statusKey];
        const srcNext: NonShootDate | undefined = src && (Object.keys(srcLists).length > 0 || Object.keys(srcComments).length > 0)
          ? { date: src.date, lists: srcLists, ...(Object.keys(srcComments).length > 0 ? { comments: srcComments } : {}) }
          : undefined;
        // target: status replaced; old status's lists + notes dropped; moved ones merge in
        const tgtLists = { ...(target?.lists || {}) };
        if (target?.status) delete tgtLists[target.status];
        for (const [cat, keys] of Object.entries(movedLists)) {
          const prev = tgtLists[statusKey]?.[cat] || [];
          tgtLists[statusKey] = { ...(tgtLists[statusKey] || {}), [cat]: [...new Set([...prev, ...keys])] };
        }
        const tgtComments = { ...(target?.comments || {}) };
        if (target?.status) delete tgtComments[target.status];
        tgtComments[statusKey] = { ...(tgtComments[statusKey] || {}), ...(movedNotes || {}) };
        const tgtNext: NonShootDate = { date: targetDateKey, status: statusKey, ...(target?.pattern ? { pattern: true } : {}) };
        if (Object.keys(tgtLists).length > 0) tgtNext.lists = tgtLists;
        if (Object.keys(tgtComments).length > 0) tgtNext.comments = tgtComments;
        entries.set(sourceDate, srcNext);
        entries.set(targetDateKey, tgtNext);
      } else {
        // attachment card: one ELEMENT moves — data-card-status / -category /
        // -key / -comment (rendered on the inner card view — resolve from
        // either node)
        const inner = el.querySelector('[data-card-status]') as HTMLElement | null;
        const cardEl = inner || (el as HTMLElement);
        const status = cardEl.getAttribute('data-card-status') || '';
        const category = cardEl.getAttribute('data-card-category') || '';
        const key = cardEl.getAttribute('data-card-key') || '';
        const comment = cardEl.getAttribute('data-card-comment') || undefined;
        if (!status || !category || !key) continue;
        entries.set(sourceDate, removeItemsFrom(src, status, category, [key]));
        const merged = mergeItemsInto(target, status, category, [key], comment ? { [key]: comment } : undefined);
        entries.set(targetDateKey, { ...merged, date: targetDateKey });
      }
    }
    const next = Array.from(entries.values()).filter((n): n is NonShootDate => !!n).sort((a, b) => a.date.localeCompare(b.date));
    if (JSON.stringify(next) !== JSON.stringify(nonShootDates)) {
      allUpdates.push({ type: 'UPDATE_CALENDAR_VERSION', payload: { id: activeCalendarVersionId, nonShootDates: next } });
    }
    batchDispatch(allUpdates);
    setFlashDateKey(targetDateKey);
  };

  return {
    activeEventId,
    activeEventIds,
    activeMeta,
    activeWidth,
    dropZone,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    reset,
  };
}