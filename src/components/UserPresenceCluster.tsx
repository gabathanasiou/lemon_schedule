import React, { useState } from 'react';
import { User as UserIcon, Mail, LogOut, Cloud, Users, Loader2 } from 'lucide-react';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import { useDialog } from './Dialog';
import { useProject } from '../store';
import { useSupabaseAuth } from '../lib/supabase/auth';
import { GoogleG } from './GoogleSignIn';

/** The Google Drive sign-in surface (moved out of the File menu when the
 *  cluster ships — docs/COLLABORATION.md §9). Same shape AppHeader receives. */
interface DriveAuth {
  isSignedIn: boolean;
  user?: { name?: string } | null;
  signIn: () => void;
  signOut: () => void;
}

interface UserPresenceClusterProps {
  driveCtx: DriveAuth;
  isCloudProject: boolean;
  /** The open project is Drive-backed — disconnecting Drive must close it. */
  driveBacked: boolean;
  closeProject: () => void;
}

/** The header user cluster (roadmap 229 S1, docs/COLLABORATION.md §9).
 *  ONE component for account identity: signed out → muted Sign in avatar;
 *  signed in → avatar opening the account menu (Collaborate + sign out).
 *  Google Drive connect/disconnect lives here too (the File menu keeps
 *  project actions only). Renders nothing when the build has no Supabase env
 *  — the File menu then keeps the old Drive items. */
