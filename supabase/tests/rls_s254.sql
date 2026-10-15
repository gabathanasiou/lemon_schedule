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

create temp table _s254_sugg (user_id uuid, display_name text, avatar_url text, email text, source text) on commit drop;
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

insert into _s254_sugg (user_id, display_name, avatar_url, email, source)
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
insert into _s254_sugg (user_id, display_name, avatar_url, email, source)
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
insert into _s254_sugg (user_id, display_name, avatar_url, email, source)
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

-- ---- 254 phase 2: teams ----------------------------------------------------
-- The owner builds a team: by-id adds require an existing collaboration,
-- invites by email cover new people, teammates see each other and are
-- reachable on every project.
reset role;
create temp table _s254_team (id uuid) on commit drop;
grant insert, select on _s254_team to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

with t as (
  insert into public.teams (owner_id, name)
  values ('a1111111-1111-4111-8111-111111111111','Owner 254 Team')
  returning id
)
insert into _s254_team (id) select id from t;
insert into private._rls_s254_test (step, ok, detail)
select 'team_created',
  (select count(*) from _s254_team) = 1
  and exists(select 1 from public.teams where owner_id='a1111111-1111-4111-8111-111111111111' and name='Owner 254 Team'),
  null;

do $$
begin
  insert into public.teams (owner_id, name) values ('a1111111-1111-4111-8111-111111111111','Second Team');
  insert into private._rls_s254_test values ('one_team_per_owner', false, 'second team created — BAD');
exception when others then
  insert into private._rls_s254_test values ('one_team_per_owner', true, sqlstate || ' ' || sqlerrm);
end $$;

with m as (
  insert into public.team_members (team_id, user_id)
  select (select id from _s254_team), 'a5555555-5555-4555-8555-555555555555'
  returning 1
)
insert into private._rls_s254_test (step, ok, detail)
select 'owner_adds_collaborator_by_id', count(*) = 1, null from m;

do $$
begin
  insert into public.team_members (team_id, user_id)
  select (select id from _s254_team), 'a4444444-4444-4444-8444-444444444444';
  insert into private._rls_s254_test values ('direct_add_requires_shared_project', false, 'stranger added — BAD');
exception when others then
  insert into private._rls_s254_test values ('direct_add_requires_shared_project', true, sqlstate || ' ' || sqlerrm);
end $$;

do $$
begin
  insert into public.team_members (team_id, user_id)
  select (select id from _s254_team), 'a1111111-1111-4111-8111-111111111111';
  insert into private._rls_s254_test values ('direct_add_self_rejected', false, 'self added — BAD');
exception when others then
  insert into private._rls_s254_test values ('direct_add_self_rejected', true, sqlstate || ' ' || sqlerrm);
end $$;

insert into _s254_rpc (step, res)
select 'team_invite_existing', public.invite_team_member((select id from _s254_team), 'rls254-viewer@example.com');
insert into private._rls_s254_test (step, ok, detail)
select 'team_invite_existing_account',
  ((select res ->> 'status' from _s254_rpc where step='team_invite_existing') = 'added')
  and exists(select 1 from public.team_members where team_id=(select id from _s254_team) and user_id='a3333333-3333-4333-8333-333333333333'),
  null;

insert into _s254_rpc (step, res)
select 'team_invite_pending', public.invite_team_member((select id from _s254_team), 'RLS254-New@Example.com');
insert into private._rls_s254_test (step, ok, detail)
select 'team_invite_pending_account',
  ((select res ->> 'status' from _s254_rpc where step='team_invite_pending') = 'pending')
  and exists(select 1 from public.team_invites where team_id=(select id from _s254_team) and email='rls254-new@example.com'),
  'email lowercased + stored for signup claim';

insert into _s254_rpc (step, res)
select 'team_invite_self', public.invite_team_member((select id from _s254_team), 'rls254-owner@example.com');
insert into private._rls_s254_test (step, ok, detail)
select 'team_invite_self_reports_owner',
  (select res ->> 'status' from _s254_rpc where step='team_invite_self') = 'owner', null;

