# Editions, Licensing & Payments — Plan (PLAN — NOT BUILT)

Status: planning doc for roadmap 230. **Read this before any editions, feature-gating,
licence-verification or payments work.** Nothing here is implemented; decisions were
taken 2026-10 with the user.

Decided: DaVinci-Resolve-style model — Free edition with limits, **Studio £150
one-time** unlock, **collaboration as a subscription on top of Studio**
(`docs/COLLABORATION.md`); licensing **DIY on Supabase** (Ed25519-signed offline
licence files + 3 device activations); **one merchant of record** (Polar or
Lemon Squeezy) for both the one-time price and the subscription; **no account
required to run Studio offline**. Free-tier limit values are still open (`§9`).

## 1. Editions

| Edition | Price | What it gets | Notes |
|---|---|---|---|
| **Free** | £0 | Full app with limits (values TBD — `§9`); 1 project; export of your own data recommended to stay allowed; no collaboration | Drives the demo; must not feel crippled |
| **Studio** | £150 one-time | Every current feature, unlimited projects; works offline via a signed licence file; 3 device activations | The Resolve model; no account required |
| **Collaboration** | Subscription on top of Studio | Shared online projects, invites, presence, realtime editing; invited guests are free | See `docs/COLLABORATION.md`; enforced server-side |

Open product question: exact free limits. The user's working list: 1 project,
~10 scenes ("10 scene sheets" — confirm), no reports designer, no import/export.
**Recommendation** (recorded, not decided): gate pro capabilities, but always
allow exporting the user's own data (CSV + `.lemon` backup) — locking data in
reads as hostage-taking and invites the worst reviews.

## 2. Licensing mental model

1. Purchase → **merchant of record** (handles UK VAT; no Stripe account needed).
2. Webhook → Supabase Edge Function records the purchase and links the
   merchant-of-record-issued licence key.
3. **Activation (online, once per device)**: key + device fingerprint → server
   checks the activation count (≤3) → returns a **signed licence file**
   (Ed25519-signed payload: licence id, tier, entitlements, issuedAt, expiresAt,
   fingerprint hash).
4. The app verifies the signature locally with an **embedded public key** and
   unlocks Studio. Full functionality offline from then on.
5. When online again (~30-day cadence, generous grace), refresh the file; the
   server can revoke on refund/chargeback.
6. Deactivation frees a slot (vendor customer portal or a small "Manage devices"
   page backed by our API).

Truth split: **offline truth = the signed file** (a paying user keeps working on
a plane); **online truth = server entitlements** (refunds, device count). Never
invert that — inventing "online-only checks" breaks the product promise.

## 3. Worked example (activation → offline use)

| Step | Online? | What happens | Where |
|---|---|---|---|
| Buyer checks out | yes | MoR charges, sends licence key | MoR |
| Buyer pastes key on laptop | yes | `activate(key, fingerprint)` → count 1/3 | Edge Function + Postgres |
| Server returns signed file | yes | App stores it (IndexedDB/localStorage) | `src/lib/entitlements.ts` (planned) |
| Launch in a field, no wifi | **no** | Signature + fingerprint + expiry verified locally → Studio on | app |
| 40 days later, online | yes | File refreshed; count re-checked | Edge Function |
| Refund issued | — | Server marks licence revoked → next refresh fails; local file lives until its embedded expiry | MoR webhook + Edge Function |
| New laptop | yes | Activation 2/3; old device deactivates from the portal | portal/API |

## 4. Device model (decided shape)

- **3 activations per licence key** (Resolve allows 2). A device = an activation
  slot; self-service deactivation is mandatory UX (support burden otherwise).
- Fingerprinting is strong on the Tauri desktop app (machine id) and soft on the
  web (browser signals) — the limit is a deterrent, not DRM. Accept that.
- Offline file copy to a fourth machine fails the fingerprint check; a tampered
  file fails the signature check. Both without phoning home.

## 5. Offline reality (per surface)

- **Web today**: no service worker/PWA (verified — nothing in `src/`, `index.html`
  or `public/`), so a fresh load offline is impossible on GitHub Pages; the
  signed file still unlocks a loaded/cached session. A PWA/service-worker pass is
  an optional future item (film sets have bad wifi — likely worth it later).
