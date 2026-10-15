-- 254 RLS acceptance (roadmap 254 phase 1; docs/COLLABORATION.md §6 S2 map):
-- invite suggestions come from the caller's OWN orbit (co-members of their
-- projects — never a global directory), and invite-by-id can only grant
-- accounts the caller can already see. Companion to rls_s2.sql (this file is
-- self-contained: own fixtures, own assertions, one rolled-back transaction).
--
-- HOW TO RUN: paste into the Supabase SQL editor (or psql as the project owner
-- — the script needs SET ROLE authenticated). Expected: every row `ok = true`.
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/rls_s254.sql
--
-- Also re-check `get_advisors` (security) after any schema change — it must
-- stay clean apart from the pre-existing Auth leaked-password config lint.

begin;

-- Fixtures: owner, editor, viewer, stranger (no shared projects), helper (in
-- the EDITOR's orbit only) and an anonymous guest on the owner's project.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, email_change, email_change_token_new, recovery_token, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000000','a1111111-1111-4111-8111-111111111111','authenticated','authenticated','rls254-owner@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owner 254"}','','','','', false),
  ('00000000-0000-0000-0000-000000000000','a2222222-2222-4222-8222-222222222222','authenticated','authenticated','rls254-editor@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Editor 254"}','','','','', false),
  ('00000000-0000-0000-0000-000000000000','a3333333-3333-4333-8333-333333333333','authenticated','authenticated','rls254-viewer@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Viewer 254"}','','','','', false),
  ('00000000-0000-0000-0000-000000000000','a4444444-4444-4444-8444-444444444444','authenticated','authenticated','rls254-stranger@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Stranger 254"}','','','','', false),
  ('00000000-0000-0000-0000-000000000000','a5555555-5555-4555-8555-555555555555','authenticated','authenticated','rls254-helper@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Helper 254"}','','','','', false),
  ('00000000-0000-0000-0000-000000000000','a9999999-9999-4999-8999-999999999999','authenticated','authenticated',null,'x',null,now(),now(),'{"provider":"anonymous","providers":[]}','{}','','','','', true);

-- P1 = owner's shared project (editor, viewer, guest); P2 = owner's fresh
-- target project (suggestions surface H1's people here); P3 = editor's own
-- project with helper — the editor's orbit only.
insert into public.projects (id, owner_id, title, data)
values
  ('aaaaaaaa-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','RLS 254 P1','x'),
  ('bbbbbbbb-2222-4222-8222-222222222222','a1111111-1111-4111-8111-111111111111','RLS 254 P2','x'),
  ('cccccccc-3333-4333-8333-333333333333','a2222222-2222-4222-8222-222222222222','RLS 254 P3','x');

insert into public.memberships (project_id, user_id, role)
values
  ('aaaaaaaa-1111-4111-8111-111111111111','a2222222-2222-4222-8222-222222222222','editor'),
  ('aaaaaaaa-1111-4111-8111-111111111111','a3333333-3333-4333-8333-333333333333','viewer'),
  ('aaaaaaaa-1111-4111-8111-111111111111','a9999999-9999-4999-8999-999999999999','viewer'),
  ('cccccccc-3333-4333-8333-333333333333','a5555555-5555-4555-8555-555555555555','viewer');

create table private._rls_s254_test (step text primary key, ok boolean not null, detail text);
grant insert, select on private._rls_s254_test to authenticated;

create temp table _s254_rpc (step text primary key, res json) on commit drop;
grant insert, select on _s254_rpc to authenticated;

create temp table _s254_sugg (user_id uuid, display_name text, avatar_url text, email text) on commit drop;
grant insert, select, delete on _s254_sugg to authenticated;

-- Executable surfacing: anon can never call the picker RPCs.
insert into private._rls_s254_test (step, ok, detail)
select 'anon_cannot_execute_rpcs',
  not has_function_privilege('anon','public.list_invite_suggestions(uuid)','execute')
  and not has_function_privilege('anon','public.invite_collaborator_by_id(uuid,uuid,text)','execute'),
  null;

-- ---- owner context --------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

insert into _s254_sugg (user_id, display_name, avatar_url, email)
select * from public.list_invite_suggestions('bbbbbbbb-2222-4222-8222-222222222222');
insert into private._rls_s254_test (step, ok, detail)
select 'suggestions_are_the_orbit',
  (select count(*) from _s254_sugg) = 2
  and exists(select 1 from _s254_sugg where user_id='a2222222-2222-4222-8222-222222222222' and display_name='Editor 254' and email='rls254-editor@example.com')
  and exists(select 1 from _s254_sugg where user_id='a3333333-3333-4333-8333-333333333333'),
  'P1 co-members only, with names + emails for the rows';
insert into private._rls_s254_test (step, ok, detail)
select 'suggestions_exclude_caller',
  not exists(select 1 from _s254_sugg where user_id='a1111111-1111-4111-8111-111111111111'), null;
insert into private._rls_s254_test (step, ok, detail)
select 'suggestions_exclude_anonymous_guest',
  not exists(select 1 from _s254_sugg where user_id='a9999999-9999-4999-8999-999999999999'),
  'anonymous link guests are not invitable';
insert into private._rls_s254_test (step, ok, detail)
select 'suggestions_are_not_transitive',
  not exists(select 1 from _s254_sugg where user_id='a5555555-5555-4555-8555-555555555555'),
  'helper is in the editor''s orbit only — never the owner''s';

insert into _s254_rpc (step, res)
select 'owner_invites_editor_by_id', public.invite_collaborator_by_id('bbbbbbbb-2222-4222-8222-222222222222','a2222222-2222-4222-8222-222222222222','editor');
insert into private._rls_s254_test (step, ok, detail)
select 'owner_invites_by_id',
  ((select res ->> 'status' from _s254_rpc where step='owner_invites_editor_by_id') = 'added')
  and exists(select 1 from public.memberships where project_id='bbbbbbbb-2222-4222-8222-222222222222' and user_id='a2222222-2222-4222-8222-222222222222' and role='editor'),
  null;

delete from _s254_sugg;
insert into _s254_sugg (user_id, display_name, avatar_url, email)
select * from public.list_invite_suggestions('bbbbbbbb-2222-4222-8222-222222222222');
insert into private._rls_s254_test (step, ok, detail)
select 'suggestions_exclude_existing_member',
  (select count(*) from _s254_sugg) = 1
  and not exists(select 1 from _s254_sugg where user_id='a2222222-2222-4222-8222-222222222222'),
  'invited people leave the suggestions';

do $$
begin
  perform public.invite_collaborator_by_id('bbbbbbbb-2222-4222-8222-222222222222','a1111111-1111-4111-8111-111111111111','viewer');
  insert into private._rls_s254_test values ('invite_by_id_self_rejected', false, 'self-invite succeeded — BAD');
exception when others then
  insert into private._rls_s254_test values ('invite_by_id_self_rejected', true, sqlstate || ' ' || sqlerrm);
end $$;

do $$
begin
  perform public.invite_collaborator_by_id('bbbbbbbb-2222-4222-8222-222222222222','a5555555-5555-4555-8555-555555555555','viewer');
  insert into private._rls_s254_test values ('invite_by_id_unreachable_rejected', false, 'non-collaborator granted — BAD');
exception when others then
  insert into private._rls_s254_test values ('invite_by_id_unreachable_rejected', true, sqlstate || ' ' || sqlerrm);
end $$;

do $$
begin
  perform public.invite_collaborator_by_id('bbbbbbbb-2222-4222-8222-222222222222','a9999999-9999-4999-8999-999999999999','viewer');
  insert into private._rls_s254_test values ('invite_by_id_anonymous_rejected', false, 'anonymous guest promoted — BAD');
exception when others then
  insert into private._rls_s254_test values ('invite_by_id_anonymous_rejected', true, sqlstate || ' ' || sqlerrm);
end $$;

-- ---- editor context: allow_invites OFF on P1, then ON ----------------------
select set_config('request.jwt.claims','{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
begin
  perform public.list_invite_suggestions('aaaaaaaa-1111-4111-8111-111111111111');
  insert into private._rls_s254_test values ('editor_list_refused_when_off', false, 'list succeeded — BAD');
exception when others then
  insert into private._rls_s254_test values ('editor_list_refused_when_off', true, sqlstate || ' ' || sqlerrm);
end $$;

select set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.set_project_allow_invites('aaaaaaaa-1111-4111-8111-111111111111', true);

select set_config('request.jwt.claims','{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
delete from _s254_sugg;
insert into _s254_sugg (user_id, display_name, avatar_url, email)
select * from public.list_invite_suggestions('aaaaaaaa-1111-4111-8111-111111111111');
insert into private._rls_s254_test (step, ok, detail)
select 'editor_lists_own_orbit',
  (select count(*) from _s254_sugg) = 1
  and exists(select 1 from _s254_sugg where user_id='a5555555-5555-4555-8555-555555555555'),
  'reached via the project the callers owns; P1 members + caller + guest excluded';

insert into _s254_rpc (step, res)
select 'editor_invites_helper_by_id', public.invite_collaborator_by_id('aaaaaaaa-1111-4111-8111-111111111111','a5555555-5555-4555-8555-555555555555','viewer');
insert into private._rls_s254_test (step, ok, detail)
select 'editor_invites_by_id',
  ((select res ->> 'status' from _s254_rpc where step='editor_invites_helper_by_id') = 'added')
  and exists(select 1 from public.memberships where project_id='aaaaaaaa-1111-4111-8111-111111111111' and user_id='a5555555-5555-4555-8555-555555555555'),
  null;

insert into _s254_rpc (step, res)
select 'editor_invites_owner_by_id', public.invite_collaborator_by_id('aaaaaaaa-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','viewer');
insert into private._rls_s254_test (step, ok, detail)
select 'invite_by_id_owner_reports_owner',
  (select res ->> 'status' from _s254_rpc where step='editor_invites_owner_by_id') = 'owner', null;

do $$
begin
  perform public.invite_collaborator_by_id('aaaaaaaa-1111-4111-8111-111111111111','a3333333-3333-4333-8333-333333333333','editor');
  insert into private._rls_s254_test values ('editor_cannot_change_role_by_id', false, 'role change succeeded — BAD');
exception when others then
  insert into private._rls_s254_test values ('editor_cannot_change_role_by_id', true, sqlstate || ' ' || sqlerrm);
end $$;

-- ---- stranger + viewer: suggestions are inviter-only -----------------------
select set_config('request.jwt.claims','{"sub":"a4444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
do $$
begin
  perform public.list_invite_suggestions('bbbbbbbb-2222-4222-8222-222222222222');
  insert into private._rls_s254_test values ('stranger_cannot_list_suggestions', false, 'list succeeded — BAD');
exception when others then
  insert into private._rls_s254_test values ('stranger_cannot_list_suggestions', true, sqlstate || ' ' || sqlerrm);
end $$;

select set_config('request.jwt.claims','{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
do $$
begin
  perform public.list_invite_suggestions('aaaaaaaa-1111-4111-8111-111111111111');
  insert into private._rls_s254_test values ('viewer_cannot_list_suggestions', false, 'list succeeded — BAD');
exception when others then
  insert into private._rls_s254_test values ('viewer_cannot_list_suggestions', true, sqlstate || ' ' || sqlerrm);
end $$;

reset role;
select jsonb_agg(jsonb_build_object('step', step, 'ok', ok, 'detail', detail) order by step) as results from private._rls_s254_test;
rollback;
