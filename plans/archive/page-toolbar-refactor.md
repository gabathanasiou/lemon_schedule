# Plan: Unified `PageToolbar` Component

## Summary

Rename `MiniTab` → `PageToolbar` and generalize it into the **single toolbar component** for all pages. Replace every inline toolbar div in the app with `<PageToolbar>`. Every toolbar gets horizontal scroll + fade indicators for free.

---

## 1. Rename & Generalize `MiniTab.tsx` → `PageToolbar.tsx`

**File:** `src/components/MiniTab.tsx` → rename to `src/components/PageToolbar.tsx`

### 1a. Rename types

| Old | New |
|---|---|
| `MiniTabItem` | `ToolbarTab` |
| `MiniTabProps` | `PageToolbarProps` |
| `MiniTab` (component) | `PageToolbar` (component) |

### 1b. Updated `PageToolbarProps`

```tsx
interface ToolbarTab {
  id: string;
  label: string;
}

interface PageToolbarProps {
  // Tabs (optional — omit for pages with no sub-tabs)
  tabs?: ToolbarTab[];
  activeTab?: string;
  onChange?: (id: string) => void;
  onPopout?: (tabId: string) => void;
  shiftHeld?: boolean;

  // Content slots
  children?: React.ReactNode;       // Renders between tabs and rightContent
  rightContent?: React.ReactNode;   // Right side (portal target, buttons, etc.)

  // Layout
  justify?: 'between' | 'end' | 'start';  // default 'between'
  theme?: 'light' | 'dark';                // default 'light'
}
```

### 1c. Rendering logic

Outer div gets `overflow-x-auto` + hidden scrollbar + `WebkitMaskImage`/`maskImage` fade (already implemented). Inner flex div uses `justify-*` from prop.

```
Structure:

<div ref={scrollRef} onScroll={checkScroll}
     className="overflow-x-auto border-b shrink-0 {barTheme} [&::-webkit-scrollbar]:hidden"
     style={{ scrollbarWidth:'none', WebkitMaskImage:scrollMask, maskImage:scrollMask }}>
  <div className="flex items-center gap-2 shrink-0 w-fit min-w-full px-3 pt-2 pb-2 {justifyClass}">
    {tabs && (
      <div className="flex items-center gap-1 shrink-0">
        {tabs.map(tab => <button ...>{tab.label}</button>)}
      </div>
    )}
    {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    {rightContent && <div className="flex items-center gap-2 shrink-0">{rightContent}</div>}
  </div>
  {/* context menu unchanged */}
</div>
```

`justify` map: `'between'` → `justify-between`, `'end'` → `justify-end`, `'start'` → `justify-start`.

### 1d. Conditional tabs rendering

- If `tabs` is `undefined`/empty → don't render tabs section
- If `activeTab` or `onChange` is `undefined` but `tabs` is provided → don't crash; treat as display-only (like popout decorative tabs)
- Context menu and shift+click popout logic gated behind `tabs`/`onPopout` existence

### 1e. Scroll + fade (already present, no changes)

```tsx
const scrollRef = React.useRef<HTMLDivElement>(null);
const [scrollMask, setScrollMask] = React.useState('none');
const checkScroll = React.useCallback(() => { /* same logic */ }, []);
React.useEffect(() => { /* mount + resize listener */ }, [checkScroll]);
```

---

## 2. Update Existing Callers (import rename only)

These files already use `<MiniTab>` — only the import path and component name change. No prop changes needed (all new props are optional).

### 2a. `src/components/BreakdownTab.tsx:4,39`

```
- import MiniTab from './MiniTab';
+ import PageToolbar from './PageToolbar';

- <MiniTab
+ <PageToolbar
    tabs={[...]}
    activeTab={subTab}
    onChange={...}
    onPopout={onToggleSubPopout}
    shiftHeld={shiftHeld}
    rightContent={<div ref={el => ...} />}
  />
```

### 2b. `src/components/DesignTab.tsx:2,25`

```
- import MiniTab from './MiniTab';
+ import PageToolbar from './PageToolbar';

- <MiniTab
+ <PageToolbar
    theme="dark"
    tabs={[...]}
    activeTab={subTab}
    onChange={onSubTabChange}
    onPopout={onToggleSubPopout}
    shiftHeld={shiftHeld}
    rightContent={<div ref={setPortalTarget} />}
  />
```

