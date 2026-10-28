# Lemon Schedule — Design Language Booklet

Status: **read this before building or changing ANY UI** in lemon_schedule. This is the canonical
design language: principles, exact class recipes, primitive choice, and anti-patterns.
Scope: app chrome (modals, menus, dialogs, pickers, toolbars, feedback, empty/loading states)
and the device model (desktop + iPadOS). NOT covered: print/paper subsystem (AGENTS.md §Print),
Glide canvas internals, reports-designer canvas (`docs/REPORTS-DESIGNER.md`).

---

## Keeping this doc current (update it in the SAME commit as the code)

- **ui-kit bump** (`package.json` → `@gabriel/ui-kit#v0.1.x`, see `UI-KIT.md`): re-verify §Recipes
  class strings and the §Primitive matrix against `node_modules/@gabriel/ui-kit` and fix this doc.
- **New primitive / feedback pattern**: register it in the primitive matrix or feedback taxonomy in
  the same change that adds it.
- **Single source of truth**: edit this booklet when shared patterns change — never fork the strings
  into a new file. Review the diff for design-language drift against this doc.

## Mental model

1. **Two-layer surface system**: light in-app pages (`zinc-50` bg, white cards) hold the content;
   dark chrome (zinc-900/950 surfaces, `bg-black/20` overlays) holds every overlay — modals, menus,
   dialogs, popovers. The two never mix inside one surface.
2. **All interaction primitives come from `@gabriel/ui-kit`** (in-app 1-line re-export shims in
   `src/components/`). Writing a second copy of a primitive is forbidden — extend the kit instead.
3. **The exact class strings below ARE the visual language** — a menu that doesn't use
   `bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg` is wrong by definition.
   Extract shared strings into module-level constants at the second use (like
   `LinkManagerModal.tsx:26-33`, kit `EditorChrome` `TB_*`).
4. **One design language across desktop and iPadOS.** Touch/pen are first-class: hover styles are
   un-gated (iOS tap-to-hover), paddings bump via `IS_COARSE`, tap feedback is `:active` (never JS pulses).

## Principles applied (NN/g heuristics → how this app does it)

| Heuristic | App rule | Proof |
|---|---|---|
| Visibility of system status | Save/offline state is always visible: `SaveIndicator` icons + `StorageStatus` folder pill; every consequential action updates one of them | `SaveIndicator.tsx`, `StorageStatus.tsx` |
| User control & freedom | Undo/redo history for everything (`state.past/future`); every modal closes via Esc/outside-click; destructive flows prefer reversible (Boneyard) over delete | store barrel; `Modal.tsx:160-170` |
| Consistency & standards | One primitive per job, one class string per surface type — reuse, never re-create | this doc, §Primitive matrix |
| Error prevention | Confirmations only for irreversible/expensive actions; confirm copy names the consequence — never "Are you sure?" | §Confirmations |
| Recognition over recall | Entity names render in cells; edit-mode hover affordance (`index.css:117-125`); EntityDropdown typeahead; keyboard shortcuts documented in `HelpModal.tsx` | `index.css:117-125` |
| Flexibility & efficiency | Shortcuts (HelpModal), long-press context menu on touch, Shift+click pop-out tabs | `AppHeader.tsx`, `LongPressMenuProvider` |
| Aesthetic & minimalist | Base `text-[12px]` (`index.css:77`), dense rows, no decorative fluff, no brand colors | `index.css:75-79` |
| Recognize/diagnose/recover errors | Severity ladder in §Feedback: inline text → banner → modal | §Feedback |
| Help & documentation | HelpModal for shortcuts; `text-[10px]` micro-copy under fields explains domain terms | `DayTypeModals.tsx:61` |

## The two-layer surface model

| Layer | Palette | Where |
|---|---|---|
| Light page (token scope) | `ThemeScope mode="light" surface="neutral"`: `bg-[var(--ui-card-band)]` body; cards `bg-[var(--ui-panel-bg)] border-[color:var(--ui-border)]` (light token values match zinc-50 / white / zinc-200) | Schedule, Day Manager, managers, Calendar, Rules, Breakdown/Glide/Scene Sheet, Script tab, project-manager shell; tokenised app-wide (roadmap 310 — fixed-palette exceptions in §Theming) |
| Dark chrome | header `bg-[var(--ui-accent-header-bg)]`; kit Menu/Modal/input tokens | App header, pop-out toolbar, Modal, DropdownMenu, Dialog, print dialogs, ElementPicker |
| Drive chrome | `ProjectChromeScope` publishes `accent="blue"`: header `--ui-accent-950` (#172554), tab pill `--ui-tab-pill-accent`, action chips `--ui-accent-950/900` | ONE identity source `useProjectTheme()` + `projectAccentNameOf()`; `src/components/ProjectChromeScope.tsx` |
| Shared chrome | same scope with `accent="emerald"`: header #022c22, emerald tab/action roles | same ONE source; a project is never both (shared > drive) |

- `PROJECT_CHROME` keeps ONLY `barHex` (the browser/status-bar `meta[theme-color]`
  twin). In-app chrome never hand-writes `bg-blue-950` / `bg-emerald-950` / zinc
  chrome strings — wrap the surface in `ProjectChromeScope` and use the
  `--ui-accent-*` / `--ui-tab-*` roles (roadmap 311).
- Modals/menus are dark even when they sit on light pages.
- **Section containers inside dark modals must step UP a luminance level** — never
  same-as-body backgrounds (black-on-black): on the `--ui-modal-bg` body, grouped
  sections (day-type cards, violation boxes, picker panels, rule lists) use the raised
  `--ui-card-bg` / `--ui-input-bg` fills with `--ui-border` hairlines. Contents may sit
  directly on the body only when they are single rows (labels, help text) — anything
  boxed must be visibly lighter.
- **Exception**: kit `ContextMenu` defaults to **light theme** (its `theme` prop, kit v0.1.81)
  because it anchors on light surfaces; pass `theme="dark"` when it opens over dark chrome
  (the ribbon designer cell menu). DropdownMenu (dark) and Dialog (dark) set their own themes.
- **The status bar is chrome too** (roadmap 265 + 271, iOS 26+): the app header is
  `sticky top-0 z-20` so Safari's tint sampling (`LocalFrameView::fixedContainerEdges`:
  fixed/sticky, ≥90% wide, >10px deep, own `background-color`) picks up its fill — the
  channel that works on iPhone. iPadOS does not honour that sampling for its top chrome;
  it takes the PAGE background instead, so `useStatusBarTheme()` also paints the root
  (`html`/`body`) with the header's own painted colour (`getComputedStyle` — exact by
  construction: Tailwind v4 tokens are oklch, so `PROJECT_CHROME[...].barHex` is only
  the hex twin for `meta[name="theme-color"]` and the no-header fallback `#09090b`, black
  like the PM backdrop). Phones (267) keep the `#f4f4f5` canvas — the root sync is
  skipped there. MUST NOT add the deprecated `apple-mobile-web-app-status-bar-style` or
  `black-translucent`. `viewport-fit=cover` is **phone-any-orientation-only** (roadmap
  267): the viewport meta is flipped at boot in `src/main.tsx` when `PHONE_DEVICE_QUERY`
  matches, and the phone shell + scroll reserves consume `env(safe-area-inset-*)`;
  iPad/desktop keep the plain meta and the two-layer model above.

### Boot screen (no project open) — minimal backdrop + app lockup (roadmap 82)

When no project is open (`App.tsx` renders `ProjectManagerBoot`), the ProjectManager
modal floats on a **deep zinc gradient** instead of flat gray. Minimal on purpose —
no color, no motifs:

- **Backdrop** (`ProjectManagerBoot.tsx`): **flat `bg-zinc-950`** for the whole
  screen + ONE soft lightening at the **bottom edge only** (a `h-56
  bg-gradient-to-t from-zinc-900/70 to-transparent` band, `pointer-events-none`).
  Minimal on purpose — no color, no centered glow, no motifs.
- **iPad-safe**: the wrapper is `fixed inset-0` (not `h-screen`) so the
  bottom-anchored band + lockup never fall below the fold when the Safari chrome
  shows, and the lockup sits at `bottom-[max(1rem,env(safe-area-inset-bottom))]
  right-[max(1.25rem,env(safe-area-inset-right))]` so it clears the iPad home
  indicator. Verified on emulated iPad Pro 11 (webkit, 834×1194): modal centred +
  on-screen, lockup visible and non-overlapping.
- **App lockup, bottom-right**: `LEMON SCHEDULE` (`text-[10px] font-semibold uppercase
  tracking-[0.2em] text-zinc-600`) + `v{APP_VERSION}` (`text-[10px] text-zinc-700`),
  `pointer-events-none select-none`. Version is build-time injected from `package.json`
  via Vite `define` (`__APP_VERSION__` → `src/lib/appVersion.ts`).
