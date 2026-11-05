import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { GridSelection, Rectangle } from '@glideapps/glide-data-grid';
import { usePresenceActions, usePresenceSelections } from './supabase/presenceContext';
import { useCurrentWindow } from './popoutTarget';
import { avatarColor } from './avatarIdentity';
import { effectiveGridRange, resolveSelectionRange, selectionRangeToWire } from './glideSelection';
import { isItemSelection, selectionKey } from './supabase/presence';

/**
 * Peer selection highlights on ONE Glide grid instance (roadmap 234).
 *
 * Every instance participates on its own: the hook PUBLISHES this grid's
 * selection (keyed by `scope`, throttled/idle-skipped in the channel) and
 * RESOLVES the peers' selections for the same scope into cell ranges for
 * `GlidePeerSelectionTags` (peer-colour border + name tag). Because both
 * halves are per-instance and use the instance's own geometry, the highlight
 * works in every mounted instance — the main window, a pop-out window, a
 * portalled canvas — with that client's own scroll, column widths and font
 * scale.
 *
 * Lifecycle rules (docs/PRESENCE.md): ephemeral only; a cleared
 * selection, a blurred/hidden window and unmounting the grid all publish the
 * clear EDGE. Only the instance that last held a non-empty selection may
 * clear (the provider's owner check), so closing one window never wipes the
 * selection another window is still holding.
 *
 * `scope` is the stable id of the LOGICAL grid shared across clients
 * (`breakdown-glide`, `crew-glide`, `day:3:times:cast` — never per-instance).
 * Pass `undefined` for a grid that must not participate (e.g. a modal-owned
 * template editor). The colour is the peer's deterministic avatar colour, so
 * the highlight, the pointer and the header bubble always agree.
 */

/** One peer's selected cell range, resolved in THIS grid's coordinates. */
export interface GlidePeerSelectionRange {
  userId: string;
  name: string;
  /** Opaque avatar colour — the border and the name tag share it. */
  color: string;
  range: Rectangle;
  /** The peer has a cell editor open — the border thickens and their live
   *  pointer is hidden (docs/PRESENCE.md). */
  editing: boolean;
}

export function useGlidePeerSelection(opts: {
  /** Stable logical-surface id; falsy = this instance stays out of presence. */
  scope?: string | null;
  /** The grid's own selection state (what `onGridSelectionChange` sets). */
  selection: GridSelection;
  /** Row keys in grid order (stable across clients). */
  rowKeys: string[];
  /** Column keys in grid order. */
  colKeys: string[];
  /** This grid has a cell editor open right now. */
  editing?: boolean;
}): GlidePeerSelectionRange[] {
  const { scope, selection, rowKeys, colKeys, editing = false } = opts;
  const actions = usePresenceActions();
  const peers = usePresenceSelections();
  // One stable identity per hook instance for the provider's owner check.
  const ownerRef = useRef<object>({});
  const win = useCurrentWindow();

  // The publish path reads the freshest geometry through a ref so the
  // effect deps stay (selection, keys) — never a stale closure.
  const latestRef = useRef({ selection, rowKeys, colKeys, editing });
  latestRef.current = { selection, rowKeys, colKeys, editing };

  const publish = useCallback(() => {
    if (!scope) return;
    const latest = latestRef.current;
    const range = effectiveGridRange(latest.selection, latest.rowKeys.length, latest.colKeys.length);
    actions.publishSelection(
      ownerRef.current,
      range ? selectionRangeToWire(scope, range, latest.rowKeys, latest.colKeys, latest.editing) : null,
    );
  }, [actions, scope]);

  // Publish on every selection change (the channel idle-skips repeats).
  useEffect(() => {
    publish();
  }, [publish, selection, rowKeys, colKeys, editing]);

  // Clear while the owning window is away (user decision: blur/window switch
  // hides the selection; returning republishes it), and on grid unmount.
  useEffect(() => {
    if (!scope || !win) return;
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
  }, [scope, win, publish, actions]);

  useEffect(() => {
    if (!scope) return;
    const owner = ownerRef.current;
    return () => actions.releaseSelection(owner);
  }, [scope, actions]);

  // Signature of the peers selecting on THIS scope only — the highlight array
  // keeps its identity (no needless canvas redraw) when another grid's
  // selection changed. Item selections (DOM surfaces, stage 2) are skipped.
  const signature = useMemo(() => {
    if (!scope) return '';
    return peers
      .filter(p => p.selection.scope === scope && !isItemSelection(p.selection))
      .map(p => `${p.userId}§${p.name}§${selectionKey(p.selection)}`)
      .sort()
      .join('|');
  }, [peers, scope]);

  const peersRef = useRef(peers);
  peersRef.current = peers;

  return useMemo<GlidePeerSelectionRange[]>(() => {
    if (!scope || !signature) return [];
    const out: GlidePeerSelectionRange[] = [];
    for (const p of peersRef.current) {
      if (p.selection.scope !== scope || isItemSelection(p.selection)) continue;
      const range = resolveSelectionRange(p.selection, rowKeys, colKeys);
      if (!range) continue;
      out.push({
        userId: p.userId,
        name: p.name,
        color: avatarColor(p.userId),
        range,
        editing: p.selection.editing === true,
      });
    }
    return out;
  }, [scope, signature, rowKeys, colKeys]);
}
