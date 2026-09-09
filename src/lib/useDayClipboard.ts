import { useEffect, useState } from 'react';

/**
 * Cross-window day clipboard (D18). Module state (shared across pop-out
 * windows — same JS realm) holding the copied day's section payloads, keyed by
 * registry section id. The Copy-from-day modal writes it; a paste reads it.
 */
export interface DayClipboardPayload {
  sourceIndex: number;
  sourceDate: string;
  sourceLabel: string;
  sections: Record<string, unknown>;
}

let clipboard: DayClipboardPayload | null = null;
const listeners = new Set<() => void>();

export function setDayClipboard(payload: DayClipboardPayload | null): void {
  clipboard = payload;
  listeners.forEach(fn => fn());
}

export function getDayClipboard(): DayClipboardPayload | null {
  return clipboard;
}

export function useDayClipboard(): { clipboard: DayClipboardPayload | null; set: typeof setDayClipboard; clear: () => void } {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return { clipboard, set: setDayClipboard, clear: () => setDayClipboard(null) };
}
