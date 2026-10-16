-- Account deletion acceptance (roadmap 281, audit F9): deleting the
-- auth.users row — exactly what admin.deleteUser does in the delete-account
-- Edge Function — must cascade the account's own footprint (profile, OWNED
-- projects, memberships, pending invites, share links, team + roster) while
-- leaving OTHER people's data (projects, memberships, invites) untouched.
--
-- HOW TO RUN: paste into the Supabase SQL editor (or psql as the project
-- owner). It runs in ONE transaction and ROLLS BACK: fixtures never persist.
-- Expected: every row `ok = true`.
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/rls_delete_account.sql
--
-- Complements the manual pass in the 281 close-out notes (delete → re-login →
-- no orphaned rows).

begin;

-- Fixtures: deleter (1111…) owns a project shared with peer (2222…); peer
-- owns another project the deleter is a member of. Every referencing table
-- gets one deleter-created row (and a peer-created CONTROL row that must
-- survive). Inserting into auth.users fires the real signup trigger, so
-- profiles rows appear on their own.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-111111111111','authenticated','authenticated','del-deleter@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Delete Me"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-4222-8222-222222222222','authenticated','authenticated','del-peer@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Stay Put"}','','','','');

insert into public.projects (id, owner_id, title, data, revision) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Deleter project','x',0),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Peer project','x',0);

insert into public.memberships (project_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','editor'),   -- peer on deleter's project
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','viewer');   -- deleter on peer's project

insert into public.pending_invites (project_id, email, role, invited_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','invitee-on-del@example.com','viewer','11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','invitee-on-peer@example.com','viewer','22222222-2222-4222-8222-222222222222');

insert into public.share_links (project_id, token_hash, created_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','del-link-hash','11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','peer-link-hash','22222222-2222-4222-8222-222222222222');

insert into public.teams (id, owner_id, name) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','Deleter team'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222','Peer team');

insert into public.team_members (team_id, user_id) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111');

insert into public.team_invites (team_id, email, invited_by) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','del-team-invitee@example.com','11111111-1111-4111-8111-111111111111'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','peer-team-invitee@example.com','22222222-2222-4222-8222-222222222222');

-- ---- the deletion (what admin.deleteUser executes) -------------------------
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';

-- ---- assertions ------------------------------------------------------------
select * from (values
  ('deleter profile gone', not exists (select 1 from public.profiles where id = '11111111-1111-4111-8111-111111111111')),
  ('deleter OWNED project gone', not exists (select 1 from public.projects where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
  ('peer project SURVIVES', exists (select 1 from public.projects where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),
  ('peer membership on the dead project gone', not exists (select 1 from public.memberships where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
  ('deleter membership on the peer project gone', not exists (select 1 from public.memberships where user_id = '11111111-1111-4111-8111-111111111111')),
  ('deleter-created pending invite gone', not exists (select 1 from public.pending_invites where invited_by = '11111111-1111-4111-8111-111111111111')),
  ('peer pending invite SURVIVES', exists (select 1 from public.pending_invites where invited_by = '22222222-2222-4222-8222-222222222222')),
  ('deleter-created share link gone', not exists (select 1 from public.share_links where created_by = '11111111-1111-4111-8111-111111111111')),
  ('peer share link SURVIVES', exists (select 1 from public.share_links where created_by = '22222222-2222-4222-8222-222222222222')),
  ('deleter team + roster gone', not exists (select 1 from public.teams where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
    and not exists (select 1 from public.team_members where team_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
    and not exists (select 1 from public.team_invites where team_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')),
  ('peer team SURVIVES with the deleter removed from its roster', exists (select 1 from public.teams where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')
    and not exists (select 1 from public.team_members where user_id = '11111111-1111-4111-8111-111111111111'))
) as t(step, ok);

rollback;
