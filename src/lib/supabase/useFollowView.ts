import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { AppPlace } from '../appNav';
import { followPlaceMatches, type PresenceView } from './presence';
import { usePresenceActions } from './presenceContext';

/**
 * Follow-view registration (roadmap 229 S3 follow completeness + roadmap 243)
 * — the ONE declarative seam every follow surface uses. A surface states WHAT
 * it shows and HOW a peer's version is applied:
 *
 *   const follow = useFollowView({
 *     place: { tab: 'breakdown', sub: 'elements' },
 *     fields: [{ key: 'managerCategory', value: category }],
 *     apply: (view) => { ...guarded, through the surface's own setter... },
 *   });
 *
 * Adding a future toggle/viewport to follow = one more entry in `fields` (+
 * its read in `apply`) — never new publish/applier plumbing. The hook:
 *   - publishes the place + every defined field whenever a value changes
 *     (and on mount unless `publishOnMount: false` — pref surfaces keep the
 *     shipped "mount values are not re-broadcast" behaviour);
 *   - registers the applier that fires only for views on this place, and (via
 *     the provider) also immediately for surfaces that MOUNT mid-follow;
 *   - exposes `noteUserChange()` — call it from user-click paths that change
 *     this surface's view: it ends follow (S3 rule, parity with the Sheet
 *     arrows). Appliers must NEVER call it — a mirrored change is not a click.
 *
 * App-side navigation (`go`), scrolling (`usePresenceScrollSurface`) and the
 * wire shape/parse (`presence.ts`) stay separate concerns.
 */
export interface FollowViewField {
  /** The `PresenceView` wire key (validated by `parseView` on receipt). */
  key: string;
  /** Current local value; undefined / null / '' are not published. */
  value: unknown;
}

export interface FollowViewOptions {
  /** The surface's own place — appliers fire only for views on it. An
   *  omitted `sub`/`mode` is not checked (schedule has neither). */
  place: Pick<AppPlace, 'tab' | 'sub' | 'mode'>;
  /** The lens fields this surface publishes (values read every render). */
  fields: FollowViewField[];
  /** Apply a peer's view while following — read fields with own guards. */
  apply?: (view: PresenceView) => void;
  /** Publishes + applies only while true (host owns the view otherwise). */
  enabled?: boolean;
  /** false = do not publish the mount's current values (pref surfaces). */
  publishOnMount?: boolean;
}

export function useFollowView(opts: FollowViewOptions): { noteUserChange: () => void } {
  const actions = usePresenceActions();
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const enabled = opts.enabled !== false;
  const publishOnMount = opts.publishOnMount !== false;
  // Values + place are read through the ref; their KEYS drive the effects.
  const fieldsKey = JSON.stringify(opts.fields);
  const placeKey = JSON.stringify(opts.place);
  const publishedRef = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    if (!publishOnMount && !publishedRef.current) {
      publishedRef.current = true;
      return;
    }
    publishedRef.current = true;
    const { place, fields } = optsRef.current;
    const payload: PresenceView = {
      tab: place.tab,
      ...(place.sub ? { sub: place.sub } : {}),
      ...(place.mode ? { mode: place.mode } : {}),
    };
    for (const f of fields) {
      if (f.value === undefined || f.value === null || f.value === '') continue;
      (payload as unknown as Record<string, unknown>)[f.key] = f.value;
    }
    actions.publishView(payload);
  }, [actions, enabled, publishOnMount, fieldsKey, placeKey]);
  useEffect(() => {
    if (!enabled) return;
    if (!optsRef.current.apply) return;
    return actions.registerFollowApplier((view) => {
      if (!followPlaceMatches(view, optsRef.current.place)) return;
      optsRef.current.apply?.(view);
    });
  }, [actions, enabled, placeKey]);
  const noteUserChange = useCallback(() => actions.noteUserViewChange(), [actions]);
  return useMemo(() => ({ noteUserChange }), [noteUserChange]);
}