- **Dim exception**: the modal's item-59 one-dim is ZEROED on this screen (`.pm-boot
  .ui-modal-overlay { background: transparent }` in `index.css`, body class toggled by
  the component) so the backdrop reads crisp. Every other modal keeps the one-dim rule.
- Anti-pattern: this is a restrained backdrop, not a marketing splash — no brand
  colors, no decorative motifs, no animation.

### Day Manager page (Production → Days) — light page + live call-sheet pane

The page is a light single-column surface **without its own header**: the Day Manager's
controls portal into the Production **sub-tab toolbar** (`PageToolbar` rightContent, the
header-portal pattern) — a conflict pill, a **Settings** dropdown (Production Details ·
Call Times · Copy from day · Pop out on desktop). The shared **`DayPicker`** `< [DAY] >`
group (`production/day/DayPicker.tsx` — prev · day label · next as ONE bordered row that
IS the menu trigger; no chevron) portals into its OWN slot **immediately left of the view
switcher**, so it sits in the same spot in BOTH Days views (roadmap 177) — a thin vertical
divider separates the view-specific controls from that shared day-selector + switcher
cluster. Its menu is the kit **`SearchMenu`** (the Report-to picker pattern, roadmap 324
follow-up): every week is expanded on open (`browseExpanded` + `expandableGroups` — the
old flat list stays one glance) while each category can fold, the current day scrolls into
view, and the field filters by day number, ISO/short/long date, weekday or week; a query
flattens the matching weeks (headers stay visible). Each row shows the date and a red
conflict count. The Reports Designer's View → Report day submenu reuses
the same `DayPickerList` body **flat** (a submenu has no search field). The Day Details
card carries the day's main **Report to** field (primary face + location pin), writing the
same `daybreakMeta.reportToId` the Crew section's "all crew" control owns. The **view
switcher** is the toolbar's
rightmost element (see the merged-view switcher recipe below). At the top of the page
content sits a **centered mini-tab strip** (it scrolls with the cards — not sticky) — the
same kit `Button variant="tab"` + measured
`useSlidingPill`/`TAB_PILL` row as the header/mini tabs, with an icon + label per tab
(never counts): **Overview (default) · All · Locations · Scenes · Call Times · Crew**.
Overview is Details + Breaks & Notes + Events + Conflicts; All is the stacked page; the
others show their one card. The active tab is a place
(`#/production/days/manager/<tab>`; `overview` omitted, `all` explicit), so
back/forward, reload and pop-outs keep it. Switching tabs keeps the selected
day/tab and each Glide grid's cell/range selection (cached under its presence
scope and restored on remount). Below it sit the collapsible
section cards (`DaySectionCard`). **Day Details is a compact overview**, not
a field/value table: a title-case date + day number + day-type pill, one muted stats
line, three timing tiles (only the general call shows a pencil edit affordance), and a
location/weather strip: a master-location picker over the day's attached locations plus
the one-line forecast with refresh and the `Manual weather` toggle. The old toolbar
weather chip is gone — Day Details is the weather home. Breaks, stripboard notes and the
free-text announcements live in their own full-width **Breaks & Notes** card, so the
meta card stays short beside Events/Conflicts. Empty states are compact: **Conflicts is
skipped entirely** when there are no violations; an empty **Events** card is a single
header row with the kit `Add event…` trailing action. Events reuses the Calendar's
per-element `EventCardView` at `size="md"` — click a card to open that element's event
editor; whole-category/status surfaces open the day editor. An empty **Locations** card
is one dashed CTA row (`No locations on this day.` + the kit `Add location` action), not
an instruction line plus an empty grid; with rows, the Glide board + footer add action
are unchanged. All overlays (Copy-from-day, events,
pickers) are dark per the two-layer rule.

**Theming (roadmap 310)**: every app surface reads the `--ui-*` ladder. Light pages
(`ThemeScope mode="light" surface="neutral"`) are the Schedule, Day Manager + manager
pages, Calendar, Rules, Breakdown (Sheet/Glide/Scene Sheet/Element Manager), the Script tab
and the project-manager shell; dark pages pin `mode="dark"` (Design → Ribbon Designer/Colors/
Reports Designer, Reports → DOODs/Element Breakdown); dark modals inherit the kit Modal.
Modal bodies, cards, tables, chip triggers (`DD_TOKEN_TRIGGER_CLASS`), pickers and shared
rows are tokenised across the Day, manager, Calendar, Rules/Colors, Reports/print, import,
sharing/account/help/trash, script and Schedule-dialog families. **Fixed palettes stay
fixed on purpose**: print paper + previews, ribbon/strip/DOOD/event cell colours, drag
ghosts and floating hints, the script paper themes, the boot backdrop, and the shared
popover primitives that pick a palette from their own dark/light prop instead of the
ambient scope (`DropdownPanel`, `SelectDropdown`, `AutocompleteDropdown`, `HoverTooltip`/
`DelegatedTooltip`, `FieldBox`, `ToolbarDivider`, `TimeField`) — those move when they are
promoted to the kit (56) and every kit primitive takes the ambient theme (302).
`RibbonEditor.tsx` / `CastTab.tsx` are unmounted legacy files.
**Dev harness (310 phase 3)**: in a dev build or agent mode, append
`?modalTheme=light` (or `dark`) to the app URL — every app `Modal` opens on that ladder
(`src/components/Modal.tsx` `modalThemeHarness`); an explicit `theme` prop still wins.
Use it for the light/dark × zinc/blue/emerald pass. Kit components with an explicit
`theme` prop (Button, SearchMenu, Seg) keep their own palette until 302 makes them ambient.
The app `Modal` shim pins `theme="dark"` by default (302), so a light page scope never
flips an overlay — modals stay dark until light modals land.
 The **Call Sheet** surface is its own
full-screen DARK editor (next paragraph); while it is open the host darkens the
surrounding Production sub-tab bar (`PageToolbar theme="dark"`, driven by the Days page's
`onChromeModeChange`) so the light tabs never float over the dark editor — the switcher
follows the theme. The **Call Sheet** card is the FIRST section (top of the page — the
deliverable comes first). Its **Edit** switches to a full-surface dark mode (roadmap
10/D17): the editor's controls (**Settings** dropdown — a **Design** submenu, the
call-sheet designs with the active one checked, and **Reset to template** — then Times ·
Preview/Edit · Print, all icon + label) portal into the SAME dark toolbar (the day
selector reuses the slot left of the switcher) over a **single-page WYSIWYG canvas**
(`CallSheetCanvas`) — the whole design renders on one white page filled with THAT day's
real data (scenes/crew/locations read-only), and the `callSheetEdit` zone slot is the
REPORTS DESIGNER in **zone mode** (roadmap 212): the same docked rail (palette ↔ block
inspector, collapse + drag-resize), block/column/cell chrome, drop zones, context menus,
keyboard and commit-on-blur, scoped to the day's zone content. Fields/Values is
designer-only — the call sheet stays Values. A design without a `callSheetEdit` zone
renders the same page display-only, with no palette.
**Pop-out day windows** (no shared toolbar) keep the local header with the Call
Sheet/Days buttons.

## Canonical class recipes (the exact strings)

### Dark surfaces & menus
| Element | Classes | Source |
|---|---|---|
| Dark panel (menus, popovers, pickers) | `bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl` | `rules/ElementPicker.tsx:56`; the print-dialog pickers render through the kit `DropdownMenu` (item 60 — `PrintDialog.tsx`, `print/ElementBreakdownDialog.tsx`, `print/DoodDialog.tsx`, `reports/ReportPrintDialog.tsx`) |
| Modal content | `bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden flex flex-col` | `Modal.tsx:173` |
| Modal header / footer | `bg-zinc-950 border-b/t border-zinc-800` | `Modal.tsx:177,229` |
| Overlay | `fixed inset-0 z-[9999] bg-black/20` | `Modal.tsx:163` |
| Scrollbar | `scrollbar-custom` (6px, zinc-500/40 thumb) | `index.css:81-97` |

### Buttons
| Role | Classes |
|---|---|
| Toolbar button (kit `Button`) | base `inline-flex items-center gap-1.5 rounded text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed`; `subtle` `px-2.5 py-1 text-zinc-600 hover:bg-zinc-200`; `primary` `px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-white` (Drive: `bg-blue-950 hover:bg-blue-900`; shared: `bg-emerald-950 hover:bg-emerald-900`); `danger-ghost` `px-2.5 py-1 text-rose-600 hover:bg-rose-50`; dark theme mirrors with `hover:bg-zinc-800`/`hover:bg-zinc-700` — `ui-kit/src/Button.tsx` |
| Ghost (Cancel, Close) | `px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors` (`DayTypeModals.tsx:29`) |
| Solid (primary action) | `px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 disabled:opacity-40 transition-colors` (`DayTypeModals.tsx:30`) |
| Labeled icon action | `flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-300 border border-zinc-700 rounded-md hover:bg-zinc-800 hover:text-white` (`LinkManagerModal.tsx:33` — icon-only buttons need text labels) |
| Chip button (dark-modal dropdown triggers) | `DD_CHIP_TRIGGER_CLASS` (`src/lib/dropdown.ts`): `flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-900` — the cast-dropdown/chip look. Text size NOT included (add `text-xs`), layout extras (`relative` for an absolute value overlay, `justify-between`, min-widths, `w-full px-3 py-2` for full-width) append on top. Single source for the EntityDropdown `variant="chip"` trigger AND every value-displaying menu trigger styled like it (day-status + event-type pickers, `CategoryDropdown`, rule-type picker, print-dialog ribbon-layout/page-size/category pickers) — never hand-write the strings |
| Icon-only | `p-1.5 rounded-md transition-colors shrink-0 text-zinc-600 hover:text-red-400 hover:bg-zinc-800` (`LinkManagerModal.tsx:29-30`) |
| Toolbar micro (dark) | desktop `h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700`; touch `h-10 px-3.5 text-sm` (kit `TB_BTN`) |
| **Merged-view switcher** (roadmap 177) | kit `Seg variant="track"` (roadmap 216) — `theme` follows the toolbar (`dark` while the Call Sheet editor is open), icon-only segments (`l: ''` + `title`, explicit `ariaLabel` = "Manager view"/"Glide view"/"Call Sheet view"), group/`aria-label="<Sub> view"`. Semantic pairing: segment 1 = manager (`List`), segment 2 = alternate view (`Table2` Glide / `Sheet` Call Sheet). Rendered by the host (`ProductionTab.tsx`) as the RIGHTMOST toolbar element so it never moves when the view's own portaled controls change | `ProductionTab.tsx` |
| Danger ghost | `text-red-400 hover:bg-rose-950/40` (dark) / `text-rose-600 hover:bg-rose-50` (light) |

### Toolbar composition (EVERY page that shares controls)

One composition so controls never move when the view changes (roadmap 177). Applies to every
page/sub-tab toolbar (Schedule, Calendar, Breakdown header controls, Production, pop-out frames):

1. **Order by scope, shared controls in a fixed slot on the right.** View-specific controls come
   first; the RIGHTMOST slot is reserved for controls present in EVERY view of the surface (the
   merged-view switcher, roadmap 177). The day selector owns the slot immediately left of it.
   Repeated/shared controls must never reflow between views.
2. **Divide the groups.** Adjacent groups are separated by the shared `ToolbarDivider`
   (`src/components/ToolbarDivider.tsx`): `w-px h-5 shrink-0` — light `bg-zinc-200`, dark
   `bg-zinc-700` (`<ToolbarDivider dark />`). **Never hand-write the divider string.** Required
   between: the view-specific block ↔ the shared block, and between logical action groups
   (nav · view · filter · actions · print · help · version-select).