- **Tauri desktop (roadmap 145)**: bundled UI + signed file = the true
  Resolve-style offline story. This is the licence model's natural home; the web
  app is the convenience surface.

## 6. Payments & VAT

- **One merchant of record** (Polar or Lemon Squeezy — pick at build time;
  evaluate fees ~4–5% + 50¢, licence-key APIs, subscription support, UK VAT/OSS
  handling) for **both** the one-time Studio price and the collaboration
  subscription. MoR removes UK VAT registration/remittance for B2C sales.
- Webhooks → Supabase Edge Functions only; secrets never reach the client
  (AGENTS.md §Security). Refund/chargeback webhooks drive revocation.
- No Stripe integration is planned under this decision.

## 7. Feature gates (canonical architecture)

One module and one registry — no ad-hoc `if (pro)` checks anywhere:

- `src/lib/entitlements.ts` (planned): `getEntitlements()` derives
  `{ tier: 'free' | 'studio', collab: boolean }` from the signed file +
  server sync; `can(key)` reads `FEATURE_GATES`.
- `FEATURE_GATES` registry (planned): every gated capability declares
  `{ requires: 'studio' | 'collab', label }` + free-tier limits as constants
  (project count, scene cap).
- Enforcement layering: UI hides/disables + shows upgrade prompts; **provider/
  reducer guards enforce hard limits** (project create, scene cap, import/export
  actions) so the gate is not merely visual; collaboration is enforced
  server-side (RLS/room auth — `docs/COLLABORATION.md`).
- New gated feature = one registry entry. Everything else stays untouched.

## 8. Invariants (MUST NOT)

1. **MUST NOT require an account to run Studio offline** — the signed file is
   sufficient; accounts are only for collaboration.
2. **MUST NOT ship the signing private key** — only the public key (safe in
   `VITE_*`) ever reaches the client; signing happens in the Supabase Edge
   Function only.
3. **MUST NOT store entitlement/licence state inside the Project document** —
   licensing is app state; the Project stays identical for free/Studio/collab.
4. **MUST NOT gate through scattered checks** — every gate goes through
   `FEATURE_GATES` / `can()`.
5. **MUST NOT break paying users offline** — no online check on the launch path;
   revalidation is opportunistic, with grace.
6. **MUST NOT lock the user's own data** — export stays available (recommended
   for free; mandatory the moment a subscription lapses).
7. **MUST NOT roll your own cryptography** — standard Ed25519 sign/verify only
   (WebCrypto or a maintained tiny lib); the code is verification, not invention.

## 9. Open questions

- **Free limits**: exact numbers (1 project; "10 scene sheets" → confirm scenes
  or sheet rows); reports designer/call sheets/import gating; export policy
  (recommendation: allow).
- **Polar vs Lemon Squeezy** — decide at build time (fees, API, portal).
- Revalidation cadence + offline file expiry (e.g. 30-day recheck, 1-year
  embedded validity?).
- Trial mechanism (time-limited Studio? feature-limited only?).
- Price localisation / regional pricing.
- Upgrade-in-place UX (recommended: existing projects simply unlock — no data
  migration; licence file drop-in).

## 10. Testing strategy

- **Vitest**: signature verification with test keypairs; expiry/fingerprint
  rejection; `FEATURE_GATES` mapping; free-limit guards (project count, scene
  cap).
- **Playwright** (when built): activation against a **mocked** licensing endpoint
  (never hit the real MoR in tests); a free-tier project can't exceed limits; a
  valid signed file unlocks Studio in a fresh context; offline launch with a
  pre-seeded licence file.
- Rule-7 manual: upgrade prompts, Manage-devices page, offline behaviour on the
  desktop app once 145 exists.

## 11. Verification (when coding starts)

1. `npm run lint` (docs + roadmap hygiene) — keep this doc's Status line.
2. Unit + mocked-e2e suites above; `npm run test:smart` before done; full suite
   for any `src/store/` or provider changes (AGENTS.md rule 7).
3. Manual: purchase → activate → kill wifi → relaunch → Studio still on.
