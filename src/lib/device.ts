import { useState, useEffect, useRef } from 'react';

const IS_BROWSER = typeof window !== 'undefined';
export const IS_COARSE = IS_BROWSER && window.matchMedia('(pointer: coarse)').matches;
export const IS_TOUCH_CAPABLE = IS_BROWSER && (window.matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0);

/** Apple Pencil events report pointerType 'pen' but must behave exactly like a finger. */
export function isTouchLike(pointerType?: string | null): boolean {
  return pointerType === 'touch' || pointerType === 'pen';
}

let _lastPointerType: string | null = null;
const _lastPointerTypeListeners = new Set<() => void>();

if (IS_BROWSER) {
  window.addEventListener('pointerdown', (e) => {
    _lastPointerType = e.pointerType;
    _lastPointerTypeListeners.forEach(fn => fn());
  }, true);
}

export function getLastPointerType(): string | null { return _lastPointerType; }

export function useLastPointerType(): string | null {
  const [, tick] = useState(0);
  const valueRef = useRef(_lastPointerType);
  useEffect(() => {
    const fn = () => {
      if (valueRef.current !== _lastPointerType) {
        valueRef.current = _lastPointerType;
        tick(n => n + 1);
      }
    };
    _lastPointerTypeListeners.add(fn);
    return () => { _lastPointerTypeListeners.delete(fn); };
  }, []);
  return _lastPointerType;
}

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
  // Only poll while the page is visible: the interval otherwise keeps the
  // tab alive in background and costs idle CPU on iPad. The existing
  // visibilitychange listener above already resyncs on return.
  const interval = window.setInterval(() => {
    if (document.visibilityState === 'visible') resync();
  }, 2000);
  window.addEventListener('pagehide', () => window.clearInterval(interval));
  // Keydown heuristic: soft keyboards fire keyCode 229 (Android) or nothing for
  // text keys (iOS), and both platforms fire Enter/Backspace from the accessory
  // bar. Any other real keydown implies a physical keyboard.
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.isComposing) return;
    if (e.keyCode === 229) return;
    if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Process' || e.key === 'Unidentified') return;
    setHardwareKeyboard(true);
  });
  // ── Apple Pencil click shim ──────────────────────────────────────────────
  // iOS Safari does not synthesize click events for pen taps on overlay
  // surfaces (modals, popups, menus — Radix or custom). Dispatch a synthetic
  // click on pointerup for pen taps; if Safari also synthesizes a native click
  // (some contexts do), a position-based suppressor swallows it so the action
  // runs exactly once.
  //
  // NOTE: no preventDefault on pointerdown — canceling it makes React skip its
  // capture handlers on portal content, which Radix's dismissable layer uses to
  // recognize inside-taps, so every pen tap would dismiss the modal.
  let penDownPos: { x: number; y: number } | null = null;
  let lastPenTap: { x: number; y: number; time: number } | null = null;
  const PEN_CLICK = '__penClick';
  const NATIVE_PICKER_TYPES = new Set(['color', 'file', 'date', 'datetime-local', 'month', 'time', 'week']);
  window.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType !== 'pen' || e.button !== 0) return;
    penDownPos = { x: e.clientX, y: e.clientY };
  }, true);
  window.addEventListener('pointerup', (e: PointerEvent) => {
    if (e.pointerType !== 'pen') return;
    const down = penDownPos;
    penDownPos = null;
    if (!down) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return; // drag/scroll, not a tap
    const target = e.target as Element | null;
    if (!target || !target.isConnected) return;
    if (target instanceof HTMLInputElement && NATIVE_PICKER_TYPES.has(target.type)) {
      // Native pickers (color swatch, file, date…) only open from a trusted
      // gesture — the synthetic click can't open them and the suppressor below
      // would eat the real click. Open via showPicker() in this real handler,
      // and skip suppression so any native click still works.
      try { target.showPicker(); } catch { /* not supported — native click path only */ }
      return;
    }
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
    (evt as any)[PEN_CLICK] = true;
    lastPenTap = { x: e.clientX, y: e.clientY, time: Date.now() };
    target.dispatchEvent(evt);
  }, true);
  window.addEventListener('click', (e: MouseEvent) => {
    if ((e as any)[PEN_CLICK]) return; // our own synthetic click
    // If Safari also fires a native click for the same pen tap, swallow it so
    // the action doesn't run twice — but only at the tap's coordinates, so
    // unrelated clicks right after are unaffected.
    if (lastPenTap && Date.now() - lastPenTap.time < 1000 && Math.hypot(e.clientX - lastPenTap.x, e.clientY - lastPenTap.y) < 12) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
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
