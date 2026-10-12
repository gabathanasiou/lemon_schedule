import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { AccountAvatar } from './AccountAvatar';
import { usePresenceActions, usePresenceState } from '../lib/supabase/presenceContext';
import type { PresenceAnchor, PresencePeer } from '../lib/supabase/presence';
import type { SupabaseAccount } from '../lib/supabase/auth';

/**
 * Live cursors + the follow pill (roadmap 229 S3, docs/COLLABORATION.md §9).
 *
 * Cursors are SEMANTIC anchors — a row id, a calendar date, a Day Manager
 * section — resolved to a DOM rect on every measure pass, so they survive
 * scroll, reorder and zoom. Glide (canvas) and script-body cursors are flagged
 * for later (docs/COLLABORATION.md §9): no anchor element ⇒ no marker.
 *
 * The layer is fixed-position and pointer-events-none; each marker is a small
 * initials chip (reusing AccountAvatar's deterministic color) that follows the
 * peer on click. The "Following X" pill exits on click, Esc, or any manual
 * navigation (App handles that one).
 */

const CHIP = 20;
const OVERFLOW_CHIPS = 6;

interface MarkerPosition {
  peer: PresencePeer;
  left: number;
  top: number;
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

function markerPosition(anchor: PresenceAnchor): { left: number; top: number } | null {
  const el = anchorElement(anchor);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  switch (anchor.kind) {
    case 'row':
      // Row anchor: mid-right inside the row (the row survives reorder).
      return { left: r.right - CHIP - 6, top: r.top + r.height / 2 - CHIP / 2 };
    case 'date':
      // Calendar cell: top-right corner.
      return { left: r.right - CHIP - 6, top: r.top + 6 };
    case 'day':
      // Day Manager section card: top-right corner.
      return { left: r.right - CHIP - 10, top: r.top + 10 };
  }
}

function peerAccount(peer: PresencePeer): SupabaseAccount {
  return { id: peer.userId, email: null, name: peer.name, avatarUrl: peer.avatarUrl, isAnonymous: peer.isGuest };
}

export function PresenceOverlay() {
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
      const next: MarkerPosition[] = [];
      for (const peer of cursorPeers) {
        if (!peer.cursor) continue;
        const pos = markerPosition(peer.cursor);
        if (pos) next.push({ peer, left: pos.left, top: pos.top });
      }
      setMarkers(next);
    };
    measure();
    // Reposition on scroll/resize and on a slow tick (layout shifts from
    // reorders/collapses); the layer only exists while someone has a cursor.
    const interval = setInterval(measure, 200);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [cursorPeers]);

  const followed = followingId ? peers.find(p => p.userId === followingId) : undefined;

  return (
    <>
      {markers.length > 0 && (
        <div className="fixed inset-0 z-30 pointer-events-none overflow-hidden" aria-hidden>
          {markers.slice(0, OVERFLOW_CHIPS).map(({ peer, left, top }) => (
            <button
              key={peer.userId}
              data-testid="presence-cursor"
              onClick={() => follow(peer.userId)}
              title={`${peer.name}${peer.isGuest ? ' (guest)' : ''} — click to follow`}
              className={`pointer-events-auto absolute w-5 h-5 rounded-full overflow-hidden shadow-md ring-1 transition-transform hover:scale-125 cursor-pointer ${followingId === peer.userId ? 'ring-2 ring-sky-400' : 'ring-white/70'}`}
              style={{ left, top }}
            >
              <AccountAvatar account={peerAccount(peer)} className="w-full h-full" />
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
