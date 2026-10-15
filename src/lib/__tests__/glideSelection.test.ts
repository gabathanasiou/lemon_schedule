import { describe, it, expect } from 'vitest';
import type { GridSelection } from '@glideapps/glide-data-grid';
import {
  effectiveGridRange,
  indexOfKey,
  resolveSelectionRange,
  selectionRangeToWire,
  withAlpha,
} from '../glideSelection';

/**
 * Roadmap 234 — the selection geometry shared by every Glide surface: the
 * local `GridSelection` → rectangle conversion, the wire encode/decode and the
 * colour helper. The canvas/DOM halves are rule-7 manual checks; everything
 * pure lands here.
 */

/** Minimal CompactSelection stand-in (sorted iterable) for the node env. */
function compact(indices: number[]) {
  return {
    length: indices.length,
    *[Symbol.iterator]() {
      yield* [...indices].sort((a, b) => a - b);
    },
  };
}

function selection(parts: {
  range?: { x: number; y: number; width: number; height: number };
  rows?: number[];
  columns?: number[];
}): GridSelection {
  const current = parts.range
    ? { cell: [parts.range.x, parts.range.y], range: parts.range, rangeStack: [] }
    : undefined;
  return { rows: compact(parts.rows ?? []), columns: compact(parts.columns ?? []), current } as unknown as GridSelection;
}

describe('effectiveGridRange', () => {
  it('returns the active range as-is', () => {
    expect(effectiveGridRange(selection({ range: { x: 2, y: 1, width: 3, height: 2 } }), 10, 8))
      .toEqual({ x: 2, y: 1, width: 3, height: 2 });
  });

  it('turns a row selection into a full-width bounding rectangle', () => {
    expect(effectiveGridRange(selection({ rows: [2, 3, 5] }), 10, 8))
      .toEqual({ x: 0, y: 2, width: 8, height: 4 });
  });

  it('turns a column selection into a full-height bounding rectangle', () => {
    expect(effectiveGridRange(selection({ columns: [1, 2] }), 10, 8))
      .toEqual({ x: 1, y: 0, width: 2, height: 10 });
  });

  it('is null for an empty selection, a zero-size range, or a missing selection', () => {
    expect(effectiveGridRange(selection({}), 10, 8)).toBeNull();
    expect(effectiveGridRange(selection({ range: { x: 0, y: 0, width: 0, height: 0 } }), 10, 8)).toBeNull();
    expect(effectiveGridRange(null, 10, 8)).toBeNull();
    expect(effectiveGridRange(undefined, 10, 8)).toBeNull();
  });

  it('ignores selected rows/columns outside the data (spare rows)', () => {
    // rows are clamped to the row count; a selection only in the spare rows
    // collapses to nothing sensible…
    expect(effectiveGridRange(selection({ rows: [3, 4] }), 4, 6)).toEqual({ x: 0, y: 3, width: 6, height: 1 });
  });
});

describe('indexOfKey', () => {
  it('resolves the key when present', () => {
    expect(indexOfKey(['a', 'b', 'c'], 'b', 99)).toBe(1);
  });

  it('falls back to a clamped index when the key is gone', () => {
    expect(indexOfKey(['a', 'b', 'c'], 'zz', 1)).toBe(1);
    expect(indexOfKey(['a', 'b', 'c'], 'zz', -5)).toBe(0);
    expect(indexOfKey(['a', 'b', 'c'], 'zz', 99)).toBe(2);
    expect(indexOfKey(['a', 'b', 'c'], 'zz', 1.9)).toBe(1);
  });

  it('is null without any keys to resolve into', () => {
    expect(indexOfKey([], 'a', 0)).toBeNull();
  });
});

