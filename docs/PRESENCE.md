# Presence & Follow — Agent Manual

Status: **read this before touching presence** — live pointers & anchors,
follow mode, peer selection highlights, drag ghosts + soft lock, overlay cues,
the header user & presence cluster, or their transport. Split out of
`docs/COLLABORATION.md` §9 (2026-10-16); the umbrella — accounts, sharing,
rooms, stages, billing — stays there. Presence is **ephemeral**: never
persisted, never in the project JSON, never a room action.

## Wire & transport

- Ephemeral shape (built S3): Presence tracks `{ userId, clientId, name,
  avatarUrl, isGuest, view, ts }` — tracked ONCE per (re)join (identity + a
  view snapshot for late joiners). Every later view change rides
  a throttled `view` broadcast; cursors ride `cursor`, scrolls ride `scroll`,
  save pings ride `save`. Never persisted, never in the project.
- **Transport split (user bug 2026-10-12)**: Supabase caps presence calls at
  **5 per client per 30s** and SHUTS THE CHANNEL DOWN past it
  (`ClientPresenceRateLimitReached`) — so `track()` carries identity + a view
  snapshot on (re)join only, and every view change rides the throttled `view`
  broadcast, answered to each newly joined peer (debounced). The channel is a
  per-project **private** topic `project:<uuid>` with membership-only
  `realtime.messages` policies (`20261012142846_s3_realtime_presence.sql`;
  acceptance `supabase/tests/rls_s3.sql`, 15 assertions); dashboard
  requirement: Realtime → Settings → **"Allow public access" OFF**.
- **Modules** (all under `src/lib/supabase/`): `presence.ts` — wire shapes,
  parse/clamp (never trust payloads), `mergePeers` (multi-window dedupe by
  user, newest wins), stale-ts drops, coalescing throttles, the pure
  follow/scroll helpers; `presenceChannel.ts` — the transport (the local save
  bus `notifyLocalSave`/`subscribeLocalSaves` + `ProjectPresenceChannel`, the
  one channel, idempotent start/stop) and `presenceDiagnostics` (the snapshot
  the debug bridge reads); `presenceContext.tsx` — `PresenceProvider` (mounted
  inside `ProjectProvider` in `App.tsx`) owning the open project's channel,
  with the STABLE `usePresenceActions()` (publishView/follow) vs
  `usePresenceState()` (peers/followingId) context split so cursor traffic
  never re-renders the app tree.
- **Libraries considered (2026-10)**: Liveblocks / Yjs awareness (`y-presence`)
  / tldraw presence all assume a shared canvas coordinate space; none solve a
  per-user-layout DOM app, and each adds a second realtime system — the hybrid
  above is the standard pattern (Supabase's own cursor-tracking guidance is
  normalized viewport coordinates).
- Throttling: ~20/s leading + coalesced trailing send (**timer + a next-emit
  flush** — background tabs throttle `setTimeout`, which alone froze the last
  position one item behind for peers), idle-skip by quantized anchor key,
  stale-ts drops per client, 20s pointer TTL on top of presence leave.
  Multi-window: same user = one pointer, newest window wins.

## Semantic anchors

