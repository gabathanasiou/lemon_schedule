import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import { isImeConfirm } from '../lib/keys';

const INPUT_CLASS = 'w-full px-3 py-2 bg-[var(--ui-panel-bg)] border border-[color:var(--ui-card-border)] rounded-md text-xs text-[color:var(--ui-input-text)] placeholder:text-[color:var(--ui-text-faint)] outline-none focus:border-[color:var(--ui-input-focus-border)] disabled:opacity-50 ui-input';

/** The two REAL states of the app-level password-recovery surface (roadmap
 *  278): a valid link (choose a new password) and a dead/expired link (explain
 *  and offer a fresh one). The auth provider (`PasswordRecoveryModal`) owns
 *  which state is live; this component owns only the form's presentation. */
export type PasswordRecoveryDialogState =
  | { kind: 'choose'; email?: string | null }
  | { kind: 'expired'; message: string };

interface PasswordRecoveryDialogProps {
  state: PasswordRecoveryDialogState;
  /** Complete the recovery — resolves with a human-readable error, or null. */
  onSave: (password: string) => Promise<string | null>;
  /** Email a fresh reset link — resolves with a human-readable error, or null. */
  onResend: (email: string) => Promise<string | null>;
  onDismiss: () => void;
}

export function PasswordRecoveryDialog({ state, onSave, onResend, onDismiss }: PasswordRecoveryDialogProps) {
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    if (password.length < 6) { setError('Use at least 6 characters.'); return; }
    setBusy(true);
    setError(null);
    const err = await onSave(password);
    setBusy(false);
    if (err) setError(err);
    else setPassword('');
  };

  const resend = async () => {
    if (busy) return;
    if (!email.trim()) { setError('Enter your email.'); return; }
    setBusy(true);
    setError(null);
    const err = await onResend(email.trim());
    setBusy(false);
    if (err) setError(err);
    else setSentTo(email.trim());
  };

  if (state.kind === 'expired') {
    return (
      <Modal
        open
        onClose={onDismiss}
        title="Reset link didn't work"
        width="max-w-sm"
        footer={
          sentTo ? (
            <ModalFooter>
              <ModalFooterButton data-modal-confirm onClick={onDismiss}>
                Done
              </ModalFooterButton>
            </ModalFooter>
          ) : (
            <ModalFooter>
              <ModalFooterButton variant="ghost" onClick={onDismiss} disabled={busy}>
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
          <p className="text-xs text-[color:var(--ui-text-muted)]">{state.message}</p>
          {sentTo ? (
            <p className="text-sm text-[color:var(--ui-text)]">
              New reset link sent to {sentTo}. Open it on this device to choose a new password.
            </p>
          ) : (
            <input
              autoFocus
              type="email"
              autoComplete="email"
              enterKeyHint="go"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !isImeConfirm(e)) void resend(); }}
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
      onClose={onDismiss}
      title="Set a new password"
      width="max-w-sm"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onDismiss} disabled={busy}>
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
        <p className="text-xs text-[color:var(--ui-text-muted)]">
          You're signed in{state.email ? <> as <span className="text-[color:var(--ui-input-text)]">{state.email}</span></> : null} —
          choose a new password.
        </p>
        <input
          autoFocus
          type="password"
          autoComplete="new-password"
          enterKeyHint="done"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !isImeConfirm(e)) void save(); }}
          placeholder="New password (at least 6 characters)"
          disabled={busy}
          className={INPUT_CLASS}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
