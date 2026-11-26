import { describe, it, expect } from 'vitest';
import {
  IMAGE_MAX_HEIGHT_PX,
  IMAGE_MAX_WIDTH_PCT,
  IMAGE_MIN_WIDTH_PCT,
  resizeImageBlock,
} from '../reportImageResize';

/**
 * Roadmap 214 — image block resize math. The pointer/DOM half is a rule-7
 * manual check; the clamps and the aspect-lock/free-stretch branches are pure
 * and land here.
 */

const start = {
  widthPct: 50,
  startWidthPx: 400,
  startHeightPx: 300,
  containerWidth: 800,
};

describe('resizeImageBlock', () => {
  it('turns a layout-px drag into a width percent', () => {
    const out = resizeImageBlock({ ...start, heightPx: 300 }, { dx: 80, dy: 0, free: false });
    expect(out.widthPct).toBe(60);
    // Aspect lock scales an explicit box by the same factor.
    expect(out.heightPx).toBe(360);
  });

  it('keeps a natural-height image natural (no explicit height) when aspect-locked', () => {
    const out = resizeImageBlock(start, { dx: 80, dy: 200, free: false });
    expect(out.widthPct).toBe(60);
    expect(out.heightPx).toBeUndefined();
  });

  it('free stretch (Shift) moves both axes independently', () => {
    const out = resizeImageBlock(start, { dx: 80, dy: 40, free: true });
    expect(out.widthPct).toBe(60);
    expect(out.heightPx).toBe(340);
  });

  it('clamps width to the content width and the minimum', () => {
    expect(resizeImageBlock(start, { dx: 10_000, dy: 0, free: false }).widthPct).toBe(IMAGE_MAX_WIDTH_PCT);
    expect(resizeImageBlock(start, { dx: -10_000, dy: 0, free: false }).widthPct).toBe(IMAGE_MIN_WIDTH_PCT);
  });

  it('clamps a free-stretched height to the sane range', () => {
    expect(resizeImageBlock(start, { dx: 0, dy: 10_000, free: true }).heightPx).toBe(IMAGE_MAX_HEIGHT_PX);
    expect(resizeImageBlock(start, { dx: 0, dy: -10_000, free: true }).heightPx).toBeGreaterThan(0);
  });

  it('never divides by a zero container width', () => {
    const out = resizeImageBlock({ ...start, containerWidth: 0 }, { dx: 40, dy: 0, free: false });
    expect(Number.isFinite(out.widthPct)).toBe(true);
    expect(out.widthPct).toBe(IMAGE_MAX_WIDTH_PCT);
  });

  it('rounds the width to one decimal (no float dust in the stored design)', () => {
    const out = resizeImageBlock({ ...start, widthPct: 33.3 }, { dx: 1, dy: 0, free: false });
    expect(String(out.widthPct)).toMatch(/^\d+(\.\d)?$/);
  });
});
