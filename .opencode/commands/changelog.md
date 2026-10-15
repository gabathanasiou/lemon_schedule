---
description: Write the missing days in the public CHANGELOG.md from git history
agent: build
subagent: true
---

Update the public changelog — `CHANGELOG.md` at the repo root — with the days
it is missing. It is read by the app's users (film production people), not
developers: plain human language, never a commit mirror.

Everything the normal case needs — the existing day headings (dates + titles),
the file's head (your insertion anchor), and the commits since the newest day:

!`if [ -f CHANGELOG.md ] && last=$(grep -m1 '^## ' CHANGELOG.md | sed -E 's/^## ([0-9]{4}-[0-9]{2}-[0-9]{2}).*/\1/') && [ -n "$last" ]; then echo "existing day headings:"; grep '^## ' CHANGELOG.md; echo; echo "file head:"; head -6 CHANGELOG.md; echo; if [ -z "$(git log --no-merges --oneline --since="$last 00:00")" ]; then echo "NO NEW COMMITS since $last — stop; nothing to write."; else echo "commits since $last:"; git log --no-merges --date=short --format='%ad %h %s' --since="$last 00:00"; fi; else echo "full history (no entries yet):"; git log --no-merges --date=short --format='%ad %h %s'; fi`

Work from what the block printed — do NOT read the whole CHANGELOG.md. If it
says NO NEW COMMITS, stop without changing anything.

Insert the new day sections directly under the `# Changelog` header (before
the first existing day) with ONE targeted edit anchored on the head you were
shown — never rewrite the file, never touch an existing section. Keep every
new title distinct from the existing ones printed above.

If two dates are appended to this message (a rare backlog range), fill exactly
that range instead: read the file around those dates and insert each day among
its neighbours in date order.

## YYYY-MM-DD — Short playful title

**Features**
- **Area** — what a scheduler can now do.

**Bug fixes**
- **Area** — what stopped going wrong.

**Changes**
- **Area** — improvements, renames, removals a user would notice.

Rules:

- Give every day a short playful title, the way a TV episode is named
  ("The one with the call sheet", "Cast guard patrol"). 2-5 words, tied to
  what the day actually changed, distinct from every earlier title. The
  heading is `## YYYY-MM-DD — Title`; never a number, date or jargon in it.
- Lead each bullet with the app surface it belongs to, in bold, when it has
  one — `- **Schedule** — drag a scene onto a day.` Keep the tag 2-4 words
  and use the surface names the app shows: Schedule, Calendar, Breakdown,
  Scene Sheet, Script, Reports, Reports Designer, Ribbon Designer, Colors,
  Day Manager, Call Sheet, Day Types, Elements, Crew, Locations, Settings,
  Sharing, Projects, Import, Export, Print, File menu. The viewer turns a
  short bold lead like this into a chip. A change spanning surfaces, or with
  no single home, goes without the tag.
- *Italics* only for a short aside; never bold a whole sentence.
- Use only the headings that apply. Skip days with nothing user-visible
  entirely — never write "nothing changed"; the git history is the complete
  record.
- Merge related commits into one bullet — a 20-commit feature is 1-3 bullets.
  Target roughly 5-15 bullets a day.
- NEVER mention, in any form: commit hashes, roadmap or item numbers, version
  numbers, file/function/class/library names, tests, specs, CI, refactors,
  docs work or internal tooling. Describe behavior, not code. Security fixes:
  one high-level sentence only.
- Use the app's user-facing names and real production terms (call time,
  INT DAY, blocking). Never developer jargon.
- Ground every bullet in the commits — never invent or embellish.
- Voice example (match this register): "- **Settings** — the account settings
  now has Profile and Team tabs: your team's roster lives there, and it's
  reachable without opening a project."
