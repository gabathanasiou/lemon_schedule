import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { usePopoutWindow } from '../popoutTarget';
import {
  applyDomScroll,
  isAppliedScroll,
  registerPresenceScrollSurface,
  sampleDomScroll,
  type ScrollItemSample,
} from '../presenceScroll';
import { usePresenceActions } from './presenceContext';
import type { PresenceScrollSample, ScrollSurface } from './presence';

/**
 * Follow-completeness wiring for ONE scroll surface (roadmap 229, docs
 * COLLABORATION §9). The surface mounts this hook, calls `notify()` from its
 * scroll handler (or Glide's `onVisibleRegionChanged`) and uses the returned
 * `enabled` for its own presence publishing.
 *
 * - Registers the surface's scroll target while mounted (main window only —
 *   popout instances neither apply nor publish, parity with the live-pointer
 *   rule).
 * - Sender: samples the semantic top-edge item and publishes it (throttled in
 *   the channel); a wheel/touch gesture marks the scroll as the USER's, which
 *   exits follow (user decision 2026-10-13 — touching the view yourself ends
 *   follow, like navigating away).
 * - Receiver: applies a followed peer's sample; the resulting scroll event is
 *   recognised as our own echo (exact scrollTop for DOM surfaces, a short
 *   window for canvas surfaces) and neither re-published nor treated as a
 *   user scroll.
 */
export interface PresenceScrollSurfaceOptions {
  surface: ScrollSurface;
  /** DOM surfaces: the scroll container the sample/apply math runs on. For
   *  canvas surfaces this is only the gesture surface (wheel/touch). */
  container?: RefObject<HTMLElement | null>;
  /** DOM descriptor — omit when `sample`/`apply` are provided (Glide). */
  selector?: string;
  keyAttr?: string;
  /** Coarse, always-mounted fallback items (stripboard day blocks). */
  fallback?: { selector: string; keyAttr: string };
  /** Sticky chrome inside the container the top edge hides under (px). */
  sticky?: number | (() => number);
  /** Canvas surfaces: sample/target the surface's own scroll API instead. */
  sample?: () => ScrollItemSample | null;
  apply?: (sample: PresenceScrollSample) => void;
}

/** A wheel/touch gesture within this window marks the next scroll as a user's. */
const USER_GESTURE_MS = 400;
/** Canvas region changes this soon after our own apply are its echo. */
const CANVAS_ECHO_MS = 250;

export function usePresenceScrollSurface(options: PresenceScrollSurfaceOptions): { notify: () => void; enabled: boolean } {
  const actions = usePresenceActions();
  const isPopout = !!usePopoutWindow();
  const enabled = !isPopout;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // Where our own apply landed (DOM surfaces) / when it happened (canvas).
  const appliedTopRef = useRef<number | null>(null);
  const appliedAtRef = useRef(0);
  // The last wheel/touch gesture on the surface — the scroll events that
  // follow it are the user's (programmatic scrolls carry no gesture).
  const gestureAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const unregister = registerPresenceScrollSurface(options.surface, (sample) => {
      const opts = optionsRef.current;
      appliedAtRef.current = Date.now();
      if (opts.apply) {
        opts.apply(sample);
        return;
      }
      appliedTopRef.current = applyDomScroll(domDescriptor(opts), sample);
    });
    const container = options.container?.current ?? null;
    if (!container) return unregister;
    const markGesture = () => { gestureAtRef.current = Date.now(); };
    container.addEventListener('wheel', markGesture, { passive: true });
    container.addEventListener('touchmove', markGesture, { passive: true });
    return () => {
      unregister();
      container.removeEventListener('wheel', markGesture);
      container.removeEventListener('touchmove', markGesture);
    };
  }, [enabled, options.surface, options.container]);

  const notify = useCallback(() => {
    if (!enabled || !actions.isActive()) return;
    const opts = optionsRef.current;
    if (opts.apply) {
      // Canvas surface: no scrollTop to compare — a region change just after
      // our own apply is its echo (an animated scroll can emit several).
      if (Date.now() - appliedAtRef.current < CANVAS_ECHO_MS) return;
    } else {
      const container = opts.container?.current;
      if (!container) return;
      const applied = appliedTopRef.current;
      appliedTopRef.current = null;
      if (isAppliedScroll(applied, container.scrollTop)) return;
    }
    const sample = opts.sample ? opts.sample() : sampleDomScroll(domDescriptor(opts));
    if (!sample) return;
    actions.publishScroll({ surface: opts.surface, ...sample });
    if (Date.now() - gestureAtRef.current < USER_GESTURE_MS) actions.noteUserViewChange();
  }, [actions, enabled]);

  return { notify, enabled };
}

function domDescriptor(opts: PresenceScrollSurfaceOptions) {
  return {
    container: opts.container?.current ?? null,
    selector: opts.selector ?? '',
    keyAttr: opts.keyAttr ?? '',
    sticky: typeof opts.sticky === 'function' ? opts.sticky() : (opts.sticky ?? 0),
    fallback: opts.fallback,
  };
}
