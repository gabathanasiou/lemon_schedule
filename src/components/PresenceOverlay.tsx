import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { usePresenceActions, usePresenceState } from '../lib/supabase/presenceContext';
import type { PresenceAnchor, PresencePeer } from '../lib/supabase/presence';
import { getPresenceGridScope } from '../lib/presenceResolvers';
import { avatarColor, shortNameOf } from '../lib/avatarIdentity';

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
 *
 * Motion: pointers glide between positions (CSS transform transition) so
 * snapped ↔ free transitions read as one movement; `prefers-reduced-motion`
 * snaps instantly. The layer sits below modals (z-30 vs the kit's z-[10000]).
 */

const MAX_POINTERS = 6;
/** A pointer goes stale when its sender stops moving AND leaves — the
 *  presence leave already removes it; this is the idle safety net. */
const CURSOR_TTL_MS = 20_000;

interface MarkerPosition {
  peer: PresencePeer;
  left: number;
  top: number;
  /** Near the element's right edge the label flips to the left. */
  flip: boolean;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

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
  activeTab: string | undefined,
  peer: PresencePeer,
): { left: number; top: number; flip: boolean } | null {
  if (anchor.kind === 'screen') {
    // Global chrome (the app header) is identical for everyone — always show.
    // Tab content only makes sense while the peer is on the same tab.
    if (!anchor.chrome && (!activeTab || peer.view?.tab !== activeTab)) return null;
    return {
      left: Math.min(Math.max(anchor.xr * window.innerWidth, 0), window.innerWidth - 4),
      top: Math.min(Math.max(anchor.yr * window.innerHeight, 0), window.innerHeight - 4),
      flip: anchor.xr > 0.65,
    };
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
  return { ...pos, flip: fx > 0.65 };
}

export function PresenceOverlay({ activeTab }: { activeTab?: string }) {
  const { peers, followingId } = usePresenceState();
  const { follow, stopFollowing } = usePresenceActions();
  const [markers, setMarkers] = useState<MarkerPosition[]>([]);

  const cursorPeers = useMemo(() => peers.filter(p => p.cursor), [peers]);

  useEffect(() => {
    if (cursorPeers.length === 0) {
      setMarkers([]);
      return;
    }
    const measure = () => {
      const now = Date.now();
      const next: MarkerPosition[] = [];
      for (const peer of cursorPeers) {
        if (!peer.cursor || now - peer.cursorTs > CURSOR_TTL_MS) continue;
        const pos = markerPosition(peer.cursor, activeTab, peer);
        if (pos) next.push({ peer, ...pos });
      }
      setMarkers(next);
    };
    measure();
    // Reposition on scroll/resize and on a fast tick (pointer updates arrive
    // ~20/s; 80ms keeps the glide chasing without a per-frame loop).
    const interval = setInterval(measure, 80);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [cursorPeers, activeTab]);

  const followed = followingId ? peers.find(p => p.userId === followingId) : undefined;

  return (
    <>
      {markers.length > 0 && (
        <div className="fixed inset-0 z-30 pointer-events-none overflow-hidden" aria-hidden>
          {markers.slice(0, MAX_POINTERS).map(({ peer, left, top, flip }) => (
            <div
              key={peer.userId}
              className="absolute left-0 top-0 will-change-transform transition-transform duration-150 ease-out motion-reduce:transition-none"
              style={{ transform: `translate3d(${left}px, ${top}px, 0)` }}
            >
              <button
                data-testid="presence-cursor"
                onClick={() => follow(peer.userId)}
                title={`${peer.name}${peer.isGuest ? ' (guest)' : ''} — click to follow`}
                className="presence-pointer-in pointer-events-auto relative block w-4 h-5 cursor-pointer motion-reduce:animate-none"
              >
                <svg viewBox="0 0 15 19" className="absolute left-0 top-0 w-[15px] h-[19px] drop-shadow-md" aria-hidden>
                  <path
                    d="M1 1 L14 10 L8 11.4 L5 17.5 Z"
                    fill={avatarColor(peer.userId)}
                    stroke="white"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span
                  className={`absolute top-4 whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-semibold text-white shadow-md ${flip ? 'right-3' : 'left-2.5'}`}
                  style={{ background: avatarColor(peer.userId) }}
                >
                  {shortNameOf(peer.name)}{peer.isGuest ? ' · guest' : ''}
                </span>
              </button>
            </div>
          ))}
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
