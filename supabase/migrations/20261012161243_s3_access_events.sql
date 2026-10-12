-- Access-change push on the S3 presence channel (roadmap 229; user request
-- 2026-10-12 — folded into S3: the private per-project channel already exists,
-- so no room is needed). Applied to the live dev project 2026-10-12 (ledger
-- version 20261012161243 — the filename mirrors the schema_migrations ledger).
--
-- A definer trigger on memberships broadcasts an ephemeral 'access' event to
-- the project's topic via realtime.send():
--   { userId, role: 'owner'|'editor'|'viewer'|null, ts }   (null = revoked)
-- The affected client (its own user id in the payload) reacts: role change →
-- message + immediate lock/unlock; revoked → message + kicked out (project
-- closes). RLS remains the enforcement point — this push is UX only, and
-- realtime.send swallows failures so a membership change is never blocked.
--
-- Acceptance: supabase/tests/rls_s3.sql (role_change_pushes_access_event /
-- revoke_pushes_access_event).

create or replace function private.push_membership_access(p_project uuid, p_user uuid, p_role text)
returns void
language sql security definer set search_path = ''
as $$
  select realtime.send(
    jsonb_build_object(
      'userId', p_user,
      'role', p_role,
      'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint
    ),
    'access',
    'project:' || p_project::text,
    true
  );
$$;

revoke execute on function private.push_membership_access(uuid, uuid, text) from public, anon, authenticated;

create or replace function private.notify_membership_access()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.push_membership_access(old.project_id, old.user_id, null);
    return old;
  end if;
  if old.role is distinct from new.role then
    perform private.push_membership_access(new.project_id, new.user_id, new.role);
  end if;
  return new;
end $$;

revoke execute on function private.notify_membership_access() from public, anon, authenticated;

create trigger memberships_access_push
  after update of role or delete on public.memberships
  for each row execute function private.notify_membership_access();
