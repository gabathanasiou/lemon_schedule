import { useCallback, useEffect, useRef, useState } from 'react';
import { useProject } from '../store';
import { useCurrentDocument } from './popoutTarget';
import { registerInFlightEdits } from './inFlightEdits';
import { isTextEditingElement } from './textEditing';

export interface BufferedRow {
  key: string;
}

/** Outcome of a finished field edit (blur / Enter / Tab). */
export interface CommitResult {
  /** `committed` = dispatched now; `pending` = a confirmation owns it (see
   *  `hasPendingConfirmation`); `none` = nothing to commit. */
  status: 'committed' | 'pending' | 'none';
}

export interface RowBufferOptions<T extends BufferedRow> {
  projectId: string;
  /** Current scope key (category / role). */
  scope: string;
  loadRows: (scope: string) => T[];
  makeBlankRow: () => T;
  /** Tab-navigation field order for a scope (e.g. ['id','name'] or ['name','phone','email']). */
  fieldsPerRow: (scope: string) => string[];
  /** Store data this buffer mirrors — when any entry changes identity externally,
   *  committed fields reload (in-flight text and uncommitted new rows survive). */
  reloadDeps: unknown[];
  /** A finished edit: diff against store truth (`loadRows`) and dispatch.
   *  `editedKey` = the local row the edit belongs to (undefined for whole-set
   *  ops like Auto-ID) — the manager scopes merge detection to it. */
  commit: (scope: string, rows: T[], editedKey?: string) => CommitResult;
  /** True while the last commit opened a confirmation still awaiting action. */
  hasPendingConfirmation?: () => boolean;
  /** A new row carries commit-worthy content (its identity is non-empty). Used
   *  to keep/drop uncommitted new rows and to answer the in-flight edit check. */
  hasContent: (row: T) => boolean;
}

export interface RowBufferResult<T extends BufferedRow> {
  rows: T[];
  updateRow: (key: string, field: string, value: string) => void;
  /** Remove a row and commit the removal (the diff decides absorb vs trash). */
  deleteRow: (key: string) => void;
  addNew: () => void;
  /** Mutate rows and commit the result as one unit (e.g. Auto-ID). */
  applyRows: (updater: (rows: T[]) => T[]) => void;
  /** Local view sort — never dispatched (row order is not persisted). */
  sortRows: (compare: (a: T, b: T) => number) => void;
  /** The focused field finished (blur / Enter / Tab): commit it. */
  commitEdit: () => void;
  /** A confirmation finished: drop the local rows the commit resolved. */
  settleCommit: () => void;
  /** A confirmation was cancelled: restore committed field values. */
  revertUncommitted: () => void;
  switchScope: (newScope: string) => void;
  registerInput: (key: string, field: string, el: HTMLInputElement | HTMLTextAreaElement | null) => void;
  focusNext: (key: string, field: string) => boolean;
  /** The field gained focus — records the baseline the in-flight check compares. */
  noteFocus: (key: string, field: string) => void;
}

/**
 * The commit-on-blur editing engine behind the manager pages (Element Manager,
 * Crew Manager, Locations Manager — roadmap 250).
 *
 * Typing stays local; EVERY field commits when it finishes (blur / Enter / Tab /
 * clicking away), through the manager's one `commit()` (diff vs store truth +
 * dispatch). There is no Save button, no local undo history and no
 * unsaved-changes prompt — Cmd+Z is the store/room undo at per-commit
 * granularity, exactly like every other editing surface (`CellInput`, SceneSheet,
 * the Glide grids).
 *
 * The buffer still owns: stable row keys + input registry + Tab order, blank
 * new rows (never dispatched until they carry content), the local view sort,
 * and the reload reconciliation (committed fields follow the store; the focused
 * field's in-flight text and uncommitted new rows survive external changes).
 * While a field holds un-committed text the manager counts as "in flight" for
 * the S3.5 peer-save check (`inFlightEdits`).
 */
