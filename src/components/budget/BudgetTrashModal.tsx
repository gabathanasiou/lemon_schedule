import React from 'react';
import { RotateCcw } from 'lucide-react';
import type { BudgetVersionTrashItem } from '../../types';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';

/** Budget version trash (roadmap 334) — ONE modal shared by the version menu;
 *  extracted so the Modals Studio can preview the restore list. */
export function BudgetTrashModal({
  open, onClose, trash, onRestore,
}: {
  open: boolean;
  onClose: () => void;
  trash: BudgetVersionTrashItem[];
  onRestore: (versionId: string) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Budget version trash"
      width="max-w-lg"
      footer={<ModalFooter><ModalFooterButton onClick={onClose}>Close</ModalFooterButton></ModalFooter>}
    >
      <div className="px-5 py-3 max-h-[55vh] overflow-y-auto scrollbar-custom">
        {trash.length === 0 && (
          <div className="text-xs text-[color:var(--ui-text-faint)] py-6 text-center">No deleted budget versions.</div>
        )}
        {trash.map(item => (
          <div key={item.version.id} className="flex items-center justify-between gap-3 py-2 border-b border-[color:var(--ui-border)] last:border-0">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[color:var(--ui-text-strong)] truncate">{item.version.name}</div>
              <div className="text-[10px] text-[color:var(--ui-text-faint)]">
                {new Date(item.deletedAt).toLocaleDateString()} · {item.version.lines.length} lines
              </div>
            </div>
            <Button theme="light" onClick={() => { onRestore(item.version.id); onClose(); }}>
              <RotateCcw className="w-3 h-3" /> Restore
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
