import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
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
 * The Team panel (roadmap 254 phase 2; hosted as a tab of the account
 * settings modal since 255) — the account-level roster: create / rename the
 * team, review members and pending invites, invite by email or by picking
 * someone from the caller's orbit. A team is an address book: it grants NO
 * project access. One team per account (server-enforced), so this surface
 * manages the caller's own team. The host modal owns the footer — everything
 * here commits live.
 */
export function TeamPanel() {
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
    void refresh();
  }, [refresh]);

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
   *  takes the email path — the response is uniform either way (no email /
   *  account-existence oracle, roadmap 284). */
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
          : `Invite recorded for ${email} — if they already have an account they're on your team; otherwise they join when they create one.`,
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
    <div className="space-y-5">
      {!team && loading && (
        <div className="flex items-center gap-2 text-xs text-[color:var(--ui-text-muted)]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your team…
        </div>
      )}
      {!team && !loading && loadError && <p className="text-xs text-red-400">{loadError}</p>}
      {!team && !loading && !loadError && (
        <section className="space-y-2">
          <SectionLabel>Create your team</SectionLabel>
          <p className="text-xs text-[color:var(--ui-text-faint)]">
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
            <div className="divide-y divide-[color:var(--ui-border)]">
              {team.members.map(member => (
                <div key={member.userId} className="flex items-center gap-2 py-2">
                  <AccountAvatar
                    account={{ id: member.userId, name: member.name, email: null, avatarUrl: member.avatarUrl, isAnonymous: false }}
                    className="w-7 h-7"
                  />
                  <span className="flex-1 min-w-0 truncate text-xs text-[color:var(--ui-input-text)]">{member.name || 'Member'}</span>
                  <Button variant="danger-ghost" theme="dark" onClick={() => handleRemove(member.userId, member.name)} disabled={busy} className="shrink-0">
                    Remove
                  </Button>
                </div>
              ))}
              {team.invites.map(invite => (
                <div key={invite.id} className="flex items-center gap-2 py-2">
                  <span className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full bg-[var(--ui-input-bg)] text-[color:var(--ui-text-muted)]">
                    <Mail className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 min-w-0 truncate text-xs text-[color:var(--ui-text)]">{invite.email}</span>
                  <span className="text-[10px] text-[color:var(--ui-text-faint)] shrink-0">Invited</span>
                  <Button variant="danger-ghost" theme="dark" onClick={() => void run(() => cancelTeamInvite(invite.id))} disabled={busy} className="shrink-0">
                    Cancel
                  </Button>
                </div>
              ))}
              {team.members.length === 0 && team.invites.length === 0 && (
                <p className="py-2 text-xs text-[color:var(--ui-text-faint)]">No one yet — add the people you work with below.</p>
              )}
            </div>
          </section>

          <section>
            <SectionLabel>Add people</SectionLabel>
            <PeoplePicker suggestions={suggestions} onCommit={handleCommit} />
            <p className="mt-1.5 text-[10px] text-[color:var(--ui-text-faint)]">
              Pick someone you already work with, or type an email. No email is sent yet — new addresses join when they create an account.
            </p>
          </section>
        </>
      )}

      {notice && <p className="text-xs text-emerald-400">{notice}</p>}
      {actionError && <p className="text-xs text-red-400">{actionError}</p>}
    </div>
  );
}
