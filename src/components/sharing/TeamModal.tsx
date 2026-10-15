import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, UsersRound } from 'lucide-react';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import { useDialog } from '../Dialog';
import { AccountAvatar } from '../AccountAvatar';
import {
  addTeamMember,
  cancelTeamInvite,
  createTeam,
  getMyTeam,
  inviteTeamMember,
  listTeamSuggestions,
  removeTeamMember,
  renameTeam,
  type TeamState,
} from '../../lib/supabase/teams';
import type { InviteSuggestion } from '../../lib/supabase/sharing';
import type { InviteTarget } from '../../lib/inviteTargets';
import { PeoplePicker } from './PeoplePicker';
import { PANEL_INPUT_CLASS, SectionLabel } from './sharingParts';

/**
 * The Team panel (roadmap 254 phase 2) — the account-level roster: create /
 * rename the team, review members and pending invites, invite by email or by
 * picking someone from the caller's orbit. A team is an address book: it
 * grants NO project access. One team per account (server-enforced), so this
 * surface manages the caller's own team.
 */
export function TeamModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useDialog();
  const [team, setTeam] = useState<TeamState | null>(null);
  const [suggestions, setSuggestions] = useState<InviteSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [nameDraft, setNameDraft] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getMyTeam();
      setTeam(next);
      setNameDraft(next?.name ?? '');
      setSuggestions(next ? await listTeamSuggestions().catch(() => []) : []);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load your team.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (open) return;
    setNotice(null);
    setActionError(null);
    setLoadError(null);
    setNewTeamName('');
    setNameDraft('');
    setSuggestions([]);
  }, [open]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    if (busy) return;
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
  }, [busy, refresh]);

  const handleCreate = () => {
    const name = newTeamName.trim();
    if (!name || busy) return;
    void run(() => createTeam(name));
  };

  const commitName = () => {
    if (!team) return;
    const name = nameDraft.trim();
    if (!name || name === team.name) {
      setNameDraft(team.name);
      return;
    }
    void run(() => renameTeam(team.id, name));
  };

  /** One picker commit: a resolved person joins the roster directly (the RLS
   *  guard only accepts people the owner already works with); a typed address
   *  takes the email path — instant for accounts, pending for new emails. */
  const handleCommit = (target: InviteTarget) => {
    if (!team) return;
    if (target.kind === 'member') {
      const person = suggestions.find(s => s.userId === target.userId);
      void run(async () => {
        await addTeamMember(team.id, target.userId);
        setNotice(`${person?.name || person?.email || 'That person'} joined your team.`);
      });
      return;
    }
    const email = target.email.trim();
    void run(async () => {
      const status = await inviteTeamMember(team.id, email);
      setNotice(
        status === 'owner' ? 'That email is your own account.'
          : status === 'pending' ? `Invite saved for ${email} — it activates when they create an account.`
          : `${email} joined your team.`,
      );
    });
  };

  const handleRemove = (userId: string, name: string | null) => {
    if (!team) return;
    void (async () => {
      const ok = await dialog.confirm({
        title: 'Remove from team?',
        message: `${name || 'This person'} leaves your team. They keep access to every project they are already on.`,
        danger: true,
      });
      if (!ok) return;
      void run(() => removeTeamMember(team.id, userId));
    })();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Team"
      icon={<UsersRound className="w-4 h-4" />}
      width="max-w-lg"
      footer={
        <ModalFooter>
          <ModalFooterButton data-modal-confirm onClick={onClose}>Done</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-5">
        {!team && loading && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your team…
          </div>
        )}
        {!team && !loading && loadError && <p className="text-xs text-red-400">{loadError}</p>}
        {!team && !loading && !loadError && (
          <section className="space-y-2">
            <SectionLabel>Create your team</SectionLabel>
            <p className="text-xs text-zinc-500">
              A team is your address book — the people you work with, ready to pick when you share a project. It grants no access by itself.
            </p>
            <div className="flex items-center gap-2">
              <input
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="Team name"
                disabled={busy}
                className={`${PANEL_INPUT_CLASS} flex-1 min-w-0`}
              />
              <Button variant="primary" theme="dark" onClick={handleCreate} disabled={busy || !newTeamName.trim()}>
                Create Team
              </Button>
            </div>
          </section>
        )}

        {team && (
          <>
            <section>
              <SectionLabel>Team name</SectionLabel>
              <input
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                disabled={busy}
                aria-label="Team name"
                className={`${PANEL_INPUT_CLASS} w-full`}
              />
            </section>

            <section>
              <SectionLabel>Members ({team.members.length + team.invites.length})</SectionLabel>
              <div className="divide-y divide-zinc-800/60">
                {team.members.map(member => (
                  <div key={member.userId} className="flex items-center gap-2 py-2">
                    <AccountAvatar
                      account={{ id: member.userId, name: member.name, email: null, avatarUrl: member.avatarUrl, isAnonymous: false }}
                      className="w-7 h-7"
                    />
                    <span className="flex-1 min-w-0 truncate text-xs text-zinc-200">{member.name || 'Member'}</span>
                    <Button variant="danger-ghost" theme="dark" onClick={() => handleRemove(member.userId, member.name)} disabled={busy} className="shrink-0">
                      Remove
                    </Button>
                  </div>
                ))}
                {team.invites.map(invite => (
                  <div key={invite.id} className="flex items-center gap-2 py-2">
                    <span className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
                      <Mail className="w-3.5 h-3.5" />
                    </span>
                    <span className="flex-1 min-w-0 truncate text-xs text-zinc-300">{invite.email}</span>
                    <span className="text-[10px] text-zinc-600 shrink-0">Invited</span>
                    <Button variant="danger-ghost" theme="dark" onClick={() => void run(() => cancelTeamInvite(invite.id))} disabled={busy} className="shrink-0">
                      Cancel
                    </Button>
                  </div>
                ))}
                {team.members.length === 0 && team.invites.length === 0 && (
                  <p className="py-2 text-xs text-zinc-600">No one yet — add the people you work with below.</p>
                )}
              </div>
            </section>

            <section>
              <SectionLabel>Add people</SectionLabel>
              <PeoplePicker suggestions={suggestions} onCommit={handleCommit} />
              <p className="mt-1.5 text-[10px] text-zinc-600">
                Pick someone you already work with, or type an email. No email is sent yet — new addresses join when they create an account.
              </p>
            </section>
          </>
        )}

        {notice && <p className="text-xs text-emerald-400">{notice}</p>}
        {actionError && <p className="text-xs text-red-400">{actionError}</p>}
      </div>
    </Modal>
  );
}
