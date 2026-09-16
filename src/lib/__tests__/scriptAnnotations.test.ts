import { describe, it, expect } from 'vitest';
import { segmentsFor, rangesForBlock, cascadeAnnotationRename, annotationElementMatches } from '../scriptAnnotations';
import type { ScriptAnnotation } from '../../types';

function ann(over: Partial<ScriptAnnotation>): ScriptAnnotation {
  return { id: 'a', sceneId: 's1', blockIndex: 0, start: 0, end: 3, text: 'gun', category: 'props', elementKey: 'GUN', ...over };
}

const range = (a: ScriptAnnotation) => ({ start: a.start, end: a.end, annotation: a });

describe('segmentsFor', () => {
  it('splits text into plain and tagged segments', () => {
    const segs = segmentsFor('The gun is here', [range(ann({ start: 4, end: 7 }))]);
    expect(segs.map(s => s.text)).toEqual(['The ', 'gun', ' is here']);
    expect(segs[1].annotation?.elementKey).toBe('GUN');
  });

  it('returns a single plain segment when there are no ranges', () => {
    expect(segmentsFor('hello', [])).toEqual([{ text: 'hello' }]);
  });

  it('clips off-range and overlapping ranges', () => {
    const segs = segmentsFor('abcd', [range(ann({ start: 0, end: 2 })), range(ann({ id: 'b', start: 1, end: 4 }))]);
    expect(segs.map(s => s.text)).toEqual(['ab', 'cd']);
    expect(segs[1].annotation?.id).toBe('b');
  });
});

describe('rangesForBlock', () => {
  it('filters by scene id and block index', () => {
    const list = [ann({ id: 'a', blockIndex: 0 }), ann({ id: 'b', blockIndex: 1 }), ann({ id: 'c', sceneId: 's2' })];
    expect(rangesForBlock(list, 's1', 1).map(r => r.annotation.id)).toEqual(['b']);
    expect(rangesForBlock(list, undefined, 0)).toEqual([]);
  });
});

describe('cascadeAnnotationRename', () => {
  it('updates name-keyed annotations case-insensitively in one pass', () => {
    const list = [ann({ elementKey: 'gun' }), ann({ id: 'b', category: 'wardrobe', elementKey: 'gun' })];
    const out = cascadeAnnotationRename(list, 'props', 'GUN', 'PISTOL')!;
    expect(out[0].elementKey).toBe('PISTOL');
    expect(out[1].elementKey).toBe('gun'); // different category untouched
  });

  it('is a no-op for an empty/undefined list', () => {
    expect(cascadeAnnotationRename(undefined, 'props', 'A', 'B')).toBeUndefined();
  });
});

describe('annotationElementMatches', () => {
  it('matches cast ids exactly and names case-insensitively', () => {
    expect(annotationElementMatches(ann({ category: 'cast', elementKey: '1' }), 'cast', '1')).toBe(true);
    expect(annotationElementMatches(ann({ elementKey: 'GUN' }), 'props', 'gun')).toBe(true);
    expect(annotationElementMatches(ann({ elementKey: 'GUN' }), 'wardrobe', 'GUN')).toBe(false);
  });
});
