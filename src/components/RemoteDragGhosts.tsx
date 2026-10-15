import React, { useEffect, useRef, useState } from 'react';
import { usePresenceDrags, usePresenceState } from '../lib/supabase/presenceContext';
import type { DragSurface, PresencePeerDrag } from '../lib/supabase/presence';
import { resolveAnchorPoint } from '../lib/presencePoint';
import { glideStep, type GlidePoint } from '../lib/glideMotion';
import { usePopoutWindow } from '../lib/popoutTarget';

/**
 * A peer's live drag, rendered in my window (roadmap 235): a translucent ghost
 * of the held item(s) at the peer's cursor. It NEVER blocks — the soft lock
 * (`useHeldItems`) is what refuses the other user's drag/menu/delete, and the
 * peer's pointer marker already carries their name/colour.
 *
 * Position: the peer's DRAG-flagged cursor frames (the claim itself carries
 * only the item ids), resolved through the shared semantic-anchor geometry and
 * glided with the same motion model as the live pointers. Rendered BELOW
 * modals (z-30, parity with pointers), `pointer-events-none`, main window only
 * (popout instances stay out — parity with the live-pointer rule).
 *
 * One layer per SURFACE: the Schedule tab mounts the rows layer (scaled ~0.5 —
 * an awareness cue, not a preview, so a peer's wide rows don't cover the
 * board), the Calendar tab mounts the card/day layers (full size).
 */
export function RemoteDragGhostLayer({
  surface,
  scale = 1,
  renderContent,
}: {
  /** Which claim surface this layer renders. */
  surface: DragSurface;
  /** Inner-wrapper scale (the rAF loop keeps writing translate on the outer
   *  node, so scaling never fights the glide). */
  scale?: number;
  /** The held items as they render on this surface; may be null when the ids
   *  don't resolve here. */
  renderContent: (drag: PresencePeerDrag) => React.ReactNode;
}) {
  const { peers } = usePresenceState();
  const drags = usePresenceDrags();
  const popout = usePopoutWindow();
  const [ghosts, setGhosts] = useState<PresencePeerDrag[]>([]);
  const targetsRef = useRef(new Map<string, GlidePoint>());
  const smoothRef = useRef(new Map<string, GlidePoint>());
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  /** Ghost SET signature — React re-renders content only on a claim edge;
   *  positions never go through state. */
  const sigRef = useRef('');
  const peersRef = useRef(peers);
  peersRef.current = peers;

  useEffect(() => {
    if (popout) return;
    const measure = () => {
      const byUser = new Map(peersRef.current.map(p => [p.userId, p]));
      const targets = new Map<string, GlidePoint>();
      const next: PresencePeerDrag[] = [];
      for (const drag of drags) {
        if (drag.surface !== surface) continue;
        const peer = byUser.get(drag.userId);
        // The position rides the peer's drag-flagged cursor frames — a claim
        // alone (no position yet) mounts no ghost.
        if (!peer?.cursor || !peer.cursorDrag) continue;
        const point = resolveAnchorPoint(peer.cursor);
        if (!point) continue;
        targets.set(drag.userId, point);
        next.push(drag);
      }
      targetsRef.current = targets;
      for (const id of [...smoothRef.current.keys()]) {
        if (!targets.has(id)) smoothRef.current.delete(id);
      }
      const sig = next.map(d => `${d.userId}:${d.surface}:${d.itemIds.join(',')}`).sort().join('|');
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setGhosts(next);
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
  }, [drags, surface, popout]);

  useEffect(() => {
    if (ghosts.length === 0) return;
    // rAF pauses on its own while the tab is hidden.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      for (const g of ghosts) {
        const node = nodeRefs.current.get(g.userId);
        const target = targetsRef.current.get(g.userId);
        if (!node || !target) continue;
        let cur = smoothRef.current.get(g.userId);
        if (!cur) {
          // First frame of a new ghost: snap to the target, then chase.
          cur = { left: target.left, top: target.top };
          smoothRef.current.set(g.userId, cur);
        } else {
          glideStep(cur, target, dt, reduced);
        }
        node.style.transform = `translate3d(${cur.left}px, ${cur.top}px, 0)`;
        node.style.visibility = 'visible';
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ghosts]);

  if (popout || ghosts.length === 0) return null;
  return (
    <div className="fixed inset-0 z-30 pointer-events-none overflow-hidden" data-presence-chrome aria-hidden>
      {ghosts.map(drag => (
        <div
          key={drag.userId}
          data-testid="peer-drag-ghost"
          data-peer={drag.userId}
          data-surface={drag.surface}
          ref={(el) => {
            if (!el) {
              nodeRefs.current.delete(drag.userId);
              return;
            }
            nodeRefs.current.set(drag.userId, el);
            const c = smoothRef.current.get(drag.userId) ?? targetsRef.current.get(drag.userId);
            // Hidden until the first position lands — a ghost must never flash
            // at the layer's 0,0 corner.
            if (c) {
              el.style.transform = `translate3d(${c.left}px, ${c.top}px, 0)`;
              el.style.visibility = 'visible';
            } else {
              el.style.visibility = 'hidden';
            }
          }}
          className="absolute left-0 top-0 will-change-transform"
        >
          {/* Centered on the cursor: the rAF loop translates the OUTER node,
              this wrapper scales + recenters the content around that point —
              the card hangs under the pointer like a carried item instead of
              being pinned by its top-left corner. */}
          <div
            className="pointer-events-none relative"
            style={{ transform: `scale(${scale}) translate(-50%, -50%)`, transformOrigin: 'top left' }}
          >
            {renderContent(drag)}
          </div>
        </div>
      ))}
    </div>
  );
}
