import { describe, it, expect } from 'vitest';
import {
  planTagCommit, commitTag, suggestionRanges, tagCategories, annotationElementName,
  type ScriptTagTarget,
} from '../scriptTagging';
import type { Project, Scene, ScriptAnnotation } from '../../types';

function scene(over: Partial<Scene>): Scene {
  return {
    id: 's1', sceneNumber: '1', intExt: 'INT', set: 'ROOM', dayNight: 'DAY',
    pageCount: '0', pageCountDecimal: 0, description: '', cast: '', notes: '',
    location: '', backgroundActors: '', stunts: '', vehicles: '', props: '',
    wardrobe: '', makeup: '', sfx: '', vfx: '', sound: '', music: '',
    animalsAndWranglers: '', weapons: '', greenery: '', artDept: '', ...over,
  } as Scene;
}

function project(over: Partial<Project> = {}): Project {
  return {
    scenes: [scene({})],
    castMembers: [],
    customCategories: [],
    categoryLabels: {},
    breakdownElements: {},
    scriptDocument: { format: 'fdx', scenes: [] },
    ...over,
  } as unknown as Project;
}

const target = (over: Partial<ScriptTagTarget> = {}): ScriptTagTarget => ({
  sceneId: 's1', blockIndex: 1, start: 4, end: 9, text: 'bulbs', ...over,
});

const ann = (over: Partial<ScriptAnnotation>): ScriptAnnotation => ({
  id: 'a1', sceneId: 's1', blockIndex: 1, start: 4, end: 9, text: 'bulbs',
  category: 'props', elementKey: 'BULBS', ...over,
});

const collect = () => {
  const actions: any[] = [];
  return { actions, dispatch: (a: any) => actions.push(a) };
};

describe('tagCategories', () => {
  it('lists built-ins then custom categories, deduped', () => {
    const cats = tagCategories(project({ customCategories: [{ key: 'practical', label: 'Practicals', icon: 'Tag' }] }));
    expect(cats[0].key).toBe('cast');
    expect(cats.some(c => c.key === 'props' && !c.isCustom)).toBe(true);
    expect(cats.at(-1)).toMatchObject({ key: 'practical', label: 'Practicals', isCustom: true });
  });
});

describe('planTagCommit', () => {
  it('creates a non-cast element whose name IS the highlighted text', () => {
    const plan = planTagCommit(project(), target(), 'props');
    expect(plan.elementKey).toBe('BULBS');
    expect(plan.newElement).toEqual({ id: 'BULBS', name: 'BULBS' });
    expect(plan.scenePatch).toEqual({ props: 'BULBS' });
    expect(plan.annotation).toMatchObject({
      mode: 'add',
      value: { sceneId: 's1', blockIndex: 1, start: 4, end: 9, text: 'bulbs', category: 'props', elementKey: 'BULBS' },
    });
  });

  it('appends to a multi-value field without duplicating', () => {
    const plan = planTagCommit(project({ scenes: [scene({ props: 'KNIFE, GUN' })] }), target(), 'props');
    expect(plan.scenePatch.props).toBe('KNIFE, GUN, BULBS');
    const again = planTagCommit(project({ scenes: [scene({ props: 'KNIFE, BULBS' })] }), target(), 'props');
    expect(again.scenePatch.props).toBe('KNIFE, BULBS');
  });

  it('replaces the value for a single-value category (Set)', () => {
    const p = project({ scenes: [scene({ set: 'OLD ROOM' })], breakdownElements: { set: [] } });
    const plan = planTagCommit(p, target({ text: 'new room' }), 'set');
    expect(plan.scenePatch.set).toBe('NEW ROOM');
    expect(plan.newElement).toEqual({ id: 'NEW ROOM', name: 'NEW ROOM' });
  });

  it('reuses an existing cast member by name, else allocates the first free id', () => {
    const p = project({ castMembers: [{ id: '2', name: 'AMY' }] });
    const reuse = planTagCommit(p, target({ text: 'amy' }), 'cast');
    expect(reuse.elementKey).toBe('2');
    expect(reuse.newElement).toBeNull();
    expect(reuse.scenePatch.cast).toBe('2');

    const fresh = planTagCommit(p, target({ text: 'bob' }), 'cast');
    expect(fresh.elementKey).toBe('1');
    expect(fresh.newElement).toEqual({ id: '1', name: 'BOB' });
    expect(fresh.scenePatch.cast).toBe('1');
  });

  it('re-tags an existing span: swaps the scene-field attachment, never stacks', () => {
    const p = project({ scenes: [scene({ props: 'GUN', wardrobe: '' })], breakdownElements: { props: [], wardrobe: [] } });
    const plan = planTagCommit(p, target({ text: 'gun' }), 'wardrobe', ann({ category: 'props', elementKey: 'GUN' }));
    expect(plan.elementKey).toBe('GUN');
    expect(plan.scenePatch).toEqual({ wardrobe: 'GUN', props: '' });
    expect(plan.annotation).toEqual({ mode: 'update', id: 'a1', updates: { category: 'wardrobe', elementKey: 'GUN', recognized: false } });
  });

  it('resolves the element name when moving a cast tag to a name-keyed category', () => {
    const p = project({ castMembers: [{ id: '2', name: 'AMY' }], scenes: [scene({ cast: '2', props: '' })] });
    const plan = planTagCommit(p, target({ text: 'amy' }), 'props', ann({ category: 'cast', elementKey: '2', text: 'amy' }));
    expect(plan.elementKey).toBe('AMY');
    expect(plan.scenePatch).toEqual({ props: 'AMY', cast: '' });
  });
});

