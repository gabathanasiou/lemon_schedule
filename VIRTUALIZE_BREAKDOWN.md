# Virtualize BreakdownTab Plan

Branch: `virtualize-breakdown`

## Goal

Replace `react-spreadsheet` with a custom virtualized table using `@tanstack/react-virtual` to fix lag on large projects. Only row virtualization (not column virtualization) — all columns render per visible row.

## What's Done

### Removed
- `react-spreadsheet` import and all its type references (`CellBase`, `DataEditorComponent`, `DataViewerComponent`, `ColumnIndicatorComponent`, etc.)
- `Spreadsheet` component from JSX
- Old `data` useMemo (CellBase[][] generation) + row caching logic
- `widthStyle`, `CustomColIndicator`, `CustomHeaderRow`, `CustomCornerIndicator` components
- `RowIndicator` component
- `handleChange` (took CellBase[][] — replaced by direct `commitCellValue`/`commitPhantomCell`)
- `handleCellContextMenu` (old version used DOM traversal on `<td>/<tr>` — replaced with `data-row`/`data-col` attributes)
- `editTimerRef`, `prevEditingEnabledRef` (unused after removing handleChange)
- `DeleteViewer`, `deleteSceneRef` (unused — delete button is now inline in JSX)
- Old `handleCopy`/`handleCut`/`handlePaste`/`handleClear` (they referenced `data` array — rewritten to read from `scenes` directly)
- `portalTargetRef` (replaced with just `setPortalTarget`)
- `spreadsheetRef`
- Unused `pastedContent` state
- Old Stylesheet CSS (`.Spreadsheet` classes) — replaced by inline styles

### Added
- `@tanstack/react-virtual` dependency
- Local types `CellValue`, `CellEditor`, `CellViewer` (replacing react-spreadsheet types)
- `useVirtualizer` integration with `scrollRef`
- `getColWidth` helper (maps col index → width from `colWidths.current[i+1]`)
- `totalWidth` computation
- `ROW_HEIGHT` constant
- `isCellReadOnly` — checks `readOnly`, `editingEnabled`, and column type
- `commitEdit` — moved earlier to avoid TDZ, dispatches `UPDATE_SCENE`
- `commitPhantomCell` — creates new scene when editing phantom row
- `commitCellValue` — routes to `commitEdit` or `commitPhantomCell`
- `handleCellClick` — sets active cell, handles shift+click for range selection
- `handleCellDoubleClick` — enters edit mode
- `handleCellContextMenu` — uses `[data-row]` attributes
- `isInSelection` — checks if cell falls within selection range
- `handleCut` — copy + clear cells
- `handlePaste` — parses clipboard text, dispatches batch updates
- `handleKeyDown` — arrow keys, Tab, Enter to edit, Escape to cancel, Ctrl+Enter for new scene
- `renderCellValue` — renders cell display value
- `renderCellEditor` — dispatches to correct editor based on colKey
- New virtualized grid JSX:
  - Sticky header row with column resize handles
  - Absolutely positioned virtual rows via `@tanstack/react-virtual`
  - Sticky row indicator column (first column)
  - Cell view/edit mode rendering
  - Empty state placeholder

### Updated
- Editor components updated from `DataEditorComponent<CellBase<string>>` to `CellEditor` type
- All handlers that referenced `data` (the CellBase[][] array) now read from `scenes` directly
- Column resize handles moved from `position: relative` on `<th>` to inline `position: absolute`

## What Still Needs to Be Done

### Bugs / Missing Features
1. **Scene # column sticky behavior** — The old code had `nth-child(2)` (scene number column) sticky left with `z-index: 11`. Current implementation only has the row indicator sticky. Scene number should also be sticky left on both header and body rows.
2. **`data-col` attribute on row indicator** — The row indicator div doesn't have `data-col`, so the `handleCellContextMenu` function can't determine the column when right-clicking on it (it falls back to `activeCell` if available). Either add `data-col` or it's fine as-is.
3. **Hover background on sticky columns** — Row indicator cell needs hover background when parent row is hovered. Current code uses `background: isSelected ? '#eff6ff' : 'white'` on sticky cells which doesn't change on row hover. Old CSS had `tr:hover td.Spreadsheet__header { background: #fafafa; }`. Need to add hover state tracking per row or use CSS.
4. **Phantom row cell editor** — When entering edit mode on a phantom row cell, `commitPhantomCell` creates a new scene. But the value in the EDITOR might be empty/whitespace (user hasn't typed anything yet) — the `commitPhantomCell` function checks `!value.trim()` and returns early. The editor might still show and the user has to type something, then the Enter/blur triggers commit. Need to verify this flow works.
5. **Tab/Enter behavior** — When pressing Enter to enter edit mode on a cell, the editor opens. But pressing Enter again to confirm the edit doesn't move to the next cell (like a spreadsheet normally would). Currently, Enter in the default text input commits and exits edit mode, but doesn't move to the next cell. For entity editors (EntityDropdown), the dropdown handles validation and calls `onExit` which closes the editor. This is the same behavior as before (react-spreadsheet also just exited edit mode).

### Polish
6. **Column resize handle hover** — Old CSS had `hover: background: rgba(37, 99, 235, 0.3)` on resize handles. Current inline style only sets `background: transparent`. Need to either add a CSS class or use React state for hover. Best to add a `<style>` tag or `className` with a CSS rule.
7. **Font size scaling** — Old code used inline styles with `${fontSize}` for cell heights/padding. New code uses inline `fontSize` too, which should work. But the old CSS had `height: ${Math.round(fontSize * 2.55)}px` for cells — now using `ROW_HEIGHT` directly.
8. **Touch (coarse) adjustments** — Old code had a `${IS_COARSE ? ...}` CSS section with larger cells/inputs. New code uses inline `IS_COARSE ?` checks for padding and row height. This is fine but may need visual verification.

### Testing
9. **Copy/Paste flow** — `handleCopy`, `handleCut`, `handlePaste`, `handleClear` were rewritten. Need to verify they work correctly.
10. **Import CSV** — Unchanged (handleImport still works as before).
11. **Context menu** — Need to verify right-click context menu opens at correct position with correct row/col.
12. **Column resize** — Verify resize handles work and width updates propagate correctly via `widthVersion`.
13. **Keyboard navigation** — Arrow keys, Tab, Enter, Escape all need testing.

### Cleanup
14. **Remove stale imports** — Check if `Papa`, `ContextMenu`, `DropdownSubmenu`, `AutocompleteDropdown`, `DropdownDivider`, etc. are still needed. Some may be unused now.
15. **Remove `CellViewer` type** — Currently defined at the top but only `CellEditor` is used (the `DeleteViewer` was removed, `CellViewer` is unused).

## Notes
- The `totalRows` is `scenes.length + 1` (phantom row). The `virtualizer` manages this count.
- `getColWidth(i)` uses `colWidths.current[i + 1]` because `colWidths.current[0]` is the row indicator width (offset + 1 due to old `nth-child` CSS indexing).
- `commitEdit` is the same function as before — it handles validation (pageCount, scriptDay, set, intExt, dayNight) and auto-registers entity elements.
- The render tree avoids re-rendering all cells by only rendering visible `virtualItems`. Each cell's edit/view state is local.
