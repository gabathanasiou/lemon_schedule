import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acceptCursor,
  anchorKey,
  createThrottle,
  decidePeerSave,
  mergePeers,
  parseAnchor,
  parseCursorPayload,
  parsePresenceMeta,
  parseSavePayload,
  parseView,
  placeToPresenceView,
  presenceTopic,
  presenceViewToPlace,
} from '../supabase/presence';

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

  it('parses anchors and rejects malformed ones', () => {
    expect(parseAnchor({ kind: 'row', rowId: 'r1' })).toEqual({ kind: 'row', rowId: 'r1' });
    expect(parseAnchor({ kind: 'row' })).toBeNull();
    expect(parseAnchor({ kind: 'date', date: '2026-10-12' })).toEqual({ kind: 'date', date: '2026-10-12' });
    expect(parseAnchor({ kind: 'day', sectionIndex: 3, section: 'scenes' })).toEqual({ kind: 'day', sectionIndex: 3, section: 'scenes' });
    expect(parseAnchor({ kind: 'day', sectionIndex: 3 })).toEqual({ kind: 'day', sectionIndex: 3 });
    expect(parseAnchor({ kind: 'day' })).toBeNull();
    expect(parseAnchor('row:1')).toBeNull();
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
    expect(parseCursorPayload({ userId: 'u', clientId: 'c', ts: 3, anchor: { kind: 'row', rowId: 'r' } }))
      .toEqual({ userId: 'u', clientId: 'c', ts: 3, anchor: { kind: 'row', rowId: 'r' } });
    expect(parseCursorPayload({ userId: 'u', clientId: 'c', ts: 3, anchor: { kind: 'nope' } })).toBeNull();
    expect(parseSavePayload({ userId: 'u', revision: 4, ts: 9 })).toEqual({ userId: 'u', revision: 4, ts: 9 });
    expect(parseSavePayload({ userId: 'u', revision: 0, ts: 9 })).toBeNull();
    expect(parseSavePayload({ userId: 'u', revision: '4', ts: 9 })).toBeNull();
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

  it('keys anchors stably for idle comparison', () => {
    expect(anchorKey({ kind: 'row', rowId: 'r1' })).toBe('row:r1');
    expect(anchorKey({ kind: 'date', date: '2026-10-12' })).toBe('date:2026-10-12');
    expect(anchorKey({ kind: 'day', sectionIndex: 2 })).toBe('day:2:');
    expect(anchorKey({ kind: 'day', sectionIndex: 2, section: 'scenes' })).toBe('day:2:scenes');
    expect(anchorKey(null)).toBe('');
  });
});

describe('cursor throttle', () => {
  afterEach(() => vi.useRealTimers());

  it('sends leading, coalesces the burst, then sends one trailing value', () => {
    vi.useFakeTimers();
    let clock = 0;
    const sent: number[] = [];
    const throttle = createThrottle<number>(v => sent.push(v), 100, () => clock);
    throttle.emit(1); // leading
    clock = 10;
    throttle.emit(2);
    throttle.emit(3);
    clock = 20;
    throttle.emit(4);
    expect(sent).toEqual([1]);
    clock = 30;
    vi.advanceTimersByTime(90); // trailing timer fires (scheduled for 90ms at emit time)
    expect(sent).toEqual([1, 4]); // burst collapsed to the last value
    clock = 200;
    throttle.emit(5); // outside the window → leading again
    expect(sent).toEqual([1, 4, 5]);
    throttle.cancel();
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([1, 4, 5]);
  });

  it('flush sends any pending value immediately', () => {
    vi.useFakeTimers();
    let clock = 0;
    const sent: number[] = [];
    const throttle = createThrottle<number>(v => sent.push(v), 100, () => clock);
    throttle.emit(1);
    clock = 5;
    throttle.emit(2);
    throttle.flush();
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

  it('rejects remote views with an unknown tab', () => {
    expect(presenceViewToPlace({ tab: 'hacked' })).toBeNull();
    expect(presenceViewToPlace(null)).toBeNull();
  });
});
