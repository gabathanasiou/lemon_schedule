---
name: write-agent-docs
description: Write, rewrite, or update documentation meant to be read by AI coding agents — system manuals (docs/*.md), AGENTS.md, CLAUDE.md, architecture notes, onboarding guides. Use when asked to "write a manual for agents", "document how X works for future agents", "make docs agent-friendly", or when a doc must be loadable as context in a future session. NOT for human-facing docs (READMEs for contributors, API reference for end users) — those follow normal documentation style.
---

# Writing Agent-Facing Documentation

Documentation written for AI coding agents must optimize for one constraint:
**the agent's context window is finite, and everything it reads costs tokens it
can't spend on the actual task.** Every line must earn its place. When in doubt,
cut.

## Golden rule

For every sentence, ask: *"Would removing this cause an agent to make a
mistake?"* If no, delete it. This is the filter that separates agent docs from
human docs (tutorials, motivation, history) — an agent does not need to be
convinced, it needs to be correct.

## What to include vs exclude

| Include (agents can't infer it) | Exclude (agents read it from code) |
|---|---|
| The single source of truth for a concept, and that derived data is never stored | API reference, function signatures, obvious code style |
| Hard-won invariants as prohibitions ("MUST NOT break X") | Long explanations, tutorials, backstory |
| Architectural decisions and *why* ("never add a second source of truth") | File-by-file descriptions of the codebase |
| Non-obvious behaviors, edge cases, legacy quirks | Information that changes frequently |
| Exact `file:line` pointers to the canonical implementation | Anything the agent can figure out by reading the code |
| A runnable verification step | Self-evident practices ("write clean code") |

If a concept has one canonical implementation ("do not re-derive from code"),
state it in the doc: *"See X — that is the canonical answer."*

## Structure of a system manual

Order matters — agents skim and skip:

1. **Status line + scope.** First line: what the doc covers and when to read it.
2. **TL;DR mental model (2-4 bullets).** The shape of the system in plain
   language, before any detail. An agent should be able to answer "how does X
   work?" from this section alone.
3. **Source of truth vs derived data.** Explicitly. Name what is *stored* and
   what is *recomputed*, and rule that derived data must never be persisted.
4. **The invariants.** Encoded as MUST NOT rules (prohibitions survive context
   compression better than affirmations). Each maps to a real bug class, not a
   style preference.
5. **A worked example.** A concrete trace through the logic with actual numbers,
   presented as a table. This anchors the abstract rules and is the fastest way
   for an agent to validate its own mental model.
6. **Common-task recipes.** "If you need to X → do Y" with the file/function to
   use. Agents execute these, they don't derive them.
7. **Verification checklist.** Concrete commands (`npm run lint`, `npx playwright
   test`) and manual checks for "did I break the model?" — the agent's
   definition of done.

## Rules for references

- Cite `path/to/file.ts:line` — never just a filename. Exact line numbers let
  the agent jump straight to the source instead of grepping.
- One citation per canonical implementation, not a citation for every usage.
- Reference existing patterns when giving recipes: *"look at how
  `useScheduleDrag.ts` does X and follow it"*.
- Never state a rule without pointing at where it is enforced in code (the
  enforcing call site is the proof the rule is real).

## Template

```markdown
# <Topic> — Agent Manual

Status: read this before touching anything in <area>.

## Mental model (3 bullets)
1. <one-sentence shape of the system>
2. <the key design decision — usually what is derived vs stored>
3. <the invariant that holds everything together>

## Source of truth vs derived
**Stored:** <persisted fields — the only inputs agents may write>.
**Derived:** <recomputed fields — never persist these>.
Rule: <the "never store derived data" rule in one line>.

## Invariants (MUST NOT)
1. Never <...> — <one-line consequence of breaking it>.
...

## Worked example
<concrete trace with real values, as a table>

## Common tasks (agent recipes)
- **<task>** → <exact function/file to use>.
...

## Verification checklist
1. <command that must pass>
2. <manual model check>
```

## Anti-patterns

- **Prose dumps.** More than ~200 lines for a single system means you're
  including something cuttable. A doc an agent ignores is worse than no doc.
- **Parroting code.** If the doc restates the implementation, the code and doc
  will drift. Document decisions and invariants, not line-by-line behavior.
- **Self-contained tutorials.** Agents don't need "how to run the app" explained
  step-by-step; give them the one command and where to put the result.
- **Documenting the obvious.** "Rows are sorted by order" is a fact the code
  proves; the *reason* fractional orders are used is not.
- **Vague prohibitions.** "Be careful with ordering" → "Never insert above the
  pinned daybreak — bump the index to 1." Every MUST NOT needs a concrete
  how-to-stay-safe.
- **Empty checklist.** A verification section with no runnable command is
  theater. Always end with at least one command the agent can execute.

## Workflow when asked to document a system

1. Research with subagents (two parallel passes: data model/actions + component
   rendering/flow) — the research consumes context, not you.
2. Verify the one or two details the research passes disagree on by reading the
   canonical files directly. Never write a doc with a contradiction in it.
3. Write the doc from the template above, keeping it under ~200 lines.
4. Confirm key claims against `file:line` before finishing. If a line number is
   off by one, the whole doc loses trust.

## Maintenance (keep docs from growing stale and fat)

- **Budgets** (measure with `wc -l`): `AGENTS.md` ≤ ~200 lines — it is loaded
  by every agent every session, so it is the most expensive doc; per-feature
  `docs/*.md` ≤ ~200-400 lines each (read on demand); a roadmap archive is
  index-only by design.
- **Compaction step**: every time you edit `AGENTS.md` (or finish a feature
  that adds a section), run the golden-rule sweep — move procedural detail to
  the feature's on-demand doc, replace prose with `file:line` pointers, delete
  superseded lines. Never append-only.
- **Tombstones**: removed machinery gets ONE line ("REMOVED — see
  `.opencode/.trash-deprecated/`"), never a kept-outline section.
- **Archive policy**: completed roadmap items collapse to one index line
  (with a knowledge/code pointer); the narrative lives in git history.
- **Prevent regrowth**: new knowledge replaces or relocates — it must never be
  appended to `AGENTS.md` without a compaction trade-off.
