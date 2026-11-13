import { describe, expect, it } from 'vitest';
import type { KeyboardEvent } from 'react';
import { isImeConfirm } from '../keys';

/** A keydown with only the fields the predicate reads. */
function keydown(init: { isComposing?: boolean; keyCode?: number }): KeyboardEvent<Element> {
  return {
    nativeEvent: {
      isComposing: init.isComposing ?? false,
      keyCode: init.keyCode ?? 13,
    },
  } as unknown as KeyboardEvent<Element>;
}

describe('isImeConfirm (MWG-01)', () => {
  it('lets a plain Enter through', () => {
    expect(isImeConfirm(keydown({}))).toBe(false);
  });

  it('catches a composition in progress', () => {
    expect(isImeConfirm(keydown({ isComposing: true }))).toBe(true);
  });

  it("catches Safari's out-of-order confirming Enter (VK_PROCESSKEY)", () => {
    // compositionend already fired, so isComposing is false — 229 is the only
    // signal left (WebKit bug 165004).
    expect(isImeConfirm(keydown({ isComposing: false, keyCode: 229 }))).toBe(true);
  });

  it('catches both signals together', () => {
    expect(isImeConfirm(keydown({ isComposing: true, keyCode: 229 }))).toBe(true);
  });
});
