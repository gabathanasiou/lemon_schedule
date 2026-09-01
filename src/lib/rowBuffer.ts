import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../store';
import { useCurrentDocument } from './popoutTarget';
import { useDialog } from '../components/Dialog';
import { registerUnsavedGuard, wasUnsavedPromptHandled, consumePendingTab, notifyGuardChanged } from './unsavedGuard';

export interface BufferedRow {
  key: string;
}

export interface RowBufferOptions<T extends BufferedRow> {
  projectId: string;
  /** Current scope key (category / role) — buffers are kept per scope. */
  scope: string;
  loadRows: (scope: string) => T[];
  makeBlankRow: () => T;
  /** Tab-navigation field order for a scope (e.g. ['id','name'] or ['name','phone','email']). */
  fieldsPerRow: (scope: string) => string[];
  /** Store data this buffer mirrors — when any entry changes identity externally, the buffer reloads. */
  reloadDeps: unknown[];
  /** Manager-specific save: diffs the buffer against snapshots and dispatches. */
  onSave: () => void;
  /** True when the last save opened a confirmation modal still awaiting action. */
  hasPendingConfirmation?: () => boolean;
}

export interface RowBufferResult<T extends BufferedRow> {
  rows: T[];
  updateRow: (key: string, field: string, value: string) => void;
  deleteRow: (key: string) => void;
  addNew: () => void;
  /** Pushes one undo entry for the current scope, then applies the updater. */
  mutateRows: (updater: (rows: T[]) => T[]) => void;
  sortRows: (compare: (a: T, b: T) => number) => void;
  undoLocal: () => boolean;
  redoLocal: () => boolean;
  doSave: () => void;
  doRevert: () => void;
  hasChanges: boolean;
  switchScope: (newScope: string) => void;
  registerInput: (key: string, field: string, el: HTMLInputElement | HTMLTextAreaElement | null) => void;
  focusNext: (key: string, field: string) => void;
  /** Call after the manager's save dispatches committed: snapshots refresh, local history clears. */
  commitSaved: () => void;
  /** Drop buffered rows absorbed by a save (e.g. merged-away new rows) without an undo entry. */
  commitDroppedRows: (scopeKey: string, keys: string[]) => void;
  cachedRows: (scope: string) => T[] | undefined;
  cachedSnapshot: (scope: string) => T[] | undefined;
  bufferedScopes: () => string[];
  /** Call on input focus — the next keystroke becomes one undo entry. */
  noteFocusStart: () => void;
  noteFocusEnd: () => void;
}

/**
 * The buffered-editing engine behind the manager pages (Element Manager, Crew
 * Manager). Owns per-scope edit buffers with snapshots + local undo/redo,
 * the unsaved-changes guard (tab-switch prompts, local-first undo routing),
 * Cmd+S / Cmd+Shift+N shortcuts, and Tab-navigation focus registry.
 *
 * Diff/save semantics are manager-specific (the caller's `onSave`); the hook
 * only guarantees the mechanics. See docs/DATABASE-MANAGEMENT.md.
 */
