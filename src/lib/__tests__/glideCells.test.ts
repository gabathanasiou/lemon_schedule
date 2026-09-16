import { describe, it, expect } from 'vitest';
import { isSeededNoop, seededTextCell } from '../glideCells';

/**
 * Roadmap 141 — resolved-value cells seed the editor with the displayed value
 * (fully selected) and must not pin an override when committed unchanged.
 */
describe('glideCells — seeded resolved cells', () => {
  it('ignores a commit that only restates the seed (override, default expr, or resolved time)', () => {
    expect(isSeededNoop('', '07:30', '07:30')).toBe(true);
    expect(isSeededNoop('', '07:30', ' 07:30 ')).toBe(true);
    expect(isSeededNoop('', '07:30', '')).toBe(true);
    expect(isSeededNoop('', '', '')).toBe(true);
    expect(isSeededNoop('', '-1h', '-1h')).toBe(true);
    expect(isSeededNoop('', '-1h', '')).toBe(true);
    expect(isSeededNoop('-30m', '', '-30m')).toBe(true);
  });

  it('keeps real edits and clearing a stored override', () => {
    expect(isSeededNoop('', '07:30', '07:00')).toBe(false);
    expect(isSeededNoop('', '', '07:00')).toBe(false);
    expect(isSeededNoop('', '-1h', '-30m')).toBe(false);
    expect(isSeededNoop('-30m', '', '')).toBe(false);
    expect(isSeededNoop('-30m', '', '-45m')).toBe(false);
  });

  it('puts the edit seed in data and selects it, while displayData stays resolved', () => {
    const cell = seededTextCell('07:30', { displayData: '07:30' }) as any;
    expect(cell.data).toBe('07:30');
    expect(cell.displayData).toBe('07:30');
    expect(cell.selectionRange).toEqual([0, 5]);
  });

  it('leaves an empty cell unselected', () => {
    const cell = seededTextCell('') as any;
    expect(cell.data).toBe('');
    expect(cell.selectionRange).toBeUndefined();
  });
});