describe('commitTag', () => {
  it('applies element, scene field and annotation in ONE batch', () => {
    const { actions, dispatch } = collect();
    commitTag(dispatch, project(), target(), 'props');
    expect(actions.map(a => a.type)).toEqual([
      'BATCH_START', 'ADD_ELEMENT', 'UPDATE_SCENE', 'ADD_SCRIPT_ANNOTATION', 'BATCH_COMMIT',
    ]);
    expect(actions[1].payload).toEqual({ category: 'props', element: { id: 'BULBS', name: 'BULBS' } });
    expect(actions[2].payload).toMatchObject({ id: 's1', props: 'BULBS' });
    expect(actions[3].payload.annotation).toMatchObject({ category: 'props', elementKey: 'BULBS', text: 'bulbs' });
  });

  it('updates the annotation instead of adding when re-tagging', () => {
    const { actions, dispatch } = collect();
    const p = project({ scenes: [scene({ props: 'GUN', wardrobe: '' })], breakdownElements: { wardrobe: [] } });
    commitTag(dispatch, p, target({ text: 'gun' }), 'wardrobe', ann({}));
    expect(actions.map(a => a.type)).toEqual([
      'BATCH_START', 'ADD_ELEMENT', 'UPDATE_SCENE', 'UPDATE_SCRIPT_ANNOTATION', 'BATCH_COMMIT',
    ]);
    expect(actions[3].payload).toMatchObject({ id: 'a1', updates: { category: 'wardrobe' } });
  });

  it('returns null for an empty selection', () => {
    const { dispatch } = collect();
    expect(commitTag(dispatch, project(), target({ text: '   ' }), 'props')).toBeNull();
  });
});

describe('suggestionRanges', () => {
  const doc = (blocks: any[]) => ({ format: 'fdx' as const, scenes: [{ sceneNumber: '1', blocks }] });

  it('suggests a cast cue from a character block matching a member name', () => {
    const p = project({ castMembers: [{ id: '2', name: 'AMY' }], scriptDocument: doc([['heading', 'INT. X - DAY'], ['character', 'AMY'], ['dialogue', 'Hi.']]) });
    const sug = suggestionRanges(p, p.scenes[0]);
    expect(sug).toHaveLength(1);
    expect(sug[0]).toMatchObject({ blockIndex: 1, start: 0, end: 3, text: 'AMY', category: 'cast', elementKey: '2', recognized: true });
    expect(sug[0].sceneId).toBe('s1');
  });

  it('suggests existing element names found in action/dialogue as whole words', () => {
    const p = project({
      breakdownElements: { props: [{ id: 'GUN', name: 'GUN' }] },
      scriptDocument: doc([['heading', 'INT. X - DAY'], ['action', 'The GUN is on the table.'], ['dialogue', 'A bigger GUN!']]),
    });
    const sug = suggestionRanges(p, p.scenes[0]);
    expect(sug.map(s => s.blockIndex)).toEqual([1, 2]);
    expect(sug[0]).toMatchObject({ text: 'GUN', category: 'props', elementKey: 'GUN' });
  });

  it('strips cue parentheticals so the suggestion covers the name only', () => {
    const p = project({ castMembers: [{ id: '2', name: 'AMY' }], scriptDocument: doc([['heading', 'INT. X - DAY'], ['character', 'AMY (O.S.)'], ['dialogue', 'Hi.']]) });
    const sug = suggestionRanges(p, p.scenes[0]);
    expect(sug).toHaveLength(1);
    expect(sug[0]).toMatchObject({ start: 0, end: 3, text: 'AMY', category: 'cast', elementKey: '2' });
  });

  it('does not suggest a cue whose name is not in the cast database', () => {
    const p = project({ scriptDocument: doc([['heading', 'INT. X - DAY'], ['character', 'GEORGE'], ['dialogue', 'Hi.']]) });
    expect(suggestionRanges(p, p.scenes[0])).toHaveLength(0);
  });

  it('never suggests sets, nor numeric-only names', () => {
    const p = project({
      castMembers: [{ id: '1', name: '1' }],
      breakdownElements: { set: [{ id: 'KITCHEN', name: 'KITCHEN' }], props: [{ id: '1', name: '1' }] },
      scriptDocument: doc([['heading', 'INT. X - DAY'], ['action', 'The KITCHEN is dark and 1 is here.']]),
    });
    expect(suggestionRanges(p, p.scenes[0])).toHaveLength(0);
  });

  it('skips ranges already covered by a stored annotation', () => {
    const gunAnn = ann({ id: 'real', sceneId: 's1', blockIndex: 1, start: 4, end: 7, text: 'GUN', category: 'props', elementKey: 'GUN' });
    const p = project({
      breakdownElements: { props: [{ id: 'GUN', name: 'GUN' }] },
      scriptAnnotations: [gunAnn],
      scriptDocument: doc([['heading', 'INT. X - DAY'], ['action', 'The GUN is on the table.']]),
    });
    expect(suggestionRanges(p, p.scenes[0])).toHaveLength(0);
  });
});

describe('annotationElementName', () => {
  it('resolves cast ids to names and passes names through', () => {
    const p = project({ castMembers: [{ id: '2', name: 'AMY' }] });
    expect(annotationElementName(p, ann({ category: 'cast', elementKey: '2' }))).toBe('AMY');
    expect(annotationElementName(p, ann({ category: 'props', elementKey: 'GUN' }))).toBe('GUN');
  });
});
