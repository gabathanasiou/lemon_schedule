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
    const items = crewTargetItems(fixture()).filter(i => !i.tag);
    expect(items.find(i => i.id === 'p1')).toMatchObject({ name: 'MAT', group: 'Camera', hint: 'DoP' });
    expect(items.find(i => i.id === 'p3')).toMatchObject({ group: 'Transport', hint: 'Driver' });
  });

  it('offers one accent "All <department>" tag per department, above its people', () => {
    const items = crewTargetItems(fixture());
    const tags = items.filter(i => i.tag);
    expect(tags.map(i => i.name)).toEqual(['All Camera', 'All Transport']);
    expect(tags.every(i => i.id.startsWith('dept:'))).toBe(true);
    expect(items.findIndex(i => i.id === crewDeptTargetId('Camera')))
      .toBeLessThan(items.findIndex(i => i.id === 'p1'));
  });

  it('offers the department tag even when the department has no people yet', () => {
    const project = fixture();
    project.crewRoles.push({ key: 'emptyrole', label: 'Runner', department: 'Production' });
    const tag = crewTargetItems(project).find(i => i.id === crewDeptTargetId('Production'));
    expect(tag).toMatchObject({ name: 'All Production', tag: true });
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
