/**
 * Global tap feedback for touch/pen input.
 *
 * On iOS there is no hover for fingers and :active does not reliably fire for
 * the Apple Pencil, so taps on interactive elements feel dead. This listens
 * for touch/pen pointerdowns and plays a short inset highlight flash (light or
 * dark tint depending on the surface), giving the "hover then activate" feel.
 * Desktop mouse keeps its natural hover — no flash.
 */
const FLASH_MS = 400;

let flashEl: HTMLElement | null = null;
let flashTimer: ReturnType<typeof setTimeout> | null = null;

function clearFlash() {
  if (flashEl) {
    flashEl.classList.remove('tap-flash', 'tap-flash-dark');
    flashEl = null;
  }
  if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
}

function applyFlash(el: HTMLElement) {
  clearFlash();
  flashEl = el;
  const m = getComputedStyle(el).backgroundColor.match(/\d+/g)?.slice(0, 3).map(Number);
  const rgb = m && m.length === 3 ? m : [255, 255, 255];
  const isDark = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 < 128;
  el.classList.add(isDark ? 'tap-flash-dark' : 'tap-flash');
  flashTimer = setTimeout(clearFlash, FLASH_MS);
}

function initTapFlash() {
  window.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (e.button !== 0) return;
    const target = e.target as Element | null;
    if (!(target instanceof HTMLElement)) return;
    const el = target.closest<HTMLElement>(
      'button, a, [role="button"], [role="menuitem"], [role="option"], label, summary, [data-tap-flash]',
    );
    if (!el) return;
    applyFlash(el);
  }, true);
}

initTapFlash();
