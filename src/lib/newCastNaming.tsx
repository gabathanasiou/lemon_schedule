import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useProject } from '../store';
import type { Action } from '../store';
import Modal, { ModalFooter } from '../components/Modal';
import ModalFooterButton from '../components/ModalFooterButton';
import { Trash2 } from 'lucide-react';
import { TEST_IDS } from './testIds';
import { getFieldItems } from './categories';
import { isIdKeyed } from './elements';

export type QueueCastNaming = (
  ids: string[],
  names?: Record<string, string>,
  onCancel?: () => void,
  opts?: { nameTyped?: boolean },
) => void;

interface NewCastNamingContextValue {
  /** Queue newly-created (blank-named) cast member ids so the user can name
   *  them — element dropdowns create cast with an empty name. `names` carries
   *  an already-known name (script tagging highlights one) to prefill;
   *  `onCancel` reverts whatever ELSE the creation commit did (script tagging
   *  reverts the whole tag) when the user cancels the naming modal.
   *  `opts.nameTyped` (roadmap 228) marks an entry created from a typed NAME
   *  instead of a Board ID: Save re-IDs it to the next free numeric Board ID,
   *  Cancel deletes it. */
  queue: (ids: string[], names?: Record<string, string>, onCancel?: () => void, opts?: { nameTyped?: boolean }) => void;
}

const NewCastNamingContext = createContext<NewCastNamingContextValue>({ queue: () => {} });

/** Stable callback — the queue context is safe to read in per-row components
 *  (it never changes, so subscribing costs nothing). */
export const useQueueCastNaming = (): NewCastNamingContextValue => useContext(NewCastNamingContext);

/** Shared "ensure this new element exists" dispatch for entity fields — the
 *  stripboard, Glide breakdown and Scene Sheet all route new items through
 *  here. Cast is referenced by ID, so a brand-new cast member is created with
 *  a BLANK name and queued for the naming modal (`name` — e.g. the name
 *  highlighted in script tagging — prefills it); every other category uses its
 *  name as its key. */
export function addNewElement(
  dispatch: (a: Action) => void,
  queue: (ids: string[], names?: Record<string, string>, onCancel?: () => void, opts?: { nameTyped?: boolean }) => void,
  category: string,
  item: string,
  name?: string,
  onCancel?: () => void,
): void {
  if (category === 'cast') {
    /* A segment that isn't a Board ID (digits) is a NAME typed in the wrong
       place: create it so the committed field keeps matching, prefill the
       typed text as the NAME, and flag it — Save assigns a real numeric Board
       ID, Cancel removes it (roadmap 228, the beginner guard). */
    const nameTyped = !/^\d+$/.test(item.trim());
    dispatch({ type: 'ADD_ELEMENT', payload: { category, element: { id: item, name: '' } } });
    queue(
      [item],
      name ? { [item]: name } : (nameTyped ? { [item]: item.trim().toUpperCase() } : undefined),
      onCancel,
      nameTyped ? { nameTyped: true } : undefined,
    );
  } else {
    dispatch({ type: 'ADD_ELEMENT', payload: { category, element: { id: item, name: item } } });
  }
}

/**
 * Creates every segment of a committed entity value that has no element yet —
 * the ONE seam shared by the stripboard, Glide breakdown and Scene Sheet
 * commit paths (existing-row edits AND the Glide rows the add row / a paste
 * creates). Cast segments route through `addNewElement` (blank member + the
 * naming modal; a typed NAME is flagged by the roadmap-228 guard); name-keyed
 * categories create by name. A name repeated within one value creates one
 * element. Cast keys match by exact Board ID (AGENTS.md §Cast & Entities);
 * name-keyed keys match case-insensitively.
 */
export function addNewElements(
  dispatch: (a: Action) => void,
  queue: QueueCastNaming,
  category: string,
  value: string,
  existing: { id: string; name: string }[],
): void {
  const idKeyed = isIdKeyed(category);
  const known = new Set(existing.map(e => (idKeyed ? e.id : (e.name || e.id).toLowerCase())));
  for (const item of getFieldItems(category, value)) {
    const key = idKeyed ? item : item.toLowerCase();
    if (known.has(key)) continue;
    known.add(key);
    addNewElement(dispatch, queue, category, item);
  }
}

const NAME_INPUT_CLASS = 'flex-1 min-w-0 px-3 py-2 bg-[var(--ui-panel-bg)] border border-[color:var(--ui-input-border)] rounded-md text-xs text-[color:var(--ui-input-text)] placeholder:text-[color:var(--ui-text-faint)] outline-none focus:border-[color:var(--ui-input-focus-border)]';

/** Names newly added cast members (the element-dropdown flow). Mounted above
 *  the tabs so it fires wherever a brand-new cast id is typed — stripboard,
 *  Glide breakdown and Scene Sheet. */
