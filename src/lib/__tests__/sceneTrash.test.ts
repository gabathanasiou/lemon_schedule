import { describe, it, expect } from 'vitest';
import { makeBlankProject, reducer } from '../../store/reducer';
import type { State } from '../../store/reducer';
import { createBlankScene } from '../sceneFactory';

function init(): State {
  const blank = makeBlankProject('Trash Test');
  return reducer({ past: [], present: blank, future: [], _batchDepth: 0 }, { type: 'LOAD', payload: blank });
}

describe('ADD_SCENE row invariant', () => {
  it('adds the scene and one boneyard row per version', () => {
    const scene = createBlankScene({ sceneNumber: '1', set: 'KITCHEN' });
    const s = reducer(init(), { type: 'ADD_SCENE', payload: scene });
    expect(s.present.scenes.map(x => x.id)).toContain(scene.id);
    for (const v of s.present.versions) {
      const row = v.rows.find(r => r.sceneId === scene.id);
      expect(row).toBeTruthy();
      expect(row!.type).toBe('SCENE');
      expect(row!.containerId).toBeNull();
    }
  });
});

describe('scene trash lifecycle', () => {
  it('delete moves the scene + its rows to trash; restore brings both back', () => {
    const scene = createBlankScene({ sceneNumber: '1' });
    let s = reducer(init(), { type: 'ADD_SCENE', payload: scene });
    const versionName = s.present.versions.find(v => v.id === s.present.activeVersionId)!.name;

    s = reducer(s, { type: 'DELETE_SCENE', payload: scene.id });
    expect(s.present.scenes.some(x => x.id === scene.id)).toBe(false);
    expect(s.present.versions.every(v => !v.rows.some(r => r.sceneId === scene.id))).toBe(true);
    const item = s.present.trash.find(t => t.scene.id === scene.id);
    expect(item).toBeTruthy();
    expect(item!.versionName).toBe(versionName);

    s = reducer(s, { type: 'RESTORE_SCENE', payload: scene.id });
    expect(s.present.scenes.some(x => x.id === scene.id)).toBe(true);
    expect(s.present.trash.some(t => t.scene.id === scene.id)).toBe(false);
    for (const v of s.present.versions) {
      const row = v.rows.find(r => r.sceneId === scene.id);
      expect(row).toBeTruthy();
      expect(row!.containerId).toBeNull();
    }
  });

  it('delete/restore of an unknown id is a no-op (same state reference)', () => {
    const s = init();
    expect(reducer(s, { type: 'DELETE_SCENE', payload: 'nope' })).toBe(s);
    expect(reducer(s, { type: 'RESTORE_SCENE', payload: 'nope' })).toBe(s);
  });

  it('EMPTY_TRASH clears every trash channel', () => {
    const scene = createBlankScene({ sceneNumber: '1' });
    let s = reducer(init(), { type: 'ADD_SCENE', payload: scene });
    s = reducer(s, { type: 'DELETE_SCENE', payload: scene.id });
    s = {
      ...s,
      present: {
        ...s.present,
        elementsTrash: [{ category: 'props', element: { id: 'x', name: 'x' }, deletedAt: 0 }] as any,
        rulesTrash: [{ rule: {} as any, deletedAt: 0 }],
      },
    };
    s = reducer(s, { type: 'EMPTY_TRASH' });
    expect(s.present.trash).toEqual([]);
    expect(s.present.versionTrash).toEqual([]);
    expect(s.present.elementsTrash).toEqual([]);
    expect(s.present.rulesTrash).toEqual([]);
  });
});
