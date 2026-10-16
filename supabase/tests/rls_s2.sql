-- S2 RLS acceptance test (roadmap 229; docs/COLLABORATION.md §6 S2 acceptance:
-- server rejects viewer actions; role changes/revokes take effect on the next
-- request; link invites are self-serve and view-only).
--
-- HOW TO RUN: paste into the Supabase SQL editor (or psql as the project owner
-- — the script needs SET ROLE authenticated). It runs in ONE transaction and
-- ROLLS BACK: fixtures never persist. Expected: every row `ok = true`.
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/rls_s2.sql
--
-- Also re-check `get_advisors` (security) after any schema change — it must
-- stay clean (the only expected warning is the pre-existing Auth
-- leaked-password-protection config lint).
--
-- Redemption matches the sha256 hex of the tokens below; since S2.5 the raw
-- token is ALSO stored (inviter-only via RLS) so the panel can re-display and
-- copy a link at any time:
--   rls-link-1 -> 13a2387372fa81bfaaf43c8dcc5a9718bba0ae7b73aa5ca91ed4abb9f914a5b0
--   rls-link-2 -> 5b682c1a1eeeadb375dfab03c69212015b0da18f662ca73586ac7e73381fddfc
--   rls-link-3 -> 575c197d102f9a299a33fcc0abd5808f1db935226b77ab29be340f58fde7324a

begin;

-- Fixtures: owner, editor, viewer, stranger, linkee. The claim-pending-invites
-- user (rls-new@example.com) is inserted mid-test, on purpose — that fires the
-- real signup trigger.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-111111111111','authenticated','authenticated','rls-owner@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"RLS Owner"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-4222-8222-222222222222','authenticated','authenticated','rls-editor@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"RLS Editor"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','33333333-3333-4333-8333-333333333333','authenticated','authenticated','rls-viewer@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"RLS Viewer"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','44444444-4444-4444-8444-444444444444','authenticated','authenticated','rls-stranger@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"RLS Stranger"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','66666666-6666-4666-8666-666666666666','authenticated','authenticated','rls-linkee@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"RLS Linkee"}','','','','');

create table private._rls_s2_test (step text primary key, ok boolean not null, detail text);
grant insert, select on private._rls_s2_test to authenticated;

-- RPC results are captured first, asserted after: comparing a function call and
-- a subquery in ONE expression lets Postgres evaluate the subquery before the
-- function's effects — the call must be its own statement.
create temp table _s2_rpc (step text primary key, res json, res_bool boolean, res_uuid uuid) on commit drop;
grant insert, select on _s2_rpc to authenticated;

-- ---- owner context --------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

insert into public.projects (id, owner_id, title, data)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','RLS S2 Test','x');

insert into private._rls_s2_test (step, ok, detail)
select 'owner_membership_created',
  coalesce((select role='owner' from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='11111111-1111-4111-8111-111111111111'), false),
  'handle_new_project trigger';