export function NewCastNamingProvider({ children }: { children: React.ReactNode }) {
  const { state, dispatch, locked } = useProject();
  const castMembers = state.present.castMembers || [];
  const [pending, setPending] = useState<{ id: string; name: string; onCancel?: () => void; nameTyped?: boolean }[]>([]);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const queue = useCallback((ids: string[], names?: Record<string, string>, onCancel?: () => void, opts?: { nameTyped?: boolean }) => {
    setPending(prev => {
      const seen = new Set(prev.map(p => p.id));
      const fresh = ids.filter(id => !seen.has(id));
      return fresh.length ? [...prev, ...fresh.map(id => ({ id, name: names?.[id] || '', onCancel, nameTyped: opts?.nameTyped }))] : prev;
    });
  }, []);

  const value = useMemo(() => ({ queue }), [queue]);

  const setName = useCallback((id: string, name: string) => {
    setPending(prev => prev.map(p => (p.id === id ? { ...p, name } : p)));
  }, []);

  /** Per-entry undo: the cast was added by mistake — delete it everywhere,
   *  plus revert whatever else the creation commit did (a script tag). */
  const undoEntry = useCallback((id: string) => {
    if (locked) return;
    dispatch({ type: 'DELETE_CAST_MEMBER', payload: id });
    pendingRef.current.find(p => p.id === id)?.onCancel?.();
    setPending(prev => prev.filter(p => p.id !== id));
  }, [dispatch, locked]);

  const save = useCallback(() => {
    if (locked) return;
    const entries = pendingRef.current.filter(p => p.name.trim() || p.nameTyped);
    if (entries.length > 0) {
      dispatch({ type: 'BATCH_START' });
      /* Name-typed entries get a REAL Board ID here — sequential from the
         first free number, never the typed text (roadmap 228). The
         UPDATE_ELEMENT cast rename cascades scene fields + script tags. */
      const used = new Set(castMembers.map(m => String(m.id)));
      let next = 1;
      const nextFreeId = () => { while (used.has(String(next))) next++; const id = String(next); used.add(id); return id; };
      for (const p of entries) {
        const name = p.name.trim().toUpperCase();
        if (p.nameTyped) {
          dispatch({ type: 'UPDATE_ELEMENT', payload: { category: 'cast', id: p.id, updates: { id: nextFreeId(), ...(name ? { name } : {}) } } });
        } else {
          dispatch({ type: 'UPDATE_CAST_MEMBER', payload: { id: p.id, name } });
        }
      }
      dispatch({ type: 'BATCH_COMMIT' });
    }
    setPending([]);
  }, [dispatch, locked, castMembers]);

  /** Cancel: revert each queued creation that carried a revert (script tags)
   *  once per callback — other entries keep the pre-feature blank-member
   *  behavior. Name-typed entries were a mistake (a NAME in an ID field):
   *  Cancel removes them; DELETE_CAST_MEMBER also strips scene refs. */
  const dismiss = useCallback(() => {
    const cancels = new Set(pendingRef.current.map(p => p.onCancel).filter(Boolean));
    for (const cb of cancels) cb!();
    const flagged = pendingRef.current.filter(p => p.nameTyped);
    if (flagged.length > 0 && !locked) {
      dispatch({ type: 'BATCH_START' });
      for (const p of flagged) dispatch({ type: 'DELETE_CAST_MEMBER', payload: p.id });
      dispatch({ type: 'BATCH_COMMIT' });
    }
    setPending([]);
  }, [dispatch, locked]);

  // Drop entries whose member vanished (e.g. the add was undone) so the modal
  // never proposes naming a cast that no longer exists.
  const visible = useMemo(
    () => pending.filter(p => castMembers.some(m => String(m.id) === String(p.id))),
    [pending, castMembers],
  );
  const hasNameTyped = visible.some(p => p.nameTyped);

  /* Preview the Board IDs Save will assign to name-typed entries (same
     sequential next-free walk as `save`, in render order) — the row label
     shows the REAL future id, never the typed text. */
  const projectedIds = useMemo(() => {
    const used = new Set(castMembers.map(m => String(m.id)));
    let next = 1;
    const map = new Map<string, string>();
    for (const p of visible) {
      if (!p.nameTyped) continue;
      while (used.has(String(next))) next++;
      map.set(p.id, String(next));
      used.add(String(next));
    }
    return map;
  }, [visible, castMembers]);

  return (
    <NewCastNamingContext.Provider value={value}>
      {children}
      {visible.length > 0 && (
        <Modal
          open
          onClose={dismiss}
          title="Name New Cast Members"
          width="max-w-md"
          footer={
            <ModalFooter>
              <ModalFooterButton variant="ghost" onClick={dismiss}>Cancel</ModalFooterButton>
              <ModalFooterButton onClick={save}>Save</ModalFooterButton>
            </ModalFooter>
          }
        >
          <div className="p-6 space-y-3" data-testid={TEST_IDS.newCastNameModal}>
            {!hasNameTyped && (
              <p className="text-xs text-[color:var(--ui-text-muted)] leading-relaxed">
                These new cast members stay blank until you give them a name.
              </p>
            )}
            {hasNameTyped && (
              <p
                data-testid={TEST_IDS.newCastNameNotice}
                className="text-xs text-amber-400 leading-relaxed rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2"
              >
                Looks like you typed a cast name, not a board ID. Cast fields expect board IDs —
                e.g. 2 for “2. MARY”. Save adds the members below with the next free board ID
                (shown on the left); Cancel removes them.
              </p>
            )}
            {visible.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2" data-testid={TEST_IDS.newCastNameRow}>
                <span className="text-xs text-[color:var(--ui-text-muted)] w-7 shrink-0 tabular-nums text-right">
                  {p.nameTyped ? projectedIds.get(p.id) : p.id}.
                </span>
                <input
                  data-testid={TEST_IDS.newCastNameInput}
                  autoFocus={i === 0}
                  value={p.name}
                  onChange={e => setName(p.id, e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
                  placeholder="CAST MEMBER NAME"
                  className={`${NAME_INPUT_CLASS} uppercase`}
                />
                {/* Name-typed rows have no per-entry undo — Cancel already
                    removes them; numeric-id adds keep theirs (roadmap 86). */}
                {!p.nameTyped && (
                  <button
                    type="button"
                    data-testid={TEST_IDS.newCastNameUndo}
                    onClick={() => undoEntry(p.id)}
                    title="Remove this cast member (undo)"
                    className="shrink-0 p-1.5 rounded text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-danger-text)] hover:bg-[var(--ui-item-hover-bg)] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </NewCastNamingContext.Provider>
  );
}
