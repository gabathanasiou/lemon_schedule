-- Advisor hardening for the S2 sharing RPCs (applied 2026-10-12; ledger version
-- 20261012130452 — the filename mirrors the ledger). Follows
-- 20261012130425_s2_sharing_roles_invites.
--
-- Supabase's authenticated_security_definer_function_executable lint (0029)
-- flags SECURITY DEFINER functions callable by signed-in users through the
-- exposed public schema. These RPCs ARE the signed-in-user API (each enforces
-- its own permission checks inside), so the fix is the standard pattern: the
-- privileged bodies move to the non-exposed private schema; public keeps thin
-- SECURITY INVOKER wrappers. The RPC surface is unchanged for the app.

-- ---------------------------------------------------------------------------
-- 1) The definer bodies move to private (same signatures, same logic)
-- ---------------------------------------------------------------------------

create or replace function private.set_project_allow_invites(p_project uuid, p_allow boolean)
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
    return json_build_object('status', 'added');
  end if;

  insert into public.pending_invites (project_id, email, role, invited_by)
  values (p_project, v_email, p_role, v_uid)
  on conflict (project_id, email) do update set role = excluded.role, invited_by = excluded.invited_by;
  return json_build_object('status', 'pending');
end $$;

create or replace function private.redeem_share_link(p_token_hash text)
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

revoke execute on function private.set_project_allow_invites(uuid, boolean) from public, anon;
revoke execute on function private.invite_collaborator(uuid, text, text) from public, anon;
revoke execute on function private.redeem_share_link(text) from public, anon;
grant execute on function private.set_project_allow_invites(uuid, boolean),
  private.invite_collaborator(uuid, text, text),
  private.redeem_share_link(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) public wrappers become SECURITY INVOKER (grants stay: same signatures)
-- ---------------------------------------------------------------------------

create or replace function public.set_project_allow_invites(p_project uuid, p_allow boolean)
returns boolean language sql security invoker set search_path = ''
as $$ select private.set_project_allow_invites(p_project, p_allow) $$;

create or replace function public.invite_collaborator(p_project uuid, p_email text, p_role text)
returns json language sql security invoker set search_path = ''
as $$ select private.invite_collaborator(p_project, p_email, p_role) $$;

create or replace function public.redeem_share_link(p_token_hash text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.redeem_share_link(p_token_hash) $$;