export function useRowBuffer<T extends BufferedRow>(opts: RowBufferOptions<T>): RowBufferResult<T> {
  const { projectId, scope, loadRows, makeBlankRow, fieldsPerRow, reloadDeps, hasContent } = opts;
  const { locked } = useProject();
  const currentDocument = useCurrentDocument();

  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const loadRowsRef = useRef(loadRows);
  loadRowsRef.current = loadRows;
  const makeBlankRowRef = useRef(makeBlankRow);
  makeBlankRowRef.current = makeBlankRow;
  const fieldsPerRowRef = useRef(fieldsPerRow);
  fieldsPerRowRef.current = fieldsPerRow;
  const commitRef = useRef(opts.commit);
  commitRef.current = opts.commit;
  const pendingCheckRef = useRef(opts.hasPendingConfirmation);
  pendingCheckRef.current = opts.hasPendingConfirmation;
  const hasContentRef = useRef(hasContent);
  hasContentRef.current = hasContent;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const [rows, setRows] = useState<T[]>(() => loadRows(scope));
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  /** Writes ref + state together so event handlers read fresh rows synchronously. */
  const setRowsNow = useCallback((next: T[]) => {
    rowsRef.current = next;
    setRows(next);
  }, []);

  /** Keys of rows that exist ONLY locally (added but never committed). */
  const newKeysRef = useRef<Set<string>>(new Set());
  /** Remembered view sort — re-applied on every reload. */
  const sortRef = useRef<((a: T, b: T) => number) | null>(null);
  const inputsRef = useRef<Map<string, HTMLElement>>(new Map());
  /** Coalescing timer for programmatic (non-typing) field updates. */
  const timerRef = useRef<number | null>(null);
  /** Focused field + the value it had on focus (the only un-committed edit is
   *  the focused field's text — everything else commits on blur). */
  const focusRef = useRef<{ key: string; field: string; baseline: string } | null>(null);
  /** The local row the pending commit belongs to (see `commit`). */
  const editedKeyRef = useRef<string | undefined>(undefined);

  const hasPending = useCallback(() => pendingCheckRef.current?.() ?? false, []);

  /** Load the store's rows for `scopeKey`, apply the view sort, adopt state. */
  const loadScope = useCallback((scopeKey: string) => {
    const fresh = loadRowsRef.current(scopeKey);
    const cmp = sortRef.current;
    setRowsNow(cmp ? [...fresh].sort(cmp) : fresh);
  }, [setRowsNow]);

  /** After a successful commit: drop local-only rows the commit handed to the
   *  store (added / merge-absorbed). Blank rows stay. */
  const dropResolvedRows = useCallback(() => {
    const storeKeys = new Set(loadRowsRef.current(scopeRef.current).map(r => r.key));
    let dropped = false;
    const keep: T[] = [];
    for (const r of rowsRef.current) {
      if (newKeysRef.current.has(r.key) && !storeKeys.has(r.key) && hasContentRef.current(r)) {
        newKeysRef.current.delete(r.key);
        dropped = true;
        continue;
      }
      keep.push(r);
    }
    if (dropped) setRowsNow(keep);
  }, [setRowsNow]);

  /** Cancel a pending programmatic-commit tick (window-aware: pop-outs have
   *  their own timer id space). */
  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      currentDocument.defaultView?.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [currentDocument]);
  /** Commit the current buffer (one finished field edit, a delete, Auto-ID). */
  const commitNow = useCallback((): CommitResult => {
    clearTimer();
    if (lockedRef.current || hasPending()) return { status: 'none' };
    const result = commitRef.current(scopeRef.current, rowsRef.current, editedKeyRef.current);
    if (result.status === 'committed') dropResolvedRows();
    return result;
  }, [clearTimer, dropResolvedRows, hasPending]);

  /** Kick a commit on the next tick — coalesces a burst of programmatic field
   *  updates (an address modal sets name/lat/lng/place/address in one go) into
   *  ONE commit / one undo entry. */
  const scheduleCommit = useCallback(() => {
    const win = currentDocument.defaultView;
    if (!win) return;
    clearTimer();
    timerRef.current = win.setTimeout(() => { timerRef.current = null; commitNow(); }, 0);
  }, [clearTimer, commitNow, currentDocument]);

  const commitEdit = useCallback(() => {
    editedKeyRef.current = focusRef.current?.key;
    focusRef.current = null;
    commitNow();
  }, [commitNow]);

  const updateRow = useCallback((key: string, field: string, value: string) => {
    editedKeyRef.current = key;
    setRowsNow(rowsRef.current.map(r => (r.key === key ? { ...r, [field]: value } : r)));
    // Typing in the cell's own input stays local until it finishes (blur);
    // anything else — a dropdown pick, the address modal, a paste button —
    // commits on the next tick (coalesced: one commit per update burst).
    const el = currentDocument.activeElement;
    const ownInput = inputsRef.current.get(`${key}-${field}`);
    if (!(ownInput === el && isTextEditingElement(el))) scheduleCommit();
  }, [currentDocument, scheduleCommit, setRowsNow]);

  const deleteRow = useCallback((key: string) => {
    if (lockedRef.current || hasPending()) return;
    editedKeyRef.current = key;
    newKeysRef.current.delete(key);
    setRowsNow(rowsRef.current.filter(r => r.key !== key));
    commitNow();
  }, [commitNow, hasPending, setRowsNow]);

  const addNew = useCallback(() => {
    if (lockedRef.current || hasPending()) return;
    const row = makeBlankRowRef.current();
    newKeysRef.current.add(row.key);
    setRowsNow([...rowsRef.current, row]);
  }, [hasPending, setRowsNow]);

  const applyRows = useCallback((updater: (rows: T[]) => T[]) => {
    if (lockedRef.current || hasPending()) return;
    editedKeyRef.current = undefined;
    setRowsNow(updater(rowsRef.current));
    commitNow();
  }, [commitNow, hasPending, setRowsNow]);

  const sortRows = useCallback((compare: (a: T, b: T) => number) => {
    sortRef.current = compare;
    setRowsNow([...rowsRef.current].sort(compare));
  }, [setRowsNow]);

  const settleCommit = useCallback(() => {
    dropResolvedRows();
  }, [dropResolvedRows]);

  /** Merge cancelled: restore committed field values for stored rows; new rows
   *  keep what was typed (the store has nothing to restore them to). */
  const revertUncommitted = useCallback(() => {
    const storeByKey = new Map(loadRowsRef.current(scopeRef.current).map(r => [r.key, r]));
    setRowsNow(rowsRef.current.map(r => {
      const committed = storeByKey.get(r.key);
      return committed ? { ...committed } : r;
    }));
  }, [setRowsNow]);

  const switchScope = useCallback((newScope: string) => {
    if (newScope === scopeRef.current || hasPending()) return;
    scopeRef.current = newScope;
    focusRef.current = null;
    newKeysRef.current = new Set();
    loadScope(newScope);
  }, [hasPending, loadScope]);

  const registerInput = useCallback((key: string, field: string, el: HTMLInputElement | HTMLTextAreaElement | null) => {
    const id = `${key}-${field}`;
    if (el) inputsRef.current.set(id, el);
    else inputsRef.current.delete(id);
  }, []);

  /** Tab-navigation: focus the next field/cell. Returns false when there is
   *  nowhere to go — the caller then lets the browser's Tab run (which blurs
   *  the input and commits it). */
  const focusNext = useCallback((key: string, field: string): boolean => {
    const idx = rowsRef.current.findIndex(r => r.key === key);
    if (idx < 0) return false;
    const fields = fieldsPerRowRef.current(scopeRef.current);
    const curFieldIdx = fields.indexOf(field);
    if (curFieldIdx < fields.length - 1) {
      const el = inputsRef.current.get(`${rowsRef.current[idx].key}-${fields[curFieldIdx + 1]}`);
      if (!el) return false;
      el.focus();
      return true;
    }
    if (idx < rowsRef.current.length - 1) {
      const el = inputsRef.current.get(`${rowsRef.current[idx + 1].key}-${fields[0]}`);
      if (!el) return false;
      el.focus();
      return true;
    }
    return false;
  }, []);

  const noteFocus = useCallback((key: string, field: string) => {
    const row = rowsRef.current.find(r => r.key === key);
    focusRef.current = { key, field, baseline: row ? String((row as Record<string, unknown>)[field] ?? '') : '' };
  }, []);

  // Project switch: adopt the new project's rows and drop every local-only bit.
  useEffect(() => {
    sortRef.current = null;
    newKeysRef.current = new Set();
    focusRef.current = null;
    const fresh = loadRowsRef.current(scopeRef.current);
    setRowsNow(fresh);
  }, [projectId, setRowsNow]);

  // External store changes reload committed fields; the focused field's
  // in-flight text and uncommitted new rows survive.
  const prevDepsRef = useRef<unknown[]>(reloadDeps);
  useEffect(() => {
    const prev = prevDepsRef.current;
    let changed = prev.length !== reloadDeps.length;
    if (!changed) {
      for (let i = 0; i < reloadDeps.length; i++) {
        if (reloadDeps[i] !== prev[i]) { changed = true; break; }
      }
    }
    prevDepsRef.current = reloadDeps;
    if (!changed) return;
    const scopeKey = scopeRef.current;
    const fresh = loadRowsRef.current(scopeKey);
    const freshKeys = new Set(fresh.map(r => r.key));
    const focus = focusRef.current;
    const localByKey = new Map(rowsRef.current.map(r => [r.key, r]));
    const next: T[] = fresh.map(f => {
      const local = localByKey.get(f.key);
      if (local && focus && focus.key === f.key) {
        return { ...f, [focus.field]: (local as Record<string, unknown>)[focus.field] } as T;
      }
      return f;
    });
    for (const r of rowsRef.current) {
      if (freshKeys.has(r.key)) { newKeysRef.current.delete(r.key); continue; }
      if (newKeysRef.current.has(r.key)) next.push(r);
    }
    const cmp = sortRef.current;
    setRowsNow(cmp ? [...next].sort(cmp) : next);
  }, [reloadDeps, setRowsNow]);

  // ⌘⇧N adds a row (⌘S is gone — there is nothing to save).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (!lockedRef.current) addNew();
      }
    };
    currentDocument.addEventListener('keydown', onKey);
    return () => currentDocument.removeEventListener('keydown', onKey);
  }, [addNew, currentDocument]);

  // In-flight edit check for the S3.5 peer-save gate: focused text that differs
  // from its focus baseline, or a new row with content (never dispatched).
  const inFlightRef = useRef<() => boolean>(() => false);
  inFlightRef.current = () => {
    if (hasPending()) return true;
    const focus = focusRef.current;
    if (focus) {
      const row = rowsRef.current.find(r => r.key === focus.key);
      if (row && String((row as Record<string, unknown>)[focus.field] ?? '') !== focus.baseline) return true;
    }
    for (const r of rowsRef.current) {
      if (newKeysRef.current.has(r.key) && hasContentRef.current(r)) return true;
    }
    return false;
  };
  useEffect(() => registerInFlightEdits(() => inFlightRef.current()), []);

  // Unmount (tab switch, browser back, project close): commit whatever the
  // focused field still holds. Click-driven navigation has already blurred (and
  // committed) — this covers paths that remove the editor without a blur.
  const commitNowRef = useRef(commitNow);
  commitNowRef.current = commitNow;
  useEffect(() => () => {
    commitNowRef.current();
  }, []);

  return {
    rows,
    updateRow,
    deleteRow,
    addNew,
    applyRows,
    sortRows,
    commitEdit,
    settleCommit,
    revertUncommitted,
    switchScope,
    registerInput,
    focusNext,
    noteFocus,
  };
}
