import { describe, expect, it } from 'vitest';
import { projectsEqual } from '../rooms/projectCompare';
import { ROOM_NOTE_MS, ROOM_REDO_BLOCKED, ROOM_UNDO_BLOCKED, roomNoteText } from '../rooms/roomNotes';

/**
 * Roadmap 242 — blocked undo / redo safety helpers. The room compares REBUILT
 * whole states (never per-field), so the compare must be structural and the
 * copy the note shows must come from the same constants the worker sends.
 */
describe('projectsEqual (blocked-undo / redo-baseline compare)', () => {
  it('compares objects structurally, ignoring key order', () => {
    expect(projectsEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(projectsEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(projectsEqual({ a: 1 }, { a: '1' })).toBe(false);
    expect(projectsEqual({ a: undefined }, {})).toBe(true);
    expect(projectsEqual({ a: null }, {})).toBe(false);
  });

  it('compares arrays by index and length', () => {
    expect(projectsEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(projectsEqual([1, 2, 3], [1, 3, 2])).toBe(false);
    expect(projectsEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(projectsEqual([], {})).toBe(false);
  });

  it('handles the project-shaped cases the room actually sees', () => {
    const scene = { id: 's1', sceneNumber: '1', description: 'hello', cast: '1,2' };
    // A clone with a different key order is the SAME state (the snapshot +
    // replay fold can insert keys in another order than the live fold).
    const cloned = { cast: '1,2', description: 'hello', sceneNumber: '1', id: 's1' };
    expect(projectsEqual({ scenes: [scene] }, { scenes: [cloned] })).toBe(true);
    // A peer's whole-value edit is a DIFFERENT state.
    expect(projectsEqual({ scenes: [scene] }, { scenes: [{ ...scene, description: 'hello world' }] })).toBe(false);
    // Same for nested rows / rows arrays.
    expect(projectsEqual({ rows: [{ id: 'r', order: 1 }] }, { rows: [{ id: 'r', order: 1 }] })).toBe(true);
    expect(projectsEqual({ rows: [{ id: 'r', order: 1 }] }, { rows: [{ id: 'r', order: 2 }] })).toBe(false);
  });

  it('treats primitives / null / undefined safely', () => {
    expect(projectsEqual(1, 1)).toBe(true);
    expect(projectsEqual('a', 'a')).toBe(true);
    expect(projectsEqual(null, null)).toBe(true);
    expect(projectsEqual(null, undefined)).toBe(false);
    expect(projectsEqual(undefined, {})).toBe(false);
    expect(projectsEqual('', 0)).toBe(false);
  });
});

describe('room notes (roadmap 242 copy)', () => {
  it('keeps the blocked messages verbatim — the worker sends these', () => {
    expect(ROOM_UNDO_BLOCKED).toContain('edited this after you');
    expect(ROOM_REDO_BLOCKED).toContain('edited this after you');
    expect(roomNoteText(ROOM_UNDO_BLOCKED)).toBe(ROOM_UNDO_BLOCKED);
    expect(roomNoteText(ROOM_REDO_BLOCKED)).toBe(ROOM_REDO_BLOCKED);
  });

  it('polishes the terse wire strings into note copy', () => {
    expect(roomNoteText('nothing to undo')).toBe('Nothing to undo');
    expect(roomNoteText('nothing to redo')).toBe('Nothing to redo');
    expect(roomNoteText('action too old to undo')).toBe('That change is too old to undo');
    expect(roomNoteText('view-only')).toContain('View only');
  });

  it('falls back to the raw message for anything unmapped (never hides it)', () => {
    expect(roomNoteText('internal error')).toBe('internal error');
    expect(roomNoteText('some future refusal')).toBe('some future refusal');
  });

  it('keeps the auto-hide delay sane', () => {
    expect(ROOM_NOTE_MS).toBeGreaterThanOrEqual(4_000);
    expect(ROOM_NOTE_MS).toBeLessThanOrEqual(10_000);
  });
});
