import React from 'react';
import { Trash2 } from 'lucide-react';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import { TEST_IDS } from '../../lib/testIds';

/**
 * Presentation for the "name new cast members" step (roadmap 86 / 228).
 * The queue lives in `lib/newCastNaming.tsx` (the provider) — this component
 * only draws the pending entries, so the store rules stay in one place and the
 * Modals Studio can preview every row shape (blank id add, prefilled name,
 * name-typed with its projected Board ID).
 */

export interface NewCastNamingEntry {
  /** Current (queue) key of the added cast member. */
  id: string;
  /** Current draft name — the prefilled name for a script-tagged member. */
  name: string;
  /** Created from a typed NAME rather than a Board ID (roadmap 228). */
  nameTyped?: boolean;
  /** Left-hand label: the Board ID, or the projected one for name-typed adds. */
  displayId?: string;
}

export interface NewCastNamingModalProps {
  entries: NewCastNamingEntry[];
  onChangeName: (id: string, name: string) => void;
  /** Save names (and assign real Board IDs to name-typed entries). */
  onSave: () => void;
  /** Cancel — reverts the queued creations (provider owns the rules). */
  onCancel: () => void;
  /** Per-entry undo for numeric-id adds; name-typed rows have none (Cancel removes them). */
  onUndo?: (id: string) => void;
}

const NAME_INPUT_CLASS = 'flex-1 min-w-0 px-3 py-2 bg-[var(--ui-panel-bg)] border border-[color:var(--ui-input-border)] rounded-md text-xs text-[color:var(--ui-input-text)] placeholder:text-[color:var(--ui-text-faint)] outline-none focus:border-[color:var(--ui-input-focus-border)]';

export function NewCastNamingModal({ entries, onChangeName, onSave, onCancel, onUndo }: NewCastNamingModalProps) {
  const hasNameTyped = entries.some(e => e.nameTyped);
  return (
    <Modal
      open
      onClose={onCancel}
      title="Name New Cast Members"
      width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onCancel}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={onSave}>Save</ModalFooterButton>
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
        {entries.map((entry, i) => (
          <div key={entry.id} className="flex items-center gap-2" data-testid={TEST_IDS.newCastNameRow}>
            <span className="text-xs text-[color:var(--ui-text-muted)] w-7 shrink-0 tabular-nums text-right">
              {entry.displayId ?? entry.id}.
            </span>
            <input
              data-testid={TEST_IDS.newCastNameInput}
              autoFocus={i === 0}
              value={entry.name}
              onChange={e => onChangeName(entry.id, e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSave(); } }}
              placeholder="CAST MEMBER NAME"
              className={`${NAME_INPUT_CLASS} uppercase`}
            />
            {!entry.nameTyped && onUndo && (
              <button
                type="button"
                data-testid={TEST_IDS.newCastNameUndo}
                onClick={() => onUndo(entry.id)}
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
  );
}