### 2c. `src/components/ReportsTab.tsx:8,55`

```
- import MiniTab from './MiniTab';
+ import PageToolbar from './PageToolbar';

- <MiniTab
+ <PageToolbar
    theme="dark"
    tabs={[...]}
    activeTab={subTab}
    onChange={onSubTabChange}
    onPopout={onToggleSubPopout}
    shiftHeld={shiftHeld}
    rightContent={onPrint ? <button>Print</button> : undefined}
  />
```

---

## 3. Update Popout Windows (`src/App.tsx`)

### 3a. Import rename

```
- import MiniTab from './components/MiniTab';
+ import PageToolbar from './components/PageToolbar';
```

### 3b. 6 popout `<MiniTab>` instances → `<PageToolbar>` (import rename only)

Lines: 887, 903, 919, 935, 952, 969 — no prop changes.

### 3c. Convert `sub_reports_elementBreakdown` popout (line 1035) from inline toolbar → `<PageToolbar>`

**Current (line 1035-1044):**
```tsx
<div className="flex items-center justify-between px-3 pt-2 pb-2 border-b shrink-0 bg-zinc-900 border-zinc-800">
  <span className="px-3 py-1.5 text-xs font-semibold rounded-b-md text-white bg-zinc-950">Element Breakdown</span>
  <div className="flex items-center gap-2">
    <button onClick={...} className="..."><Printer /> Print</button>
    <div ref={el => ...} className="flex items-center gap-2" />
  </div>
</div>
```

**Replace with:**
```tsx
<PageToolbar
  theme="dark"
  tabs={[{ id: 'elementBreakdown', label: 'Element Breakdown' }]}
  activeTab="elementBreakdown"
  onChange={() => {}}
  rightContent={
    <div className="flex items-center gap-2">
      <button onClick={...} className="..."><Printer /> Print</button>
      <div ref={el => ...} className="flex items-center gap-2" />
    </div>
  }
/>
```

---

## 4. Convert ScheduleTab Inline Toolbar

**File:** `src/components/ScheduleTab.tsx:1555-1704`

### 4a. Add import

```tsx
import PageToolbar from './PageToolbar';
```

### 4b. Current structure (lines 1555-1704):

```tsx
<div className="flex items-center justify-end px-3 pt-2 pb-2 border-b shrink-0 bg-white border-zinc-200">
  <div className="flex items-center gap-2">
    {selectionSummary && <span>...</span>}
    {bufferSummary && <span>...</span>}
    <span>{productionSections.length} days</span>
    <div className="w-px h-4 bg-zinc-200" />
    <button onClick={handleDeleteAllDaybreaks}>Clear</button>
    <DropdownMenu trigger={<button>Auto</button>}>...</DropdownMenu>
    <DropdownMenu trigger={<button>Sort</button>}>...</DropdownMenu>
    <div className="w-px h-4 bg-zinc-200" />
    <DropdownMenu trigger={<button>View</button>}>...</DropdownMenu>
    <button onClick={() => ...}>Flag</button>
    <button onClick={() => ...}>Help</button>
    <button onClick={() => ...}>Edit</button>
    {onPrint && <button onClick={onPrint}>Print</button>}
  </div>
</div>
```

### 4c. Replace with:

```tsx
<PageToolbar theme="light" justify="end">
  {selectionSummary && <span>...</span>}
  {bufferSummary && <span>...</span>}
  <span>{productionSections.length} days</span>
  <div className="w-px h-4 bg-zinc-200" />
  <button onClick={handleDeleteAllDaybreaks}>Clear</button>
  <DropdownMenu trigger={<button>Auto</button>}>...</DropdownMenu>
  <DropdownMenu trigger={<button>Sort</button>}>...</DropdownMenu>
  <div className="w-px h-4 bg-zinc-200" />
  <DropdownMenu trigger={<button>View</button>}>...</DropdownMenu>
  <button onClick={() => ...}>Flag</button>
  <button onClick={() => ...}>Help</button>
  <button onClick={() => ...}>Edit</button>
  {onPrint && <button onClick={onPrint}>Print</button>}
</PageToolbar>
```

