import React, { useState } from 'react';
import { User as UserIcon, LogIn, LogOut, Cloud, Users, Loader2, Settings, UserPlus } from 'lucide-react';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import { useProject } from '../store';
import { useSupabaseAuth } from '../lib/supabase/auth';
import type { SupabaseAccount } from '../lib/supabase/auth';
import { usePresenceActions, usePresenceState } from '../lib/supabase/presenceContext';
import type { PresencePeer } from '../lib/supabase/presence';
import { AccountAvatar } from './AccountAvatar';
import { PresenceDots } from './PresenceDots';
import { AccountSettingsModal } from './AccountSettingsModal';

const MAX_BUBBLES = 3;

/** Presence peers render through the same avatar identity as accounts. */
function peerAccount(peer: PresencePeer): SupabaseAccount {
  return { id: peer.userId, email: null, name: peer.name, avatarUrl: peer.avatarUrl, isAnonymous: peer.isGuest };
}

/** The Google Drive sign-in surface (moved out of the File menu when the
 *  cluster ships — docs/PRESENCE.md). Same shape AppHeader receives. */
interface DriveAuth {
  isSignedIn: boolean;
  user?: { name?: string } | null;
  signIn: () => void;
  signOut: () => void;
}

interface UserPresenceClusterProps {
  driveCtx: DriveAuth;
  /** The open project is Drive-backed — disconnecting Drive must close it. */
  driveBacked: boolean;
  closeProject: () => void;
  /** Opens the app-level AccountModal (sign in / create account). */
  onOpenAccount: () => void;
  /** Opens the User & sharing panel for the open shared project (S2). */
  onManageSharing: () => void;
  /** Spacing hook (roadmap 264) — the cluster's separation from the bar's
   *  other controls. Applies only when the cluster actually renders, so a
   *  build without Supabase env adds no stray margin. */
  className?: string;
}

/** The header user cluster (roadmap 229 S1, docs/PRESENCE.md).
 *  ONE component for account identity: signed out → muted Sign in avatar;
 *  signed in → avatar opening the account menu (Collaborate + sign out).
 *  Google Drive connect/disconnect lives here too (the File menu keeps
 *  project actions only). Renders nothing when the build has no Supabase env
 *  — the File menu then keeps the old Drive items. */
export function UserPresenceCluster({ driveCtx, driveBacked, closeProject, onOpenAccount, onManageSharing, className }: UserPresenceClusterProps) {
  const auth = useSupabaseAuth();
  const { currentProjectId, projectList, state, collaborateProject } = useProject();
  const presence = usePresenceState();
  const presenceActions = usePresenceActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [peersMenuOpen, setPeersMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);
  const [collabBusy, setCollabBusy] = useState(false);
  const [collabError, setCollabError] = useState<string | null>(null);

  if (!auth.isConfigured || !auth.isReady) return null;

  const account = auth.account;
  const currentMeta = projectList.find(p => p.id === currentProjectId);
  // Guests (anonymous sessions) can't own shared projects — "Collaborate"
  // waits until they create an account.
  const canCollaborate = !!account && !account.isAnonymous && !!currentProjectId && !currentMeta?.onlineId;
  const projectTitle = state.present.title || 'Untitled Project';

  // Who's here (S3): collaborator bubbles immediately LEFT of your own avatar
  // (max 3 + "+N"). They are FOLLOW TOGGLES (Canva-style): click a person to
  // follow their view; click again (or Esc / navigate) to stop. At rest the
  // bubbles overlap tightly (a collapsed stack); hovering or focusing the strip
  // SPREADS them apart so each one is fully visible and easy to hit
  // (roadmap 245 — docs/DESIGN-LANGUAGE.md §Presence pointers).
  const visiblePeers = presence.peers.slice(0, MAX_BUBBLES);
  const overflowPeers = presence.peers.slice(MAX_BUBBLES);
  const toggleFollow = (peer: PresencePeer) => {
    if (presence.followingId === peer.userId) presenceActions.stopFollowing();
    else presenceActions.follow(peer.userId);
  };
  const bubbleTitle = (peer: PresencePeer) =>
    `${peer.name}${peer.isGuest ? ' (guest)' : ''}${peer.overlay ? ` — in a ${peer.overlay}` : ''} — ${presence.followingId === peer.userId ? 'stop following' : 'follow'}`;
  const peerBubble = (peer: PresencePeer) => {
    const following = presence.followingId === peer.userId;
    return (
      <button
        key={peer.userId}
        data-testid="presence-bubble"
        data-presence-anchor={`header:user:${peer.userId}`}
        onClick={() => toggleFollow(peer)}
        title={bubbleTitle(peer)}
        className={`relative w-6 h-6 rounded-full overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none hover:scale-110 hover:z-10 cursor-pointer select-none ${following ? 'ring-2 ring-white' : 'ring-1 ring-white/25'}`}
      >
        <AccountAvatar account={peerAccount(peer)} className="w-full h-full" />
        {/* Local-overlay cue (roadmap 240): the peer is inside a menu/modal
            you cannot see — dots, same language as the pointer tag. */}
        {peer.overlay && (
          <span
            data-testid="presence-bubble-overlay"
            className="absolute inset-x-0 bottom-0 flex justify-center pb-[2px] bg-gradient-to-t from-black/80 to-transparent"
          >
            <PresenceDots className="text-white" />
          </span>
        )}
        {peer.isGuest && (
          <span className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-amber-400 border border-[color:var(--ui-accent-header-bg)]" title="Guest" />
        )}
      </button>
    );
  };

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
      <div className={`flex items-center gap-1 ${className || ''}`}>
        {presence.peers.length > 0 && (
          /* data-chrome-skip: the bubbles are a deliberately OVERLAPPING stack
             (negative space while at rest) — the chrome audit reads it as-is. */
          <div data-chrome-skip className="flex items-center -space-x-2.5 hover:space-x-1 focus-within:space-x-1 mr-0.5" data-testid="presence-bubbles">
            {visiblePeers.map(peerBubble)}
            {overflowPeers.length > 0 && (
              <DropdownMenu
                open={peersMenuOpen}
                onOpenChange={setPeersMenuOpen}
                align="right"
                width="w-48"
                trigger={
                  <button
                    data-testid="presence-overflow"
                    title={`${overflowPeers.length} more collaborator${overflowPeers.length === 1 ? '' : 's'} — click a name to follow`}
                    className="relative w-6 h-6 rounded-full text-[9px] font-bold flex items-center justify-center cursor-pointer select-none transition-all duration-200 ease-out motion-reduce:transition-none bg-[var(--ui-accent-900)] text-[color:var(--ui-text-strong)] ring-1 ring-white/25 hover:bg-[var(--ui-accent-800)]"
                  >
                    +{overflowPeers.length}
                  </button>
                }
              >
                {overflowPeers.map(peer => (
                  <DropdownItem key={peer.userId} onClick={() => { setPeersMenuOpen(false); toggleFollow(peer); }}>
                    {peer.name}{peer.isGuest ? ' (guest)' : ''}{presence.followingId === peer.userId ? ' · following' : ''}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            )}
          </div>
        )}
      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        align="right"
        width="w-64"
        trigger={
          <button
            data-testid="user-cluster"
            className={`flex items-center justify-center w-7 h-7 rounded-full border overflow-hidden transition-colors cursor-pointer select-none hover:bg-[var(--ui-accent-header-hover)] ${account ? 'border-white/25' : 'border-white/15 bg-white/5 text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)]'}`}
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
                onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}
                icon={<Settings className="w-3.5 h-3.5" />}
              >
                Settings...
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
      </div>

      <AccountSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

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
