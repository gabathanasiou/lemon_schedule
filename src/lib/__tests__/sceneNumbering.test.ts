import { describe, it, expect } from 'vitest';
import { findSceneNumberCollision, nextLetterSceneNumber } from '../sceneNumbering';

describe('findSceneNumberCollision', () => {
  it('finds another scene on the same number', () => {
    const scenes = [{ id: 'a', sceneNumber: '7' }, { id: 'b', sceneNumber: '7' }] as any;
    expect(findSceneNumberCollision(scenes, 'a', '7')?.id).toBe('b');
  });

  it('compares NORMALIZED numbers (leading zeros, case)', () => {
    expect(findSceneNumberCollision([{ id: 'a', sceneNumber: '1' }, { id: 'b', sceneNumber: '01' }] as any, 'a', '1')?.id).toBe('b');
    expect(findSceneNumberCollision([{ id: 'a', sceneNumber: '6A' }, { id: 'b', sceneNumber: '6a' }] as any, 'a', '6A')?.id).toBe('b');
  });

  it('excludes the scene being edited', () => {
    expect(findSceneNumberCollision([{ id: 'a', sceneNumber: '7' }] as any, 'a', '7')).toBeUndefined();
  });

  it('never collides on an empty or non-alphanumeric number', () => {
    const scenes = [{ id: 'a', sceneNumber: '7' }] as any;
    expect(findSceneNumberCollision(scenes, 'x', '')).toBeUndefined();
    expect(findSceneNumberCollision(scenes, 'x', '   ')).toBeUndefined();
    expect(findSceneNumberCollision(scenes, 'x', '...')).toBeUndefined();
  });

  it('returns undefined when the number is free', () => {
    expect(findSceneNumberCollision([{ id: 'a', sceneNumber: '7' }] as any, 'a', '8')).toBeUndefined();
  });
});

describe('nextLetterSceneNumber', () => {
  it('letters the next free child of the base', () => {
    const scenes = [{ sceneNumber: '6' }, { sceneNumber: '6A' }, { sceneNumber: '6B' }];
    expect(nextLetterSceneNumber(scenes, '6')).toBe('6C');
  });

  it('strips an existing trailing letter to find the base', () => {
    expect(nextLetterSceneNumber([{ sceneNumber: '6A' }], '6A')).toBe('6B');
  });

  it('detects used letters case-insensitively', () => {
    expect(nextLetterSceneNumber([{ sceneNumber: '6a' }], '6')).toBe('6B');
  });

  it('does not treat a different base as used', () => {
    expect(nextLetterSceneNumber([{ sceneNumber: '7A' }, { sceneNumber: '16A' }], '6')).toBe('6A');
  });

  it('falls back to A when every letter is taken', () => {
    const all = Array.from({ length: 26 }, (_, i) => ({ sceneNumber: '6' + String.fromCharCode(65 + i) }));
    expect(nextLetterSceneNumber(all, '6')).toBe('6A');
  });
});
