-- 254 — Sharing: teams (phase 2). Applied to the live dev project 2026-10-15
-- (ledger version 20261015175732 — the filename mirrors
-- `supabase_migrations.schema_migrations`). Follows
-- 20261015175044_s254_invite_suggestions. RLS coverage: supabase/tests/rls_s254.sql.
--
-- A team is the subscriber's roster of accounts — an address book that powers
-- invite suggestions (and, later, the S5 seat boundary). It grants NO project
-- access: sharing stays per project. v1: ONE team per account (unique owner).
-- Guests (anonymous sessions) must convert to a real account first — parity
-- with Collaborate.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My team' check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (owner_id)
);
comment on table public.teams is
  'Account-level roster (roadmap 254): an address book for invite suggestions, NOT an access group. One team per owner.';

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (team_id, email)
);
create index team_invites_email_idx on public.team_invites (email);
comment on table public.team_invites is
  'Team invites for emails with no account yet — claimed by the auth.users signup trigger (same pattern as pending_invites).';

-- ---------------------------------------------------------------------------
-- 2) Helpers (private; security definer; initplan auth.uid())
-- ---------------------------------------------------------------------------

create or replace function private.is_team_owner(p_team uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.teams where id = p_team and owner_id = (select auth.uid())) $$;

create or replace function private.is_team_member(p_team uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.team_members where team_id = p_team and user_id = (select auth.uid())) $$;

-- Does the caller share at least one TEAM with p_user? (teammate profile reads)
create or replace function private.in_same_team(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members mine
    join public.team_members theirs on theirs.team_id = mine.team_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user
  )
$$;

-- A converted (non-anonymous) account. Guests stay out of teams entirely.
create or replace function private.is_real_account()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select not is_anonymous from public.profiles where id = (select auth.uid())), false) $$;

revoke execute on function private.is_team_owner(uuid), private.is_team_member(uuid), private.in_same_team(uuid), private.is_real_account() from public;
grant execute on function private.is_team_owner(uuid), private.is_team_member(uuid), private.in_same_team(uuid), private.is_real_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;

create policy "teams select owner or member" on public.teams
  for select using (owner_id = (select auth.uid()) or private.is_team_member(id));
create policy "teams insert own" on public.teams
  for insert with check (owner_id = (select auth.uid()) and private.is_real_account());
create policy "teams update owner" on public.teams
  for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "teams delete owner" on public.teams
  for delete using (owner_id = (select auth.uid()));

create policy "team_members select same team" on public.team_members
  for select using (private.is_team_member(team_id) or private.is_team_owner(team_id));
-- Direct by-id adds: the owner may add people they ALREADY collaborate with
-- (shares a project) — a roster of known accounts, never a directory probe.
create policy "team_members insert team owner" on public.team_members
  for insert with check (
    private.is_team_owner(team_id)
    and user_id <> (select auth.uid())
    and private.shares_project_with(user_id)
  );
create policy "team_members delete team owner or self" on public.team_members
  for delete using (private.is_team_owner(team_id) or user_id = (select auth.uid()));

create policy "team_invites select team owner" on public.team_invites
  for select using (private.is_team_owner(team_id));
create policy "team_invites insert team owner" on public.team_invites
  for insert with check (private.is_team_owner(team_id) and invited_by = (select auth.uid()));
create policy "team_invites update team owner" on public.team_invites
  for update using (private.is_team_owner(team_id)) with check (private.is_team_owner(team_id));
create policy "team_invites delete team owner" on public.team_invites
  for delete using (private.is_team_owner(team_id));

create policy "profiles select teammate" on public.profiles
  for select using (private.in_same_team(id));

-- ---------------------------------------------------------------------------
-- 4) Team invite by email + signup claim
-- ---------------------------------------------------------------------------

create or replace function private.invite_team_member(p_team uuid, p_email text)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(trim(p_email));
  v_owner uuid;
  v_user uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select owner_id into v_owner from public.teams where id = p_team;
  if not found then raise exception 'Team not found'; end if;
  if not private.is_team_owner(p_team) then raise exception 'Only the team owner can invite people'; end if;
  if v_email = '' or position('@' in v_email) = 0 then raise exception 'Enter a valid email address'; end if;
  if v_email = lower(coalesce((select email from auth.users where id = v_owner), '')) then
    return json_build_object('status', 'owner');
  end if;

  select id into v_user from auth.users
  where lower(email) = v_email and coalesce(is_anonymous, false) = false limit 1;

  if v_user is not null then
    insert into public.team_members (team_id, user_id) values (p_team, v_user)
    on conflict (team_id, user_id) do nothing;
    delete from public.team_invites where team_id = p_team and email = v_email;
    return json_build_object('status', 'added');
  end if;

  insert into public.team_invites (team_id, email, invited_by)
  values (p_team, v_email, v_uid)
  on conflict (team_id, email) do update set invited_by = excluded.invited_by;
  return json_build_object('status', 'pending');
end $$;

create or replace function public.claim_team_invites()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.team_members (team_id, user_id)
  select ti.team_id, new.id
  from public.team_invites ti
  where ti.email = lower(coalesce(new.email, ''))
  on conflict (team_id, user_id) do nothing;
  delete from public.team_invites where email = lower(coalesce(new.email, ''));
  return new;
