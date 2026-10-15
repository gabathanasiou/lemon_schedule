import { describe, it, expect } from 'vitest';
import { makeBlankProject, reducer } from '../../store/reducer';
import type { State } from '../../store/reducer';

function init(): State {
  const blank = makeBlankProject('Load normalization');
  return reducer({ past: [], present: blank, future: [], _batchDepth: 0 }, { type: 'LOAD', payload: blank });
}

describe('LOAD normalization — stale active version id (ScheduleTab crash, 2026-10-15)', () => {
  it('repoints a dangling activeVersionId at the first version', () => {
    const base = init().present;
    const loaded = reducer(init(), { type: 'LOAD', payload: { ...base, activeVersionId: 'gone' } });
    expect(loaded.present.activeVersionId).toBe(loaded.present.versions[0].id);
  });

  it('repoints an empty activeVersionId too', () => {
    const base = init().present;
    const loaded = reducer(init(), { type: 'LOAD', payload: { ...base, activeVersionId: '' } });
    expect(loaded.present.activeVersionId).toBe(loaded.present.versions[0].id);
  });

  it('keeps a valid activeVersionId untouched', () => {
    const base = init().present;
    const loaded = reducer(init(), { type: 'LOAD', payload: { ...base } });
    expect(loaded.present.activeVersionId).toBe(base.activeVersionId);
  });
});
