import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLoopbackRoomsUrl, roomsConfigured, roomsUrl, usesDevRoomTokens } from '../rooms/roomsEnv';

// Roadmap 246: VITE_ROOMS_URL is read in exactly ONE place, with a DEV-only
// fallback to the local worker the dev server auto-starts.
describe('roomsEnv — the ONE rooms-URL read + its dev fallback', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('honours an explicit VITE_ROOMS_URL', () => {
    vi.stubEnv('VITE_ROOMS_URL', 'https://lemon-rooms.example.workers.dev');
    expect(roomsUrl()).toBe('https://lemon-rooms.example.workers.dev');
    expect(roomsConfigured()).toBe(true);
  });

  it('falls back to the local worker in dev builds when VITE_ROOMS_URL is unset', () => {
    vi.stubEnv('VITE_ROOMS_URL', '');
    expect(import.meta.env.DEV).toBe(true); // unit tests run in dev mode
    expect(roomsUrl()).toBe('http://127.0.0.1:8787');
    expect(roomsConfigured()).toBe(true);
  });

  it('stays off in a production build when VITE_ROOMS_URL is unset', () => {
    vi.stubEnv('VITE_ROOMS_URL', '');
    vi.stubEnv('DEV', false);
    expect(roomsUrl()).toBeUndefined();
    expect(roomsConfigured()).toBe(false);
  });

  it('isLoopbackRoomsUrl only accepts the local worker hosts', () => {
    expect(isLoopbackRoomsUrl('http://127.0.0.1:8787')).toBe(true);
    expect(isLoopbackRoomsUrl('http://localhost:9999')).toBe(true);
    expect(isLoopbackRoomsUrl('https://lemon-rooms.example.workers.dev')).toBe(false);
    expect(isLoopbackRoomsUrl('not a url')).toBe(false);
  });

  it('usesDevRoomTokens: dev tokens ONLY for the loopback worker', () => {
    // Dev + local/unset → the local worker's DEV_AUTH accepts dev tokens.
    expect(usesDevRoomTokens('http://127.0.0.1:8787', true)).toBe(true);
    expect(usesDevRoomTokens(undefined, true)).toBe(true);
    // Dev pointed at the DEPLOYED worker → real tokens (no DEV_AUTH out there).
    expect(usesDevRoomTokens('https://lemon-rooms.example.workers.dev', true)).toBe(false);
    // Prod → never dev tokens.
    expect(usesDevRoomTokens('https://lemon-rooms.example.workers.dev', false)).toBe(false);
    expect(usesDevRoomTokens(undefined, false)).toBe(false);
  });
});
