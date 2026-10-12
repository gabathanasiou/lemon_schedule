-- Revoking the link(s) must evict the guests they admitted (roadmap 229
-- S2.5, user decision 2026-10-12): switching to "Only invited people" or
-- Revoke Link removes link-joined anonymous viewers, not just future joins.
-- A SECURITY DEFINER RPC so whoever can revoke (owner or allow-invites
-- editor) can also drop those memberships — the memberships DELETE policy
-- stays owner-only. Applied to the live dev project 2026-10-12 (ledger
-- version 20261012140827 — the filename mirrors the ledger).
create or replace function private.revoke_share_links(p_project uuid)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  v_links integer;
  v_guests integer;
begin
  if not private.can_invite(p_project) then
    raise exception 'You do not have permission to manage this link';
  end if;
  delete from public.share_links where project_id = p_project;
  get diagnostics v_links = row_count;
  delete from public.memberships m
  using public.profiles pr
  where m.project_id = p_project
    and pr.id = m.user_id
    and pr.is_anonymous
    and not private.is_structural_owner(m.project_id, m.user_id);
  get diagnostics v_guests = row_count;
  return json_build_object('links', v_links, 'guests', v_guests);
end $$;

create or replace function public.revoke_share_links(p_project uuid)
returns json language sql security invoker set search_path = ''
as $$ select private.revoke_share_links(p_project) $$;

revoke execute on function private.revoke_share_links(uuid) from public, anon;
revoke execute on function public.revoke_share_links(uuid) from public, anon;
grant execute on function private.revoke_share_links(uuid) to authenticated;
grant execute on function public.revoke_share_links(uuid) to authenticated;
