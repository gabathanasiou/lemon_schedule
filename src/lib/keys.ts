import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/** The two keydown shapes app handlers receive: React's synthetic event and the
 *  native `KeyboardEvent` from window/document listeners. */
type KeyEvent = ReactKeyboardEvent<Element> | globalThis.KeyboardEvent;

/**
 * True when a keydown is the IME confirming/consuming the key, not the app
 * acting on it (audit MWG-01, `ime-safe-enter-submit`).
 *
 * A Japanese/Chinese/Korean user presses Enter to accept an IME candidate;
 * without this guard the app treats that keystroke as "commit" and saves the
 * half-converted text. `isComposing` alone is unreliable in Safari (WebKit bug
 * 165004 — the confirming keydown can arrive after compositionend), so the
 * guide's Safari-safe pair includes `keyCode === 229` (VK_PROCESSKEY).
 *
 * Call sites keep their own key test; this predicate only answers "is the IME
 * eating this key?":
 *
 *   if (e.key === 'Enter' && !isImeConfirm(e)) commit();
 */
export function isImeConfirm(e: KeyEvent): boolean {
  const native = 'nativeEvent' in e ? e.nativeEvent : e;
  return native.isComposing || native.keyCode === 229;
}
