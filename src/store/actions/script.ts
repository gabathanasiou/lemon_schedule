import { Project } from '../../types';
import { snapshotSceneFields } from '../../lib/script';
import type { Action, State } from '../reducer';

export type ApplyChange = (p: Project) => State;

/** Import commits the retained screenplay body (roadmap 123 Phase 0): the new
 *  body becomes current, the previous current becomes the baseline (item 38's
 *  conflict reference). `baseline` overrides when the caller already knows it.
 *  The scene-field snapshot is captured from the just-updated scenes, so the
 *  NEXT update can tell an in-app edit from the writer's new value.
 *
 *  Tags are POSITIONALLY anchored to the old body, so replacing the body drops
 *  them — the import then re-seeds recognised spans (roadmap 132 Part B).
 *  Part F will remap/reconcile annotations through the import instead. */
export function caseSetScriptDocument(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SET_SCRIPT_DOCUMENT') return state;
  const previous = state.present.scriptDocument;
  return applyChange({
    ...state.present,
    scriptDocument: action.payload.document,
    scriptBaseline: action.payload.baseline ?? previous ?? action.payload.document,
    scriptBaselineFields: snapshotSceneFields(state.present.scenes),
    scriptAnnotations: [],
  });
}

/** In-place body update (Phase 2 annotations) — the baseline is NOT rotated. */
export function caseUpdateScriptDocument(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_SCRIPT_DOCUMENT') return state;
  return applyChange({
    ...state.present,
    scriptDocument: action.payload.document,
  });
}

/** Identity-anchored screenplay tags (roadmap 123 Phase 2 / 132 Part B). Every
 *  annotation write goes through these so the item-97 agent API reaches them by
 *  construction — never mutate `scriptAnnotations` out of band. */
export function caseAddScriptAnnotation(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_SCRIPT_ANNOTATION') return state;
  return applyChange({
    ...state.present,
    scriptAnnotations: [...(state.present.scriptAnnotations || []), action.payload.annotation],
  });
}

export function caseUpdateScriptAnnotation(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_SCRIPT_ANNOTATION') return state;
  const { id, updates } = action.payload;
  return applyChange({
    ...state.present,
    scriptAnnotations: (state.present.scriptAnnotations || []).map(a => (a.id === id ? { ...a, ...updates } : a)),
  });
}

export function caseRemoveScriptAnnotation(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'REMOVE_SCRIPT_ANNOTATION') return state;
  const id = action.payload;
  return applyChange({
    ...state.present,
    scriptAnnotations: (state.present.scriptAnnotations || []).filter(a => a.id !== id),
  });
}
