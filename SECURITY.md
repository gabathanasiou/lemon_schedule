# Security Policy

Lemon Schedule is a browser-based film production scheduling app, hosted at
[gabathanasiou.github.io/lemon_schedule](https://gabathanasiou.github.io/lemon_schedule/)
with optional accounts, shared projects and realtime collaboration. If you
believe you've found a security vulnerability, please report it privately —
**do not open a public issue.**

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting** on this repository:

**[Security tab → "Report a vulnerability"](https://github.com/gabathanasiou/lemon_schedule/security/advisories/new)**

That opens a private advisory only the maintainer can see.

Please include: what you did, what happened, what you expected, and enough
reproduction detail (URLs, payloads, versions) to verify it.

## What to expect

- **Acknowledgement** within 3 business days.
- **Triage** (severity + whether a fix is planned, roughly when) within 10
  business days.
- A **public advisory** once a fix is released, with credit to you if you'd
  like it. If you plan to disclose publicly, please coordinate a date first.
- This is a small, pre-1.0 project: there is no bug-bounty program and no
  payouts.

## Scope

**In scope** — the hosted app and the services that back it:

- the web app (the hosted build above, and any local build of this repository);
- the collaboration backend (Supabase: authentication, row-level security,
  shared projects, invites, share links);
- the realtime room worker (Cloudflare Workers/Durable Objects,
  `workers/rooms/`);
- handling of project files, imported scripts (FDX/Fountain/CSV/SEX/MSD) and
  account data.

**Out of scope:**

- findings that require physical access to someone's device, or a compromised
  browser/OS;
- social engineering, phishing, spam, or denial-of-service by volume;
- issues in GitHub Pages, Supabase, Google or Cloudflare infrastructure itself
  (report those to the respective provider);
- test/demo data and accounts you created yourself.

## Ground rules (safe harbour)

I will not pursue legal action for good-faith security research under this
policy, provided you:

- use **your own accounts and projects** (or have explicit permission) — never
  access, modify, or exfiltrate another user's data;
- don't degrade the service for others — no destructive testing, no volume
  attacks;
- give a reasonable window to fix the issue before public disclosure.

Thank you for helping keep Lemon Schedule and its users safe.
