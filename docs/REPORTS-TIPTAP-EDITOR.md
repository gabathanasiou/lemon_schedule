# Reports Text Block → TipTap Editor (implementation guide)

Branch: `reports/tiptap-editor` (off current `reports/token-editor` HEAD).
Status: PLAN — for another agent to implement. Read `plans/archive/TOKEN-EDITOR-WIP.md` first for
context on the hand-rolled implementation being replaced.

## Goal

Replace the hand-rolled contentEditable chip/autocomplete implementation (currently
`RichTextEditor.tsx` + `src/lib/reportTokens.ts`) with **TipTap (ProseMirror)** so that:

- `@field`-style **mention chips** (atoms) are engine-native: non-editable, clickable,
  ⌫ deletes the whole chip, arrows skip it, caret always visible next to it.
- The `@` **autocomplete dropdown keeps the current UX** (caret-anchored, group colors,
  ↑/↓/⏎/⎋) — implemented via TipTap's `suggestion` plugin reusing the existing popup.
- **Storage is untouched**: `block.text` stays sanitized HTML containing plain
  `{{field}}` tokens. Saved projects, print, preview, canvas, `showUnresolved` tags and
  `TokenPreview` must keep working byte-compatibly.

`{{` is **NOT** a trigger anymore — only `@` (user decision).

## Constraints / coordination

- **Do NOT touch the other agent's parallel WIP**: uncommitted files
  `src/components/ElementManager.tsx`, `src/components/FloatingChrome.tsx`,
  `src/components/elements/MergeRowsModal.tsx`, `src/lib/rowBuffer.ts`,
  `e2e/report-chrome.spec.ts`, deleted `e2e/debug-chrome.spec.ts`, and their edits to
  `index.css` / `ReportDesignerCanvas.tsx` / `reportBlocks.ts` / `reportData.ts` /
  `types.ts` / `package.json` — stage ONLY your own files in your commit.
- AGENTS.md rules apply: `npm run lint` after every change; small focused commits;
  new deps must be imported by ≥1 source file; reuse shared modules
  (`searchReportFields`, `fieldChipColor`, `tokenChipCss`, `tokenTagCss`,
  `resolveReportTokensHtml`, `TokenPreview` all stay).
- The superseded hand-rolled implementation notes are archived at `plans/archive/TOKEN-EDITOR-WIP.md`.

## Dependencies (TipTap v3 — React 19 compatible)

```
npm i @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-mention \
      @tiptap/suggestion @tiptap/extension-placeholder \
      @tiptap/extension-color @tiptap/extension-text-style
```

- `starter-kit` gives paragraphs/headings/bold/italic/underline/strike (the toolbar only
  needs bold/italic/underline/strike + color).
- `color` + `text-style` power the existing "foreColor" toolbar command.
- `suggestion` + `extension-mention` power the `@` dropdown + atom node base.

## Storage round-trip contract (the critical part)

`block.text` MUST remain: sanitized HTML where a token is the literal text `{{field}}`
(nothing else). Example:
`Page {{pageNumber}} of {{pageCount}}` or `{{title}} — One-Liner <b>bold</b>`.

- **Save**: `editor.getHTML()` → post-process → `sanitizeRichText(...)` → `onChange(...)`.
  The Token node's `renderHTML` should emit plain `{{field}}` text. If ProseMirror
  rejects a bare-string `renderHTML` for the atom, use
  `renderHTML: () => ['span', { 'data-type': 'token' }, '{{' + field + '}}']` and then
  regex-strip on save:
  `<span data-type="token"[^>]*>\{\{([^{}]+)\}\}</span>` → `{{$1}}`.
  Verify BOTH paths during implementation; the stripped output is the contract.
