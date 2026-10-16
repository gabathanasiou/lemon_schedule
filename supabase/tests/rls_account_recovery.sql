-- Account recovery-window acceptance (roadmap 294): archive_account snapshots
-- the full footprint BEFORE deletion; restore_account replays it with ids
-- preserved — so the person signs back in with their OLD password — and the
-- daily purge drops rows older than 30 days. The archive table has NO FK to
-- auth.users, so its row SURVIVES the delete; a same-email re-registration is
-- REFUSED, never silently merged. Complements supabase/tests/rls_delete_account.sql
-- (the raw cascade, unchanged).
--
-- Requires migration 20261016142825_account_recovery_archive.sql (applied to
-- the live dev project 2026-10-16).
--
-- HOW TO RUN: paste into the Supabase SQL editor (or psql as the project
-- owner). It runs in ONE transaction and ROLLS BACK: fixtures never persist.
-- Expected: every row `ok = true`.
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/rls_account_recovery.sql

begin;

-- Fixtures: deleter (1111…) owns a blobbed project (revision 7) with peer
-- (2222…) on it, is a viewer on the peer's project, has an email identity, a
-- distinct profile (archived values must win over the signup trigger), a sent
-- invite + share link (token + hash), and a team with the peer on its roster +
-- a team invite. The deleter is also on the PEER's team roster. Inserting into
-- auth.users fires the real signup triggers, so profiles appear on their own.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-111111111111','authenticated','authenticated','del-deleter@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Delete Me"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-4222-8222-222222222222','authenticated','authenticated','del-peer@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Stay Put"}','','','','');

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',
        '{"sub":"11111111-1111-4111-8111-111111111111","email":"del-deleter@example.com","email_verified":true,"phone_verified":false}',
        'email', now(), now(), now());

update public.profiles
set display_name = 'Archived Del', avatar_url = 'https://example.com/del.png'
where id = '11111111-1111-4111-8111-111111111111';

insert into public.projects (id, owner_id, title, data, revision) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Deleter project','DELETER-BLOB',7),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Peer project','PEER-BLOB',0);

insert into public.memberships (project_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','editor'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','viewer');

insert into public.pending_invites (project_id, email, role, invited_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','invitee-on-del@example.com','editor','11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','invitee-on-peer@example.com','viewer','22222222-2222-4222-8222-222222222222');

insert into public.share_links (project_id, token_hash, token, created_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','del-link-hash','del-link-token','11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','peer-link-hash','peer-link-token','22222222-2222-4222-8222-222222222222');

insert into public.teams (id, owner_id, name) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','Deleter team'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222','Peer team');

insert into public.team_members (team_id, user_id) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111');

insert into public.team_invites (team_id, email, invited_by) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','del-team-invitee@example.com','11111111-1111-4111-8111-111111111111'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','peer-team-invitee@example.com','22222222-2222-4222-8222-222222222222');

-- ---- 1) archive_account (called twice — re-archive REPLACES) ----------------
select public.archive_account('11111111-1111-4111-8111-111111111111') as archiving;
select public.archive_account('11111111-1111-4111-8111-111111111111') as re_archiving;

select * from (values
  ('archive row exists', exists (select 1 from public.account_archive where user_id = '11111111-1111-4111-8111-111111111111')),
  ('re-archive keeps exactly ONE row', (select count(*) from public.account_archive where user_id = '11111111-1111-4111-8111-111111111111') = 1),
  ('footprint keeps the users row incl. the password hash', (select footprint -> 'users' ->> 'encrypted_password' from public.account_archive where user_id = '11111111-1111-4111-8111-111111111111') = 'x'),
  ('footprint keeps the identity row', (select jsonb_array_length(footprint -> 'identities') from public.account_archive where user_id = '11111111-1111-4111-8111-111111111111') = 1),
  ('footprint keeps the owned project blob', (select footprint -> 'projects' -> 0 ->> 'data' from public.account_archive where user_id = '11111111-1111-4111-8111-111111111111') = 'DELETER-BLOB'),
  ('footprint keeps all three membership rows', (select jsonb_array_length(footprint -> 'memberships') from public.account_archive where user_id = '11111111-1111-4111-8111-111111111111') = 3),
  ('footprint keeps the team + both roster rows', (select jsonb_array_length(footprint -> 'teams') = 1 and jsonb_array_length(footprint -> 'team_members') = 2 from public.account_archive where user_id = '11111111-1111-4111-8111-111111111111')),
  ('archive does NOT delete anything', exists (select 1 from auth.users where id = '11111111-1111-4111-8111-111111111111'))
) as t(step, ok);

-- ---- 2) the deletion (what admin.deleteUser executes) ------------------------
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';

select * from (values
  ('deleter gone', not exists (select 1 from auth.users where id = '11111111-1111-4111-8111-111111111111')),
  ('deleter OWNED project gone (cascade)', not exists (select 1 from public.projects where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
  ('ARCHIVE row SURVIVES the delete', exists (select 1 from public.account_archive where user_id = '11111111-1111-4111-8111-111111111111')),
  ('peer data SURVIVES', exists (select 1 from public.projects where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') and exists (select 1 from public.teams where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'))
) as t(step, ok);

-- ---- 3) same-email clash: a re-registered account REFUSES the restore -------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000','33333333-3333-4333-8333-333333333333','authenticated','authenticated','del-deleter@example.com','y',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Re-registered"}','','','','');

