import React, { useEffect, useState } from 'react';
import { SceneColorPalette } from '../../types';
import { getNoteBannerColors } from '../../lib/ribbonUtils';
import { IS_COARSE } from '../../lib/device';
import ColorField from '../ColorField';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import { ruleModalSizes } from '../rules/ColorRuleFormParts';

export interface SceneCellEditModalProps {
  open: boolean;
  intExt: string;
  dayNight: string;
  background: string;
  text: string;
  palette: SceneColorPalette;
  onApply: (background: string, text: string) => void;
  onClose: () => void;
}

/** The INT/EXT + DAY/NIGHT colour cell editor — shared by the Colours tab's
 *  scene matrix and the colour rule's custom matrix. Owns the draft colours
 *  until Apply; the parent owns the matrix entry. */
export const SceneCellEditModal: React.FC<SceneCellEditModalProps> = ({
  open, intExt, dayNight, background, text, palette, onApply, onClose,
}) => {
  const [bg, setBg] = useState(background);
  const [fg, setFg] = useState(text);

  // A different cell (or a re-open) restarts the draft from its entry.
  useEffect(() => {
    setBg(background);
    setFg(text);
  }, [background, text, intExt, dayNight, open]);

  if (!open) return null;

  const sizes = ruleModalSizes();
  const { CREM_CELL_BODY, CREM_TEXT } = sizes;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit: ${intExt} ${dayNight}`}
      width="max-w-sm"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={() => { onApply(bg, fg); onClose(); }}>Apply</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className={CREM_CELL_BODY}>
        <div className="flex items-center justify-between">
          <span className={`${CREM_TEXT} text-[color:var(--ui-text)]`}>Background</span>
          <ColorField value={bg} onChange={setBg} size="lg" swatchClass={IS_COARSE ? 'w-16 h-16' : ''} defaultValue={getNoteBannerColors(palette).background} />
        </div>
        <div className="flex items-center justify-between">
          <span className={`${CREM_TEXT} text-[color:var(--ui-text)]`}>Text Color</span>
          <ColorField value={fg} onChange={setFg} size="lg" swatchClass={IS_COARSE ? 'w-16 h-16' : ''} defaultValue={getNoteBannerColors(palette).color} />
        </div>
        <div className="w-full h-10 rounded border border-[color:var(--ui-card-border)] flex items-center justify-center text-sm font-bold" style={{ background: bg, color: fg }}>
          Aa
        </div>
      </div>
    </Modal>
  );
};