**Changes:**
- Wrapping `<div>` + inner `<div>` removed
- All toolbar controls become direct `children` of `<PageToolbar>`
- `justify="end"` pushes everything to the right (matches current behavior)
- `theme="light"` (white bg, matches current `bg-white border-zinc-200`)
- Cloud project coloring: ScheduleTab already imports `useIsCloudProject` — `PageToolbar` handles the `bg-blue-950` override internally via its own `useIsCloudProject()` hook

---

## 5. Convert CalendarTab Inline Toolbars

**File:** `src/components/CalendarTab.tsx:1306-1394`

### 5a. Add import

```tsx
import PageToolbar from './PageToolbar';
```

### 5b. Row 1 (month nav + date + controls) — lines 1306-1378

**Current:**
```tsx
<div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 bg-white">
  <div className="flex items-center gap-3">
    <button onClick={goPrev}><ChevronLeft /></button>
    <h2 className="font-semibold text-sm">{monthName}</h2>
    <button onClick={goNext}><ChevronRight /></button>
    <span className="text-zinc-400">|</span>
    <span className="text-[10px] font-semibold text-zinc-500">START</span>
    <input type="date" value={startDate} onChange={...} ... />
  </div>
  <div className="flex items-center gap-3">
    <button onClick={openAutoDayOff}>Days Off</button>
    <DropdownMenu trigger={<button>View</button>}>...</DropdownMenu>
  </div>
</div>
```

**Replace with:**
```tsx
<PageToolbar theme="light" justify="between">
  <div className="flex items-center gap-3">
    <button onClick={goPrev}><ChevronLeft /></button>
    <h2 className="font-semibold text-sm">{monthName}</h2>
    <button onClick={goNext}><ChevronRight /></button>
    <span className="text-zinc-400">|</span>
    <span className="text-[10px] font-semibold text-zinc-500">START</span>
    <input type="date" value={startDate} onChange={...} ... />
  </div>
</PageToolbar>
```

Wait — row 1 has both left content (nav) AND right content (Days Off + View). Need to split into `children` + `rightContent`:

```tsx
<PageToolbar theme="light" justify="between"
  children={
    <div className="flex items-center gap-3">
      <button onClick={goPrev}><ChevronLeft /></button>
      <h2 className="font-semibold text-sm">{monthName}</h2>
      <button onClick={goNext}><ChevronRight /></button>
      <span className="text-zinc-400">|</span>
      <span className="text-[10px] font-semibold text-zinc-500">START</span>
      <input type="date" value={startDate} onChange={...} ... />
    </div>
  }
  rightContent={
    <div className="flex items-center gap-3">
      <button onClick={openAutoDayOff}>Days Off</button>
      <DropdownMenu trigger={<button>View</button>}>...</DropdownMenu>
    </div>
  }
/>
```

Note: The wrapping `<div>` around each side's content is necessary to keep items grouped (preserving `gap-3` between them vs using PageToolbar's `gap-2` between slots).

### 5c. Row 2 (tool selector buttons) — lines 1379-1394

**Current:**
```tsx
<div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-200 bg-white">
  {TOOLS.map(t => (
    <button key={t.key || 'none'} onClick={...} className="...">
      {t.label}
    </button>
  ))}
</div>
```

**Replace with:**
```tsx
<PageToolbar theme="light" justify="start">
  {TOOLS.map(t => (
    <button key={t.key || 'none'} onClick={...} className="...">
      {t.label}
    </button>
  ))}
</PageToolbar>
```

---

## 6. Update AGENTS.md

### 6a. Rename section header and component reference

```
### MiniTab Component (`src/components/MiniTab.tsx`)
```
→
```
### PageToolbar Component (`src/components/PageToolbar.tsx`)
```

### 6b. Update description

"A reusable sub-tab bar used in Breakdown, Design, and Reports tabs."
→
"A reusable page toolbar with optional sub-tabs. Used by all pages for their top toolbar bar. Supports horizontal scroll with fade indicators when content overflows."

### 6c. Update props table

Add new props and mark `tabs`, `activeTab`, `onChange` as optional:

