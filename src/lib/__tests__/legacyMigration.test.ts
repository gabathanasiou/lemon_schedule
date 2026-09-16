import { describe, it, expect } from 'vitest';
import { migrateLegacyCastMirror, migrateLegacyProject } from '../legacyMigration';

/** Minimal cast-bearing project shape (the functions only touch these fields). */
function castProject(castMembers: any[], mirror: any): any {
  return { castMembers, breakdownElements: mirror === undefined ? {} : { cast: mirror } };
}

describe('migrateLegacyCastMirror', () => {
  it('strips the mirror when castMembers already carries the roster', () => {
    const p = castProject(
      [{ id: '1', name: 'GEORGE' }, { id: '2', name: 'MARY' }],
      [{ id: '1', name: 'GEORGE' }, { id: '2', name: 'MARY' }],
    );
    migrateLegacyCastMirror(p);
    expect(p.breakdownElements.cast).toBeUndefined();
    expect((p.castMembers || []).map((m: any) => m.name)).toEqual(['GEORGE', 'MARY']);
  });

  it('recovers names from the mirror when castMembers is missing', () => {
    const p = castProject(undefined as any, [{ id: '1', name: 'GEORGE' }, { id: '99', name: 'EXTRA MAN' }]);
    migrateLegacyCastMirror(p);
    expect(p.breakdownElements.cast).toBeUndefined();
    const byId = new Map((p.castMembers || []).map((m: any) => [m.id, m.name]));
    expect(byId.get('1')).toBe('GEORGE');
    expect(byId.get('99')).toBe('EXTRA MAN');
  });

  it('prefers castMembers on a name conflict and fills gaps from the mirror', () => {
    const p = castProject(
      [{ id: '1', name: 'GEORGE II' }],
      [{ id: '1', name: 'GEORGE' }, { id: '99', name: 'EXTRA MAN' }],
    );
    migrateLegacyCastMirror(p);
    const byId = new Map((p.castMembers || []).map((m: any) => [m.id, m.name]));
    expect(byId.get('1')).toBe('GEORGE II');
    expect(byId.get('99')).toBe('EXTRA MAN');
  });

  it('is a no-op without a mirror', () => {
    const p = castProject([{ id: '1', name: 'GEORGE' }], undefined);
    migrateLegacyCastMirror(p);
    expect((p.castMembers || []).map((m: any) => m.name)).toEqual(['GEORGE']);
  });
});

describe('migrateLegacyProject', () => {
  function legacyVersion(): any {
    return {
      id: 'v1',
      name: 'v01',
      createdAt: 0,
      updatedAt: 0,
      dayMeta: { '1': { unitCall: '07:30', date: '2026-01-01' }, '2': { unitCall: '09:00', date: '2026-01-02' } },
      rows: [
        { id: 'r1', type: 'SCENE', shootDay: 1, order: 0, sceneId: 's1', containerId: 1 },
        { id: 'r2', type: 'SCENE', shootDay: 1, order: 1, sceneId: 's2', containerId: 1 },
        { id: 'r3', type: 'SCENE', shootDay: 2, order: 0, sceneId: 's3', containerId: 1 },
        { id: 'r4', type: 'SCENE', order: 0, sceneId: 's4', containerId: null },
      ],
    };
  }

  it('converts shootDay groups into pinned + per-day DAYBREAK sections', () => {
    const project: any = { versions: [legacyVersion()], breakdownElements: {} };
    const result = migrateLegacyProject(project);
    expect(result.migrated).toBe(true);
    expect(result.versionCount).toBe(1);
    expect(result.dayCount).toBe(2);

    const rows = project.versions[0].rows as any[];
    // Unscheduled rows come first, in the boneyard
    expect(rows.find((r: any) => r.id === 'r4')).toMatchObject({ containerId: null });
    // A pinned daybreak anchors the board and carries Day 1's call time + date
    const pinned = rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
    expect(pinned).toMatchObject({ containerId: 1, daybreakCallTime: '07:30', daybreakDate: '2026-01-01' });
    // Day 2 opens with its own non-pinned daybreak
    const day2Break = rows.filter((r: any) => r.type === 'DAYBREAK' && !r.pinned)[0];
    expect(day2Break).toMatchObject({ daybreakCallTime: '09:00', daybreakDate: '2026-01-02' });
    // The last daybreak closes the final section
    expect(rows[rows.length - 1]).toMatchObject({ type: 'DAYBREAK', pinned: false, daybreakCallTime: '' });
    // All scheduled scenes now live on the board (containerId 1), in order
    const scheduled = rows.filter((r: any) => r.type === 'SCENE' && r.containerId === 1).map((r: any) => r.id);
    expect(scheduled).toEqual(['r1', 'r2', 'r3']);
    // legacy fields are dropped
    expect(project.versions[0].dayMeta).toBeUndefined();
    expect(rows.every((r: any) => !('shootDay' in r))).toBe(true);
  });

  it('is a no-op for a non-legacy project', () => {
    const project: any = {
      versions: [{ id: 'v1', name: 'v01', createdAt: 0, updatedAt: 0, rows: [{ id: 'r1', type: 'DAYBREAK', pinned: true, containerId: 1, order: 0 }] }],
      breakdownElements: {},
    };
    const result = migrateLegacyProject(project);
    expect(result.migrated).toBe(false);
    expect(result.versionCount).toBe(0);
  });
});
