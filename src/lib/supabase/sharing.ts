import { supabase } from './client';
import { generateShareToken, hashShareToken } from '../shareTokens';

/**
 * Sharing operations (roadmap 229 S2, docs/COLLABORATION.md §6/§8): the ONE
 * module for memberships, pending invites and share links. Every call is
 * scoped by RLS server-side — the UI state here is cosmetic; the database is
 * the permission source (owner / allow-invites editor for invites; owner for
 * role changes; members read the people list; viewers write nothing).
 */

export type CollaboratorRole = 'owner' | 'editor' | 'viewer';

/** Result of an invite-by-email: granted now, stored for signup, or the
 *  invitee is the owner already. */
export type InviteState = 'added' | 'pending' | 'owner';

export interface SharingMember {
  userId: string;
  /** profiles.display_name (falls back to null — the UI shows "Member"). */
  name: string | null;
  avatarUrl: string | null;
  role: CollaboratorRole;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: CollaboratorRole;
  createdAt: string;
}

export interface ShareLinkRow {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  /** Raw token — RLS keeps it inviter-only, so the panel re-displays the
   *  link at any time. Null for links created before this landed. */
  token: string | null;
}

export interface SharingState {
  ownerId: string;
  allowInvites: boolean;
  myUserId: string;
  myRole: CollaboratorRole;
  members: SharingMember[];
  pendingInvites: PendingInvite[];
  links: ShareLinkRow[];
}

function client() {
  if (!supabase) throw new Error('Sign-in is not configured on this build.');
  return supabase;
}

async function currentUserId(): Promise<string> {
  const { data } = await client().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Sign in to manage sharing.');
  return id;
}

/** The caller's role on a project, or null when they have no access
 *  (revoked / never a member). RLS scopes the read to the caller's row. */
export async function getMyRole(projectId: string): Promise<CollaboratorRole | null> {
  const sb = supabase;
  if (!sb) return null;
  const { data: session } = await sb.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return null;
  const { data, error } = await sb
    .from('memberships')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.role as CollaboratorRole | undefined) ?? null;
}

const ROLE_ORDER: Record<CollaboratorRole, number> = { owner: 0, editor: 1, viewer: 2 };

/** Everything the User & sharing panel needs, in one call. Pending invites
 *  and links come back empty for members who cannot invite (RLS). */
export async function getSharingState(projectId: string): Promise<SharingState> {
  const sb = client();
  const myUserId = await currentUserId();

  const [projectRes, membersRes] = await Promise.all([
    sb.from('projects').select('owner_id, allow_invites').eq('id', projectId).single(),
    sb.from('memberships').select('user_id, role').eq('project_id', projectId),
  ]);
  if (projectRes.error || !projectRes.data) throw new Error(projectRes.error?.message || 'Project not found');
  if (membersRes.error) throw new Error(membersRes.error.message);

  const [pendingRes, linksRes] = await Promise.all([
    sb.from('pending_invites').select('id, email, role, created_at').eq('project_id', projectId),
    sb.from('share_links').select('id, created_at, expires_at, token').eq('project_id', projectId).order('created_at', { ascending: false }),
  ]);

  const rows = (membersRes.data ?? []) as { user_id: string; role: CollaboratorRole }[];
  const myRow = rows.find(r => r.user_id === myUserId);
  if (!myRow) throw new Error('You no longer have access to this project.');

  let profiles: { id: string; display_name: string | null; avatar_url: string | null; is_anonymous: boolean | null }[] = [];
  if (rows.length > 0) {
    const { data } = await sb
      .from('profiles')
      .select('id, display_name, avatar_url, is_anonymous')
      .in('id', rows.map(r => r.user_id));
    profiles = (data ?? []) as typeof profiles;
  }
  const nameOf = new Map(profiles.map(p => [p.id, p]));
  // Link guests (anonymous sessions) hold a membership but are NOT invitees:
  // the People list shows invited people only — guests surface as live
  // watchers once presence lands (S3).
  const guestIds = new Set(profiles.filter(p => p.is_anonymous).map(p => p.id));

  const members: SharingMember[] = rows
    .filter(r => !guestIds.has(r.user_id))
    .map(r => ({
      userId: r.user_id,
      name: nameOf.get(r.user_id)?.display_name ?? null,
      avatarUrl: nameOf.get(r.user_id)?.avatar_url ?? null,
      role: r.role,
    }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.name || '').localeCompare(b.name || ''));

  return {
    ownerId: projectRes.data.owner_id as string,
    allowInvites: Boolean(projectRes.data.allow_invites),
    myUserId,
    myRole: myRow.role,
    members,
    pendingInvites: ((pendingRes.data ?? []) as any[]).map(p => ({
      id: p.id,
      email: p.email,
      role: p.role,
      createdAt: p.created_at,
    })),
    links: ((linksRes.data ?? []) as any[]).map(l => ({
      id: l.id,
      createdAt: l.created_at,
      expiresAt: l.expires_at,
      token: l.token ?? null,
    })),
  };
}

