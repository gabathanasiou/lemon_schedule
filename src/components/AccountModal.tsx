import React, { useEffect, useState } from 'react';
import { Apple, Loader2 } from 'lucide-react';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import { useSupabaseAuth } from '../lib/supabase/auth';
import { GoogleG } from './GoogleSignIn';

type Mode = 'signin' | 'signup' | 'reset';

const INPUT_CLASS = 'w-full px-3 py-2 bg-[var(--ui-panel-bg)] border border-[color:var(--ui-card-border)] rounded-md text-xs text-[color:var(--ui-input-text)] placeholder:text-[color:var(--ui-text-faint)] outline-none focus:border-[color:var(--ui-input-focus-border)] disabled:opacity-50 ui-input';
const SOCIAL_CLASS = 'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-[color:var(--ui-card-border)] bg-[var(--ui-input-bg)] hover:bg-[var(--ui-item-active-bg)] text-xs font-medium text-[color:var(--ui-input-text)] transition-colors';

/** The one account surface (roadmap 229 S1): email + password sign-in,
 *  account creation and password reset — plus Google / Apple buttons that
 *  appear ONLY when the Supabase project reports those providers enabled
 *  (never a dead button that lands on a raw provider error page).
 *
 *  App-level so the boot screen reaches it too — the signed-out Project
 *  Manager's Online tab and the header user cluster both open this instance.
 *  `notice` carries context (e.g. an invite link waiting to open). */
