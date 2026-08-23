import React from 'react';
import Modal, { ModalFooter } from '../Modal';
import { DatabaseManagerView } from '../../lib/managerShell';
import { dayTypesManagerConfig } from '../../lib/dayTypesManagerConfig';

/** Day Types manager — the shared ManagerShell database engine in a modal,
 *  opened from the calendar View menu. */
export const DayTypesManagerModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Day Types"
    width="max-w-3xl"
    footer={
      <ModalFooter>
        <button
          onPointerDown={(e) => { e.preventDefault(); onClose(); }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          Close
        </button>
      </ModalFooter>
    }
  >
    <div className="p-6 h-[70vh]">
      <div className="h-full flex">
        <DatabaseManagerView config={dayTypesManagerConfig} />
      </div>
    </div>
  </Modal>
);