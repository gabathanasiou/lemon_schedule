import { describe, it, expect } from 'vitest';
import { makeBlankProject, reducer } from '../../store/reducer';
import type { State } from '../../store/reducer';
import { createBlankScene } from '../sceneFactory';
import type { ScriptDocument } from '../../types';

// Store-level coverage of the script-import seam (SET_SCRIPT_DOCUMENT) — the
// baseline rotation moved down from the retired script-retention e2e case:
// the NEW body becomes current, the PREVIOUS body becomes the baseline (the
// item-38 conflict reference), the field snapshot is taken and stale
// annotations are dropped. The import pipeline (menu → parse → commitImport)
// stays e2e in the FDX import case.

function init(): State {
  const blank = makeBlankProject('Script doc test');
  const loaded = reducer({ past: [], present: blank, future: [], _batchDepth: 0 }, { type: 'LOAD', payload: blank });
  return reducer(loaded, {
    type: 'ADD_SCENE',
    payload: createBlankScene({ id: 'scene-1', sceneNumber: '1', set: 'KITCHEN', description: 'Old kitchen' }),
  });
}

const doc = (action: string): ScriptDocument => ({
  format: 'fdx',
  scenes: [{ sceneNumber: '1', blocks: [['heading', 'INT. KITCHEN - DAY'], ['action', action]] }],
});

const setDocument = (state: State, document: ScriptDocument, baseline?: ScriptDocument): State =>
  reducer(state, { type: 'SET_SCRIPT_DOCUMENT', payload: { document, ...(baseline ? { baseline } : {}) } });

describe('SET_SCRIPT_DOCUMENT', () => {
  it('a first import makes the body itself the baseline and snapshots the fields', () => {
    const state = setDocument(init(), doc('First.'));
    expect(state.present.scriptDocument).toEqual(doc('First.'));
    expect(state.present.scriptBaseline).toEqual(doc('First.'));
    const snap = state.present.scriptBaselineFields?.find(f => f.sceneNumber === '1');
    expect(snap?.fields.description).toBe('Old kitchen');
    expect(snap?.fields.set).toBe('KITCHEN');
  });

  it('a second import rotates the previous body into the baseline', () => {
    const first = setDocument(init(), doc('First.'));
    const second = setDocument(first, doc('Second.'));
    expect(second.present.scriptDocument).toEqual(doc('Second.'));
    expect(second.present.scriptBaseline).toEqual(doc('First.'));
  });

  it('an explicit baseline overrides the rotation', () => {
    const first = setDocument(init(), doc('First.'));
    const second = setDocument(first, doc('Second.'), doc('Known reference.'));
    expect(second.present.scriptBaseline).toEqual(doc('Known reference.'));
  });

  it('drops annotations anchored to the previous body', () => {
    const first = setDocument(init(), doc('First.'));
    const annotated = reducer(first, {
      type: 'ADD_SCRIPT_ANNOTATION',
      payload: { annotation: { id: 'ann-1', sceneId: 'scene-1', blockIndex: 1, start: 0, end: 5, text: 'First', category: 'props', elementKey: 'COFFEE' } },
    } as any);
    expect(annotated.present.scriptAnnotations).toHaveLength(1);
    const second = setDocument(annotated, doc('Second.'));
    expect(second.present.scriptAnnotations).toEqual([]);
  });
});
