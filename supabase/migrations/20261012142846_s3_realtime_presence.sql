-- S3 presence on Supabase Realtime (roadmap 229; docs/COLLABORATION.md §6 S3).
-- Applied to the live dev project 2026-10-12 (ledger version 20261012142846 —
-- the filename mirrors `supabase_migrations.schema_migrations` so a future
-- `supabase db push` cannot double-apply it).
--
-- Private per-project channels ("project:<uuid>") + Realtime Authorization:
-- a client can join/send only while it has a membership row on that project —
-- non-members (even with the anon key) are rejected by the RLS policies below,
-- and the role check follows a revocation on the next join/JWT refresh
-- (private-channel policy caches per connection — docs/COLLABORATION.md §6 S3).
--
-- One channel per project: Broadcast carries cursors + save pings, Presence
-- carries who's here + view state. Ephemeral only — nothing here is persisted
-- to the project document.
--
-- Dashboard requirement: Realtime → Settings → "Allow public access" must be
-- OFF so private channels are enforced (docs/COLLABORATION.md §6 runbook).
-- Live check 2026-10-12: signed-out and signed-in non-member joins fail with
-- "Unauthorized"; a member joins, tracks presence and broadcasts.
--
-- Acceptance: supabase/tests/rls_s3.sql. Do NOT add
-- `alter table realtime.messages enable row level security` — RLS is already
-- on and the ALTER fails with "must be owner of table messages".

-- Topic parser: 'project:<uuid>' → uuid; null for anything else (a bad topic
-- can never match a membership).
create or replace function private.project_id_from_topic(p_topic text)
returns uuid language sql immutable set search_path = ''
as $$
  select case
    when p_topic ~ '^project:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substring(p_topic from 9)::uuid
  end;
$$;

revoke execute on function private.project_id_from_topic(text) from public;
grant execute on function private.project_id_from_topic(text) to anon, authenticated;

-- Membership-only receive (broadcast + presence).
create policy "realtime project members receive" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.project_role(private.project_id_from_topic((select realtime.topic()))) is not null
  );

-- Membership-only send (broadcast + presence) — viewers included: presence is
-- cosmetic and read-only members must show up for the team.
create policy "realtime project members send" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.project_role(private.project_id_from_topic((select realtime.topic()))) is not null
  );