describe('selectionRangeToWire', () => {
  const rows = ['r0', 'r1', 'r2'];
  const cols = ['c0', 'c1', 'c2', 'c3'];

  it('encodes both corners with keys + indices', () => {
    expect(selectionRangeToWire('g', { x: 1, y: 0, width: 2, height: 3 }, rows, cols)).toEqual({
      scope: 'g',
      anchor: { rowKey: 'r0', colKey: 'c1', rowIndex: 0, colIndex: 1 },
      extent: { rowKey: 'r2', colKey: 'c2', rowIndex: 2, colIndex: 2 },
    });
  });

  it('clamps to real cells — the spare rows are never broadcast', () => {
    expect(selectionRangeToWire('g', { x: 0, y: 1, width: 9, height: 9 }, rows, cols)).toEqual({
      scope: 'g',
      anchor: { rowKey: 'r1', colKey: 'c0', rowIndex: 1, colIndex: 0 },
      extent: { rowKey: 'r2', colKey: 'c3', rowIndex: 2, colIndex: 3 },
    });
  });

  it('is null when the range starts past the data or there is no data', () => {
    expect(selectionRangeToWire('g', { x: 0, y: 3, width: 1, height: 1 }, rows, cols)).toBeNull();
    expect(selectionRangeToWire('g', { x: 0, y: 0, width: 0, height: 1 }, rows, cols)).toBeNull();
    expect(selectionRangeToWire('g', { x: 0, y: 0, width: 1, height: 1 }, [], cols)).toBeNull();
  });
});

describe('resolveSelectionRange', () => {
  const rows = ['r0', 'r1', 'r2'];
  const cols = ['c0', 'c1', 'c2'];

  const wire = (a: [string, string, number, number], e: [string, string, number, number]) => ({
    scope: 'g',
    anchor: { rowKey: a[0], colKey: a[1], rowIndex: a[2], colIndex: a[3] },
    extent: { rowKey: e[0], colKey: e[1], rowIndex: e[2], colIndex: e[3] },
  });

  it('resolves by key, not by the sender index', () => {
    // Same keys, different local order/indices — the keys win.
    expect(resolveSelectionRange(wire(['r2', 'c1', 0, 0], ['r2', 'c2', 0, 1]), rows, cols))
      .toEqual({ x: 1, y: 2, width: 2, height: 1 });
  });

  it('normalizes an inverted (bottom-right → top-left) drag', () => {
    expect(resolveSelectionRange(wire(['r2', 'c2', 2, 2], ['r0', 'c0', 0, 0]), rows, cols))
      .toEqual({ x: 0, y: 0, width: 3, height: 3 });
  });

  it('falls back to the clamped sender index when the key is gone', () => {
    expect(resolveSelectionRange(wire(['missing', 'missing', 9, 9], ['missing', 'missing', 9, 9]), rows, cols))
      .toEqual({ x: 2, y: 2, width: 1, height: 1 });
  });

  it('is null without rows or columns to show it on', () => {
    expect(resolveSelectionRange(wire(['r0', 'c0', 0, 0], ['r1', 'c1', 1, 1]), [], cols)).toBeNull();
    expect(resolveSelectionRange(wire(['r0', 'c0', 0, 0], ['r1', 'c1', 1, 1]), rows, [])).toBeNull();
  });
});

describe('withAlpha', () => {
  it('converts 6- and 3-digit hex to rgba', () => {
    expect(withAlpha('#4f46e5', 0.16)).toBe('rgba(79, 70, 229, 0.16)');
    expect(withAlpha('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(withAlpha('  #000000 ', 1)).toBe('rgba(0, 0, 0, 1)');
  });

  it('clamps the alpha and passes non-hex colours through', () => {
    expect(withAlpha('#0f766e', 9)).toBe('rgba(15, 118, 110, 1)');
    expect(withAlpha('#0f766e', -1)).toBe('rgba(15, 118, 110, 0)');
    expect(withAlpha('rgba(1,2,3,0.4)', 0.5)).toBe('rgba(1,2,3,0.4)');
    expect(withAlpha('#12345', 0.5)).toBe('#12345');
  });
});
