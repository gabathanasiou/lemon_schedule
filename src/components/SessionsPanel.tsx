import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Button from './Button';
import { useDialog } from './Dialog';
import { AccountAvatar } from './AccountAvatar';
import { useSupabaseAuth } from '../lib/supabase/auth';
import { SectionLabel } from './sharing/sharingParts';

/**
 * Sessions panel (roadmap 266) — the account settings modal's third tab.
 * Supabase owns the session list server-side; what the user needs is control:
 * the default sign-out is LOCAL (one device), and this surface adds the two
 * deliberate wider scopes — "other devices" (`others`, this device stays in)
 * and "everywhere" (`global`, this device included, behind a confirm). The
 * people-language here is the counterpart of the 229 hardening: a session can
 * never silently widen its reach, and a stray one can always be killed.
 */
export function SessionsPanel({ onSignedOutEverywhere }: { onSignedOutEverywhere?: () => void }) {
  const auth = useSupabaseAuth();
  const dialog = useDialog();
  const [busy, setBusy] = useState<null | 'others' | 'everywhere'>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runOthers = async () => {
    if (busy) return;
    setBusy('others');
    setNotice(null);
    setError(null);
    try {
      await auth.signOutOtherDevices();
      setNotice('Other devices signed out. This device stays signed in.');
    } catch (e: any) {
      setError(e?.message || 'Could not sign out other devices.');
    } finally {
      setBusy(null);
    }
  };

  const runEverywhere = () => {
    if (busy) return;
    void (async () => {
      const ok = await dialog.confirm({
        title: 'Sign out everywhere?',
        message: 'Every device signed in to this account is signed out, including this one. You will need to sign in again.',
        danger: true,
      });
      if (!ok) return;
      setBusy('everywhere');
      setNotice(null);
      setError(null);
      try {
        await auth.signOutEverywhere();
        onSignedOutEverywhere?.();
      } catch (e: any) {
        setError(e?.message || 'Could not sign out everywhere.');
      } finally {
        setBusy(null);
      }
    })();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <AccountAvatar account={auth.account} className="w-10 h-10" />
        <div className="min-w-0">
          <div className="text-sm text-[color:var(--ui-input-text)] truncate">{auth.account?.name || 'Signed in'}</div>
          <div className="text-xs text-[color:var(--ui-text-faint)] truncate">This device is signed in.</div>
        </div>
      </div>

      <section className="space-y-2">
        <SectionLabel>Other devices</SectionLabel>
        <p className="text-[11px] text-[color:var(--ui-text-faint)]">
          Sign out every other device that is signed in to this account. This device stays signed in.
        </p>
        <Button variant="solid" onClick={() => void runOthers()} disabled={busy !== null}>
          {busy === 'others' && <Loader2 className="w-3 h-3 animate-spin" />}
          Sign out other devices
        </Button>
      </section>

      <section className="space-y-2">
        <SectionLabel>Everywhere</SectionLabel>
        <p className="text-[11px] text-[color:var(--ui-text-faint)]">
          Sign out every device, including this one. As a safety net, sessions also expire automatically after six months.
        </p>
        <Button variant="danger-ghost" theme="dark" onClick={runEverywhere} disabled={busy !== null}>
          {busy === 'everywhere' && <Loader2 className="w-3 h-3 animate-spin" />}
          Sign out everywhere
        </Button>
      </section>

      {notice && <p className="text-xs text-emerald-400">{notice}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
