import { describe, it, expect } from 'vitest';
import {
  crewDeptOfTargetId,
  crewDeptTargetId,
  crewIdsForDepartment,
  crewPickerIds,
  crewTargetItems,
  locationTargetItems,
} from '../linkTargets';

function fixture(): any {
  return {
    crewRoles: [
      { key: 'mycam1', label: 'DoP', department: 'Camera' },
      { key: 'mycam2', label: 'AC', department: 'Camera' },
      { key: 'mydriver', label: 'Driver', department: 'Transport' },
    ],
    crew: {
      mycam1: [{ id: 'p1', name: 'MAT' }],
      mycam2: [{ id: 'p2', name: 'DANA' }],
      mydriver: [{ id: 'p3', name: 'SAM' }],
    },
    locationTypes: [{ key: 'stage', label: 'Stage' }],
    locations: [
      { id: 'l1', name: 'Grand Hotel', type: 'stage' },
      { id: 'l2', address: '1 Main St', type: 'stage' },
    ],
  };
}

describe('crewTargetItems', () => {
  it('groups people by department with the role as the hint', () => {
    const items = crewTargetItems(fixture());
    expect(items.find(i => i.id === 'p1')).toMatchObject({ name: 'MAT', group: 'Camera', hint: 'DoP' });
    expect(items.find(i => i.id === 'p3')).toMatchObject({ group: 'Transport', hint: 'Driver' });
  });

  it('lists people only — a department is selected by its header tick, not a row', () => {
    const items = crewTargetItems(fixture());
    expect(items.map(i => i.id)).toEqual(['p1', 'p2', 'p3']);
    expect(items.every(i => !i.id.startsWith('dept:'))).toBe(true);
  });

  it('a department with no people adds no rows', () => {
    const project = fixture();
    project.crewRoles.push({ key: 'emptyrole', label: 'Runner', department: 'Production' });
    expect(crewTargetItems(project).map(i => i.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('handles a project with no crew roster', () => {
    expect(crewTargetItems({ crewRoles: [] } as any)).toEqual([]);
  });

  it('resolves the current people of a department (warnings/reports)', () => {
    expect(crewIdsForDepartment(fixture(), 'Camera')).toEqual(['p1', 'p2']);
    expect(crewIdsForDepartment(fixture(), 'Production')).toEqual([]);
  });
});

describe('crewPickerIds', () => {
  it('keeps person ids and department tag tokens together', () => {
    expect(crewPickerIds('p1, dept:Camera, p3')).toEqual(['p1', 'dept:Camera', 'p3']);
  });

  it('round-trips a department token', () => {
    const token = crewDeptTargetId('Camera');
    expect(crewPickerIds(token)).toEqual([token]);
    expect(crewDeptOfTargetId(token)).toBe('Camera');
  });
});

describe('locationTargetItems', () => {
  it('groups real locations by type and resolves a display name', () => {
    const items = locationTargetItems(fixture());
    expect(items.map(i => i.name)).toEqual(['Grand Hotel', '1 Main St']);
    expect(items.every(i => i.group === 'Stage')).toBe(true);
    expect(items[1].hint).toBe('1 Main St');
  });
});
