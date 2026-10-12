-- S3 RLS acceptance test (roadmap 229; docs/COLLABORATION.md §6 S3 acceptance:
-- non-members cannot join a project's Realtime channel; members — including
-- view-only and anonymous link guests — can send/receive presence + broadcast;
-- revoked members lose access on the next request).
--
-- HOW TO RUN: paste into the Supabase SQL editor (or psql as the project owner
-- — the script needs SET ROLE authenticated/anon). It runs in ONE transaction
-- and ROLLS BACK: fixtures never persist. Expected: every row `ok = true`.
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/rls_s3.sql
--
-- The realtime.* tables are managed by the Realtime service: this test plays
-- the role of the service's authorization check (docs/guides/realtime/
-- authorization): it sets `realtime.topic` (what realtime.topic() reads), then
-- inserts/selects on realtime.messages as the user role. The insert doubles as
-- the send-authorization probe; the select scopes row visibility per topic.
-- Also re-check `get_advisors` (security) after any schema change — expect only
-- the anonymous-sign-ins lint (0012, present since S2.5 for member-facing
-- tables) and the pre-existing Auth leaked-password config lint.

begin;

-- Fixtures: owner, editor, viewer, stranger, guest (link visitor). Memberships
-- are inserted directly as postgres so the test focuses on the realtime policies.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-111111111111','authenticated','authenticated','rls3-owner@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"RLS3 Owner"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-4222-8222-222222222222','authenticated','authenticated','rls3-editor@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"RLS3 Editor"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','33333333-3333-4333-8333-333333333333','authenticated','authenticated','rls3-viewer@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"RLS3 Viewer"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','44444444-4444-4444-8444-444444444444','authenticated','authenticated','rls3-stranger@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"RLS3 Stranger"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','88888888-8888-4888-8888-888888888888','authenticated','authenticated',null,'x',null,now(),now(),'{"provider":"anonymous","providers":[]}','{}','','','','');
update auth.users set is_anonymous = true where id = '88888888-8888-4888-8888-888888888888';