- **Semantic anchors, never raw pixels** (roadmap 236, extended 2026-10-15): a
  cursor anchor is the element under the pointer — stripboard row id, calendar
  `data-date-key`, Day Manager section, a registered grid cell, or a generic
  `dom` element key — **plus the pointer's position inside it (fx/fy ∈ 0..1)**,
  so the pointer glides Canva-style while still surviving scroll, reorder,
  zoom and window size. The chain (`src/lib/presenceAnchors.ts`) tries, in
  order: grid scope probe → row/date/day → precise `dom` anchor → nearest
  item ≤40px → viewport-relative screen fractions.
  - **Every authored control is anchored automatically** (user request: "all
    buttons everywhere"): `src/lib/presenceAutoAnchors.ts` stamps any
    `button` / `[role="button"]` / link / input that lacks an explicit key
    from its authored identity — `data-testid` → `aria-label` → `title` → its
    own text (`ui:…` keys; ONE live MutationObserver). Explicit
    `data-presence-anchor` keys always WIN; use them where a label repeats on
    one page (`ribbons:tb:*`), is per-user dynamic, or describes a surface
    (sheet fields, designer blocks/cells, nav, palettes). A label that changes
    per user derives different keys per client and the pointer hides
    (hide-don't-fake, like an unknown row id).
  - **Auto anchors are DIRECT-HIT only**: they are excluded from the ≤40px
    nearest-item snap (user report 2026-10-15: with dense toolbar anchors the
    snap grabbed the pointer from outside a button and hopped between
    neighbours — "so much more jumpy"). Snapping stays for rows/cells and the
    explicitly keyed surfaces, where it was tuned.
  - **The screenplay renderer anchors every block line** (roadmap 252): the
    shared `BlockLine` (`src/components/script/ScriptSceneScript.tsx`) stamps
    `data-presence-anchor="script:<sceneId>:block:<blockIndex>"` — the live
    scene id + the index within that scene's own blocks — so a pointer over
    script text lands per-block in EVERY surface that renders the script (the
    Script sub-tab, the Sheet/Glide scene pane), however different the two
    clients' widths, font scale and scroll are. Orphan bodies (no live scene
    match) and the diff review's toned lines stay unanchored; a closed pane
    or a scrolled-away line hides the pointer (hide, don't fake).
  - Coverage is auditable: `window.__lemonSchedule.presenceAnchorAt(x, y)`
    returns the anchor that WOULD be published at a viewport point.
- A future editable script CARET (TipTap / ProseMirror relative positions) is
  flagged, not faked with indexes; the RENDERED script block coordinate IS
  anchored (roadmap 252 — see the anchors above).

## Canvas grids

- **Canvas grids register a grid scope** (`src/lib/presenceResolvers.ts`):
  `probe(x, y)` maps a pointer to a cell → stable `rowKey` (scene id / element
  key / crew slot id) + `colKey` + indices; `locate(anchor)` maps that cell
  back with the receiver's OWN scroll/column widths/font scale (`getBounds`).
  Registered today: `breakdown-glide`, every `InlineGlideTable` instance (Day
  Manager Call Times/Crew, Precalls, the Call Sheet grids — scopes like
  `day:<sectionIndex>:times:<category>`, `callsheet:<sectionIndex>:…`) and
  `GlideGridShell` (`crew-glide`, `locations-glide`). A cell scrolled out of
  the grid's visible area is hidden, never painted over chrome.

## Visibility gates

- **Visibility gates** — a peer's pointer renders ONLY while:
  - you are on their exact PLACE: same tab, sub-tab, sub-sub mode (Day
    Manager vs Call Sheet, Crew/Locations manager vs Glide) **and Day Manager
    category tab** (`dayTab` — Overview/All/Locations/…) — and
  - you have the same DOCUMENT open on document-scoped pages (roadmap 236,
    user decision 2026-10-15): the Sheet scene, the open Reports Designer
    design, the open Ribbon Designer design. The gate compares the peer's
    view against the LOCAL published view (`usePresenceActions().getLocalView`,
    `sameViewPlace`), so it follows live scene/design switches; a missing id on
    either side falls back to the place rule. The header/toolbar pointers
    follow the same gates — nothing floats over a view the peer isn't looking
    at, and the header bubbles remain the way to jump to a colleague's place.
  Anchors that resolve off this client's viewport are hidden (no edge chips).
  Rendered script lines are anchored per block (roadmap 252, above); a future
  editable script CARET stays flagged, not faked (TipTap/ProseMirror relative
  positions are a different coordinate from the rendered block).

## Overlay cue, input glyph & pointer comfort

- **Local-overlay cue + input glyph (roadmaps 240/241, built 2026-10-15)**: two
  more ephemeral signals on the same presence channel.
  - **Overlay cue (240)**: while a peer is inside a surface only THEY can see —
    menu/dropdown/context menu/modal — their pointer tag and header
    collaborator bubble show animated dots (`PresenceDots`) instead of looking
    parked. The signal fires ONLY from the shared primitives (`Modal` /
    `DropdownMenu` / `ItemManagerDropdown` / `ContextMenu` shims,
    `DropdownPanel`, the `useDropdown` hook — never per call site) through the
    module-level hub `src/lib/localOverlaySignal.ts`: open/close EDGES + a
    6s heartbeat (paused while the window is blurred or the tab hidden) on a
    dedicated `overlay` broadcast; receivers keep the newest signal per user
    (multi-window = newest window wins) and drop it after a 12s TTL, so a
    killed tab clears without a close event. Redundant edge frames are
    skipped (a nested close re-announcing the enclosing kind) and
    equal-timestamp frames are accepted last-write-wins — two releases in the
    same millisecond once let the close edge be dropped as "stale" and the
    dots stuck until the TTL (user report 2026-10-15).
  - **Input glyph (241)**: the peer's input modality rides the CURSOR payload
    (`pointer: mouse|touch|pen`, re-sent only when it changes — one central
    pointer-event tracker, no extra traffic). The pointer renders the arrow,
    a little HAND for touch, or a pen dot; the name tag is unchanged.
  - **Pointer comfort (244, widened 2026-10-15 on user request)**: while ANY
    overlay cue is fresh — menu, dropdown, entity picker, context menu, modal —
    the peer's pointer FREEZES: incoming cursor frames are ignored
    (`freezeCursorFor`; the marker is exempt from the 20s idle TTL while the
    cue is fresh, so the dots stay on its tag). A `modal` cue additionally
    swaps the glyph to the little modal-WINDOW icon (`cursorGlyph`; menus keep
    the input-kind glyph), and on close the glyph returns to arrow/hand/pen and
    frames resume. The sender ALSO pauses publishing while its own hub reports
    any overlay (the receiver gate is the multi-window fallback). Fade: when
    the local pointer rests within 30px of a peer's marker for 2s, the marker +
    tag fade to 30% opacity (`stepCollisionDwell`, hysteresis to 60px);
    separation restores. All receiver-side and ephemeral.
  - Both are ephemeral only: never persisted, never a room action, never
    `track()`; the cue is `pointer-events-none`.

## Peer selection highlights

- **Peer selection highlights (roadmap 234, stages 1+2 built 2026-10-15)**: a
  peer's SELECTION renders in their presence colour on every matching surface
  — the cursor-anchor seam one level coarser. ONE throttled `selection`
  broadcast carries both shapes; never `track()`, never persisted, never a
  room action. `scope` names the LOGICAL surface and IS the visibility gate,
  so a highlight can never land on another day's table, another database or
  another designer canvas. Clear edges: deselect, blur, hidden document,
  unmount — and only the instance that last held a non-empty selection may
  clear (provider owner check), so closing one window never wipes another
  window's live selection; a closed window's entry is pruned by clientId on
  the next presence sync.
  - **Glide grids (stage 1)**: `{ scope, anchor, extent }` — two grid hits in
    data coordinates (stable row/column KEYS plus the sender's indices as the
    clamp fallback). `breakdown-glide`, `crew-glide`, `locations-glide`,
    `day:<sectionIndex>:times:<category>`, `callsheet:<sectionIndex>:…`. Every
    MOUNTED instance publishes its own selection (multi-window = newest window
    wins per user) and paints the peers' ones itself from its own geometry via
    Glide's native `highlightRegions` (peer-colour fill + solid ring) — one
    shared hook (`useGlidePeerSelection`), so it works in the main window AND
    in pop-out windows / portalled canvases, correct through differing scroll,
    column widths and font scale. Opt-out = no `scope` (grids inside modals,
    e.g. the crew-template editor). Manual: docs/GLIDE-BREAKDOWN.md §Peer
    selection highlights.
  - **DOM surfaces (stage 2)**: `{ scope, items }` — the stable element ids the
    surface's own DOM already wears (`data-row-id` on stripboard rows and
    Calendar cards, `data-event-key` on events-mode cards, `data-block-id` on
    Report Designer blocks plus a composite `col:<blockId>:<colIndex>` for the
    selected table column, `data-cell-id` on Ribbon Designer cells). ONE
    shared component per surface (`PeerItemOutlines`) publishes its ids and
    paints the peers' ones: ids resolve ONLY inside the window's own root
    wearing `data-presence-surface="<scope>"` (parity with the grids'
    `data-presence-grid`), so pop-outs resolve with their own geometry. Rings
    are `inset 0 0 0 2px <peer colour>` in a fixed z-30 `pointer-events-none`
    layer (the pointer/ghost z-order, below modals); a rect that is scrolled
    out of its container or under sticky chrome/menus is HIDDEN, not faked —
    the centre hit test must find the item at the top of the stack, EXCEPT
    presence chrome (peer markers, drag ghosts, the rings themselves carry
    `data-presence-chrome`), which paints over content but never counts as
    covering it: the peer's own pointer sits exactly on what they just
    clicked, and treating it as an occluder made rings flicker off a beat
    after appearing (caught by the harness's persistence check). The
    stripboard/Calendar mount per view
    mode (a strips-mode selection clears when Events is what's mounted); the
    Report Designer publishes the block OR the column (selecting a column
    clears the block) and the zone/Call-Sheet canvas keeps its own scope for
    item 212; the Ribbon Designer publishes its selected cell.
  - Vitest: the pure encode/parse/cap/key helpers on both halves
    (`src/lib/__tests__/presence.test.ts`, `glideSelection.test.ts`,
    `itemSelection.test.ts`). Two-window harness
    (`workers/rooms/test/two-window-repro.mjs`): the grid selection paints the
    peer colour on the grid canvas; the DOM selection gets one pass per
    surface — the peer resolves the ids to ITS OWN element rect, in the peer
    colour, and clears when the selecter leaves the surface.

## Peer drags — ghost + soft lock

- **Peer drags — ghost + soft lock (roadmap 235, built 2026-10-15)**: while a
  peer drags (stripboard rows/scenes/notes/breaks/daybreaks incl. multi-select,
  calendar cards, a whole day), their held items show as a translucent ghost at
  their cursor AND every other client soft-locks those items — the held
  rows/cards/day headers wear a ring in the peer's colour and refuse pickup
  (dnd `disabled` + held ids filtered out of any local drag set), the
  right-click menu refuses to open ("X is moving this" chip instead) and
  Delete/Cmd+X/cut skip them. Selecting, scrolling and field edits stay
  allowed. Transport: a dedicated `drag` broadcast of `{ surface, itemIds }`
  (capped at 50) as START/END edges + a ~5s heartbeat, TTL 12s so a killed
  tab's lock expires (degrading to last-drop-wins — never corruption);
  newest window wins. POSITION costs nothing extra: it rides the peer's
  `cursor` frames via a `drag: true` flag (the claim's edges force one frame
  with the current anchor). `surface` = `schedule` | `calendar` |
  `calendar-day`; a whole-day claim also carries the synthetic
  `day:<sectionIndex>` marker so the day header locks alongside the day's
  rows. Ghosts are `pointer-events-none`, render below modals (z-30) and only
  in the main window (parity with pointers); the stripboard ghost renders at
  ~0.5 scale so wide rows never cover the board (user ask 2026-10-15), the
  calendar stays full size. Code: wire + pure helpers
  (`parseDragPayload`/`resolveDragClaims`/`heldItemsOf`/`dayDragItemId`) in
  `src/lib/supabase/presenceDrag.ts` (re-exported by `presence.ts`; the shared
  wire readers live in `presenceWire.ts`); claim lifecycle (heartbeat, blur
  release, TTL) in `presenceContext.tsx` (`publishDrag`/`releaseDrag`,
  `useHeldItems`); the shared ghost layer `src/components/RemoteDragGhosts.tsx`
  over the shared anchor geometry (`src/lib/presencePoint.ts`) and motion model
  (`src/lib/glideMotion.ts`); lock call sites: `SortableRibbon`/`StripBlock`/
  `BoneyardBlock`, `calendar/SceneCard`/`DayCell`, `useScheduleDrag`/
  `useCalendarDrag`, `useStripboardContextMenu`, both keyboard hooks. Pure
  helpers are Vitest (`src/lib/__tests__/presence.test.ts`).

## Pointer motion

- Motion: pointers glide between positions with a **rAF glide loop inside
  `PresenceOverlay`** (exponential approach toward the anchor-resolved target,
  τ ≈ 110ms; targets refresh on a ~80ms measure tick + scroll/resize).
  The motion MODEL is shared with the peer drag ghosts
  (`src/lib/glideMotion.ts` — `glideStep`/`SMOOTH_TAU_MS`, dt clamped at 64ms).
  `prefers-reduced-motion` snaps instantly. **Do NOT go back to a CSS
  `transition` on the pointer wrapper** — the cursor feed is ~12/s, so each
  update restarted the transition mid-flight and the pointer stuttered instead
  of gliding (reported 2026-10-15; worst while anchored, where the sender's
  thinned feed also travels through the anchor mapping). Transforms are written
  per frame through refs (React state holds only the marker SET/flip), so
  re-renders never clobber the smoothed position. Pointers render BELOW modals
  (z-30 vs the kit's z-[10000]) — decided 2026-10-12.

## Follow

- **Follow**: follower applies the leader's `view` state; a "Following X" pill
  exits on any manual navigation, Esc, or clicking the pill. Every surface
  registers through ONE shared hook — `src/lib/supabase/useFollowView.ts`
  (`useFollowView`: declare the place + the lens fields; it publishes them,
  applies the peer's back, and re-applies immediately to surfaces that MOUNT
  mid-follow). Adding a future toggle or viewport = one more field entry,
  never new plumbing. **Follow completeness** also mirrors in-view state that
  does NOT change the place:
  - the **Sheet's scene / sheet number** (arrow flips, scene jumps) —
    `PresenceView.sceneId` + `sheetIndex`; the Sheet publishes both, the
    follower resolves the scene id, so a different Breakdown order still
    lands on the right scene.
  - the **stripboard View menu** (A4 width, cell borders) and the **Calendar
    Strips/Events** switch — pref-shaped `PresenceView` fields applied through
    the same setters the UI uses (they stick after unfollowing, like Figma
    keeping your last zoom). The stripboard's **ribbon layout** (the shared
    display look) is project state (`activeRibbonId`) and reaches peers
    through the S3.5 save ping, not presence.
  - the **design editing focus** (roadmap 243) — the Reports Designer's open
    design (`designId`), the Ribbon Designer's (`ribbonId`, plus its A4 width
    / cell borders), the report **Preview** (`preview`) and **Fields/Values**
    mode (`reportViewMode`): per-user prefs (roadmap 233, `src/lib/persist.ts`
    `useActiveDesignId`) that DO mirror while following — the peer's pick wins
    until you unfollow, then yours sticks.
  - the **Glide page row filter** (roadmap 172) — `glideFilter`; the follower's
    matching grid (`breakdown/glide`, `production/crew/glide`,
    `production/locations/glide`) applies the leader's query, so both see the
    same rows. Typing your own filter is scroll-like (does NOT end follow); the
    leader's next view sync re-applies. Rows your own override hides suppress
    the peer's highlight/follow anchor — never clamped onto a different row.
  - the **manager pages' selected sidebar category** (Element Manager,
    `breakdown/elements`; Crew/Locations, `production/<sub>/manager`) —
    `managerCategory`; category keys are project data (a key this client does
    not have is ignored) — plus the **Day Manager's selected day + category
    tab** and the **Call Sheet editor's day + Preview** (`daySection` /
    `dayTab` / `preview`; the day and tab resolve through the App place, so a
    follower's `go` switches both).
  - the **Script page's viewed scene** (roadmap 243) — published as the live
    scene id + scenes index and resolved back through scene NUMBERS, so a
    different doc order still lands right; the jump is rAF-deferred past the
    mount-time scroll-memory restore.
  - the **scroll position** of the stripboard, Calendar, Sheet and Glide grid —
    a separate `scroll` broadcast (~8/s, coalescing + idle skip) with SEMANTIC
    anchors (never pixels): the top-edge item's key + a 0..1 offset, sampled
    and applied by `src/lib/presenceScroll.ts` (binary search over item
    offsetTops + one calibration rect) through the surface registry that
    `usePresenceScrollSurface` wires per surface. The stripboard carries a
    coarse day-block fallback for rows outside the receiver's render window
    (land → render → re-align); the Glide grid uses its first visible cell +
    `scrollTo`. Only the main window publishes/applies surface state — popout
    instances stay out, parity with the live-pointer rule.
  - **User decisions (2026-10-12, corrected same day): scrolling yourself
    NEVER ends follow** — look around freely; there is no pause state, your
    scroll is simply your position until the leader's next scroll sample
    re-syncs you. **Any click that changes your view ENDS follow** — the
    Sheet's arrows/sheet-number, the stripboard View menu, the Calendar month
    arrows and Strips/Events switch (each calls the surface's
    `noteUserChange()` — the shared hook's wrapper over `noteUserViewChange`),
    the same rule as clicking a tab or scene; Esc and the pill end it too.
    Programmatic applies never count as a click or a user scroll (the applied
    echo is filtered — exact scrollTop for DOM surfaces, a short window for
    the canvas).

## Header user & presence cluster

**Header user & presence cluster (decided 2026-10).** The user control lives in
the AppHeader's right group, **after the undo/redo pair**
(`src/components/AppHeader.tsx:238-257` — append inside that flex group).
ONE shared component (`UserPresenceCluster`); never inline it per view.

- Signed out → a muted **Sign in** avatar button; opening it offers
  **Sign in / Create account** (the app-level AccountModal — email+password,
  plus Google/Apple when the project has them enabled).
- Signed in → the avatar (photo/initials) opens the account menu: **Settings...**
  (roadmap 256 — the account settings modal: **Profile** tab = display name, email
  sign-ups capture it at creation, OAuth sign-ups bring the provider name + photo;
  **Team** tab = the 254 roster, `TeamPanel`), **Collaborate...** (copy-up; opens
  the panel right after), **Manage Shared Project...** (the User & sharing
  panel — S2, built), **Sign out** (+ Drive connect/disconnect). The settings modal
  is ALSO opened by the Project Manager's Shared-tab account bar — the team is
  manageable with no project open. The panel is
  the `docs/COLLABORATION.md` §1 language: **Who can access**, **Permissions**,
  **Allow others to invite**, **Copy Link**, **Stop Sharing…**; on a viewer
  account it shows the people list + "Only the owner can change who has access".
  Signing out with a
  shared project open **closes it and returns to the opening page** (parity
  with Drive disconnect); a silent session expiry only locks the project
  read-only so signing back in resumes it.
- **Guests (S2.5)**: a link visitor lands signed in anonymously (no form) — the
  avatar shows their generated "Anonymous <Animal>" name with a **Create
  account...** item (converts in place: same user id, access kept), then
  **Sign out**; Collaborate waits until they have a real account.
- Presence: live collaborators render as **Canva-style live pointers** (arrow +
  name label in their deterministic colour); clicking a pointer follows that
  person (see Follow). **Header bubbles are BACK (user decision 2026-10-12 — the
  earlier "pointers only" call was superseded): stacked collaborator bubbles
  immediately LEFT of your own avatar (max 3 + a "+N" menu), each a FOLLOW
  TOGGLE — click to follow that person, click again (or Esc / navigate) to
  stop. Guest bubbles carry an amber dot / "(guest)" label; the header cluster
  keeps your own avatar as before.** At rest the bubbles form one tight
  overlapped stack; hovering or focusing the strip spreads them into full
  circles (`hover:space-x-1 focus-within:space-x-1`, 200ms, reduced-motion
  aware) so each person is fully visible and clickable (roadmap 245). Bubbles also carry the animated
  local-overlay dots while that person is inside a menu/modal the others
  cannot see (roadmap 240; the pointer tag shows the same cue while you are on
  their view). Pointers from peers on another view or
  sub-tab stay hidden until you are on their place — the bubble is how you get
  there.
- Surface shape: default to a kit `Modal` (the settings-modal pattern); a
  full page only if the modal proves too small.
- **The File menu's Google Drive sign-in MOVED into this cluster (S1)**: the
  File menu keeps project actions only (Open/New/Import/Export/Print/Trash);
  its Drive items remain ONLY when the cluster is absent (no Supabase env).
