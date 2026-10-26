import { describe, it, expect } from 'vitest';
import { buildDropdownItems } from '../dropdownItems';
import type { EntityItem } from '../../components/EntityDropdown';

const items: EntityItem[] = [
  { id: 'unit', name: 'Bedford Falls Depot', group: 'Unit Base' },
  { id: 'set1', name: 'Bailey Park', group: 'Set' },
  { id: 'set2', name: 'Main Street', group: 'Set' },
  { id: 'office', name: 'Production Office', group: 'Office' },
  // Action rows / ungrouped items must never crash the group search.
  { id: 'add', name: 'Add new location…' },
];

/** Single-mode build with an arbitrary typed query. */
function search(q: string) {
  return buildDropdownItems(
    items, [], m => m.id, '', q, q, 'single',
    { mode: 'single', displayMode: 'id', keepAlphabetical: false, searchFields: ['name', 'group'] },
  );
}

describe('buildDropdownItems — group search', () => {
  it('matches the group header, not just the name', () => {
    const out = search('set').dropdownItems.map(i => i.id);
    expect(out).toContain('set1');
    expect(out).toContain('set2');
    expect(out).not.toContain('unit');
    expect(out).not.toContain('office');
  });

  it('still matches names, and group words work for other types', () => {
    expect(search('depot').dropdownItems.map(i => i.id)).toContain('unit');
    expect(search('unit base').dropdownItems.map(i => i.id)).toContain('unit');
  });

  it('tolerates items without a group', () => {
    expect(() => search('set')).not.toThrow();
    expect(search('set').dropdownItems.some(i => i.id === 'add')).toBe(false);
  });
});
