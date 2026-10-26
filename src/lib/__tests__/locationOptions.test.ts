import { describe, expect, it } from 'vitest';
import { ADD_LOCATION_SENTINEL, locationOptions } from '../locationOptions';
import type { Project } from '../../types';

const project = {
  locationTypes: [
    { key: 'set', label: 'Set' },
    { key: 'unitBase', label: 'Unit Base' },
    { key: 'hospital', label: 'Hospital' },
  ],
  locations: [
    { id: 'a', name: 'Stage 7', type: 'set', address: '7 Stage Way' },
    { id: 'b', name: '', type: 'unitBase', address: '40 Depot Rd', place: 'Depot Yard' },
    { id: 'c', name: 'Bedford Hospital', type: 'hospital', address: '1 Care Lane', contactName: 'George Bailey', phone: '555-0101' },
  ],
} as unknown as Project;

describe('locationOptions', () => {
  it('puts the add-new action first, then the DB in location-type registry order', () => {
    const items = locationOptions(project);
    expect(items[0]).toMatchObject({ id: ADD_LOCATION_SENTINEL, accent: true });
    expect(items.slice(1).map(i => i.id)).toEqual(['a', 'b', 'c']);
    expect(items.slice(1).map(i => i.group)).toEqual(['Set', 'Unit Base', 'Hospital']);
  });

  it('resolves a label from name → address → place', () => {
    const items = locationOptions(project);
    expect(items.find(i => i.id === 'a')?.name).toBe('Stage 7');
    expect(items.find(i => i.id === 'b')?.name).toBe('40 Depot Rd');
  });

  it('exposes the deep-search fields the SearchMenu face uses', () => {
    const hospital = locationOptions(project).find(i => i.id === 'c');
    expect(hospital?.fields).toEqual([
      { label: 'Address', value: '1 Care Lane' },
      { label: 'Contact', value: 'George Bailey' },
      { label: 'Phone', value: '555-0101' },
    ]);
  });

  it('folds quick-pick extras in without duplicating the DB row', () => {
    const items = locationOptions(project, [{ id: 'a', name: 'Stage 7', group: 'Scene locations' }]);
    expect(items.filter(i => i.id === 'a')).toHaveLength(1);
    expect(items.find(i => i.id === 'a')?.group).toBe('Scene locations');
  });
});
