import { describe, it, expect } from 'vitest';
import { makeBlankProject, reducer } from '../../store/reducer';
import type { State, Action } from '../../store/reducer';
import { createBlankScene } from '../sceneFactory';

function init(): State {
  const blank = makeBlankProject('Trash Channels');
  return reducer({ past: [], present: blank, future: [], _batchDepth: 0 }, { type: 'LOAD', payload: blank });
}

const run = (s: State, ...actions: Action[]) => actions.reduce(reducer, s);

describe('version trash', () => {
  it('deleting an inactive version trashes it and keeps the active one', () => {
    let s = run(init(), { type: 'NEW_VERSION', payload: { name: 'v02' } });
    const active = s.present.activeVersionId;
    const other = s.present.versions.find(v => v.id !== active)!.id;

    s = run(s, { type: 'DELETE_VERSION', payload: other });
    expect(s.present.versions.map(v => v.id)).not.toContain(other);
    expect(s.present.activeVersionId).toBe(active);
    expect((s.present.versionTrash || []).some(t => t.version.id === other)).toBe(true);
  });

  it('deleting the active version activates another', () => {
    let s = run(init(), { type: 'NEW_VERSION', payload: { name: 'v02' } });
    const active = s.present.activeVersionId;
    s = run(s, { type: 'DELETE_VERSION', payload: active });
    expect(s.present.versions.map(v => v.id)).not.toContain(active);
    expect(s.present.activeVersionId).not.toBe(active);
    expect(s.present.versions.map(v => v.id)).toContain(s.present.activeVersionId);
  });

  it('deleting the last remaining version is a no-op; restore brings a version back', () => {
    const s0 = init();
    expect(run(s0, { type: 'DELETE_VERSION', payload: s0.present.versions[0].id })).toBe(s0);

    let s = run(init(), { type: 'NEW_VERSION', payload: { name: 'v02' } });
    const other = s.present.versions.find(v => v.id !== s.present.activeVersionId)!.id;
    s = run(s, { type: 'DELETE_VERSION', payload: other });
    const before = s.present.versions.length;
    s = run(s, { type: 'RESTORE_VERSION_FROM_TRASH', payload: other });
    expect(s.present.versions.length).toBe(before + 1);
    expect((s.present.versionTrash || []).some(t => t.version.id === other)).toBe(false);
  });
});

describe('element trash (non-cast)', () => {
  it('delete scrubs scene values + registry and trashes it; restore re-adds the element', () => {
    const scene = createBlankScene({ sceneNumber: '1', props: 'gun, rope' });
    let s = run(init(),
      { type: 'ADD_ELEMENT', payload: { category: 'props', element: { id: 'gun', name: 'gun' } } },
      { type: 'ADD_SCENE', payload: scene },
    );
    s = run(s, { type: 'DELETE_ELEMENT', payload: { category: 'props', id: 'gun' } });
    expect((s.present.breakdownElements.props || []).some(e => e.name === 'gun')).toBe(false);
    expect(s.present.scenes.find(x => x.id === scene.id)!.props).toBe('rope');
    expect(s.present.elementsTrash.some(t => t.category === 'props' && t.element.id === 'gun')).toBe(true);

    s = run(s, { type: 'RESTORE_ELEMENT_FROM_TRASH', payload: 'gun' });
    expect((s.present.breakdownElements.props || []).some(e => e.name === 'gun')).toBe(true);
    expect(s.present.elementsTrash.some(t => t.element.id === 'gun')).toBe(false);
  });
});

describe('cast delete', () => {
  it('scrubs scene cast ids; cast deletes are permanent (no trash entry)', () => {
    const scene = createBlankScene({ sceneNumber: '1', cast: '1, 2' });
    let s = run(init(),
      { type: 'ADD_CAST_MEMBER', payload: { id: '1', name: 'GEORGE' } as any },
      { type: 'ADD_CAST_MEMBER', payload: { id: '2', name: 'MARY' } as any },
      { type: 'ADD_SCENE', payload: scene },
    );
    s = run(s, { type: 'DELETE_CAST_MEMBER', payload: '1' });
    expect((s.present.castMembers || []).some(c => c.id === '1')).toBe(false);
    expect(s.present.scenes.find(x => x.id === scene.id)!.cast).toBe('2');
    // cast is id-keyed and permanent — nothing is trashed
    expect((s.present.elementsTrash || []).some(t => t.category === 'cast')).toBe(false);
  });
});