3. **Icon-only stays icon-only.** Icon-only controls keep `title` + `aria-label` (native tooltip;
   `aria-pressed` for toggles) — labels live in the tooltip, not the toolbar.
4. **Merged views collapse** (roadmap 177): two sub-tabs that are views of one surface become ONE
   sub-tab + the 2-segment switcher (recipe above), pinned rightmost; the view mode travels in the
   history place (roadmap 176), and the switcher follows the toolbar theme.

#### The chrome spacing scale — 16 outside, 8 inside (roadmap 264)

ONE scale for every chrome bar — the app header, every `PageToolbar` mini tab bar (each tab's
sub-tabs, popout frames, the dark Call Sheet variant) and the popout `VersionToolbar`. The
constants live in `src/lib/chromeSpacing.ts` (`CHROME_BAR_INSET` · `CHROME_CLUSTER_GAP` ·
`CHROME_ITEM_GAP` · `CHROME_TAB_GAP` + their `_PX` twins) — **bars read them, never re-type the
padding**:

- **Edge rail 16px** (`px-4`): a bar's outer inset. The first/last item's CONTENT edge sits on it.
- **Cluster gap 16px** (`gap-4`): between clusters inside a bar (e.g. the header's
  controls cluster ↔ the identity cluster, so the user avatar keeps the same air on its left as
  the rail gives it on the right — the exact asymmetry behind 264).
- **Item gap 8px** (`gap-2`): between items inside one cluster, and on both sides of a
  `ToolbarDivider`.
- **Tab gap 4px** (`gap-1`): tab strips are joined pills — their own tighter rhythm.
- **Edge-item rail compensation**: a control whose own padding would push its content inward hangs
  a negative margin equal to that padding — the File trigger's `-ml-3 px-3` puts the LABEL on the
  16px rail while the hover box keeps its size. A deliberately overlapping stack (the presence
  bubble cluster) opts out with `data-chrome-skip`.

**Guarded, not just documented:** every bar carries `data-chrome-bar="<name>"`; the rendered
geometry is checked by `auditChrome()` (`src/lib/chromeAudit.ts` — rails + 4/8/16 gaps; skips
layout-driven spacing and primitive internals like Seg groups) exposed on the debug bridge, and
the seeded-smoke spec asserts it clean on every tab. Adding a toolbar item that drifts fails that
test; call `window.__lemonSchedule.auditChrome()` to see violations interactively.
**MUST NOT**: hand-copy an inset or gap into the icon-dock math — `AppHeader.syncTabLayout` and
`PageToolbar.syncTabsDock` derive from the `_PX` values, so a spacing change moves them together.

### Control faces — choose one per control (roadmap 324)

Every chrome control DECIDES what it really is, then uses the shared face — never a one-off copy:

| The control is really… | Face | Recipe / source |
|---|---|---|
| a **value** (project name, page size) | morph into its field | kit `MorphActionField` (rename/create) or `MorphFieldShell`; Enter/✓ commits, Esc/outside cancels. AppHeader project title is the reference (`AppHeader.tsx`) |
| a **mode** (2+ states) | toggle | kit `Button` + icon swap + `collapse` + `reserveLabel` + `iconRoll` + `active`; `keepLabelOnActive` only when the ON label must stay readable; `activeTone="info|success|warning|danger"` for a strong ON colour (Schedule **Edit** → blue `Done`) |
| a **panel** (open/close) | icon-first toggle | kit `Button` outline + `PanelLeftOpen/Close` + `collapse` + `revealOnHover` + `iconRoll` — `BoneyardToggle.tsx` |
| a **menu** (View / Info / Filter) | icon-first trigger | `revealMenuTrigger()` (`src/components/revealMenuTrigger.tsx`) — returns the `Button` ELEMENT (never a wrapper component: Radix clones the trigger, so a wrapper swallows the click) |
| a **search / filter** | morph field | kit `MorphSearchField` + `triggerCollapse` + `triggerReveal` + `collapsedWidth="auto"`; the applied term keeps the label. Script search (`ScriptView`) and Glide filter (`GlideFilter.tsx`) are the references |
| already **icon-only** | keep icon-only | `title` + `aria-label`; no hover label (Print, Help, sheet nav, undo/redo) |

- **Both directions** are allowed: a labelled control may collapse to its icon and reveal the label on hover/open (View/Info/Filter/Print/Boneyard), and a value may morph into its field instead of swapping DOM (project name).
- **Navigation stays `go()`-driven**: tabs are `variant="tab|tab-header"` — never move routing into a Seg or a toggle.
- **`keepLabelOnActive` is opt-in** (kit 0.1.166): toggles collapse back to the icon by default; tabs always keep the selected label. Use it only for a mode whose ON label must stay readable.
- One shared face per pattern: every View menu, both Glide Info menus and the Calendar Filter use `revealMenuTrigger`; both Boneyard entry points use `BoneyardToggle`; the Script search and Glide filter share `MorphSearchField`. Never a per-call-site copy.

### Action icon canon (same action → same glyph)

Add to the rail; keep `npm run icons:audit` open when swapping any of these. NEVER use two glyphs for the same action.

| Action | Glyph | Notes |
|---|---|---|
| Add / New | `Plus` | never a literal `+` in a text label |
| Edit / Rename | `Pencil` | a mode toggle swaps to `Check` while ON |
| Duplicate (make another) | `CopyPlus` | kit item-manager + structure menus follow the same rule |
| Copy (clipboard) | `Copy` | clipboard-copy only; `Copy` and `CopyPlus` never mean the same thing |
| Delete | `Trash2` | remove/clear from a list stays `X` |
| Import | `FileUp` | Export = `Download` |
| Sort | `ArrowUpDown` | menu item or trigger |
| Filter (menu) | `ListFilter` | an applied filter term uses `Filter` inside `MorphSearchField` |
| Search | `Search` | |
| View options | `Eye` | every View menu |
| Print | `Printer` | |
| Calendar axis | `CalendarDays` | Day Manager's time-of-day = `CalendarClock` |
| Crew (group) | `Users` | one person = `UserRound` |
| Link | `Link2` | |
| Location | `MapPin` | |
| Restore / Reset | `RotateCcw` | Refresh = `RefreshCw` |
| Help | `CircleHelp` | |
| Warning | `TriangleAlert` | a rule violation stays `Flag` |

### Forms (dark modals)
| Element | Classes | Source |
|---|---|---|
| Field label | `text-[10px] font-semibold text-zinc-500 uppercase tracking-wider` | `DayTypeModals.tsx:36` |
| Text input | `w-full mt-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500` | `DayTypeModals.tsx:43` |
| Segmented toggle | kit `Seg variant="track"` (roadmap 216) — dark modals `theme="dark"` (raised `bg-zinc-800` pill on a `border-zinc-700`/`bg-zinc-950` track, the modal chip language), light toolbars `theme="light"` (dark active pill on a `border-zinc-200` track); `stretch` for full-width. The old `p-0.5` hand-rolled recipe is retired | `@gabriel/ui-kit` (`EditorChrome.tsx`); `CallTimesSettingsModal.tsx` |
| Help micro-copy | `text-[10px] text-zinc-600` | `DayTypeModals.tsx:61` |
| Intro copy | `text-xs text-zinc-400 leading-relaxed` | `LinkManagerModal.tsx:211` |
| Modal body | `p-6 space-y-5` (single-field forms may use `space-y-4`) | `LinkManagerModal.tsx:210`, `ScheduleModals.tsx:93` |
| **Time / duration field** | `TimeField` (`src/components/TimeField.tsx`) — raw call-time expression (absolute `7:30`/`730`/`7:30am` or relative `-1h`/`+30m`), live resolved value + optional reset; desktop `CellInput`, touch keypad (`:` `+` `-` `h` `m`). `DurationField` — the extracted `isTouchMode ? DurationKeypad : CellInput` duration recipe. Use for every call-time/duration input (Day Manager header + call times); Glide time cells use the shared `TimeKeypad` directly on touch (`kind: 'time'`). | `TimeField.tsx`, `TimeKeypad.tsx`, `DurationField.tsx` |
| **Date field** | `DateField` (`src/components/DateField.tsx`) — a composition of kit parts (promotion candidate under roadmap 56, same path as `DatePicker` → v0.1.34): **chrome** (default) = a chip trigger (the shared `DD_CHIP_TRIGGER_CLASS` + `ChevronDown`, label = `summaryLabel`) that spawns the kit `DropdownMenu` (dark, `w-64`) hosting the kit `DatePicker` — single mode collapses to the LATEST pick (the kit picker is a toggle, so re-clicking the picked day clears it); passing `className` (e.g. `w-full`) stretches the wrapper + trigger to fill the column (event editor's Date / Event Type row); **inline** = the calendar renders directly (rule editor Dates box — every date visible for multi-pick). **Open month = the relevant month** (roadmap 68): the picker seeds its visible month on mount from the field's picked date, else the production start, else real today (`initialViewFor` in `calendar/calendarUtils.ts`; kit `DatePicker` `initialView` prop, v0.1.63). Used by: EventModal, EventAdderModal (chrome; **inline + multi when element-locked** — the Element Manager add-event flow picks several dates at once), ProductionDatesModal (chrome), RuleEditorPanel (inline) | `DateField.tsx` |

### Tables (light managers)
| Element | Classes | Source |
|---|---|---|
| Manager table rows | grid `border-b` / `border-r border-zinc-200` (lines must stay readable under the hover tint), zebra `bg-white` / `bg-zinc-50/30`, **row hover `hover:bg-zinc-100`** (gray — no blue), `transition-colors` | `managerShell.tsx:452`, `ElementManager.tsx:602` |

### Item cards & rows (dark modals)

The grouped-list surface of the element events manager, extracted as the shared `ItemCard` +
`ItemRow` (`src/components/cards/`) — use these for any "one card per item, rows inside" list in a
dark modal (day-type cards, Rules sections; **the Trash modal's per-kind sections**,
`TrashModal.tsx`; RulesTab cast groups + day types are the light-theme
migration candidates — the components are dark-only today).

| Element | Classes | Source |
|---|---|---|
| Group card | container `rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden`; header row `flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 hover:bg-zinc-700/50 transition-colors` (wraps a `trailing` action below the title on narrow widths) — the toggle is a `flex-1 min-w-0 text-left cursor-pointer` **button** (chevron `w-3.5 h-3.5 text-zinc-500`, icon, title `text-xs font-semibold text-zinc-200 truncate`, count `text-[10px] text-zinc-500`) with right-aligned `trailing` actions (e.g. Add Rule) OUTSIDE it — never nest a button inside the toggle; body band `border-t border-zinc-700/60 bg-zinc-900/60 divide-y divide-zinc-700/60 p-1.5` — rows sit with divider lines (`bodyClass` overrides) | `cards/ItemCard.tsx` |
| Interactive row | `ITEM_ROW_CLASS` (`src/components/cards/ItemRow.tsx`): `group flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 hover:bg-zinc-800/60 transition-colors cursor-pointer rounded-md` — **row-wide click opens the item's editor**; title cell default `w-44 shrink-0 ... group-hover:text-zinc-100` (focusable button, pointer cursor; widen via `titleClass` — e.g. the day modal's `w-56` category label + element name); body wrapper default `flex-1 min-w-0` (shrinks, never wraps) — pass `bodyClass` = shared `ITEM_ROW_BODY_WRAP` (`flex-1 min-w-[13rem]`) to make the note area **stack onto its own full-width line under the title** on narrow rows (sizes unchanged at normal widths, trailing X flows beside the note); **body clicks bubble to the row** (interactive note text = I-beam `cursor-text` + `stopPropagation` itself; the input too); **trailing swallows its clicks** (the remove X never opens the editor). The **dark `RuleCard` renders as this row** (compact: description + conflicts + delete X; full: + icon box + type chip) inside the per-type rule cards and the day modal's Rules tab — the light RulesTab theme keeps its boxed card | `cards/ItemRow.tsx`, `rules/RuleCard.tsx` |
| Trash viewer | `TrashModal` — the File menu's Trash… on the kit Modal: **one `ItemCard` section per trash kind** (Scenes/Versions/Calendar Plans/Rules/Elements/Custom Categories/Color Rules/Crew/Ribbon Designs/Report Designs, kind icon + count, `data-trash-section`), rows = title + subtitle + Restore (`RotateCcw`, `data-trash-item`); footer = Empty (ghost danger `mr-auto`, DNWA confirm) + Close hero; "Trash is empty" state | `components/TrashModal.tsx` |