insert into private._rls_s2_test (step, ok, detail)
select 'default_allow_invites_off',
  (select not allow_invites from public.projects where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;

insert into _s2_rpc (step, res)
select 'owner_invites_editor', public.invite_collaborator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls-editor@example.com','editor');
insert into private._rls_s2_test (step, ok, detail)
select 'owner_invites_editor',
  ((select res ->> 'status' from _s2_rpc where step='owner_invites_editor') = 'sent')
  and exists(select 1 from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='22222222-2222-4222-8222-222222222222' and role='editor'),
  null;

insert into _s2_rpc (step, res)
select 'owner_invite_self', public.invite_collaborator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls-owner@example.com','editor');
insert into private._rls_s2_test (step, ok, detail)
select 'owner_invite_self_reports_owner',
  (select res ->> 'status' from _s2_rpc where step='owner_invite_self') = 'owner', null;

-- ---- editor context, allow_invites still OFF ------------------------------
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

insert into private._rls_s2_test (step, ok, detail)
select 'editor_lists_members',
  (select count(*) from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') >= 2, 'people list read';
insert into private._rls_s2_test (step, ok, detail)
select 'editor_sees_owner_profile',
  exists(select 1 from public.profiles where id='11111111-1111-4111-8111-111111111111'), null;
insert into private._rls_s2_test (step, ok, detail)
select 'editor_cannot_see_stranger_profile',
  not exists(select 1 from public.profiles where id='44444444-4444-4444-8444-444444444444'), null;

do $$
begin
  update public.projects set allow_invites = true where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  insert into private._rls_s2_test values ('editor_cannot_flip_allow_invites', false, 'column update succeeded — BAD');
exception when others then
  insert into private._rls_s2_test values ('editor_cannot_flip_allow_invites', true, sqlstate || ' ' || sqlerrm);
end $$;

with u as (
  update public.projects set data = 'editor-blob', revision = revision + 1
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1
)
insert into private._rls_s2_test (step, ok, detail)
select 'editor_can_save_project', count(*) = 1, 'rows=' || count(*) from u;

do $$
begin
  perform public.invite_collaborator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls-viewer@example.com','viewer');
  insert into private._rls_s2_test values ('editor_cannot_invite_when_off', false, 'invite succeeded — BAD');
exception when others then
  insert into private._rls_s2_test values ('editor_cannot_invite_when_off', true, sqlstate || ' ' || sqlerrm);
end $$;

do $$
begin
  insert into public.memberships (project_id, user_id, role)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','viewer');
  insert into private._rls_s2_test values ('editor_cannot_add_member_when_off', false, 'insert succeeded — BAD');
exception when others then
  insert into private._rls_s2_test values ('editor_cannot_add_member_when_off', true, sqlstate || ' ' || sqlerrm);
end $$;

with d as (delete from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='11111111-1111-4111-8111-111111111111' returning 1)
insert into private._rls_s2_test (step, ok, detail) select 'editor_cannot_remove_owner', count(*)=0, 'rows='||count(*) from d;

-- ---- stranger context (before any invite) ---------------------------------
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
insert into private._rls_s2_test (step, ok, detail)
select 'stranger_cannot_read_project',
  not exists(select 1 from public.projects where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;
insert into private._rls_s2_test (step, ok, detail)
select 'stranger_cannot_read_memberships',
  not exists(select 1 from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;
insert into private._rls_s2_test (step, ok, detail)
select 'stranger_cannot_redeem_unknown_hash',
  public.redeem_share_link('deadbeef') is null, null;

-- ---- owner flips allow_invites --------------------------------------------
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
insert into _s2_rpc (step, res_bool)
select 'owner_flips_allow_invites', public.set_project_allow_invites('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
insert into private._rls_s2_test (step, ok, detail)
select 'owner_flips_allow_invites',
  (select res_bool from _s2_rpc where step='owner_flips_allow_invites')
  and (select allow_invites from public.projects where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;

-- A pending invite for an email with no account yet (claimed later).
insert into _s2_rpc (step, res)
select 'owner_pending_invite_created', public.invite_collaborator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','RLS-New@Example.com','editor');
insert into private._rls_s2_test (step, ok, detail)
select 'owner_pending_invite_created',
  ((select res ->> 'status' from _s2_rpc where step='owner_pending_invite_created') = 'sent')
  and exists(select 1 from public.pending_invites where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and email='rls-new@example.com' and role='editor'),
  'email lowercased + stored for signup claim';

-- Roadmap 284: account vs no-account emails must answer IDENTICALLY.
insert into private._rls_s2_test (step, ok, detail)
select 'invite_response_uniform',
  (select res ->> 'status' from _s2_rpc where step='owner_invites_editor')
  = (select res ->> 'status' from _s2_rpc where step='owner_pending_invite_created'),
  'no email-existence oracle';

-- ---- editor context, allow_invites ON -------------------------------------
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

do $$
begin
  perform public.set_project_allow_invites('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
  insert into private._rls_s2_test values ('editor_cannot_flip_allow_invites_via_rpc', false, 'rpc succeeded — BAD');
exception when others then
  insert into private._rls_s2_test values ('editor_cannot_flip_allow_invites_via_rpc', true, sqlstate || ' ' || sqlerrm);
end $$;

insert into _s2_rpc (step, res)
select 'editor_invites_viewer', public.invite_collaborator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls-viewer@example.com','viewer');
insert into private._rls_s2_test (step, ok, detail)
select 'editor_invites_viewer',
  ((select res ->> 'status' from _s2_rpc where step='editor_invites_viewer') = 'sent')
  and exists(select 1 from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='33333333-3333-4333-8333-333333333333' and role='viewer'),
  null;

do $$
begin
  perform public.invite_collaborator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls-viewer@example.com','editor');
  insert into private._rls_s2_test values ('editor_cannot_change_member_role', false, 'role change succeeded — BAD');
exception when others then
  insert into private._rls_s2_test values ('editor_cannot_change_member_role', true, sqlstate || ' ' || sqlerrm);
end $$;

insert into _s2_rpc (step, res)
select 'editor_adds_stranger_viewer', public.invite_collaborator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls-stranger@example.com','viewer');
insert into private._rls_s2_test (step, ok, detail)
select 'editor_adds_stranger_viewer',
  ((select res ->> 'status' from _s2_rpc where step='editor_adds_stranger_viewer') = 'sent')
  and exists(select 1 from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='44444444-4444-4444-8444-444444444444'),
  null;

with i as (
  insert into public.share_links (project_id, token_hash, expires_at, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','13a2387372fa81bfaaf43c8dcc5a9718bba0ae7b73aa5ca91ed4abb9f914a5b0', null, '22222222-2222-4222-8222-222222222222')
  returning 1
)
insert into private._rls_s2_test (step, ok, detail)
select 'editor_creates_share_link', count(*)=1, null from i;
insert into private._rls_s2_test (step, ok, detail)
select 'editor_sees_created_link',
  (select count(*) from public.share_links where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1, null;

do $$
begin
  insert into public.memberships (project_id, user_id, role)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','66666666-6666-4666-8666-666666666666','owner');
  insert into private._rls_s2_test values ('editor_cannot_insert_owner_role', false, 'insert succeeded — BAD');
exception when others then
  insert into private._rls_s2_test values ('editor_cannot_insert_owner_role', true, sqlstate || ' ' || sqlerrm);
end $$;

-- ---- viewer context -------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
insert into private._rls_s2_test (step, ok, detail)
select 'viewer_can_list_members',
  (select count(*) from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') >= 4, null;
insert into private._rls_s2_test (step, ok, detail)
select 'viewer_cannot_see_share_links',
  not exists(select 1 from public.share_links where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'token_hash metadata is inviter-only';
insert into private._rls_s2_test (step, ok, detail)
select 'viewer_cannot_see_pending_invites',
  not exists(select 1 from public.pending_invites where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;
with u as (update public.projects set title='HACKED' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
insert into private._rls_s2_test (step, ok, detail) select 'viewer_cannot_update_project', count(*)=0, 'rows='||count(*) from u;
do $$
begin
  insert into public.share_links (project_id, token_hash, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','5b682c1a1eeeadb375dfab03c69212015b0da18f662ca73586ac7e73381fddfc','33333333-3333-4333-8333-333333333333');
  insert into private._rls_s2_test values ('viewer_cannot_create_share_link', false, 'insert succeeded — BAD');
exception when others then
  insert into private._rls_s2_test values ('viewer_cannot_create_share_link', true, sqlstate || ' ' || sqlerrm);
end $$;

-- ---- linkee context: redeem the view-only link ----------------------------
select set_config('request.jwt.claims','{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
insert into _s2_rpc (step, res_uuid)
select 'linkee_redeems_link', public.redeem_share_link('13a2387372fa81bfaaf43c8dcc5a9718bba0ae7b73aa5ca91ed4abb9f914a5b0');
insert into private._rls_s2_test (step, ok, detail)
select 'linkee_redeems_link',
  (select res_uuid from _s2_rpc where step='linkee_redeems_link') = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and exists(select 1 from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='66666666-6666-4666-8666-666666666666' and role='viewer'),
  null;
insert into private._rls_s2_test (step, ok, detail)
select 'linkee_can_read_project',
  exists(select 1 from public.projects where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;
with u as (update public.projects set title='HACKED-2' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
insert into private._rls_s2_test (step, ok, detail) select 'linkee_cannot_update_project', count(*)=0, 'rows='||count(*) from u;

insert into private._rls_s2_test (step, ok, detail)
select 'linkee_redeem_idempotent',
  public.redeem_share_link('13a2387372fa81bfaaf43c8dcc5a9718bba0ae7b73aa5ca91ed4abb9f914a5b0') = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null;

-- ---- expired + revoked links ----------------------------------------------
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
with i as (
  insert into public.share_links (project_id, token_hash, expires_at, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','5b682c1a1eeeadb375dfab03c69212015b0da18f662ca73586ac7e73381fddfc', now() - interval '1 day', '11111111-1111-4111-8111-111111111111')
  returning 1
)
insert into private._rls_s2_test (step, ok, detail)
select 'owner_creates_expiring_link', count(*)=1, null from i;
with d as (
  delete from public.share_links
  where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and token_hash='13a2387372fa81bfaaf43c8dcc5a9718bba0ae7b73aa5ca91ed4abb9f914a5b0'
  returning 1
)
insert into private._rls_s2_test (step, ok, detail)
select 'owner_revokes_link_1', count(*)=1, null from d;

select set_config('request.jwt.claims','{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
insert into private._rls_s2_test (step, ok, detail)
select 'expired_link_rejected',
  public.redeem_share_link('5b682c1a1eeeadb375dfab03c69212015b0da18f662ca73586ac7e73381fddfc') is null, null;
insert into private._rls_s2_test (step, ok, detail)
select 'revoked_link_rejected',
  public.redeem_share_link('13a2387372fa81bfaaf43c8dcc5a9718bba0ae7b73aa5ca91ed4abb9f914a5b0') is null, null;

-- ---- pending invite claimed at signup (the real trigger) ------------------
reset role;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','55555555-5555-4555-8555-555555555555','authenticated','authenticated','rls-new@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"RLS New"}','','','','');
insert into private._rls_s2_test (step, ok, detail)
select 'pending_invite_claimed_on_signup',
  exists(select 1 from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='55555555-5555-4555-8555-555555555555' and role='editor')
  and not exists(select 1 from public.pending_invites where email='rls-new@example.com'),
  'trigger claimed the invite + cleared the pending row';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
insert into private._rls_s2_test (step, ok, detail)
select 'claimed_member_can_read_project',
  exists(select 1 from public.projects where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;

-- ---- revoke takes effect on the next request ------------------------------
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
with d as (
  delete from public.memberships
  where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='22222222-2222-4222-8222-222222222222'
  returning 1
)
insert into private._rls_s2_test (step, ok, detail)
select 'owner_removes_editor', count(*)=1, null from d;

select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
insert into private._rls_s2_test (step, ok, detail)
select 'revoked_editor_cannot_read_project',
  not exists(select 1 from public.projects where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;
insert into private._rls_s2_test (step, ok, detail)
select 'revoked_editor_role_is_gone',
  not exists(select 1 from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='22222222-2222-4222-8222-222222222222'), 'the app re-checks this on the next request';

-- ---- structural owner row is protected ------------------------------------
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
do $$
begin
  update public.memberships set role = 'viewer'
  where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='11111111-1111-4111-8111-111111111111';
  insert into private._rls_s2_test values ('owner_cannot_demote_self', false, 'update succeeded — BAD');
exception when others then
  insert into private._rls_s2_test values ('owner_cannot_demote_self', true, sqlstate || ' ' || sqlerrm);
end $$;
with d as (delete from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='11111111-1111-4111-8111-111111111111' returning 1)
insert into private._rls_s2_test (step, ok, detail) select 'owner_cannot_delete_own_membership', count(*)=0, 'rows='||count(*) from d;

-- ---- stop-sharing shape: everyone but the owner + all links -----------------
with d as (
  delete from public.memberships
  where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and user_id <> '11111111-1111-4111-8111-111111111111'
  returning 1
)
insert into private._rls_s2_test (step, ok, detail) select 'stop_sharing_removes_members', count(*) = 4, 'rows='||count(*) from d;
insert into _s2_rpc (step, res_bool)
select 'stop_sharing_turns_off_invites', public.set_project_allow_invites('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
insert into private._rls_s2_test (step, ok, detail)
select 'stop_sharing_turns_off_invites',
  (select res_bool from _s2_rpc where step='stop_sharing_turns_off_invites')
  and not (select allow_invites from public.projects where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;
with d as (delete from public.share_links where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
insert into private._rls_s2_test (step, ok, detail) select 'stop_sharing_clears_links', count(*)=1, 'rows='||count(*) from d;

-- ---- revoke evicts the guests the link admitted (S2.5) --------------------
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
with i as (
  insert into public.share_links (project_id, token_hash, token, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','575c197d102f9a299a33fcc0abd5808f1db935226b77ab29be340f58fde7324a','rls-link-3','11111111-1111-4111-8111-111111111111')
  returning 1
)
insert into private._rls_s2_test (step, ok, detail)
select 'owner_recreates_link_for_guest', count(*)=1, null from i;

reset role;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, email_change, email_change_token_new, recovery_token, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000000','88888888-8888-4888-8888-888888888888','authenticated','authenticated',null,'x',null,now(),now(),'{"provider":"anonymous","providers":[]}','{}','','','','', true);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
insert into _s2_rpc (step, res_uuid)
select 'guest_redeems_new_link', public.redeem_share_link('575c197d102f9a299a33fcc0abd5808f1db935226b77ab29be340f58fde7324a');
insert into private._rls_s2_test (step, ok, detail)
select 'guest_membership_created',
  (select res_uuid from _s2_rpc where step='guest_redeems_new_link') = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and exists(select 1 from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='88888888-8888-4888-8888-888888888888'), null;

do $$
begin
  perform public.revoke_share_links('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  insert into private._rls_s2_test values ('viewer_cannot_revoke_links', false, 'revoke succeeded — BAD');
exception when others then
  insert into private._rls_s2_test values ('viewer_cannot_revoke_links', true, sqlstate || ' ' || sqlerrm);
end $$;

select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
insert into _s2_rpc (step, res)
select 'owner_revokes_links', public.revoke_share_links('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into private._rls_s2_test (step, ok, detail)
select 'revoke_evicts_link_guests',
  ((select res ->> 'guests' from _s2_rpc where step='owner_revokes_links')::int) = 1
  and not exists(select 1 from public.memberships where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='88888888-8888-4888-8888-888888888888')
  and not exists(select 1 from public.share_links where project_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null;

-- ---- guest identity for no-account invite links (S2.5) --------------------
reset role;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, email_change, email_change_token_new, recovery_token, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000000','77777777-7777-4777-8777-777777777777','authenticated','authenticated',null,'x',null,now(),now(),'{"provider":"anonymous","providers":[]}','{}','','','','', true);
insert into private._rls_s2_test (step, ok, detail)
select 'guest_gets_fun_name',
  (select display_name like 'Anonymous %' from public.profiles where id='77777777-7777-4777-8777-777777777777')
  and coalesce((select is_anonymous from public.profiles where id='77777777-7777-4777-8777-777777777777'), false),
  'BEFORE INSERT naming + handle_new_user copy';
update auth.users set is_anonymous = false, email = 'rls-converted@example.com'
where id = '77777777-7777-4777-8777-777777777777';
insert into private._rls_s2_test (step, ok, detail)
select 'guest_conversion_syncs_profile',
  coalesce((select not is_anonymous from public.profiles where id='77777777-7777-4777-8777-777777777777'), false),
  'sync trigger — the converted person joins the People list';

reset role;
select jsonb_agg(jsonb_build_object('step', step, 'ok', ok, 'detail', detail) order by step) as results from private._rls_s2_test;
rollback;
