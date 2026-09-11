# Script Diff App — note to self (future)

Status: **parked idea, not scheduled.** Read when someone wants to make the
script-diff viewer a standalone tool. Roadmap item **133**.

## The idea

The script version diff (item 38) and its aligned review (item 128) turned out
to be the best-built part of the script work. The pitch: **spin the viewer out
as a standalone tool** — load two screenplays, see the diffs, no film or project
required. Useful for writers/producers comparing drafts, and as a standalone
"what changed?" utility. Could be a separate small app/site, or a project-less
mode inside this app.

## Prerequisite: PDF screenplay import

Today we only read **FDX** and **Fountain**, both of which carry semantics
(paragraph types, scene numbers, dual dialogue). To be useful as a standalone
tool it must read **PDF** scripts, which carry **no structure** — just glyphs.
That means:

- **Text extraction** preserving columns/indents (pdf.js / pdfjs-dist), then
- **Screenplay heuristics** to recover structure: scene headings (`INT./EXT.`),
  character cues (all-caps above dialogue), parentheticals, transitions,
  dual-dialogue columns, scene numbers, page breaks + **eighths**, revision
  marks/colors.
- **Fidelity risk is high** — real PDFs (FDX/WriterDuet/Final Draft exports,
  scanned pages, colored revision pages) vary wildly. Expect a parser-quality
  problem, not a plumbing problem.
- **OCR** (image-only/scanned PDFs) is a further step and out of scope for the
  first pass.

This PDF work is the real blocker and deserves its own research spike; the diff
viewer itself is basically done.

## What already exists (reuse, don't fork)

- **Body model** — `ScriptDocument` / `ScriptBlock` / `ScriptInline` (`src/types.ts`),
  the retained screenplay (`project.scriptDocument`, 123 Phase 0).
- **Diff engine** — `src/lib/import/scriptDiff.ts` (`diffScripts`, ordered
  matching, split/merge tagging) + `commitScriptDiff.ts`.
- **Aligned renderer** — `alignScriptBlocks` + `ScriptSceneText` /
  `ScriptBlockLine` (`src/components/script/ScriptSceneScript.tsx`), word-level
  highlighting, and the dual-pane review chrome (`ScriptUpdateModal`, item 128).
- **Parsers** — `parseFDX` / `parseFountain` (`src/lib/import/`), both emitting an
  `ImportResult.script`.

So the standalone tool is essentially: **any two `ScriptDocument`s → the 128
view**, behind a thin shell (file pickers, a compare action, the pane). A PDF
parser that emits a `ScriptDocument` would drop straight in.

## Open questions

- **Separate app vs mode?** A truly standalone app would have to extract the
  `src/lib/import` + `src/lib/script` + renderer into a shared package. A
  project-less mode here is far cheaper. Prefer the latter unless there's a real
  demand for a separate deployable.
- **What counts as a "scene" without a project?** The diff relies on scene
  numbers/headings; a PDF without clean headings degrades to text diffing.
- **Page/eighths fidelity** — do we promise pagination in the diff view, or just
  the text diff? (The standalone value is probably the text diff.)
- **Commercial vs internal** — a public script-comparison tool is a different
  product; keep it internal/side until proven.

## Relations

Roadmap **133** (this), reuses **38** + **128** + **123 Phase 0**. Do not build a
second diff engine or a second screenplay renderer for it.
