-- 254 — the team OWNER counts as in-team. Applied 2026-10-15 (ledger version
-- 20261015175947). Caught by supabase/tests/rls_s254.sql: the owner has no
-- team_members row, so the teams-migration version of private.in_same_team
-- (and the candidate unions in both suggestion RPCs) never saw the owner's
-- side of their own team — the owner could not reach their own members.
-- These replacements count (owner_id = me) as membership, everywhere.
create or replace function private.in_same_team(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.teams t
    where (t.owner_id = (select auth.uid())
           or exists (select 1 from public.team_members m where m.team_id = t.id and m.user_id = (select auth.uid())))
      and (t.owner_id = p_user
           or exists (select 1 from public.team_members m2 where m2.team_id = t.id and m2.user_id = p_user))
  )
$$;

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
    select tm.user_id
    from public.team_members tm
    where tm.team_id in (
      select t.id from public.teams t
      where t.owner_id = v_uid
        or exists (select 1 from public.team_members me where me.team_id = t.id and me.user_id = v_uid)
    )
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
    select tm.user_id
    from public.team_members tm
    where tm.team_id in (
      select t.id from public.teams t
      where t.owner_id = v_uid
        or exists (select 1 from public.team_members me where me.team_id = t.id and me.user_id = v_uid)
    )
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
