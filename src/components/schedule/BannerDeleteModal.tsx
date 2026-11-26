import React from 'react';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Checklist from '../Checklist';

export interface BannerDeleteState {
  type: 'NOTE' | 'BREAK';
}

export interface BannerDeleteEntry {
  key: string;
  label: string;
  bg: string;
  fg: string;
  count: number;
}

interface BannerDeleteModalProps {
  /** Which banner type the cleanup targets — null keeps the modal closed. */
  state: BannerDeleteState | null;
  onClose: () => void;
  entries: BannerDeleteEntry[];
  checked: Set<string>;
  onCheckedChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  onDelete: (type: 'NOTE' | 'BREAK', keys: Set<string>) => void;
}

/** Checklist delete of note/break banners (one row per label+colour, counted). */
export default function BannerDeleteModal({
  state,
  onClose,
  entries,
  checked,
  onCheckedChange,
  onDelete,
}: BannerDeleteModalProps) {
  if (!state) return null;

  const allChecked = entries.length > 0 && entries.every(e => checked.has(e.key));
  const checkedKeys = new Set(entries.filter(e => checked.has(e.key)).map(e => e.key));
  const checkedCount = entries.filter(e => checked.has(e.key)).reduce((s, e) => s + e.count, 0);
  const totalCount = entries.reduce((s, e) => s + e.count, 0);
  const noun = state.type === 'NOTE' ? 'note' : 'break';

  return (
    <Modal
      open
      onClose={onClose}
      title={state.type === 'NOTE' ? 'Delete Notes' : 'Delete Breaks'}
      width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton
            variant="danger-solid"
            onClick={() => onDelete(state.type, checkedKeys)}
            disabled={checkedCount === 0}
          >
            Delete Selected{checkedCount > 0 ? ` (${checkedCount})` : ''}
          </ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-5">
        <p className="text-xs text-[color:var(--ui-text-muted)] leading-relaxed">
          Choose which {noun} banners to remove.
        </p>
        <Checklist
          title={`${totalCount} ${noun} banner${totalCount !== 1 ? 's' : ''}`}
          items={entries.map(e => ({
            id: e.key,
            label: (
              <span className="px-2 py-0.5 rounded font-semibold truncate max-w-[16rem] shrink-0" style={{ background: e.bg, color: e.fg }}>
                {e.label}
              </span>
            ),
            secondary: e.count,
          }))}
          selected={checked}
          onToggle={key => onCheckedChange(prev => {
            const next = new Set(prev);
            const k = String(key);
            if (next.has(k)) next.delete(k); else next.add(k);
            return next;
          })}
          onToggleAll={() => onCheckedChange(prev => {
            const next = new Set(prev);
            if (allChecked) entries.forEach(e => next.delete(e.key));
            else entries.forEach(e => next.add(e.key));
            return next;
          })}
          allSelected={allChecked}
          emptyHint="No banners found."
          maxHeight={288}
        />
      </div>
    </Modal>
  );
}
