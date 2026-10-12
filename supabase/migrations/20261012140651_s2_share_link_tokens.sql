-- Store the raw invite token alongside its hash so an existing link can be
-- re-displayed and copied at any time (roadmap 229 S2.5, user decision
-- 2026-10-12). RLS keeps it inviter-only ("share_links select inviter"), the
-- same audience that can create links; redemption still matches token_hash.
-- Applied to the live dev project 2026-10-12 (ledger version 20261012140651 —
-- the filename mirrors the ledger).
alter table public.share_links add column token text;

comment on column public.share_links.token is
  'Raw invite token, readable only by inviters (RLS select policy) so the panel can re-display/copy an existing link. token_hash stays the redemption + uniqueness key.';

create unique index share_links_token_key on public.share_links (token);
