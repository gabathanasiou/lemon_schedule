import React, { useState } from 'react';
import { User as UserIcon, LogIn, LogOut, Cloud, Users, Loader2, Pencil, UserPlus } from 'lucide-react';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import { useProject } from '../store';
import { useSupabaseAuth } from '../lib/supabase/auth';
import { AccountAvatar } from './AccountAvatar';
import { ProfileModal } from './ProfileModal';

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
  /** Opens the app-level AccountModal (sign in / create account). */
  onOpenAccount: () => void;
  /** Opens the User & sharing panel for the open shared project (S2). */
  onManageSharing: () => void;
}

/** The header user cluster (roadmap 229 S1, docs/COLLABORATION.md §9).
 *  ONE component for account identity: signed out → muted Sign in avatar;
 *  signed in → avatar opening the account menu (Collaborate + sign out).
 *  Google Drive connect/disconnect lives here too (the File menu keeps
 *  project actions only). Renders nothing when the build has no Supabase env
 *  — the File menu then keeps the old Drive items. */
export function UserPresenceCluster({ driveCtx, isCloudProject, driveBacked, closeProject, onOpenAccount, onManageSharing }: UserPresenceClusterProps) {
  const auth = useSupabaseAuth();
  const { currentProjectId, projectList, state, collaborateProject } = useProject();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);
  const [collabBusy, setCollabBusy] = useState(false);
  const [collabError, setCollabError] = useState<string | null>(null);

  if (!auth.isConfigured || !auth.isReady) return null;

  const account = auth.account;
  const hover = isCloudProject ? 'hover:bg-blue-900/60' : 'hover:bg-zinc-800';
  const currentMeta = projectList.find(p => p.id === currentProjectId);
  // Guests (anonymous sessions) can't own shared projects — "Collaborate"
  // waits until they create an account.
  const canCollaborate = !!account && !account.isAnonymous && !!currentProjectId && !currentMeta?.onlineId;
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
      // Straight into the sharing panel — inviting is the next step.
      onManageSharing();
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
      Connect Google Drive
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
            title={account
              ? account.isAnonymous
                ? 'Guest — create an account to keep your access'
                : `${account.name || account.email} — account & sharing`
              : 'Sign in to collaborate'}
          >
            {account ? (
              <AccountAvatar account={account} className="w-full h-full" />
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
            {account.isAnonymous ? (
              <DropdownItem
                onClick={() => { setMenuOpen(false); onOpenAccount(); }}
                icon={<UserPlus className="w-3.5 h-3.5" />}
              >
                Create account...
              </DropdownItem>
            ) : (
              <DropdownItem
                onClick={() => { setMenuOpen(false); setProfileOpen(true); }}
                icon={<Pencil className="w-3.5 h-3.5" />}
              >
                Edit profile...
              </DropdownItem>
            )}
            {canCollaborate && (
              <DropdownItem
                onClick={() => { setMenuOpen(false); setCollabOpen(true); }}
                icon={<Users className="w-3.5 h-3.5" />}
              >
                Collaborate...
              </DropdownItem>
            )}
            {account && currentMeta?.onlineId && (
              <DropdownItem
                onClick={() => { setMenuOpen(false); onManageSharing(); }}
                icon={<Users className="w-3.5 h-3.5" />}
              >
                Manage Shared Project...
              </DropdownItem>
            )}
            <DropdownItem
              onClick={() => {
                setMenuOpen(false);
                // Signing out with a shared project open returns to the
                // opening page — parity with disconnecting Drive closing a
                // Drive project. (A silent session expiry only locks the
                // project read-only; the user can sign back in and resume.)
                if (currentMeta?.onlineId) closeProject();
                void auth.signOut();
              }}
              icon={<LogOut className="w-3.5 h-3.5" />}
            >
              Sign out
            </DropdownItem>
          </>
        ) : (
          <DropdownItem
            onClick={() => { setMenuOpen(false); onOpenAccount(); }}
            icon={<LogIn className="w-3.5 h-3.5" />}
          >
            Sign in / Create account...
          </DropdownItem>
        )}
        <DropdownDivider />
        {driveItem}
    </DropdownMenu>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />

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
