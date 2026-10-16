-- Invite responses — close the email-existence oracle (roadmap 284, audit
-- F12). Applied to the live dev project 2026-10-16 (ledger version 20261016163400
-- — the filename mirrors it). Acceptance: supabase/tests/rls_s2.sql +
-- rls_s254.sql (identical response for an email WITH an account and one
-- WITHOUT).
--
-- Both email invite paths used to answer 'added' (the address has an account —
-- access granted now) vs 'pending' (no account — invite stored for the signup
-- claim). That let any inviter probe arbitrary addresses for accounts — the
-- team path especially (everyone owns a team). Both paths now answer the same
-- {'status': 'sent'}; the ACTIONS are unchanged (membership / pending invite),
-- the app copy covers both outcomes honestly, and the UI's People list stays
-- the place reality is observed.
--
-- Deliberately unchanged: the 'owner' case (the caller already knows the
-- project owner / it is their own team), and the by-id invites
-- (invite_collaborator_by_id keeps 'added'/'owner' — its reachability guard
-- only accepts people the caller can already see, so there is no oracle).

create or replace function private.invite_collaborator(p_project uuid, p_email text, p_role text)
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
    return json_build_object('status', 'sent');
  end if;

  insert into public.pending_invites (project_id, email, role, invited_by)
  values (p_project, v_email, p_role, v_uid)
  on conflict (project_id, email) do update set role = excluded.role, invited_by = excluded.invited_by;
  return json_build_object('status', 'sent');
end $$;

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
    return json_build_object('status', 'sent');
  end if;

  insert into public.team_invites (team_id, email, invited_by)
  values (p_team, v_email, v_uid)
  on conflict (team_id, email) do update set invited_by = excluded.invited_by;
  return json_build_object('status', 'sent');
end $$;

-- Grants are unchanged: both bodies live in `private` with the existing
-- locked-down executes; the public SECURITY INVOKER wrappers pass through.
