import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { isImeConfirm as kitIsImeConfirm } from '@gabriel/ui-kit';

/** The two keydown shapes app handlers receive: React's synthetic event and the
 *  native `KeyboardEvent` from window/document listeners. */
type KeyEvent = ReactKeyboardEvent<Element> | globalThis.KeyboardEvent;

/**
 * True when a keydown is the IME confirming the key, not the app acting on it
 * (audit MWG-01). The predicate itself lives in `@gabriel/ui-kit` (`ime.ts`) so
 * the kit's own inputs and every app handler share one implementation; this
 * adapter only unwraps React's `nativeEvent`.
 *
 * Call sites keep their own key test; this predicate only answers "is the IME
 * eating this key?":
 *
 *   if (e.key === 'Enter' && !isImeConfirm(e)) commit();
 */
export function isImeConfirm(e: KeyEvent): boolean {
  const native = 'nativeEvent' in e ? e.nativeEvent : e;
  return kitIsImeConfirm(native);
}