insert into public.projects (id, owner_id, title, data)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','RLS S3 Test','x');
insert into public.memberships (project_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','editor'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','viewer'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','88888888-8888-4888-8888-888888888888','viewer');

-- One row on the project topic (inserted as postgres; RLS does not apply to the
-- owner) so the select-visibility assertions have something to see.
insert into realtime.messages (topic, extension, private, event, payload)
values ('project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','broadcast',true,'cursor','{"probe":1}');

create table private._rls_s3_test (step text primary key, ok boolean not null, detail text);
grant insert, select on private._rls_s3_test to authenticated, anon;

-- ---- owner (member): receive + send on the project topic ------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select set_config('realtime.topic','project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

insert into private._rls_s3_test (step, ok, detail)
select 'member_sees_topic_messages',
  (select count(*) from realtime.messages where topic='project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1, null;

with i as (
  insert into realtime.messages (topic, extension, private, event, payload)
  values ('project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','broadcast',true,'save','{"revision":2}')
  returning 1
)
insert into private._rls_s3_test (step, ok, detail)
select 'member_sends_broadcast', count(*)=1, null from i;

with i as (
  insert into realtime.messages (topic, extension, private, event, payload)
  values ('project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','presence',true,'track','{"userId":"1111"}')
  returning 1
)
insert into private._rls_s3_test (step, ok, detail)
select 'member_sends_presence', count(*)=1, null from i;

do $$
begin
  insert into realtime.messages (topic, extension, private, event, payload)
  values ('project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','postgres_changes',true,'INSERT','{}');
  insert into private._rls_s3_test values ('postgres_changes_extension_rejected', false, 'insert succeeded — BAD');
exception when others then
  insert into private._rls_s3_test values ('postgres_changes_extension_rejected', true, sqlstate || ' ' || sqlerrm);
end $$;

do $$
begin
  perform set_config('realtime.topic','project:not-a-uuid', true);
  insert into realtime.messages (topic, extension, private, event, payload)
  values ('project:not-a-uuid','broadcast',true,'cursor','{}');
  insert into private._rls_s3_test values ('malformed_topic_rejected', false, 'insert succeeded — BAD');
exception when others then
  insert into private._rls_s3_test values ('malformed_topic_rejected', true, sqlstate || ' ' || sqlerrm);
end $$;
select set_config('realtime.topic','project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

do $$
begin
  perform set_config('realtime.topic','project:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
  insert into realtime.messages (topic, extension, private, event, payload)
  values ('project:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','broadcast',true,'cursor','{}');
  insert into private._rls_s3_test values ('non_member_topic_rejected', false, 'insert succeeded — BAD');
exception when others then
  insert into private._rls_s3_test values ('non_member_topic_rejected', true, sqlstate || ' ' || sqlerrm);
end $$;
select set_config('realtime.topic','project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

-- ---- editor + viewer: presence is cosmetic, every member may send ---------
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
with i as (
  insert into realtime.messages (topic, extension, private, event, payload)
  values ('project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','presence',true,'track','{"userId":"2222"}')
  returning 1
)
insert into private._rls_s3_test (step, ok, detail)
select 'editor_sends_presence', count(*)=1, null from i;

select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
insert into private._rls_s3_test (step, ok, detail)
select 'viewer_sees_topic_messages',
  (select count(*) from realtime.messages where topic='project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') >= 1, null;
with i as (
  insert into realtime.messages (topic, extension, private, event, payload)
  values ('project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','presence',true,'track','{"userId":"3333"}')
  returning 1
)
insert into private._rls_s3_test (step, ok, detail)
select 'viewer_sends_presence', count(*)=1, null from i;

-- ---- stranger (signed in, no membership) ----------------------------------
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
insert into private._rls_s3_test (step, ok, detail)
select 'stranger_sees_no_topic_messages',
  not exists(select 1 from realtime.messages where topic='project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;

do $$
begin
  insert into realtime.messages (topic, extension, private, event, payload)
  values ('project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','broadcast',true,'cursor','{}');
  insert into private._rls_s3_test values ('stranger_cannot_send', false, 'insert succeeded — BAD');
exception when others then
  insert into private._rls_s3_test values ('stranger_cannot_send', true, sqlstate || ' ' || sqlerrm);
end $$;

-- ---- anon role (no session at all): no policies, nothing readable/writable -
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}', true);
insert into private._rls_s3_test (step, ok, detail)
select 'anon_sees_no_topic_messages',
  not exists(select 1 from realtime.messages where topic='project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;

do $$
begin
  insert into realtime.messages (topic, extension, private, event, payload)
  values ('project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','broadcast',true,'cursor','{}');
  insert into private._rls_s3_test values ('anon_cannot_send', false, 'insert succeeded — BAD');
exception when others then
  insert into private._rls_s3_test values ('anon_cannot_send', true, sqlstate || ' ' || sqlerrm);
end $$;

-- ---- guest (anonymous member): presence works; revoke takes effect --------
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
with i as (
  insert into realtime.messages (topic, extension, private, event, payload)
  values ('project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','presence',true,'track','{"userId":"8888"}')
  returning 1
)
insert into private._rls_s3_test (step, ok, detail)
select 'guest_sends_presence', count(*)=1, null from i;

reset role;
delete from public.memberships
where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='88888888-8888-4888-8888-888888888888';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
do $$
begin
  insert into realtime.messages (topic, extension, private, event, payload)
  values ('project:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','presence',true,'track','{"userId":"8888"}');
  insert into private._rls_s3_test values ('revoked_guest_cannot_send', false, 'insert succeeded — BAD');
exception when others then
  insert into private._rls_s3_test values ('revoked_guest_cannot_send', true, sqlstate || ' ' || sqlerrm);
end $$;

-- ---- results ---------------------------------------------------------------
reset role;
select jsonb_agg(jsonb_build_object('step', step, 'ok', ok, 'detail', detail) order by step) as results
from private._rls_s3_test;
rollback;