- **Load**: before `useEditor` init, pre-process the incoming HTML string with
  `/\{\{([^{}]+)\}\}/g` → `<span data-type="token" data-field="$1">{{$1}}</span>`
  (caveat: this regex could match inside attribute values in exotic pasted HTML — note
  it, don't over-engineer; the sanitizer runs on save anyway). The Token extension's
  `parseHTML` matches `span[data-type="token"]` and reads `data-field`.
  Then `useEditor({ content: processedHtml })`.
- **Idempotency**: save→load→save must be a no-op on the stored string. Write a unit
  check in the probe (round-trip byte comparison).

## New file: `src/lib/reportTokenExtension.ts`

The Token extension (extend `Mention` from `@tiptap/extension-mention`):

```ts
import { Mention } from '@tiptap/extension-mention';
import { ReactNodeViewRenderer } from '@tiptap/react';

export const Token = Mention.extend({
  name: 'token',
  addOptions() { /* fields: ReportFieldDef[] passed at configure time */ },
  addNodeView() { return ReactNodeViewRenderer(TokenChipView); },
  renderHTML({ node }) { return '{{' + node.attrs.field + '}}'; /* or span variant + save-strip */ },
  parseHTML() { return [{ tag: 'span[data-type="token"]' }]; },
  addAttributes() {
    return {
      field: { default: null, parseHTML: el => el.getAttribute('data-field'), renderHTML: attrs => ({ 'data-field': attrs.field }) },
      label: { default: null, parseHTML: el => el.getAttribute('data-label'), renderHTML: attrs => ({ 'data-label': attrs.label }) },
    };
  },
});
```

- `Mention` already provides: `inline`, `atom`, `selectable`, `draggable: false`,
  `contentEditable: false` semantics, `deleteTriggerText` behavior, suggestion wiring —
  confirm the defaults by reading the package source (`node_modules/@tiptap/extension-mention`).
- In v3, the suggestion config goes through `configure({ suggestion: {...} })`; the
  suggestion `char` should be `'@'`. Do NOT enable `allowSpaces`; keep default
  `allowedPrefixes` (space) so `@` mid-word does not trigger.
- `TokenChipView` (a React component in the same file or `src/components/reports/`):
  renders `<span class="rt-token" data-type="token">` styled with the shared look —
  label = `fields.find(f => f.key === field)?.label ?? raw`, background
  `fieldChipColor(def.group).text`, white text, `border-radius: 2px; padding: 4px`
  (reuse the values from `tokenChipCss`; the editor chips now use `padding: 4px` per
  user request — update `tokenChipCss` default if the canvas tags should match, but the
  canvas tags are background-only and stay as-is). Chip text must NOT re-trigger the
  suggestion (it's an atom — fine).
- Click behavior: atoms are selectable; ProseMirror draws the selection around them —
  no custom `syncChipSelection` needed. Backspace/Delete on a selected atom removes it
  natively. No extra code.

## New file: `src/components/reports/TokenSuggestionPopup.tsx`

Adapts the existing `TokenAutocomplete.tsx` to the `@tiptap/suggestion` render contract:

```ts
export const TokenSuggestion: SuggestionProps<ReportFieldDef, any>['render'] = () => {
  let popup: { el: HTMLElement; props: SuggestionProps; react: Root | null } | null = null;
  return {
    onStart(props) { /* create a fixed-position holder el; portal <TokenAutocomplete/>-like popup; position from props.clientRect() */ },
    onUpdate(props) { /* update items + highlight; reposition via clientRect() */ },
    onKeyDown(props) { /* ↑/↓/⏎/⎋ — the plugin supplies props.event; return true when handled */ },
    onExit(props) { /* unmount popup */ },
  };
};
```

- Reuse the existing popup visuals (dark surface `bg-zinc-950/95 backdrop-blur-md
  border border-zinc-800 rounded-lg`, group-color dot, `fieldChipColor` rows, highlight
  row). You may copy the row markup from `TokenAutocomplete.tsx` into the new renderer
  and delete `TokenAutocomplete.tsx` (only `RichTextEditor` imported it).
- Position with `props.clientRect()` (a function returning the caret rect) — no manual
  anchoring needed; flip above/below like the current popup.
- `props.items` are the filtered `ReportFieldDef[]` (the suggestion `items` callback
  runs `searchReportFields(fieldsRef.current, query)`); `props.command({ id: field })`
  inserts the token.
- Filtering is done by the plugin between `onStart`/`onUpdate` — keep `items` in sync.

## Rewrite: `src/components/reports/RichTextEditor.tsx`

Public surface must stay IDENTICAL (blockControls depends on it):

```ts
export interface RichTextEditorHandle {
  exec: (command: string, value?: string) => void;   // facade over TipTap commands
  focus: () => void;
  insertToken: (field: string) => void;              // inserts a Token NODE at the caret
}
interface RichTextEditorProps {
  value: string; onChange: (html: string) => void;
  placeholder?: string; disabled?: boolean; className?: string;
  fields?: ReportFieldDef[];                         // scope-filtered attributes
}
```

Implementation sketch:

- `const editor = useEditor({ extensions: [StarterKit, Placeholder.configure({ placeholder }), TextStyle, Color, Token.configure({ fields, suggestion: { char: '@', items: ... , render: TokenSuggestion })], content: preprocessTokenHtml(value), onUpdate: ({ editor }) => onChange(sanitizeRichText(stripTokenWrappers(editor.getHTML()))), editable: !disabled })`.
- External value sync: `useEffect` — when `value` changes and `!editor.isFocused` and
  `editor.getHTML()` (stripped) !== value → `editor.commands.setContent(preprocess(value), { emitUpdate: false })`.
- Render `<EditorContent editor={editor} className={className} />` wrapped in the same
  sizing div (`w-96 h-28`, inherited font family/size from block style — that wrapper
  lives in `blockControls.tsx` and is unchanged).
- `exec(command, value)` facade:
  - bold → `editor.chain().focus().toggleBold().run()`
  - italic → `toggleItalic` · underline → `toggleUnderline` · strikeThrough → `toggleStrike`
  - foreColor → `editor.chain().focus().setColor(value).run()`
- `insertToken(field)` → `editor.chain().focus().insertContent({ type: 'token', attrs: { field } }).run()`.
- `focus()` → `editor.commands.focus()`.
- `disabled` changes → `editor.setEditable(!disabled)` in an effect.

**Delete the entire old implementation**: caret hacks, `@`-consumption, decoration,
`ensureCaretVisible`, `normalizeCaretOutOfChip`, `syncChipSelection`, `edgeTextNodes`,
`textBeforeCaret`, `matchOpenToken`, `insertTokenAtCaret`, the selectionchange/mousedown
listeners — all gone. The engine handles caret/selection/atoms.

## `blockControls.tsx` / `RichTextToolbar`

Should require NO changes (the `exec`/`insertToken` facade preserves the contract). If
anything breaks (e.g. `exec` needs the editor mounted before the toolbar exists), guard
with `editorRef.current?.exec(...)` as today. Verify: Bold on a selected chip must
bold the token text (atom selection + toggleBold works — TipTap wraps the atom in a
mark? If it refuses to style atoms, fall back: `insertContent`-style wrap — verify and
note the result).

## Other edits

- `src/components/HelpModal.tsx` — Reports Designer section: remove the `{{` row, keep
  the `@` row, keep tag-click/colors rows.
- `src/index.css` — keep `.richtext-editor` container rules only if still referenced;
  `.rt-token-selected` is obsolete (remove if it survives your diff — check for
  conflicts with the other agent's edits to this file first; if conflicted, leave it).
- Delete: `src/lib/reportTokens.ts`, `src/components/reports/TokenAutocomplete.tsx`,
  `e2e/probe-cursor.spec.ts`, `e2e/probe-nav.spec.ts` (debug probes committed earlier).
- The hand-rolled implementation notes are archived (`plans/archive/TOKEN-EDITOR-WIP.md`).

## Gotchas learned from the hand-rolled session (do not reintroduce)

- Chrome does not dispatch `selectionchange` to `window` listeners — irrelevant here,
  but don't add custom selection listeners at all.
- Never mutate the editor DOM outside ProseMirror transactions.
- The sanitizer (`src/lib/richText.ts`) whitelist allows `b,i,u,s,span,div,p,br` and
  style props `font-family/font-size/font-weight/font-style/text-decoration/text-align/color` —
  TipTap's output uses `strong`/`em`/`u`/`s` and span styles; `sanitizeRichText` already
  normalizes `strong→b`, `em→i`. Keep running it on save.
- `getHTML()` may emit `<p></p>` wrappers/empty paragraphs — that's fine for storage
  (the old editor also produced div/br), but assert the print/preview suites still pass.
- Placeholder: `@tiptap/extension-placeholder` renders via `.is-empty` CSS — give it
  the same visual as before (`color:#71717a`).
- React 19 + TipTap v3: pass `immediatelyRender: false` to `useEditor` to silence SSR
  warnings (Vite client-only — harmless either way).

## Verification checklist (run all before committing)

1. `npm run lint`.
2. New probe `e2e/probe-tiptap.spec.ts` (delete before final commit or keep as a
   deliberately-passing smoke? — follow the pattern of the repo: probes are deleted;
   keep one REAL assertion spec instead if a suite exists for the text block):
   - `@` → popup opens at caret with all scope fields; type `pag` → filtered rows;
     ↑/↓ moves highlight; ⏎ inserts chip; chip shows label + group color.
   - Click chip → selected (native); ⌫ deletes whole chip; arrows skip chips; caret
     visible before/after chips; Home lands at the true start.
   - Bold on a selected chip applies to the token; blur/refocus keeps chips intact.
   - Type `{{pageNumber}}` manually + space → converts to a chip (input rule on the
     Token extension — implement with `addInputRules` if desired; if skipped, document
     that manual `{{}}` typing stays plain text).
   - **Round-trip**: read `block.text` after edits, reload the designer, assert the
     canvas renders the same tokens; assert stored HTML has plain `{{field}}` (no
     `data-type` spans).
3. Full report suites: `report-editor-polish`, `report-designer-move` (2 pre-existing
   failures unrelated: "Elements (of this category)" + cast-attributes — confirm they
   still fail identically on the base branch), `report-smart-scoping`.
4. Print smoke: header/footer with `{{pageNumber}}`/`{{pageCount}}` renders in preview.

## Git workflow

- `git checkout -b reports/tiptap-editor` from current HEAD.
- Stage ONLY your files (see Constraints). One commit per logical unit:
  1. deps + Token extension + suggestion renderer
  2. RichTextEditor rewrite + deletions
  3. HelpModal/doc updates
- Commit messages: `reports: ...` imperative style.

## Rollback

The previous implementation is on `reports/token-editor` (commits `ebbef57`, `fde9606`).
If the migration proves worse, revert the branch and keep the hand-rolled editor —
nothing in the storage format or other modules changes, so a revert is safe.
