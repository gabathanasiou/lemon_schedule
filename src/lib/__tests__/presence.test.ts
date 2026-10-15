import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acceptCursor,
  anchorKey,
  capSelectionItems,
  COLLISION_DWELL_IDLE,
  COLLISION_FAR_PX,
  createThrottle,
  cursorGlyph,
  dayDragItemId,
  decidePeerSave,
  freezeCursorFor,
  heldItemsOf,
  isItemSelection,
  MAX_SELECTION_ITEMS,
  mergePeers,
  parseAccessPayload,
  parseAnchor,
  parseCursorPayload,
  parseDayDragItemId,
  parseDragPayload,
  parseOverlayPayload,
  parsePresenceMeta,
  parseSavePayload,
  parseScrollPayload,
  parseSelectionPayload,
  parseView,
  parseViewPayload,
  placeToPresenceView,
  pointerFractions,
  pointerGlyph,
  pointerKindOf,
  presenceTopic,
  presenceViewToPlace,
  resolveDragClaims,
  resolveOverlayCues,
  sameViewPlace,
  screenFractions,
  selectionKey,
  stepCollisionDwell,
} from '../supabase/presence';
import { createOverlaySignalHub } from '../localOverlaySignal';
import { glideStep, SMOOTH_TAU_MS } from '../glideMotion';
import { avatarColor, initialsOf, shortNameOf } from '../avatarIdentity';

