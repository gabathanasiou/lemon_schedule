import { describe, expect, it } from 'vitest';
import { roomBadgeState, roomBadgeText } from '../rooms/roomBadge';
import type { RoomStatus } from '../rooms/roomClient';

/**
 * Roadmap 239 stage 1 — the header room-status badge mapping. The badge is
 * pure UI; these tests pin WHEN it shows and that the copy never promises a
 * queue (stage 1 has none — edits aren't transported while the room is down).
 */
describe('room status badge (roadmap 239 stage 1)', () => {
  const base = { roomsConfigured: true, onlineProject: true, networkOnline: true };

  it('hides when the badge does not apply', () => {
    expect(roomBadgeState({ ...base, status: 'open' })).toBe('hidden');
    // Rooms not configured = the pre-S4 shared mode; there is no room to lose.
    expect(roomBadgeState({ ...base, roomsConfigured: false, status: 'reconnecting' })).toBe('hidden');
    expect(roomBadgeState({ ...base, onlineProject: false, status: 'reconnecting' })).toBe('hidden');
    // The whole network is down — the offline banner owns that message.
    expect(roomBadgeState({ ...base, networkOnline: false, status: 'reconnecting' })).toBe('hidden');
  });

  it('says connecting while the room is joining', () => {
    expect(roomBadgeState({ ...base, status: 'idle' })).toBe('connecting');
    expect(roomBadgeState({ ...base, status: 'connecting' })).toBe('connecting');
    expect(roomBadgeState({ ...base, status: 'syncing' })).toBe('connecting');
  });

  it('says unreachable for a down or retrying room', () => {
    expect(roomBadgeState({ ...base, status: 'reconnecting' })).toBe('unreachable');
    expect(roomBadgeState({ ...base, status: 'closed' })).toBe('unreachable');
  });

  it('carries the queue counts and promises the sync (stage 2 buffer)', () => {
    expect(roomBadgeText('hidden')).toBe('');
    expect(roomBadgeText('connecting')).toMatch(/connecting/i);
    expect(roomBadgeText('connecting', { pending: 3, dropped: 0 })).toMatch(/3 changes queued/i);
    expect(roomBadgeText('connecting', { pending: 1, dropped: 0 })).toMatch(/1 change queued/i);

    // Unreachable: nothing buffered yet → "keep working"; buffered → the count.
    expect(roomBadgeText('unreachable')).toMatch(/keep working/i);
    const one = roomBadgeText('unreachable', { pending: 1, dropped: 0 });
    expect(one).toMatch(/1 change queued locally/i);
    expect(one).toMatch(/syncing when the connection returns/i);

    // A full buffer surfaces its drops.
    const dropped = roomBadgeText('unreachable', { pending: 2, dropped: 3 });
    expect(dropped).toMatch(/2 changes queued locally/i);
    expect(dropped).toMatch(/3 changes dropped/i);
  });

  it('covers every transport status', () => {
    const all: RoomStatus[] = ['idle', 'connecting', 'syncing', 'open', 'reconnecting', 'closed'];
    for (const status of all) {
      expect(['hidden', 'connecting', 'unreachable']).toContain(roomBadgeState({ ...base, status }));
    }
  });
});
