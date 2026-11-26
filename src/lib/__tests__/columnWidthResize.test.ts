import { describe, it, expect } from 'vitest';
import { resizeAdjacentWidths, scaleRightWidths } from '../columnWidthResize';
import { normalizeColWidths } from '../ribbonDefaults';

/**
 * Roadmap 367 — the pure column-width math behind the resize badge. The
 * invariants matter more than exact splits: a commit must never carry a
 * negative/non-finite width, and a row must keep its total.
 */

const sum = (a: number[]) => Math.round(a.reduce((s, w) => s + w, 0) * 100) / 100;

describe('resizeAdjacentWidths', () => {
  it('moves the boundary while the pair keeps its total', () => {
    const out = resizeAdjacentWidths([40, 60], 0, 10);
    expect(out).toEqual([50, 50]);
    expect(sum(out)).toBe(100);
  });

  it('clamps each side to the 2.5% floor', () => {
    expect(resizeAdjacentWidths([40, 60], 0, -1000)).toEqual([2.5, 97.5]);
    expect(resizeAdjacentWidths([40, 60], 0, 1000)).toEqual([97.5, 2.5]);
  });

  it('never invents a negative side when the pair is already below 2× the floor', () => {
    const out = resizeAdjacentWidths([1, 1, 98], 0, 50);
    expect(out.every(w => w > 0)).toBe(true);
    expect(out[0] + out[1]).toBe(2);
    expect(sum(out)).toBe(100);
  });

  it('is a no-op for an out-of-range boundary or a zero-total pair', () => {
    expect(resizeAdjacentWidths([10, 90], 1, 5)).toEqual([10, 90]);
    expect(resizeAdjacentWidths([0, 0], 0, 5)).toEqual([0, 0]);
  });
});

describe('scaleRightWidths (Shift)', () => {
  it('scales every column to the right proportionally and keeps the total', () => {
    const out = scaleRightWidths([20, 40, 40], 0, 10);
    expect(out[0]).toBe(30);
    expect(sum(out)).toBe(100);
    expect(out[1]).toBeLessThan(40);
    expect(out[2]).toBeLessThan(40);
  });

  it('respects the floor and still normalizes to the original total', () => {
    const out = scaleRightWidths([20, 2.5, 77.5], 0, 30);
    expect(out.every(w => w > 0)).toBe(true);
    expect(out[1]).toBeGreaterThanOrEqual(2.4); // rounding may land a hair under
    expect(sum(out)).toBe(100);
  });

  it('falls back safely when the right side is already below the floor', () => {
    const out = scaleRightWidths([1, 1, 98], 0, 40);
    expect(out.every(w => Number.isFinite(w) && w > 0)).toBe(true);
    expect(sum(out)).toBe(100);
  });
});

describe('normalizeColWidths hardening', () => {
  it('replaces negative and NaN widths with positives and rescales to 100', () => {
    const out = normalizeColWidths([-5, 60, Number.NaN]);
    expect(out.every(w => Number.isFinite(w) && w > 0)).toBe(true);
    expect(sum(out)).toBe(100);
  });

  it('recovers from an all-zero row', () => {
    const out = normalizeColWidths([0, 0, 0]);
    expect(out.every(w => w > 0)).toBe(true);
    expect(sum(out)).toBe(100);
  });

  it('leaves a valid 100% row untouched', () => {
    expect(normalizeColWidths([2, 2, 96])).toEqual([2, 2, 96]);
  });
});
