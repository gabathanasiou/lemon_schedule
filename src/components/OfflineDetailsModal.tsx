import React from 'react';
import { CloudOff, Loader2, WifiOff } from 'lucide-react';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';

/** Why editing is paused: connectivity, or a signed-out session (a missing
 *  Supabase session on a shared project, a missing/expired Drive session). */
export type OfflineDetailsIssue = 'offline' | 'signed-out-shared' | 'signed-out-drive';

interface OfflineDetailsModalProps {
  open: boolean;
  issue: OfflineDetailsIssue;
  /** Offline only — a retry is in flight. */
  retrying?: boolean;
  onClose: () => void;
  /** Retry the connection, or start the matching sign-in flow. */
  onAction: () => void;
}

const COPY: Record<OfflineDetailsIssue, { title: string; body: string }> = {
  offline: {
    title: "You're offline",
    body: 'This cloud project needs an internet connection to stay in sync. You can keep browsing, but editing is paused until your connection returns.',
  },
  'signed-out-shared': {
    title: 'Signed out',
    body: 'This shared project needs a signed-in account to stay in sync with the rest of the team. Sign in again to resume live collaboration.',
  },
  'signed-out-drive': {
    title: 'Signed out',
    body: 'You have been signed out of Google Drive. Sign in again to resume editing your cloud project.',
  },
};

export function OfflineDetailsModal({ open, issue, retrying = false, onClose, onAction }: OfflineDetailsModalProps) {
  const isAuthIssue = issue !== 'offline';
  const copy = COPY[issue];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copy.title}
      icon={isAuthIssue ? <CloudOff className="w-5 h-5 text-amber-400" /> : <WifiOff className="w-5 h-5 text-[color:var(--ui-text-muted)]" />}
      width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>
            OK
          </ModalFooterButton>
          <ModalFooterButton onClick={onAction} disabled={!isAuthIssue && retrying}>
            {!isAuthIssue && retrying && <Loader2 className="w-3 h-3 animate-spin" />}
            {isAuthIssue ? 'Sign in' : retrying ? 'Reconnecting...' : 'Retry Connection'}
          </ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-5 py-3 text-[color:var(--ui-text-muted)] text-xs border-b border-[color:var(--ui-border)]">
        {copy.body}
      </div>
    </Modal>
  );
}
