import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useProject } from '../store';
import type { Action } from '../store';
import Modal, { ModalFooter } from '../components/Modal';
import ModalFooterButton from '../components/ModalFooterButton';
import { Trash2 } from 'lucide-react';
import { TEST_IDS } from './testIds';

interface NewCastNamingContextValue {
  /** Queue newly-created (blank-named) cast member ids so the user can name
   *  them — element dropdowns create cast with an empty name. */
  queue: (ids: string[]) => void;
}

const NewCastNamingContext = createContext<NewCastNamingContextValue>({ queue: () => {} });

/** Stable callback — the queue context is safe to read in per-row components
 *  (it never changes, so subscribing costs nothing). */
export const useQueueCastNaming = (): NewCastNamingContextValue => useContext(NewCastNamingContext);

/** Shared "ensure this new element exists" dispatch for entity fields — the
 *  stripboard, Glide breakdown and Scene Sheet all route new items through
 *  here. Cast is referenced by ID, so a brand-new cast member is created with
 *  a BLANK name and queued for the naming modal; every other category uses its
 *  name as its key. */
export function addNewElement(
  dispatch: (a: Action) => void,
  queue: (ids: string[]) => void,
  category: string,
  item: string,
): void {
  if (category === 'cast') {
    dispatch({ type: 'ADD_ELEMENT', payload: { category, element: { id: item, name: '' } } });
    queue([item]);
  } else {
    dispatch({ type: 'ADD_ELEMENT', payload: { category, element: { id: item, name: item } } });
  }
}

const NAME_INPUT_CLASS = 'flex-1 min-w-0 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500';

/** Names newly added cast members (the element-dropdown flow). Mounted above
 *  the tabs so it fires wherever a brand-new cast id is typed — stripboard,
 *  Glide breakdown and Scene Sheet. */
export function NewCastNamingProvider({ children }: { children: React.ReactNode }) {
  const { state, dispatch, readOnly } = useProject();
  const castMembers = state.present.castMembers || [];
  const [pending, setPending] = useState<{ id: string; name: string }[]>([]);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const queue = useCallback((ids: string[]) => {
    setPending(prev => {
      const seen = new Set(prev.map(p => p.id));
      const fresh = ids.filter(id => !seen.has(id));
      return fresh.length ? [...prev, ...fresh.map(id => ({ id, name: '' }))] : prev;
    });
  }, []);

  const value = useMemo(() => ({ queue }), [queue]);

  const setName = useCallback((id: string, name: string) => {
    setPending(prev => prev.map(p => (p.id === id ? { ...p, name } : p)));
  }, []);

  /** Per-entry undo: the cast was added by mistake — delete it everywhere. */
  const undoEntry = useCallback((id: string) => {
    if (readOnly) return;
    dispatch({ type: 'DELETE_CAST_MEMBER', payload: id });
    setPending(prev => prev.filter(p => p.id !== id));
  }, [dispatch, readOnly]);

  const save = useCallback(() => {
    if (readOnly) return;
    const entries = pendingRef.current.filter(p => p.name.trim());
    if (entries.length > 0) {
      dispatch({ type: 'BATCH_START' });
      for (const p of entries) {
        dispatch({ type: 'UPDATE_CAST_MEMBER', payload: { id: p.id, name: p.name.trim().toUpperCase() } });
      }
      dispatch({ type: 'BATCH_COMMIT' });
    }
    setPending([]);
  }, [dispatch, readOnly]);

  const dismiss = useCallback(() => setPending([]), []);

  // Drop entries whose member vanished (e.g. the add was undone) so the modal
  // never proposes naming a cast that no longer exists.
  const visible = useMemo(
    () => pending.filter(p => castMembers.some(m => String(m.id) === String(p.id))),
    [pending, castMembers],
  );

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
            <p className="text-xs text-zinc-400 leading-relaxed">
              These new cast members stay blank until you give them a name.
            </p>
            {visible.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2" data-testid={TEST_IDS.newCastNameRow}>
                <span className="text-xs text-zinc-400 w-7 shrink-0 tabular-nums text-right">{p.id}.</span>
                <input
                  data-testid={TEST_IDS.newCastNameInput}
                  autoFocus={i === 0}
                  value={p.name}
                  onChange={e => setName(p.id, e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
                  placeholder="CAST MEMBER NAME"
                  className={`${NAME_INPUT_CLASS} uppercase`}
                />
                <button
                  type="button"
                  data-testid={TEST_IDS.newCastNameUndo}
                  onClick={() => undoEntry(p.id)}
                  title="Remove this cast member (undo)"
                  className="shrink-0 p-1.5 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-900 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </NewCastNamingContext.Provider>
  );
}
