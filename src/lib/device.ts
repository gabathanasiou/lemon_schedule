import { useSyncExternalStore } from 'react';
import { IS_COARSE } from '@gabriel/ui-kit';
export { IS_COARSE, IS_TOUCH_CAPABLE, isTouchLike, getLastPointerType, useLastPointerType, getHardwareKeyboard, useHardwareKeyboard } from '@gabriel/ui-kit';

/** Phone-in-portrait layout (roadmap 267): coarse pointer + phone-width
 *  viewport + upright. Landscape and every iPad width (≥744pt) fail the query,
 *  so the full chrome comes back on rotation; the iPhone Duo's outer display
 *  (466×678pt) matches on purpose. Known quirk: iPad Slide Over (≤600pt) also
 *  matches — acceptable for the PoC. */
export const PHONE_PORTRAIT_QUERY = '(pointer: coarse) and (max-width: 600px) and (orientation: portrait)';

/** Any phone-class viewport (either orientation, roadmap 267): drives the
 *  viewport-fit=cover opt-in and the shell's safe-area paddings — in landscape
 *  the insets report the Dynamic Island (59px left/right on a 14 Pro Max). */
export const PHONE_DEVICE_QUERY = '(pointer: coarse) and (max-width: 600px), (pointer: coarse) and (max-height: 600px)';

/** Debug override for the phone layout (roadmap 267 PoC): Safari's Responsive
 *  Design Mode does not emulate `pointer: coarse`, so the layout cannot be
 *  previewed there. `?phone=1` drops the pointer/width half of the query and
 *  keeps the ORIENTATION half real — rotating the emulated device still
 *  returns the normal chrome, exactly like production. DEV builds always;
 *  prod/preview only with the debug-bridge flag (same gate as
 *  `isAgentModeEnabled()` in `debugBridge.ts`; key + value stay in sync). */
/** `?phone=1` forces the WHOLE phone presentation (DEV builds; debug-bridge
 *  gate in prod/preview) — a Mac's pointer is fine and its `screen` is the
 *  host display, so without this neither the layout nor the heights can be
 *  previewed in Safari's Responsive Design Mode. */
function isPhonePortraitForced(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('phone') !== '1') return false;
    return import.meta.env.DEV || localStorage.getItem('LEMON_AGENT') === '1';
  } catch {
    return false;
  }
}

const PHONE_LAYOUT_FORCED = isPhonePortraitForced();

const QUERY = PHONE_LAYOUT_FORCED ? '(orientation: portrait)' : PHONE_PORTRAIT_QUERY;

const phonePortraitMql = typeof window !== 'undefined' ? window.matchMedia(QUERY) : null;

/** Reactive phone-layout probe — rotation re-renders its consumers. */
export function usePhonePortrait(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      phonePortraitMql?.addEventListener('change', onStoreChange);
      return () => phonePortraitMql?.removeEventListener('change', onStoreChange);
    },
    () => phonePortraitMql?.matches ?? false,
  );
}

const phoneDeviceMql = typeof window !== 'undefined' ? window.matchMedia(PHONE_DEVICE_QUERY) : null;

/** Reactive phone-class probe (either orientation) — shell height + insets. */
export function usePhoneDevice(): boolean {
  const detected = useSyncExternalStore(
    (onStoreChange) => {
      phoneDeviceMql?.addEventListener('change', onStoreChange);
      return () => phoneDeviceMql?.removeEventListener('change', onStoreChange);
    },
    () => phoneDeviceMql?.matches ?? false,
  );
  return PHONE_LAYOUT_FORCED || detected;
}

/** Which side carries the Dynamic Island in landscape (roadmap 267); null in
 *  portrait, where the island is top-centre and edge chrome never collides.
 *  iOS reports landscape-primary (`angle` 90) rotated so the island lands
 *  LEFT and landscape-secondary (270) RIGHT — flip the mapping if a device
 *  ever disagrees. THE one source for every edge inset (bars + docked
 *  panels): the side WITHOUT the island needs no inset. */
export type IslandSide = 'left' | 'right' | null;

function readIslandSide(): IslandSide {
  if (typeof window === 'undefined') return null;
  if (window.matchMedia('(orientation: portrait)').matches) return null;
  const angle = window.screen?.orientation?.angle;
  if (angle === 90) return 'left';
  if (angle === 270) return 'right';
  return null;
}

/** Reactive Dynamic-Island side — recalculated on rotation (`screen.orientation`
 *  change where available; `orientationchange`/`resize` cover the rest). */
export function useIslandSide(): IslandSide {
  return useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener('orientationchange', onStoreChange);
      window.addEventListener('resize', onStoreChange);
      const so = window.screen?.orientation;
      so?.addEventListener?.('change', onStoreChange);
      return () => {
        window.removeEventListener('orientationchange', onStoreChange);
        window.removeEventListener('resize', onStoreChange);
        so?.removeEventListener?.('change', onStoreChange);
      };
    },
    readIslandSide,
  );
}

/** On coarse-pointer devices (iPad/iOS) the native Files picker greys out
 *  files whose extension isn't a registered UTType (`.lemon`, `.msd`, `.fdx`,
 *  `.fountain`…). Broaden the picker to accept any file there — the import
 *  handlers already validate by file extension and surface an Import Error
 *  dialog, so the effective set matches desktop. Desktop keeps the narrow
 *  filter. */
export function pickerAccept(desktopAccepts: string): string {
  return IS_COARSE ? '*/*' : desktopAccepts;
}
