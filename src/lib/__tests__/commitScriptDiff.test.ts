import { describe, it, expect } from 'vitest';
import { commitScriptDiff, defaultDecision } from '../import/commitScriptDiff';
import type { SceneDiffEntry } from '../import/scriptDiff';
import type { ImportResult, ParsedScene } from '../import/shared';
import { createScriptDocument } from '../script';
import type { Scene } from '../../types';

function scene(over: Partial<Scene>): Scene {
  return { id: 'x', sceneNumber: '1', intExt: 'INT', set: 'ROOM', dayNight: 'DAY', pageCount: '0', pageCountDecimal: 0, description: '', cast: '', notes: '', location: '', backgroundActors: '', stunts: '', vehicles: '', props: '', wardrobe: '', makeup: '', sfx: '', vfx: '', sound: '', music: '', animalsAndWranglers: '', weapons: '', greenery: '', artDept: '', ...over } as Scene;
}
function parsed(over: Partial<ParsedScene>): ParsedScene {
  return { sceneNumber: '1', intExt: 'INT', set: 'ROOM', dayNight: 'DAY', description: '', characters: [], taggedElements: {}, ...over };
}
function entry(over: Partial<SceneDiffEntry>): SceneDiffEntry {
  return { status: 'unchanged', sceneNumber: '1', fields: [], similarity: 1, ...over };
}

const collect = () => {
  const actions: any[] = [];
  return { actions, dispatch: (a: any) => actions.push(a) };
};

const result: ImportResult = { scenes: [], characters: [], unknownCategories: [], script: createScriptDocument('fdx') };
const base = { castIdMap: new Map<string, string>(), newCustomCategories: [], existingCastMembers: [] };

describe('defaultDecision', () => {
  it('applies modified, adds added, keeps removed by default', () => {
    expect(defaultDecision(entry({ status: 'modified' }))).toBe('apply');
    expect(defaultDecision(entry({ status: 'added' }))).toBe('add');
    expect(defaultDecision(entry({ status: 'removed' }))).toBe('keep');
    expect(defaultDecision(entry({ status: 'unchanged' }))).toBe('skip');
  });
});

describe('commitScriptDiff', () => {
  it('updates matched scenes in place, adds new ones, keeps removals, one batch', () => {
    const { actions, dispatch } = collect();
    const entries = [
      entry({ status: 'modified', oldScene: scene({ id: 'old1' }), newScene: parsed({ sceneNumber: '1', taggedElements: { props: ['KNIFE'] } }) }),
      entry({ status: 'added', newScene: parsed({ sceneNumber: '4', set: 'HALL' }) }),
      entry({ status: 'removed', oldScene: scene({ id: 'old9', sceneNumber: '9' }) }),
    ];
    commitScriptDiff({ ...base, dispatch, result, entries, decisions: [] });

    expect(actions.map(a => a.type)).toEqual([
      'BATCH_START',
      'UPDATE_SCENE',
      'ADD_SCENE',
      'ADD_ELEMENT',
      'ADD_ELEMENT',
      'SET_SCRIPT_DOCUMENT',
      'BATCH_COMMIT',
    ]);
    expect(actions[1].payload).toMatchObject({ id: 'old1', props: 'KNIFE' });
    expect(actions[2].payload.sceneNumber).toBe('4');
    expect(actions[3].payload).toMatchObject({ category: 'set', element: { name: 'ROOM' } });
    expect(actions[4].payload).toMatchObject({ category: 'set', element: { name: 'HALL' } });
  });

  it('removes a scene only when the decision says so', () => {
    const { actions, dispatch } = collect();
    const entries = [entry({ status: 'removed', oldScene: scene({ id: 'old9', sceneNumber: '9' }) })];
    commitScriptDiff({ ...base, dispatch, result, entries, decisions: ['remove'] });
    expect(actions.map(a => a.type)).toEqual(['BATCH_START', 'DELETE_SCENE', 'SET_SCRIPT_DOCUMENT', 'BATCH_COMMIT']);
    expect(actions[1].payload).toBe('old9');
  });

  it('keeps a modified scene when told to keep it', () => {
    const { actions, dispatch } = collect();
    const entries = [entry({ status: 'modified', oldScene: scene({ id: 'old1' }), newScene: parsed({ sceneNumber: '1' }) })];
    commitScriptDiff({ ...base, dispatch, result, entries, decisions: ['keep'] });
    expect(actions.map(a => a.type)).toEqual(['BATCH_START', 'SET_SCRIPT_DOCUMENT', 'BATCH_COMMIT']);
  });

  it('applies heading-value mappings to ADDED scenes, not only modified ones', () => {
    const { actions, dispatch } = collect();
    const entries = [entry({ status: 'added', newScene: parsed({ sceneNumber: '4', set: 'DREAM ROOM', intExt: 'ΕΣΩΤ', dayNight: 'DREAM' }) })];
    commitScriptDiff({
      ...base, dispatch, result, entries, decisions: [],
      headingValues: { intExt: { 'ΕΣΩΤ': 'INT' }, dayNight: { DREAM: 'NIGHT' } },
    });
    const add = actions.find(a => a.type === 'ADD_SCENE');
    expect(add.payload).toMatchObject({ intExt: 'INT', dayNight: 'NIGHT' });
  });
});
