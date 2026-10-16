-- Account recovery window (roadmap 294). Applied to the live dev project
-- 2026-10-16 (ledger version 20261016142825 — the filename mirrors it).
-- Acceptance: supabase/tests/rls_account_recovery.sql.
--
-- Deletion (281) stays immediate, and the user-visible copy keeps saying
-- "permanently" (owner decision, 2026-10-16 — no grace window, no cancel, no UI
-- change). Internally the server now snapshots the account's full footprint
-- into public.account_archive BEFORE the admin delete (delete-account aborts if
-- archiving fails — fail closed). The row is the operator-only recovery
-- window: restore_account replays it with ids preserved (auth.users +
-- auth.identities included, so the person signs back in with their OLD
-- password — sessions stay gone), and pg_cron purges rows older than 30 days.
-- Operator runbook: docs/COLLABORATION.md §account restore.

-- ---------------------------------------------------------------------------
-- 1) The archive table — RLS enabled, NO policies (deny-all to anon +
--    authenticated; only service_role, which bypasses RLS, may touch it)
-- ---------------------------------------------------------------------------

create table public.account_archive (
  user_id uuid primary key,          -- NO FK: the row must SURVIVE the auth.users delete
  archived_at timestamptz not null default now(),
  footprint jsonb not null
);
comment on table public.account_archive is
  'Internal recovery archive (roadmap 294): the full pre-delete footprint incl. auth.users + auth.identities (password hash) for the 30-day operator restore window. RLS on, NO policies — reachable only through the service_role-gated archive_account/restore_account RPCs; purged daily by account-archive-purge.';
alter table public.account_archive enable row level security;
revoke all on table public.account_archive from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) archive_account(p_user) — snapshot the full footprint as ONE jsonb.
--    Upsert: re-archiving REPLACES the row (and refreshes the 30-day clock).
--    SECURITY DEFINER because it must read `auth` (PostgREST cannot); execute
--    stays locked to service_role (see grants below).
-- ---------------------------------------------------------------------------

create or replace function public.archive_account(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user         jsonb;
  v_identities   jsonb;
  v_profile      jsonb;
  v_projects     jsonb;
  v_memberships  jsonb;
  v_invites      jsonb;
  v_links        jsonb;
  v_teams        jsonb;
  v_team_members jsonb;
  v_team_invites jsonb;
  v_archived_at  timestamptz;
begin
  select to_jsonb(u) into v_user from auth.users u where u.id = p_user;
  if v_user is null then
    raise exception 'Nothing to archive: no auth.users row for %', p_user;
  end if;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at, i.id), '[]'::jsonb)
    into v_identities
  from auth.identities i where i.user_id = p_user;

  select to_jsonb(p) into v_profile from public.profiles p where p.id = p_user;

  select coalesce(jsonb_agg(to_jsonb(pr) order by pr.created_at, pr.id), '[]'::jsonb)
    into v_projects
  from public.projects pr where pr.owner_id = p_user;

  -- Everything the delete destroys: the user's own membership rows, plus ALL
  -- rows on projects they own (collaborator access cascades with the project).
  select coalesce(jsonb_agg(to_jsonb(m) order by m.project_id, m.user_id), '[]'::jsonb)
    into v_memberships
  from public.memberships m
  where m.user_id = p_user
     or m.project_id in (select pr.id from public.projects pr where pr.owner_id = p_user);

  select coalesce(jsonb_agg(to_jsonb(pi) order by pi.created_at, pi.id), '[]'::jsonb)
    into v_invites
  from public.pending_invites pi
  where pi.invited_by = p_user
     or pi.project_id in (select pr.id from public.projects pr where pr.owner_id = p_user);

  select coalesce(jsonb_agg(to_jsonb(sl) order by sl.created_at, sl.id), '[]'::jsonb)
    into v_links
  from public.share_links sl
  where sl.created_by = p_user
     or sl.project_id in (select pr.id from public.projects pr where pr.owner_id = p_user);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]'::jsonb)
    into v_teams
  from public.teams t where t.owner_id = p_user;

  select coalesce(jsonb_agg(to_jsonb(tm) order by tm.team_id, tm.user_id), '[]'::jsonb)
    into v_team_members
  from public.team_members tm
  where tm.user_id = p_user
     or tm.team_id in (select t.id from public.teams t where t.owner_id = p_user);

  select coalesce(jsonb_agg(to_jsonb(ti) order by ti.created_at, ti.id), '[]'::jsonb)
    into v_team_invites
  from public.team_invites ti
  where ti.invited_by = p_user
     or ti.team_id in (select t.id from public.teams t where t.owner_id = p_user);

  insert into public.account_archive (user_id, archived_at, footprint)
  values (p_user, now(), jsonb_build_object(
    'users', v_user,
    'identities', v_identities,
    'profile', v_profile,
    'projects', v_projects,
    'memberships', v_memberships,
    'pending_invites', v_invites,
    'share_links', v_links,
    'teams', v_teams,
    'team_members', v_team_members,
    'team_invites', v_team_invites
  ))
  on conflict (user_id) do update
    set archived_at = excluded.archived_at,
        footprint = excluded.footprint
  returning archived_at into v_archived_at;

  return jsonb_build_object(
    'user_id', p_user,
    'archived_at', v_archived_at,
    'identities', jsonb_array_length(v_identities),
    'projects', jsonb_array_length(v_projects),
    'memberships', jsonb_array_length(v_memberships),
    'teams', jsonb_array_length(v_teams)
  );
