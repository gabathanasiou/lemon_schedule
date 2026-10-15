# Changelog

What's new in Lemon Schedule — one section per day, newest first: **Features**, **Bug fixes** and **Changes**, in plain language.

## 2026-10-15 — Pointers, undo and account settings

**Features**
- **Account settings**, with Profile and Team tabs, reachable from the avatar in the header without opening a project. Team holds your roster and email invites, with suggestions from people you have already worked with, and the Project Manager's Shared tab now shows who you are signed in as, with sign out.
- **Live pointers** now land on the exact control a teammate is using, and in the Script tab they show which screenplay block they are on, so "that line" always points at the right line.
- You can see what everyone is doing: a teammate's selection wears their colour on the breakdown grid, the day tables, the stripboard, the Calendar and the two designers, and whatever they are dragging shows as a ghost under their pointer while the item is held, so it cannot be moved or deleted out from under them.
- Pointers keep out of the way: while a teammate has a menu or dialog open their pointer pauses with a cue (dots, or a window glyph inside dialogs), pointers resting on top of each other fade back, name tags stay on screen at the edges, and the header's collaborator stack collapses to a count and spreads out on hover.
- Following a teammate now mirrors more of their view: the manager category they are on, their report Preview and Fields/Values picks, and the Script scene they are in.
- **Undo and redo** in a shared project run through the shared history now: undo says so when a teammate has built on your edit instead of quietly doing nothing, redo refuses once someone edits after you, and the Shift+Z redo shortcut works again.
- If a shared project's live connection drops, a badge tells you, and edits you make meanwhile are kept and replayed in order the moment it is back.
- **Shared projects are realtime**: edits, drags, renames, calendar changes and undo/redo land on every connected device as they happen — each person's undo touches only their own changes, and the header's cloud icon shows the connection state.
- **Tabs** — the top bar is now a compact icon dock with a gliding selection pill (⌘1-7 jumps straight to a tab), and switching tabs no longer stalls on heavy pages.
- **What's New** — File → Help → What's New lists these updates day by day; the version mark on the boot screen opens it too.
- **Settings** — a new Sessions tab signs out your other devices at once, or everywhere including this one.

**Bug fixes**
- Opening a project whose schedule version was missing crashed the Schedule tab; it now repairs itself.
- Renaming an open shared project now reaches the online copy and refreshes the Shared list right away.
- Typing a new cast name into the breakdown grid's new-row cell or pasting one in now opens the naming step; it used to save the name with no cast member behind it.
- **Element lists** that hold two spellings of one name (car / CAR) no longer raise a merge prompt on unrelated edits, and a deliberate pair stays as you left it unless you rename one into the other.
- Security updates closed known issues in the software the app relies on.
- Signing out on one device no longer signs you out on your other devices; and if a session has ended, the app says so and asks you to sign in again — it used to look like the internet was down.
- A hiccup in the live connection now recovers by itself within seconds — no page reload, and edits made meanwhile sync the moment it returns.

**Changes**
- The **Element, Crew and Locations managers** dropped their Save and Revert buttons: each field saves when you click away, press Enter or Tab, or move on. The project title and the Reports Designer's text behave the same way.
- The **"Editing:" design pick** in the ribbon and reports designers is now personal, so each of you can edit a different design without changing what everyone else is looking at.
- The **Script tab** is much faster in long screenplays: opening, hovering, selecting, searching and scrolling no longer crawl.
- Accounts wear generated avatars now: your initials in a circle on your identity colour.
- **Look and feel** — the header and toolbars now share one spacing scale, so the rails line up evenly, and on iPad the status bar wears the project's chrome colour.

## 2026-10-12 — Sign in, share and follow along

**Features**
- **Accounts**: create one with email and password (or a provider when it is available), sign in and reset your password from one place, with your name captured at sign-up and editable later from the avatar menu.
- **Shared projects**: Collaborate copies the open project into your shared workspace, where it saves as you work. Everything shared with you, and everything you share, lives in the Project Manager's Shared tab.
- The **sharing panel** handles access: invite people by email or with a link, set each person to "can make changes" or "view only", choose how long a link lasts, and revoke it whenever you want.
- Links work for people without an account. They join as a guest with a friendly name like "Anonymous Otter", and can turn into a full account later without losing access.
- **View-only** means view-only: every editing surface is switched off for a viewer, and the save indicator explains why instead of offering a retry.
- **Live cursors**: teammates' pointers with their names and colours appear on the Schedule, the Calendar and the Day Manager, and only while you are on the same view they are. The bubbles in the header show who is here and double as follow toggles.
- Click a teammate's bubble to follow them: their tab, Scene Sheet scene, view switches and scroll come along. Scrolling yourself does not end it; click again or press Esc to stop.
- When a teammate saves, their changes appear for you on their own, or a "Changes available" chip waits for you if you are mid-typing.
- **Access changes** arrive live: moved to view-only locks the project at once, and a removal closes it with a notice.
- Typing a cast name that is not on your cast list opens the naming step: Save gives it the next free cast number, Cancel removes it, and nothing half-finished is left behind.

**Bug fixes**
- Picking a cast member or element from a floating list in the stripboard used to leave the cell stuck in edit mode and lose the pick.

**Changes**
- Right-click a day's Start of Day header or End of Day footer: the menu opens that day in the Day Manager and names it, the first day's header adds Set Production Dates, and the half you clicked highlights so the action cannot land on the wrong day.
- The boneyard has a Scene button: New Scene takes the number, INT/EXT, day or night and set up front, and drops the new strip in selected.

## 2026-10-09 — Call sheets get precalls and crew

**Features**
- **Call sheet designs** gained a Precalls block, one column per department or a vertical list with a Departments filter, and a crew roster block that edits the day's people, calls and precalls right on the page.
- Titles for tables, grids and repeating blocks, plus captions for images and maps.
- The **Reports Designer's right-click menus** grew up: Columns and Repeat/Table targets sit in submenus, adding inside a repeat works, and impossible moves are greyed out.
- View, then Report day in the Reports Designer: pick which shooting day a day report previews and prints.

**Bug fixes**
- **Production windows** opened separately (Crew, Locations, Days) showed a placeholder or a blank pane instead of the content, and call sheet grids in those windows now show their block titles.
- **Day Manager crew**: Add Role sits by the Crew header next to Apply template, and it can add a role to a department that does not have a card yet.
- In the breakdown grid, the editor that opens over a cell now lines up with the column, numbers right and text left.

**Changes**
- **Number fields** everywhere gained steppers and drag-to-scrub: drag a number sideways to change it quickly.
- **Toolbar switches, tabs and on/off toggles** were unified across Call Times, Day Events, Calendar Strips/Events, the Day Manager to Call Sheet switch and the Script tab's pane toggle, compact and all the same height in toolbars.

## 2026-10-08 — References learn what they point at

**Features**
- In the Reports Designer, the attribute list behind a reference now follows that reference's item, so a scene reference offers scene fields and a day reference day fields, and the values it prints respect where the block sits (a props list inside a day shows that day's props).

**Bug fixes**
- **Call Times**: an "On Set" (anchor) element call time now accepts a relative offset like -30 min instead of ignoring it.
- In the Reports Designer, a reference pointing at a labelled cell (like "Director: Bob") now knows which item it holds, so pinned attributes fill in instead of showing an error.
- The **"pick a cell" menu** on a free table no longer drops you out of editing when you click it, and call-sheet designs built without an editable zone print the day page instead of a blank sheet.
- On an iPad, scrolling a long suggestion list with your finger no longer closes the dropdown and loses the field.

## 2026-10-06 — Type directly in the report

**Features**
- **Text blocks and free-table cells** are edited right on the page now: double-click (or tap again on a tablet) and start typing in place, with the formatting bar following the text you're in.
- A Fields/Values switch in the report designer header: Fields shows the tokens you've placed, Values shows exactly what will print, and every block carries a header — starred when it works out values from elsewhere in the design.
- The designer's editor docks to the side by default and can float for full width; duplicating a block keeps you on the copy so you can place it.
- An unresolved lookup no longer leaves a blank hole: it shows as a labelled chip — red for a broken reference — with the details on hover.
- **Free-table resizing** lives on the column strips and row tabs, so grabbing a border never fights with selecting cells; double-clicking a resize tab evens the two neighbouring columns.

**Bug fixes**
- Clicks and double-clicks in the canvas are no longer swallowed, so selecting a block and stepping into its text works first time — including right after editing something else — and a freshly added block opens ready to type.
- **Empty rows in a free table** keep a normal row height instead of collapsing into a squashed line.

