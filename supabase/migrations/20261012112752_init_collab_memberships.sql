-- Online collaboration S1 (roadmap 229; docs/COLLABORATION.md §6).
-- Applied to the live dev project on 2026-10-12 (ledger version 20261012112752 —
-- the filename mirrors `supabase_migrations.schema_migrations` so a future
-- `supabase db push` cannot double-apply it). Followed by the hardening
-- migration `20261012112925_harden_rls_helpers.sql`. RLS coverage:
-- `supabase/tests/rls_s1.sql`.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Untitled Project',
  data text not null,               -- opaque projectCodec.serializeProject() output
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

comment on column public.projects.data is
  'projectCodec.serializeProject() output — base64(gzip(JSON)). The server treats it as an opaque string.';
comment on column public.projects.revision is
  'Optimistic-concurrency counter; the S4 room increments it per accepted action.';

create index projects_owner_idx on public.projects (owner_id);
create index memberships_user_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- Helpers (security definer = bypass RLS; prevents policy recursion)
-- ---------------------------------------------------------------------------

create or replace function public.project_role(p_project uuid, p_user uuid default auth.uid())
returns text
language sql stable security definer set search_path = public
as $$ select role from memberships where project_id = p_project and user_id = p_user $$;

create or replace function public.is_project_owner(p_project uuid, p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from projects where id = p_project and owner_id = p_user) $$;

-- ---------------------------------------------------------------------------
-- Row Level Security (the ONLY permission source — docs/COLLABORATION.md §8)
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.memberships enable row level security;

-- profiles: only yourself (S1; co-member reads arrive with S3 presence).
create policy "profiles select self" on public.profiles
  for select using (id = auth.uid());
create policy "profiles insert self" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles update self" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- projects: members read; owner creates/deletes; owner + editor update.
create policy "projects select member" on public.projects
  for select using (owner_id = auth.uid() or public.project_role(id) is not null);
create policy "projects insert own" on public.projects
  for insert with check (owner_id = auth.uid());
create policy "projects update editor" on public.projects
  for update using (owner_id = auth.uid() or public.project_role(id) in ('owner', 'editor'))
  with check (owner_id = auth.uid() or public.project_role(id) in ('owner', 'editor'));
create policy "projects delete owner" on public.projects
  for delete using (owner_id = auth.uid());

-- memberships: you see your own rows; the owner manages all rows of their project.
create policy "memberships select own or owner" on public.memberships
  for select using (user_id = auth.uid() or public.is_project_owner(project_id));
create policy "memberships insert owner" on public.memberships
  for insert with check (public.is_project_owner(project_id));
create policy "memberships update owner" on public.memberships
  for update using (public.is_project_owner(project_id));
create policy "memberships delete owner" on public.memberships
  for delete using (public.is_project_owner(project_id));

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql
as $$ begin new.updated_at = now(); return new; end $$;

create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

-- Every new user gets a profile row.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Every new project gets its owner membership row (keeps S2 role checks complete).
create or replace function public.handle_new_project()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.memberships (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id) do nothing;
  return new;
end $$;

create trigger on_project_created
  after insert on public.projects
  for each row execute function public.handle_new_project();

-- ---------------------------------------------------------------------------
-- API grants (Supabase default privileges usually cover this; explicit is safer)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete
  on public.profiles, public.projects, public.memberships
  to authenticated;
