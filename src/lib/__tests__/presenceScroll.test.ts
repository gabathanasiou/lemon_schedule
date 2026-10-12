import { describe, expect, it, vi } from 'vitest';
import { applyPresenceScrollSample, isAppliedScroll, registerPresenceScrollSurface } from '../presenceScroll';

describe('presence scroll helpers', () => {
  it('recognises our own applied scroll position (within 1px)', () => {
    expect(isAppliedScroll(120, 120)).toBe(true);
    expect(isAppliedScroll(120, 120.6)).toBe(true);
    expect(isAppliedScroll(120, 122)).toBe(false);
    expect(isAppliedScroll(null, 120)).toBe(false);
  });

  it('routes a sample to the registered surface only', () => {
    const apply = vi.fn();
    const unregister = registerPresenceScrollSurface('calendar', apply);
    const sample = { surface: 'calendar' as const, key: '2026-10-12', off: 0.25 };
    expect(applyPresenceScrollSample(sample)).toBe(true);
    expect(apply).toHaveBeenCalledWith(sample);
    expect(applyPresenceScrollSample({ surface: 'sheet', key: 'cast', off: 0 })).toBe(false);
    unregister();
    expect(applyPresenceScrollSample(sample)).toBe(false);
  });
});
