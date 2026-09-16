import { describe, it, expect } from 'vitest';
import {
  ELEMENT_CATEGORIES,
  isMultiValue,
  getFieldItems,
  getLabel,
  getCustomIcon,
  DEFAULT_CATEGORY_LABELS,
} from '../categories';

describe('ELEMENT_CATEGORIES', () => {
  it('has unique keys; set is the only single-value built-in', () => {
    const keys = ELEMENT_CATEGORIES.map(c => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(ELEMENT_CATEGORIES.find(c => c.key === 'cast')!.multiValue).toBe(true);
    expect(ELEMENT_CATEGORIES.find(c => c.key === 'set')!.multiValue).toBe(false);
    expect(ELEMENT_CATEGORIES.filter(c => !c.multiValue).map(c => c.key)).toEqual(['set']);
  });
});

describe('isMultiValue', () => {
  it('follows the built-in flag', () => {
    expect(isMultiValue('cast')).toBe(true);
    expect(isMultiValue('set')).toBe(false);
  });

  it('honors a custom category, defaulting to multi-value', () => {
    expect(isMultiValue('zzz', [{ key: 'zzz', label: 'Z', multiValue: false } as any])).toBe(false);
    expect(isMultiValue('zzz', [{ key: 'zzz', label: 'Z' } as any])).toBe(true);
  });

  it('defaults unknown categories to multi-value', () => {
    expect(isMultiValue('does-not-exist')).toBe(true);
  });
});

describe('getFieldItems', () => {
  it('splits, trims and drops empties for multi-value fields', () => {
    expect(getFieldItems('props', ' gun , rope ,, ')).toEqual(['gun', 'rope']);
  });

  it('keeps the whole trimmed value for single-value fields', () => {
    expect(getFieldItems('set', ' Stage 7 ')).toEqual(['Stage 7']);
  });

  it('is empty for blank input', () => {
    expect(getFieldItems('props', '')).toEqual([]);
    expect(getFieldItems('props', '   ')).toEqual([]);
  });
});

describe('getLabel', () => {
  it('prefers a project override, then the default, then the fallback', () => {
    expect(getLabel('props', 'Props!', { props: 'Guns & Props' })).toBe('Guns & Props');
    expect(getLabel('props', 'Props!')).toBe(DEFAULT_CATEGORY_LABELS.props);
    expect(getLabel('zzz', 'ZZZ')).toBe('ZZZ');
  });
});

describe('getCustomIcon', () => {
  it('falls back to the default icon for an unknown name', () => {
    expect(getCustomIcon('definitely-not-an-icon')).toBeTruthy();
  });
});
