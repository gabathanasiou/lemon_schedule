import React, { useEffect } from 'react';

/** Events-mode keyboard navigation (roadmap 45): mode-local cursor over the
 *  visible `[data-event-key]` elements (cards + overlay chips), shift
 *  ranges, Cmd+A, arrows, Enter opens the day's events modal. */
export function useEventsKeyboard(config: {
  enabled: boolean;
  currentWindow: Window;
  setSelectedEventKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedEventKeysRef: React.MutableRefObject<Set<string>>;
  lastClickedEventRef: React.MutableRefObject<string | null>;
  calendarGridRef: React.MutableRefObject<HTMLDivElement | null>;
  onOpenEvents: (dateKey: string) => void;
}) {
  const {
    enabled, currentWindow, setSelectedEventKeys, selectedEventKeysRef,
    lastClickedEventRef, calendarGridRef, onOpenEvents,
  } = config;

  useEffect(() => {
    if (!enabled) return;
    const isInEditable = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      if (!t) return false;
      return (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) && !(t as HTMLInputElement).readOnly;
    };
    const collectIds = () => {
      const el = calendarGridRef.current;
      if (!el) return [] as string[];
      return Array.from(el.querySelectorAll('[data-event-key]'))
        .map(e => e.getAttribute('data-event-key')!)
        .filter(Boolean);
    };
    const scrollToId = (id: string) => {
      const el = calendarGridRef.current?.querySelector(`[data-event-key="${id}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    };
    const handler = (e: KeyboardEvent) => {
      if (isInEditable(e.target)) return;
      if (e.key === 'Escape') { setSelectedEventKeys(new Set()); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const ids = collectIds();
        if (ids.length > 0) {
          setSelectedEventKeys(new Set(ids));
          lastClickedEventRef.current = ids[0];
          scrollToId(ids[0]);
        }
        return;
      }
      if (e.key === 'Enter') {
        const sel = selectedEventKeysRef.current;
        if (sel.size === 1) {
          const id = [...sel][0];
          const el = calendarGridRef.current?.querySelector(`[data-event-key="${id}"]`);
          const cell = el?.closest('[data-date-key]');
          const dateKey = cell?.getAttribute('data-date-key');
          if (dateKey) { e.preventDefault(); onOpenEvents(dateKey); }
        }
        return;
      }
      const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!arrows.includes(e.key)) return;
      e.preventDefault();
      const flat = collectIds();
      if (flat.length === 0) return;
      const current = selectedEventKeysRef.current;
      const anchor = lastClickedEventRef.current;
      const isShift = e.shiftKey;
      const dir = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1;
      if (isShift) {
        const anchorIdx = anchor ? flat.indexOf(anchor) : -1;
        if (anchorIdx === -1) {
          setSelectedEventKeys(new Set([flat[0]]));
          lastClickedEventRef.current = flat[0];
          scrollToId(flat[0]);
          return;
        }
        const indices = Array.from(current).map(id => flat.indexOf(id)).filter(i => i >= 0);
        let from: number, to: number;
        if (indices.length === 0) {
          from = anchorIdx;
          to = Math.max(0, Math.min(flat.length - 1, anchorIdx + dir));
        } else {
          const minIdx = Math.min(...indices);
          const maxIdx = Math.max(...indices);
          if (dir > 0) {
            from = maxIdx < anchorIdx ? minIdx : anchorIdx;
            to = maxIdx < anchorIdx ? maxIdx : Math.min(maxIdx + 1, flat.length - 1);
          } else {
            to = minIdx > anchorIdx ? maxIdx : anchorIdx;
            from = minIdx > anchorIdx ? minIdx : Math.max(minIdx - 1, 0);
          }
        }
        const ids = flat.slice(Math.min(from, to), Math.max(from, to) + 1);
        setSelectedEventKeys(new Set(ids));
        scrollToId(flat[dir > 0 ? Math.max(from, to) : Math.min(from, to)]);
        return;
      }
      if (current.size === 0) {
        setSelectedEventKeys(new Set([flat[0]]));
        lastClickedEventRef.current = flat[0];
        scrollToId(flat[0]);
        return;
      }
      const refId = anchor && current.has(anchor) ? anchor : (dir > 0 ? Array.from(current)[current.size - 1] : Array.from(current)[0]);
      const idx = flat.indexOf(refId);
      const nextIdx = Math.max(0, Math.min(flat.length - 1, idx + dir));
      if (nextIdx === idx) return;
      setSelectedEventKeys(new Set([flat[nextIdx]]));
      lastClickedEventRef.current = flat[nextIdx];
      scrollToId(flat[nextIdx]);
    };
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [enabled, currentWindow, setSelectedEventKeys, selectedEventKeysRef, lastClickedEventRef, calendarGridRef, onOpenEvents]);
}