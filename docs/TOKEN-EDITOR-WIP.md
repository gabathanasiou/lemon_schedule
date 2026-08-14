# Reports Token Editor — Session Handoff (WIP)

> **SUPERSEDED (2026-08-14)**: the hand-rolled contentEditable chip/autocomplete
> implementation described below was replaced by **TipTap (ProseMirror)** — see
> `docs/REPORTS-TIPTAP-EDITOR.md`. Storage format is unchanged (`block.text` =
> sanitized HTML with plain `{{field}}` tokens); `{{` is no longer a trigger
> (`@` only). The notes below are kept for history.

Branch: `reports/token-editor` (off `reports/editor-polish`, which has Phase 1 committed).
Date: 2026-08-13. Session interrupted mid-verification — do NOT assume done.

## What is in the working tree (uncommitted)

New files:
- `src/lib/reportTokens.ts` — DOM helpers: `decorateTokens`, `undecorateTokens`,
  `syncChipSelection`, `normalizeCaretOutOfChip`, `textBeforeCaret`,
  `matchOpenToken`, `insertTokenAtCaret`, `TOKEN_TEXT_RE`.
- `src/components/reports/TokenAutocomplete.tsx` — caret-anchored attribute popover
  (group-colored rows, keyboard nav, fixed positioning).

Modified:
- `src/lib/reportFields.ts` — `searchReportFields(fields, q)` (shared with palette),
  `FIELD_GROUP_COLORS` / `fieldChipColor(group)`, `resolveReportTokensHtml(..., { showUnresolved })`.
- `src/components/reports/RichTextEditor.tsx` — chips + autocomplete + click-to-select-chip.
- `src/components/reports/blockControls.tsx` — toolbar `Insert attribute…` now calls
  `editorRef.insertToken(f)` (caret insert); `RichTextEditor` gets `fields={contextFields}`.
- `src/components/reports/ReportPalette.tsx` — uses `searchReportFields`.
- `src/components/reports/ReportBlockView.tsx` — `TokenPreview` chips (TODO: still old
  flat-blue style; new pill style only implemented in the editor DOM so far).
- `src/index.css` — `.rt-token-selected { filter: brightness(0.72); }` (selection highlight
  = darker background only, NO outline — user explicitly asked).

Untracked helper: `e2e/probe-richtext.spec.ts` — the playtest harness. REMOVE before committing.

`npm run lint` currently PASSES.

## Feature spec (user's asks, in order)

1. `&nbsp;` bug: space typed in the editor showed literal "&nbsp;" in Show-field-keys and
   broke word-wrap. FIXED in Phase 1 (committed): `sanitizeRichText` normalizes
   `&nbsp;`/`\u00A0` → space; legacy values normalized at resolve/TokenPreview read points.
2. React hook-order crash (conditional `useRef` in `ContentControls`) — FIXED in Phase 1.
3. Designer canvas: empty token values (pageNumber/pageCount) render blank → `showUnresolved`
   renders the raw `{{token}}` in the canvas only. FIXED in Phase 1 (print keeps true empties).
4. Notion-style attribute tags in the text block:
   - `{{field}}` tokens render as colored PILL chips, **white text on the group color
     background** (border-radius 999px, padding 1px 6px) — implemented in the editor DOM.
   - Typing `{{` opens a caret-anchored autocomplete of scope-filtered attributes (same
     search as the palette); ↑/↓/Enter/Tab/Esc; Enter commits at the caret.
   - Toolbar "Insert attribute…" inserts AT THE CARET (was appending to end).
   - Clicking a chip SELECTS THE WHOLE CHIP (not its text) — so Backspace/Delete removes the
     token, typing replaces it, and the formatting toolbar (Bold/Italic…) targets it.
   - Selected chips get a highlight: `filter: brightness(0.72)` on the chip background.
   - Chips are decoration ONLY: unwrapped before serialization; stored value stays plain
     `{{field}}` text (print/export formats unchanged).
5. User explicitly said: NO need to enter a token to edit it — deleting it is fine (we
   removed the arrow-into-token unwrap idea). Backspace on a chip = delete the whole token.
6. Highlight should change only the chip background colour (no outline) — done.

## Hard-won bugs found & fixed during this session

1. **Global-regex lastIndex flip-flop**: `TOKEN_TEXT_RE` was declared with the `g` flag;
   `.test()` in the caret-split check advanced `lastIndex`, so alternate `refreshChips`
   calls reported "no token" and the caret node was skipped → tokens in the caret's text
   node never chipped ("only the first chip remains solid"). FIX: non-global regex
   (`/\{\{[^{}]+\}\}/`), `decorateTextNode` recreates a fresh `g` regex from `.source`.
2. **Live TreeWalker skips nodes after removal**: `decorateTokens` used a second TreeWalker
   to decorate; `decorateTextNode` removes the walked node, so the walker skipped every
   node after it (tokens after the first chip never decorated). FIX: collect a snapshot
   array (`collectTextNodes`) and decorate in a plain loop.
3. **Caret detachment at node end**: decorating the caret's own text node removes it →
   caret lost (Home/End quirk, "cursor goes away"). FIX: `decorateTokens` splits the
   caret's text node AT the caret first (`splitText`), decorates the left part, skips the
   right part — the caret's node is never removed. This is also what makes
   "type `{{token}}` then space → chip forms" work (token before the caret chips up).
4. **Caret inside a chip** (edge-click after blur/refocus): invisible caret + typing
   mutated the token ("typing breaks the chip"). FIX: `normalizeCaretOutOfChip` moves the
   caret to the nearest chip boundary; called in `onInput` + `selectionchange`.
