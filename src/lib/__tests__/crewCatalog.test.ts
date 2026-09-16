import { describe, it, expect } from 'vitest';
import {
  CREW_DEPARTMENTS,
  DEFAULT_CREW_ROLES,
  CREW_BUILTIN_KEYS,
  resolveRoleCategories,
  crewDepartmentOf,
  crewRoleGroup,
  reorderCrewRoles,
} from '../crewCatalog';

describe('catalog shape', () => {
  it('has unique built-in role keys, in department order', () => {
    const keys = DEFAULT_CREW_ROLES.map(r => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(CREW_DEPARTMENTS.flatMap(d => d.roles.map(r => r.key)));
  });
});

describe('resolveRoleCategories', () => {
  it('falls back to the catalog default', () => {
    expect(resolveRoleCategories({ key: 'makeup', label: 'Makeup' } as any)).toEqual(['makeup']);
    expect(resolveRoleCategories({ key: 'director', label: 'Director' } as any)).toEqual([]);
  });

  it('an explicit mapping wins; [] clears it', () => {
    expect(resolveRoleCategories({ key: 'makeup', label: 'Makeup', categories: ['props'] } as any)).toEqual(['props']);
    expect(resolveRoleCategories({ key: 'makeup', label: 'Makeup', categories: [] } as any)).toEqual([]);
  });
});

describe('crewDepartmentOf / crewRoleGroup', () => {
  it('maps built-ins to their catalog department', () => {
    expect(crewDepartmentOf('makeup')).toBe('Makeup & Hair');
    expect(crewDepartmentOf('cameraOperator')).toBe('Camera');
    expect(crewDepartmentOf('zzzCustom')).toBeUndefined();
  });

  it('groups customs by their assigned department, else Other', () => {
    expect(crewRoleGroup({ key: 'zzz', label: 'Z', department: 'Sound' } as any)).toBe('Sound');
    expect(crewRoleGroup({ key: 'zzz', label: 'Z' } as any)).toBe('Other');
  });
});

describe('reorderCrewRoles', () => {
  it('orders built-ins to the catalog regardless of input order', () => {
    const input = [
      { key: 'gaffer', label: 'Gaffer' },
      { key: 'producer', label: 'Producer' },
    ] as any;
    const out = reorderCrewRoles(input);
    expect(out[0].key).toBe('producer'); // Above the Line first
    expect(out.findIndex(r => r.key === 'gaffer')).toBeGreaterThan(out.findIndex(r => r.key === 'producer'));
  });

  it('materializes missing built-ins from the catalog', () => {
    const out = reorderCrewRoles([]);
    expect(out.map(r => r.key)).toEqual(DEFAULT_CREW_ROLES.map(r => r.key));
  });

  it('keeps a stored label over the default and appends customs last', () => {
    const out = reorderCrewRoles([
      { key: 'zzzCustom', label: 'Best Boy' },
      { key: 'director', label: 'Director (Custom)' },
    ] as any);
    expect(out.find(r => r.key === 'director')!.label).toBe('Director (Custom)');
    expect(out[out.length - 1].key).toBe('zzzCustom');
    expect(out.every(r => CREW_BUILTIN_KEYS.has(r.key) || r.key === 'zzzCustom')).toBe(true);
  });
});
