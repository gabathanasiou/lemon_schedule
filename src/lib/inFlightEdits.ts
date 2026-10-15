// In-flight edit registry (roadmap 250/251).
//
// Surfaces that hold UNCOMMITTED text register a checker here: the manager
// pages' focused field, the Report Designer's pending design text. Committed
// edits bump the store's change counter, but text still being typed has not
// been dispatched yet — so without this registry the S3.5 clean check
// (`applyPeerSave`, provider.tsx) reads the client as clean and AUTO-APPLIES a
// peer's save (whole-blob LOAD), silently dropping the un-committed text.
// `hasInFlightEdits()` makes the client count as dirty: the peer change
// surfaces as "Changes available · Reload" instead.
//
// A Set, not a single slot: pop-out windows can mount a second manager /
// designer alongside the main one.

type InFlightChecker = () => boolean;

const _checkers = new Set<InFlightChecker>();

/** Register a checker; call the returned unsubscribe on unmount. */
export function registerInFlightEdits(checker: InFlightChecker): () => void {
  _checkers.add(checker);
  return () => { _checkers.delete(checker); };
}

export function hasInFlightEdits(): boolean {
  for (const check of _checkers) {
    try {
      if (check()) return true;
    } catch {
      // A checker must never take the save pipeline down with it.
    }
  }
  return false;
}