/** Invite by email: the server grants access immediately when the email has
 *  an account, else stores a pending invite the signup trigger claims. */
export async function inviteCollaborator(projectId: string, email: string, role: CollaboratorRole): Promise<InviteState> {
  const { data, error } = await client().rpc('invite_collaborator', {
    p_project: projectId,
    p_email: email,
    p_role: role,
  });
  if (error) throw new Error(error.message);
  return ((data as { status?: InviteState } | null)?.status) ?? 'added';
}

/** Owner-only (RLS rejects otherwise). */
export async function setMemberRole(projectId: string, userId: string, role: CollaboratorRole): Promise<void> {
  const { error } = await client()
    .from('memberships')
    .update({ role })
    .eq('project_id', projectId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

/** Owner-only. The structural owner row is protected by the delete policy. */
export async function removeMember(projectId: string, userId: string): Promise<void> {
  const { error } = await client()
    .from('memberships')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function cancelPendingInvite(id: string): Promise<void> {
  const { error } = await client().from('pending_invites').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Owner-only "Allow others to invite" (RPC — the column grant excludes it). */
export async function setAllowInvites(projectId: string, allow: boolean): Promise<void> {
  const { error } = await client().rpc('set_project_allow_invites', {
    p_project: projectId,
    p_allow: allow,
  });
  if (error) throw new Error(error.message);
}

/**
 * Mint a view-only link. Both the raw token (displayed/copied by the panel,
 * inviter-only via RLS) and its sha256 (redemption key) are stored.
 */
export async function createShareLink(projectId: string, expiresAt: string | null): Promise<{ id: string; token: string }> {
  const sb = client();
  const userId = await currentUserId();
  const token = generateShareToken();
  const tokenHash = await hashShareToken(token);
  const { data, error } = await sb
    .from('share_links')
    .insert({ project_id: projectId, token, token_hash: tokenHash, expires_at: expiresAt, created_by: userId })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message || 'Could not create the link.');
  return { id: data.id as string, token };
}

export async function updateShareLinkExpiry(id: string, expiresAt: string | null): Promise<void> {
  const { error } = await client().from('share_links').update({ expires_at: expiresAt }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteShareLink(id: string): Promise<void> {
  const { error } = await client().from('share_links').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteProjectShareLinks(projectId: string, exceptId?: string): Promise<void> {
  let query = client().from('share_links').delete().eq('project_id', projectId);
  if (exceptId) query = query.neq('id', exceptId);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

/** Revoke every link AND evict the guests they admitted (link-joined
 *  anonymous viewers). Owner or allow-invites editor — enforced server-side. */
export async function revokeShareLinks(projectId: string): Promise<{ links: number; guests: number }> {
  const { data, error } = await client().rpc('revoke_share_links', { p_project: projectId });
  if (error) throw new Error(error.message);
  const res = (data ?? {}) as { links?: number; guests?: number };
  return { links: Number(res.links ?? 0), guests: Number(res.guests ?? 0) };
}

/** Stop Sharing…: revoke every link + pending invite and remove every member
 *  except the owner (the project itself stays in the owner's Shared tab). */
export async function stopSharing(projectId: string): Promise<void> {
  const sb = client();
  const { data: project, error: readError } = await sb
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .single();
  if (readError || !project) throw new Error(readError?.message || 'Project not found');

  await deleteProjectShareLinks(projectId);
  const { error: pendingError } = await sb.from('pending_invites').delete().eq('project_id', projectId);
  if (pendingError) throw new Error(pendingError.message);
  const { error: memberError } = await sb
    .from('memberships')
    .delete()
    .eq('project_id', projectId)
    .neq('user_id', project.owner_id as string);
  if (memberError) throw new Error(memberError.message);
  await setAllowInvites(projectId, false);
}

/** Redeem a link: hashes the token and calls the server function. Returns the
 *  project id, or null when the link is unknown/expired/revoked. */
export async function redeemShareLink(token: string): Promise<string | null> {
  const tokenHash = await hashShareToken(token);
  const { data, error } = await client().rpc('redeem_share_link', { p_token_hash: tokenHash });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}
