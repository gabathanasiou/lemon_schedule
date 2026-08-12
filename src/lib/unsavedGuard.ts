import { useSyncExternalStore } from 'react';

/**
 * Unsaved-changes guard for the Element Manager.
 *
 * The Element Manager holds unsaved edits in local state, so it registers a
 * guard here (module-level — one instance renders at a time). Tab switches
 * that would unmount it go through `requestUnsavedSave`, which prompts BEFORE
 * the switch so the save (and any merge-confirmation modal it opens) runs
 * while the component is still mounted. The unmount cleanup prompt remains as
 * a fallback for paths that bypass the guard (e.g. closing a popout window).
 *
 * The guard also routes the global undo/redo affordances (header buttons,
 * Cmd+Z) through the element manager's LOCAL edit history when it has one —
 * unsaved edits are undoable without committing, using the same top buttons.
 */

export interface UnsavedGuardEntry {
  hasUnsavedChanges: () => boolean;
  /** Performs the save; may open a confirmation modal (see hasPendingConfirmation). */
  save: () => void;
  /** True when the last save opened a modal that still needs user action. */
  hasPendingConfirmation: () => boolean;
  hasLocalUndo: () => boolean;
  hasLocalRedo: () => boolean;
  /** Pops the local edit history. Returns true when it did something. */
  undoLocal: () => boolean;
  /** Re-applies a local undo. Returns true when it did something. */
  redoLocal: () => boolean;
}

let _entry: UnsavedGuardEntry | null = null;
let _promptHandled = false;
let _pendingTab: (() => void) | null = null;

let _snapshot = { hasUnsavedChanges: false, hasLocalUndo: false, hasLocalRedo: false };
const _listeners = new Set<() => void>();

function emit(): void {
  _snapshot = {
    hasUnsavedChanges: !!_entry?.hasUnsavedChanges(),
    hasLocalUndo: !!_entry?.hasLocalUndo(),
    hasLocalRedo: !!_entry?.hasLocalRedo(),
  };
  for (const l of _listeners) l();
}

export function registerUnsavedGuard(entry: UnsavedGuardEntry | null): void {
  _entry = entry;
  // A new registration means a fresh mount: reset the handled flag. An
  // unregister (null) must NOT reset it — the unmount fallback checks it.
  if (entry) _promptHandled = false;
  emit();
}

/** Call when the entry's getters may have changed (e.g. local history pushed). */
export function notifyGuardChanged(): void {
  emit();
}

export function getUnsavedGuard(): UnsavedGuardEntry | null {
  return _entry;
}

export interface UnsavedGuardState {
  hasUnsavedChanges: boolean;
  hasLocalUndo: boolean;
  hasLocalRedo: boolean;
}

/** Reactive snapshot of the guard for button enablement (header undo/redo). */
export function useUnsavedGuardState(): UnsavedGuardState {
  return useSyncExternalStore(
    l => { _listeners.add(l); return () => { _listeners.delete(l); }; },
    () => _snapshot,
  );
}

/** Routes the global undo affordance to the element manager's local history first. */
export function performLocalUndo(): boolean {
  return _entry?.undoLocal() ?? false;
}

/** Routes the global redo affordance to the element manager's local history first. */
export function performLocalRedo(): boolean {
  return _entry?.redoLocal() ?? false;
}

/** Marks the pre-switch prompt as handled so the unmount fallback stays quiet. */
export function markUnsavedPromptHandled(): void {
  _promptHandled = true;
}

export function wasUnsavedPromptHandled(): boolean {
  return _promptHandled;
}

/** Follow-through action to run once a pending save/merge completes. */
export function setPendingTab(fn: (() => void) | null): void {
  _pendingTab = fn;
}

export function consumePendingTab(): (() => void) | null {
  const fn = _pendingTab;
  _pendingTab = null;
  return fn;
}

interface ConfirmLike {
  confirm: (opts: { title: string; message?: string }) => Promise<boolean>;
}

/**
 * Guarded tab switch: if the element manager has unsaved changes, ask BEFORE
 * switching. On confirm, save in place (the merge modal can still appear) and
 * run `onSaved` once the save flow settles — immediately, or after the merge
 * modal is resolved via `consumePendingTab()`. On cancel, run `onSaved`
 * without saving (discard). When there is nothing to guard, `onSaved` runs
 * immediately. Returns true when the guard intervened (prompt shown).
 */
export async function requestUnsavedSave(dialog: ConfirmLike, onSaved: () => void): Promise<boolean> {
  const guard = getUnsavedGuard();
  if (!guard || !guard.hasUnsavedChanges()) {
    onSaved();
    return false;
  }
  setPendingTab(null);
  const ok = await dialog.confirm({ title: 'Unsaved Changes', message: 'You have unsaved changes. Save before leaving?' });
  markUnsavedPromptHandled();
  if (getUnsavedGuard() !== guard) {
    onSaved();
    return true;
  }
  if (!ok) {
    onSaved();
    return true;
  }
  guard.save();
  if (guard.hasPendingConfirmation()) {
    setPendingTab(onSaved);
  } else {
    onSaved();
  }
  return true;
}
