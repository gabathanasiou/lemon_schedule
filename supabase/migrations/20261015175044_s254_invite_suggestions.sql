-- 254 — Sharing: invite suggestions (phase 1). Applied to the live dev project
-- 2026-10-15 (ledger version 20261015175044 — the filename mirrors
-- `supabase_migrations.schema_migrations` so a future `supabase db push`
-- cannot double-apply it). Follows 20261012161243_s3_access_events.
-- RLS coverage: supabase/tests/rls_s254.sql.
--
-- Two RPCs for the SharingModal's people picker (roadmap 254; user request
-- 2026-10-15):
--   * list_invite_suggestions(p_project) — the caller's OWN orbit: distinct
--     non-anonymous accounts that share at least one project with the caller,
--     minus the caller, the structural owner and anyone already on the
--     project. Returns id + display_name + avatar_url + email (the email is
--     the deliberate, scoped exposure that renders the picker row's second
--     line; visible only to people who can already see the person, and it
--     never reveals which project they share). No global user directory.
--   * invite_collaborator_by_id(p_project, p_user, p_role) — the email
--     path's twin for people the picker resolved to an account (same rules:
--     can_invite, owner-only role changes, 'owner' status for the owner),
--     plus a reachability guard: only accounts the caller can already see
--     (private.shares_project_with) can be granted access by id, so ids
--     cannot be granted at random.
-- The email path (public.invite_collaborator) is unchanged for people
-- without an account.

-- ---------------------------------------------------------------------------
-- 1) private.list_invite_suggestions(p_project)
-- ---------------------------------------------------------------------------

create or replace function private.list_invite_suggestions(p_project uuid)
returns table (user_id uuid, display_name text, avatar_url text, email text)
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
  select distinct p.id, p.display_name, p.avatar_url, u.email::text
  from public.memberships m
  join public.memberships mine on mine.project_id = m.project_id
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where mine.user_id = v_uid
    and m.user_id <> v_uid
    and m.user_id <> v_owner
    and p.is_anonymous = false
    and not exists (
      select 1 from public.memberships t
      where t.project_id = p_project and t.user_id = m.user_id
    )
  order by p.display_name nulls last, p.id;
end $$;

-- ---------------------------------------------------------------------------
-- 2) private.invite_collaborator_by_id(p_project, p_user, p_role)
-- ---------------------------------------------------------------------------

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

  if not private.shares_project_with(p_user)
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
-- 3) public SECURITY INVOKER wrappers (the advisor-clean RPC surface)
-- ---------------------------------------------------------------------------

create or replace function public.list_invite_suggestions(p_project uuid)
returns table (user_id uuid, display_name text, avatar_url text, email text)
language sql security invoker set search_path = ''
as $$ select * from private.list_invite_suggestions(p_project) $$;

create or replace function public.invite_collaborator_by_id(p_project uuid, p_user uuid, p_role text)
returns json language sql security invoker set search_path = ''
as $$ select private.invite_collaborator_by_id(p_project, p_user, p_role) $$;

revoke execute on function private.list_invite_suggestions(uuid) from public, anon;
revoke execute on function private.invite_collaborator_by_id(uuid, uuid, text) from public, anon;
revoke execute on function public.list_invite_suggestions(uuid) from public, anon;
revoke execute on function public.invite_collaborator_by_id(uuid, uuid, text) from public, anon;

grant execute on function private.list_invite_suggestions(uuid) to authenticated;
grant execute on function private.invite_collaborator_by_id(uuid, uuid, text) to authenticated;
grant execute on function public.list_invite_suggestions(uuid) to authenticated;
grant execute on function public.invite_collaborator_by_id(uuid, uuid, text) to authenticated;
