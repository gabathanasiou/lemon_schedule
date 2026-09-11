import { Project } from '../../types';
import type { Action, State } from '../reducer';

export type ApplyChange = (p: Project) => State;

/** Import commits the retained screenplay body (roadmap 123 Phase 0): the new
 *  body becomes current, the previous current becomes the baseline (item 38's
 *  conflict reference). `baseline` overrides when the caller already knows it. */
export function caseSetScriptDocument(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SET_SCRIPT_DOCUMENT') return state;
  const previous = state.present.scriptDocument;
  return applyChange({
    ...state.present,
    scriptDocument: action.payload.document,
    scriptBaseline: action.payload.baseline ?? previous ?? action.payload.document,
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