## 2026-10-02 — Free tables learn to reference cells

**Features**
- **Free tables in the report designer**: type headers in place, add and remove rows and columns, drag the column borders, and merge cells — with per-cell formatting and a cell toolbar that follows your selection.
- Cells can point at other cells with "=": a menu to pick one, mirror or pinned copies that follow the original, relative offsets that shift when copied, and a hover that shows where a value comes from. Tab moves between cells.
- **Lookups** are two-stage now: pick the thing (a day, scene, crew role, location, element) and then its attribute, with suggestions scoped to where you are — and a bare "@" no longer dumps the whole project.
- **Named text styles** apply to a selection as linked runs, so editing a style restyles every passage that uses it — on the canvas, in preview and in print.

**Bug fixes**
- **Scene lookups** show off-board scenes properly instead of blanking them; a reference to a cell that no longer exists prints #REF!, and an unknown attribute #VALUE!.
- **Day-based blocks** preview Day 1 of the schedule and calendar you're actually working in, matching page 1 of the print.
- **Cell edits in custom-row tables** stick, and the designer reopens in the mode you last used — Day or Call Sheet.
- The cell hint reads "@ for tokens · = for references", hides while you're typing, and follows the cell's alignment.

## 2026-10-01 — Designer inspector moves into the rail

**Features**
- **The report designer's inspector** docks into the side rail: nothing selected shows the palette, a selected block or column shows its settings, and the rail collapses or drag-resizes like the other side panes.
- In rows-axis tables, clicking any cell in a row selects that whole row — with inserts above/below, moves and delete worded for rows.
- **Long linked lists** wrap instead of running off in the Link Manager, a range fill that touches linked elements asks once and applies everything in one step, and menus scroll to the highlighted row only when you're driving with the keyboard.

**Bug fixes**
- **A scene ribbon** in a report or call sheet keeps side-by-side cells on one line again instead of squeezing the second one onto two.

## 2026-09-30 — Menus stay fully on screen

**Features**
- **Menus and dropdowns** are never cut off any more: they flip above the field when there's no room below — including with an iPad keyboard up — and open fully inside tall windows and dialogs.
- **Call sheet**: Print is icon-only, the Times button spells out what it previews, and scene/crew hover previews only appear when Times is on.
- **Crew tables** on reports and call sheets carry phone and email, crew names are capitals everywhere — as you type them, in every roster, report and export — and Add Crew Member puts the cursor in the name box so you can type and press Enter.
- **Cast names** typed onto a scene bind to the member already in your cast list instead of creating a duplicate blank entry.
- Tagging a name in the screenplay that isn't in the cast yet opens the naming dialog, and Cancel takes the tag back with it.

**Bug fixes**
- **The Advance block** shows up in call-sheet preview and print again — it was quietly dropping off days where the next day fell outside the printed selection.
- A day opened in its own window scrolls again, and crew call edits in the day roster stick instead of being ignored.
- Escape while typing in a cell cancels that edit and keeps the window open rather than closing it.
- **Weather fields** say "No forecast yet" for dates beyond the forecast window instead of showing a bare dash.

**Changes**
- Adding someone from the Crew Manager goes back to an inline blank row; the Add Crew Member form stays on the day roster and the crew template.

## 2026-09-29 — Back and forward steer the app

**Features**
- **Browser back and forward** now move through Lemon: tabs, sub-tabs and the Production views are proper places, a reload puts you back where you were, and the project you were last in reopens when you return within the hour.
- **Production's views** are tidied into three sub-tabs — Day Manager, Crew and Locations. Crew and Locations each switch between the manager list and its table, and the Day Manager flips to the Call Sheet editor, with the day picker sitting in the same spot either way.
- **Reports** can now show a day's high and low temperature alongside the weather.

