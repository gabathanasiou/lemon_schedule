import React, { useEffect, useState } from 'react';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import ColorField from '../ColorField';

export interface PaletteColorModalProps {
  open: boolean;
  label: string;
  background: string;
  text: string;
  onApply: (background: string, text: string) => void;
  onReset?: () => { background: string; text: string };
  onClose: () => void;
}

/** The palette editor for one colour slot (scene matrix cell or an interface
 *  colour) — title `Edit: <label>`, background + text pickers, live "Aa"
 *  preview, Reset (defaults) and Apply. Owns the draft until Apply. */
export const PaletteColorModal: React.FC<PaletteColorModalProps> = ({
  open, label, background, text, onApply, onReset, onClose,
}) => {
  const [bg, setBg] = useState(background);
  const [fg, setFg] = useState(text);

  // Each open targets a different slot — restart the draft from its colours.
  useEffect(() => {
    setBg(background);
    setFg(text);
  }, [background, text, label, open]);

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit: ${label}`}
      width="max-w-sm"
      onReset={onReset ? () => { const d = onReset(); setBg(d.background); setFg(d.text); } : undefined}
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={() => { onApply(bg, fg); onClose(); }}>Apply</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-[color:var(--ui-text)]">Background</span>
          <ColorField value={bg} onChange={setBg} size="lg" />
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-[color:var(--ui-text)]">Text Color</span>
          <ColorField value={fg} onChange={setFg} size="lg" />
        </div>
        <div className="w-full h-10 rounded border border-[color:var(--ui-card-border)] flex items-center justify-center text-sm font-bold" style={{ background: bg, color: fg }}>
          Aa
        </div>
      </div>
    </Modal>
  );
};
