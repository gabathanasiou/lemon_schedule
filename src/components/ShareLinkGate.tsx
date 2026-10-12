import React, { useEffect, useState } from 'react';
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
 * token before the router sees it, strips the hash, then — once the visitor
 * is signed in — redeems it (server-side hash check + membership) and opens
 * the project. Signed-out visitors get the account modal with an invite
 * notice; redemption resumes automatically after sign-in.
 *
 * Mounted app-level (inside the providers) so it survives the boot-screen →
 * project transition.
 */
export function ShareLinkGate() {
  const { openProject, refetchOnlineProjects } = useProject();
  const auth = useSupabaseAuth();
  const dialog = useDialog();
  const [token, setToken] = useState<string | null>(() => parseShareTokenFromHash(window.location.hash));
  const [redeeming, setRedeeming] = useState(false);

  // The router must never adopt `#/share/...` — clear it as soon as captured.
  useEffect(() => {
    if (parseShareTokenFromHash(window.location.hash)) {
      window.history.replaceState(window.history.state, '', '#/');
    }
  }, []);

  useEffect(() => {
    if (!token || !auth.isReady || !auth.account) return;
    let cancelled = false;
    setRedeeming(true);
    void (async () => {
      try {
        const projectId = await redeemShareLink(token);
        if (!projectId) throw new Error('This invite link is no longer valid — ask for a new one.');
        await openProject(projectId, undefined, projectId);
        refetchOnlineProjects();
        if (!cancelled) setToken(null);
      } catch (e: any) {
        if (!cancelled) {
          setToken(null);
          await dialog.alert({ title: 'Could not open the shared project', message: e?.message || 'Something went wrong.' });
        }
      } finally {
        if (!cancelled) setRedeeming(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, auth.isReady, auth.account, openProject, refetchOnlineProjects, dialog]);

  if (!token || !auth.isConfigured) return null;

  return (
    <>
      {auth.account ? (
        <Modal open onClose={() => {}} title="Opening shared project" width="max-w-xs" closable={false}>
          <div className="p-6 flex items-center gap-3 text-xs text-zinc-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            {redeeming ? 'Opening the shared project…' : 'Preparing…'}
          </div>
        </Modal>
      ) : (
        <AccountModal
          open
          onClose={() => setToken(null)}
          notice="You've been invited to collaborate on a shared project. Sign in or create an account to open it."
        />
      )}
    </>
  );
}