**Changes**
- **Toolbars** are icon-led with labels on hover (the Schedule's Edit/Print/View, the Calendar's view toggle, the Scene Sheet's New/Duplicate/Delete), and the Scene Sheet's script pane keeps just the scene number and heading.
- "First call" is renamed "First turnover" in the Day Manager, and the Element Manager's Positions window is gone — that mapping is edited from Crew Links now.
- A scene you create or duplicate in the Scene Sheet is brought straight into view.
- The Calendar no longer pops a screenplay preview when you hover a scene card.

## 2026-09-16 — Script tags, razors and scene splits

**Features**
- Every production day has a crew roster built by department: each slot is a role plus a person and its own call, the call stays with the slot when you swap the person, department pre-calls stack underneath, and a dash means no call at all. The same editor fills the Crew template in Call Times, and Add Crew Member adds someone on the spot.
- Edit one cell in a selected range and press Enter to fill the whole selection as one undo; entity columns fill down their own column only, and replacing a comma-separated list (cast, categories) asks first.
- **Call-time cells** open with the resolved time ready to overwrite — leave it alone and no override is saved.
- **Cast and element tables** in reports are ordered by Board ID and name rather than the order they happened to be entered in.
- **The Script tab** is now interactive: select a name in the screenplay and tag it as cast or any element category, and names already in the body appear as wavy suggestions that one click turns into real tags across every occurrence. A View menu toggles the marks on and off, and the category menu is searchable.
- **A razor tool** splits a scene at any block boundary in the script — the new piece becomes a lettered boneyard scene that inherits the elements — and merge handles put it back.
- **Scenes split by a revision** get a Split Manager: renumber, move the break, resolve, or merge back.
- Duplicating a scene from the stripboard, the breakdown grid or the Scene Sheet uses one dialog with three modes: Split (new letter, copy the script), Coverage (same number, schedule only, with a copy badge) or don't care.
- Retyping a scene number onto one that already exists warns first and offers a one-step swap.
- **File ▸ Script integrity…** audits a project for duplicate scene numbers, screenplay left over from deleted scenes, and scenes missing their pages — and repairs what it finds, including the old mix-up where suffixed numbers like 5.1 were read as 51.
- Updating to a revised draft re-anchors your tags through the changes: unchanged dialogue keeps its tags, changed scenes are matched by their text, and anything orphaned is listed in the review.

**Changes**
- **The scene ribbon's cell menu** is tightened up — narrower, with more breathing room when it scrolls, and dark styling over dark surfaces.

## 2026-09-11 — Screenplays import with the script

**Features**
- **Importing a Final Draft or Fountain screenplay** keeps the script itself, not just the breakdown: the Script tab reads it Final-Draft style — scene numbers in the margin, an eighths ruler, full-text search — with a scene list down the side and a right-hand pane that follows what you've selected in the Scene Sheet or the breakdown grid. Bold, italic and underline survive the import.
- **Re-importing a revised draft** is a review, not an overwrite: an aligned side-by-side diff walks you through the changes scene by scene (arrow keys take and keep, a Back that really goes back), small edits are marked word by word, a rewritten block shows as a whole-line replacement, and one confirmation applies it — scene numbers, cast and schedule stay put.
- Scene headings from drafts that don't follow the usual convention are understood — localized words for interior/exterior and day/night, multi-word phrases, oddities like DREAM — and anything unrecognised is offered for mapping to your own heading colours.
- Importing into a brand-new project goes through the same review — rename scenes, assign cast Board IDs, choose categories, map headings — and the project takes its name from the file. Cast already in the list is reused by name instead of duplicated.

**Changes**
- Projects take a fraction of the browser space they used to, and empty fields are left out of the saved copy.

## 2026-09-09 — Day Manager gathers the whole day

**Features**
- **The Day Manager** is now the home for a production day — details, locations, events, conflicts, scenes, call times and crew on one page, with the wide tables underneath. Copy a day from another, park a day on the clipboard, or pop it out into its own window.
- **Call times** became a proper helper: set your stages once (Pickup, Arrive, HMU, Costume, On Set), give them to crew and elements, and every call time resolves backwards from the day's first scene. Stages drag to reorder, and the settings open in a tabbed Call Times window from the Day Manager header.
- Time fields show the resolved clock time and let you click to edit the expression behind it — offsets like "45 minutes before" now cross the hour correctly.
- Breaks and notes moved into day details, with their labels and durations edited in place.
- Crew can be linked to elements, so a person carries the categories they look after.
- **Call sheet editing**: a day now opens on its call sheet, the page previews live as you build it, and the call sheet area is edited on the real designer canvas with drag and drop. Call sheets ship with a rebuilt template and custom-row tables.
- **Reports** can build call-sheet sections from a day's elements, departments and locations, with lookup tokens, per-section item filters, and day-type sections with their own columns.
- The day tables fill editable cells blue under the pointer and keep read-only ones faint, so it's obvious what can be typed into, and they always fit their card exactly — no blank trailing column, no scrollbars.
- A day picker button, shared by the Days page and the call-sheet editor, opens scrolled to the day you're on.
- Cast and elements folded into the Call Times table, each row showing its scenes and times.
- A crew member's call time falls back to the day's general call until you give them their own.
- Master and key locations now explain the difference between them in plain words.

**Bug fixes**
- **Reports** no longer print a trailing blank page when a section has nothing in it, and deeply nested repeated sections page correctly instead of dropping or repeating their contents.
- Number boxes in report setup can be cleared and retyped, and filter value pickers behave.

**Changes**
- **The Days page** is now the Day Manager — details band on top, a friendlier empty state, and the active tab in a dark toolbar reads as a white pill.

## 2026-09-02 — Type a name, an element appears

**Features**
- **Scene Sheet cells** for elements wrap long values instead of clipping them, the whole cell is clickable, and notes grow as you type.
- Typing a name that doesn't exist yet into an element picker now creates that element on the spot, wherever you are in the app.

## 2026-09-01 — Calendars stretch to fit their strips

**Features**
- A single click on a day header in the Calendar strips opens the Day Manager (it used to take a double click).
- **Tooltips** hug their icon and appear instantly, and they never block clicking what's underneath. Event cards carry their type icon on the left and a note icon on the right that shows the note on hover; adding events defaults to the day's type.
- **Calendar days** can expand to fit their strips, or lock to even rows when you'd rather scan the grid.
- Drags land where you mean: event cards onto days, and whole-day swaps that carry the day's status with them.
- **Reports** can be built around day types — a section per type, each with its own columns.
- **The scene ribbon toolbar**'s alignment, vertical alignment and truncation toggles now show which is on, and its number boxes take typed values. New designs start with a smaller ribbon text size, and individual cells can be nudged smaller or larger.
- **Project details**: timezone has a searchable picker, the report date format is a picker, and production start opens a calendar.
- **The crew manager** asks which department a new custom role belongs to, and gathers unassigned roles under Other.
- Importing an MSD file turns each distinct calendar into its own calendar version, with location columns and cards that reflow on narrow screens.
- The boot screen shows the app's lockup, and fresh tabs no longer fire Google sign-in popups.

**Bug fixes**
- On iPad, opening a window on top of another and cancelling it no longer leaves the page frozen.
- A blocked sign-in popup no longer marks cloud projects as expired.
- **The Calendar** no longer leaves stale blank space behind when its height changes.

**Changes**
- **Version pickers** follow the page they sit on instead of turning blue for cloud projects.

## 2026-08-29 — Production dates move to their own calendars

**Features**
- **Production dates, events, prep and post windows** now live on their own calendar versions, so you can switch between them without touching the schedule.
- **Day events** are grouped by type, each type a card of element rows with its icon, label and note — edits apply immediately and a Done button closes it.
- Deleting projects and versions got rebuilt windows, with each kind of item listed under its own heading, and the project list stays open when there's nothing in it yet.
- Tapping on iPad now highlights buttons and rows the way hovering does on a desktop.

**Bug fixes**
- **The save indicator** keeps showing progress while a cloud save is being retried, and only turns red when it has truly given up.
- Editing several rules at once from a day or an element no longer silently drops the ones after the first.
- In the element events manager, deleting the last event of a date cleans that date up, and adding several dates at once keeps them all instead of only one.
- Clicking anywhere on an event row opens its editor, except the note and delete controls.
- **The rule editor** no longer resets its type picker, cast chips and date picker every time you change something in the form.
- **The project list's sort button** keeps its width when you switch between sort options.

**Changes**
- **Date and event-type pickers** in the event windows fill their columns, and notes moved out of the adder into the day and element managers where they belong.

## 2026-08-28 — Every event starts counting everywhere

**Features**
- **The Scene Sheet** can be ordered by sheet, scene number or stripboard order, and the ribbon toolbar takes numbers you type.
- Scene ribbon text size is a design setting now, with per-cell adjustments.
- **Menus and pickers** scale open from whatever you clicked, so it's clear where they came from.
- Date chips open a calendar right there, single events can change their date, element and category, and double-clicking a card opens its editor.
- **Element events**: notes can be per element, the Add Events window is one shared flow, and adding an event to an element only asks for its date, type and note. The manager shows collapsible type cards, conflicts and a way to add rules.
- Events now count like day statuses — Day Out of Days cells and totals, manager columns, day lists and reports.
- In windows, Enter confirms the main footer button, and each footer has one clear main action with the rest kept quiet.

**Bug fixes**
- **Cloud projects** are no longer locked as expired when the sign-in refresh popup is blocked, and saves survive ad-blockers interfering with the connection.
- **Cloud saves** upload far smaller files, so large projects stop dropping mid-save on Safari.
- Clicking Save in a window no longer misses because the dialog shifted when a field lost focus.
- **Dropdown panels** always show their scroll position.
- Scheduling to day N lands inside that day, and a stale shift+click selection no longer anchors to the wrong row.
- **Date fields**: swapping a single date and clearing it now work.

## 2026-08-27 — Element links keep edits in step

**Features**
- **Element links**: link a scene's anchors one way, and edits to an anchored field follow through to everything linked to it. A link manager shows and edits those links, and pickers mark which entries are anchors.
- **The Calendar's events mode** adds attachment cards and chips that span their days, with drags and a day window that handles several statuses at once, along with comments and rules.
- **The day window** has Events, Conflicts and Rules tabs, with the day's status settable on the same row; days with more than one event show a star in the header.
- Rules appear as cards on each day they affect — drag a card to move its date, delete one to remove it from that day, and double-click to edit it locked to that day. Their descriptions say who they affect, e.g. "1. FISHERMAN: max 8h".
- **The calendar's filter menu** is grouped with quick All toggles for day types, cast and elements, and rules, and it collapses to a single icon row.
- Days can expand their cells to fit their strips, and the Day Breakdown pane lists each date's events and conflicts — clicking a date opens the same day window.
- **The Production Dates manager** holds prep, production and post windows plus the weekly days off.
- **Locations**: the picker defaults to the pin you're on, addresses are editable, the name falls back to the address, and saving no longer merges or deletes same-name locations.
- **Day types**: the built-in Production Days is now Work, and the Co. Tra column is gone.
- **Element managers** can lock Board IDs so automatic numbering leaves them alone, and pinned columns stay in place while you scroll sideways.

**Bug fixes**
- Automatic numbering no longer overwrites a Board ID you've locked.

## 2026-08-26 — Movie Magic files go both ways

**Features**
- Start a new project from a Movie Magic Scheduling file: the boards arrive as schedule versions with their days and breaks intact, banners become notes, undated strips land in the boneyard, calendars become non-shoot days, and cast, crew roles, script page numbers and strip colours all come across.
- **Scheduling Exchange files** work both ways — import one to build a project from a breakdown (scenes land in the boneyard, no days are invented), or export your schedule in that format to hand to Movie Magic.
- Importing is now one button in the Project Manager that takes any supported file and works out what it is, and the File menu has Import and Export menus that name the file types each path accepts. Starting a project from a schedule or a breakdown asks you to confirm first.
- **Cast numbering** is labelled Board ID wherever you set or sort it — the cast list, the import panel and the Rules window — matching what Movie Magic calls it. Report fields keep the name Cast ID.

**Bug fixes**
- **Cast numbers** imported from Movie Magic follow that file's own roster order, so a scene tagged 3. MARY means the same person in both apps.
- **Imported scenes** keep their original sheet order, so the stripboard lines up with the schedule you imported from.

**Changes**
- **New Project** left the File menu — the Project Manager is where projects are created.

## 2026-08-24 — Day types move into the Calendar

**Features**
- The Calendar has a Day Breakdown sub-tab where day types live: a sidebar of every type with how many days each covers, the dates it's used on, and a window to edit its name, icon and colour. It pops out into its own window like the other tabs.
- **Production days, Hold, Travel and Day Off** are built in and can't be renamed or deleted. Production days can't be marked at all — they're the default state of a shooting day — and that entry shows a count and your shoot days as DAY 1, DAY 2…
- Marking a day and attaching things to it are per type: pick a status in the travel/hold window and attach travel, holds or cast to that type.
- **Calendar day cards**, their tooltips and the right-click menu show each type's own icon, label and colour.
- **The Day Out of Days** shows a type's label and colour instead of the old fixed letters, and the printed version adds a count column and a code cell per type.

**Changes**
- **The Day Types manager** moved out of the Calendar's View menu — it's the Day Breakdown sub-tab now.

## 2026-08-23 — Design your own kinds of day

**Features**
- **Day types**: you can create your own kinds of day — a name, a colour and an icon — and mark calendar days with them from a day's right-click menu or the travel/hold window. Built-in Hold, Travel and Day Off keep their icons; your own types show a colour dot.
- **The Day Out of Days** picks up your types, showing each day's label and colour instead of fixed letters, and custom reports gain a Day Type field that resolves per day.
- Reports can show maps: drop in a map block, search for a location or attach the day's own, and the map comes with an address bar and buttons that open the place in Google Maps, Apple Maps or Citymapper.
- Choosing a location is drag-to-place now — a pin sits at the centre of the map and you move the map underneath it, with the address settling once you let go. Searching recentres the map, and Attach is always available.
- **A page-break block** now ends the page wherever it sits, at any depth, instead of only working inside repeat items. Repeat items, tables and nested blocks all respect it, and a break at the top of a page does nothing.
- **Preview and print** get even spacing between blocks, matching the gap between repeat items; the design canvas stays as it was.
- **Repeaters and tables** over typed collections have a skip-empty option — tick "skip types with no locations" and the design won't print empty rows.

**Bug fixes**
- A map block with no location yet no longer crashes — it asks you to add one.
- **Location-type filters** behave: the weather lookup follows the filter, the label comes back, and choosing All types clears it.
- Switching a repeater or table to a different collection clears the filter it had before instead of keeping it silently.
- Escape in the Reports Designer works again while a window or menu is open — it closes that surface first.

**Changes**
- **The map block's settings** show the location name as a link instead of a separate address line.

## 2026-08-16 — Print reports, strip by strip

**Features**
- Printing a custom report opens a proper print window: page size is remembered for the project, repeat items can be ticked in or out, and ribbon blocks get their own options — layout, cell borders, call times, durations, notes, breaks and day breaks — with a live strip preview beside them. Tables always print every item.
- **Ribbons in a report** now look exactly like the stripboard, cell for cell, down to prefixes, suffixes, wrapping and truncation. The design canvas shows sample strips so you can see your formatting; previews and prints always render real rows.
- Printing and previewing measure the content as it renders, so pages fill properly and long content splits cleanly — ribbons break between strips, tables between rows — instead of running off the page. A page break inside a repeat item gives each item its own page.
- **Day repeaters** can use Breakdown fields, resolved across that day's scenes: page counts, cast, elements and the rest.
- **Text and attribute blocks** can take a background colour and a border, with the text colour chosen automatically so it stays readable.
- **Locations in reports** resolve through one merged family of fields — name, address, phone, map link and so on — from your locations database or the day's own location. Weather fields follow the item's location and date.
- A relative block inside a repeat shows the next or previous items, which is the shape a call sheet's "coming up" list needs.
- **Repeat and table menus** no longer offer the collection you're already inside, and the parent's own category is greyed out.
- Resizing a table column keeps every row in step, and the same grip works in the ribbon designer. Hold shift while dragging to scale the columns to the right along with it.
- **Spacers** drawn as a line can be given a thickness.

**Bug fixes**
- Moving a local project to Drive keeps the project's original last-modified date instead of stamping it with the moment of the move.

**Changes**
- The "+N more" cut-off on tall tables now only applies while designing — previews and printed reports render every row.

## 2026-08-15 — Field chips get their own wording

**Features**
- Click a field chip inside a text block to give just that item a prefix, suffix or separator — "Day 3" instead of "3", or a slash between values instead of a comma. A customised chip is marked so you can see it.
- **Palette attributes** drop into a design as text blocks with their field already in the text, so you can write words around them.
- **Report ribbons** follow the stripboard: day breaks read the same, notes and breaks render as their own rows, and a ribbon block outside a repeat shows the whole schedule, with previews limited to the first few strips. Day sections are always boxed now.
- **Emails, phone numbers and web addresses** in a report are clickable but keep the table's own typeface — no blue underline. A web address stored in any field links up the same way.
- **Drive projects** are listed in pages, so a long list of cloud projects all shows.

**Bug fixes**
- Projects that live only in Drive no longer disappear from the list after a reload, and removing one sticks.
- A file that can't be read now says so instead of failing silently.

**Changes**
- **The Link block** is gone from the palette — the values that need to link do it themselves.
- **The block settings panel** is single-column: the header spans the top and style and content stack below, so tall cards stop resizing the panel while you scroll.
- **Tables in the designer** show their first six rows with a "+N more" marker.
- **Print in the Reports Designer** opens the print window instead of printing straight away.

## 2026-08-14 — Crew roles and a locations database

**Features**
- **The Crew tab** is built around roles now: a sidebar lists every role on the roster, selecting one shows its people, and you add members or whole new roles from there. Edits are held until you save, so you can batch them, revert, merge duplicate people, sort and undo — and removed people go to the trash like everything else.
- **Crew** has a spreadsheet view for editing many people at once, with role suggestions as you type, paste from a spreadsheet, and import or export of the roster as a CSV file. Sort from the column header, or jump straight across to the manager.
- **Locations** get a database in the Production tab: a manager and a spreadsheet view for every location you use, with address, contact, phone, email, notes and the nearest hospital and police station, grouped by type. Adding or editing one opens the same searchable map picker.
- **Reports** gain image and map blocks plus weather, so a day's report can show the location, its address and the forecast, with the project's timezone respected.
- **The text block editor** was rebuilt so typing and formatting behave reliably, with field suggestions offered right in the text and labelled chips.
- **Reports** can list a day's rule violations as their own collection, so warnings can be part of a call sheet.
- Element Count and Scene Count in reports resolve to what that part of the report is about, so a count means the count of the items shown there.

**Bug fixes**
- **Links in reports** — in text, in tables, and in email and phone values — all open reliably now.
- A map no longer draws over the editor's panels, and its markers no longer swallow clicks.

**Changes**
- **Print windows** use the app's standard checklists and radio lists, and the text style window is more compact.
- In the crew spreadsheet, the name column comes before the role column.

## 2026-08-13 — Rich text and smarter field pickers

**Features**
- **Text blocks in the Reports Designer** are real rich text: bold, italic, underline and lists, a Word-style set of named text styles you can apply and override, and fields that appear as labelled chips wherever you type or pick them.
- **Document headers and footers** repeat on every page of a report, each with its own "skip the first page" switch.
- Every block has a floating settings panel with all of its controls, and clicking a table on the canvas lets you select, insert and reorder its columns right there.
- **Table columns** can be bold, italic or aligned on their own, empty rows can be hidden, and cell borders can be switched off. Hiding empty rows is per column instead of one switch for the whole table.
- **Field pickers** are grouped into tidy submenus with dividers — report-wide fields sit together, and Counter has its own place — and list-valued fields are labelled as lists. Searching the palette finds fields that don't apply where you are and marks them unavailable.
- **Reports** gained work, hold and travel day lists and totals per person, work start and finish, category name, element list, cast list, schedule version, and the first and last production day. One date format setting on the project drives every date in reports, and a block can pick its own day format for day lists.
- A cast repeat can show the cast number, or a combined "number. NAME" field, alongside the name.
- Inside a category repeat the menu offers the elements of that category, and categories themselves can be repeated.
- **Tables** can show field keys instead of values while you design, and an empty table still shows its header with a skeleton so you can lay it out.
- Fields resolve to the part of the report they sit in: a count inside a day block counts that day, a count inside a cast member counts that person's days.

**Bug fixes**
- Typing in a text block stopped breaking on pasted spaces and empty chips.
- Element work days, hold days and dates no longer come up blank in reports.
- Dragging a block onto a header, footer or empty area moves it instead of making a copy, the drop marker clears when you let go, and a move across zones is a single undo step that no longer loses blocks.

**Changes**
- **Spacers** lost their solid style; the "when empty" choice for a block is simply show or hide.
- Duplicate cast fields, manually entered production dates and the unused scene Duration field left the field list.

## 2026-08-12 — Build reports, mark who travels

**Features**
- **The Reports tab** gains a Reports Designer: drag blocks onto the page (text, attributes, repeats, tables, columns, a scene ribbon, page breaks, spacers), drop the report's fields into them, switch a table between rows and columns, preview as you go, and print with your page breaks respected. Report layouts are saved with the project, so you can keep more than one.
- A new Production tab: Project Details holds the production company, studio, office, address and contacts plus your key positions (director, producer, line producer, 1st AD, UPM), and Crew holds your roles and the people in them, with custom roles you can add yourself.
- **Travel and hold on non-shoot days**: mark who travels or is on hold that day, by person or as everybody in a category, from the day's right-click menu or the Travel / Hold window you open by double-clicking a day header. The day shows a plane, pause or star icon with the names as chips and on hover, and the Day Out of Days marks travel per person.

**Bug fixes**
- **Day Out of Days** now lists every calendar day from production start to the end of the schedule, not only days with something marked on them.
- **Time-limit violations** read naturally ("10h 30m") instead of decimal hours.
- **Element manager**: cast names a project kept in an older format are recovered, leaving the tab with unsaved edits asks first instead of silently dropping your merge, and Undo/Redo works on unsaved element edits.
- **The Design tab** no longer asks to save the default layout when nothing changed; a modified default saves itself as a design named "Default".
- Dropdowns opened from inside a window are clickable again.

**Changes**
- Collapsing the boneyard now happens from the schedule toolbar, with the toggle sitting alongside the other view controls.

## 2026-08-11 — Renames and merges, one clean save

**Bug fixes**
- Saving element edits is one reliable step again: renames rewrite every scene in one go, duplicates merge instead of piling up, and a half-applied save is no longer possible.
- **Names** that differ only in capitalisation (FISHING BOAT and fishing boat) now both show, so you can merge them deliberately.

## 2026-08-04 — Touch taps land, drops get faster

**Bug fixes**
- On touch screens, tapping a breakdown cell selects it and double-tapping opens the editor again; drag-selection and keyboard editing in the Breakdown grid on an iPad match the desktop.
- **The cast column's dropdown** in the breakdown grid lists your cast again instead of "No matches".
- **Single-select dropdowns** open with the current choice highlighted, so arrow keys start from where you are.
- **The custom-order sort window** opens again from the schedule toolbar.

**Changes**
- Dragging and pasting strips only redraws the rows whose times actually change, so drops on long schedules are much faster.

## 2026-08-03 — Tap a strip, edit that one

**Features**
- **Edit mode** reworked: tapping a strip makes that one strip editable and focuses the field you touched, instead of switching the whole stripboard into edit mode at once.
- **The boneyard** can now be hidden completely on the Schedule and Calendar, and brought back from a dashed "Boneyard" button on the toolbar. Its header was tidied to match the rest of the app, and the Calendar's boneyard list gets an UNPLACED divider between unplaced and unscheduled strips.

**Bug fixes**
- **iPad input pass**: hover highlights work with a trackpad or Apple Pencil (they were dead before), the Pencil behaves like a finger everywhere including windows, pen taps open the native colour, date and file pickers, and strips can be dragged again with a mouse attached.
- On devices with a physical keyboard, typing in dropdown cells works again, and the keyboard toggle is respected when a keyboard is attached after the app loads.
- Swiping across the toolbar on a touch screen no longer opens dropdowns or scrolls the page.
- Windows always fit the screen and can be dragged within it, and the number keypad stays tappable inside them.
- The Auto Banners, violations and Help windows open again.
- On touch, tapping a row marker in the breakdown grid selects that row and no longer opens the scene sheet, and long-press menus only appear where they should.
- **Dropdown panels** no longer flash in the top-left corner before appearing in place.

**Changes**
- **Calendar on small screens**: day cells are a uniform size and scroll inside, the calendar trims to the weeks that matter, and soft fades show there's more.
- Tab cycles through every field of a strip and then moves on to the next strip; the stripboard scrolls to follow the field you're on, and the focused field darkens.
- Strips snap into place on drop instead of sliding.

## 2026-08-01 — The calendar scrolls the whole shoot

**Features**
- **The Calendar** is now one continuous view of the whole production, month block after month block in a single scroll, with jump-to-first/last, previous/next month, Today, and it remembers where you were when you come back.
- **Inserting days**: drag a day onto another day's edge or into the gap between days to insert it there and push the rest along. A blue flash shows the insert, and a swap flashes the two exchanged days in different colours.
- **Auto Banners** adds note and break banners to every day in one go, with a label, a duration, a position (top, middle or bottom, split by scene ribbons, duration or pages) and colours.
- **Delete banners by label**: the window lists your notes and breaks as colour-matched pills with counts, so you tick the ones you want gone.

**Changes**
- **Day headers in the Calendar** show the full date (MON 20 JUL) with DAY N, HOLD, TRAVEL or DAY OFF underneath, and the SW/W/FW week badges are gone.
- **Day break tools** tidied up: the toolbar now reads Day Breaks and Banners, with Add by Duration, Add by Pages and Delete All, and the pinned start-of-day row stays out of the way of cutting, deleting and Select All.
- **Selection totals** now add up notes and breaks as well as scenes, and a break shows how long after the day's start it falls, in the day break's time column and on printouts.
- "Duplicate (Ghost Scene)" is now just "Duplicate".
- The 'W' tool for painting days in the Calendar is gone: working days were never paintable anyway.

**Bug fixes**
- Working offline is handled thoroughly: the connection is checked every few seconds even while you're idle, editing is blocked while you're offline or signed out, the notice says which with a Retry or Sign in button, it clears itself when you're back, and save errors read like sentences instead of raw error text.
- Clicking into a text box keeps the text selected instead of collapsing to a caret, and clicking off the stripboard clears the selection with it.

## 2026-07-17 — Sorting upgrades, pasting lands right

**Features**
- Right-click empty space on a Calendar day for Paste below, Add note below or Add break below, with the row landing at the end of that day where you'd expect.
- **Sorting** got a proper upgrade: sort by any column, flip direction, drag your own order for INT/EXT and DAY/NIGHT, and lock a criterion so its groups stay together while a second sort works inside them.
- **Select All in the stripboard menu** (and Cmd+A) picks up every row in the section, skipping the pinned start-of-day row.

**Changes**
- **Violations** read better: hovering a flag shows a compact list, the window groups violations per cast member, and the wording is plain ("Can only work 10h (scheduled 12.5h)").
- **Auto day breaks**: the button is now Auto Day Breaks, it places a day break before the row that would push the day over your limit, and one window asks what to do with the notes and breaks it finds.
- **Selected notes and breaks in the Calendar** use your palette highlight colours.
- Clicking empty space anywhere closes open dropdowns.

**Bug fixes**
- Pasting into the Calendar no longer lands a row one day off.
- Arrow keys work in the start-of-day call time, keyboard navigation skips the pinned row, and a selected day break highlights both its header and footer.
- Renaming an item in a dropdown list commits when the menu closes instead of losing the new name.
- **Cloud projects** block editing the moment the browser goes offline.

## 2026-07-16 — Arrow keys drive the schedule

**Features**
- **Keyboard navigation** reaches the whole schedule: arrows and Shift+arrows move and extend the selection in the stripboard and the boneyard, Cmd+A selects all, and the Calendar's boneyard and strips answer to the same keys plus Cmd+X, Cmd+V, Delete and Enter. The Calendar also has its own right-click menu: Cut, Paste, Duplicate, Open Scene Sheet, Send to Boneyard, Delete.
- **Older projects** open straight into the day-break layout: they're converted when you open them (with a note telling you), get a closing day break for the last section, and take their production start from the first shoot day.
- **Cloud projects** look after their own connection: the sign-in is refreshed and reconnected in the background, and you get a clear sign-in prompt when the session needs you.

**Changes**
- **The app header** adapts to narrow windows: tabs scroll and stay centred, labels shorten, and soft fades show there's more to scroll.
- **Day counts** use production days only (the pinned start-of-day row is not a day), and the flag button shows a count and turns red when the active version has violations.

**Bug fixes**
- Strips drop into empty production days in the Calendar again.
- **The Calendar** opens on the production start date rather than today.
- In the boneyard menu, Delete truly removes notes and breaks, and multi-select offers Send to Stripboard instead of Remove Ribbons.
- The number shortcut that sends scenes to a day no longer lands one day off, and is ignored when there are no day breaks.
- **A day break's call time** no longer bleeds into other sections, and violation labels count days the way you do.
- Cutting rows no longer leaves copies behind inside day sections.

## 2026-07-14 — Opening day is here to stay

**Features**
- Every schedule now opens with the first day's START OF DAY row pinned in place. It can't be dragged away or deleted, and it doesn't count as one of your shooting days.
- **A day's call time** is set on its own START OF DAY ribbon and nowhere else: every strip below shows the call time that comes out of it, and when you swap two days in the Calendar, each day's call time travels with its scenes.
- Drag a day's header in the Calendar onto another day to swap the two days' scenes and call times.
- **Day rows** now carry their date, and the day's page count and call time sit in line with the ribbon columns — "End of Day 1", then "START OF DAY 2" with its call time beside the word CALL.
- **Ribbon cells** have a fourth overflow option, Visible: text can spill out over the next column instead of being cut off or wrapped.
- The flag button on the Schedule toolbar opens a day-by-day list of everything the rules caught, and each day header shows a red flag with how many violations it has — click it to read them.
- **Calendar days off** can be set in bulk: pick the days of the week (weekends by default) and they're marked off across the month you're looking at.
- **Day footer colours** are now yours to choose in Design → Colors, so the day-break rows can match the rest of your palette.

**Bug fixes**
- **The printed schedule** follows the stripboard now: each day starts with its START OF DAY header and closes with a compact footer showing that day's call time, estimated finish and page count.
- The print day list no longer offers the lead-in section as a day to print, and the Day Out of Days counts days the same way the stripboard does.
- If your browser runs out of storage, the save indicator turns red and says your changes aren't being saved instead of failing quietly. Deleting a project also clears its leftover saved data.

**Changes**
- **Calendar day headers** use your Day Header colour from the palette now (they used to be a fixed grey), and the start / work / finish markers sit in a small corner badge.
- "Holiday" is called "Day Off" everywhere, and days off are shown in grey rather than green.
- **The Scene Sheet header** is a flat banner again — a nested dark box inside it was removed.
- **Strips** no longer get a shadow when they're selected, and day breaks are marked with a clean black line.

## 2026-07-13 — Tabs break out into windows

**Features**
- **Day breaks** in the stripboard are proper ribbon rows now: the row that closes a day shows that day's page count, shoot time and break time, and the day-break rows are where the call times are set.
- **The Daybreak tab** is now the Calendar tab, and it's the place for dates: every day comes from a day break in your stripboard, gets a date counted from your production start with days off skipped, and a "Day 1", "Day 2"… label.
- New buttons in the Schedule toolbar: Clear removes every day break, Auto places them for you by duration or by page count, and Sort reorders the strips by scene number, script day, page count, duration, INT/EXT, day/night or any element category — custom ones included.
- **The Unscheduled panel** is now called the Boneyard.
- **Conflicts** from your rules show on the day headers and on the strips in both the Schedule and the Calendar, and the Day Out of Days is built from the same days as the stripboard.
- On desktop, any tab or sub-tab can open in its own window: Shift+click it, or right-click and choose Open in New Window. The windows share the project, so an edit in a popped-out Scene Sheet shows up in the main window as you make it.
- **Versions and ribbon layouts** are managed from one list menu now — rename in place, duplicate, delete — and it stays open while you work.
- In the Ribbon Designer every cell has an Overflow setting (Truncate, Wrap or None), and new projects start with a tidier default ribbon: scene number and call time truncated, durations wrapping.

**Bug fixes**
- **Cloud projects:** renaming one now saves the new name everywhere, moving a project between local and cloud no longer risks the work, and the cloud list refreshes itself — with a refresh button showing when it last updated.
- A failed save to Drive shows a red cloud in the header you can click to retry, and your Google sign-in quietly refreshes in the background so you're not asked again.
- Deleting a project closes it instead of quietly opening the next one.
- Fixed the Shift key getting stuck after using a pop-out window.

**Changes**
- **Header refresh:** flat white tabs with rounded corners, a tidier version picker and undo/redo, and a blue header whenever a cloud project is open.
- On iPad and iPhone, copy and paste work, and dialogs and buttons have bigger tap targets.
- **Delete confirmations** now offer a "Don't ask again (24 hours)" option.

## 2026-07-12 — Projects learn to live in Drive

**Features**
- Projects can be kept in Google Drive now: sign in with Google from the File menu and your projects sync to your Drive as you work — a cloud badge shows which ones they are.
- **The project list** is split into Local and Cloud tabs with counts, sorted by last modified, created or title, with a refresh button, a "last updated" time and Move to Drive / Move to Local actions.
- Export the whole breakdown as a CSV file, or import scenes from a CSV and check the mapped columns before it's applied.
- Right-click a column header in the breakdown grid to sort by it — A to Z, Z to A, smallest to largest.
- **Pasting in the breakdown grid** repeats the copied values down the whole selection like a spreadsheet, and the empty row at the bottom accepts a paste too.

**Bug fixes**
- **Cloud projects** were showing up twice and pointing at the wrong file: they no longer touch local storage, moving one to local can't lose work, deleting one removes it from Drive, and an expired sign-in reconnects instead of failing silently.
- **The Schedule** keeps your place when you switch to another tab and come back.

**Changes**
- Right-clicking a row number in the breakdown grid keeps your selection, the row menu only opens on right-click or touch, and the delete column shows a pointer.

## 2026-07-11 — The breakdown grid takes the stage

**Features**
- **The Breakdown tab's main view** is now the new spreadsheet-style grid: every scene and every breakdown column in one grid you type straight into, with the Scene Sheet and Element Manager beside it.
- **Field pickers** (cast, elements, INT/EXT, day/night) open over the grid instead of being clipped by it, and they hand the value back and move along when you press Enter or Tab.
- Drag the divider between two column headers to set your own column widths; they're remembered for the project.
- **Row numbers** run down the side: click one for its menu, double-click to open the Scene Sheet. Select rows to copy, cut, clear or paste them, and clear a scene out with the trash box on its row.
- **Text size** is adjustable from the View menu, and the rows, columns and padding scale with it. Smooth scrolling lives there too — on by default on touch devices.

**Bug fixes**
- Fixed the empty phantom rows the grid drew past the end of a short breakdown, and the grid refreshes properly after edits, pastes, deletions and undo/redo.
- The grid remembers where you'd scrolled to.

**Changes**
- On touch devices range selection is off (it fought with scrolling), the row numbers are bigger, and selecting cells no longer drags the page along.

## 2026-07-10 — Cells open on a double-click

**Features**
- **Cells** in the breakdown grid open on a double-click, and the field pickers open inside the cell you're on.

**Bug fixes**
- The grid no longer draws empty rows past the end of your scenes.
- **Pickers** were opening on the wrong columns, and edits could be dropped: they now land in the cell you opened, and undo/redo redraws the grid.
- Deleting, cutting, pasting and clearing a range of cells now happen in one step.

## 2026-07-09 — A spreadsheet sneaks into the breakdown

**Features**
- First look at the new spreadsheet-style breakdown grid, sitting beside the existing Breakdown views: type in cells, copy and paste, right-click a row for actions, add scenes from the empty row at the bottom, and change the text size.

## 2026-07-08 — Colour rules repaint your strips

**Features**
- **Scene colour rules**: build rules that repaint a strip when it matches what you choose — a category, a specific element, a cast member — and they show up everywhere the strip does: the stripboard, Calendar, Scene Sheet and print. Rules drag to reorder, duplicate in one click, and deleted ones rest in the trash for 30 days if you want them back.
- **The colour matrix behind scene strips** is yours to define now: rename, add and remove the INT/EXT and DAY/NIGHT options in the Colors tab, and renaming one carries through to every scene already using it.
- Selecting strips gives you a readout that follows the cursor — how many strips, and their total running time — with the same counters in the top bar, including how many strips you're holding in the clipboard.
- **The breakdown grid's toolbar** now has Edit and View menus: sorting, cleaning empty rows and CSV import under Edit, font size controls under View, remembered between sessions.
- A Scene Sheet now has a duplicate button.
- Your palette and colour rules can be exported and imported together as "Palette & Rules".
- The toolbar has an Info dropdown.
- **Colors tab polish**: interface colours on one line, touch-sized controls, new matrix options open ready to type and scroll into view, and options forced to uppercase.

**Bug fixes**
- **The colour-rule element picker** sorts its list, scrolls to the element you had, and commits what you pick; strip text defaults to black and the stray dawn/dusk presets are gone.
- **Horizontal scrolling** works on touch again, so wide grids and toolbars pan sideways.
- **The breakdown grid's header row** stays put while you scroll on Safari, the trash column stays visible, and the corner cell is labelled Sheet.
- The Scene Sheet no longer crops its bottom on iPad, and its inner scrolling is fixed.
- Your scroll position survives switching tabs, and scrolling is smoother on iOS.
- **The Keyboard toggle** takes effect straight away, in every tab.
- **The Colors tab, Element Manager and ribbon designer** no longer cut off their last row behind the screen edge, and the Categories heading sticks while you scroll.

## 2026-07-07 — Dropping offline locks your edits

**Features**
- The app is safe to leave open without a connection: if you drop offline it switches to read-only — every editing surface locks so nothing can be lost — with a banner explaining the state and a Retry connection button, and a green notice that clears itself when you're back.
- **The fallback strip colour** — the one used for scenes that don't match any of your colours — is now yours to set in the Colors tab.
- A schedule can leave page counts blank; the Total Pages footer only appears when there's something to count.

**Bug fixes**
- **Shift+click range selection** works in the Unscheduled tab, along with arrow-key and Shift+arrow navigation when nothing is selected yet.
- Going offline again while the "connection restored" banner is showing clears the banner immediately.
- **Resize handles in the ribbon designer** sit exactly on the column boundary they resize.

## 2026-07-01 — Touch controls for the whole app

**Features**
- Editing a duration on iPad opens a keypad beside the strip instead of the system keyboard: it shows the scene you're editing, gives colour feedback as you type, updates the strip live, and understands shorthand like "1h25" without the "m". On desktop you keep typing straight into the cell.
- **A Select Mode button for touch**: tap strips to add them to your selection, or press and hold empty space and drag a box around what you want. The board scrolls itself at the edges while you drag, and scrolling is only locked for the moment you're actually drawing.
- **A Keyboard toggle for touch**: leave it off while you're arranging the board and taps select and move strips instead of popping up a keyboard.
- **Menus and dropdowns** are built for fingers now: roomier items, they lift above the iPad keyboard when it appears, and submenus open on whichever side has space.
- **Resize handles in the ribbon** are bigger on touch and rise above your finger while you drag, so you can see the column you're sizing.
- **Apple Pencil** works properly in menus, dropdowns and dialogs.
- The Rules list shows the cast names involved, cards open when you click them, and a rule can be deleted from its edit dialog.
- Calendar scene cards are sized for touch and highlight selection the way the stripboard does.

**Bug fixes**
- **The duration keypad** opens on the first tap, selects the row it's editing, and pressing Enter no longer drops your strip selection.
- Dragging one day onto another in the Calendar swaps them reliably, and the preview lines up with where the day actually lands.
- Dragging a strip no longer clears a selection you made with the marquee.
- **Native text selection and the iPad's magnifier** no longer get in the way when you tap and hold on the board.
- In single-value dropdowns, choosing a value replaces what was there instead of adding to it.

## 2026-06-30 — Right-click menus reach the Calendar

**Features**
- **The Calendar** now has the stripboard's right-click menu: right-click or press and hold a scene card or a day for copy, cut, paste, insert, banner edits and more — with icons, so it scans at a glance.
- Double-click a note in the Calendar to edit it, pick banner colours from a proper colour picker, and open a scene's sheet without leaving the Calendar.
- **Calendar display options** moved into the Calendar's own View menu: choose which element category shows on the strips, toggle conflict warnings, and show or hide things with eye icons.
- Dialogs can be dragged by their title bar and resized from any edge or corner.
- **Element Manager**: cast sorts by board number, every sort lives in one dropdown, and Merge Duplicates folds duplicate elements into one and updates the scenes that used them.
- Right-click a cell in the breakdown grid for copy, cut, paste and clear; fields that should be uppercase type that way; backspace clears a field properly.
- **Element dropdowns** are friendlier: an always-visible "Press Enter to commit" hint you can click, a value commits when you click into another cell, and long lists stay alphabetical with an "add new" row at the bottom.
- The ribbon designer's toolbar is tidier, violation flags are back on day headers, and the tooltip groups violations by cast member.

**Bug fixes**
- Clicking a scene card in the Calendar selects it again, marquee selection works on empty day space, and a strip dropped at the end of a day lands where the preview showed.
- Typing a value and clicking straight into another cell used to lose your edit; it commits now.
- **Buttons in some dialog footers** were invisible against the dark footer — they're back.
- **Column selection in the breakdown grid** shows clearly, and copy, cut and paste fall back to the cell you're on when you haven't selected a range.

## 2026-06-29 — Ribbon designer finds its grid

**Features**
- **The ribbon designer** is now the Design tab's default view, rebuilt around one shared column grid: resizing a column resizes it across every row together, cells merge across columns, text can sit top, middle or bottom, Delete clears the selected cell, and there's a Sheet # column.
- **Cell padding** now has separate vertical and horizontal amounts, and merged cells wrap long text with proper line spacing instead of clipping it.
- Importing a script, a CSV or pasted rows is a single undo step — one Cmd+Z takes the whole import back.
- **Report columns** can be resized to fit their content.
- **Print** gained page size and view mode options, and cell borders fill the full height of a cell.

**Bug fixes**
- Merging duplicates now actually removes the duplicates and updates every scene that referenced them.
- **Note and break banners** centre their text and line up with the ribbon's columns.
- Sets from an imported screenplay are registered properly instead of being dropped.
- **Long end-of-day footers** truncate cleanly rather than spilling out of their row.

**Changes**
- **The show/hide grid lines option** is gone — cell borders are always drawn.

## 2026-06-16 — Breakdown categories get a reshuffle

**Features**
- **The breakdown** was rebuilt around a real element list: Camera, Special Effects, Set Dressing, Special Equipment, Security, Additional Labor, Visual Effects, Mechanical Effects and Miscellaneous joined the categories, Animals and Animal Wrangler became separate, SFX and VFX were renamed Special Effects and Visual Effects, and Weapons was retired. Scenes also gained Sequence, Unit and Location columns.
- **Elements** is now Element Manager, and the Breakdown tab opens on Sheet by default.
- **A new Colors tab**: adjust the stripboard palette cell by cell, reset any cell, and see your changes in the ribbon designer's live preview as you go.
- **The ribbon designer** gained padding controls — vertical and horizontal cell padding plus padding around the ribbon's edges — a tidier toolbar with tooltips on every control, and A4 portrait / A4 landscape / full-width view modes shared with the stripboard and matched in the print preview.
- The designer's live preview shows a coloured schedule banner and jumps straight to the stripboard.
- **Print settings** are remembered: the print dialog and the Day Out of Days, Breakdown Sheet and Element Breakdown dialogs keep your choices, with a Reset button when you want the defaults back.
- The banner editor lets you edit the banner text and copy colour codes, and the print preview keeps call time and duration columns blanked rather than reflowing when those options are off.
- Selected rows are red with white text everywhere, so selection reads the same in every tab.
- A "?" in the toolbar opens a full stripboard controls reference, written in ribbon terms.
- Shift+Enter moves to the same column on the next row; Enter just commits.
- **Menus**: Layout and View merged into one View dropdown with nested submenus, Edit now sits beside Print, and the new default ribbon design centres call times and durations, widens Set and Cast, and puts day/night on its own line.

**Bug fixes**
- Typing a cast name that matched an existing member could overwrite that member; cast is now tied to its board number, so no one gets renamed by accident.
- **Cells** no longer jump in height when you start editing them.
- **Narrow dialogs** no longer stretch to full width.

**Changes**
- **Exports** are .lemon files, ribbon designs are .ribbon files, and the wording follows: Export Project, Project Manager.

## 2026-06-11 — Import a screenplay, get a breakdown

**Features**
- Import a screenplay — Final Draft or Fountain — and get a breakdown out of it: scene headings, page counts, characters and elements sorted into your categories, with a prompt for anything the file leaves unmapped.
- **Characters from an import** are matched to your cast in the same dialog; auto-assignment is one click and goes in order of how often each character appears. The cast list is now put in order by dragging instead of typing numbers.
- **Reports** has its own tab: the Day Out of Days and an Element Breakdown, each with category and element pickers (select all included) and a Print button.
- Make your own breakdown categories — name them, give them an icon — and use them in the Scene Sheet, the breakdown grid, the scene ribbon and printed pages. Deleted elements and categories wait in the trash for restoring, and categories you never use can be hidden.
- In the ribbon designer, right-click a cell to control what it shows: the text around the value, or nothing at all — cells can be removed.
- **The Calendar** answers right-clicks: set a day to hold, travel or holiday, make it a working day again, or clear it — blank days included. New projects open with today already a working day.
- Working down a long day got easier: dragging a ribbon near the top or bottom edge scrolls the stripboard for you, and holding an arrow key scrolls too. The unscheduled list scrolls on its own without dragging the schedule with it.

**Bug fixes**
- Screenplay imports handle times like LATE EVENING, apostrophes inside names and dotted page counts, and effects, special equipment and the remaining extra categories land where they should.
- Breakdown counts stay right after an import, and switching projects no longer shows the previous project's elements.
- Sets and other elements keep the capitalisation you gave them, and a comma inside a name is no longer read as a separator.
- **Dropdowns** stay inside the window: long lists flip up or shift sideways, arrow keys scroll the highlighted item into view, and they no longer hide behind the dialog that opened them.
- Scene Sheet edits are saved as you move between scenes or click away.
- Pasting or importing scenes brings any new cast and elements along with them.

**Changes**
- The Schedule tab is now called Stripboard, and the tab strip got a slide-in shape on load.
- The header is tidier: one File menu holds the project list and import/export, with Import Screenplay on it.
- Breakdown categories follow Final Draft's names — Extras are Background Actors, Animals are Animals & Wranglers.
- One dialog style across the app now, with the main button pinned to the bottom.

## 2026-06-10 — Design your own scene ribbons

**Features**
- Design your own scene ribbon: a Ribbons sub-tab in the Schedule lists every field you can put on a strip, in the order you want, with a live preview. New designs are named for you, and a design can be duplicated, exported to share, imported back, or deleted — deleted ones wait in the trash.
- **The stripboard's ribbon picker** names the design in use, switches between designs and jumps into the editor.
- **Printing** follows your ribbon: printed strips show the same columns and text, notes and breaks keep their colours, and the print dialog previews the design.

**Bug fixes**
- **Note and break strips** keep their text in the widest cell, inline, instead of floating over the strip — Enter puts the cursor in the text.
- Text too long for a cell is trimmed with an ellipsis rather than spilling into its neighbour.
- A cast member appears once in the cast dropdown, not twice, and using the dropdown no longer acts twice.
- Editing a cell looks the same as reading it, and the designer's cells are taller and easier to hit.

**Changes**
- **The Schedule header** was rebuilt: solid, high-contrast, with the current ribbon design named on it and a proper toolbar.
- **Ribbon cells** got wider defaults, and the set, day/night and duration columns are slimmer.
- **The Ribbon tab** no longer appears in the Breakdown.

## 2026-06-09 — Page counts learn eighths and decimals

**Features**
- **Page counts** show a pgs suffix wherever they appear — stripboard, Scene Sheet and every printed page — and take either eighths (1 4/8) or decimals (1.5).
- **The Calendar** is one month at a time, with the month's name inside the grid.

**Bug fixes**
- Typing a day number sends scenes by the calendar's order of shooting days rather than the day's label.
- Duplicate scene numbers reuse the first free letter (12A, 12B…) instead of skipping ahead.

**Changes**
- Day headers, scene numbers and page counts are left-aligned in the stripboard and print.
- **Non-working and status days** are underlined with a dashed line.

## 2026-06-06 — Sets join the element family

**Features**
- **Sets** are managed like every other category: the set field uses the same dropdown as props and wardrobe, lists everything kept in the element manager, and typing a new set adds it.

**Bug fixes**
- **Elements** match whatever capitalisation you gave them, so the same set typed two ways counts as one.
- A cast member can no longer be saved twice under the same Board ID, and the Scene Sheet's cast list refreshes the moment your cast changes.

**Changes**
- In the element manager, Auto-ID and Sort by ID are cast-only, Clear Zero is gone, and merging duplicates keeps the fuller name.
- Pressing Enter in an element dropdown commits the choice and leaves the cursor in the field.

## 2026-06-05 — Elements, scene sheets and reports arrive

**Features**
- **The Element Manager**: every breakdown category in one place, cast included, with Board IDs, a count of how many scenes each element appears in, a button to number new cast members and a button to sort by ID. It replaces the old Cast sub-tab.
- **The Breakdown tab** carries all fourteen production categories as columns, along with the sheet number, the Scene Sheet and Script Day labels, and the same editors the Scene Sheet uses — plus a sort order for printing.
- **Scene Sheets**: one scene at a time in a layout that matches the printed page, opened from the breakdown, the stripboard or the right-click menu. Each sub-tab remembers where you were.
- **Scene Breakdown exports** take a range of scenes instead of the whole film.
- **Reports**: the Day Out of Days, plus Shooting Plan, Cast Breakdown, Character Appearances, Location Breakdown and Script Breakdown Sheet — all printable.
- Paint the Calendar from a toolbar — Work, Hold, Travel, Holiday, and an eraser — with status badges on each day. Marking a day hold or travel sends its scenes back to the unscheduled list.
- **Calendar statuses** carry through to the Day Out of Days and the stripboard day headers, and totals show 0 rather than going blank.
- **Keyboard work**: Tab switches between the stripboard and the unscheduled list, remembering your place in each; left and right arrows jump between day headers; up and down selects one as the target for adds and pastes; and Enter on a chosen scene drops into its duration cell.
- Type a day number with scenes selected to send them all to that day.
- Double-click notes and breaks to edit them, and walk between them with the arrow keys.

**Bug fixes**
- **Dropdowns and right-click menus** stay on screen wherever you open them.
- Ribbons in the unscheduled list always fit its width.
- The end-of-day drop indicator no longer shows up twice.

**Changes**
- **Rules** can name several cast members at once, and date restrictions take several dates from a calendar.
- **Printing** can include status days.

## 2026-06-04 — Cut, paste and drag whole groups

**Features**
- **The Calendar**: drag scenes from day to day and back to the unscheduled list, with ghosts showing exactly where they'll land. Days sort by date with shooting order numbers, empty days take up no space, the unscheduled list has its own sort, and only days that have dates show up — a new day starts on today.
- **Multi-select on the stripboard** — click to select, Cmd-click to add one, Shift-click for a range, and a blue accent on everything selected. Escape clears it, and dragging a selection moves the whole group at once.
- **Cut and paste between days**: Cmd+X cuts the selection to a buffer with a running count, the cut strips fade out of their days, and Cmd+V pastes them below wherever you're pointing (the right-click menu has it too).
- Backspace sends scenes back to the unscheduled list and selects the next strip, so you can keep working down the day.
- With several scenes selected, typing a number sets all their durations at once.
- **Notes and breaks** take their own background and text colours, and can be duplicated.
- **Rules**: flag trouble before it bites — maximum hours, date restrictions, working hours, cast conflicts and scene flags — with red flags on the day headers and on the strips at fault. Deleted rules wait in the trash for 30 days.
- **The print dialog** picks which days to print, filters the cast list, stamps the export date and page numbers, and names the file after the project, version, days and timing.
- **Cast** has its own sub-tab in the Breakdown: type names straight into the grid, a new name on any row creates that member with the next Board ID, and cast fields on the stripboard and in rules autocomplete from the list.
- Deleted scenes wait in a trash for 30 days and can be restored.
- Point the app at a folder on your computer and it saves your project there as you work.
- **Page counts** can be typed straight into the stripboard, and duplicate scene numbers take letters (12A, 12B…).
- **The Schedule** is laid out like the printed page — same columns, same day headers, no grip handles.
- Right-click a row in the Breakdown grid to insert, remove or paste scenes.

**Bug fixes**
- **Undo** no longer corrupts a drag in progress.

**Changes**
- **Rules** got a makeover: grouped cards, filters by type, and a cleaner editor.

## 2026-06-03 — Projects multiply, scenes get colour

**Features**
- Keep more than one project and switch between them from the opening screen.
- **The Breakdown tab**: every scene as a row, with all the production categories as columns.
- **The unscheduled list** collapses away to give the stripboard the whole window.
- Scenes are coloured by Interior/Exterior and Day/Night, so a day's conditions read at a glance.
- **Interior/Exterior and Day/Night** are picked from dropdowns on the stripboard, and notes and breaks are edited by double-clicking them — notes run to several lines.
- Editors keep values tidy on their own: sets capitalise as you type, page counts format into eighths, and entries autocomplete.
- **Printing** runs to as many pages as it needs and comes out looking like the stripboard.
- Drag a scene and a ghost shows exactly where it will land, across days included.
