import { describe, it, expect } from 'vitest';
import { clampSplitIndex, buildCutScene, cutSceneAt, commitSceneCut, mergeSceneWithNext } from '../scriptSceneOps';

function proj(): any {
  return {
    scenes: [
      { id: 's1', sceneNumber: '1', intExt: 'INT', set: 'kitchen', dayNight: 'DAY', cast: '1', props: 'gun', pageCount: '2', pageCountDecimal: 2 },
      { id: 's2', sceneNumber: '1A', intExt: 'EXT', set: 'street', dayNight: 'NIGHT' },
    ],
    scriptDocument: {
      format: 'fdx',
      scenes: [
        { sceneNumber: '1', blocks: [['heading', 'INT. KITCHEN - DAY'], ['action', 'A'], ['action', 'B']] },
        { sceneNumber: '1A', blocks: [['heading', 'EXT. STREET - NIGHT'], ['action', 'C']] },
      ],
    },
    scriptAnnotations: [
      { id: 'a1', sceneId: 's1', blockIndex: 2, text: 'B' },
      { id: 'a2', sceneId: 's2', blockIndex: 1, text: 'C' },
    ],
  };
}

describe('clampSplitIndex', () => {
  it('clamps to a valid paragraph gap', () => {
    expect(clampSplitIndex(4, 0)).toBe(1);
    expect(clampSplitIndex(4, 9)).toBe(3);
    expect(clampSplitIndex(2, 1)).toBe(1);
  });
});

describe('buildCutScene', () => {
  it('letters the number, inherits fields, resets the page count and anchors the cut', () => {
    const p = proj();
    const cut = buildCutScene(p.scenes, p.scenes[0], p.scriptDocument.scenes[0], 2);
    expect(cut.id).not.toBe('s1');
    expect(cut.sceneNumber).toBe('1B');
    expect(cut.duplicateOf).toBe('s1');
    expect(cut.duplicateKind).toBe('split');
    expect(cut.pageCount).toBe('0');
    expect(cut.pageCountDecimal).toBe(0);
    expect(cut.set).toBe('KITCHEN');
    expect(cut.cast).toBe('1');
    expect(cut.props).toBe('gun');
    expect(cut.cutAnchor).toBe('B'); // first non-page-break block after the gap
  });
});

describe('cutSceneAt', () => {
  it('splits the body into a new lettered scene and moves the trailing tags in one batch', () => {
    const p = proj();
    const actions: any[] = [];
    expect(cutSceneAt((a) => actions.push(a), p, 's1', 2)).toBe(true);

    expect(actions[0].type).toBe('BATCH_START');
    expect(actions[actions.length - 1].type).toBe('BATCH_COMMIT');

    const docAction = actions.find(a => a.type === 'UPDATE_SCRIPT_DOCUMENT');
    const scenes = docAction.payload.document.scenes;
    expect(scenes).toHaveLength(3);
    expect(scenes[0].sceneNumber).toBe('1');
    expect(scenes[0].blocks).toEqual([['heading', 'INT. KITCHEN - DAY'], ['action', 'A']]);
    expect(scenes[1].sceneNumber).toBe('1B');
    expect(scenes[1].blocks[0][0]).toBe('heading');
    expect(scenes[1].blocks[0][1]).toContain('KITCHEN');
    expect(scenes[1].blocks.slice(1)).toEqual([['action', 'B']]);

    const add = actions.find(a => a.type === 'ADD_SCENE');
    expect(add.payload.sceneNumber).toBe('1B');
    expect(add.payload.duplicateKind).toBe('split');

    // tag on s1 after the cut moves to the new scene (block 2 → 1, +1 heading offset)
    const tag = actions.find(a => a.type === 'UPDATE_SCRIPT_ANNOTATION');
    expect(tag.payload).toEqual({ id: 'a1', updates: { sceneId: add.payload.id, blockIndex: 1 } });
  });

  it('refuses without a live scene, a body, or enough blocks', () => {
    const p = proj();
    const noop = () => {};
    expect(cutSceneAt(noop, p, 'nope', 1)).toBe(false);
    const noDoc = { ...p, scriptDocument: undefined };
    expect(cutSceneAt(noop, noDoc, 's1', 1)).toBe(false);
    const shortDoc = { ...p, scriptDocument: { format: 'fdx', scenes: [{ sceneNumber: '1', blocks: [['heading', 'X']] }] } };
    expect(cutSceneAt(noop, shortDoc, 's1', 1)).toBe(false);
  });
});

describe('commitSceneCut', () => {
  it('rejects an out-of-range split index', () => {
    const p = proj();
    const actions: any[] = [];
    const cut = buildCutScene(p.scenes, p.scenes[0], p.scriptDocument.scenes[0], 1);
    expect(commitSceneCut({
      dispatch: (a) => actions.push(a), project: p,
      parentId: 's1', parentNumber: '1', newScene: cut, splitIndex: 3, headingText: 'X', moveTags: false,
    })).toBe(false);
    expect(actions).toEqual([]);
  });
});

describe('mergeSceneWithNext', () => {
  it('concatenates the next body (dropping its heading), deletes it, and moves its tags', () => {
    const p = proj();
    const actions: any[] = [];
    expect(mergeSceneWithNext((a) => actions.push(a), p, 's1')).toBe(true);

    const docAction = actions.find(a => a.type === 'UPDATE_SCRIPT_DOCUMENT');
    const scenes = docAction.payload.document.scenes;
    expect(scenes).toHaveLength(1);
    expect(scenes[0].blocks).toEqual([
      ['heading', 'INT. KITCHEN - DAY'], ['action', 'A'], ['action', 'B'], ['action', 'C'],
    ]);

    expect(actions.find(a => a.type === 'DELETE_SCENE').payload).toBe('s2');

    // a2 lived on s2 block 1 → s1 at head.length + 0 = 3
    const tag = actions.find(a => a.type === 'UPDATE_SCRIPT_ANNOTATION');
    expect(tag.payload).toEqual({ id: 'a2', updates: { sceneId: 's1', blockIndex: 3 } });
  });

  it('refuses when there is no next body scene', () => {
    const p = proj();
    p.scriptDocument.scenes = [p.scriptDocument.scenes[0]];
    expect(mergeSceneWithNext(() => {}, p, 's1')).toBe(false);
    expect(mergeSceneWithNext(() => {}, p, 'nope')).toBe(false);
  });
});
