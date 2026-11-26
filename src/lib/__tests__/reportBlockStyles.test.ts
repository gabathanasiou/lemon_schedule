import { describe, it, expect } from 'vitest';
import {
  BUILTIN_BLOCK_STYLES,
  blockStyleFromBlock,
  blockStyleMatches,
  blockStylePatch,
  blockSurfaceOf,
} from '../reportBlockStyles';
import { REPORT_BORDER_COLOR } from '../reportLook';
import type { ReportBlock } from '../../types';

/**
 * Roadmap 371/372 — block surface math: normalized defaults, preset matching
 * (ignoring border colour/width when the border is off) and the one apply
 * patch. Presets are copied values, never linked ids.
 */

const block = (partial: Partial<ReportBlock>): ReportBlock => ({ id: 'b', type: 'text', ...partial } as ReportBlock);

describe('blockSurfaceOf', () => {
  it('normalizes the legacy defaults', () => {
    expect(blockSurfaceOf(block({}))).toEqual({
      background: '',
      border: false,
      borderColor: REPORT_BORDER_COLOR,
      borderWidth: 1,
      borderRadius: 0,
      paddingV: 2,
      paddingH: 4,
    });
  });
});

describe('blockStyleMatches', () => {
  it('matches a built-in black bar', () => {
    const blackBar = BUILTIN_BLOCK_STYLES.find(s => s.id === 'builtin-black-bar')!;
    expect(blockStyleMatches(block({ background: '#000000', paddingV: 2, paddingH: 6 }), blackBar)).toBe(true);
    expect(blockStyleMatches(block({ background: '#111111', paddingV: 2, paddingH: 6 }), blackBar)).toBe(false);
  });

  it('ignores border colour/width when the border is off', () => {
    const a = block({ background: '#ffffff', border: false, borderColor: '#ff0000', borderWidth: 4 });
    const b = block({ background: '#ffffff', border: false, borderColor: '#00ff00', borderWidth: 1 });
    expect(blockStyleMatches(a, blockStyleFromBlock('Saved', b))).toBe(true);
  });

  it('compares border colour/width and radius/padding when the border is on', () => {
    const a = block({ border: true, borderColor: '#000000', borderWidth: 2, borderRadius: 8, paddingV: 4, paddingH: 4 });
    const style = blockStyleFromBlock('Saved', a);
    expect(blockStyleMatches(a, style)).toBe(true);
    expect(blockStyleMatches({ ...a, borderRadius: 0 }, style)).toBe(false);
    expect(blockStyleMatches({ ...a, borderWidth: 1 }, style)).toBe(false);
  });
});

describe('blockStylePatch', () => {
  it('returns every surface field and clears a missing fill', () => {
    const patch = blockStylePatch({ id: 's', name: 'No fill', background: undefined, border: false, borderRadius: 2, paddingV: 1, paddingH: 3 });
    expect(patch).toMatchObject({ background: undefined, border: false, borderRadius: 2, paddingV: 1, paddingH: 3 });
    expect(patch.background).toBeUndefined();
  });
});

describe('blockStyleFromBlock', () => {
  it('snapshots the current surface under a new id', () => {
    const source = block({ background: '#000000', paddingV: 2, paddingH: 6, border: true, borderColor: '#ff0000', borderWidth: 3, borderRadius: 4 });
    const style = blockStyleFromBlock('  My bar  ', source);
    expect(style.id).not.toBe('');
    expect(style.name).toBe('  My bar  '); // caller trims before saving
    expect(style).toMatchObject({ background: '#000000', border: true, borderColor: '#ff0000', borderWidth: 3, borderRadius: 4, paddingV: 2, paddingH: 6 });
  });
});
