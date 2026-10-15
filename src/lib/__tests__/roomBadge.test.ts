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

  it('carries copy per state and never promises a queue', () => {
    expect(roomBadgeText('hidden')).toBe('');
    expect(roomBadgeText('connecting')).toMatch(/connecting/i);
    const unreachable = roomBadgeText('unreachable');
    expect(unreachable).toMatch(/unreachable/i);
    expect(unreachable).not.toMatch(/queued|saved locally|will sync/i);
  });

  it('covers every transport status', () => {
    const all: RoomStatus[] = ['idle', 'connecting', 'syncing', 'open', 'reconnecting', 'closed'];
    for (const status of all) {
      expect(['hidden', 'connecting', 'unreachable']).toContain(roomBadgeState({ ...base, status }));
    }
  });
});
