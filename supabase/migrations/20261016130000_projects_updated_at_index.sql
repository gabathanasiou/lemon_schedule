-- Roadmap 283 (audit F11): the Shared list is paged ordered by updated_at
-- (`listOnlineProjects` → `fetchAllPages`, `src/lib/supabase/pagination.ts`).
-- Give that ordering the index the audit asked for.
create index if not exists projects_updated_at_idx on public.projects (updated_at desc);
