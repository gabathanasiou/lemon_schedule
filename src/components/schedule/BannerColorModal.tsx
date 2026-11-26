import React from 'react';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import ColorField from '../ColorField';
import { getNoteBannerColors } from '../../lib/ribbonUtils';
import type { SceneColorPalette } from '../../types';

/** Draft for the shared "Edit Banner" palette modal. Hosts may carry extra
 *  fields (row id, restore snapshot) — the modal only reads/writes these. */
export interface BannerColorState {
  bg: string;
  text: string;
  noteText: string;
}

interface BannerColorModalProps<T extends BannerColorState> {
  /** Banner being edited — null keeps the modal closed. */
  state: T | null;
  onChange: React.Dispatch<React.SetStateAction<T | null>>;
  onClose: () => void;
  onApply: () => void;
  palette?: SceneColorPalette;
}

/**
 * ONE "Edit Banner" palette modal — the stripboard's double-click/context-menu
 * path (ScheduleModals) and the Calendar day notes share it, so the two
 * surfaces can never drift. Controlled: the host owns the draft and the commit.
 */
export default function BannerColorModal<T extends BannerColorState>({
  state,
  onChange,
  onClose,
  onApply,
  palette,
}: BannerColorModalProps<T>) {
  if (!state) return null;
  const defaults = getNoteBannerColors(palette);

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Banner"
      width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={onApply}>Apply</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-[color:var(--ui-text)]">Background</span>
          <ColorField
            value={state.bg}
            onChange={v => onChange(p => p ? { ...p, bg: v } : null)}
            defaultValue={defaults.background}
          />
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-[color:var(--ui-text)]">Text Color</span>
          <ColorField
            value={state.text}
            onChange={v => onChange(p => p ? { ...p, text: v } : null)}
            defaultValue={defaults.color}
          />
        </div>
        <div>
          <textarea
            value={state.noteText}
            onChange={e => onChange(p => p ? { ...p, noteText: e.target.value.toUpperCase() } : null)}
            rows={3}
            className="w-full text-xs px-3 py-2 rounded border border-[color:var(--ui-border)] outline-none focus:border-[color:var(--ui-input-focus-border)] resize-none"
            style={{ background: state.bg, color: state.text }}
            placeholder="Banner text..."
          />
        </div>
      </div>
    </Modal>
  );
}
