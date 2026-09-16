import { describe, it, expect } from 'vitest';
import { renumberSplitGroup, moveSplitBreak, resolveSplitGroup, splitGroups } from '../splitGroups';
import type { Project, Scene, ScriptScene } from '../../types';

function scene(over: Partial<Scene>): Scene {
  return {
    id: 'x', sceneNumber: '1', intExt: 'INT', set: 'ROOM', dayNight: 'DAY',
    pageCount: '0', pageCountDecimal: 0, description: '', cast: '', notes: '',
    location: '', backgroundActors: '', stunts: '', vehicles: '', props: '',
    wardrobe: '', makeup: '', sfx: '', vfx: '', sound: '', music: '',
    animalsAndWranglers: '', weapons: '', greenery: '', artDept: '', ...over,
  } as Scene;
}

const docScene = (sceneNumber: string, blocks: ScriptScene['blocks']): ScriptScene => ({ sceneNumber, blocks });

function project(over: Partial<Project> = {}): Project {
  return {
    scenes: [],
    castMembers: [],
    customCategories: [],
    categoryLabels: {},
    breakdownElements: {},
    scriptAnnotations: [],
    scriptDocument: { format: 'fdx', scenes: [] },
    ...over,
  } as unknown as Project;
}

const collect = () => {
  const actions: any[] = [];
  return { actions, dispatch: (a: any) => actions.push(a) };
};

function splitProject() {
  const original = scene({ id: 'o', sceneNumber: '5' });
  const frag = scene({ id: 'f1', sceneNumber: '5A', duplicateOf: 'o', duplicateKind: 'split' });
  const doc = {
    format: 'fdx' as const,
    scenes: [
      docScene('5', [['heading', 'INT. A - DAY'], ['action', 'one'], ['action', 'two']]),
      docScene('5A', [['heading', 'INT. A - DAY'], ['action', 'three'], ['action', 'four']]),
    ],
  };
  return { original, frag, doc };
}