### Status colors
| Meaning | Classes |
|---|---|
| Danger text | `text-red-400` (dark) / `text-rose-600` (light); confirm button `bg-red-600` (dialog `danger:true`) |
| Success feedback | `text-[10px] text-emerald-400` (inline, after an action) — `LinkManagerModal.tsx:302` |
| Warning/selection pills | `bg-amber-100 text-amber-700 rounded-full` (light) — `ScheduleToolbar.tsx:105` |
| Violation | `Flag` icon `w-3.5 h-3.5 text-red-500`, pill `bg-red-100 text-red-600` |

### Icon sizing ladder
`w-3.5 h-3.5 shrink-0` = standard menu/row/button icon · `w-3 h-3` = micro (checkmarks, chevrons in
pickers, submenu chevrons) · `w-4 h-4` = modal header icons · `w-2.5 h-2.5` = StructureControls.
Touch (`IS_COARSE`) bumps modal icons to `w-4 h-4` (`Modal.tsx:13`).

### Global CSS invariants (`src/index.css`)
- **Every `<button>` is `cursor: pointer`** (a base-layer rule — Chrome 88+ defaulted buttons to `cursor: default`, which reads as dead). Utility overrides still win: `disabled:cursor-not-allowed`, `cursor-text` (note text), `cursor-default`. No button needs an explicit `cursor-pointer` class.
- **Hover styles are UNGATED** (`index.css @custom-variant hover` — no media query; kit `tokens.css`
  header): iOS Safari's native tap-to-hover — first tap applies `:hover` (sticky highlight/reveal),
  the click defers to the second tap — only engages when the tapped element has a matching `:hover`
  rule. `(hover: hover)` is false on iPadOS and `(any-hover: hover)` is false when no hovering
  pointer is attached — either gate kills the native behavior on touch. Every hover is still a
  Tailwind `hover:` variant or `.group:hover`/`.group:focus-within`, never a bare hand-written rule.
- `user-select: none` globally except inputs/contenteditable (`index.css:59-73`).
- `touch-action: manipulation` on `button, a, [role=button], [role=menuitem], [role=option]`
  (`index.css:65-67`).
- `.hover-reveal`: hidden until hover/tap (`opacity: 0`, un-gated), revealed by `.group:hover` +
  `.group:focus-within` (`index.css`) — on iOS the first tap on the row reveals it, the second tap
  activates; `:focus-within` keeps the revealed controls keyboard-reachable.
- Focus-visible: kit applies `outline: 2px solid var(--ui-accent-soft-text); outline-offset: 1px`
  (`node_modules/@gabriel/ui-kit/dist/ui-kit.css:210-213`).

## Primitive choice matrix