end $$;

create trigger on_auth_user_created_claim_team_invites
  after insert on auth.users
  for each row execute function public.claim_team_invites();

-- ---------------------------------------------------------------------------
-- 5) Suggestion RPCs grow team awareness
-- ---------------------------------------------------------------------------

-- list_invite_suggestions: return type gains source (group label in the
-- picker), candidates gain teammates. Drop + recreate (types cannot change
-- under CREATE OR REPLACE).
drop function public.list_invite_suggestions(uuid);
drop function private.list_invite_suggestions(uuid);

create or replace function private.list_invite_suggestions(p_project uuid)
returns table (user_id uuid, display_name text, avatar_url text, email text, source text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select owner_id into v_owner from public.projects where id = p_project;
  if not found then raise exception 'Project not found'; end if;
  if not private.can_invite(p_project) then
    raise exception 'You do not have permission to invite people';
  end if;

  return query
  select p.id, p.display_name, p.avatar_url, u.email::text,
         case when private.in_same_team(p.id) then 'team' else 'collaborator' end
  from (
    select m.user_id from public.memberships m
    join public.memberships mine on mine.project_id = m.project_id
    where mine.user_id = v_uid
    union
    select tm.user_id from public.team_members tm
    join public.team_members me on me.team_id = tm.team_id
    where me.user_id = v_uid
  ) c
  join public.profiles p on p.id = c.user_id
  join auth.users u on u.id = c.user_id
  where c.user_id <> v_uid
    and c.user_id <> v_owner
    and p.is_anonymous = false
    and not exists (
      select 1 from public.memberships t
      where t.project_id = p_project and t.user_id = c.user_id
    )
  order by p.display_name nulls last, p.id;
end $$;

-- list_team_suggestions: the Team modal's picker — the caller's orbit minus
-- their own team's members (they are already on the roster).
create or replace function private.list_team_suggestions()
returns table (user_id uuid, display_name text, avatar_url text, email text, source text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if not private.is_real_account() then raise exception 'Create an account to build a team'; end if;

  return query
  select p.id, p.display_name, p.avatar_url, u.email::text,
         case when private.in_same_team(p.id) then 'team' else 'collaborator' end
  from (
    select m.user_id from public.memberships m
    join public.memberships mine on mine.project_id = m.project_id
    where mine.user_id = v_uid
    union
    select tm.user_id from public.team_members tm
    join public.team_members me on me.team_id = tm.team_id
    where me.user_id = v_uid
  ) c
  join public.profiles p on p.id = c.user_id
  join auth.users u on u.id = c.user_id
  where c.user_id <> v_uid
    and p.is_anonymous = false
    and not exists (
      select 1 from public.team_members tm
      join public.teams t on t.id = tm.team_id
      where t.owner_id = v_uid and tm.user_id = c.user_id
    )
  order by p.display_name nulls last, p.id;
end $$;

create or replace function public.list_invite_suggestions(p_project uuid)
returns table (user_id uuid, display_name text, avatar_url text, email text, source text)
language sql security invoker set search_path = ''
as $$ select * from private.list_invite_suggestions(p_project) $$;

create or replace function public.list_team_suggestions()
returns table (user_id uuid, display_name text, avatar_url text, email text, source text)
language sql security invoker set search_path = ''
as $$ select * from private.list_team_suggestions() $$;

-- invite_collaborator_by_id: teammates are reachable too (not just co-members).
create or replace function private.invite_collaborator_by_id(p_project uuid, p_user uuid, p_role text)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_existing text;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_role not in ('editor', 'viewer') then raise exception 'Invalid permission'; end if;
  if p_user = v_uid then raise exception 'You are already on this project'; end if;

  select owner_id into v_owner from public.projects where id = p_project;
  if not found then raise exception 'Project not found'; end if;
  if not private.can_invite(p_project) then
    raise exception 'You do not have permission to invite people';
  end if;
  if p_user = v_owner then return json_build_object('status', 'owner'); end if;

  if not (private.shares_project_with(p_user) or private.in_same_team(p_user))
     or not exists (select 1 from public.profiles p where p.id = p_user and not p.is_anonymous) then
    raise exception 'That person is not one of your collaborators';
  end if;

  select role into v_existing
  from public.memberships where project_id = p_project and user_id = p_user;
  if v_existing is not null and v_uid <> v_owner then
    raise exception 'Only the owner can change someone''s permission';
  end if;
  insert into public.memberships (project_id, user_id, role)
  values (p_project, p_user, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
  return json_build_object('status', 'added');
end $$;

-- ---------------------------------------------------------------------------
-- 6) Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.teams, public.team_members, public.team_invites to authenticated;

revoke execute on function private.invite_team_member(uuid, text) from public, anon;
revoke execute on function public.claim_team_invites() from public, anon, authenticated;
revoke execute on function private.list_team_suggestions() from public, anon;
revoke execute on function public.list_team_suggestions() from public, anon;
revoke execute on function public.list_invite_suggestions(uuid) from public, anon;
grant execute on function private.invite_team_member(uuid, text) to authenticated;
grant execute on function private.list_team_suggestions() to authenticated;
grant execute on function public.list_team_suggestions() to authenticated;
grant execute on function public.list_invite_suggestions(uuid) to authenticated;