export function UserPresenceCluster({ driveCtx, isCloudProject, driveBacked, closeProject }: UserPresenceClusterProps) {
  const auth = useSupabaseAuth();
  const dialog = useDialog();
  const { currentProjectId, projectList, state, collaborateProject } = useProject();
  const [menuOpen, setMenuOpen] = useState(false);
  const [magicOpen, setMagicOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);
  const [collabBusy, setCollabBusy] = useState(false);
  const [collabError, setCollabError] = useState<string | null>(null);

  if (!auth.isConfigured || !auth.isReady) return null;

  const account = auth.account;
  const hover = isCloudProject ? 'hover:bg-blue-900/60' : 'hover:bg-zinc-800';
  const currentMeta = projectList.find(p => p.id === currentProjectId);
  const canCollaborate = !!account && !!currentProjectId && !currentMeta?.onlineId;
  const projectTitle = state.present.title || 'Untitled Project';

  const closeCollab = () => {
    setCollabOpen(false);
    setCollabError(null);
  };

  const runCollaborate = async () => {
    if (!currentProjectId || collabBusy) return;
    setCollabBusy(true);
    setCollabError(null);
    try {
      await collaborateProject(currentProjectId);
      setCollabOpen(false);
      void dialog.alert({
        title: 'Added to shared projects',
        message: `"${projectTitle}" now saves automatically. Inviting other people arrives in a later update.`,
      });
    } catch (e: any) {
      setCollabError(e?.message || 'Could not add the project to your shared projects.');
    } finally {
      setCollabBusy(false);
    }
  };

  const driveItem = driveCtx.isSignedIn ? (
    <DropdownItem
      onClick={() => { setMenuOpen(false); if (driveBacked) closeProject(); driveCtx.signOut(); }}
      icon={<Cloud className="w-3.5 h-3.5" />}
    >
      Disconnect Google Drive{driveCtx.user?.name ? ` (${driveCtx.user.name})` : ''}
    </DropdownItem>
  ) : (
    <DropdownItem
      onClick={() => { setMenuOpen(false); driveCtx.signIn(); }}
      icon={<Cloud className="w-3.5 h-3.5" />}
    >
      Sign in with Google Drive...
    </DropdownItem>
  );

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        align="right"
        width="w-64"
        theme={isCloudProject ? 'blue' : 'dark'}
        trigger={
          <button
            data-testid="user-cluster"
            className={`flex items-center justify-center w-7 h-7 rounded-full border overflow-hidden transition-colors cursor-pointer select-none ${hover} ${account ? 'border-white/25' : 'border-white/15 bg-white/5 text-zinc-400 hover:text-white'}`}
            title={account ? `${account.name || account.email} — account & sharing` : 'Sign in to collaborate'}
          >
            {account ? (
              account.avatarUrl ? (
                <img src={account.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="w-full h-full flex items-center justify-center bg-emerald-700 text-[11px] font-bold text-white">
                  {(account.name || account.email || '?')[0].toUpperCase()}
                </span>
              )
            ) : (
              <UserIcon className="w-4 h-4" />
            )}
          </button>
        }
      >
        {account ? (
          <>
            <DropdownItem onClick={() => {}} disabled>
              {account.name || account.email}
            </DropdownItem>
            {canCollaborate && (
              <DropdownItem
                onClick={() => { setMenuOpen(false); setCollabOpen(true); }}
                icon={<Users className="w-3.5 h-3.5" />}
              >
                Collaborate...
              </DropdownItem>
            )}
            <DropdownItem
              onClick={() => { void auth.signOut(); }}
              icon={<LogOut className="w-3.5 h-3.5" />}
            >
              Sign out
            </DropdownItem>
          </>
        ) : (
          <>
            <DropdownItem
              onClick={() => { setMenuOpen(false); auth.signInWithGoogle(); }}
              icon={<GoogleG />}
            >
              Sign in with Google
            </DropdownItem>
            <DropdownItem
              onClick={() => { setMenuOpen(false); setMagicOpen(true); }}
              icon={<Mail className="w-3.5 h-3.5" />}
            >
              Email me a magic link...
            </DropdownItem>
          </>
        )}
        <DropdownDivider />
        {driveItem}
      </DropdownMenu>

      <MagicLinkModal open={magicOpen} onClose={() => setMagicOpen(false)} />

      <Modal
        open={collabOpen}
        onClose={closeCollab}
        title="Collaborate on this project"
        width="max-w-md"
        footer={
          <ModalFooter>
            <ModalFooterButton variant="ghost" onClick={closeCollab} disabled={collabBusy}>
              Cancel
            </ModalFooterButton>
            <ModalFooterButton data-modal-confirm onClick={runCollaborate} disabled={collabBusy}>
              {collabBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
              {collabBusy ? 'Copying...' : 'Collaborate'}
            </ModalFooterButton>
          </ModalFooter>
        }
      >
        <div className="p-6 space-y-3">
          <p className="text-sm text-zinc-300">
            <span className="font-medium text-white">{projectTitle}</span> will be added to your
            shared projects and kept in sync automatically.
          </p>
          <p className="text-xs text-zinc-400">
            Shared projects sync over the internet — you'll need a connection while you work on
            this one.
          </p>
          {collabError && <p className="text-xs text-red-400">{collabError}</p>}
        </div>
      </Modal>
    </>
  );
}

/** Email magic-link sign-in (Supabase OTP). The link returns to the app and
 *  `detectSessionInUrl` finishes the sign-in — same device recommended. */
function MagicLinkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useSupabaseAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    onClose();
    setEmail('');
    setSentTo(null);
    setError(null);
    setSending(false);
  };

  const valid = /.+@.+\..+/.test(email.trim());
  const send = async () => {
    if (!valid || sending) return;
    setSending(true);
    setError(null);
    const err = await auth.sendMagicLink(email.trim());
    setSending(false);
    if (err) setError(err);
    else setSentTo(email.trim());
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Sign in with email"
      width="max-w-sm"
      footer={
        sentTo ? (
          <ModalFooter>
            <ModalFooterButton data-modal-confirm onClick={close}>
              Done
            </ModalFooterButton>
          </ModalFooter>
        ) : (
          <ModalFooter>
            <ModalFooterButton variant="ghost" onClick={close} disabled={sending}>
              Cancel
            </ModalFooterButton>
            <ModalFooterButton data-modal-confirm disabled={!valid || sending} onClick={send}>
              {sending ? 'Sending...' : 'Send magic link'}
            </ModalFooterButton>
          </ModalFooter>
        )
      }
    >
      <div className="p-6 space-y-3">
        {sentTo ? (
          <p className="text-sm text-zinc-300">
            Magic link sent to <span className="font-medium text-white">{sentTo}</span>.
            Open it on this device to finish signing in.
          </p>
        ) : (
          <>
            <p className="text-xs text-zinc-400">
              We'll email you a one-time link — no password, no account setup.
            </p>
            <input
              autoFocus
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void send(); }}
              placeholder="you@example.com"
              disabled={sending}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 disabled:opacity-50 ui-input"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
