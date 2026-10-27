import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from './Modal';
import { AccountModal } from './AccountModal';
import { useDialog } from './Dialog';
import { useProject } from '../store';
import { useSupabaseAuth } from '../lib/supabase/auth';
import { redeemShareLink } from '../lib/supabase/sharing';
import { parseShareTokenFromHash } from '../lib/shareTokens';

/**
 * Invite-link entry (roadmap 229 S2): a `#/share/<token>` URL captures the
 * token before the router sees it, strips the hash, then redeems it
 * (server-side hash check + membership) and opens the project.
 *
 * No account form when the project has anonymous sign-ins enabled: the
 * visitor gets a silent guest session (device-local; it can be converted to
 * a real account later from the avatar menu) and is let straight in. When
 * anonymous sign-ins are off (or fail), the account modal with an invite
 * notice is the fallback.
 *
 * Mounted app-level AFTER AppContent so its modals stack on top of the boot
 * Project Manager (Radix stack order = DOM order).
 */
export function ShareLinkGate() {
  const { openProject, refetchOnlineProjects } = useProject();
  const auth = useSupabaseAuth();
  const dialog = useDialog();
  const [token, setToken] = useState<string | null>(() => parseShareTokenFromHash(window.location.hash));
  const [dismissed, setDismissed] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [guestFailed, setGuestFailed] = useState(false);
  // One redemption per captured token: provider state changes after
  // openProject re-create its callback identity, which would restart (and
  // cancel) this effect in a loop.
  const startedRef = useRef(false);
  const guestTriedRef = useRef(false);
  const providersTriedRef = useRef(false);

  // The router must never adopt `#/share/...` — clear it as soon as captured.
  useEffect(() => {
    if (parseShareTokenFromHash(window.location.hash)) {
      window.history.replaceState(window.history.state, '', '#/');
    }
  }, []);

  // The gate needs the anonymous-sign-ins flag to pick the no-account path.
  // Always re-read the settings once per captured token: the value is cached
  // at app boot, so a toggle flipped while this tab is open must be picked up
  // without a hard reload.
  useEffect(() => {
    if (!token || !auth.isConfigured || providersTriedRef.current) return;
    providersTriedRef.current = true;
    auth.refreshProviders();
  }, [token, auth]);

  // Silent guest session (anonymous sign-in) — no form for link visitors.
  const anonymousEnabled = !!auth.providers?.anonymousEnabled;
  useEffect(() => {
    if (!token || dismissed || !auth.isReady || auth.account || !anonymousEnabled || guestTriedRef.current) return;
    guestTriedRef.current = true;
    void auth.signInAnonymously().then(err => { if (err) setGuestFailed(true); });
  }, [token, auth, dismissed, auth.isReady, auth.account, anonymousEnabled]);

  useEffect(() => {
    if (!token || !auth.isReady || !auth.account || startedRef.current) return;
    startedRef.current = true;
    setRedeeming(true);
    void (async () => {
      try {
        const projectId = await redeemShareLink(token);
        if (!projectId) throw new Error('This invite link is no longer valid — ask for a new one.');
        await openProject(projectId, undefined, projectId);
        refetchOnlineProjects();
        setToken(null);
      } catch (e: any) {
        setToken(null);
        await dialog.alert({ title: 'Could not open the shared project', message: e?.message || 'Something went wrong.' });
      } finally {
        setRedeeming(false);
      }
    })();
  }, [token, auth.isReady, auth.account, openProject, refetchOnlineProjects, dialog]);

  if (!token || !auth.isConfigured) return null;

  const waitingForGuest = !auth.account && anonymousEnabled && !guestFailed;

  if (auth.account || waitingForGuest) {
    return (
      <Modal open onClose={() => {}} title="Opening shared project" width="max-w-xs" closable={false}>
        <div className="p-6 flex items-center gap-3 text-xs text-[color:var(--ui-text)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          {redeeming ? 'Opening the shared project…' : 'Letting you in…'}
        </div>
      </Modal>
    );
  }

  return !dismissed ? (
    <AccountModal
      open
      onClose={() => setDismissed(true)}
      notice="You've been invited to collaborate on a shared project. Sign in or create an account to open it."
    />
  ) : null;
}