| Prop | Type | Description |
|---|---|---|
| `tabs` | `{ id, label }[]` (optional) | Tab items. Omit for pages without sub-tabs. |
| `activeTab` | `string` (optional) | Currently active tab id |
| `onChange` | `(id: string) => void` (optional) | Tab switch handler |
| `children` | `ReactNode` (optional) | Content between tabs and rightContent |
| `rightContent` | `ReactNode` (optional) | Controls on the right side |
| `justify` | `'between' \| 'end' \| 'start'` | Flex justification. Default `'between'` |
| `theme` | `'light' \| 'dark'` | Default `'light'` |
| `onPopout` | `(tabId: string) => void` | Pop-out handler |
| `shiftHeld` | `boolean` | Whether Shift key is held |

### 6d. Update bar styling section

Replace truncation line:
```
**Truncation**: tab buttons use `truncate max-w-[160px]` — labels overflow with ellipsis.
```
→
```
**Scroll**: Tab buttons use `shrink-0 whitespace-nowrap`. When content overflows, the entire toolbar scrolls horizontally with hidden scrollbar and fade indicators at the edges (12px gradient mask).
```

### 6e. Update usages section

```
**Usages:**
- `BreakdownTab` — `theme="light"`, tabs: Sheet / Element Manager / Glide Breakdown
- `DesignTab` — `theme="dark"`, tabs: Ribbon Designer / Colors
- `ReportsTab` — `theme="dark"`, tabs: Day Out of Days / Element Breakdown
```
→
```
**Usages:**
- `BreakdownTab` — `theme="light"`, tabs: Sheet / Element Manager / Glide Breakdown
- `DesignTab` — `theme="dark"`, tabs: Ribbon Designer / Colors
- `ReportsTab` — `theme="dark"`, tabs: Day Out of Days / Element Breakdown
- `ScheduleTab` — `theme="light" justify="end"`, no tabs, all toolbar controls as children
- `CalendarTab` — two instances: `theme="light" justify="between"` (month nav) + `theme="light" justify="start"` (tool selector)
```

### 6f. Rename portal pattern section

"### MiniTab Header Portal Pattern" → "### PageToolbar Header Portal Pattern"

Replace all `MiniTab` mentions with `PageToolbar` in the section body.

### 6g. Rename Cloud Project Coloring section

"### Cloud Project Coloring (MiniTab & Portaled Controls)" → "### Cloud Project Coloring (PageToolbar & Portaled Controls)"

Replace `MiniTab` → `PageToolbar` in body.

---

## 7. Verification Checklist

- [ ] `npm run lint` passes (zero errors)
- [ ] Visual check: BreakdownTab toolbar scrolls with fade indicators when narrow
- [ ] Visual check: DesignTab dark toolbar scrolls with fade indicators when narrow
- [ ] Visual check: ReportsTab dark toolbar scrolls with fade indicators when narrow
- [ ] Visual check: ScheduleTab toolbar scrolls with fade indicators when narrow
- [ ] Visual check: CalendarTab both toolbars scroll with fade indicators when narrow
- [ ] Visual check: Popout windows inherit scroll + fade behavior automatically
- [ ] Cloud project: light-themed PageToolbars show `bg-blue-950` styling
- [ ] Tab popout context menus still work (shift+click, right-click)
- [ ] Portal pattern still works (controls render in toolbar in Breakdown/Design)
- [ ] No inline `<div className="flex items-center justify-... border-b shrink-0 bg-...">` toolbar divs remain in the codebase

---

## 8. Files Changed (Summary)

| File | Change |
|---|---|
| `src/components/MiniTab.tsx` | **Renamed** to `PageToolbar.tsx`. Props generalized, tabs made optional, `justify`/`children` added |
| `src/App.tsx` | Import rename. 6 `<MiniTab>` → `<PageToolbar>`. Convert 1 inline toolbar → `<PageToolbar>` |
| `src/components/BreakdownTab.tsx` | Import rename. 1 `<MiniTab>` → `<PageToolbar>` |
| `src/components/DesignTab.tsx` | Import rename. 1 `<MiniTab>` → `<PageToolbar>` |
| `src/components/ReportsTab.tsx` | Import rename. 1 `<MiniTab>` → `<PageToolbar>` |
| `src/components/ScheduleTab.tsx` | Add import. Replace inline toolbar div with `<PageToolbar>` |
| `src/components/CalendarTab.tsx` | Add import. Replace 2 inline toolbar divs with `<PageToolbar>` |
| `AGENTS.md` | Rename all `MiniTab` references to `PageToolbar`. Update docs for new props and behavior |