describe('avatar identity', () => {
  it('derives the same color for the same seed, different across seeds', () => {
    expect(avatarColor('user-a')).toBe(avatarColor('user-a'));
    expect(avatarColor('user-a')).not.toBe(avatarColor('user-b'));
    expect(avatarColor('user-a')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('derives initials and a compact label', () => {
    expect(initialsOf('Sam Fisher')).toBe('SF');
    expect(initialsOf('Anonymous Otter')).toBe('AO');
    expect(initialsOf('Prince')).toBe('P');
    expect(initialsOf('  ')).toBe('?');
    expect(shortNameOf('Anonymous Otter')).toBe('Anonymous');
    expect(shortNameOf('')).toBe('Someone');
  });
});

describe('presence wire helpers', () => {
  it('builds one topic per project id', () => {
    expect(presenceTopic('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe('project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('parses a view and rejects unknown tabs', () => {
    expect(parseView({ tab: 'schedule', sceneId: 's1' })).toEqual({ tab: 'schedule', sceneId: 's1' });
    expect(parseView({ tab: 'schedule', sub: 'x', mode: 'y', daySection: 2.9 })).toEqual({ tab: 'schedule', sub: 'x', mode: 'y', daySection: 2 });
    expect(parseView({ tab: 'nope' })).toBeNull();
    expect(parseView(null)).toBeNull();
  });

  it('parses the follow-completeness fields and clamps them to the allow-lists', () => {
    expect(parseView({ tab: 'breakdown', sub: 'sheet', sceneId: 's3', sheetIndex: 4.7 }))
      .toEqual({ tab: 'breakdown', sub: 'sheet', sceneId: 's3', sheetIndex: 4 });
    expect(parseView({ tab: 'breakdown', sub: 'sheet', sheetIndex: -2 }))
      .toEqual({ tab: 'breakdown', sub: 'sheet', sheetIndex: 0 });
    expect(parseView({ tab: 'schedule', viewMode: 'landscape', cellBorders: 'both' }))
      .toEqual({ tab: 'schedule', viewMode: 'landscape', cellBorders: 'both' });
    expect(parseView({ tab: 'calendar', sub: 'calendar', calendarView: 'events' }))
      .toEqual({ tab: 'calendar', sub: 'calendar', calendarView: 'events' });
    // Document identities (roadmap 236): Reports Designer / Ribbon Designer.
    expect(parseView({ tab: 'design', sub: 'designer', designId: 'd1' }))
      .toEqual({ tab: 'design', sub: 'designer', designId: 'd1' });
    expect(parseView({ tab: 'design', sub: 'ribbons', ribbonId: 'r1' }))
      .toEqual({ tab: 'design', sub: 'ribbons', ribbonId: 'r1' });
    // Unknown values are dropped, never trusted.
    expect(parseView({ tab: 'schedule', viewMode: 'wide', cellBorders: 'dotted', calendarView: 'grid', sheetIndex: 'x', designId: '', ribbonId: 7 }))
      .toEqual({ tab: 'schedule' });
  });

  it('parses anchors, defaulting/clamping the pointer position', () => {
    expect(parseAnchor({ kind: 'row', rowId: 'r1' })).toEqual({ kind: 'row', rowId: 'r1', fx: 0.5, fy: 0.5 });
    expect(parseAnchor({ kind: 'row', rowId: 'r1', fx: 0.2, fy: 0.8 })).toEqual({ kind: 'row', rowId: 'r1', fx: 0.2, fy: 0.8 });
    expect(parseAnchor({ kind: 'row', rowId: 'r1', fx: -3, fy: 9 })).toEqual({ kind: 'row', rowId: 'r1', fx: 0, fy: 1 });
    expect(parseAnchor({ kind: 'row' })).toBeNull();
    expect(parseAnchor({ kind: 'date', date: '2026-10-12' })).toEqual({ kind: 'date', date: '2026-10-12', fx: 0.5, fy: 0.5 });
    expect(parseAnchor({ kind: 'day', sectionIndex: 3, section: 'scenes' })).toEqual({ kind: 'day', sectionIndex: 3, section: 'scenes', fx: 0.5, fy: 0.5 });
    expect(parseAnchor({ kind: 'day', sectionIndex: 3 })).toEqual({ kind: 'day', sectionIndex: 3, fx: 0.5, fy: 0.5 });
    expect(parseAnchor({ kind: 'day' })).toBeNull();
    expect(parseAnchor({ kind: 'dom', key: 'report:d1:block:b1' })).toEqual({ kind: 'dom', key: 'report:d1:block:b1', fx: 0.5, fy: 0.5 });
    expect(parseAnchor({ kind: 'dom', key: 'x'.repeat(300) })).toEqual({ kind: 'dom', key: 'x'.repeat(200), fx: 0.5, fy: 0.5 });
    expect(parseAnchor({ kind: 'dom', key: '' })).toBeNull();
    expect(parseAnchor({ kind: 'dom' })).toBeNull();
    expect(parseAnchor('row:1')).toBeNull();
  });

  it('parses the viewport-relative screen fallback and clamps it', () => {
    expect(parseAnchor({ kind: 'screen', xr: 0.25, yr: 0.75 })).toEqual({ kind: 'screen', xr: 0.25, yr: 0.75 });
    expect(parseAnchor({ kind: 'screen', xr: -1, yr: 4 })).toEqual({ kind: 'screen', xr: 0, yr: 1 });
    expect(parseAnchor({ kind: 'screen', xr: 0.5 })).toBeNull();
  });

  it('parses grid anchors (Glide cell keys + indices + position)', () => {
    const full = { kind: 'grid', scope: 'breakdown-glide', rowKey: 'scene-1', colKey: 'cast', rowIndex: 3, colIndex: 8, fx: 0.2, fy: 0.7 };
    expect(parseAnchor(full)).toEqual(full);
    expect(parseAnchor({ ...full, rowIndex: -4, colIndex: 2.9 })).toEqual({ ...full, rowIndex: 0, colIndex: 2 });
    expect(parseAnchor({ ...full, fx: 5, fy: -1 })).toEqual({ ...full, fx: 1, fy: 0 });
    expect(parseAnchor({ ...full, rowKey: undefined })).toBeNull();
    expect(parseAnchor({ ...full, scope: '' })).toBeNull();
  });

  it('parses presence metas with clamped names and required identity', () => {
    const meta = parsePresenceMeta({ userId: 'u1', clientId: 'c1', name: 'x'.repeat(200), ts: 5, isGuest: true });
    expect(meta).not.toBeNull();
    expect(meta!.name.length).toBe(80);
    expect(meta!.isGuest).toBe(true);
    expect(parsePresenceMeta({ userId: 'u1', clientId: 'c1' })).toBeNull(); // no ts
    expect(parsePresenceMeta({ clientId: 'c1', ts: 1 })).toBeNull(); // no user
    expect(parsePresenceMeta(null)).toBeNull();
  });

  it('parses cursor and save payloads', () => {
    expect(parseCursorPayload({ userId: 'u', clientId: 'c', ts: 3, anchor: { kind: 'row', rowId: 'r', fx: 0.25, fy: 0.75 } }))
      .toEqual({ userId: 'u', clientId: 'c', ts: 3, anchor: { kind: 'row', rowId: 'r', fx: 0.25, fy: 0.75 }, pointer: 'mouse' });
    expect(parseCursorPayload({ userId: 'u', clientId: 'c', ts: 3, anchor: { kind: 'nope' } })).toBeNull();
    expect(parseSavePayload({ userId: 'u', revision: 4, ts: 9 })).toEqual({ userId: 'u', revision: 4, ts: 9 });
    expect(parseSavePayload({ userId: 'u', revision: 0, ts: 9 })).toBeNull();
    expect(parseSavePayload({ userId: 'u', revision: '4', ts: 9 })).toBeNull();
  });

  it('parses the cursor input modality (roadmap 241), defaulting junk to the arrow', () => {
    const anchor = { kind: 'row', rowId: 'r' };
    expect(pointerKindOf('touch')).toBe('touch');
    expect(pointerKindOf('pen')).toBe('pen');
    expect(pointerKindOf('mouse')).toBe('mouse');
    expect(pointerKindOf('trackpad')).toBe('mouse'); // unknown → the arrow default
    expect(pointerKindOf(undefined)).toBe('mouse');
    expect(parseCursorPayload({ userId: 'u', clientId: 'c', ts: 3, anchor, pointer: 'touch' }))
      .toEqual({ userId: 'u', clientId: 'c', ts: 3, anchor: { kind: 'row', rowId: 'r', fx: 0.5, fy: 0.5 }, pointer: 'touch' });
    expect(parseCursorPayload({ userId: 'u', clientId: 'c', ts: 3, anchor, pointer: 'laser' }).pointer).toBe('mouse');
  });

  it('parses the drag flag on cursor frames (roadmap 235) — only true is trusted', () => {
    const anchor = { kind: 'row', rowId: 'r' };
    expect(parseCursorPayload({ userId: 'u', clientId: 'c', ts: 3, anchor, drag: true })!.drag).toBe(true);
    expect(parseCursorPayload({ userId: 'u', clientId: 'c', ts: 3, anchor })!.drag).toBeUndefined();
    expect(parseCursorPayload({ userId: 'u', clientId: 'c', ts: 3, anchor, drag: 'yes' })!.drag).toBeUndefined();
    expect(parseCursorPayload({ userId: 'u', clientId: 'c', ts: 3, anchor, drag: false })!.drag).toBeUndefined();
  });

  it('parses drag claims: surfaces, the release edge, the cap, and junk', () => {
    expect(parseDragPayload({ userId: 'u', clientId: 'c', ts: 5, surface: 'schedule', itemIds: ['r1', 'r2'] }))
      .toEqual({ userId: 'u', clientId: 'c', ts: 5, surface: 'schedule', itemIds: ['r1', 'r2'] });
    expect(parseDragPayload({ userId: 'u', clientId: 'c', ts: 5, surface: 'calendar-day', itemIds: ['day:3'] }))
      .toEqual({ userId: 'u', clientId: 'c', ts: 5, surface: 'calendar-day', itemIds: ['day:3'] });
    // A null surface is the RELEASE edge (item ids are always dropped there).
    expect(parseDragPayload({ userId: 'u', clientId: 'c', ts: 5, surface: null, itemIds: ['r1'] }))
      .toEqual({ userId: 'u', clientId: 'c', ts: 5, surface: null, itemIds: [] });
    // Unknown surfaces are dropped — never trusted as a release.
    expect(parseDragPayload({ userId: 'u', clientId: 'c', ts: 5, surface: 'glide', itemIds: ['r1'] })).toBeNull();
    // The item list is a cosmetic payload: capped, junk entries dropped, a
    // malformed list still keeps the lock (clamps to empty).
    const many = parseDragPayload({ userId: 'u', clientId: 'c', ts: 5, surface: 'schedule', itemIds: Array.from({ length: 80 }, (_, i) => `r${i}`) })!;
    expect(many.itemIds.length).toBe(50);
    expect(many.itemIds[0]).toBe('r0');
    expect(parseDragPayload({ userId: 'u', clientId: 'c', ts: 5, surface: 'schedule', itemIds: ['r1', 7, null, ''] })!.itemIds).toEqual(['r1']);
    expect(parseDragPayload({ userId: 'u', clientId: 'c', ts: 5, surface: 'schedule' })!.itemIds).toEqual([]);
    expect(parseDragPayload({ userId: 'u', clientId: 'c', surface: 'schedule' })).toBeNull(); // no ts
    expect(parseDragPayload({ userId: 'u', ts: 5, surface: 'schedule' })).toBeNull(); // no client
    expect(parseDragPayload(null)).toBeNull();
  });

  it('keys the synthetic day marker round-trip (roadmap 235)', () => {
    expect(dayDragItemId(7)).toBe('day:7');
    expect(parseDayDragItemId('day:7')).toBe(7);
    expect(parseDayDragItemId('day:0')).toBe(0);
    expect(parseDayDragItemId('day:-1')).toBeNull();
    expect(parseDayDragItemId('day:x')).toBeNull();
    expect(parseDayDragItemId('7')).toBeNull();
    expect(parseDayDragItemId('r1')).toBeNull();
  });

  it('resolves active drag claims: release edges, TTL, newest window wins', () => {
    const samples = (entries: Array<[string, 'schedule' | 'calendar' | 'calendar-day' | null, string[], number, number]>) =>
      entries.map(([userId, surface, itemIds, ts, at]) => ({ userId, surface, itemIds, ts, at }));
    expect(resolveDragClaims(samples([['u1', 'schedule', ['r1'], 10, 1000]]), 1400, 800))
      .toEqual(new Map([['u1', { surface: 'schedule', itemIds: ['r1'] }]]));
    // Stale (killed tab / paused heartbeat) releases on the TTL.
    expect(resolveDragClaims(samples([['u1', 'schedule', ['r1'], 10, 1000]]), 1900, 800).size).toBe(0);
    // A release edge clears; a newer window wins (multi-window parity).
    expect(resolveDragClaims(samples([['u1', null, [], 10, 1000]]), 1000, 800).size).toBe(0);
    expect(resolveDragClaims(samples([['u1', 'schedule', ['r1'], 10, 1000], ['u1', 'calendar', ['r2'], 20, 1000]]), 1000, 800))
      .toEqual(new Map([['u1', { surface: 'calendar', itemIds: ['r2'] }]]));
    expect(resolveDragClaims(samples([['u1', 'schedule', ['r1'], 10, 1000], ['u2', 'calendar-day', ['day:3'], 5, 900]]), 1000, 800))
      .toEqual(new Map([
        ['u1', { surface: 'schedule', itemIds: ['r1'] }],
        ['u2', { surface: 'calendar-day', itemIds: ['day:3'] }],
      ]));
    expect(resolveDragClaims([], 1000, 800).size).toBe(0);
  });

  it('maps held items to their holders — the shared soft-lock predicate', () => {
    const drags = [
      { userId: 'u1', name: 'Sam', surface: 'schedule' as const, itemIds: ['r1', 'r2'] },
      { userId: 'u2', name: 'Ava', surface: 'calendar-day' as const, itemIds: ['day:3', 'r2'] },
    ];
    const held = heldItemsOf(drags);
    expect(held.get('r1')).toEqual({ userId: 'u1', name: 'Sam' });
    expect(held.get('day:3')).toEqual({ userId: 'u2', name: 'Ava' });
    // First holder wins when two peers somehow claim the same item.
    expect(held.get('r2')).toEqual({ userId: 'u1', name: 'Sam' });
    expect(heldItemsOf([]).size).toBe(0);
  });

  it('maps an input kind to its glyph', () => {
    expect(pointerGlyph('mouse')).toBe('arrow');
    expect(pointerGlyph('touch')).toBe('hand');
    expect(pointerGlyph('pen')).toBe('pen');
  });

  it('parses grid selections: a rectangle, the clear edge, and junk', () => {
    const ref = (rowKey: string, colKey: string, rowIndex: number, colIndex: number) => ({ rowKey, colKey, rowIndex, colIndex });
    expect(parseSelectionPayload({ userId: 'u', clientId: 'c', ts: 5, selection: { scope: 'breakdown-glide', anchor: ref('s1', 'cast', 0, 8), extent: ref('s3', 'props', 2, 9) } }))
      .toEqual({ userId: 'u', clientId: 'c', ts: 5, selection: { scope: 'breakdown-glide', anchor: ref('s1', 'cast', 0, 8), extent: ref('s3', 'props', 2, 9) } });
    // Indices clamp; the keys are required strings.
    const clamped = parseSelectionPayload({ userId: 'u', clientId: 'c', ts: 5, selection: { scope: 'g', anchor: ref('r', 'c', -4, 2.9), extent: ref('r', 'c', 1, 1) } })!.selection!;
    expect(isItemSelection(clamped)).toBe(false);
    expect(clamped).toEqual({ scope: 'g', anchor: { rowKey: 'r', colKey: 'c', rowIndex: 0, colIndex: 2 }, extent: ref('r', 'c', 1, 1) });
    // A null selection is the CLEAR edge.
    expect(parseSelectionPayload({ userId: 'u', clientId: 'c', ts: 5, selection: null }))
      .toEqual({ userId: 'u', clientId: 'c', ts: 5, selection: null });
    // Junk is dropped, never treated as a clear.
    expect(parseSelectionPayload({ userId: 'u', clientId: 'c', ts: 5 })).toBeNull();
    expect(parseSelectionPayload({ userId: 'u', clientId: 'c', ts: 5, selection: { scope: '', anchor: ref('r', 'c', 0, 0), extent: ref('r', 'c', 0, 0) } })).toBeNull();
    expect(parseSelectionPayload({ userId: 'u', clientId: 'c', ts: 5, selection: { scope: 'g', anchor: { rowIndex: 0, colIndex: 0 }, extent: ref('r', 'c', 0, 0) } })).toBeNull();
    expect(parseSelectionPayload({ userId: 'u', clientId: 'c', ts: 5, selection: 'x' })).toBeNull();
    expect(parseSelectionPayload(null)).toBeNull();
  });

  it('parses DOM-surface item selections (roadmap 234 stage 2) — capped, junk-safe', () => {
    expect(parseSelectionPayload({ userId: 'u', clientId: 'c', ts: 5, selection: { scope: 'schedule', items: ['r1', 'r2'] } }))
      .toEqual({ userId: 'u', clientId: 'c', ts: 5, selection: { scope: 'schedule', items: ['r1', 'r2'] } });
    // The list is a cosmetic payload: capped, junk entries dropped.
    const many = parseSelectionPayload({ userId: 'u', clientId: 'c', ts: 5, selection: { scope: 'schedule', items: Array.from({ length: 140 }, (_, i) => `r${i}`) } })!.selection!;
    expect(isItemSelection(many)).toBe(true);
    expect((many as { items: string[] }).items.length).toBe(MAX_SELECTION_ITEMS);
    expect(parseSelectionPayload({ userId: 'u', clientId: 'c', ts: 5, selection: { scope: 'schedule', items: ['r1', 7, null, ''] } })!.selection)
      .toEqual({ scope: 'schedule', items: ['r1'] });
    // An EMPTY list is dropped, never trusted as a clear (an explicit deselect
    // publishes the null edge).
    expect(parseSelectionPayload({ userId: 'u', clientId: 'c', ts: 5, selection: { scope: 'schedule', items: [] } })).toBeNull();
    expect(parseSelectionPayload({ userId: 'u', clientId: 'c', ts: 5, selection: { scope: 'schedule', items: 'r1' } })).toBeNull();
    expect(parseSelectionPayload({ userId: 'u', clientId: 'c', ts: 5, selection: { items: ['r1'] } })).toBeNull();
  });

  it('caps an item selection on send and keys both selection shapes', () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);
    const capped = capSelectionItems({ scope: 'schedule', items: items(MAX_SELECTION_ITEMS + 20) });
    expect((capped as { items: string[] }).items.length).toBe(MAX_SELECTION_ITEMS);
    // Short lists and grid rectangles pass through untouched (same identity).
    const short = { scope: 'schedule', items: items(3) };
    expect(capSelectionItems(short)).toBe(short);
    const grid = { scope: 'g', anchor: { rowKey: 'r', colKey: 'c', rowIndex: 0, colIndex: 0 }, extent: { rowKey: 'r', colKey: 'c', rowIndex: 1, colIndex: 1 } };
    expect(capSelectionItems(grid)).toBe(grid);
  });

  it('keys a selection stably for the idle-skip (null clears to the same key)', () => {
    const sel = {
      scope: 'g',
      anchor: { rowKey: 'r1', colKey: 'c1', rowIndex: 0, colIndex: 0 },
      extent: { rowKey: 'r2', colKey: 'c3', rowIndex: 1, colIndex: 2 },
    };
    expect(selectionKey(sel)).toBe('g|r1|c1|0|0|r2|c3|1|2');
    expect(selectionKey(sel)).toBe(selectionKey({ ...sel }));
    expect(selectionKey({ ...sel, scope: 'h' })).not.toBe(selectionKey(sel));
    // Item selections key by scope + ids, distinct from a grid selection on
    // the same scope.
    expect(selectionKey({ scope: 'schedule', items: ['r1', 'r2'] })).toBe('schedule|i|r1\u0001r2');
    expect(selectionKey({ scope: 'schedule', items: ['r2', 'r1'] })).not.toBe(selectionKey({ scope: 'schedule', items: ['r1', 'r2'] }));
    expect(selectionKey({ scope: 'schedule', items: ['r1'] })).not.toBe(selectionKey({ scope: 'schedule', anchor: { rowKey: 'r1', colKey: 'c', rowIndex: 0, colIndex: 0 }, extent: { rowKey: 'r1', colKey: 'c', rowIndex: 0, colIndex: 0 } }));
    expect(selectionKey(null)).toBe('');
  });

  it('parses overlay signals: kinds, the close edge, and junk', () => {
    expect(parseOverlayPayload({ userId: 'u', clientId: 'c', kind: 'menu', ts: 5 }))
      .toEqual({ userId: 'u', clientId: 'c', kind: 'menu', ts: 5 });
    expect(parseOverlayPayload({ userId: 'u', clientId: 'c', kind: 'modal', ts: 5 }))
      .toEqual({ userId: 'u', clientId: 'c', kind: 'modal', ts: 5 });
    expect(parseOverlayPayload({ userId: 'u', clientId: 'c', kind: null, ts: 5 }))
      .toEqual({ userId: 'u', clientId: 'c', kind: null, ts: 5 });
    // Unknown kinds are ignored — never trusted as a close edge.
    expect(parseOverlayPayload({ userId: 'u', clientId: 'c', kind: 'spinner', ts: 5 })).toBeNull();
    expect(parseOverlayPayload({ userId: 'u', clientId: 'c', kind: 'menu' })).toBeNull(); // no ts
    expect(parseOverlayPayload({ userId: 'u', kind: 'menu', ts: 5 })).toBeNull(); // no client
    expect(parseOverlayPayload(null)).toBeNull();
  });

  it('resolves active overlay cues: TTL expiry, close edges, newest window wins', () => {
    const signals = (entries: Array<[string, 'menu' | 'modal' | null, number]>) =>
      entries.map(([userId, kind, at]) => ({ userId, kind, at }));
    // Active while fresh; stale (killed tab / paused heartbeat) clears on TTL.
    expect(resolveOverlayCues(signals([['u1', 'menu', 1000]]), 1400, 800)).toEqual(new Map([['u1', 'menu']]));
    expect(resolveOverlayCues(signals([['u1', 'menu', 1000]]), 1900, 800).size).toBe(0);
    // A close edge clears; an unknown user never appears.
    expect(resolveOverlayCues(signals([['u1', null, 1000]]), 1000, 800).size).toBe(0);
    // Newest window wins per user (multi-window parity with cursors).
    expect(resolveOverlayCues(signals([['u1', 'menu', 1000], ['u1', 'modal', 1200]]), 1300, 800))
      .toEqual(new Map([['u1', 'modal']]));
    // …and a newer close from the other window wins too (accepted semantics).
    expect(resolveOverlayCues(signals([['u1', 'menu', 1000], ['u1', null, 1200]]), 1300, 800).size).toBe(0);
    expect(resolveOverlayCues(signals([['u1', 'menu', 1000], ['u2', 'modal', 1100]]), 1200, 800))
      .toEqual(new Map([['u1', 'menu'], ['u2', 'modal']]));
  });

  it('parses scroll samples, clamping the offset and allow-listing the surface', () => {
    expect(parseScrollPayload({ userId: 'u', clientId: 'c', surface: 'schedule', key: 'r1', off: 0.42, ts: 7 }))
      .toEqual({ userId: 'u', clientId: 'c', surface: 'schedule', key: 'r1', off: 0.42, ts: 7 });
    // Coarse fallback anchor (the stripboard's day block) rides along.
    expect(parseScrollPayload({ userId: 'u', clientId: 'c', surface: 'schedule', key: 'r1', off: 2, fkey: '3', foff: -1, ts: 7 }))
      .toEqual({ userId: 'u', clientId: 'c', surface: 'schedule', key: 'r1', off: 1, fkey: '3', foff: 0, ts: 7 });
    expect(parseScrollPayload({ userId: 'u', clientId: 'c', surface: 'hacked', key: 'r1', off: 0, ts: 7 })).toBeNull();
    expect(parseScrollPayload({ userId: 'u', clientId: 'c', surface: 'sheet', off: 0, ts: 7 })).toBeNull(); // no key
    expect(parseScrollPayload({ userId: 'u', clientId: 'c', surface: 'sheet', key: 'cast', off: 'x', ts: 7 })).toBeNull();
    expect(parseScrollPayload(null)).toBeNull();
  });

  it('parses view broadcasts (the presence-rate-limit-safe transport)', () => {
    expect(parseViewPayload({ userId: 'u', clientId: 'c', ts: 5, view: { tab: 'breakdown', sub: 'sheet', sceneId: 's1', sheetIndex: 2 } }))
      .toEqual({ userId: 'u', clientId: 'c', ts: 5, view: { tab: 'breakdown', sub: 'sheet', sceneId: 's1', sheetIndex: 2 } });
    // A null view is a valid update (cleared); junk views parse to null.
    expect(parseViewPayload({ userId: 'u', clientId: 'c', ts: 5, view: null }))
      .toEqual({ userId: 'u', clientId: 'c', ts: 5, view: null });
    expect(parseViewPayload({ userId: 'u', clientId: 'c', ts: 5, view: { tab: 'hacked' } }))
      .toEqual({ userId: 'u', clientId: 'c', ts: 5, view: null });
    expect(parseViewPayload({ userId: 'u', clientId: 'c', view: { tab: 'schedule' } })).toBeNull(); // no ts
    expect(parseViewPayload({ userId: 'u', ts: 5, view: { tab: 'schedule' } })).toBeNull(); // no client
    expect(parseViewPayload(null)).toBeNull();
  });

  it('parses access events: role changes and revocations (null role)', () => {
    expect(parseAccessPayload({ userId: 'u', role: 'editor', ts: 5 })).toEqual({ userId: 'u', role: 'editor', ts: 5 });
    expect(parseAccessPayload({ userId: 'u', role: null, ts: 5 })).toEqual({ userId: 'u', role: null, ts: 5 });
    expect(parseAccessPayload({ userId: 'u', role: 'admin', ts: 5 })).toBeNull(); // unknown role ignored
    expect(parseAccessPayload({ userId: 'u', role: 'viewer' })).toBeNull(); // no ts
    expect(parseAccessPayload({ role: 'viewer', ts: 5 })).toBeNull(); // no user
    expect(parseAccessPayload(null)).toBeNull();
  });
});

describe('mergePeers (who is here)', () => {
  const state = {
    u1: [
      { userId: 'u1', clientId: 'a', name: 'Alice', ts: 10, view: { tab: 'schedule' } },
      { userId: 'u1', clientId: 'b', name: 'Alice', ts: 20, view: { tab: 'calendar' } },
    ],
    u2: [{ userId: 'u2', clientId: 'c', name: 'Bob', ts: 5, view: null }],
    self: [{ userId: 'self', clientId: 'd', name: 'Me', ts: 99 }],
    junk: [{ nope: true }, null],
  };

  it('dedupes a user with two windows to their newest state, excludes self and junk', () => {
    const peers = mergePeers(state, 'self');
    expect(peers.map(p => p.userId)).toEqual(['u1', 'u2']);
    expect(peers[0].view).toEqual({ tab: 'calendar' }); // newest ts wins (window dedupe)
    expect(peers[1].ts).toBe(5);
  });

  it('keeps every live window of a user in clientIds (selection pruning)', () => {
    const peers = mergePeers({
      u1: [
        { userId: 'u1', clientId: 'a', name: 'Alice', ts: 10 },
        { userId: 'u1', clientId: 'b', name: 'Alice', ts: 20 },
        { userId: 'u1', clientId: 'a', name: 'Alice', ts: 30 }, // repeat meta → no duplicate
      ],
    }, 'self');
    expect(peers[0].clientIds.sort()).toEqual(['a', 'b']);
  });

  it('sorts deterministically by name', () => {
    const peers = mergePeers({
      a: [{ userId: 'a', clientId: 'x', name: 'Zed', ts: 1 }],
      b: [{ userId: 'b', clientId: 'x', name: 'Abe', ts: 1 }],
    }, 'self');
    expect(peers.map(p => p.name)).toEqual(['Abe', 'Zed']);
  });

  it('tolerates an empty or missing state', () => {
    expect(mergePeers({}, 'self')).toEqual([]);
    expect(mergePeers(undefined as unknown as Record<string, unknown[]>, 'self')).toEqual([]);
  });
});

describe('cursor dedupe + idle keys', () => {
  it('accepts only strictly newer timestamps per client', () => {
    expect(acceptCursor(undefined, 1)).toBe(true);
    expect(acceptCursor(1, 2)).toBe(true);
    expect(acceptCursor(2, 2)).toBe(false);
    expect(acceptCursor(2, 1)).toBe(false);
  });

  it('keys anchors stably for idle comparison (positions quantized to 1%)', () => {
    expect(anchorKey({ kind: 'row', rowId: 'r1', fx: 0.5, fy: 0.5 })).toBe('row:r1:50:50');
    expect(anchorKey({ kind: 'row', rowId: 'r1', fx: 0.501, fy: 0.499 })).toBe('row:r1:50:50'); // micro-jitter collapses
    expect(anchorKey({ kind: 'date', date: '2026-10-12', fx: 0, fy: 1 })).toBe('date:2026-10-12:0:100');
    expect(anchorKey({ kind: 'day', sectionIndex: 2, fx: 0.5, fy: 0.5 })).toBe('day:2::50:50');
    expect(anchorKey({ kind: 'day', sectionIndex: 2, section: 'scenes', fx: 0.5, fy: 0.5 })).toBe('day:2:scenes:50:50');
    expect(anchorKey({ kind: 'dom', key: 'nav:tab:schedule', fx: 0.25, fy: 0.75 })).toBe('dom:nav:tab:schedule:25:75');
    expect(anchorKey({ kind: 'screen', xr: 0.33, yr: 0.66 })).toBe('screen:33:66');
    expect(anchorKey({ kind: 'grid', scope: 'g', rowKey: 'r', colKey: 'c', rowIndex: 1, colIndex: 2, fx: 0.5, fy: 0.5 })).toBe('grid:g:r:c:1:2:50:50');
    expect(anchorKey(null)).toBe('');
  });
});

describe('screen fractions', () => {
  it('maps a client point into 0..1 of the viewport', () => {
    expect(screenFractions(600, 400, 1200, 800)).toEqual({ xr: 0.5, yr: 0.5 });
    expect(screenFractions(-50, 9999, 1200, 800)).toEqual({ xr: 0, yr: 1 });
    expect(screenFractions(10, 10, 0, 0)).toEqual({ xr: 0.5, yr: 0.5 });
  });
});

describe('pointer fractions', () => {
  it('maps a client point into 0..1 of the element rect', () => {
    const rect = { left: 100, top: 50, width: 200, height: 40 };
    expect(pointerFractions(200, 70, rect)).toEqual({ fx: 0.5, fy: 0.5 });
    expect(pointerFractions(0, 0, rect)).toEqual({ fx: 0, fy: 0 });
    expect(pointerFractions(9999, 9999, rect)).toEqual({ fx: 1, fy: 1 });
  });

  it('falls back to the centre for a zero-sized rect', () => {
    expect(pointerFractions(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ fx: 0.5, fy: 0.5 });
  });
});

describe('cursor throttle', () => {
  afterEach(() => vi.useRealTimers());

  it('sends leading, coalesces a burst into one trailing send', () => {
    vi.useFakeTimers();
    let clock = 0;
    const sent: number[] = [];
    const throttle = createThrottle<number>(v => sent.push(v), 100, () => clock);
    throttle.emit(1); // leading
    clock = 10;
    throttle.emit(2);
    clock = 20;
    throttle.emit(3);
    expect(sent).toEqual([1]); // burst still coalescing

    // The trailing timer is overdue (hidden-tab throttling) → the next event
    // flushes the queued sample, then queues the new one.
    clock = 200;
    throttle.emit(4);
    expect(sent).toEqual([1, 3]);
    vi.advanceTimersByTime(100);
    expect(sent).toEqual([1, 3, 4]);
  });

  it('never drops a lone sample: a move inside the window flushes right after it', () => {
    vi.useFakeTimers();
    let clock = 0;
    const sent: number[] = [];
    const throttle = createThrottle<number>(v => sent.push(v), 100, () => clock);
    throttle.emit(1); // leading (e.g. a click)
    clock = 20;
    throttle.emit(2); // lone move within the window — must NOT be lost
    expect(sent).toEqual([1]);
    vi.advanceTimersByTime(80); // trailing timer fires
    expect(sent).toEqual([1, 2]);
  });
});

describe('S3.5 save ping decision', () => {
  it('ignores revisions that are not newer', () => {
    expect(decidePeerSave(3, 3, false)).toBe('ignore');
    expect(decidePeerSave(2, 3, true)).toBe('ignore');
  });
  it('applies silently when clean, prompts when dirty', () => {
    expect(decidePeerSave(4, 3, false)).toBe('apply');
    expect(decidePeerSave(4, 3, true)).toBe('prompt');
  });
});

describe('view ↔ place mapping', () => {
  it('round-trips a place with one-shot targets', () => {
    const place = { tab: 'production' as const, sub: 'days', mode: 'callsheet', daySection: 2, sceneId: 's9' };
    const view = placeToPresenceView(place);
    expect(view).toEqual({ tab: 'production', sub: 'days', mode: 'callsheet', daySection: 2, sceneId: 's9' });
    expect(presenceViewToPlace(view)).toEqual(place);
  });

  it('carries the Sheet scene + position (picked scene wins on the follower)', () => {
    const place = { tab: 'breakdown' as const, sub: 'sheet', sceneId: 's3', sheetIndex: 4 };
    const view = placeToPresenceView(place);
    expect(view).toEqual({ tab: 'breakdown', sub: 'sheet', sceneId: 's3', sheetIndex: 4 });
    expect(presenceViewToPlace(view)).toEqual(place);
  });

  it('rejects remote views with an unknown tab', () => {
    expect(presenceViewToPlace({ tab: 'hacked' })).toBeNull();
    expect(presenceViewToPlace(null)).toBeNull();
  });
});

describe('local-overlay signal hub (roadmap 240)', () => {
  it('announces open/close edges and the top of the stack', () => {
    const hub = createOverlaySignalHub();
    const kinds: Array<string | null> = [];
    hub.subscribe((reason) => kinds.push(`${reason}:${hub.getKind()}`));
    const closeMenu = hub.open('menu');
    expect(hub.getKind()).toBe('menu');
    const closeModal = hub.open('modal'); // nested: newest surface wins
    expect(hub.getKind()).toBe('modal');
    closeModal();
    expect(hub.getKind()).toBe('menu'); // falls back to the enclosing modal
    closeMenu();
    expect(hub.getKind()).toBeNull();
    expect(kinds).toEqual(['change:menu', 'change:modal', 'change:menu', 'change:null']);

    const unsubscribe = hub.subscribe((reason) => kinds.push(`after-unsub:${reason}`));
    unsubscribe();
    hub.open('menu')();
    expect(kinds.some(k => k.startsWith('after-unsub'))).toBe(false);
  });

  it('heartbeats only while something is open, and pauses on blur/window switch', () => {
    const hub = createOverlaySignalHub();
    const seen: string[] = [];
    hub.subscribe((reason) => seen.push(reason));
    hub.heartbeat();
    expect(seen).toEqual([]); // nothing open — no pointless close re-sends

    const close = hub.open('menu');
    expect(seen).toEqual(['change']); // the open edge
    hub.heartbeat();
    expect(seen).toEqual(['change', 'heartbeat']);
    hub.setPaused(true); // tab hidden / window blurred
    hub.heartbeat();
    expect(seen).toEqual(['change', 'heartbeat']); // paused — receivers clear via the TTL
    hub.setPaused(false);
    expect(seen).toEqual(['change', 'heartbeat', 'heartbeat']); // resume re-announces an open overlay
    close();
    expect(seen).toEqual(['change', 'heartbeat', 'heartbeat', 'change']);
  });
});

describe('presence comfort — modal freeze + collision fade (roadmap 244)', () => {
  it('selects the modal-window glyph from the cue, not the input kind', () => {
    expect(cursorGlyph('mouse', 'modal')).toBe('window');
    expect(cursorGlyph('touch', 'modal')).toBe('window');
    expect(cursorGlyph('pen', 'modal')).toBe('window');
    // Menus keep moving, so they keep the pointer-kind glyph.
    expect(cursorGlyph('mouse', 'menu')).toBe('arrow');
    expect(cursorGlyph('touch', 'menu')).toBe('hand');
    expect(cursorGlyph('pen', null)).toBe('pen');
    expect(cursorGlyph('touch', null)).toBe('hand');
  });

  it('freezes cursor frames for ANY fresh overlay cue (menus included)', () => {
    const signals = [
      { userId: 'u1', kind: 'modal' as const, at: 1_000 },
      { userId: 'u2', kind: 'menu' as const, at: 1_000 },
    ];
    expect(freezeCursorFor(signals, 'u1', 1_400, 800)).toBe(true);
    expect(freezeCursorFor(signals, 'u2', 1_400, 800)).toBe(true); // menus freeze too (user decision 2026-10-15)
    expect(freezeCursorFor(signals, 'u1', 1_900, 800)).toBe(false); // stale — tab gone
    expect(freezeCursorFor(signals, 'u3', 1_400, 800)).toBe(false); // unknown user
    // Newest window wins: a close edge unfreezes; a newer MODAL from the other
    // window keeps the freeze (every cue freezes now).
    expect(freezeCursorFor([{ userId: 'u1', kind: 'menu' as const, at: 1_000 }, { userId: 'u1', kind: 'modal' as const, at: 1_200 }], 'u1', 1_300, 800)).toBe(true);
    expect(freezeCursorFor([{ userId: 'u1', kind: 'modal' as const, at: 1_000 }, { userId: 'u1', kind: null, at: 1_100 }], 'u1', 1_200, 800)).toBe(false);
  });

  it('steps the collision dwell: near+dwell fades, far restores, the band holds', () => {
    const t0 = 10_000;
    // No local pointer yet (Infinity) — never fades, same state object back.
    expect(stepCollisionDwell(COLLISION_DWELL_IDLE, Number.POSITIVE_INFINITY, t0)).toBe(COLLISION_DWELL_IDLE);
    // Within the near threshold the dwell starts; the fade needs the full time.
    const near = stepCollisionDwell(COLLISION_DWELL_IDLE, 10, t0);
    expect(near).toEqual({ since: t0, faded: false });
    expect(stepCollisionDwell(near, 20, t0 + 1_000).faded).toBe(false);
    expect(stepCollisionDwell(near, 20, t0 + 2_000).faded).toBe(true);
    // The hysteresis band keeps the accumulation / the fade (no flicker at the edge).
    expect(stepCollisionDwell(near, 45, t0 + 1_500)).toEqual(near);
    expect(stepCollisionDwell({ since: t0, faded: true }, 45, t0 + 5_000).faded).toBe(true);
    // Separation past the far threshold restores immediately.
    expect(stepCollisionDwell({ since: t0, faded: true }, COLLISION_FAR_PX, t0 + 5_000)).toEqual({ since: null, faded: false });
    // …and a later proximity starts a FRESH dwell (no instant re-fade).
    const again = stepCollisionDwell({ since: null, faded: false }, 10, t0 + 6_000);
    expect(stepCollisionDwell(again, 10, t0 + 6_500).faded).toBe(false);
    expect(stepCollisionDwell(again, 10, t0 + 8_000).faded).toBe(true);
  });
});

describe('presence glide motion (shared by pointers + drag ghosts)', () => {
  it('eases toward the target and snaps onto it', () => {
    const cur = { left: 0, top: 0 };
    const target = { left: 100, top: 50 };
    expect(glideStep(cur, target, SMOOTH_TAU_MS)).toBe(false);
    // dt clamps at 64ms (a background-tab wake eases, never jumps): one
    // clamped step closes ~44% of the distance.
    expect(cur.left).toBeGreaterThan(40);
    expect(cur.left).toBeLessThan(50);
    expect(cur.top).toBeGreaterThan(20);
    expect(cur.top).toBeLessThan(25);
    for (let i = 0; i < 200; i++) glideStep(cur, target, SMOOTH_TAU_MS);
    expect(cur).toEqual(target);
    expect(glideStep(cur, target, SMOOTH_TAU_MS)).toBe(true);
  });

  it('snaps instantly under prefers-reduced-motion and clamps a huge dt', () => {
    const cur = { left: 0, top: 0 };
    expect(glideStep(cur, { left: 500, top: -500 }, 16, true)).toBe(true);
    expect(cur).toEqual({ left: 500, top: -500 });
    // A background-tab wake (huge dt) still eases — never overshoots/jumps.
    const cur2 = { left: 0, top: 0 };
    glideStep(cur2, { left: 100, top: 100 }, 100_000);
    expect(cur2.left).toBeGreaterThan(0);
    expect(cur2.left).toBeLessThan(100);
  });
});

describe('same-view gating (only show a peer on their exact place)', () => {
  const callsheet = { tab: 'production' as const, sub: 'days', mode: 'callsheet' };

  it('requires the same tab, sub-tab and mode', () => {
    expect(sameViewPlace({ tab: 'production', sub: 'days', mode: 'callsheet' }, callsheet)).toBe(true);
    expect(sameViewPlace({ tab: 'production', sub: 'days', mode: 'manager' }, callsheet)).toBe(false);
    expect(sameViewPlace({ tab: 'production', sub: 'crew', mode: 'callsheet' }, callsheet)).toBe(false);
    expect(sameViewPlace({ tab: 'schedule' }, callsheet)).toBe(false);
  });

  it('normalizes missing modes for mode-bearing sub-tabs (manager is the default)', () => {
    const manager = { tab: 'production' as const, sub: 'days' };
    expect(sameViewPlace({ tab: 'production', sub: 'days' }, manager)).toBe(true);
    expect(sameViewPlace({ tab: 'production', sub: 'days', mode: 'manager' }, manager)).toBe(true);
    expect(sameViewPlace({ tab: 'production', sub: 'days', mode: 'callsheet' }, manager)).toBe(false);
  });

  it('hides pointers from a peer with no view yet', () => {
    expect(sameViewPlace(null, callsheet)).toBe(false);
    expect(sameViewPlace(undefined, callsheet)).toBe(false);
    expect(sameViewPlace(callsheet, null)).toBe(false);
  });

  it('gates document-scoped pages on the open document (roadmap 236)', () => {
    const sheet5 = { tab: 'breakdown' as const, sub: 'sheet', sceneId: 's5' };
    expect(sameViewPlace(sheet5, { tab: 'breakdown', sub: 'sheet', sceneId: 's5' })).toBe(true);
    expect(sameViewPlace(sheet5, { tab: 'breakdown', sub: 'sheet', sceneId: 's9' })).toBe(false);
    // A missing id on either side falls back to the place rule (transient
    // publishes must not flash every pointer away).
    expect(sameViewPlace(sheet5, { tab: 'breakdown', sub: 'sheet' })).toBe(true);
    expect(sameViewPlace({ tab: 'breakdown', sub: 'sheet' }, sheet5)).toBe(true);

    const designerA = { tab: 'design' as const, sub: 'designer', designId: 'dA' };
    expect(sameViewPlace(designerA, { tab: 'design', sub: 'designer', designId: 'dA' })).toBe(true);
    expect(sameViewPlace(designerA, { tab: 'design', sub: 'designer', designId: 'dB' })).toBe(false);
    expect(sameViewPlace(designerA, { tab: 'design', sub: 'colors' })).toBe(false);

    const ribbonsA = { tab: 'design' as const, sub: 'ribbons', ribbonId: 'rA' };
    expect(sameViewPlace(ribbonsA, { tab: 'design', sub: 'ribbons', ribbonId: 'rA' })).toBe(true);
    expect(sameViewPlace(ribbonsA, { tab: 'design', sub: 'ribbons', ribbonId: 'rB' })).toBe(false);

    // Non-document pages ignore the extra identity fields.
    expect(sameViewPlace({ tab: 'schedule' }, { tab: 'schedule' })).toBe(true);
  });
});
