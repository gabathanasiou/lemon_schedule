import { useState, useEffect } from 'react';

const IS_BROWSER = typeof window !== 'undefined';
export const IS_COARSE = IS_BROWSER && window.matchMedia('(pointer: coarse)').matches;
export const IS_TOUCH_CAPABLE = IS_BROWSER && (window.matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0);

const HW_KB_QUERIES = ['(any-hover: hover)', '(any-pointer: fine)'];

function detectHardwareKeyboard(): boolean {
  if (!IS_BROWSER) return false;
  return HW_KB_QUERIES.some(q => window.matchMedia(q).matches);
}

let _hardwareKeyboard = detectHardwareKeyboard();
const _hwKbListeners = new Set<() => void>();

function setHardwareKeyboard(v: boolean) {
  if (_hardwareKeyboard === v) return;
  _hardwareKeyboard = v;
  _hwKbListeners.forEach(fn => fn());
}

if (IS_BROWSER) {
  // Magic Keyboard / mouse / trackpad attach-detach (iPad, Android, etc.)
  const resync = () => setHardwareKeyboard(detectHardwareKeyboard());
  for (const q of HW_KB_QUERIES) {
    const mq = window.matchMedia(q);
    mq.addEventListener?.('change', resync);
  }
  window.addEventListener('focus', resync);
  document.addEventListener('visibilitychange', resync);
  // Safari doesn't reliably fire matchMedia change events for pointer/hover
  // features, and a session can go stale until reload — poll the queries so
  // attach/detach of a Magic Keyboard/mouse reflects live (matchMedia is cheap).
  window.setInterval(resync, 2000);
  // Keydown heuristic: soft keyboards fire keyCode 229 (Android) or nothing for
  // text keys (iOS), and both platforms fire Enter/Backspace from the accessory
  // bar. Any other real keydown implies a physical keyboard.
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.isComposing) return;
    if (e.keyCode === 229) return;
    if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Process' || e.key === 'Unidentified') return;
    setHardwareKeyboard(true);
  });
}

/** Reactive hardware-keyboard detection (media queries + keydown heuristic). */
export function getHardwareKeyboard(): boolean {
  return _hardwareKeyboard;
}

export function useHardwareKeyboard(): boolean {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick(n => n + 1);
    _hwKbListeners.add(fn);
    return () => { _hwKbListeners.delete(fn); };
  }, []);
  return _hardwareKeyboard;
}
