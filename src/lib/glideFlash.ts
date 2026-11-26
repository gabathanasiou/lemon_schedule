/**
 * Glide change flash (roadmap 364) — ONE stamp map for every grid wrapper.
 *
 * A changed cell carries `lastUpdated = stamp`; Glide fades the theme's
 * `bgSearchResult` underlay for 500 ms. Stamps are keyed by the row's STABLE
 * key + the column key (never the visible index, so filtering/reordering can
 * never move a flash onto another row).
 */

/** Glide's fade runs 500 ms; the clear repaint lands just after it. */
export const GLIDE_FLASH_TTL_MS = 550;

export type GlideFlashMap = Map<string, number>;

export interface GlideFlashCell {
  rowKey: string;
  colKey: string;
}

export interface GlideRowSnapshot {
  key: string;
  values: Record<string, string>;
}

export interface GlideRowChange {
  rowKey: string;
  colKeys: string[];
}

export const glideFlashKey = (rowKey: string, colKey: string) => `${rowKey}:${colKey}`;

/** Stamp every cell of one commit. `now` is injectable for tests. */
export function markGlideFlash(
  map: GlideFlashMap,
  cells: readonly GlideFlashCell[],
  now = performance.now(),
): void {
  for (const cell of cells) map.set(glideFlashKey(cell.rowKey, cell.colKey), now);
  pruneGlideFlash(map, now);
}

/** Drop expired stamps (the map only grows between repaints). */
export function pruneGlideFlash(map: GlideFlashMap, now = performance.now()): void {
  for (const [key, stamp] of map) {
    if (now - stamp >= GLIDE_FLASH_TTL_MS) map.delete(key);
  }
}

/** The stamp while the fade is still running, else undefined. */
export function glideFlashStamp(
  map: GlideFlashMap,
  rowKey: string,
  colKey: string,
  now = performance.now(),
): number | undefined {
  const stamp = map.get(glideFlashKey(rowKey, colKey));
  if (stamp === undefined || now - stamp >= GLIDE_FLASH_TTL_MS) return undefined;
  return stamp;
}

/**
 * Compare the CURRENTLY RENDERED rows only (row key → raw values) and return
 * the cells whose value changed. Rows present on one side only are structural
 * changes (add/delete) — they never flash. This is the peer-edit seam: a room
 * action, or a whole-baseline S3.5 reload, is marked from what actually
 * changed on screen, never from a guessed field list.
 */
export function diffGlideRows(
  prev: readonly GlideRowSnapshot[],
  next: readonly GlideRowSnapshot[],
  colKeys: readonly string[],
): GlideRowChange[] {
  const before = new Map(prev.map(row => [row.key, row.values]));
  const changes: GlideRowChange[] = [];
  for (const row of next) {
    const old = before.get(row.key);
    if (!old) continue;
    const changed = colKeys.filter(key => (old[key] ?? '') !== (row.values[key] ?? ''));
    if (changed.length > 0) changes.push({ rowKey: row.key, colKeys: changed });
  }
  return changes;
}

// ---- Peer-change signal ------------------------------------------------------
// The store emits this for REMOTE edits only. Each mounted grid diffs its own
// visible rows on the next data change; local edits mark their cells directly.
// Undo/redo never signal (the local transcript repaints; a peer undo arrives as
// a LOAD and stays quiet too).

type PeerListener = () => void;
const peerListeners = new Set<PeerListener>();

export function subscribeGlidePeerChange(listener: PeerListener): () => void {
  peerListeners.add(listener);
  return () => { peerListeners.delete(listener); };
}

export function notifyGlidePeerChange(): void {
  for (const listener of peerListeners) listener();
}