export function useRowBuffer<T extends BufferedRow>(opts: RowBufferOptions<T>): RowBufferResult<T> {
  const { projectId, scope, loadRows, makeBlankRow, fieldsPerRow, reloadDeps, onSave, hasPendingConfirmation } = opts;
  const { readOnly } = useProject();
  const currentDocument = useCurrentDocument();
  const dialog = useDialog();

  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  const rowsByScope = useRef<Record<string, T[]>>({});
  const snapByScope = useRef<Record<string, T[]>>({});
  const undoByScope = useRef<Record<string, T[][]>>({});
  const redoByScope = useRef<Record<string, T[][]>>({});
  const inputsRef = useRef<Map<string, HTMLElement>>(new Map());
  // Rows captured when an input gains focus — pushed as ONE undo entry on the
  // first keystroke, discarded on blur without changes (per-operation undo).
  const pendingSnapshotRef = useRef<T[] | null>(null);

  const [rows, setRows] = useState<T[]>(() => {
    const r = loadRows(scope);
    snapByScope.current[scope] = [...r];
    rowsByScope.current[scope] = r;
    return r;
  });
  const [saveVersion, setSaveVersion] = useState(0);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  /** Pushes a pre-operation snapshot for `scopeKey` and clears its redo. */
  const pushUndo = useCallback((scopeKey: string, snapshot: T[]) => {
    const stack = undoByScope.current[scopeKey] || [];
    stack.push(snapshot);
    if (stack.length > 50) stack.shift();
    undoByScope.current[scopeKey] = stack;
    redoByScope.current[scopeKey] = [];
    notifyGuardChanged();
  }, []);

  const resetAll = useCallback(() => {
    rowsByScope.current = {};
    snapByScope.current = {};
    undoByScope.current = {};
    redoByScope.current = {};
    notifyGuardChanged();
  }, []);

  const loadScope = useCallback((scopeKey: string) => {
    const r = loadRows(scopeKey);
    snapByScope.current[scopeKey] = [...r];
    rowsByScope.current[scopeKey] = r;
    setRows(r);
  }, [loadRows]);

  // Project switch: drop every buffer and reload the current scope.
  useEffect(() => {
    resetAll();
    loadScope(scopeRef.current);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // External store changes to the mirrored data reload the current scope.
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
    if (changed) {
      resetAll();
      loadScope(scopeRef.current);
    }
  }, [reloadDeps, resetAll, loadScope]);

  const updateRow = useCallback((key: string, field: string, value: string) => {
    // First mutation after an input gained focus: commit the pre-edit snapshot
    // as one undo entry (further keystrokes of the same edit do not push).
    if (pendingSnapshotRef.current) {
      pushUndo(scopeRef.current, pendingSnapshotRef.current);
      pendingSnapshotRef.current = null;
    }
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
  }, [pushUndo]);

  const deleteRow = useCallback((key: string) => {
    pushUndo(scopeRef.current, rowsRef.current);
    setRows(prev => prev.filter(r => r.key !== key));
  }, [pushUndo]);

  const addNew = useCallback(() => {
    pushUndo(scopeRef.current, rowsRef.current);
    setRows(prev => [...prev, makeBlankRow()]);
  }, [pushUndo, makeBlankRow]);

  const mutateRows = useCallback((updater: (rows: T[]) => T[]) => {
    pushUndo(scopeRef.current, rowsRef.current);
    setRows(prev => updater(prev));
  }, [pushUndo]);

  const sortRows = useCallback((compare: (a: T, b: T) => number) => {
    mutateRows(prev => [...prev].sort(compare));
  }, [mutateRows]);

  const undoLocal = useCallback((): boolean => {
    const scopeKey = scopeRef.current;
    const stack = undoByScope.current[scopeKey] || [];
    if (stack.length === 0) return false;
    const snapshot = stack.pop()!;
    undoByScope.current[scopeKey] = stack;
    const redoStack = redoByScope.current[scopeKey] || [];
    redoStack.push(rowsRef.current);
    redoByScope.current[scopeKey] = redoStack;
    rowsByScope.current[scopeKey] = snapshot;
    setRows(snapshot);
    // If an input is still focused, the next keystroke starts a fresh edit
    // whose undo entry is the restored state.
    pendingSnapshotRef.current = snapshot;
    notifyGuardChanged();
    return true;
  }, []);

  const redoLocal = useCallback((): boolean => {
    const scopeKey = scopeRef.current;
    const stack = redoByScope.current[scopeKey] || [];
    if (stack.length === 0) return false;
    const snapshot = stack.pop()!;
    redoByScope.current[scopeKey] = stack;
    const undoStack = undoByScope.current[scopeKey] || [];
    undoStack.push(rowsRef.current);
    undoByScope.current[scopeKey] = undoStack;
    rowsByScope.current[scopeKey] = snapshot;
    setRows(snapshot);
    pendingSnapshotRef.current = snapshot;
    notifyGuardChanged();
    return true;
  }, []);

  const hasChanges = useMemo(() => {
    rowsByScope.current[scope] = rows;
    const allScopes = new Set([...Object.keys(rowsByScope.current), ...Object.keys(snapByScope.current)]);
    for (const s of allScopes) {
      const r = rowsByScope.current[s] || [];
      const snap = snapByScope.current[s] || [];
      if (r.length !== snap.length) return true;
      for (let i = 0; i < r.length; i++) {
        if (JSON.stringify(r[i]) !== JSON.stringify(snap[i])) return true;
      }
    }
    return false;
  }, [rows, scope, saveVersion]);

  const switchScope = useCallback((newScope: string) => {
    if (newScope === scopeRef.current) return;
    rowsByScope.current[scopeRef.current] = rowsRef.current;
    if (rowsByScope.current[newScope]) {
      setRows(rowsByScope.current[newScope]);
    } else {
      const r = loadRows(newScope);
      snapByScope.current[newScope] = [...r];
      rowsByScope.current[newScope] = r;
      setRows(r);
    }
    scopeRef.current = newScope;
  }, [loadRows]);

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const doSave = useCallback(() => {
    rowsByScope.current[scopeRef.current] = rowsRef.current;
    onSaveRef.current();
  }, []);

  const doRevert = useCallback(() => {
    for (const s of Object.keys(snapByScope.current)) rowsByScope.current[s] = snapByScope.current[s].map(r => ({ ...r }));
    setRows(rowsByScope.current[scopeRef.current] || []);
    setSaveVersion(v => v + 1);
  }, []);

  const commitSaved = useCallback(() => {
    snapByScope.current = {};
    for (const s of Object.keys(rowsByScope.current)) {
      snapByScope.current[s] = (rowsByScope.current[s] || []).map(r => ({ ...r }));
    }
    setSaveVersion(v => v + 1);
    // The save is committed — local history becomes one store undo entry.
    undoByScope.current = {};
    redoByScope.current = {};
    notifyGuardChanged();
    // Resume a tab switch that was waiting on this save/merge confirmation.
    consumePendingTab()?.();
  }, []);

  const commitDroppedRows = useCallback((scopeKey: string, keys: string[]) => {
    const next = (rowsByScope.current[scopeKey] || []).filter(r => !keys.includes(r.key));
    rowsByScope.current[scopeKey] = next;
    if (scopeKey === scopeRef.current) setRows(next);
  }, []);

  const registerInput = useCallback((key: string, field: string, el: HTMLInputElement | HTMLTextAreaElement | null) => {
    const id = `${key}-${field}`;
    if (el) inputsRef.current.set(id, el as HTMLInputElement);
    else inputsRef.current.delete(id);
  }, []);

  const focusNext = useCallback((key: string, field: string) => {
    const idx = rowsRef.current.findIndex(r => r.key === key);
    if (idx < 0) return;
    const fields = fieldsPerRow(scopeRef.current);
    const curFieldIdx = fields.indexOf(field);
    if (curFieldIdx < fields.length - 1) {
      inputsRef.current.get(`${rowsRef.current[idx].key}-${fields[curFieldIdx + 1]}`)?.focus();
    } else if (idx < rowsRef.current.length - 1) {
      const nextKey = rowsRef.current[idx + 1].key;
      inputsRef.current.get(`${nextKey}-${fields[0]}`)?.focus();
    }
  }, [fieldsPerRow]);

  const noteFocusStart = useCallback(() => {
    pendingSnapshotRef.current = rowsRef.current;
  }, []);

  const noteFocusEnd = useCallback(() => {
    pendingSnapshotRef.current = null;
  }, []);

  const cachedRows = useCallback((s: string) => rowsByScope.current[s], []);

  const cachedSnapshot = useCallback((s: string) => snapByScope.current[s], []);

  const bufferedScopes = useCallback(() => Object.keys(rowsByScope.current), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey) {
        if (e.key === 'n' && e.shiftKey) { e.preventDefault(); if (!readOnly) addNew(); }
        if (e.key === 's') { e.preventDefault(); if (!readOnly) doSave(); }
      }
    };
    currentDocument.addEventListener('keydown', onKey);
    return () => currentDocument.removeEventListener('keydown', onKey);
  }, [addNew, doSave, currentDocument, readOnly]);

  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;
  const doSaveRef = useRef(doSave);
  doSaveRef.current = doSave;
  const undoLocalRef = useRef(undoLocal);
  undoLocalRef.current = undoLocal;
  const redoLocalRef = useRef(redoLocal);
  redoLocalRef.current = redoLocal;
  const hasPendingConfirmationRef = useRef(hasPendingConfirmation);
  hasPendingConfirmationRef.current = hasPendingConfirmation;

  useEffect(() => {
    // Tab switches (top tabs, sub-tabs, popouts) consult this guard BEFORE
    // unmounting, so save + merge confirmation run while still mounted.
    // Undo/redo affordances (header buttons, Cmd+Z) route through it to the
    // local edit history first, falling back to the store undo when empty.
    registerUnsavedGuard({
      hasUnsavedChanges: () => hasChangesRef.current,
      save: () => { doSaveRef.current(); },
      hasPendingConfirmation: () => hasPendingConfirmationRef.current?.() ?? false,
      hasLocalUndo: () => (undoByScope.current[scopeRef.current] || []).length > 0,
      hasLocalRedo: () => (redoByScope.current[scopeRef.current] || []).length > 0,
      undoLocal: () => undoLocalRef.current(),
      redoLocal: () => redoLocalRef.current(),
    });
    return () => {
      registerUnsavedGuard(null);
      // Fallback for unmount paths that bypass the guard (window close).
      if (!wasUnsavedPromptHandled() && hasChangesRef.current) {
        const save = doSaveRef.current;
        dialog.confirm({ title: 'Unsaved Changes', message: 'You have unsaved changes. Save before leaving?' }).then(ok => {
          if (ok) save();
        });
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    rows,
    updateRow,
    deleteRow,
    addNew,
    mutateRows,
    sortRows,
    undoLocal,
    redoLocal,
    doSave,
    doRevert,
    hasChanges,
    switchScope,
    registerInput,
    focusNext,
    commitSaved,
    commitDroppedRows,
    cachedRows,
    cachedSnapshot,
    bufferedScopes,
    noteFocusStart,
    noteFocusEnd,
  };
}
