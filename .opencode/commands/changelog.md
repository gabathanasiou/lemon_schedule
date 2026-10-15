---
description: Write the missing days in the public CHANGELOG.md from git history
agent: build
model: deepseek/deepseek-flash
subagent: true
---

Update the public changelog — `CHANGELOG.md` at the repo root — with the days
it is missing. It is read by the app's users (film production people), not
developers: plain human language, never a commit mirror.

The newest entry and the commits since it (or the full history when the file
does not exist yet):

!`if [ -f CHANGELOG.md ] && last=$(grep -m1 '^## ' CHANGELOG.md | sed 's/^## //') && [ -n "$last" ]; then echo "newest entry: $last"; echo "commits since then:"; git log --no-merges --date=short --format='%ad %h %s' --since="$last 00:00"; else echo "full history (no entries yet):"; git log --no-merges --date=short --format='%ad %h %s'; fi`

If two dates are appended to this message (a backfill range), fill exactly
that range instead of "since the newest entry": run
`git log --no-merges --date=short --format='%ad %h %s' --since='<first> 00:00' --until='<second> 23:59'`
yourself with those dates.

For every missing day that has at least one thing a user would notice, write
a section — newest day first, inserted at the top of the file directly under
the `# Changelog` header. Keep that header and every existing section
untouched. If `CHANGELOG.md` does not exist, create it with a short
`# Changelog` header (one or two sentences: what's new, newest first) before
the sections. If every day is already present, change nothing and say so.

## YYYY-MM-DD

**Features**
- What a scheduler can now do.

**Bug fixes**
- What stopped going wrong — "now" reads well here.

**Changes**
- Improvements, renames, removals a user would notice.

Rules:

- Use only the headings that apply. Skip days with nothing user-visible
  entirely — never write "nothing changed"; the git history is the complete
  record.
- Merge related commits into one bullet — a 20-commit feature is 1-3 bullets.
  Target roughly 5-15 bullets a day.
- NEVER mention, in any form: commit hashes, roadmap or item numbers, version
  numbers, file/function/class/library names, tests, specs, CI, refactors,
  docs work or internal tooling. Describe behavior, not code. Security fixes:
  one high-level sentence only.
- Use the app's user-facing names — Schedule, stripboard, scene ribbon,
  Calendar, Breakdown tab, breakdown grid, Scene Sheet, Script tab, Reports
  tab, Day Out of Days, Day Manager, call sheet, call times, cast list,
  elements, boneyard, clipboard, versions, shared projects, teams, invites —
  and real production terms (call time, INT DAY, blocking). Never developer
  jargon.
- Ground every bullet in the commits — never invent or embellish.
- Voice example (match this register): "Account settings, with Profile and
  Team tabs — your team's roster now lives there, and it's reachable without
  opening a project."
