import { supabase } from './client';
import { currentUserId, mapInviteSuggestions, type InviteSuggestion, type InviteState } from './sharing';

/**
 * Team management (roadmap 254 phase 2) — the ONE module for the account-level
 * roster: create/rename, members, email invites (claimed at signup). A team
 * is an address book for invite suggestions, NEVER an access group, and only
 * the owner manages it; every call is enforced by RLS server-side. v1: one
 * team per account, so the owner's own team is the team this module reads.
 */

export interface TeamMember {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface TeamInvite {
  id: string;
  email: string;
  createdAt: string;
}

export interface TeamState {
  id: string;
  name: string;
  members: TeamMember[];
  invites: TeamInvite[];
}

function client() {
  if (!supabase) throw new Error('Sign-in is not configured on this build.');
  return supabase;
}

/** The caller's own team, or null before it exists. */
export async function getMyTeam(): Promise<TeamState | null> {
  const sb = client();
  const userId = await currentUserId();
  const { data: team, error } = await sb
    .from('teams')
    .select('id, name')
    .eq('owner_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!team) return null;

  const [membersRes, invitesRes] = await Promise.all([
    sb.from('team_members').select('user_id').eq('team_id', team.id),
    sb.from('team_invites').select('id, email, created_at').eq('team_id', team.id).order('created_at'),
  ]);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (invitesRes.error) throw new Error(invitesRes.error.message);

  const rows = (membersRes.data ?? []) as { user_id: string }[];
  let profiles: { id: string; display_name: string | null; avatar_url: string | null }[] = [];
  if (rows.length > 0) {
    const { data } = await sb
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', rows.map(r => r.user_id));
    profiles = (data ?? []) as typeof profiles;
  }
  const nameOf = new Map(profiles.map(p => [p.id, p]));

  return {
    id: team.id as string,
    name: team.name as string,
    members: rows.map(r => ({
      userId: r.user_id,
      name: nameOf.get(r.user_id)?.display_name ?? null,
      avatarUrl: nameOf.get(r.user_id)?.avatar_url ?? null,
    })).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    invites: ((invitesRes.data ?? []) as any[]).map(i => ({
      id: i.id,
      email: i.email,
      createdAt: i.created_at,
    })),
  };
}

/** One team per account — the unique(owner_id) index rejects a second. */
export async function createTeam(name: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await client().from('teams').insert({ owner_id: userId, name: name.trim() });
  if (error) throw new Error(error.message);
}

export async function renameTeam(teamId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const { error } = await client().from('teams').update({ name: trimmed }).eq('id', teamId);
  if (error) throw new Error(error.message);
}

/** Add a person the picker resolved — RLS only accepts accounts that already
 *  share a project with the owner (a roster of known people, never a probe). */
export async function addTeamMember(teamId: string, userId: string): Promise<void> {
  const { error } = await client().from('team_members').insert({ team_id: teamId, user_id: userId });
  if (error) throw new Error(error.message);
}

/** Invite by email: instant for existing accounts, pending for new ones — the
 *  response is uniformly 'sent' either way (roadmap 284). */
export async function inviteTeamMember(teamId: string, email: string): Promise<InviteState> {
  const { data, error } = await client().rpc('invite_team_member', { p_team: teamId, p_email: email });
  if (error) throw new Error(error.message);
  return ((data as { status?: InviteState } | null)?.status) ?? 'sent';
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  const { error } = await client().from('team_members').delete().eq('team_id', teamId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function cancelTeamInvite(id: string): Promise<void> {
  const { error } = await client().from('team_invites').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** The Team modal's picker: the caller's orbit minus their own roster. */
export async function listTeamSuggestions(): Promise<InviteSuggestion[]> {
  const { data, error } = await client().rpc('list_team_suggestions');
  if (error) throw new Error(error.message);
  return mapInviteSuggestions(data);
}