export function AccountModal({ open, onClose, notice }: { open: boolean; onClose: () => void; notice?: React.ReactNode }) {
  const auth = useSupabaseAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // The provider list can fail on a flaky boot — re-check when opening with
  // nothing cached, so the social buttons self-heal without a reload.
  useEffect(() => {
    if (open && !auth.providers) auth.refreshProviders();
  }, [open, auth]);

  if (!auth.isConfigured) return null;

  const close = () => {
    onClose();
    setMode('signin');
    setName('');
    setEmail('');
    setPassword('');
    setBusy(false);
    setError(null);
    setInfo(null);
  };

  const emailValid = /.+@.+\..+/.test(email.trim());
  const passwordValid = password.length >= 6;
  // A guest (anonymous sign-in from an invite link) converts IN PLACE — the
  // only mode is "create account"; the user id (and their access) survives.
  const anonymous = !!auth.account?.isAnonymous;
  const view: Mode = anonymous ? 'signup' : mode;

  const socials: { key: string; label: string; icon: React.ReactNode; onClick: () => void }[] = [];
  if (auth.providers?.googleEnabled) {
    socials.push({ key: 'google', label: 'Continue with Google', icon: <GoogleG />, onClick: auth.signInWithGoogle });
  }
  if (auth.providers?.appleEnabled) {
    socials.push({ key: 'apple', label: 'Continue with Apple', icon: <Apple className="w-4 h-4" />, onClick: auth.signInWithApple });
  }

  const submit = async () => {
    if (busy) return;
    setError(null);
    setInfo(null);

    if (view === 'signin') {
      if (!emailValid || !password) { setError('Enter your email and password.'); return; }
      setBusy(true);
      const err = await auth.signInWithPassword(email.trim(), password);
      setBusy(false);
      if (err) setError(err);
      else close();
      return;
    }

    if (view === 'signup') {
      if (!name.trim() && !anonymous) { setError('Add your name, so collaborators know who you are.'); return; }
      if (!emailValid || !passwordValid) { setError('Enter an email and a password of at least 6 characters.'); return; }
      setBusy(true);
      const { error: err, needsEmailConfirm } = anonymous
        ? await auth.upgradeAnonymousAccount(email.trim(), password, name)
        : await auth.signUpWithPassword(email.trim(), password, name);
      setBusy(false);
      if (err) setError(err);
      else if (needsEmailConfirm) setInfo(`Almost there — we sent a confirmation link to ${email.trim()}. Open it to finish creating your account (check spam if it takes a few minutes).`);
      else close();
      return;
    }

    // reset
    if (!emailValid) { setError('Enter your email.'); return; }
    setBusy(true);
    const err = await auth.sendPasswordReset(email.trim());
    setBusy(false);
    if (err) setError(err);
    else setInfo(`Reset link sent to ${email.trim()}. Open it on this device to choose a new password.`);
  };

  const title = view === 'signin' ? 'Sign in' : view === 'signup' ? 'Create your account' : 'Reset your password';
  const heroLabel = view === 'signin' ? 'Sign in' : view === 'signup' ? 'Create account' : 'Send reset link';

  const switchMode = (next: Mode) => {
    setMode(next);
    setPassword('');
    setError(null);
    setInfo(null);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      width="max-w-sm"
      footer={
        info ? (
          <ModalFooter>
            <ModalFooterButton data-modal-confirm onClick={close}>Done</ModalFooterButton>
          </ModalFooter>
        ) : (
          <ModalFooter>
            <ModalFooterButton variant="ghost" onClick={close} disabled={busy}>Cancel</ModalFooterButton>
            <ModalFooterButton data-modal-confirm disabled={busy} onClick={submit}>
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              {busy ? 'Please wait...' : heroLabel}
            </ModalFooterButton>
          </ModalFooter>
        )
      }
    >
      <div className="p-6 space-y-3">
        {notice && (
          <div className="rounded-md border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
            {notice}
          </div>
        )}
        {info ? (
          <p className="text-sm text-[color:var(--ui-text)]">{info}</p>
        ) : (
          <>
            <p className="text-xs text-[color:var(--ui-text-muted)]">
              {view === 'signin' && 'Sign in to collaborate on shared projects.'}
              {view === 'signup' && (anonymous
                ? 'Create an account to keep access to the projects shared with you.'
                : 'Create an account to collaborate on shared projects.')}
              {view === 'reset' && "We'll email you a link to choose a new password."}
            </p>

            {view !== 'reset' && socials.length > 0 && (
              <>
                <div className="space-y-2">
                  {socials.map(s => (
                    <button key={s.key} type="button" onClick={s.onClick} className={SOCIAL_CLASS}>
                      {s.icon}
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-[var(--ui-input-bg)]" />
                  <span className="text-[10px] uppercase tracking-wider text-[color:var(--ui-text-faint)]">or</span>
                  <div className="h-px flex-1 bg-[var(--ui-input-bg)]" />
                </div>
              </>
            )}

            {view === 'signup' && (
              <input
                autoFocus
                type="text"
                autoComplete="name"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
                placeholder="Your name"
                disabled={busy}
                className={INPUT_CLASS}
              />
            )}

            <input
              autoFocus={view !== 'signup'}
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
              placeholder="Email"
              disabled={busy}
              className={INPUT_CLASS}
            />

            {view !== 'reset' && (
              <input
                type="password"
                autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
                placeholder={view === 'signup' ? 'Password (at least 6 characters)' : 'Password'}
                disabled={busy}
                className={INPUT_CLASS}
              />
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}

            {view === 'signin' && (
              <div className="flex justify-end">
                <button type="button" onClick={() => switchMode('reset')} className="text-[11px] text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)] underline underline-offset-2">
                  Forgot password?
                </button>
              </div>
            )}

            <p className="text-xs text-[color:var(--ui-text-faint)] pt-1">
              {view === 'signin' && (
                auth.providers?.signupDisabled
                  ? 'New accounts are disabled on this deployment.'
                  : <>No account yet?{' '}
                      <button type="button" onClick={() => switchMode('signup')} className="text-emerald-400 hover:underline underline-offset-2">Create one</button>
                    </>
              )}
              {view === 'signup' && !anonymous && <>Already have an account?{' '}
                <button type="button" onClick={() => switchMode('signin')} className="text-emerald-400 hover:underline underline-offset-2">Sign in</button></>}
              {view === 'signup' && anonymous && 'You are browsing as a guest — this keeps your access and lets you sign in on other devices.'}
              {view === 'reset' && <>Remembered it?{' '}
                <button type="button" onClick={() => switchMode('signin')} className="text-emerald-400 hover:underline underline-offset-2">Back to sign in</button></>}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