| Need | Use | Notes |
|---|---|---|
| Toolbar / action button | kit `Button` | Variants `subtle`/`primary`/`outline`/`danger-ghost`/`tab`/`tab-header`; **`outline`** = the quiet button that must read as a button at rest — same box and text as `subtle`, a 1px edge painted as an **inset shadow** (never a border, so the box never changes size) and `subtle`'s hover fill. Use it for secondary actions in empty states / side-by-side choices / file dialogs, and as the **resting face of a transforming control** (button → field: the morph must not shift a pixel). Never fake it with a border + padding tweak; `cloud` prop colors light primary + the tab palettes (`true` = Drive blue, `'emerald'` = shared — derive via `projectAccentOf(useProjectTheme())`, roadmap 248); `theme="dark"` for dark toolbars; `iconOnly` (v0.1.100, roadmap 216) renders the square icon-only shape — status pills stay bespoke |
| Icon-first tabs (dock) | kit `Button` + `TabFace` + `useSlidingPill` + `TAB_PILL` | Roadmap 258. `Button` `icon` + `collapse` (label rides a 0fr↔1fr grid column; reveals on hover/focus/active/open; **the label stays in the DOM while collapsed** — the accessible name is never sacrificed) + `iconWithLabel={false}` (the label REPLACES the icon — icon and label are NEVER combined; app header + mini tabs). `TabFace` is the shared face, directly usable inside `Seg` options later. `tab-header`/`tab` active fills are the row's measured pill (kit `useSlidingPill` — glides ~200ms, chases live reflows, honors reduced motion; `TAB_PILL[theme][tone]` supplies a `tab` row's fill), NOT a button background — **MUST NOT** re-add `bg-*` to a tab variant's active classes or the glide disappears. Dock only when the full labels don't fit (measure once expanded — AppHeader `syncTabLayout` / PageToolbar `syncTabsDock`). Icons reviewable via `npm run icons:audit` (`tools/icon-audit.cjs`). |
| Segmented control / in-place tabs | kit `Seg` | **Both variants animate** — the highlight glides between segments (measured `transform`/`width`, ~200ms, skipped under reduced motion). `variant="chrome"` (default) = joined cells with the blue sliding highlight (`bg-blue-900/50`), the Reports Designer's inspector controls; `variant="track"` (roadmap 216) = padded track with a raised pill — modal tab bars (`theme="dark"`, the Call Times look) and toolbar view switches (`theme="light"`, or the project-chrome accents `"blue"`/`"emerald"` — roadmap 248, `projectSegThemeOf(useProjectTheme())`); icon-only segments via `icon` + `ariaLabel`, real tab semantics via `tablist`. `dense` = 24px chrome / 26px track on fine pointers; `stretch` fills the container |
| Version picker (schedule/calendar/ribbon-design dropdown) | `ItemManagerDropdown` | Per-tab placement (item 66: Schedule tab toolbar right edge + Calendar tab outer PageToolbar — **no header pickers**); trigger = kit `Button` with a muted label span + `text-zinc-900`/`text-zinc-200` value span + muted chevron (ribbon-designer recipe); rename inline uses the kit's theme-aware input (light theme = light input) — the create flow must dispatch with the SAME id the menu handed to its inline rename (`makeBlankCalendarVersion(name, id)`) or the rename input never appears |
| Click-to-toggle anchored menu | `DropdownMenu`/`DropdownItem`/`DropdownSubmenu` | Radix; **one `.ui-item-highlighted` row** (pointer hover + arrows, latest wins; the CSS `:hover` fill feeds iOS tap-to-hover but is suppressed while a row is highlighted — kit `tokens.css`, keyed on the kit class not Radix's attr), arrows/typeahead/Esc + the document-level menu key-lock (mini-modal: menu keys stay captured even when focus sits on a canvas); `modal:false`; root content = the one positioning engine (`useDropdownPosition`: fixed below the trigger, width-matched, visual-viewport flip/clamp, `maxMenuHeight` ceiling); submenus keep the Radix popper side-placement; portals at `z-[200]` (bumped to 10001 inside modals, `index.css:29-31`). **Trigger-anchored open/close morph** (grow out of the trigger corner, shrink back on close — kit `overlayMorph.ts`, the modal FLIP language; §Modal anatomy). **`searchable`** adds the kit search box that filters the registered rows (the long category list in Script tagging, roadmap 136: `ScriptTagMenu` anchors a zero-size fixed trigger at the text selection, so the highlighted text stays selected while the menu is open) |
| Right-click / long-press menu | `ContextMenu` + `data-context-menu` targets | Fixed at (x,y), clamped to viewport, **light theme by default** (`theme` prop; the ribbon designer passes `"dark"`); press-point-anchored morph, closes on Esc. Shares the kit menu machinery (highlight/keys/lock) — `ContextMenuSub` = `DropdownSubmenu` |
| Entity/cast picker in a cell or form | `EntityDropdown` (a thin `PickerField` adapter) | Modes: `multi` (comma list, click toggles), `single` (search-then-select), `select` (legacy). `items` prop REQUIRED — no context fallback. **Inside modals use `variant="chip"`** (the shared chip trigger + panel; §EntityDropdown chip version below) — cells/forms keep the light default. Panel/keyboard/commit behaviour comes from `PickerField` — manual: `docs/PICKER-FIELD.md` |
| Catalogue search picker (record list) | kit `SearchMenu` + `LocationSearchMenu` adapter | **Single-select standalone, or `multiple` for a bulk ACTION** (draft + footer hero — `docs/PICKER-FIELD.md`; the Day Crew "Add roles…" proof). `inline` (manager sidebar) or `expandable` (button → textbox morph: `triggerLabel` primary button cross-fades into the field, collapses on select/Esc/outside; the panel opens immediately and tracks the width morph). Categories = `groups` (icon + count); **`browseExpanded`** = plain, non-interactive headers with every record open (short catalogues), `expandableGroups` + `groupExpandMode="single"` = accordion (long catalogues), and both flags together = chevrons with every group open on each open (the day picker: a long catalogue that still scans flat). **Category rows only expand/jump — never perform the action** in single mode (in `multiple` they are per-group select-all); a non-pressable category must look like a header (no hover/pointer/keyboard stop). Comma tags AND-match label/detail/category/`fields`; `emptyActions` only in the no-match state; `leadingActions`/`footerActions` are always-visible pinned create/manage rows (`hideLeadingOnEmpty` drops the leading row when the empty action already covers the same create; default Plus icon); `triggerIcon` = domain icon (MapPin for field pickers, **Plus for adders**). **Never a cell editor, async source or toolbar filter** (async lives on `PickerField.loadItems`). Full manual: `docs/SEARCH-MENU.md`. `LocationSearchMenu` is the location face: grouped by type, searches address/contact/phone, add-the-typed-name + clear **Used by**: Day Manager location/crew pickers, Key Positions → Assign, Element View header + Production Details timezone (flat `browseAll` list, current value anchored via `selectedId`), Script scene sidebar, Trash (`clipTriggerLabel` fits long names — `src/lib/searchMenuTrigger.ts`) |
| Location picker | `locationOptions(project)` + `EntityDropdown` / `LocationSearchMenu` | **ALWAYS the category version** — the emerald add-new row first, then the Locations DB grouped by **location type** (`searchFields: ['name','group']`, `sortItems: list => list` so headers never split). Standalone catalogue fields use `LocationSearchMenu` (SearchMenu expandable; committed value stays the location **id**); grid/cell editors pass the same options to `EntityDropdown` | `src/lib/locationOptions.ts`, `src/components/location/LocationSearchMenu.tsx` |
| Crew picker | `crewRoleGroup` / `departmentOrder` | **ALWAYS grouped by crew position/department** (catalog order, then custom departments) — never a flat role list; sort within a department only. The **"Add roles…"** bulk menu is a `SearchMenu multiple` (tick several, footer hero, one undo entry); the Day Manager crew grids use the shared grouped `PickerField` | `src/lib/crewCatalog.ts`, `src/lib/dayCrew.ts`, `src/components/production/day/CrewRosterEditor.tsx` |
| Async address/place search | `PickerField` with `loadItems` (`LocationPickerModal`) | Debounced geocoder results in the shared panel (`emptyTitle`/`emptyHint` before a query); picking re-centres the map and fills the structured address, unpicked text commits as the manual street override. The retired `AsyncResultsDropdown` must not come back — `docs/PICKER-FIELD.md` §Async |
| Inline cell text edit | `CellInput` | **Commits on blur only, never per keystroke**; Enter=commit, Esc=cancel |
| Numeric box (ribbon Pad V/H, Edge, Master Size, cell offset; designer/report panels; format-bar size) | kit `NumberInput` (v0.1.99; app shim `src/components/LiveNumberInput.tsx`) | Free-typed draft while focused (type digits one at a time, delete-to-empty); commit clamps live (preview updates), Enter/blur clamps + finalizes, Escape reverts to the committed value; ArrowUp/Down and the stacked chevron steppers step ±`step` (disabled at the bounds); mouse drag scrubs (Premiere/Resolve — up = increase, 2px/step; touch/pen keep scrolling). Never a clamped controlled input — clamping on change snaps the first keystroke. Default = the `.ui-number-box` token box (`theme="dark\|light\|blue"`); a `className` keeps the consumer's own input look |
| Confirm/prompt/alert | `useDialog().confirm/prompt/alert` | **Renders through the kit Modal (`flat` chrome — no header/footer bars, item 67)**: inherits the zoom/stack morph, the one-dim backdrop and the viewport clamp; Enter ALWAYS triggers the primary action (document-capture, even with focus on the X close button); Esc/outside = cancel |
| Confirm + remember-24h | `dialog.confirm({…, danger:true, suppressKey})` | For frequent-but-serious only |
| Popup above keyboard | `FloatingChrome` / `useDropdownPosition` | iOS visual-viewport aware |
| Full form surface | `Modal` + `ModalFooter` | §Modal anatomy |
| Full-page detail editor | SceneSheet pattern (light page, NOT a modal) | `SceneSheet.tsx` |
| Multi-select lists | `Checklist` / `RadioList` / `Checkbox` | kit, `data-theme` aware |
| Call-time / duration input | `TimeField` / `DurationField` | Shared expression parsing + touch keypad; never a raw time input |
| Grouped single/multi-select dropdown (locations/crew/categories) | `GroupedSelect` (`production/day/`) | Kit `DropdownMenu` + `DropdownItem group` — category headers, searchable by row/category, single/multi, light/dark. Never fork a second grouped panel |
| Grouped item list (dark modals) | `ItemCard` + `ItemRow` (`src/components/cards/`) | Collapsible group card + interactive row — the element events manager's day-type sections and its Rules section (first migrations). §Item cards below |
| Inline spreadsheet on a page card | `InlineGlideTable` (`src/components/InlineGlideTable.tsx`) | Compact Glide grid: auto-fit columns (no horizontal scroll), content height + `overflow: hidden` (no vertical scroll), read-only cells gray + `cursor: default`, editable rows hover-tinted, centered headers, one commit per edit/paste/fill/clear. Header right-click can expose caller menu items via `headerMenuItems(close)` (e.g. Day Manager Call Times → "Edit Call Time Stages…"); cell right-click keeps Copy/Paste/Clear/Cut. The local cell/range selection is cached under its presence scope (or data attr) and restored on remount, so a Day Manager tab switch doesn't drop it. Day Manager Call Times + Crew; reuse for manager pages |

Dropdown **light picker** classes live in `src/lib/dropdown.ts` (panel `bg-white border-zinc-200
rounded-lg shadow-lg`, `DD_PANEL_CLASS_LIB` `:21-24`; items `DD_ITEM_CLASS_LIB` `:16-17`; selected
`bg-blue-50 text-blue-700`, hover `bg-zinc-100 text-zinc-900`, active `bg-zinc-200`). Synthetic
"Add" row is emerald (`bg-emerald-50 text-emerald-700`, `DropdownPanel.tsx:55`), empty state
`px-2 py-1 text-xs text-zinc-400 text-center "No matches"` (`:71`), commit hint footer
`text-[10px] text-zinc-400 border-t border-zinc-100` (`:78`).

**Value pickers and selection (roadmap 322)** — ONE `PickerField` (kit) stores
every value; `EntityDropdown`, `AutocompleteDropdown`, `SelectDropdown` and
`GroupedSelect` are thin adapters (manual: `docs/PICKER-FIELD.md`). The
contract:

- **Checked ≠ highlighted.** A committed/ticked row keeps the selected wash; the
  pointer/arrow cursor is the neutral highlight. A hovered row is visual only —
  it never arms Enter.
- **Value fields commit on close** (blur / outside / Tab), one `onChange`, only
  when the value changed. Escape cancels the draft.
- **Menus that DO something** (bulk actions, e.g. "Add roles…") use
  `SearchMenu multiple` `mode: 'draft'`: a row toggles and the panel STAYS OPEN,
  the sticky footer hero commits the whole batch (one undo entry), Escape or a
  click-away drops the draft.
- **Trigger faces**: `inline` (cell), `chip` (form field), `wrap` (multi-line
  cell), `morph` (button → field). The closed display presets are `names`,
  `chips`, `count`; `formatDisplay`/`formatEditing`/`renderTrigger` cover the
  rest. Never hand-write a second trigger recipe.
- **Strict option lists** (INT/EXT, Day/Night) keep their full catalogue visible
  while typing and only move the highlight; Enter/Tab complete to the lit
  option.

**EntityDropdown chip version** (`variant="chip"` — modal rows: Link Manager, Color Rules rows,
`days-status` pattern, DayEventsModal attachment rows + inline rule editor cast pickers,
ProductionDatesModal-adjacent modals). Trigger = dark chip — the shared **`DD_CHIP_TRIGGER_CLASS`**
(§Buttons "Chip button"): `bg-zinc-950 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-900
px-2.5 py-1.5 flex items-center gap-1.5` (+ `relative` for the absolute value overlay) + chevron
(`w-3 h-3 text-zinc-500 absolute right-2`) + value/placeholder overlay; committed value stays raw,
the overlay resolves cast as Glide-style (`1. FISHERMAN`, `—` fallback) via the `items` prop.
Opt-in `wrapValue` makes a long resolved list wrap onto multiple lines — the chip grows and the
editor becomes a textarea (`DD_CHIP_WRAP_EDITOR_PAD` keeps its caret on the span's glyphs;
Link Manager linked rows). **Every entity dropdown rendered inside a dark modal uses `variant="chip"`** — the dark trigger +
dark panel are the modal theme (the light default is for light cells/forms only). **Any other
dropdown/menu trigger inside a dark modal can adopt the same look by using `DD_CHIP_TRIGGER_CLASS`**
(e.g. the day-status DropdownMenu trigger in DayEventsModal, `CategoryDropdown` — its trigger IS the
constant, so category pickers everywhere already match the cast chips).
Clicking the chip prepares the text: single selects all (retype replaces), multi sets the caret at
the end (typing appends a segment). **Escape inside any open dropdown dismisses only the dropdown,
never the enclosing modal** (`useEscapeCapture` in `src/lib/dropdown.ts` — a mount-registered
document-capture interceptor; Radix dialogs close on Escape otherwise).
Panel = dark surface: `bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl
z-[10001] p-1 min-w-[200px]`, items `DD_ITEM_BASE_DARK_LIB` — **`px-4 py-3 text-sm` on coarse
(`IS_COARSE`), `px-3 py-2 text-xs` on desktop** (roadmap 77: the dark panel rows + chip trigger
scale like the kit menu + light panel so iPad tap targets are as big as every other dropdown;
`DD_CHIP_TRIGGER_CLASS` padding bumps on coarse too). **Single-highlight rule (all EntityDropdown
panels, both themes)**: rows keep their un-gated Tailwind `hover:` fills (they feed iOS
tap-to-hover), but `highlightedIndex` is the ONE active row
(`bg-zinc-700 text-white` for dark, `bg-zinc-100 text-zinc-900` / checked `bg-blue-100 text-blue-700`
for light), which pointer hover (`onMouseEnter` → `onItemHover`) and the keyboard arrows both write
(latest wins; leaving the list clears a pointer-driven highlight via `onHoverLeave`). Checked rows =
distinct from the highlight: dark `bg-zinc-800/40 text-zinc-100` + trailing `Check` glyph
(`DropdownPanel.tsx`), light `bg-blue-50 text-blue-700`. **Only a KEYBOARD-driven highlight
scrolls the active row into view** — pointer hover never moves the list (item 187; `EntityDropdown`
gates its `scrollIntoView` on `hoverRef`).

**Committed values as per-value chips — considered, declined (retired roadmap 50).** A tag-input
variant would render pills only in the CLOSED trigger: the value IS the input (caret-at-end append,
Backspace, Enter/Tab commit, Glide callbacks), so the text-editing model stays underneath. The kit
has no generic Chip primitive (`TokenChipView` is tied to the contenteditable token editor), and
multi-value chip triggers wrap/overflow single-line modal rows. Revisit only when a requirement
needs per-item affordances (per-chip × to remove one attachment/linked value without retyping, or
category-coloured chips — items 45/46's calendar event chips are the precedent); then build it as a
new `variant="tags"` (default untouched) on an experimental branch, Link Manager multi rows first.

**Single-highlight rule (kit menus AND context menus — the kit `DropdownMenu`/`DropdownSubmenu`/
`ContextMenu` share the panel's highlight model, item 64)**: the one lit row is `.ui-item-highlighted`
(kit `tokens.css`) — written by pointer hover AND the keyboard arrows (latest wins; `onPointerLeave`
clears a pointer-driven highlight); the CSS `.ui-item:hover` fill feeds iOS tap-to-hover but is
suppressed while a row is highlighted (`.ui-menu:has(.ui-item.ui-item-highlighted) .ui-item:hover:not(.ui-item-highlighted)` —
keyed on the kit class, NOT Radix's `[data-highlighted]`, which stays on the last pointer-hovered
item when the keyboard moves the highlight away). Checked rows stay distinct (dark =
Check glyph; light = blue bg). **Only keyboard-driven highlights run `scrollIntoView`** — pointer
hover never moves the list (kit `pointerDriven` gate, v0.1.85). **Menu key-lock (mini-modal)**: while a menu is open, the MENU keys
(arrows/Enter/Space/typeahead letters) are captured at the document and routed to the surface even
when focus sits on a stripboard canvas or the page body; events inside the menu pass through;
every other key (Cmd+Z, Esc, Tab…) is untouched. A submenu trigger row: Enter/ArrowRight opens the
sub (the keyboard-opened sub pre-lights its first item), ArrowLeft closes it and returns the
highlight to the trigger row. The menu machinery (highlight context, keys/lock/wheel handlers) is
kit-internal (`ui-kit/src/DropdownMenu.tsx`) — stable handlers created once per hook instance; the
composed-ref cleanup removes the ATTACHED closure (a per-render reassignment leaked the document
lock, and a leaked lock from a remounted menu kept its last activeRef forever — eating menu keys
app-wide).

`EntityDropdown` as a cell editor: **separate commit from exit** — `onChange` updates the value,
`onExit` leaves edit mode; never call both in one handler (editor unmounts and can't reopen).

**Board IDs in element pickers (roadmaps 305/321)**: pass the element's number as
`boardId` on the `EntityItem` (cast: its id). The PANEL always renders "N. NAME";
the closed chip/labels follow the per-user **IDs: Cast only / All elements** pref
(default Cast only — toggle in the Scene Sheet toolbar). Never hand-roll the
prefix in a `renderItem`; a custom renderer that shows only the name hides the
number, and `docs/REPORTS-DESIGNER.md` holds the report/call-sheet conventions
(separate Board ID column, always numbered).

**Auto-create** (`onCreateItem`): every commit diffs the value's segments against `items`
(comma-list in multi/select, whole string in single) and calls `onCreateItem` for gaps — the
shared "type a new element and it appears" flow (`addNewElement`, cast → naming modal). Wired in
the Link Manager, Color Rules, event modals and the rule editor; stripboard/Glide/Sheet create in
their own commit flow and omit the prop.

**Spreadsheet overlay editors** (`autoGrow`, EntityDropdown + AutocompleteDropdown): the inline
editor grows with its content (`field-sizing: content`, `width: auto`, `w-max` wrapper) instead of
filling the cell, capped at Glide's 400px overlay max then scrolling to the caret — so long
comma-lists (cast, breakdown categories) stay visible while typing. Skips the transparent-input +
truncate-span overlay and the hover/focus gray fill (those belong to in-cell editing, e.g. the
Schedule stripboard, not popout editors).

## Modal anatomy & rules

Structure (all in `src/components/Modal.tsx`):
- **Theme (roadmap 302)**: the shell reads kit tokens, never Tailwind zinc. `theme` picks the mode
  (`light | dark`; default = ambient `ThemeScope`, else dark), `accent` (`zinc | blue | emerald`)
  is project identity, and `surface="accent"` opts into the accent ladder: `accent-950` header (THE
  app-header colour, white title), NEUTRAL body, `accent-100` wells/footer. Every normal app modal
  uses `surface="neutral"`: light/dark shell, **no accent inside** (selection/checks/Seg/date chips
  are neutral) — Drive/shared keep their blue/emerald colour in the chrome (header/tabs), not in the
  modal. Card and calendar headers use `accent-900` only on an accent surface; the calendar body +
  checklist/radio panels stay neutral; every outline stays neutral (`--ui-border` /
  `--ui-border-strong`). A nested accent-only `ThemeProvider`/`ThemeScope` is a manual Lego
  override. The app's `src/components/Modal.tsx` shim maps the open project
  (`projectModalThemeOf`); callers can override either prop. `color-scheme` follows the mode.
- **Header**: `flex items-center justify-between px-5 py-2.5 border-b border-[var(--ui-modal-header-border)] bg-[var(--ui-modal-header-bg)]`, `cursor-grab`, **draggable** by pointer-capture; icon (`text-[var(--ui-modal-icon)]`) + title `text-xs font-bold text-[var(--ui-modal-title)] truncate` + optional Reset (`text-[var(--ui-modal-muted)] bg-[var(--ui-modal-control-bg)]`) + close X (`text-[var(--ui-modal-muted)] hover:text-[var(--ui-modal-title)]`).
- **Body**: `overflow-y-auto flex-1 bg-[var(--ui-modal-body-bg)] text-[var(--ui-modal-body-text)]`; content carries `p-6 space-y-5`.
- **Footer** (`ModalFooter`): `flex items-center justify-end gap-3 px-5 py-2 border-t border-[var(--ui-modal-border)] bg-[var(--ui-modal-header-base)]` (the NEUTRAL band, so an accent header stays the only tinted strip).
- **Footer buttons — one hero, rest ghost**: every modal footer has exactly ONE hero button — the
  primary action — and EVERY other button (Cancel, secondary actions, Import) is the ghost style.
  Use the kit's `ModalFooterButton` (`src/components/ModalFooterButton.tsx` re-export) — never
  hand-write footer classes. Variants: `hero` (default; solid `--ui-footer-hero-*`, e.g. "+ New
  Project" in the Project Manager), `ghost` (e.g. "Import"), `danger` (text+ghost destructive,
  left-aligned with `mr-auto` — Delete), and `danger-solid` (red confirm — Delete Selected). The
  hero's `tone="accent"` uses the project accent (`--ui-accent-solid`) — pass it from
  `projectAccentOf(useProjectTheme())` when the action should wear the chrome. Sizes (coarse-aware
  `px-6 py-2` / `px-7 py-2.5 text-sm`), icon spacing (`gap-2`) and disabled states are baked in. A
  single-button footer IS the hero (Close). No second hero; async heroes swap to a `Loader2` spin +
  `disabled`.
- **No manual resize** — the modal auto-fits its content (content-driven height changes animate,
  see Morph below); drag-to-move by the header is the only manual geometry control. Default
  width comes from the `width` prop (`max-w-* w-full`, else `max-w-xl`) clamped by
  `min(100%, 100vw - 64px)` + `max-height: 100vh - 64px`. **The prop takes a MAX-width class —
  never `w-[…]`**: the kit sets the width inline (the viewport clamp above), and inline width
  beats a `w-*` class, so a `w-[420px]` silently runs the modal edge-to-edge (the Text-styles
  modal bug, roadmap 205).

Behavior: Esc and outside-click = cancel (touch: overlay `onTouchEnd` closes unless a Radix menu is
open, `:165-169`); Enter = confirm — when nothing interactive is focused
(input/textarea/button/dropdown open), Enter clicks the footer's LAST button
(the app's footer convention: Cancel first, primary action last, danger first
with `mr-auto`); an explicit `data-modal-confirm` marker on a footer button
wins over the heuristic, and a disabled last button is a no-op. **Dialogs
(`flat` chrome) differ deliberately**: Enter ALWAYS triggers the primary
action (document-capture in the kit Dialog — Radix focuses the X close button
on open, which would otherwise make Enter cancel), while Esc/outside/X stay
cancel. Radix focus trap. Portaled overlays above the modal
(DurationKeypad) must set their own `pointer-events:auto` (`Modal.tsx:66-67`).

Stacking (modal spawns modal, e.g. Day Events → Rule Editor): the parent fades to **invisible**
(`opacity:0` + `pointer-events:none`, 180ms) while the child is open — only the top modal stays
visible. Pure structural CSS in `index.css`: `[data-modal-stack][data-state=open]:has(~ [data-modal-stack][data-state=open])`
(dialogs portal as siblings into the window body; any open modal with an open modal after it
fades). The modal overlay dims the background **ONE layer per window** (`.ui-modal-overlay`,
kit `tokens.css`) — stacked modals never stack darkenings: the sibling `:has(~ [data-modal-stack][data-state=open])`
selector zeroes the dim on every non-top modal, so exactly one dim layer exists (belonging to the
top modal); it fades 220ms WITH the close morph (`ui-modal-overlay-closing`) and stacked swaps are
instant. The ui-kit confirm/prompt/alert dialogs are Modal instances too (item 67 — flat chrome),
so they participate in the stack + dim machinery identically: a dialog over a modal dims once (its
own layer), the modal beneath fades. **Fade-recovery watchdog**: iOS Safari can leave a stacked
modal's composited layer stuck at `opacity:0` after its child unmounts (the reported "previous
modal invisible but still there" freeze) — the survivor's exit-morph watchdog pins it back inline
(`opacity:1`, which wins over the `:has` rule) once the fade window has passed, and the next
stack-open releases the override so future fades still work. **Radix pin (roadmap 71)**: stacked
modals also break on iPad when `react-dismissable-layer` <1.1.19 — 1.1.12 defers TOUCH
outside-dismissal to the click, so a touch-tap Cancel on the top modal left the stacked dialog's
body at `pointer-events:none` on close (day modal back, app locked; the playground's 1.1.19+ never
showed it). Keep `@radix-ui/react-dialog` ≥1.1.23 + `@radix-ui/react-dropdown-menu` ≥2.1.24, bumped
TOGETHER (a partial bump forks the shared dismissable layer and breaks menus inside modals).

**Viewport & keyboard** (roadmap 70): modals centre and clamp against the **visual viewport**
(`window.visualViewport.height`/`offsetTop`) — on iPad the software keyboard and Safari chrome live
there, not in `innerHeight`. Opening/closing the keyboard re-centres an un-dragged modal into the
visible area (dragged ones just re-clamp) via a `visualViewport` resize/scroll listener.

Morph: stacked modals **grow out of the modal beneath them** and the survivor **shrinks back from
the closing modal's box**; **standalone modals zoom in from 94% on open and zoom back out on
close** — a hand-rolled FLIP in `Modal.tsx` (no animation lib): measure both rects, pin the
content box onto the target box with a `translate+scale` transform (`transform-origin: 0 0`),
force a reflow, then double-rAF to identity with a 220ms `cubic-bezier(0.32,0.72,0,1)` transition.
The transform lives on the **content box itself** (a wrapper would crop inside its fixed
`overflow-hidden` box) and never touches `pointer-events`. Enter: the child finds its stack parent
among open `[data-modal-stack]` siblings (DOM order = stack order, so popout windows work
per-window automatically); no parent → zoom-in. Close: the Modal owns its dismissal paths (X, Esc,
outside-click, overlay touch) and intercepts them via `doClose` — plays the zoom-out, THEN calls
`onClose` (footer buttons that call `onClose` directly snap closed; stacked children skip the
self-zoom since the survivor's morph-back is the close effect). Exit-morph parent side: a
MutationObserver arms a per-frame poll that tracks the child's last box; when the child disappears
it plays the reverse map while the CSS fade restores it (the inline transition carries
`opacity 180ms` so the fade keeps running). Drag/resize are gated while a morph runs; an
animation token cancels stale rAF/timeouts on rapid open/close. **Content-driven size changes** (tab switches,
async loads — e.g. Project Manager Local↔Cloud) FLIP the box height: a ResizeObserver pins the
old height, transitions to the new px height, then releases to auto — user drag/resize stays
instant and mid-morph fires re-anchor afterwards. `prefers-reduced-motion` skips the animation —
but content growth still **re-clamps** the box's top/left to the visible viewport (a no-FLIP
ResizeObserver, kit ≥ v0.1.79), so a growing modal can't push its footer off-screen. Opt-out:
`localStorage lemon_schedule_modal_morph === '0'` — no code change needed to disable. **The same motion language covers every overlay** (roadmap 58): dropdown menus grow out
of their trigger's corner, submenus out of their entry edge, context menus out of the press point,
and EntityDropdown/Select/Autocomplete panels out of their trigger — the kit's shared
`overlayMorph.ts` (`useOverlayMorph`, exported via `@gabriel/ui-kit`) replicates the modal zoom
(reduce-motion + the same opt-out key gate it; app shims inject the key, kit stays key-agnostic).
**Close-flash rule**: closing styles are NEVER cleared while the overlay is still mounted (clearing
`opacity` repaints one full-opacity frame if the unmount render is deferred) — the box is pinned
`visibility: hidden` and styles are restored only after the node detaches (menus, `Modal.zoomOut`)
or on a pinned clone for unmount-driven closes (`cloneOnUnmount`, panels).

**Touch + keyboard inside modals** (roadmap 69/70/165): overlays are ALWAYS scrollable by touch —
react-remove-scroll (Radix Dialog) cancels `touchmove` on anything outside the dialog content, so
`useOverlayMorph` intercepts touchmoves at document capture (stop-propagation, the same trick as the
v0.1.52 wheel interceptor) and lets native finger scroll proceed. **One positioning engine** — kit
`useDropdownPosition` (`ui-kit/src/useDropdownPosition.ts`, re-exported at
`src/lib/useDropdownPosition.ts`) — owns every menu/panel: fixed + portaled to the current document
body, decisions against the **visual viewport** (the iOS keyboard shrinks/pans it and fires
resize/scroll there, never on `window`), top/left only (CSS `bottom` is layout-viewport-relative and
lands under the keyboard), content-height-aware flip (`bestFit` when neither side fits) and height
clamp on the chosen side (`maxMenuHeight` = per-menu ceiling). Re-measures on
scroll/resize/visualViewport/ResizeObserver. **MUST NOT hand-position a panel, add a second
positioner, or cap a panel's height with an `!important` class** (an `!important` cap beats the
engine's inline clamp — menus hung off-screen). On touch, `useKeyboardDismissOnScroll` mirrors
native `.onDrag`: dragging a surface the focused field does NOT live in dismisses the keyboard —
EXCEPT a drag that starts inside an editor-attached floating panel (`.click-outside-ignore`, the
portaled EntityDropdown/Autocomplete/ref list the field itself opened): scrolling the suggestion
list is part of the edit and must not blur (a blur commits + closes the dropdown; roadmap 206).

Width ladder (verified call sites): `max-w-sm` simple forms (`CustomOrderSortModal`) · `max-w-md`
single-form (`DayTypeModals.tsx:26`) · `max-w-lg` merge/violations (`ViolationModal`) · `max-w-xl`
HelpModal · `max-w-2xl` color rules / travel-hold / import (`ImportDialog`) · `max-w-3xl`
links manager / print dialogs (`LinkManagerModal.tsx:200`, `PrintDialog.tsx:130`).

Touch bumps (`IS_COARSE`, kit `Modal.tsx`): header `px-6 py-3`, title `text-sm`, footer `px-6 py-3`.

**When NOT to use a modal** (NN/g modal-vs-nonmodal): noncritical info (use banner/tooltip/pill),
routine actions (no confirm at all), decisions needing info behind the modal (keep on page),
multi-step wizards (dedicate a page), anything not related to the current task.

## Confirmations & destructive patterns

- Copy must **restate the consequence with specifics**: "Delete scene 12 — The Drive In?" not
  "Are you sure?". Verbed buttons ("Delete", "Keep") over Yes/No.
- `danger: true` → red confirm button, ghost cancel; cascade flow: cancel = edit not applied,
  confirm = cascade with the casualty list in the message
  (`src/lib/useLinkedEditGuard.ts:57-61`).
- `suppressKey` → "Don't ask again (24 hours)" checkbox, stored in localStorage; reserve for
  frequent-but-serious (e.g. delete-from-trash), never for one-off confirms.
- **Undo-first rule**: if the action is reversible (undo history, Boneyard vs delete), prefer a
  lighter confirm or none. Confirming the same thing every time teaches users to click through it.
- **Commit-on-blur rule (roadmap 250/251)**: every editing surface commits when the edit
  FINISHES — blur / Enter / Tab / Escape / leaving the page — never per keystroke and with
  no Save button. The manager pages (`useRowBuffer`) and the Report Designer's text defer
  the store write while you type; dropdown/address-modal edits commit on the next tick
  (coalesced). Un-flushed text counts as dirty for the S3.5 peer-save check
  (`src/lib/inFlightEdits.ts`), so a peer's save raises "Changes available" instead of
  reloading over it. There is no unsaved-changes guard any more.

## Feedback taxonomy (severity → mechanism)

| Situation | Mechanism | Example |
|---|---|---|
| Continuous save/offline state | Header icons + hover tooltip | `SaveIndicator.tsx` (`Loader2` spin=saving, `Cloud`=synced, `WifiOff`=offline, `CloudOff` rose=fail, `HardDrive` rose=storage full, amber "!" dot on the `Cloud`=shared project's collaboration room unreachable — hover/click tooltip with the offline-queue count, roadmap 239) |
| Folder backup state | Color-coded pill in header + menu | `StorageStatus.tsx` (sky=saving, emerald=saved, rose=error) |
| Offline / auth / read-only | Full-width colored bar `px-4 py-1.5 text-xs` | `OfflineStatus.tsx:24-58` (green=restored, amber=auth, red=offline) |
| Transient selection/buffer summary | Floating dark panel near cursor + amber pills | `ScheduleOverlays.tsx:92-105`, `ScheduleToolbar.tsx:105` |
| Action success | Inline `text-[10px] text-emerald-400` next to the action | `LinkManagerModal.tsx:302` |
| Severe error | Modal (rare) — see §When NOT to modal | `OfflineStatus.tsx:59-99` |
| Recoverable error | Inline near the source, red, with a remedy | form/input errors |
| Loading | `Loader2` + `animate-spin`, often with label swap ("Reconnecting…") | `SaveIndicator.tsx:88`, `OfflineStatus.tsx:52` |
| Empty state | Centered `text-zinc-500` + filled CTA button | `SceneSheet.tsx:260-272`; "Trash is empty" `App.tsx:923` |
| Reference info | `Tooltip`/`HoverTooltip` (hover-only; touch gets info inline instead) | `ViolationTooltip` |
| Overlay open/close | Trigger-anchored scale+fade morph (220ms modal easing, §Modal) — **feedback, not chrome**: no slides/overshoot/springs on functional menus; hover items keep `transition-colors` only; `active:transition-none` stays (instant touch) | kit `overlayMorph.ts`; `e2e/overlay-morph.spec.ts` |

**There is no toast system and none should be invented** — pick a mechanism from the table.

### Presence pointers & the follow pill (roadmap 229 S3)

Collaborators' live pointers live in `PresenceOverlay.tsx` — a single
`fixed inset-0 z-30 pointer-events-none` layer; each pointer is a small glyph in
the person's deterministic `avatarColor` (white outline + `drop-shadow-md`) —
an arrow, a hand for touch input, a pen dot, or the modal-window icon while
that peer is frozen inside a modal (roadmaps 241/244) — with a rounded name
label (`rounded-full px-2 py-[3px] text-[10px] font-semibold
text-white`, same colour, `left-2.5 top-4`; flips `right-3` near the right edge).
Labels show the person's first name; anonymous guests show their full generated
name ("Anonymous Otter"). Clickable (`pointer-events-auto`) to follow.
Pointers GLIDE between positions via the overlay's rAF loop (exponential
approach, τ ≈ 110ms; `prefers-reduced-motion` snaps) and pop in via
`.presence-pointer-in` (`index.css`, `motion-reduce` disables). **NEVER put a CSS
`transition` on the positioning wrapper** — the ~12/s cursor feed restarted it
mid-flight and pointers stuttered (reported 2026-10-15). A peer inside any
menu/dropdown/context menu/modal shows animated dots on the tag (240) and their
pointer FREEZES there until it closes (244); a modal additionally renders the
window glyph, and a marker the local pointer has rested on for ~2s fades to 30%
until separation (244). They are hidden
when their anchor is off this client's viewport — never painted over unrelated
chrome (user decision 2026-10-12: hide, no edge chips) — and **a peer's pointer
only renders while you are on their EXACT place (same tab + sub-tab + sub-sub
mode) AND, on document pages, the same open document** (Sheet scene, report
design, ribbon design — roadmap 236). Anchors are semantic, never pixels:
rows/date cells/Day Manager sections, registered grid cells, and every authored
control (auto `ui:` keys from testid/aria-label/title/text; direct-hit only —
they are exempt from the ≤40px snap that keeps rows magnetic) — manual in
docs/PRESENCE.md, inspector
`window.__lemonSchedule.presenceAnchorAt(x, y)`. The **header
collaborator bubbles** (`UserPresenceCluster`, max 3 + a
`+N` menu) are follow TOGGLES — click a person to follow their view, click
again (or Esc / navigate) to stop; they carry the same deterministic colours
and an amber dot for guests. Avatar circles render DiceBear `initials` letters
on the person's identity colour (roadmap 231). At rest they form ONE tight overlapped stack
(`-space-x-2.5`); hovering or focusing the strip spreads them into full circles
(`hover:space-x-1 focus-within:space-x-1`, `transition-all duration-200
ease-out`, `motion-reduce:transition-none` — roadmap 245) so every person is
fully visible and easy to hit. The "Following X" pill
sits at the BOTTOM CENTER (`fixed left-1/2 -translate-x-1/2 z-40
bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px))`, rounded-full, white
text + a white pulsing dot) and is painted in the followed person's
`avatarColor` (matching their pointer); it must stay below the kit overlay
bands (menus `z-[200]`, modals `z-[10000]`) and exits on click/Esc/manual
navigation. Pointers are EPHEMERAL: 20s TTL plus presence leave, never persisted.

## Message copy rules

Plain language; no error codes/jargon; no blame ("invalid/incorrect" → "enter a time between…");
state the problem precisely AND the remedy; preserve user input on failure; keep it one line where
possible. Success/failure messages match the app's terse voice: "Applied: linked elements added to
N scenes" — not "Success! Your links have been applied".

## Hover, tap & device model

- **Hover styles are un-gated** (`index.css @custom-variant hover`, kit `tokens.css` header): iOS
  Safari's native tap-to-hover — first tap applies `:hover` (sticky until the next tap) and defers
  the click to the second tap — only engages when the tapped element has a matching `:hover` rule.
  `(hover: hover)` is false on iPadOS even with cursor/pencil and `(any-hover: hover)` is false when
  no hovering pointer is attached — either gate kills the native behavior on touch.
- **`:active` is outside the gate** — instant touch feedback; add `active:transition-none` to avoid
  delay. No JS flash/pulse affordances: iOS sticky hover (tap → `:hover` until next tap) IS the tap
  feedback and doubles with anything extra.
- **Apple Pencil = touch**: `isTouchLike('pen')` (`src/lib/device.ts`); Safari doesn't synthesize
  clicks for pen in overlays (device.ts shim) and never fires `:active` for pen.
- **Touch sizing** via `IS_COARSE` (`src/lib/device.ts`): menu items `px-4 py-3 text-sm` (vs
  `px-3 py-2 text-xs`), toolbar buttons `h-10 px-3.5 text-sm`, modal header `px-6 py-3` — bump the
  same way, never guess a middle size.
- Long-press opens context menus with a progress ring (`.ui-longpress-ring`,
  `node_modules/@gabriel/ui-kit/dist/ui-kit.css:826`).
- Keyboard: `Esc` clears selection (`useScheduleKeyboard.ts:38-41`); cell editing navigates via
  Tab/Shift+Tab/↑↓ (`CellInput`).

## Accessibility requirements

Radix primitives supply focus traps, `role=menu/menuitem`, arrow/typeahead, Esc. App obligations:
`aria-label` on every icon-only button (`LinkManagerModal.tsx:252,262`), `aria-pressed` on toggles
(`SelectionModeButton.tsx:15-16`), decorative icons `aria-hidden`. Never communicate state by color
alone — pair red with icons/text (violation `Flag`, error icon + message). Keyboard parity: every
pointer action must have a keyboard path (documented in `HelpModal.tsx`). New shortcuts/controls
MUST be added to `HelpModal.tsx` (AGENTS.md rule).

## Anti-patterns (MUST NOT)

1. **Never write a second copy of a primitive** — kit first, then the app shim re-export; fix bugs
   in the kit, port back to in-app copies if not yet migrated (`UI-KIT.md`).
2. **No new toast system** — use the §Feedback taxonomy.
3. **No hardcoded ribbon-cell styling** — always `getRibbonCellBaseStyle` (`src/lib/ribbonUtils.ts`).
4. **No per-keystroke commits** — `CellInput` commits on blur; EntityDropdown commits on exit.
5. **Never gate hover styles behind `(hover: hover)` / `(any-hover: hover)`** — a non-matching gate
   kills iOS tap-to-hover (first tap = sticky `:hover` highlight/reveal, click on the second tap).
   Un-gated `hover:`/`:hover` is the rule; `.hover-reveal` needs a `.group:focus-within` path.
6. **No raw colors outside the zinc palette/tokens** — no brand colors, no saturated UI chrome;
   danger/success/amber semantics as in §Status colors.
7. **No mixing layers** — a light card inside a dark modal or vice versa is a bug.
8. **No black-on-black sections in dark modals** — section containers take a gray
   backdrop (`bg-zinc-800 border-zinc-700` on the `bg-zinc-900` body); same-as-body
   backgrounds bury the hierarchy (see §Two-layer surface model).
8. **No parallel dropdown/menu families** — extend `src/lib/dropdown.ts` classes or the kit;
   `rules/ElementPicker.tsx` `ElementDropdown`/`ElementPickerRow` are the shared picker rows
   (extend, never fork).
9. **No hardcoded z-index surprises** — overlay `9999`, modal content `10000`, menus `200`
   (10001 in modals), tooltips `99999`.
10. **Never scroll a menu/dropdown list after it is visible** — no `requestAnimationFrame`
    reveal, no `scrollIntoView` (it also scrolls the page/modal). A list that moves between
    mousedown and mouseup loses the click (the "click the item twice" bug). A picker that holds
    a value opens **already scrolled to it** via the kit's `useRevealRowOnOpen` (pre-paint
    reveal, frozen once the pointer engages); arrow/hover scrolling uses `revealRowInScroller`.

## Verification checklist

1. `npm run lint`
2. Visual pass on `npm run dev` (port 3000): the changed surface + a modal, a dropdown, touch-size
   emulation (devtools → iPad) — hover, active, Esc/outside-close, keyboard nav.
3. `npx playwright test` (or `npm run test:smart`) after any primitive/kit change; canaries
   (`seeded-smoke`, `debug-bridge`) cover modal/menu basics.

## Appendix — source index

- Modal: `src/components/Modal.tsx` · PageToolbar: `src/components/PageToolbar.tsx` ·
  EntityDropdown: `src/components/EntityDropdown.tsx` + `src/lib/dropdown.ts` ·
  dropdown panel: `src/components/DropdownPanel.tsx` · CellInput: `src/components/CellInput.tsx` ·
  ColorField: `src/components/ColorField.tsx` · tooltips: `src/components/{Tooltip,FloatingTooltip,HoverTooltip}.tsx`
- Kit shims: `src/components/{DropdownMenu,DropdownItem,DropdownDivider,DropdownSubmenu,ContextMenu,Dialog,Checkbox,Checklist,RadioList,FloatingChrome,EditorChrome}.tsx`
- Kit source + tokens: `node_modules/@gabriel/ui-kit/dist/index.js`, `dist/ui-kit.css`
- Global CSS: `src/index.css` · device model: `src/lib/device.ts`

External sources consulted (Aug 2026): Nielsen Norman Group — "10 Usability Heuristics"
(nngroup.com/articles/ten-usability-heuristics), "Confirmation Dialogs Can Prevent User Errors — If
Not Overused" (nngroup.com/articles/confirmation-dialog), "Error-Message Guidelines"
(nngroup.com/articles/error-message-guidelines), "Modal & Nonmodal Dialogs"
(nngroup.com/articles/modal-nonmodal-dialog).
