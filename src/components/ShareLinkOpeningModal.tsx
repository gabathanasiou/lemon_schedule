import React from 'react';
import { Loader2 } from 'lucide-react';
import Modal from './Modal';

/** Invite-link splash: the silent guest session is being created, or the
 *  link is being redeemed. Deliberately not closable — the gate owns the one
 *  in-flight redemption. Extracted from `ShareLinkGate` for the Modals Studio. */
export function ShareLinkOpeningModal({ redeeming }: { redeeming: boolean }) {
  return (
    <Modal open onClose={() => {}} title="Opening shared project" width="max-w-xs" closable={false}>
      <div className="p-6 flex items-center gap-3 text-xs text-[color:var(--ui-text)]">
        <Loader2 className="w-4 h-4 animate-spin" />
        {redeeming ? 'Opening the shared project…' : 'Letting you in…'}
      </div>
    </Modal>
  );
}
