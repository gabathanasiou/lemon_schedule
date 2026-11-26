import { describe, it, expect } from 'vitest';
import {
  imageAlignStyle,
  imageObjectPosition,
  resizeHandleMode,
} from '../reportImageLayout';

/**
 * Roadmap 366 — the pure half of the 3×3 image anchor: box alignment, the
 * content anchor (`object-position`) and which edge the single resize handle
 * lives on. The chrome itself is a rule-7 manual check.
 */

describe('imageObjectPosition', () => {
  it('maps the 3×3 anchor to a CSS object-position', () => {
    expect(imageObjectPosition('left', 'top')).toBe('left top');
    expect(imageObjectPosition('center', 'center')).toBe('center center');
    expect(imageObjectPosition('right', 'bottom')).toBe('right bottom');
  });

  it('defaults to a left, centre anchor', () => {
    expect(imageObjectPosition()).toBe('left center');
  });
});

describe('imageAlignStyle', () => {
  it('left pins the left edge, right pins the right, centre splits', () => {
    expect(imageAlignStyle('left')).toEqual({ marginLeft: 0, marginRight: 0 });
    expect(imageAlignStyle('right')).toEqual({ marginLeft: 'auto', marginRight: 0 });
    expect(imageAlignStyle('center')).toEqual({ marginLeft: 'auto', marginRight: 'auto' });
  });
});

describe('resizeHandleMode', () => {
  it('left alignment resizes from the bottom-right edge', () => {
    expect(resizeHandleMode('left')).toEqual({ side: 'right', flipX: false, scaleX: 1 });
  });

  it('right alignment keeps the right edge fixed — handle on the left, dx inverted', () => {
    expect(resizeHandleMode('right')).toEqual({ side: 'left', flipX: true, scaleX: 1 });
  });

  it('centre alignment grows both ways — handle right, dx doubled', () => {
    expect(resizeHandleMode('center')).toEqual({ side: 'right', flipX: false, scaleX: 2 });
  });

  it('defaults to left', () => {
    expect(resizeHandleMode()).toEqual({ side: 'right', flipX: false, scaleX: 1 });
  });
});
