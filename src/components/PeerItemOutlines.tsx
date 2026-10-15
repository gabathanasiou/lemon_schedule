import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePresenceActions, usePresenceSelections } from '../lib/supabase/presenceContext';
import { isItemSelection } from '../lib/supabase/presence';
import {
  itemSelectionOf,
  outlineRectSignature,
  PRESENCE_SURFACE_ATTR,
  topVisibleElementAt,
  type ItemResolver,
  type PeerOutlineRect,
} from '../lib/itemSelection';
import { avatarColor } from '../lib/avatarIdentity';
import { useCurrentWindow } from '../lib/popoutTarget';
import { cssEscape } from '../lib/utils';

/**
 * Peer selection highlights on DOM surfaces (roadmap 234 stage 2) — the
 * element half of the shared `selection` protocol (the canvas grids draw
 * theirs through `useGlidePeerSelection`).
 *
 * ONE mount per surface does both halves:
 * - it PUBLISHES this client's selection as a set of OPAQUE item ids on
 *   `scope` (throttled/idle-skipped in the channel; clear edges on deselect,
 *   blur, a hidden document and unmount, owner-gated in the provider so a
 *   second window can never wipe the first window's live selection);
 * - it RESOLVES the peers' ids for the SAME scope into element rects on THIS
 *   instance and paints them in the peer's colour (the same layer recipe as
 *   the pointers/drag ghosts: `fixed`, z-30 — below modals — and
 *   `pointer-events-none`, so it can never block an interaction).
 *
 * Ids resolve inside the root wearing `data-presence-surface="<scope>"` in
 * THIS window's document (pop-outs resolve with their own geometry), so the
 * scope string is the visibility gate — parity with the grids' `scope` rule.
 * A rect that is scrolled out of its container or covered by sticky chrome is
 * HIDDEN, not faked (the centre hit test — parity with the pointer rule);
 * presence chrome (peer markers, drag ghosts, these rings) is exempt, so the
 * peer's own pointer never hides the ring of what they just selected. The
 * `resolve` vocabulary is the surface's own: `itemsByAttribute('data-row-id')`
 * for the stripboard/calendar cards, a composite id for the Report Designer's
 * selected table column, etc.
 *
 * Dedicated to the surface only — never for a surface nobody else can see: the
 * item ids are DOM ids (stable across clients), never pixel geometry.
 */

/** How often the measured rects refresh while a peer selection is up: scroll
 *  and resize measure immediately; this catches pure reflows (a reorder, a
 *  collapsed panel, a font load) at a cost too small to matter. */
const OUTLINE_MEASURE_MS = 250;

export function PeerItemOutlines({
  scope,
  items,
  resolve,
}: {
  /** Stable logical-surface id — the surface root wears it as
   *  `data-presence-surface`; a peer's ids only paint on the same scope. */
  scope: string;
  /** This client's selected item ids (the publish half). */
  items: string[];
  /** Surface vocabulary: one id → its elements (`itemsByAttribute(…)`, or a
   *  composite resolver for surfaces whose items are more than one element). */
  resolve: ItemResolver;
}) {
  const actions = usePresenceActions();
  const peers = usePresenceSelections();
  const win = useCurrentWindow();
  // One stable identity per mount for the provider's owner check.
  const ownerRef = useRef<object>({});
  const [rects, setRects] = useState<PeerOutlineRect[]>([]);

  // Content-keyed: callers pass fresh arrays, identical content never
  // republishes nor re-measures.
  const itemsKey = items.join('\u0001');
  const selection = useMemo(
    () => itemSelectionOf(scope, items),
    [scope, itemsKey], // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content
  );
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const publish = useCallback(() => {
    actions.publishSelection(ownerRef.current, selectionRef.current);
  }, [actions]);

  // Publish on every selection change (the channel idle-skips repeats).
  useEffect(() => {
    publish();
  }, [publish, selection]);

  // Clear while the owning window is away (blur/window switch hides the
  // selection; returning republishes it), and on unmount — parity with the
  // grid hook.
  useEffect(() => {
    if (!win) return;
    const doc = win.document;
    const owner = ownerRef.current;
    const clear = () => actions.releaseSelection(owner);
    const onVisibility = () => {
      if (doc.hidden) clear();
      else publish();
    };
    win.addEventListener('blur', clear);
    doc.addEventListener('visibilitychange', onVisibility);
    return () => {
      win.removeEventListener('blur', clear);
      doc.removeEventListener('visibilitychange', onVisibility);
    };
  }, [win, publish, actions]);

  useEffect(() => {
    const owner = ownerRef.current;
    return () => actions.releaseSelection(owner);
  }, [scope, actions]);

  // Peers selecting on THIS scope only (item selections — the grid rectangles
  // belong to the Glide hook).
  const mine = useMemo(
    () => peers.filter(p => isItemSelection(p.selection) && p.selection.scope === scope),
    [peers, scope],
  );

  useEffect(() => {
    if (mine.length === 0) {
      setRects(prev => (prev.length > 0 ? [] : prev));
      return;
    }
    if (!win) return;
    const doc = win.document;
    const root = doc.querySelector(`[${PRESENCE_SURFACE_ATTR}="${cssEscape(scope)}"]`) ?? doc;
    const measure = () => {
      const next: PeerOutlineRect[] = [];
      for (const peer of mine) {
        if (!isItemSelection(peer.selection)) continue;
        for (const id of peer.selection.items) {
          for (const el of resolve(id, root)) {
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            // Visibility: the topmost element at the centre that is NOT
            // presence chrome must be the item. Scrolled out of its container
            // or under sticky chrome/menus → hidden, never faked (parity with
            // the pointer rule). Presence chrome — the peer's pointer marker
            // sits exactly on what they just clicked — never hides a ring.
            const top = topVisibleElementAt(doc, r.left + r.width / 2, r.top + r.height / 2);
            if (!top || (top !== el && !el.contains(top))) continue;
            next.push({ userId: peer.userId, item: id, left: r.left, top: r.top, width: r.width, height: r.height });
          }
        }
      }
      const sig = outlineRectSignature(next);
      setRects(prev => (outlineRectSignature(prev) === sig ? prev : next));
    };
    measure();
    const interval = setInterval(measure, OUTLINE_MEASURE_MS);
    win.addEventListener('scroll', measure, true);
    win.addEventListener('resize', measure);
    return () => {
      clearInterval(interval);
      win.removeEventListener('scroll', measure, true);
      win.removeEventListener('resize', measure);
    };
  }, [mine, resolve, scope, win]);

  if (rects.length === 0) return null;
  return (
    <div className="fixed inset-0 z-30 pointer-events-none overflow-hidden" data-presence-chrome aria-hidden>
      {rects.map(r => (
        <div
          key={`${r.userId}:${r.item}:${Math.round(r.left)},${Math.round(r.top)}`}
          data-testid="peer-selection-outline"
          data-peer={r.userId}
          data-item={r.item}
          className="absolute"
          style={{
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            boxShadow: `inset 0 0 0 2px ${avatarColor(r.userId)}`,
          }}
        />
      ))}
    </div>
  );
}