5. **Bold destroying chips**: `refreshChips` had a non-collapsed-selection early-return,
   so after `exec('bold')` (selection stays active) chips never re-formed. FIX: removed
   the guard — split-at-caret keeps decoration safe under selections. (Verified in
   probe: BOLD on a selected chip re-chips.)
6. **onFocus no longer undecorates** (was unwrapping all chips on focus, which fights
   click-to-select and re-decoration).
7. `updateAutocomplete` only fires for a COLLAPSED caret inside a text node.

## Editor mechanics (current design)

- Chips are `<span data-rt-token contenteditable="false">` with white text on the group
  color (`fieldChipColor`). Selected = `.rt-token-selected` class.
- `onMouseDown` on a chip: `preventDefault()` → focus editor → set selection covering the
  chip → `syncChipSelection`. So click = whole-chip selection (no caret inside).
- `selectionchange` (while focused): `normalizeCaretOutOfChip` → save range → autocomplete
  → `refreshChips` → `syncChipSelection`.
- `insertToken(field)` (toolbar): focus → `undecorateTokens` → restore caret from
  `lastRangeRef` (if still connected) else `rangeAtOffset(el, blurOffsetRef)` → insert.
  `blurOffset` is captured in `onBlur` BEFORE decoration so offsets stay valid.
- Blur: commit value (undecorate → sanitize → onChange) then decorate ALL chips.

## Probe results (last known state)

`e2e/probe-richtext.spec.ts` (multi-chip playtest v2):
- SEED of 3 tokens → 3 pills with correct group colors. ✓
- Click each chip → whole-chip selection + `.rt-token-selected`. ✓
- Space on selected chip → replaces it, caret ends OUTSIDE in a text node. ✓
- Type over selected chip → replaces it, caret outside. ✓
- Backspace on selected chip → deletes the token entirely. ✓
- The run was interrupted at the BOLD step — the Bold-button locator was just fixed
  (button uses `aria-label="Bold"`, and it is NOT inside `.block-chrome` — use
  `page.locator('button[aria-label="Bold"]')`).

## Next steps (when resuming)

1. Run `npx playwright test e2e/probe-richtext.spec.ts` and watch BOLD_pre → BOLD_post →
   BOLD_unbold, then BLUR → REFOCUS → TYPE_AFTER_REFOCUS, INSERT_AT_CARET (toolbar
   "Insert attribute…" → pick "Page Size"), SPACE_on_chip, ARROWS, SHIFT_select, UNDO/REDO.
2. Still TODO: `TokenPreview` in `ReportBlockView.tsx` (designer Show-field-keys) still
   uses the OLD flat blue chip styling — update to white-on-group-color pills for parity.
3. Delete `e2e/probe-richtext.spec.ts` before committing.
4. Run `npm run lint` + full report e2e suites (`report-editor-polish`,
   `report-designer-move`, `report-smart-scoping`). `report-designer-move` has one
   PRE-EXISTING failure ("Elements (of this category)" menu) — fails on base branch too.
5. Commit Phase 2 on `reports/token-editor` (small focused commits), then decide whether
   to keep hand-rolled vs TipTap (user was undecided; hand-rolled is in progress).

## Notes / gotchas

- The seeded project title block text is `{{title}} — One-Liner` (from
  `reportTemplates.ts`); project.title = "Town - Jason".
- `.block-chrome` exists in the canvas; the RichTextToolbar (Bold/Italic) renders outside
  the chrome element in floating mode.
- `caretRange()` returns null when the selection isn't inside the editor — all handlers
  guard on it.
- Chips never reach the sanitizer (undecorated before serialization), so the stored
  format and `dangerouslySetInnerHTML` print path are untouched.
- Popover closes on outside mousedown (window listener) and Escape; re-anchors to the
  caret rect on selectionchange.

## Session 2 update (2026-08-14)

All user-reported issues from session 1 are FIXED and verified via playtest probes:

- **Chips now display the attribute LABEL** ("Page Number") instead of `{{pageNumber}}`.
  The chip stores `data-rt-raw`; `undecorateTokens` restores the RAW token (labels
  never reach the stored text). `textBeforeCaret`/`rangeAtOffset` count chip text
  nodes as their raw length so blur-offset restore stays exact. "Show field keys"
  view in the designer still shows RAW tokens (that view's purpose is keys).
- **Caret-vs-bubble margins equalized**: chips use `margin: 0 2px 0 3px` — the caret
  (~1px) is drawn inside the left gap, so the left margin gets +1px for identical
  visual clearance (measured: 2px each side).
- **Selection highlight fix (big one)**: Chrome fires `selectionchange` on the
  DOCUMENT, not the window. The handler was attached to `window`, so it NEVER ran —
  highlights stuck, caret normalization never fired, chips never re-decorated on
  caret moves. Now attached to `document`. Verified: click chip → highlight on;
  click text → highlight clears; caret visible next to chips.
- **Toolbar "Insert attribute…"** verified inserting at the caret (through the
  Document submenu) → chip forms, caret lands outside the bubble.
- Autocomplete-created chips: caret ends OUTSIDE the chip (split-at-caret).

Files changed since last commit: `RichTextEditor.tsx` (document listener, label
style, raw-aware rangeAtOffset), `reportTokens.ts` (TokenChipStyle.label,
data-rt-raw, raw-aware textNodeSource/undecorateTokens, asymmetric margin),
`ReportBlockView.tsx` (pill-styled TokenPreview, raw keys).

Status: lint clean, report e2e 16/17 (only pre-existing
"Elements (of this category)" failure). Probes deleted before commit.
