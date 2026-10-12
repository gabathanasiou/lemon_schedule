import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { usePresenceActions, usePresenceState } from '../lib/supabase/presenceContext';
import type { PresenceAnchor, PresencePeer } from '../lib/supabase/presence';
import { avatarColor, shortNameOf } from '../lib/avatarIdentity';

/**
 * Live cursors + the follow pill (roadmap 229 S3, docs/COLLABORATION.md §9).
 *
 * Canva-style pointers with a name label, resolved SEMANTICALLY: the message
 * carries a stable anchor (row id, calendar date, Day Manager section) plus the
 * pointer's position within that element (fx/fy ∈ 0..1). Raw pixels are never
 * sent — they'd land in the wrong place under a different scroll, reorder or
 * window size. The look is a gliding pointer; the coordinate is durable.
 *
 * Glide (canvas) and script-body cursors are flagged for later
 * (docs/COLLABORATION.md §9): no anchor element ⇒ no pointer.
 *
 * The layer is fixed-position and pointer-events-none; each pointer is
 * clickable to follow that person. The "Following X" pill exits on click, Esc,
 * or any manual navigation (App handles that one).
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
  }
}

function markerPosition(
  anchor: PresenceAnchor,
  activeTab: string | undefined,
  peer: PresencePeer,
): { left: number; top: number; flip: boolean } | null {
  if (anchor.kind === 'screen') {
    // Viewport-relative fallback: only meaningful while the peer is on the
    // SAME tab (otherwise their pixel would float over unrelated content).
    if (!activeTab || peer.view?.tab !== activeTab) return null;
    return {
      left: Math.min(Math.max(anchor.xr * window.innerWidth, 0), window.innerWidth - 4),
      top: Math.min(Math.max(anchor.yr * window.innerHeight, 0), window.innerHeight - 4),
      flip: anchor.xr > 0.65,
    };
  }
  const el = anchorElement(anchor);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  const x = r.left + anchor.fx * r.width;
  const y = r.top + anchor.fy * r.height;
  return {
    left: Math.min(Math.max(x, r.left), r.right - 2),
    top: Math.min(Math.max(y, r.top), r.bottom - 2),
    flip: anchor.fx > 0.65,
  };
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
    // Reposition on scroll/resize and on a fast tick (layout shifts from
    // reorders/collapses); the layer only runs while someone has a cursor.
    const interval = setInterval(measure, 120);
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
            <button
              key={peer.userId}
              data-testid="presence-cursor"
              onClick={() => follow(peer.userId)}
              title={`${peer.name}${peer.isGuest ? ' (guest)' : ''} — click to follow`}
              className="pointer-events-auto absolute block w-4 h-5 cursor-pointer"
              style={{ left, top }}
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
          ))}
        </div>
      )}

      {followed && (
        <button
          data-testid="following-pill"
          onClick={stopFollowing}
          title="Stop following (Esc, or navigate anywhere)"
          className="fixed top-12 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-sky-500/60 bg-zinc-900/95 px-3 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm cursor-pointer hover:bg-zinc-800"
        >
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          Following {followed.name}
          <X className="w-3 h-3 text-zinc-400" />
        </button>
      )}
    </>
  );
}