describe('splitGroups', () => {
  it('groups fragments by original id', () => {
    const { original, frag } = splitProject();
    const groups = splitGroups([original, frag, scene({ id: 'z', sceneNumber: '9' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].fragments.map(f => f.id)).toEqual(['f1']);
  });
});

describe('renumberSplitGroup', () => {
  it('normalizes the group numbers AND the retained body scene numbers', () => {
    const original = scene({ id: 'o', sceneNumber: '5' });
    const frag = scene({ id: 'f1', sceneNumber: '5X', duplicateOf: 'o', duplicateKind: 'split' });
    const doc = {
      format: 'fdx' as const,
      scenes: [docScene('5', [['heading', 'H'], ['action', 'one']]), docScene('5X', [['heading', 'H2']])],
    };
    const p = project({ scenes: [original, frag], scriptDocument: doc });
    const { actions, dispatch } = collect();
    expect(renumberSplitGroup(dispatch, p, 'o')).toBe(true);
    const sceneUpdates = actions.filter(a => a.type === 'UPDATE_SCENE');
    expect(sceneUpdates.map(a => a.payload)).toEqual([{ id: 'f1', sceneNumber: '5A' }]);
    const docUpdate = actions.find(a => a.type === 'UPDATE_SCRIPT_DOCUMENT');
    expect(docUpdate.payload.document.scenes.map((s: any) => s.sceneNumber)).toEqual(['5', '5A']);
    expect(actions[0].type).toBe('BATCH_START');
    expect(actions.at(-1).type).toBe('BATCH_COMMIT');
  });

  it('aborts when a target number collides with a scene outside the group', () => {
    const { original, frag, doc } = splitProject();
    const p = project({ scenes: [original, frag, scene({ id: 'z', sceneNumber: '5A' })], scriptDocument: doc });
    const { dispatch } = collect();
    expect(renumberSplitGroup(dispatch, p, 'o')).toBe(false);
  });

  it('is a no-op when the group is already normalized', () => {
    const { original, frag, doc } = splitProject();
    const p = project({ scenes: [original, frag], scriptDocument: doc });
    const { dispatch } = collect();
    expect(renumberSplitGroup(dispatch, p, 'o')).toBe(false);
  });
});

describe('moveSplitBreak', () => {
  it('moves a block across the cut and carries its tag by absolute position', () => {
    const { original, frag, doc } = splitProject();
    const p = project({
      scenes: [original, frag],
      scriptDocument: doc,
      scriptAnnotations: [
        { id: 't-one', sceneId: 'o', blockIndex: 1, start: 0, end: 3, text: 'one', category: 'props', elementKey: 'ONE' },
        { id: 't-three', sceneId: 'f1', blockIndex: 1, start: 0, end: 5, text: 'three', category: 'props', elementKey: 'THREE' },
      ],
    });
    const { actions, dispatch } = collect();
    expect(moveSplitBreak(dispatch, p, 'o', 1)).toBe(true);

    const docUpdate = actions.find(a => a.type === 'UPDATE_SCRIPT_DOCUMENT');
    const [origScene, fragScene] = docUpdate.payload.document.scenes;
    expect(origScene.blocks.map((b: any) => b[1])).toEqual(['INT. A - DAY']);
    expect(fragScene.blocks.map((b: any) => b[1])).toEqual(['INT. A - DAY', 'one', 'two', 'three', 'four']);

    const updates = Object.fromEntries(actions.filter(a => a.type === 'UPDATE_SCRIPT_ANNOTATION').map(a => [a.payload.id, a.payload.updates]));
    // "one" moved from the original into the fragment (index 1 after the heading).
    expect(updates['t-one']).toMatchObject({ sceneId: 'f1', blockIndex: 1 });
    // "three" shifted down inside the fragment.
    expect(updates['t-three']).toMatchObject({ sceneId: 'f1', blockIndex: 3 });
  });

  it('refuses to move when a member has no retained body', () => {
    const { original, frag } = splitProject();
    const p = project({ scenes: [original, frag], scriptDocument: { format: 'fdx', scenes: [docScene('5', [['heading', 'H'], ['action', 'one']])] } });
    const { dispatch } = collect();
    expect(moveSplitBreak(dispatch, p, 'o', 1)).toBe(false);
  });
});

describe('resolveSplitGroup', () => {
  it('rebuilds a missing fragment body as a heading-only scene', () => {
    const { original, frag } = splitProject();
    const p = project({
      scenes: [original, frag],
      scriptDocument: { format: 'fdx', scenes: [docScene('5', [['heading', 'H'], ['action', 'one']])] },
    });
    const { actions, dispatch } = collect();
    expect(resolveSplitGroup(dispatch, p, 'o')).toBe(1);
    const docUpdate = actions.find(a => a.type === 'UPDATE_SCRIPT_DOCUMENT');
    expect(docUpdate.payload.document.scenes.map((s: any) => s.sceneNumber)).toEqual(['5', '5A']);
    expect(docUpdate.payload.document.scenes[1].blocks).toHaveLength(1);
  });

  it('re-anchors a tag whose stored span drifted off the wording', () => {
    const { original, frag } = splitProject();
    const drifted = { ...docScene('5', [['heading', 'H'], ['action', 'the gun here']]) };
    const p = project({
      scenes: [original, frag],
      scriptDocument: { format: 'fdx', scenes: [drifted, docScene('5A', [['heading', 'H2']])] },
      scriptAnnotations: [
        { id: 't', sceneId: 'o', blockIndex: 1, start: 0, end: 3, text: 'gun', category: 'props', elementKey: 'GUN' },
      ],
    });
    const { actions, dispatch } = collect();
    expect(resolveSplitGroup(dispatch, p, 'o')).toBe(1);
    const update = actions.find(a => a.type === 'UPDATE_SCRIPT_ANNOTATION');
    expect(update.payload).toMatchObject({ id: 't', updates: { blockIndex: 1, start: 4, end: 7 } });
  });

  it('returns 0 for a clean group', () => {
    const { original, frag, doc } = splitProject();
    const p = project({ scenes: [original, frag], scriptDocument: doc });
    const { dispatch } = collect();
    expect(resolveSplitGroup(dispatch, p, 'o')).toBe(0);
  });
});