do $$
begin
  perform public.restore_account('11111111-1111-4111-8111-111111111111');
  raise exception 'restore_account merged a same-email re-registration — it MUST refuse';
exception when others then
  if sqlerrm not like 'Restore refused%' then raise; end if;
end $$;

select * from (values
  ('clash account untouched by the refused restore', exists (select 1 from auth.users where id = '33333333-3333-4333-8333-333333333333')),
  ('archive row kept for a later restore', exists (select 1 from public.account_archive where user_id = '11111111-1111-4111-8111-111111111111')),
  ('deleter still absent after the refusal', not exists (select 1 from auth.users where id = '11111111-1111-4111-8111-111111111111'))
) as t(step, ok);

-- the operator resolves the clash (here: drop the re-registration), then restores
delete from auth.users where id = '33333333-3333-4333-8333-333333333333';

-- ---- 4) restore_account: the footprint comes back, ids preserved ------------
select public.restore_account('11111111-1111-4111-8111-111111111111') as restoring;

select * from (values
  ('auth.users row restored with the OLD password hash', exists (select 1 from auth.users where id = '11111111-1111-4111-8111-111111111111' and email = 'del-deleter@example.com' and encrypted_password = 'x')),
  ('auth.identity restored', exists (select 1 from auth.identities where user_id = '11111111-1111-4111-8111-111111111111' and provider = 'email' and identity_data ->> 'email' = 'del-deleter@example.com')),
  ('profile restored — archived values win over the signup trigger', exists (select 1 from public.profiles where id = '11111111-1111-4111-8111-111111111111' and display_name = 'Archived Del' and avatar_url = 'https://example.com/del.png')),
  ('owned project restored (same id, blob + revision)', exists (select 1 from public.projects where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and owner_id = '11111111-1111-4111-8111-111111111111' and data = 'DELETER-BLOB' and revision = 7)),
  ('project roster restored (peer editor)', exists (select 1 from public.memberships where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '22222222-2222-4222-8222-222222222222' and role = 'editor')),
  ('owner membership on the restored project', exists (select 1 from public.memberships where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '11111111-1111-4111-8111-111111111111' and role = 'owner')),
  ('membership on the peer project restored', exists (select 1 from public.memberships where project_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and user_id = '11111111-1111-4111-8111-111111111111' and role = 'viewer')),
  ('sent invite restored', exists (select 1 from public.pending_invites where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and email = 'invitee-on-del@example.com' and role = 'editor' and invited_by = '11111111-1111-4111-8111-111111111111')),
  ('share link restored (hash + raw token)', exists (select 1 from public.share_links where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and token_hash = 'del-link-hash' and token = 'del-link-token' and created_by = '11111111-1111-4111-8111-111111111111')),
  ('team restored', exists (select 1 from public.teams where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and owner_id = '11111111-1111-4111-8111-111111111111' and name = 'Deleter team')),
  ('team roster restored', exists (select 1 from public.team_members where team_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and user_id = '22222222-2222-4222-8222-222222222222')),
  ('team invite restored', exists (select 1 from public.team_invites where team_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and email = 'del-team-invitee@example.com' and invited_by = '11111111-1111-4111-8111-111111111111')),
  ('membership of the PEER team restored', exists (select 1 from public.team_members where team_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' and user_id = '11111111-1111-4111-8111-111111111111')),
  ('archive row removed on success', not exists (select 1 from public.account_archive where user_id = '11111111-1111-4111-8111-111111111111')),
  ('peer data untouched by archive + restore', exists (select 1 from public.projects where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') and exists (select 1 from public.share_links where token_hash = 'peer-link-hash'))
) as t(step, ok);

-- ---- 5) re-delete works (the account can be deleted again) -------------------
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';

select * from (values
  ('re-delete cascades the profile', not exists (select 1 from public.profiles where id = '11111111-1111-4111-8111-111111111111')),
  ('re-delete cascades the project + roster', not exists (select 1 from public.projects where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') and not exists (select 1 from public.memberships where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
  ('peer data still survives', exists (select 1 from public.projects where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') and exists (select 1 from public.teams where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'))
) as t(step, ok);

-- ---- 6) the 30-day purge (the cron job's exact statement) --------------------
insert into public.account_archive (user_id, archived_at, footprint) values
  ('44444444-4444-4444-8444-444444444444', now() - interval '31 days', '{"aged":true}'),
  ('55555555-5555-4555-8555-555555555555', now(), '{"fresh":true}');

delete from public.account_archive where archived_at < now() - interval '30 days';

select * from (values
  ('aged archive row purged', not exists (select 1 from public.account_archive where user_id = '44444444-4444-4444-8444-444444444444')),
  ('recent archive row kept', exists (select 1 from public.account_archive where user_id = '55555555-5555-4555-8555-555555555555'))
) as t(step, ok);

rollback;
