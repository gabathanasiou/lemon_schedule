-- Advisor hardening for the S1 collaboration schema (applied 2026-10-12;
-- ledger version 20261012112925). Run AFTER 20261012112752_init_collab_memberships.
--
-- Fixes every finding from the Supabase security advisors:
--   * policy helpers move to the non-exposed `private` schema (PostgREST can
--     never call them via /rest/v1/rpc; they take no user argument, so there is
--     no cross-user probing surface either);
--   * `(select auth.uid())` in every policy — the InitPlan form the performance
--     advisor asks for (auth.uid() evaluated once per query, not per row);
--   * trigger functions are no longer executable by anon/authenticated;
--   * `touch_updated_at` gets an immutable search_path.

-- 1) Policy helpers move to the non-exposed "private" schema.
create schema if not exists private;
comment on schema private is 'Non-exposed helper schema (RLS policy helpers). Never add to PostgREST exposed schemas.';

grant usage on schema private to anon, authenticated;

create or replace function private.project_role(p_project uuid)
returns text language sql stable security definer set search_path = ''
as $$ select role from public.memberships where project_id = p_project and user_id = (select auth.uid()) $$;

create or replace function private.is_project_owner(p_project uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.projects where id = p_project and owner_id = (select auth.uid())) $$;

revoke execute on function private.project_role(uuid), private.is_project_owner(uuid) from public;
grant execute on function private.project_role(uuid), private.is_project_owner(uuid) to anon, authenticated;

-- 2) Recreate every policy with the initplan-safe (select auth.uid()) pattern
--    and the private helpers.
drop policy "profiles select self" on public.profiles;
drop policy "profiles insert self" on public.profiles;
drop policy "profiles update self" on public.profiles;
drop policy "projects select member" on public.projects;
drop policy "projects insert own" on public.projects;
drop policy "projects update editor" on public.projects;
drop policy "projects delete owner" on public.projects;
drop policy "memberships select own or owner" on public.memberships;
drop policy "memberships insert owner" on public.memberships;
drop policy "memberships update owner" on public.memberships;
drop policy "memberships delete owner" on public.memberships;

create policy "profiles select self" on public.profiles
  for select using (id = (select auth.uid()));
create policy "profiles insert self" on public.profiles
  for insert with check (id = (select auth.uid()));
create policy "profiles update self" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "projects select member" on public.projects
  for select using (owner_id = (select auth.uid()) or private.project_role(id) is not null);
create policy "projects insert own" on public.projects
  for insert with check (owner_id = (select auth.uid()));
create policy "projects update editor" on public.projects
  for update using (owner_id = (select auth.uid()) or private.project_role(id) in ('owner', 'editor'))
  with check (owner_id = (select auth.uid()) or private.project_role(id) in ('owner', 'editor'));
create policy "projects delete owner" on public.projects
  for delete using (owner_id = (select auth.uid()));

create policy "memberships select own or owner" on public.memberships
  for select using (user_id = (select auth.uid()) or private.is_project_owner(project_id));
create policy "memberships insert owner" on public.memberships
  for insert with check (private.is_project_owner(project_id));
create policy "memberships update owner" on public.memberships
  for update using (private.is_project_owner(project_id));
create policy "memberships delete owner" on public.memberships
  for delete using (private.is_project_owner(project_id));

-- 3) Old public helpers are gone (policies above no longer reference them).
drop function public.project_role(uuid, uuid);
drop function public.is_project_owner(uuid, uuid);

-- 4) Trigger helpers: never callable over RPC (triggers do not need EXECUTE).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_project() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 5) Advisor 0011: immutable search path on the updated_at trigger helper.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;
