import { describe, it, expect } from 'vitest';
import { reducer } from '../../store/reducer';
import type { Action, State } from '../../store/reducer';

// Reducer-level coverage of the Element Manager's buffered save (MERGE_ELEMENTS).
// The UI diff builder (`computeCategoryDiff`) turns buffered row edits into
// `{ renames, removes, adds }`; these tests pin the semantics so the e2e spec
// only needs to prove the UI save path. Fixture mirrors the controlled dataset
// in e2e/element-manager-merge.spec.ts.

const VEHICLES = ['FISHING BOAT', 'fishing boat', 'boat', 'ship', 'car', 'CAR'];

function makeProject(): any {
  const scenes = Array.from({ length: 16 }, (_, i) => {
    let vehicles = '';
    if (i < 3) vehicles = 'fishing boat';
    else if (i < 8) vehicles = 'boat';
    else if (i === 8) vehicles = 'ship';
    else if (i === 9) vehicles = 'car';
    else if (i === 10) vehicles = 'CAR';
    return { id: `s${i}`, sceneNumber: String(i + 1), cast: '', vehicles, props: i < 15 ? 'gun' : '' };
  });
  return {
    scenes,
    breakdownElements: {
      vehicles: VEHICLES.map(v => ({ id: v, name: v })),
      props: [{ id: 'gun', name: 'gun' }],
    },
    elementsTrash: [],
  };
}

function init(): State {
  return { past: [], present: makeProject(), future: [], _batchDepth: 0 };
}

const merge = (state: State, payload: any): State =>
  reducer(state, { type: 'MERGE_ELEMENTS', payload } as Action);

const vehicleNames = (p: any): string[] => (p.breakdownElements?.vehicles || []).map((e: any) => e.name);

function sceneCounts(p: any, field = 'vehicles'): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of p.scenes) {
    for (const item of String(s[field] || '').split(',').map((x: string) => x.trim().toLowerCase()).filter(Boolean)) {
      counts[item] = (counts[item] || 0) + 1;
    }
  }
  return counts;
}

describe('MERGE_ELEMENTS', () => {
  it('renames into an existing element name and collapses to one entry', () => {
    const s = merge(init(), { category: 'vehicles', renames: [{ oldName: 'FISHING BOAT', newName: 'fishing boat' }], removes: [], adds: [] });
    const names = vehicleNames(s.present).map(n => n.toLowerCase());
    expect(names.filter(n => n === 'fishing boat')).toHaveLength(1);
    expect(sceneCounts(s.present)['fishing boat']).toBe(3);
  });

  it('renames into a scene-only name and rewrites the scenes', () => {
    const s = merge(init(), { category: 'vehicles', renames: [{ oldName: 'fishing boat', newName: 'boat' }], removes: [], adds: [] });
    const counts = sceneCounts(s.present);
    expect(counts['boat']).toBe(8); // 5 original + 3 renamed
    expect(counts['fishing boat']).toBeUndefined();
  });

  it('merges both case-duplicates into the same new name', () => {
    const s = merge(init(), {
      category: 'vehicles',
      renames: [{ oldName: 'fishing boat', newName: 'ski boat' }, { oldName: 'FISHING BOAT', newName: 'ski boat' }],
      removes: [],
      adds: [],
    });
    expect(vehicleNames(s.present).filter(n => n === 'ski boat')).toHaveLength(1);
    expect(vehicleNames(s.present).some(n => n.toLowerCase() === 'fishing boat')).toBe(false);
    expect(sceneCounts(s.present)['ski boat']).toBe(3);
  });

  it('a plain unique rename keeps the scene values', () => {
    const s = merge(init(), { category: 'props', renames: [{ oldName: 'gun', newName: 'cannon' }], removes: [], adds: [] });
    expect((s.present.breakdownElements.props || []).map((e: any) => e.name)).toContain('cannon');
    const counts = sceneCounts(s.present, 'props');
    expect(counts['cannon']).toBe(15);
    expect(counts['gun']).toBeUndefined();
  });

  it('removing a case-duplicate leaves the surviving scenes untouched and does not trash it', () => {
    const s = merge(init(), {
      category: 'vehicles',
      renames: [],
      removes: [{ id: 'FISHING BOAT', name: 'FISHING BOAT', toTrash: false }],
      adds: [],
    });
    expect(vehicleNames(s.present)).not.toContain('FISHING BOAT');
    expect(vehicleNames(s.present)).toContain('fishing boat');
    expect(sceneCounts(s.present)['fishing boat']).toBe(3);
    expect((s.present.elementsTrash || []).filter((t: any) => t.category === 'vehicles')).toHaveLength(0);
  });

  it('removing a unique element drops it from scenes and pushes it to trash', () => {
    const s = merge(init(), {
      category: 'vehicles',
      renames: [],
      removes: [{ id: 'ship', name: 'ship', toTrash: true }],
      adds: [],
    });
    expect(vehicleNames(s.present)).not.toContain('ship');
    expect(sceneCounts(s.present)['ship']).toBeUndefined();
    expect((s.present.elementsTrash || []).filter((t: any) => t.category === 'vehicles' && t.element.id === 'ship')).toHaveLength(1);
  });

  it('swapping two names keeps the scene values distinct (atomic rename)', () => {
    const s = merge(init(), {
      category: 'vehicles',
      renames: [{ oldName: 'boat', newName: 'fishing boat' }, { oldName: 'fishing boat', newName: 'boat' }],
      removes: [],
      adds: [],
    });
    const counts = sceneCounts(s.present);
    expect(counts['boat']).toBe(3); // former fishing-boat scenes
    expect(counts['fishing boat']).toBe(5); // former boat scenes
  });

  it('absorbs case-duplicates even with no explicit edits (first spelling wins)', () => {
    const s = merge(init(), { category: 'vehicles', renames: [], removes: [], adds: [] });
    const names = vehicleNames(s.present);
    expect(names.filter(n => n.toLowerCase() === 'car')).toEqual(['car']);
    expect(names.filter(n => n.toLowerCase() === 'fishing boat')).toEqual(['FISHING BOAT']);
  });

  it('a batched save is ONE undo entry that restores elements and scenes', () => {
    const s0 = init();
    let s = reducer(s0, { type: 'BATCH_START' } as Action);
    s = merge(s, { category: 'vehicles', renames: [{ oldName: 'fishing boat', newName: 'boat' }], removes: [], adds: [] });
    s = merge(s, { category: 'props', renames: [{ oldName: 'gun', newName: 'cannon' }], removes: [], adds: [] });
    s = reducer(s, { type: 'BATCH_COMMIT' } as Action);
    expect(s.past).toHaveLength(1);

    const undone = reducer(s, { type: 'UNDO' } as Action);
    expect(vehicleNames(undone.present)).toEqual(vehicleNames(s0.present));
    expect(sceneCounts(undone.present)).toEqual(sceneCounts(s0.present));
    expect((undone.present.breakdownElements.props || []).map((e: any) => e.name)).toEqual(['gun']);
  });
});
