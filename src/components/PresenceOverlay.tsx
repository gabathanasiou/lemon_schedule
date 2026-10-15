import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppWindow, Hand, X } from 'lucide-react';
import { usePresenceActions, usePresenceState } from '../lib/supabase/presenceContext';
import {
  COLLISION_DWELL_IDLE,
  cursorGlyph,
  sameViewPlace,
  stepCollisionDwell,
  type CollisionDwellState,
  type PresenceAnchor,
  type PresencePeer,
} from '../lib/supabase/presence';
import type { AppPlace } from '../lib/appNav';
import { getPresenceGridScope } from '../lib/presenceResolvers';
import { avatarColor, shortNameOf } from '../lib/avatarIdentity';
import { cssEscape } from '../lib/utils';
import { PresenceDots } from './PresenceDots';

/**
 * Live cursors + the follow pill (roadmap 229 S3, docs/COLLABORATION.md §9).
 *
 * Canva-style pointers with a name label, resolved SEMANTICALLY:
 * - element anchors (stripboard row, calendar cell, Day Manager section) and
 *   grid anchors (Glide cell → scene id + column key) resolve to the same item
 *   on this client's layout — scroll, column widths, row order all free;
 * - a viewport-relative `screen` fallback covers everything else, rendered
 *   everywhere for the global header (shared chrome) and only while the peer
 *   is on the same tab for tab content;
 * - anchors that resolve OFF this client's viewport are hidden (user decision
 *   2026-10-12: hide, no edge chips).
 * - the glyph renders per input kind — arrow / hand (touch) / pen dot
 *   (roadmap 241) — and the tag carries animated dots while the peer is inside
 *   a local overlay only they can see (menu/modal, roadmap 240). While the
 *   peer is inside a MODAL their pointer FREEZES at its last position (their
 *   moves are over a surface nobody else can see) and renders the
 *   modal-window glyph (roadmap 244); menus keep moving.
 * - when the local and a peer's pointer stay on top of each other for a
 *   couple of seconds, the peer's marker fades until they separate
 *   (roadmap 244 — read what is underneath).
 *
 * Motion: pointers glide between positions with a rAF loop (exponential
 * approach toward the ~80ms measure target; `prefers-reduced-motion` snaps).
 * NEVER go back to a CSS `transition` on the pointer wrapper — the ~12/s
 * cursor feed restarted it mid-flight and the pointer stuttered. The layer
 * sits below modals (z-30 vs the kit's z-[10000]).
 */

const MAX_POINTERS = 6;
/** A pointer goes stale when its sender stops moving AND leaves — the
 *  presence leave already removes it; this is the idle safety net. */
const CURSOR_TTL_MS = 20_000;

interface MarkerPosition {
  peer: PresencePeer;
  left: number;
  top: number;
  /** Near the VIEWPORT's right edge the label flips to the left. */
  flip: boolean;
  /** The local pointer has rested on this marker long enough — fade it so
   *  what is underneath stays readable (roadmap 244). */
  faded: boolean;
}

/**
 * The name tag flips to the pointer's LEFT when it would overflow the
 * VIEWPORT's right edge (150px clears the longest realistic short-name tag at
 * the 10px label size, plus the overlay dots cue). ONE rule for every anchor
 * kind: scoping the flip to a fraction of the ANCHOR element (the old
 * `fx > 0.65`) flipped the tag mid-screen on wide rows — a stripboard row
 * spans most of the window, so the label hopped sides while the peer merely
 * moved across the row.
 */
const TAG_FLIP_MARGIN_PX = 150;
function tagFlips(x: number): boolean {
  return x > window.innerWidth - TAG_FLIP_MARGIN_PX;
}

/** Glide smoothing: time constant to close 63% of the distance to the target
 *  (~110ms reads as a smooth chase against the ~12/s cursor feed) and the
 *  distance below which the pointer is simply ON target. */
const SMOOTH_TAU_MS = 110;
const SNAP_PX = 0.4;

