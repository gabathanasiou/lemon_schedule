import React, { useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';

interface NewProjectModalProps {
  open: boolean;
  isCloud: boolean;
  name: string;
  onNameChange: (v: string) => void;
  creating: boolean;
  onCancel: () => void;
  onCreate: () => void;
}

export default function NewProjectModal({ open, isCloud, name, onNameChange, creating, onCancel, onCreate }: NewProjectModalProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => nameInputRef.current?.select(), 50);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={isCloud ? 'New Cloud Project' : 'New Project'}
      width="max-w-sm"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onCancel} disabled={creating}>
            Cancel
          </ModalFooterButton>
          <ModalFooterButton
            data-modal-confirm
            disabled={creating || !name.trim()}
            onClick={onCreate}
          >
            {creating && <Loader2 className="w-3 h-3 animate-spin" />}
            {creating ? 'Creating...' : 'Create'}
          </ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-5">
        <input
          ref={nameInputRef}
          value={name}
          onChange={e => onNameChange(e.target.value)}
          disabled={creating}
          placeholder="Project name"
          autoFocus
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 disabled:opacity-50 ui-input"
        />
      </div>
    </Modal>
  );
}
