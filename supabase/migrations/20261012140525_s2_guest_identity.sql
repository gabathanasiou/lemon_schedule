-- S2.5 — guest identity for no-account invite links (roadmap 229; applied
-- 2026-10-12; ledger version 20261012140525 — the filename mirrors the ledger).
-- Follows 20261012130452_s2_rpc_invoker_wrappers.
--
-- Link visitors sign in anonymously (no account form). They are ordinary
-- authenticated users, so RLS already scopes them by membership. This
-- migration gives them a stable friendly identity and lets the sharing panel
-- hide them from the People list (they are link visitors, not invitees —
-- S3 presence will surface them as live viewers):
--   * anonymous signups get a fun "Anonymous <Animal>" name (a BEFORE INSERT
--     trigger writes it into raw_user_meta_data, so handle_new_user's
--     existing profile copy picks it up and clients read it from metadata);
--   * profiles.is_anonymous mirrors auth.users.is_anonymous (set on signup,
--     synced by a trigger when a guest converts to a real account).

alter table public.profiles add column is_anonymous boolean not null default false;

update public.profiles p
set is_anonymous = u.is_anonymous
from auth.users u
where u.id = p.id and coalesce(u.is_anonymous, false);

comment on column public.profiles.is_anonymous is
  'Mirror of auth.users.is_anonymous: true for link guests. The sharing panel hides them from the People list (link visitors, not invitees); they appear there once they create an account.';

-- Fun guest names (Google Docs style). Random per signup, stable forever
-- after (stored in auth metadata + profiles.display_name).
create or replace function public.name_anonymous_guests()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_animals text[] := array['Otter','Panda','Fox','Sloth','Koala','Penguin','Axolotl','Capybara','Hedgehog','Raccoon','Platypus','Wombat','Narwhal','Meerkat','Quokka','Tapir','Puffin','Manatee','Chameleon','Pelican'];
begin
  if coalesce(new.is_anonymous, false)
     and coalesce(new.raw_user_meta_data ->> 'full_name', '') = '' then
    new.raw_user_meta_data =
      coalesce(new.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('full_name', 'Anonymous ' || v_animals[1 + floor(random() * array_length(v_animals, 1))::int]);
  end if;
  return new;
end $$;

create trigger before_auth_user_created_name_guests
  before insert on auth.users
  for each row execute function public.name_anonymous_guests();

-- handle_new_user now copies is_anonymous into profiles (same definition,
-- plus the new column).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, is_anonymous)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), coalesce(new.is_anonymous, false))
  on conflict (id) do nothing;
  return new;
end $$;

-- Conversion (guest → real account) flips the profile flag so the person
-- appears in the People list.
create or replace function public.sync_profile_anonymous()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set is_anonymous = new.is_anonymous where id = new.id;
  return new;
end $$;

create trigger on_auth_user_updated_sync_anonymous
  after update on auth.users
  for each row
  when (old.is_anonymous is distinct from new.is_anonymous)
  execute function public.sync_profile_anonymous();

-- Trigger helpers are never callable over RPC.
revoke execute on function public.name_anonymous_guests() from public, anon, authenticated;
revoke execute on function public.sync_profile_anonymous() from public, anon, authenticated;
