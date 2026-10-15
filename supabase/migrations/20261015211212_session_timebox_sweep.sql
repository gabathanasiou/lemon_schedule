-- Account sessions safety net (roadmap 266). Supabase's built-in "Inactivity
-- timeout" is Pro-plan only (the Management API answers 402 on the free plan),
-- and this GoTrue version records no usable per-session activity timestamp
-- (auth.sessions.refreshed_at is NULL, updated_at never moves,
-- auth.audit_log_entries is empty) — so a true inactivity sweep is not
-- derivable on the free tier. This is a conservative TIME-BOX instead: no
-- session lives forever; sessions older than 180 days are deleted daily.
-- Active users re-sign in at most twice a year; a killed session surfaces
-- cleanly in the app (sign out + "Session expired", roadmap 229 hardening).
-- When the project moves to Pro: replace this with the dashboard's Sessions →
-- Inactivity timeout (30 days) — docs/SECURITY.md §6.
create extension if not exists pg_cron;

select cron.schedule(
  'session-timebox-180d',
  '17 4 * * *',
  $$ delete from auth.sessions where created_at < now() - interval '180 days' $$
);