end $$;

-- ---------------------------------------------------------------------------
-- 3) restore_account(p_user) — replay the footprint (ids preserved); refuse a
--    same-email clash (a re-registered account gets a NEW id — never merge
--    silently) and a provider-identity clash (archive kept for a retry); skip
--    and REPORT references to rows deleted during the window (a peer's
--    account/project/team) instead of aborting the whole restore; delete the
--    archive row only on success (same transaction).
--
--    auth.users is inserted with an EXPLICIT column list: confirmed_at is
--    GENERATED ALWAYS. The signup triggers still fire — handle_new_user makes
--    a throwaway profile the archived one then overwrites; the invite-claim
--    triggers re-claim invites addressed to the email (fresh intent wins).
-- ---------------------------------------------------------------------------

create or replace function public.restore_account(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_footprint jsonb;
  v_email     text;
  v_clash     uuid;
  v_count     int;
  v_projects  int := 0;
  v_restored  jsonb := '{}'::jsonb;
begin
  select footprint into v_footprint
  from public.account_archive where user_id = p_user;
  if v_footprint is null then
    raise exception 'No archived account for %', p_user;
  end if;

  if exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'Account % already exists — delete it (or the archive row) before restoring', p_user;
  end if;

  v_email := lower(coalesce(v_footprint -> 'users' ->> 'email', ''));
  if v_email <> '' then
    select u.id into v_clash
    from auth.users u
    where lower(u.email) = v_email
      and u.id <> p_user
      and coalesce(u.is_sso_user, false) = false
    limit 1;
    if v_clash is not null then
      raise exception 'Restore refused: % already belongs to account % — delete that account first (do NOT merge; see docs/COLLABORATION.md §account restore)', v_email, v_clash;
    end if;
  end if;

  -- 1) auth.users (explicit non-generated columns; fires the signup triggers)
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    invited_at, confirmation_token, confirmation_sent_at, recovery_token,
    recovery_sent_at, email_change_token_new, email_change, email_change_sent_at,
    last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
    created_at, updated_at, phone, phone_confirmed_at, phone_change,
    phone_change_token, phone_change_sent_at, email_change_token_current,
    email_change_confirm_status, banned_until, reauthentication_token,
    reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous
  )
  select
    u.instance_id, u.id, u.aud, u.role, u.email, u.encrypted_password, u.email_confirmed_at,
    u.invited_at, u.confirmation_token, u.confirmation_sent_at, u.recovery_token,
    u.recovery_sent_at, u.email_change_token_new, u.email_change, u.email_change_sent_at,
    u.last_sign_in_at, u.raw_app_meta_data, u.raw_user_meta_data, u.is_super_admin,
    u.created_at, u.updated_at, u.phone, u.phone_confirmed_at, u.phone_change,
    u.phone_change_token, u.phone_change_sent_at, u.email_change_token_current,
    u.email_change_confirm_status, u.banned_until, u.reauthentication_token,
    u.reauthentication_sent_at, u.is_sso_user, u.deleted_at, u.is_anonymous
  from jsonb_populate_record(null::auth.users, v_footprint -> 'users') u;
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('users', v_count);

  -- 2) auth.identities (email generated column excluded)
  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
  )
  select i.provider_id, i.user_id, i.identity_data, i.provider, i.last_sign_in_at, i.created_at, i.updated_at, i.id
  from jsonb_populate_recordset(null::auth.identities, v_footprint -> 'identities') i
  where i.id is not null
  on conflict do nothing;
  get diagnostics v_count = row_count;
  -- A skipped conflict is NEVER silent: a short count means a provider identity
  -- already belongs to another account — refuse and keep the archive (retry
  -- after the conflict is resolved).
  if v_count <> jsonb_array_length(v_footprint -> 'identities') then
    raise exception 'Restore refused: % of % identities could not be replayed (a provider identity is already attached to another account) — resolve it, then retry; the archive row is kept',
      jsonb_array_length(v_footprint -> 'identities') - v_count,
      jsonb_array_length(v_footprint -> 'identities');
  end if;
  v_restored := v_restored || jsonb_build_object('identities', v_count);

  -- 3) profile — the archived values win over the trigger's fresh copy
  insert into public.profiles (id, display_name, avatar_url, created_at, is_anonymous)
  select p.id, p.display_name, p.avatar_url, p.created_at, p.is_anonymous
  from jsonb_populate_record(null::public.profiles, v_footprint -> 'profile') p
  where p.id is not null
  on conflict (id) do update set
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    is_anonymous = excluded.is_anonymous,
    created_at = excluded.created_at;
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('profile', v_count);

  -- 4) owned projects (the on_project_created trigger re-creates owner rows)
  insert into public.projects (id, owner_id, title, data, revision, created_at, updated_at, allow_invites)
  select pr.id, pr.owner_id, pr.title, pr.data, pr.revision, pr.created_at, pr.updated_at, pr.allow_invites
  from jsonb_populate_recordset(null::public.projects, v_footprint -> 'projects') pr
  where pr.id is not null;
  get diagnostics v_count = row_count;
  v_projects := v_count;   -- the project trigger re-creates one owner membership each
  v_restored := v_restored || jsonb_build_object('projects', v_count);

  -- 5) memberships — skip rows whose project/user disappeared during the window
  -- (a peer deleted their account/project); reported, never fatal. DO NOTHING
  -- on conflict: never overwrite a trigger-fresh row.
  insert into public.memberships (project_id, user_id, role, created_at)
  select m.project_id, m.user_id, m.role, m.created_at
  from jsonb_populate_recordset(null::public.memberships, v_footprint -> 'memberships') m
  where m.project_id is not null and m.user_id is not null
    and exists (select 1 from public.projects p where p.id = m.project_id)
    and exists (select 1 from auth.users u where u.id = m.user_id)
  on conflict (project_id, user_id) do nothing;
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object(
    'memberships', v_count,
    'memberships_skipped_stale', greatest(jsonb_array_length(v_footprint -> 'memberships') - v_count - v_projects, 0));

  insert into public.pending_invites (id, project_id, email, role, invited_by, created_at)
  select pi.id, pi.project_id, pi.email, pi.role, pi.invited_by, pi.created_at
  from jsonb_populate_recordset(null::public.pending_invites, v_footprint -> 'pending_invites') pi
  where pi.id is not null
    and exists (select 1 from public.projects p where p.id = pi.project_id)
    and exists (select 1 from auth.users u where u.id = pi.invited_by)
  on conflict (project_id, email) do nothing;
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('pending_invites', v_count,
    'pending_invites_skipped_stale', jsonb_array_length(v_footprint -> 'pending_invites') - v_count);

  insert into public.share_links (id, project_id, token_hash, role, expires_at, created_by, created_at, token)
  select sl.id, sl.project_id, sl.token_hash, sl.role, sl.expires_at, sl.created_by, sl.created_at, sl.token
  from jsonb_populate_recordset(null::public.share_links, v_footprint -> 'share_links') sl
  where sl.id is not null
    and exists (select 1 from public.projects p where p.id = sl.project_id)
    and exists (select 1 from auth.users u where u.id = sl.created_by)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('share_links', v_count,
    'share_links_skipped_stale', jsonb_array_length(v_footprint -> 'share_links') - v_count);

  -- 6) teams + rosters + invites
  insert into public.teams (id, owner_id, name, created_at)
  select t.id, t.owner_id, t.name, t.created_at
  from jsonb_populate_recordset(null::public.teams, v_footprint -> 'teams') t
  where t.id is not null;
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('teams', v_count);

  insert into public.team_members (team_id, user_id, created_at)
  select tm.team_id, tm.user_id, tm.created_at
  from jsonb_populate_recordset(null::public.team_members, v_footprint -> 'team_members') tm
  where tm.team_id is not null and tm.user_id is not null
    and exists (select 1 from public.teams t where t.id = tm.team_id)
    and exists (select 1 from auth.users u where u.id = tm.user_id)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('team_members', v_count,
    'team_members_skipped_stale', jsonb_array_length(v_footprint -> 'team_members') - v_count);

  insert into public.team_invites (id, team_id, email, invited_by, created_at)
  select ti.id, ti.team_id, ti.email, ti.invited_by, ti.created_at
  from jsonb_populate_recordset(null::public.team_invites, v_footprint -> 'team_invites') ti
  where ti.id is not null
    and exists (select 1 from public.teams t where t.id = ti.team_id)
    and exists (select 1 from auth.users u where u.id = ti.invited_by)
  on conflict (team_id, email) do nothing;
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('team_invites', v_count,
    'team_invites_skipped_stale', jsonb_array_length(v_footprint -> 'team_invites') - v_count);

  -- 7) success — the archive row's job is done
  delete from public.account_archive where user_id = p_user;
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('archive_rows_removed', v_count);

  return jsonb_build_object('user_id', p_user, 'restored', v_restored);
end $$;

-- ---------------------------------------------------------------------------
-- 4) Grants — service_role ONLY: these read/write the auth schema and must
--    never be reachable from PostgREST with a signed-in user's token.
-- ---------------------------------------------------------------------------

revoke execute on function public.archive_account(uuid) from public, anon, authenticated;
revoke execute on function public.restore_account(uuid) from public, anon, authenticated;
grant execute on function public.archive_account(uuid),
  public.restore_account(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5) Purge — the 30-day window closes automatically (timebox-sweep pattern,
--    20261015211212_session_timebox_sweep.sql)
-- ---------------------------------------------------------------------------

select cron.schedule(
  'account-archive-purge',
  '23 4 * * *',
  $$ delete from public.account_archive where archived_at < now() - interval '30 days' $$
);
