-- S1 RLS acceptance test (roadmap 229; docs/COLLABORATION.md §6 "RLS tests:
-- non-member cannot read; viewer cannot write").
--
-- HOW TO RUN: paste into the Supabase SQL editor (or psql as the project
-- owner — the script needs SET ROLE authenticated). It runs in ONE
-- transaction and ROLLS BACK: fixtures (three fake users + one project) never
-- persist. Expected result: every row `ok = true`.
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/rls_s1.sql
--
-- Also re-check `get_advisors` (security) after any schema change — it must
-- stay clean.

begin;

-- Fixtures: owner, viewer, stranger (handle_new_user creates their profiles).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-111111111111','authenticated','authenticated','rls-owner@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"RLS Owner"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-4222-8222-222222222222','authenticated','authenticated','rls-viewer@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"RLS Viewer"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','33333333-3333-4333-8333-333333333333','authenticated','authenticated','rls-stranger@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"RLS Stranger"}','','','','');

create table private._rls_test (step text primary key, ok boolean not null, detail text);
grant insert, select on private._rls_test to authenticated;

-- ---- owner context --------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

insert into public.projects (id, owner_id, title, data)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','RLS Test','x');

insert into private._rls_test (step, ok, detail)
select 'owner_membership_created', coalesce((select role='owner' from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='11111111-1111-4111-8111-111111111111'), false), 'handle_new_project trigger';
insert into private._rls_test (step, ok, detail)
select 'owner_can_read', exists(select 1 from public.projects where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;
insert into private._rls_test (step, ok, detail)
select 'owner_sees_own_profile', exists(select 1 from public.profiles where id='11111111-1111-4111-8111-111111111111'), null;

insert into public.memberships (project_id, user_id, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','viewer');
insert into private._rls_test (step, ok, detail)
select 'owner_can_add_member', exists(select 1 from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='22222222-2222-4222-8222-222222222222'), null;

-- ---- stranger context -----------------------------------------------------
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
insert into private._rls_test (step, ok, detail)
select 'stranger_cannot_read', not exists(select 1 from public.projects where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;
insert into private._rls_test (step, ok, detail)
select 'stranger_cannot_read_memberships', not exists(select 1 from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;
insert into private._rls_test (step, ok, detail)
select 'stranger_cannot_read_profile', not exists(select 1 from public.profiles where id='11111111-1111-4111-8111-111111111111'), null;
with u as (update public.projects set title='HACKED' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
insert into private._rls_test (step, ok, detail) select 'stranger_cannot_update', count(*)=0, 'rows='||count(*) from u;

-- ---- viewer context -------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
insert into private._rls_test (step, ok, detail)
select 'viewer_can_read', exists(select 1 from public.projects where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;
insert into private._rls_test (step, ok, detail)
select 'viewer_sees_own_membership', exists(select 1 from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='22222222-2222-4222-8222-222222222222'), null;
with u as (update public.projects set title='HACKED' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
insert into private._rls_test (step, ok, detail) select 'viewer_cannot_update', count(*)=0, 'rows='||count(*) from u;
with d as (delete from public.projects where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
insert into private._rls_test (step, ok, detail) select 'viewer_cannot_delete', count(*)=0, 'rows='||count(*) from d;

do $$
begin
  insert into public.memberships (project_id, user_id, role)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','viewer');
  insert into private._rls_test values ('viewer_cannot_add_member', false, 'insert succeeded — BAD');
exception when others then
  insert into private._rls_test values ('viewer_cannot_add_member', true, sqlstate || ' ' || sqlerrm);
end $$;

-- ---- owner sanity: failed writes changed nothing --------------------------
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
insert into private._rls_test (step, ok, detail)
select 'title_untouched', (select title='RLS Test' from public.projects where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;
with u as (update public.projects set title='RLS Test v2' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
insert into private._rls_test (step, ok, detail) select 'owner_can_update', count(*)=1, 'rows='||count(*) from u;

reset role;
select jsonb_agg(jsonb_build_object('step', step, 'ok', ok, 'detail', detail) order by step) as results from private._rls_test;
rollback;
