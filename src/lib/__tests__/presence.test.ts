import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acceptCursor,
  anchorKey,
  createThrottle,
  decidePeerSave,
  mergePeers,
  parseAccessPayload,
  parseAnchor,
  parseCursorPayload,
  parseOverlayPayload,
  parsePresenceMeta,
  parseSavePayload,
  parseScrollPayload,
  parseView,
  parseViewPayload,
  placeToPresenceView,
  pointerFractions,
  pointerGlyph,
  pointerKindOf,
  presenceTopic,
  presenceViewToPlace,
  resolveOverlayCues,
  sameViewPlace,
  screenFractions,
} from '../supabase/presence';
import { createOverlaySignalHub } from '../localOverlaySignal';
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
    // Unknown values are dropped, never trusted.
    expect(parseView({ tab: 'schedule', viewMode: 'wide', cellBorders: 'dotted', calendarView: 'grid', sheetIndex: 'x' }))
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

  it('maps an input kind to its glyph', () => {
    expect(pointerGlyph('mouse')).toBe('arrow');
    expect(pointerGlyph('touch')).toBe('hand');
    expect(pointerGlyph('pen')).toBe('pen');
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
  });
});
