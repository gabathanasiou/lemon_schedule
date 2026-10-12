import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, ShieldCheck, Users } from 'lucide-react';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import Checkbox from '../Checkbox';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import { useDialog } from '../Dialog';
import { Seg } from '@gabriel/ui-kit';
import { useProject } from '../../store';
import { useSupabaseAuth } from '../../lib/supabase/auth';
import {
  cancelPendingInvite,
  createShareLink,
  deleteProjectShareLinks,
  deleteShareLink,
  getSharingState,
  inviteCollaborator,
  removeMember,
  setAllowInvites,
  setMemberRole,
  stopSharing,
  updateShareLinkExpiry,
  type CollaboratorRole,
  type SharingState,
} from '../../lib/supabase/sharing';
import { shareLinkUrl } from '../../lib/shareTokens';
import { MemberRow, PendingRow } from './sharingParts';

const INPUT_CLASS = 'px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 disabled:opacity-50';

type AccessMode = 'invite' | 'link';
const EXPIRY_OPTIONS = [
  { v: 'never', l: 'Never' },
  { v: '7', l: '7 days' },
  { v: '30', l: '30 days' },
] as const;

function expiryValue(expiresAt: string | null): 'never' | '7' | '30' {
  if (!expiresAt) return 'never';
  const days = (Date.parse(expiresAt) - Date.now()) / 86_400_000;
  return days <= 8 ? '7' : '30';
}

function expiryIso(value: 'never' | '7' | '30'): string | null {
  if (value === 'never') return null;
  return new Date(Date.now() + Number(value) * 86_400_000).toISOString();
}

/**
 * The User & sharing panel (roadmap 229 S2, docs/COLLABORATION.md §9):
 * Who can access (Only invited people / Anyone with the link), per-person
 * Permissions (Can make changes / View only), Allow others to invite,
 * Copy Link, Stop Sharing. One instance, driven by the OPEN shared project;
 * every action goes through src/lib/supabase/sharing.ts (RLS enforces).
 */
