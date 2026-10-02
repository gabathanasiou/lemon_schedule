import { describe, it, expect } from 'vitest';
import {
  cellStyleKey,
  clearCellStyleKeys,
  getCellStyle,
  patchCellStyleKeys,
  pruneCellStyles,
  stripCellFormatting,
} from '../reportCellStyles';
import type { ReportCellStyle, ReportCustomRow, ReportTableColumn } from '../../types';

const rows = (...ids: string[]): ReportCustomRow[] => ids.map(id => ({ id, cells: ['', ''] }));
const cols = (...ids: string[]): ReportTableColumn[] => ids.map(id => ({ id, field: '', width: 100 / ids.length }));

describe('cellStyleKey / getCellStyle', () => {
  it('keys `${rowId}:${colId}` and reads the entry', () => {
    const styles: Record<string, ReportCellStyle> = { 'r1:c1': { fontSize: 14 } };
    expect(cellStyleKey('r1', 'c1')).toBe('r1:c1');
    expect(getCellStyle(styles, 'r1', 'c1')).toEqual({ fontSize: 14 });
    expect(getCellStyle(styles, 'r2', 'c1')).toBeUndefined();
    expect(getCellStyle(undefined, 'r1', 'c1')).toBeUndefined();
  });
});

describe('pruneCellStyles', () => {
  const r = rows('r1', 'r2');
  const c = cols('c1', 'c2');

  it('drops stale row/column ids and unknown keys', () => {
    const styles: Record<string, ReportCellStyle> = {
      'r1:c1': { fontSize: 12 },
      'nope:c1': { fontSize: 12 },
      'r1:nope': { fontSize: 12 },
      garbage: { fontSize: 12 },
      'r2:c2': {},
    };
    expect(pruneCellStyles(styles, r, c, 'header')).toEqual({ 'r1:c1': { fontSize: 12 } });
  });

  it('keeps the header row', () => {
    const styles: Record<string, ReportCellStyle> = { 'header:c2': { align: 'center' } };
    expect(pruneCellStyles(styles, r, c, 'header')).toEqual({ 'header:c2': { align: 'center' } });
    expect(pruneCellStyles(styles, r, c, 'H')).toEqual({});
  });
});

describe('patchCellStyleKeys', () => {
  it('merges fields and removes fields set to undefined', () => {
    const styles: Record<string, ReportCellStyle> = { 'r1:c1': { fontSize: 14, align: 'right' } };
    const out = patchCellStyleKeys(styles, ['r1:c1', 'r1:c2'], { fontSize: undefined, align: 'center' });
    expect(out).toEqual({ 'r1:c1': { align: 'center' }, 'r1:c2': { align: 'center' } });
  });

  it('drops an override that becomes empty', () => {
    const out = patchCellStyleKeys({ 'r1:c1': { fontSize: 14 } }, ['r1:c1'], { fontSize: undefined });
    expect(out).toEqual({});
  });

  it('does not mutate the input map', () => {
    const styles: Record<string, ReportCellStyle> = { 'r1:c1': { fontSize: 14 } };
    patchCellStyleKeys(styles, ['r1:c1'], { fontFamily: 'Georgia' });
    expect(styles).toEqual({ 'r1:c1': { fontSize: 14 } });
  });
});

describe('clearCellStyleKeys', () => {
  it('removes the listed keys only', () => {
    const styles: Record<string, ReportCellStyle> = { 'r1:c1': { fontSize: 14 }, 'r2:c1': { fontSize: 9 } };
    expect(clearCellStyleKeys(styles, ['r1:c1'])).toEqual({ 'r2:c1': { fontSize: 9 } });
  });
});

describe('stripCellFormatting (no DOM)', () => {
  it('returns the input unchanged when DOMParser is unavailable', () => {
    expect(typeof DOMParser).toBe('undefined');
    expect(stripCellFormatting('<p><strong>Hi</strong></p>')).toBe('<p><strong>Hi</strong></p>');
  });
});
