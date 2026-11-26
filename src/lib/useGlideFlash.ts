import { useCallback, useEffect, useRef } from 'react';
import type { Item } from '@glideapps/glide-data-grid';
import {
  GLIDE_FLASH_TTL_MS,
  diffGlideRows,
  glideFlashStamp,
  markGlideFlash,
  subscribeGlidePeerChange,
  type GlideFlashCell,
  type GlideFlashMap,
  type GlideRowSnapshot,
} from './glideFlash';

/** One cell damage entry — the shared shape every wrapper hands to `updateCells`. */
export type GlideFlashDamage = { cell: Item };

interface GlideFlashOptions {
  /** Re-runs the peer diff when the rendered data changes (pass `rows`/`scenes`). */
  version: unknown;
  /** Snapshot of the CURRENTLY RENDERED rows (stable key + raw column values). */
  snapshot: () => GlideRowSnapshot[];
  /** Columns compared by the peer diff (pass the data columns, never actions). */
  colKeys: readonly string[];
  /** Repaint these grid cells (the wrapper's `updateCells`). */
  repaint: (cells: readonly GlideFlashDamage[]) => void;
  /** Map a changed (rowKey, colKey) back to this grid's current Item. */
  toItem: (rowKey: string, colKey: string) => Item | null;
}

/**
 * ONE change-flash engine for all Glide wrappers (roadmap 364).
 *
 * - `mark(cells, damage?)` stamps a LOCAL commit (paste/fill/cut/clear) — the
 *   caller passes the exact cells it wrote, so nothing is guessed.
 * - Peer edits / S3.5 reloads arrive as a signal; the next data change diffs
 *   only the visible rows and flashes what actually changed.
 * - A second repaint just after the TTL removes the stamp (Glide's fade is
 *   paint-time only — a stale `lastUpdated` on a cached cell would not show).
 */
export function useGlideFlash({ version, snapshot, colKeys, repaint, toItem }: GlideFlashOptions) {
  const mapRef = useRef<GlideFlashMap>(new Map());
  const prevRef = useRef<GlideRowSnapshot[] | null>(null);
  const pendingPeerRef = useRef(false);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const repaintRef = useRef(repaint);
  repaintRef.current = repaint;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const colKeysRef = useRef(colKeys);
  colKeysRef.current = colKeys;
  const toItemRef = useRef(toItem);
  toItemRef.current = toItem;

  useEffect(() => subscribeGlidePeerChange(() => { pendingPeerRef.current = true; }), []);

  const scheduleClear = useCallback((cells: GlideFlashDamage[]) => {
    if (cells.length === 0) return;
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      repaintRef.current(cells);
    }, GLIDE_FLASH_TTL_MS + 60);
    timersRef.current.add(id);
  }, []);

  /** Stamp a local commit's cells and repaint them once (then once after the fade). */
  const mark = useCallback((cells: readonly GlideFlashCell[], damage?: readonly GlideFlashDamage[]) => {
    if (cells.length === 0) return;
    markGlideFlash(mapRef.current, cells);
    const paint: GlideFlashDamage[] = damage
      ? [...damage]
      : cells.flatMap(cell => {
        const item = toItemRef.current(cell.rowKey, cell.colKey);
        return item ? [{ cell: item }] : [];
      });
    if (paint.length === 0) return;
    repaintRef.current(paint);
    scheduleClear(paint);
  }, [scheduleClear]);

  /** The live stamp for one cell (`lastUpdated`), undefined once faded. */
  const stamp = useCallback((rowKey: string, colKey: string) =>
    glideFlashStamp(mapRef.current, rowKey, colKey), []);

  // Peer edits: diff the visible rows against the last render they saw.
  useEffect(() => {
    const next = snapshotRef.current();
    if (pendingPeerRef.current) {
      pendingPeerRef.current = false;
      const prev = prevRef.current;
      if (prev) {
        const changes = diffGlideRows(prev, next, colKeysRef.current);
        if (changes.length > 0) {
          const now = performance.now();
          markGlideFlash(mapRef.current, changes.flatMap(change =>
            change.colKeys.map(colKey => ({ rowKey: change.rowKey, colKey }))), now);
          const paint = changes.flatMap(change =>
            change.colKeys.flatMap(colKey => {
              const item = toItemRef.current(change.rowKey, colKey);
              return item ? [{ cell: item }] : [];
            }));
          if (paint.length > 0) {
            repaintRef.current(paint);
            scheduleClear(paint);
          }
        }
      }
    }
    prevRef.current = next;
  }, [version, scheduleClear]);

  useEffect(() => () => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  return { mark, stamp };
}
