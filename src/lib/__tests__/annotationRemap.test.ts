import { describe, it, expect } from 'vitest';
import { remapAnnotations } from '../import/annotationRemap';
import type { ScriptAnnotation, ScriptBlock, ScriptDocument } from '../../types';

const doc = (scenes: Record<string, ScriptBlock[]>): ScriptDocument => ({
  format: 'fdx',
  scenes: Object.entries(scenes).map(([sceneNumber, blocks]) => ({ sceneNumber, blocks })),
});

function ann(over: Partial<ScriptAnnotation>): ScriptAnnotation {
  return { id: 'a', sceneId: 's1', blockIndex: 1, start: 13, end: 16, text: 'gun', category: 'props', elementKey: 'GUN', ...over };
}

const mapStable = new Map([['s1', { oldNumber: '1', newNumber: '1' }]]);

describe('remapAnnotations', () => {
  it('keeps the span when the block is unchanged', () => {
    const blocks: ScriptBlock[] = [['heading', 'INT. X - DAY'], ['action', 'He holds the gun.']];
    const res = remapAnnotations([ann({})], doc({ '1': blocks }), doc({ '1': blocks }), mapStable);
    expect(res).toEqual({ annotations: [ann({})], orphaned: 0 });
  });

  it('shifts the block index when a block is inserted before it', () => {
    const oldDoc = doc({ '1': [['heading', 'INT. X - DAY'], ['action', 'Line B.']] });
    const newDoc = doc({ '1': [['heading', 'INT. X - DAY'], ['action', 'Line NEW.'], ['action', 'Line B.']] });
    const res = remapAnnotations([ann({ blockIndex: 1, start: 0, end: 7, text: 'Line B.' })], oldDoc, newDoc, mapStable);
    expect(res.orphaned).toBe(0);
    expect(res.annotations[0]).toMatchObject({ blockIndex: 2, start: 0, end: 7 });
  });

  it('re-anchors by wording inside a changed block', () => {
    const oldDoc = doc({ '1': [['heading', 'INT. X - DAY'], ['action', 'He holds the gun.']] });
    const newDoc = doc({ '1': [['heading', 'INT. X - DAY'], ['action', 'He raises the gun and fires.']] });
    const res = remapAnnotations([ann({})], oldDoc, newDoc, mapStable);
    expect(res.orphaned).toBe(0);
    expect(res.annotations[0]).toMatchObject({ blockIndex: 1, start: 14, end: 17 });
  });

  it('reports a tag orphaned when the wording disappeared', () => {
    const oldDoc = doc({ '1': [['heading', 'INT. X - DAY'], ['action', 'He holds the gun.']] });
    const newDoc = doc({ '1': [['heading', 'INT. X - DAY'], ['action', 'Nothing here.']] });
    const res = remapAnnotations([ann({})], oldDoc, newDoc, mapStable);
    expect(res).toEqual({ annotations: [], orphaned: 1 });
  });

  it('orphans tags on scenes that are not in the remap map', () => {
    const res = remapAnnotations([ann({})], doc({ '1': [['action', 'gun']] }), doc({ '1': [['action', 'gun']] }), new Map());
    expect(res).toEqual({ annotations: [], orphaned: 1 });
  });
});
