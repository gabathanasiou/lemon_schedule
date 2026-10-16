import { describe, it, expect } from 'vitest';
import { focusScrollDelta } from '../useKeyboardEnsureVisible';

const band = { top: 12, bottom: 500 };

describe('focusScrollDelta', () => {
  it('is 0 when the field already fits the visible band', () => {
    expect(focusScrollDelta({ top: 100, bottom: 200 }, band)).toBe(0);
    expect(focusScrollDelta({ top: 12, bottom: 500 }, band)).toBe(0);
  });

  it('pushes up when the keyboard covers the field', () => {
    expect(focusScrollDelta({ top: 400, bottom: 560 }, band)).toBe(60);
    expect(focusScrollDelta({ top: 480, bottom: 900 }, band)).toBe(400);
  });

  it('pulls down when the field sits above the visible band', () => {
    expect(focusScrollDelta({ top: 0, bottom: 20 }, band)).toBe(-12);
    expect(focusScrollDelta({ top: -40, bottom: 10 }, band)).toBe(-52);
  });
});
