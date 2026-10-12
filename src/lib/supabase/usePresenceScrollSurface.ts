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
 *   the channel).
 * - Receiver: applies a followed peer's sample. Your OWN scrolling never ends
 *   follow (user decision 2026-10-13): you can look around freely, and the
 *   leader's next scroll re-syncs you. Only the applied echo is filtered, so
 *   the channel stays clean.
 */
export interface PresenceScrollSurfaceOptions {
  surface: ScrollSurface;
  /** DOM surfaces: the scroll container the sample/apply math runs on (omit
   *  for canvas surfaces that provide `sample`/`apply`). */
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

  useEffect(() => {
    if (!enabled) return;
    return registerPresenceScrollSurface(options.surface, (sample) => {
      const opts = optionsRef.current;
      appliedAtRef.current = Date.now();
      if (opts.apply) {
        opts.apply(sample);
        return;
      }
      appliedTopRef.current = applyDomScroll(domDescriptor(opts), sample);
    });
  }, [enabled, options.surface]);

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
