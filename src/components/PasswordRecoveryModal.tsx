import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import { useSupabaseAuth } from '../lib/supabase/auth';

const INPUT_CLASS = 'w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 disabled:opacity-50 ui-input';

/** Shown when a password-reset link brings the user in (Supabase
 *  PASSWORD_RECOVERY event): choose a new password. App-level so it renders
 *  over the boot screen too — the link may open in a fresh tab. */
export function PasswordRecoveryModal() {
  const auth = useSupabaseAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!auth.pendingRecovery) return null;

  const save = async () => {
    if (busy) return;
    if (password.length < 6) { setError('Use at least 6 characters.'); return; }
    setBusy(true);
    setError(null);
    const err = await auth.completePasswordRecovery(password);
    setBusy(false);
    if (err) setError(err);
    else setPassword('');
  };

  return (
    <Modal
      open
      onClose={() => auth.dismissRecovery()}
      title="Set a new password"
      width="max-w-sm"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={() => auth.dismissRecovery()} disabled={busy}>
            Not now
          </ModalFooterButton>
          <ModalFooterButton data-modal-confirm onClick={save} disabled={busy || password.length < 6}>
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            Save password
          </ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-3">
        <p className="text-xs text-zinc-400">
          You're signed in{auth.account?.email ? <> as <span className="text-zinc-200">{auth.account.email}</span></> : null} —
          choose a new password.
        </p>
        <input
          autoFocus
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void save(); }}
          placeholder="New password (at least 6 characters)"
          disabled={busy}
          className={INPUT_CLASS}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