function anchorElement(anchor: PresenceAnchor): HTMLElement | null {
  switch (anchor.kind) {
    case 'row':
      return document.querySelector<HTMLElement>(`[data-row-id="${cssEscape(anchor.rowId)}"]`);
    case 'date':
      return document.querySelector<HTMLElement>(`[data-date-key="${cssEscape(anchor.date)}"]`);
    case 'day': {
      if (anchor.section) {
        const card = document.querySelector<HTMLElement>(`[data-day-manager] [data-section="${cssEscape(anchor.section)}"]`);
        if (card) return card;
      }
      return document.querySelector<HTMLElement>('[data-day-manager] [data-day-sections]')
        ?? document.querySelector<HTMLElement>('[data-day-manager]');
    }
    default:
      return null;
  }
}

/** Anchors that resolve outside this client's viewport are hidden. */
function inViewport(r: { left: number; top: number; width: number; height: number }): boolean {
  return r.left + r.width > 0 && r.left < window.innerWidth && r.top + r.height > 0 && r.top < window.innerHeight;
}

function clampToViewport(x: number, y: number): { left: number; top: number } {
  return {
    left: Math.min(Math.max(x, 4), Math.max(4, window.innerWidth - 24)),
    top: Math.min(Math.max(y, 4), Math.max(4, window.innerHeight - 28)),
  };
}

function markerPosition(
  anchor: PresenceAnchor,
  place: AppPlace,
  peer: PresencePeer,
): { left: number; top: number; flip: boolean } | null {
  // Same-screen rule (user decision 2026-10-12): a peer's pointer shows only
  // while we are on THEIR place — same tab, sub-tab and sub-sub mode. The
  // header/toolbar fall back to the same rule, so nothing floats over a view
  // the peer isn't actually looking at.
  if (!sameViewPlace(peer.view, place)) return null;

  if (anchor.kind === 'screen') {
    const x = Math.min(Math.max(anchor.xr * window.innerWidth, 0), window.innerWidth - 4);
    const y = Math.min(Math.max(anchor.yr * window.innerHeight, 0), window.innerHeight - 4);
    return { left: x, top: y, flip: tagFlips(x) };
  }

  let rect: { left: number; top: number; width: number; height: number } | null = null;
  let fx = 0.5;
  let fy = 0.5;
  if (anchor.kind === 'grid') {
    // Registered canvas grid (Glide Breakdown): cell → THIS client's rect.
    const located = getPresenceGridScope(anchor.scope)?.locate(anchor) ?? null;
    if (located) {
      rect = located;
      fx = anchor.fx;
      fy = anchor.fy;
    }
  } else {
    const el = anchorElement(anchor);
    if (el) {
      const r = el.getBoundingClientRect();
      rect = { left: r.left, top: r.top, width: r.width, height: r.height };
      fx = anchor.fx;
      fy = anchor.fy;
    }
  }
  if (!rect || rect.width === 0 || rect.height === 0 || !inViewport(rect)) return null;

  const x = rect.left + fx * rect.width;
  const y = rect.top + fy * rect.height;
  const pos = clampToViewport(x, y);
  return { ...pos, flip: tagFlips(pos.left) };
}

