import React from 'react';
import { Loader2, Users } from 'lucide-react';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';

interface CollaborateModalProps {
  open: boolean;
  projectTitle: string;
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onCollaborate: () => void;
}

/** "Collaborate on this project" — the one-time copy of a local/Drive project
 *  into the account's shared (online) projects. The cluster owns the commit;
 *  this file is the presentation surface. */
export function CollaborateModal({ open, projectTitle, busy, error, onCancel, onCollaborate }: CollaborateModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Collaborate on this project"
      width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </ModalFooterButton>
          <ModalFooterButton data-modal-confirm onClick={onCollaborate} disabled={busy}>
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
            {busy ? 'Copying...' : 'Collaborate'}
          </ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-3">
        <p className="text-sm text-[color:var(--ui-text)]">
          <span className="font-medium text-white">{projectTitle}</span> will be added to your
          shared projects and kept in sync automatically.
        </p>
        <p className="text-xs text-[color:var(--ui-text-muted)]">
          Shared projects sync over the internet — you'll need a connection while you work on
          this one.
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
