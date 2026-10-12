-- Online collaboration S2 — sharing, roles, invites (roadmap 229;
-- docs/COLLABORATION.md §6). Applied to the live dev project 2026-10-12; the
-- filename mirrors `supabase_migrations.schema_migrations`. Follows
-- 20261012112925_harden_rls_helpers.sql. RLS coverage: supabase/tests/rls_s2.sql.
--
-- Surface added here:
--   * projects.allow_invites — the owner's "Allow others to invite" switch.
--     Editors may add members / create links ONLY while it is on; direct UPDATE
--     grants are narrowed to (title, data, revision) so the flag changes only
--     through public.set_project_allow_invites (owner-checked). This also makes
--     owner_id structurally immutable from the API.
--   * memberships — members can now see who else has access; insert is
--     owner (or allow-invites editor) with editor/viewer roles only; the
--     structural owner row can never be demoted/removed through policies.
--   * pending_invites — invites for emails with no account yet; claimed by an
--     auth.users signup trigger (no email is sent in S2).
--   * share_links — view-only link tokens; only the sha256 hash is stored (the
--     app hashes client-side; the raw token never reaches the database).

-- ---------------------------------------------------------------------------
-- 1) projects.allow_invites + narrowed column grants
-- ---------------------------------------------------------------------------

alter table public.projects add column allow_invites boolean not null default false;

comment on column public.projects.allow_invites is
  'Owner toggle: when true, editors may invite members and create share links. Changes only via public.set_project_allow_invites (UPDATE grants exclude this column).';

revoke update on public.projects from authenticated;
grant update (title, data, revision) on public.projects to authenticated;

-- ---------------------------------------------------------------------------
-- 2) pending_invites
-- ---------------------------------------------------------------------------

create table public.pending_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null,                     -- stored lower(trim())ed
  role text not null check (role in ('editor', 'viewer')),
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, email)
);
create index pending_invites_email_idx on public.pending_invites (email);
alter table public.pending_invites enable row level security;

-- ---------------------------------------------------------------------------
-- 3) share_links (view-only; hash at rest)
-- ---------------------------------------------------------------------------

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  token_hash text not null unique,         -- sha256 hex of the raw token
  role text not null default 'viewer' check (role = 'viewer'),
  expires_at timestamptz,                  -- null = never expires
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index share_links_project_idx on public.share_links (project_id);
alter table public.share_links enable row level security;

comment on column public.share_links.token_hash is
  'sha256 hex of the raw invite token. The app hashes client-side; the raw token never reaches the database.';
comment on column public.share_links.role is
  'S2 links are view-only by construction (docs/COLLABORATION.md §6).';

-- ---------------------------------------------------------------------------
-- 4) Helpers (private = non-exposed; security definer; initplan auth.uid())
-- ---------------------------------------------------------------------------

-- Owner OR (allow_invites ON and caller is an editor of the project).
create or replace function private.can_invite(p_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project
      and (
        p.owner_id = (select auth.uid())
        or (
          p.allow_invites
          and exists (
            select 1
            from public.memberships m
            where m.project_id = p.id
              and m.user_id = (select auth.uid())
              and m.role = 'editor'
          )
        )
      )
  )
$$;

-- Does the caller share at least one project with p_user? (co-member profile reads)
create or replace function private.shares_project_with(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.project_id = mine.project_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user
  )
$$;

-- True when (project, user) is the structural owner row (projects.owner_id) —
-- never demotable/removable through memberships policies.
create or replace function private.is_structural_owner(p_project uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.projects p where p.id = p_project and p.owner_id = p_user
  )
$$;

revoke execute on function private.can_invite(uuid) from public;
revoke execute on function private.shares_project_with(uuid) from public;
revoke execute on function private.is_structural_owner(uuid, uuid) from public;
grant execute on function private.can_invite(uuid),
  private.shares_project_with(uuid),
  private.is_structural_owner(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) RLS: memberships (members see the people list; owner manages roles)
-- ---------------------------------------------------------------------------

drop policy "memberships select own or owner" on public.memberships;
create policy "memberships select member" on public.memberships
  for select using (private.project_role(project_id) is not null);

drop policy "memberships insert owner" on public.memberships;
create policy "memberships insert inviter" on public.memberships
  for insert with check (
    role in ('editor', 'viewer')
    and not private.is_structural_owner(project_id, user_id)
    and private.can_invite(project_id)
  );

drop policy "memberships update owner" on public.memberships;
create policy "memberships update owner" on public.memberships
  for update using (private.is_project_owner(project_id))
  with check (
    role in ('editor', 'viewer')
    and not private.is_structural_owner(project_id, user_id)
  );

drop policy "memberships delete owner" on public.memberships;
create policy "memberships delete owner" on public.memberships
  for delete using (
    private.is_project_owner(project_id)
    and not private.is_structural_owner(project_id, user_id)
  );

