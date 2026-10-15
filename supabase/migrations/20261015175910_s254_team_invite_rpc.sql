-- 254 — public wrapper for invite_team_member. Applied 2026-10-15 (ledger
-- version 20261015175910). The teams migration (20261015175732) shipped the
-- definer body + grants but missed the SECURITY INVOKER wrapper, so PostgREST
-- could not call it (the app can only reach public-schema RPCs). Additive fix
-- — the body is unchanged.
create or replace function public.invite_team_member(p_team uuid, p_email text)
returns json language sql security invoker set search_path = ''
as $$ select private.invite_team_member(p_team, p_email) $$;

revoke execute on function public.invite_team_member(uuid, text) from public, anon;
grant execute on function public.invite_team_member(uuid, text) to authenticated;