export function PresenceOverlay({ place }: { place: AppPlace }) {
  const { peers, followingId } = usePresenceState();
  const { follow, stopFollowing, getLocalPointer } = usePresenceActions();
  const [markers, setMarkers] = useState<MarkerPosition[]>([]);
  /**
   * Motion model: `measure()` resolves each peer's TARGET position (the
   * anchor-mapped rect + fraction) from a ~12/s cursor feed; a rAF loop glides
   * the rendered node toward that target. A plain CSS transition cannot do this
   * — every update RESTARTS it mid-flight, so the pointer stutters instead of
   * gliding (the reported choppiness, worst while anchored, where the sender's
   * thinned feed also has to travel through the anchor mapping).
   */
  const targetsRef = useRef(new Map<string, { left: number; top: number }>());
  const smoothRef = useRef(new Map<string, { left: number; top: number }>());
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  /** Per-peer collision dwell (roadmap 244) — the fade state machine. */
  const dwellRef = useRef(new Map<string, CollisionDwellState>());
  /** Marker SET signature — React re-renders only when a pointer or its flip
   *  side / glyph / fade actually changes; positions never go through state. */
  const sigRef = useRef('');

  const cursorPeers = useMemo(() => peers.filter(p => p.cursor), [peers]);

  useEffect(() => {
    if (cursorPeers.length === 0) {
      targetsRef.current = new Map();
      smoothRef.current.clear();
      dwellRef.current.clear();
      sigRef.current = '';
      setMarkers([]);
      return;
    }
    const measure = () => {
      const now = Date.now();
      const local = getLocalPointer();
      const next: MarkerPosition[] = [];
      const targets = new Map<string, { left: number; top: number }>();
      for (const peer of cursorPeers) {
        if (!peer.cursor) continue;
        // A FROZEN pointer (peer in a modal, roadmap 244) never idles out
        // while the cue is fresh — the dots cue stays on its tag there.
        if (peer.overlay !== 'modal' && now - peer.cursorTs > CURSOR_TTL_MS) continue;
        const pos = markerPosition(peer.cursor, place, peer);
        if (!pos) continue;
        // Collision fade: distance from the LOCAL pointer to the rendered
        // marker (Infinity before the first local pointer event — never fades).
        const distance = local ? Math.hypot(local.x - pos.left, local.y - pos.top) : Number.POSITIVE_INFINITY;
        const dwell = stepCollisionDwell(dwellRef.current.get(peer.userId) ?? COLLISION_DWELL_IDLE, distance, now);
        dwellRef.current.set(peer.userId, dwell);
        next.push({ peer, ...pos, faded: dwell.faded });
        targets.set(peer.userId, { left: pos.left, top: pos.top });
      }
      targetsRef.current = targets;
      for (const id of [...smoothRef.current.keys()]) {
        if (!targets.has(id)) smoothRef.current.delete(id);
      }
      for (const id of [...dwellRef.current.keys()]) {
        if (!targets.has(id)) dwellRef.current.delete(id);
      }
      const sig = next.map(m => `${m.peer.userId}:${m.flip ? 'L' : 'R'}:${m.peer.pointer}:${m.peer.overlay ?? ''}:${m.faded ? 'F' : ''}`).sort().join('|');
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setMarkers(next);
      }
    };
    measure();
    const interval = setInterval(measure, 80);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [cursorPeers, place, getLocalPointer]);

  useEffect(() => {
    if (markers.length === 0) return;
    // rAF pauses on its own while the tab is hidden.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      for (const m of markers) {
        const id = m.peer.userId;
        const node = nodeRefs.current.get(id);
        const target = targetsRef.current.get(id);
        if (!node || !target) continue;
        let cur = smoothRef.current.get(id);
        if (!cur) {
          // First frame of a new pointer: snap to the target (never glide in
          // from the corner), then chase from there.
          cur = { left: target.left, top: target.top };
          smoothRef.current.set(id, cur);
        } else {
          const k = reduced ? 1 : 1 - Math.exp(-dt / SMOOTH_TAU_MS);
          cur.left += (target.left - cur.left) * k;
          cur.top += (target.top - cur.top) * k;
          if (Math.abs(target.left - cur.left) < SNAP_PX && Math.abs(target.top - cur.top) < SNAP_PX) {
            cur.left = target.left;
            cur.top = target.top;
          }
        }
        node.style.transform = `translate3d(${cur.left}px, ${cur.top}px, 0)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [markers]);

  const followed = followingId ? peers.find(p => p.userId === followingId) : undefined;

  return (
    <>
      {markers.length > 0 && (
        <div className="fixed inset-0 z-30 pointer-events-none overflow-hidden" aria-hidden>
          {markers.slice(0, MAX_POINTERS).map(({ peer, left, top, flip, faded }) => {
            const color = avatarColor(peer.userId);
            const glyph = cursorGlyph(peer.pointer, peer.overlay);
            return (
            <div
              key={peer.userId}
              // The transform is driven per frame by the glide loop above (no
              // CSS transition — it would restart on every cursor update); the
              // ref only seeds the node so React re-renders never clobber it.
              ref={(el) => {
                if (!el) {
                  nodeRefs.current.delete(peer.userId);
                  return;
                }
                nodeRefs.current.set(peer.userId, el);
                const c = smoothRef.current.get(peer.userId) ?? targetsRef.current.get(peer.userId) ?? { left, top };
                el.style.transform = `translate3d(${c.left}px, ${c.top}px, 0)`;
              }}
              className="absolute left-0 top-0 will-change-transform"
            >
              <button
                data-testid="presence-cursor"
                data-pointer={peer.pointer}
                data-overlay={peer.overlay ?? undefined}
                data-glyph={glyph}
                data-faded={faded ? '1' : undefined}
                onClick={() => follow(peer.userId)}
                title={peer.overlay === 'modal'
                  ? `${peer.name} — in a dialog (click to follow)`
                  : peer.overlay
                    ? `${peer.name} — in a menu (click to follow)`
                    : `${peer.name} — click to follow`}
                className="presence-pointer-in pointer-events-auto relative block w-4 h-5 cursor-pointer motion-reduce:animate-none transition-opacity duration-300 motion-reduce:transition-none"
                style={{ opacity: faded ? 0.3 : 1 }}
              >
                {glyph === 'arrow' && (
                  <svg viewBox="0 0 15 19" className="absolute left-0 top-0 w-[15px] h-[19px] drop-shadow-md" aria-hidden>
                    <path
                      d="M1 1 L14 10 L8 11.4 L5 17.5 Z"
                      fill={color}
                      stroke="white"
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                {glyph === 'hand' && (
                  // Touch (roadmap 241): the little hand. The thick white
                  // under-stroke is the outline — the coloured stroke on top
                  // is the shape (lucide's Hand is stroke-only).
                  <span className="absolute left-0 top-0 block w-[18px] h-[18px] drop-shadow-md" aria-hidden>
                    <Hand className="absolute inset-0 w-[18px] h-[18px]" stroke="white" strokeWidth={4.4} />
                    <Hand className="absolute inset-0 w-[18px] h-[18px]" stroke={color} strokeWidth={2.3} />
                  </span>
                )}
                {glyph === 'pen' && (
                  // Pen: a small dot in the peer's colour (same anchor seam).
                  <span
                    className="absolute left-0 top-0 block w-[10px] h-[10px] rounded-full border-2 border-white shadow-md"
                    style={{ background: color }}
                    aria-hidden
                  />
                )}
                {glyph === 'window' && (
                  // Modal frozen (roadmap 244): the little window glyph. Same
                  // white under-stroke outline recipe as the Hand glyph.
                  <span className="absolute left-0 top-0 block w-[18px] h-[18px] drop-shadow-md" aria-hidden>
                    <AppWindow className="absolute inset-0 w-[18px] h-[18px]" stroke="white" strokeWidth={4.4} />
                    <AppWindow className="absolute inset-0 w-[18px] h-[18px]" stroke={color} strokeWidth={2.3} />
                  </span>
                )}
                <span
                  className={`absolute top-4 whitespace-nowrap flex items-center gap-1 rounded-full px-2 py-[3px] text-[10px] font-semibold text-white shadow-md ${flip ? 'right-3' : 'left-2.5'}`}
                  style={{ background: color }}
                >
                  {peer.overlay && <PresenceDots className="text-white/95" />}
                  {peer.isGuest ? peer.name : shortNameOf(peer.name)}
                </span>
              </button>
            </div>
            );
          })}
        </div>
      )}

      {followed && (
        <button
          data-testid="following-pill"
          onClick={stopFollowing}
          title="Stop following (Esc, or navigate anywhere)"
          className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-white/25 px-3 py-1 text-[11px] font-semibold text-white shadow-lg cursor-pointer transition-[filter] hover:brightness-110"
          style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))', background: avatarColor(followed.userId) }}
        >
          <span className="w-2 h-2 rounded-full bg-white/90 animate-pulse" />
          Following {followed.name}
          <X className="w-3 h-3 text-white/75" />
        </button>
      )}
    </>
  );
}
