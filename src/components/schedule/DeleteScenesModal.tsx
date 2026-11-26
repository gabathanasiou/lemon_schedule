import React, { useEffect, useState } from 'react';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Checkbox from '../Checkbox';

interface DeleteScenesModalProps {
  open: boolean;
  /** The scene number, or "N scenes" for a multi-row delete. */
  label: string;
  /** Multi-scene copy ("Delete Scenes" / "delete the scenes"). */
  plural: boolean;
  onClose: () => void;
  /** Confirmed — the host performs the delete and the 24h suppression. */
  onConfirm: (suppressWarning: boolean) => void;
}

/** Destructive confirm for deleting one or several scenes from the Breakdown
 *  grid (owned by BreakdownTabGlide). The 24-hour "don't ask again" checkbox
 *  lives here; the host decides whether to show the modal at all. */
export default function DeleteScenesModal({
  open,
  label,
  plural,
  onClose,
  onConfirm,
}: DeleteScenesModalProps) {
  const [suppressWarning, setSuppressWarning] = useState(false);

  useEffect(() => {
    if (!open) setSuppressWarning(false);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={plural ? 'Delete Scenes' : 'Delete Scene'}
      width="max-w-sm"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>
            Cancel
          </ModalFooterButton>
          <ModalFooterButton
            variant="danger-solid"
            onClick={() => onConfirm(suppressWarning)}
          >
            Delete
          </ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-5 py-4 space-y-4">
        <p className="text-sm text-[color:var(--ui-text)]">
          Are you sure you want to delete{plural ? '' : ' scene'} <span className="font-semibold text-[color:var(--ui-text-strong)]">{label}</span>?
        </p>
        <Checkbox
          block
          checked={suppressWarning}
          onChange={setSuppressWarning}
          tone="danger"
          label="Don't ask again (24 hours)"
        />
      </div>
    </Modal>
  );
}