export function SharingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentProjectId, projectList, state } = useProject();
  const auth = useSupabaseAuth();
  const dialog = useDialog();

  const onlineId = projectList.find(p => p.id === currentProjectId)?.onlineId ?? null;
  const projectTitle = state.present.title || 'Untitled Project';

  const [share, setShare] = useState<SharingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  /** The raw token is kept in memory only for the session's link (the database
   *  stores just the hash) — Copy Link re-copies it without rotating. */
  const [linkToken, setLinkToken] = useState<{ linkId: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiryOpen, setExpiryOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!onlineId) return;
    setLoading(true);
    try {
      setShare(await getSharingState(onlineId));
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load who has access.');
    } finally {
      setLoading(false);
    }
  }, [onlineId]);

  useEffect(() => {
    if (open && onlineId) void refresh();
  }, [open, onlineId, refresh]);

  useEffect(() => {
    if (open) return;
    setLinkToken(null);
    setNotice(null);
    setActionError(null);
    setLoadError(null);
    setInviteEmail('');
    setCopied(false);
  }, [open]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    if (!onlineId || busy) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setActionError(e?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, [onlineId, busy, refresh]);

  if (!onlineId) return null;

  const myRole: CollaboratorRole | null = share?.myRole ?? null;
  const isOwner = myRole === 'owner';
  const canInvite = isOwner || (myRole === 'editor' && !!share?.allowInvites);
  const activeLink = share?.links[0] ?? null;
  const expired = !!activeLink?.expiresAt && Date.parse(activeLink.expiresAt) < Date.now();
  const mode: AccessMode = activeLink ? 'link' : 'invite';
  const heldToken = linkToken && activeLink && linkToken.linkId === activeLink.id && !expired ? linkToken.token : null;
  const linkUrl = (token: string) => shareLinkUrl(token, window.location.origin, import.meta.env.BASE_URL);

  const handleModeChange = (next: string) => {
    void run(async () => {
      if (next === 'link') {
        if (!activeLink) {
          const { id, token } = await createShareLink(onlineId, null);
          setLinkToken({ linkId: id, token });
        }
      } else {
        await deleteProjectShareLinks(onlineId);
        setLinkToken(null);
      }
    });
  };

  const handleCopyLink = () => {
    void run(async () => {
      let url: string;
      if (heldToken) {
        url = linkUrl(heldToken);
      } else {
        // Mint a fresh link (rotating the previous ones) — a stored hash can
        // never reproduce the raw token.
        const expiresAt = activeLink?.expiresAt ?? null;
        const { id, token } = await createShareLink(onlineId, expiresAt);
        await deleteProjectShareLinks(onlineId, id);
        setLinkToken({ linkId: id, token });
        url = linkUrl(token);
      }
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        await dialog.alert({ title: 'Copy Link', message: url });
      }
    });
  };

  const handleExpiry = (value: 'never' | '7' | '30') => {
    if (!activeLink) return;
    void run(() => updateShareLinkExpiry(activeLink.id, expiryIso(value)));
  };

  const handleRevokeLink = () => {
    void run(async () => {
      if (activeLink) await deleteShareLink(activeLink.id);
      setLinkToken(null);
    });
  };

  const handleInvite = () => {
    const email = inviteEmail.trim();
    if (!/.+@.+\..+/.test(email)) {
      setActionError('Enter a valid email address.');
      return;
    }
    void run(async () => {
      const status = await inviteCollaborator(onlineId, email, inviteRole);
      setInviteEmail('');
      setNotice(
        status === 'owner' ? 'That email owns this project already.'
          : status === 'pending' ? `Invite saved for ${email} — it activates when they create an account.`
          : `${email} can now open this project.`,
      );
    });
  };

  const handleRemove = (userId: string, name: string | null) => {
    void (async () => {
      const ok = await dialog.confirm({
        title: 'Remove access?',
        message: `${name || 'This person'} will lose access to “${projectTitle}” immediately.`,
        danger: true,
      });
      if (!ok) return;
      void run(() => removeMember(onlineId, userId));
    })();
  };

  const handleStopSharing = () => {
    if (!share) return;
    void (async () => {
      const ok = await dialog.confirm({
        title: `Stop sharing “${projectTitle}”?`,
        message: 'Everyone you invited loses access and every link stops working. The project stays in your Shared projects.',
        danger: true,
      });
      if (!ok) return;
      void run(async () => {
        await stopSharing(onlineId);
        setLinkToken(null);
      });
    })();
  };

  const nothingToStop = !!share && share.members.length <= 1 && share.links.length === 0 && share.pendingInvites.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Share “${projectTitle}”`}
      icon={<Users className="w-4 h-4" />}
      width="max-w-lg"
      footer={
        <ModalFooter>
          {isOwner && (
            <ModalFooterButton variant="danger" className="mr-auto" onClick={handleStopSharing} disabled={busy || nothingToStop}>
              Stop Sharing…
            </ModalFooterButton>
          )}
          <ModalFooterButton data-modal-confirm onClick={onClose}>Done</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-5">
        {!share && loading && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading access…
          </div>
        )}
        {!share && !loading && loadError && <p className="text-xs text-red-400">{loadError}</p>}

        {share && (
          <>
            {/* Who can access ------------------------------------------------ */}
            <section className="space-y-2">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Who can access</div>
              <Seg
                variant="track"
                theme="dark"
                stretch
                value={mode}
                disabled={!canInvite || busy || loading}
                options={[
                  { v: 'invite', l: 'Only invited people' },
                  { v: 'link', l: 'Anyone with the link' },
                ]}
                onChange={handleModeChange}
              />
              {mode === 'invite' ? (
                <p className="text-[10px] text-zinc-600">Only the people below can open this project.</p>
              ) : (
                <>
                  <p className="text-[10px] text-zinc-600">
                    {expired ? 'The link has expired — Copy Link makes a new one.' : 'Anyone with the link can view this project (view only).'}
                  </p>
                  {canInvite && (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <Button variant="subtle" theme="dark" onClick={handleCopyLink} disabled={busy}>
                        <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy Link'}
                      </Button>
                      <DropdownMenu
                        open={expiryOpen}
                        onOpenChange={setExpiryOpen}
                        align="left"
                        width="w-36"
                        theme="dark"
                        trigger={
                          <button type="button" disabled={busy} className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors disabled:opacity-40">
                            Expires: {EXPIRY_OPTIONS.find(o => o.v === (activeLink ? expiryValue(activeLink.expiresAt) : 'never'))?.l}
                          </button>
                        }
                      >
                        {EXPIRY_OPTIONS.map(o => (
                          <DropdownItem key={o.v} onClick={() => handleExpiry(o.v)}>{o.l}</DropdownItem>
                        ))}
                      </DropdownMenu>
                      <Button variant="danger-ghost" theme="dark" onClick={handleRevokeLink} disabled={busy}>
                        Revoke Link
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* People -------------------------------------------------------- */}
            <section>
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                People ({share.members.length + share.pendingInvites.length})
              </div>
              <div className="divide-y divide-zinc-800/60">
                {share.members.map(member => (
                  <MemberRow
                    key={member.userId}
                    member={member}
                    isSelf={member.userId === share.myUserId}
                    canManage={isOwner}
                    disabled={busy}
                    onRoleChange={role => void run(() => setMemberRole(onlineId, member.userId, role))}
                    onRemove={() => handleRemove(member.userId, member.name)}
                  />
                ))}
                {share.pendingInvites.map(invite => (
                  <PendingRow
                    key={invite.id}
                    invite={invite}
                    canManage={canInvite}
                    disabled={busy}
                    onCancel={() => void run(() => cancelPendingInvite(invite.id))}
                  />
                ))}
              </div>
            </section>

            {/* Invite by email ----------------------------------------------- */}
            {canInvite ? (
              <section>
                <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Invite by email</div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleInvite(); }}
                    placeholder="name@example.com"
                    disabled={busy}
                    className={`${INPUT_CLASS} flex-1 min-w-[180px]`}
                  />
                  <Seg
                    variant="track"
                    theme="dark"
                    value={inviteRole}
                    disabled={busy}
                    options={[
                      { v: 'editor', l: 'Can make changes' },
                      { v: 'viewer', l: 'View only' },
                    ]}
                    onChange={v => setInviteRole(v as 'editor' | 'viewer')}
                  />
                  <Button variant="primary" theme="dark" onClick={handleInvite} disabled={busy || !inviteEmail.trim()}>
                    Invite
                  </Button>
                </div>
                <p className="mt-1.5 text-[10px] text-zinc-600">
                  No email is sent yet — existing accounts get access right away, new emails activate when they create an account (send them the link to be sure).
                </p>
              </section>
            ) : (
              <p className="text-xs text-zinc-500">Only the owner can change who has access to this project.</p>
            )}

            {/* Allow others to invite ---------------------------------------- */}
            <section>
              <Checkbox
                theme="dark"
                block
                checked={share.allowInvites}
                onChange={v => void run(() => setAllowInvites(onlineId, v))}
                disabled={!isOwner || busy}
                label="Allow others to invite"
              />
              <p className="mt-1.5 text-[10px] text-zinc-600">Editors can add people and create links without asking you.</p>
            </section>

            {notice && <p className="text-xs text-emerald-400">{notice}</p>}
            {actionError && <p className="text-xs text-red-400">{actionError}</p>}
            {!isOwner && share.myRole === 'viewer' && (
              <p className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                <ShieldCheck className="w-3 h-3" /> You have view-only access to this project.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