select set_config('request.jwt.claims','{"sub":"a5555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
do $$
begin
  perform public.invite_team_member((select id from _s254_team), 'nope@example.com');
  insert into private._rls_s254_test values ('non_owner_cannot_invite_team', false, 'invite succeeded — BAD');
exception when others then
  insert into private._rls_s254_test values ('non_owner_cannot_invite_team', true, sqlstate || ' ' || sqlerrm);
end $$;
update public.teams set name = 'HACKED' where id = (select id from _s254_team);
insert into private._rls_s254_test (step, ok, detail)
select 'non_owner_cannot_rename_team',
  coalesce((select name = 'Owner 254 Team' from public.teams where id=(select id from _s254_team)), false),
  'renamed — BAD or still intact';
insert into private._rls_s254_test (step, ok, detail)
select 'non_owner_cannot_read_team_invites',
  not exists(select 1 from public.team_invites where team_id=(select id from _s254_team)), null;

-- Teammate profile visibility (viewer is a member now).
insert into private._rls_s254_test (step, ok, detail)
select 'teammate_reads_teammate_profile',
  exists(select 1 from public.profiles where id='a1111111-1111-4111-8111-111111111111'), null;

select set_config('request.jwt.claims','{"sub":"a4444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
insert into private._rls_s254_test (step, ok, detail)
select 'stranger_cannot_read_teammate_profile',
  not exists(select 1 from public.profiles where id='a3333333-3333-4333-8333-333333333333'), null;

-- Guests stay out of teams entirely.
select set_config('request.jwt.claims','{"sub":"a9999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
do $$
begin
  perform public.list_team_suggestions();
  insert into private._rls_s254_test values ('guest_cannot_list_team_suggestions', false, 'list succeeded — BAD');
exception when others then
  insert into private._rls_s254_test values ('guest_cannot_list_team_suggestions', true, sqlstate || ' ' || sqlerrm);
end $$;
do $$
begin
  insert into public.teams (owner_id, name) values ('a9999999-9999-4999-8999-999999999999','Guest Team');
  insert into private._rls_s254_test values ('guest_cannot_create_team', false, 'guest team created — BAD');
exception when others then
  insert into private._rls_s254_test values ('guest_cannot_create_team', true, sqlstate || ' ' || sqlerrm);
end $$;

-- The pending invite is claimed by the real signup trigger.
reset role;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','a6666666-6666-4666-8666-666666666666','authenticated','authenticated','rls254-new@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"New 254"}','','','','');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
insert into private._rls_s254_test (step, ok, detail)
select 'team_invite_claimed_at_signup',
  exists(select 1 from public.team_members where team_id=(select id from _s254_team) and user_id='a6666666-6666-4666-8666-666666666666')
  and not exists(select 1 from public.team_invites where email='rls254-new@example.com'), null;

-- Suggestions carry the source; the new teammate is reachable by id even
-- though they share NO project with the owner (the team branch).
delete from _s254_sugg;
insert into _s254_sugg (user_id, display_name, avatar_url, email, source)
select * from public.list_invite_suggestions('bbbbbbbb-2222-4222-8222-222222222222');
insert into private._rls_s254_test (step, ok, detail)
select 'suggestions_are_team_first',
  (select count(*) from _s254_sugg) = 3
  and (select bool_and(source = 'team') from _s254_sugg),
  'viewer + helper + the claimed teammate, all team-sourced, none colliding with P2 members';

insert into _s254_rpc (step, res)
select 'owner_invites_new_teammate_by_id', public.invite_collaborator_by_id('bbbbbbbb-2222-4222-8222-222222222222','a6666666-6666-4666-8666-666666666666','viewer');
insert into private._rls_s254_test (step, ok, detail)
select 'teammate_reachable_without_shared_project',
  ((select res ->> 'status' from _s254_rpc where step='owner_invites_new_teammate_by_id') = 'added')
  and exists(select 1 from public.memberships where project_id='bbbbbbbb-2222-4222-8222-222222222222' and user_id='a6666666-6666-4666-8666-666666666666'),
  null;

delete from _s254_sugg;
insert into _s254_sugg (user_id, display_name, avatar_url, email, source)
select * from public.list_team_suggestions();
insert into private._rls_s254_test (step, ok, detail)
select 'team_suggestions_exclude_roster',
  (select count(*) from _s254_sugg) = 1
  and exists(select 1 from _s254_sugg where user_id='a2222222-2222-4222-8222-222222222222' and source='collaborator'),
  'editor is a co-member (collaborator source); roster members excluded';

with d as (delete from public.team_members where team_id=(select id from _s254_team) and user_id='a5555555-5555-4555-8555-555555555555' returning 1)
insert into private._rls_s254_test (step, ok, detail)
select 'owner_removes_team_member', count(*)=1, 'rows='||count(*) from d;

select set_config('request.jwt.claims','{"sub":"a6666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
with d as (delete from public.team_members where team_id=(select id from _s254_team) and user_id='a6666666-6666-4666-8666-666666666666' returning 1)
insert into private._rls_s254_test (step, ok, detail)
select 'member_can_leave_team', count(*)=1, 'rows='||count(*) from d;

reset role;
select jsonb_agg(jsonb_build_object('step', step, 'ok', ok, 'detail', detail) order by step) as results from private._rls_s254_test;
rollback;