-- ---------------------------------------------------------------------------
-- 6) RLS: pending_invites (inviters manage their project's invites)
-- ---------------------------------------------------------------------------

create policy "pending_invites select inviter" on public.pending_invites
  for select using (private.can_invite(project_id));
create policy "pending_invites insert inviter" on public.pending_invites
  for insert with check (private.can_invite(project_id) and invited_by = (select auth.uid()));
create policy "pending_invites update inviter" on public.pending_invites
  for update using (private.can_invite(project_id))
  with check (private.can_invite(project_id));
create policy "pending_invites delete inviter" on public.pending_invites
  for delete using (private.can_invite(project_id));

-- ---------------------------------------------------------------------------
-- 7) RLS: share_links (inviters manage; token_hash never leaves through RLS)
-- ---------------------------------------------------------------------------

create policy "share_links select inviter" on public.share_links
  for select using (private.can_invite(project_id));
create policy "share_links insert inviter" on public.share_links
  for insert with check (private.can_invite(project_id) and created_by = (select auth.uid()));
create policy "share_links update inviter" on public.share_links
  for update using (private.can_invite(project_id))
  with check (private.can_invite(project_id));
create policy "share_links delete inviter" on public.share_links
  for delete using (private.can_invite(project_id));

-- ---------------------------------------------------------------------------
-- 8) profiles: co-members can see each other (the "Who can access" list)
-- ---------------------------------------------------------------------------

create policy "profiles select co-member" on public.profiles
  for select using (private.shares_project_with(id));

-- ---------------------------------------------------------------------------
-- 9) RPCs (public = callable via PostgREST; execute granted explicitly)
-- ---------------------------------------------------------------------------

-- Owner-only toggle for allow_invites.
create or replace function public.set_project_allow_invites(p_project uuid, p_allow boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_project_owner(p_project) then
    raise exception 'Only the owner can change this setting';
  end if;
  update public.projects set allow_invites = p_allow where id = p_project;
  return true;
end $$;

-- Invite by email: adds the membership when the email already has an account,
-- else stores a pending invite the signup trigger claims later. Owners may
-- invite and change an existing member's role; editors-with-invite may only
-- ADD people (never touch an existing member's permission).
create or replace function public.invite_collaborator(p_project uuid, p_email text, p_role text)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_email text := lower(trim(p_email));
  v_user uuid;
  v_existing text;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_role not in ('editor', 'viewer') then raise exception 'Invalid permission'; end if;
  if v_email = '' or position('@' in v_email) = 0 then raise exception 'Enter a valid email address'; end if;

  select owner_id into v_owner from public.projects where id = p_project;
  if not found then raise exception 'Project not found'; end if;
  if not private.can_invite(p_project) then
    raise exception 'You do not have permission to invite people';
  end if;

  select id into v_user from auth.users where lower(email) = v_email limit 1;

  if v_user is not null then
    if v_user = v_owner then return json_build_object('status', 'owner'); end if;
    select role into v_existing
    from public.memberships where project_id = p_project and user_id = v_user;
    if v_existing is not null and v_uid <> v_owner then
      raise exception 'Only the owner can change someone''s permission';
    end if;
    insert into public.memberships (project_id, user_id, role)
    values (p_project, v_user, p_role)
    on conflict (project_id, user_id) do update set role = excluded.role;
    return json_build_object('status', 'added');
  end if;

  insert into public.pending_invites (project_id, email, role, invited_by)
  values (p_project, v_email, p_role, v_uid)
  on conflict (project_id, email) do update set role = excluded.role, invited_by = excluded.invited_by;
  return json_build_object('status', 'pending');
end $$;

-- Redeem a share link: p_token_hash is the client-side sha256 hex of the raw
-- token. Returns the project id, or null when the link is unknown/expired.
-- View-only by construction (share_links.role check).
create or replace function public.redeem_share_link(p_token_hash text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_link public.share_links%rowtype;
begin
  if v_uid is null then raise exception 'Sign in to open this link'; end if;
  select * into v_link
  from public.share_links
  where token_hash = p_token_hash
    and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  insert into public.memberships (project_id, user_id, role)
  values (v_link.project_id, v_uid, v_link.role)
  on conflict (project_id, user_id) do nothing;
  return v_link.project_id;
end $$;

-- Signup claims every pending invite for the new email (email confirmation is
-- off in beta, but this holds for any signup path — email/password, Google,
-- Apple — because it runs on the auth.users insert).
create or replace function public.claim_pending_invites()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.memberships (project_id, user_id, role)
  select pi.project_id, new.id, pi.role
  from public.pending_invites pi
  where pi.email = lower(coalesce(new.email, ''))
  on conflict (project_id, user_id) do nothing;
  delete from public.pending_invites where email = lower(coalesce(new.email, ''));
  return new;
end $$;

create trigger on_auth_user_created_claim_invites
  after insert on auth.users
  for each row execute function public.claim_pending_invites();

-- ---------------------------------------------------------------------------
-- 10) Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.set_project_allow_invites(uuid, boolean) from public, anon;
revoke execute on function public.invite_collaborator(uuid, text, text) from public, anon;
revoke execute on function public.redeem_share_link(text) from public, anon;
revoke execute on function public.claim_pending_invites() from public, anon, authenticated;

grant execute on function public.set_project_allow_invites(uuid, boolean),
  public.invite_collaborator(uuid, text, text),
  public.redeem_share_link(text) to authenticated;

grant select, insert, update, delete on public.pending_invites, public.share_links to authenticated;
