import { useEffect } from 'react';
import { OVERLAY_HEARTBEAT_MS, type LocalOverlayKind } from './supabase/presence';

/**
 * The local-overlay signal (roadmap 240) — "THIS user is inside a surface
 * only they can see": a menu/dropdown or a modal. Peers render animated dots
 * on the pointer tag and the header collaborator bubble instead of a pointer
 * that looks parked.
 *
 * Wiring rule: the signal fires ONLY from the shared primitives
 * (`components/Modal`, `components/DropdownMenu`, `components/DropdownPanel`,
 * `lib/dropdown.ts` `useDropdown`) — never per call site, so every menu and
 * modal in the app is covered by construction.
 *
 * Semantics:
 * - OPEN/CLOSE EDGES only (no pointer-rate traffic): opening registers an
 *   overlay id, closing releases it; the top of the stack (newest open) is
 *   the announced kind, so nesting a dropdown inside a modal reads as 'menu'
 *   and closing it falls back to 'modal'.
 * - A heartbeat re-announces an open overlay every `OVERLAY_HEARTBEAT_MS`;
 *   receivers drop a signal older than `OVERLAY_TTL_MS`, so a killed tab or a
 *   paused heartbeat clears without a close event.
 * - Heartbeats PAUSE while the window is blurred or the tab hidden (a peer
 *   who switched away is not "busy in the surface" any more) and re-announce
 *   on resume; a killed tab never resumes.
 * - Ephemeral only: never persisted, never a room action, never `track()`.
 */
export interface OverlaySignalHub {
  /** Register one open overlay (newest wins the announced kind); returns the
   *  release that closes it. */
  open: (kind: LocalOverlayKind) => () => void;
  /** The kind to announce right now (top of the stack), or null when closed. */
  getKind: () => LocalOverlayKind | null;
  /** Subscribe to edge changes and heartbeats. The reason lets the transport
   *  skip REDUNDANT edge frames (a nested close re-registers the outer kind
   *  with the same value — publishing it again would race the close edge in
   *  the same millisecond) while still re-announcing every heartbeat. */
  subscribe: (cb: (reason: OverlaySignalReason) => void) => () => void;
  /** Heartbeat tick: re-announce while something is open and not paused. */
  heartbeat: () => void;
  /** Pause/resume heartbeats (blurred window / hidden tab); resuming with an
   *  overlay still open re-announces it. */
  setPaused: (paused: boolean) => void;
}

/** Why a subscriber was notified: an open/close EDGE, or the periodic
 *  re-announce (heartbeat / resume) that keeps the receiver's TTL alive. */
export type OverlaySignalReason = 'change' | 'heartbeat';

export function createOverlaySignalHub(): OverlaySignalHub {
  const active = new Map<symbol, LocalOverlayKind>();
  const listeners = new Set<(reason: OverlaySignalReason) => void>();
  let paused = false;
  const emit = (reason: OverlaySignalReason) => {
    for (const listener of [...listeners]) {
      try {
        listener(reason);
      } catch {
        // listener errors must not break the signal
      }
    }
  };
  return {
    open(kind) {
      const id = Symbol('local-overlay');
      active.set(id, kind);
      emit('change');
      return () => {
        active.delete(id);
        emit('change');
      };
    },
    getKind() {
      let kind: LocalOverlayKind | null = null;
      for (const k of active.values()) kind = k;
      return kind;
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    heartbeat() {
      if (paused || active.size === 0) return;
      emit('heartbeat');
    },
    setPaused(next) {
      const was = paused;
      paused = next;
      if (was && !paused && active.size > 0) emit('heartbeat');
    },
  };
}

/** The ONE hub instance for the app (per JS context = per window). */
export const overlaySignal = createOverlaySignalHub();

// ---- browser wiring (a no-op in unit tests — node has no window) -----------
let windowFocused = true;
function syncPaused() {
  if (typeof document === 'undefined') return;
  overlaySignal.setPaused(document.visibilityState === 'hidden' || !windowFocused);
}
if (typeof window !== 'undefined') {
  window.addEventListener('blur', () => {
    windowFocused = false;
    syncPaused();
  });
  window.addEventListener('focus', () => {
    windowFocused = true;
    syncPaused();
  });
  document.addEventListener('visibilitychange', syncPaused);
  setInterval(() => overlaySignal.heartbeat(), OVERLAY_HEARTBEAT_MS);
}

/** React edge for the shared primitives: register while `open`. */
export function useLocalOverlaySignal(kind: LocalOverlayKind, open: boolean): void {
  useEffect(() => (open ? overlaySignal.open(kind) : undefined), [kind, open]);
}

/** The kind to announce right now (top of the stack), or null. */
export function getLocalOverlayKind(): LocalOverlayKind | null {
  return overlaySignal.getKind();
}

/** Subscribe to overlay edges + heartbeats (the presence layer re-announces
 *  the current kind — skipping redundant edges, always on a heartbeat).
 *  Returns the unsubscribe. */
export function subscribeLocalOverlays(cb: (reason: OverlaySignalReason) => void): () => void {
  return overlaySignal.subscribe(cb);
}
