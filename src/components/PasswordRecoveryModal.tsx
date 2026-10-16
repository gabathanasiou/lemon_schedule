import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import { useSupabaseAuth } from '../lib/supabase/auth';

const INPUT_CLASS = 'w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 disabled:opacity-50 ui-input';

/** App-level password-recovery surface (may land on a fresh tab, so it renders
 *  over the boot screen too). Two states:
 *  - a VALID link (Supabase PASSWORD_RECOVERY event): choose a new password;
 *  - a DEAD link (expired/used — GoTrue returns error params, roadmap 278):
 *    explain it and offer a fresh link. */
export function PasswordRecoveryModal() {
  const auth = useSupabaseAuth();
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const linkError = auth.recoveryLinkError;
  if (!auth.pendingRecovery && !linkError) return null;

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

  const resend = async () => {
    if (busy) return;
    if (!email.trim()) { setError('Enter your email.'); return; }
    setBusy(true);
    setError(null);
    const err = await auth.sendPasswordReset(email.trim());
    setBusy(false);
    if (err) setError(err);
    else setSentTo(email.trim());
  };

  if (linkError) {
    return (
      <Modal
        open
        onClose={() => auth.dismissRecoveryLinkError()}
        title="Reset link didn't work"
        width="max-w-sm"
        footer={
          sentTo ? (
            <ModalFooter>
              <ModalFooterButton data-modal-confirm onClick={() => auth.dismissRecoveryLinkError()}>
                Done
              </ModalFooterButton>
            </ModalFooter>
          ) : (
            <ModalFooter>
              <ModalFooterButton variant="ghost" onClick={() => auth.dismissRecoveryLinkError()} disabled={busy}>
                Not now
              </ModalFooterButton>
              <ModalFooterButton data-modal-confirm onClick={resend} disabled={busy || !email.trim()}>
                {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                Send a new link
              </ModalFooterButton>
            </ModalFooter>
          )
        }
      >
        <div className="p-6 space-y-3">
          <p className="text-xs text-zinc-400">{linkError}</p>
          {sentTo ? (
            <p className="text-sm text-zinc-300">
              New reset link sent to {sentTo}. Open it on this device to choose a new password.
            </p>
          ) : (
            <input
              autoFocus
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void resend(); }}
              placeholder="Your email"
              disabled={busy}
              className={INPUT_CLASS}
            />
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </Modal>
    );
  }

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
