import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { GridCellKind, TextCellEntry, type Item } from '@glideapps/glide-data-grid';
import { AutocompleteDropdown } from '../components/AutocompleteDropdown';
import { EntityDropdown, type EntityItem } from '../components/EntityDropdown';
import TimeKeypad from '../components/TimeKeypad';
import { useCurrentDocument } from './popoutTarget';
import { useTouchMode } from './useMarquee';

export type GlideColumnEditor =
  | { kind: 'enum'; options: string[]; placeholder?: string }
  | {
      kind: 'entity';
      mode: 'single' | 'multi';
      displayMode?: 'id' | 'name';
      items: { id: string; name: string; group?: string }[];
      placeholder?: string;
      uppercase?: boolean;
      keepAlphabetical?: boolean;
      renderItem?: (item: any, selected: boolean) => React.ReactNode;
      /** Fields the search box matches. Defaults to id+name; add 'group' to
       *  match the dropdown group header (e.g. a location type). */
      searchFields?: ('id' | 'name' | 'group')[];
      /** Item keys that are element-link anchors — Anchor icon in the panel. */
      anchoredKeys?: Set<string>;
      /** Custom ordering (wins over `keepAlphabetical`) — e.g. pin an action
       *  row like "Add new location…" above the alphabetized entities. */
      sortItems?: (items: EntityItem[], selectedIds: string[]) => EntityItem[];
      /** Fires for a committed value with no matching item (the shared
       *  "type a new value" flow) — e.g. open the Add Crew Member modal. */
      onCreateItem?: (val: string) => void;
      /** Grouped panels: `open` (default) or `accordion` (folded groups). */
      browse?: 'open' | 'accordion';
      /** Seed the editor with this value instead of the cell's display text —
       *  an id-keyed picker whose cell renders a NAME still opens on the row. */
      seedValue?: string;
      /** ID-keyed catalogue: show the item NAME in the editing text (commits
       *  still carry the id). */
      resolveEditing?: boolean;
      /** Strict palette (I/E, D/N): no "Add …" create row. */
      allowFreeText?: boolean;
    }
  | {
      /** Plain text cell with optional live uppercase (e.g. crew names). */
      kind: 'text';
      uppercase?: boolean;
      placeholder?: string;
      /** Overlay text alignment. Defaults to the column's `align` when the
       *  column is configured through `GlideEditorOptions.columns` — Glide's
       *  default TextCell editor ignores the cell's `contentAlign`, so
       *  centered/right text columns get THIS editor to match (item 223). */
      align?: 'left' | 'center' | 'right';
    }
  | {
      /** Time/duration expression cell (call times, precalls, crew calls).
       *  Desktop = the stock text editor; touch = the shared TimeKeypad, so
       *  grid cells open the SAME `: + - h m` modal as TimeField. */
      kind: 'time';
      placeholder?: string;
      align?: 'left' | 'center' | 'right';
    };

export interface GlideEditorOptions {
  readOnlyRef: React.MutableRefObject<boolean>;
  columns: { key: string; align?: 'left' | 'center' | 'right' }[];
  /** Reads the stored cell value for a grid row (used for skipComma semantics). */
  getValue: (row: number, colKey: string) => string;
  /** Per-column editor config; columns without an entry use Glide's default text editor. */
  editors?: Record<string, GlideColumnEditor>;
  /** Per-(row,column) editor config — wins over `editors`. Use when the editor
   *  options depend on the row (e.g. a crew slot's person list is its role's
   *  roster). Return null/undefined for the default text editor. */
  getEditor?: (row: number, colKey: string) => GlideColumnEditor | undefined | null;
  portalRef: React.MutableRefObject<HTMLElement | null>;
  /** Offset from Glide's reported column to the data column. Grids with a row
   *  marker use 1 (default); grids without one use 0. */
  columnOffset?: number;
}

/**
 * Builds Glide's provideEditor callback: inline enum/entity dropdowns for the
 * configured columns. Uses the component's row-marker offset
 * (dataCol = col - columnOffset) per Glide's provideEditor contract. Shared by
 * the scenes and crew glides.
 *
 * `getOpts` is read lazily on every call, and ONE component instance per column
 * key is cached for the life of the returned callback. The caller builds the
 * callback ONCE (memoized with no deps) and keeps the mutable config in a ref —
 * recreating the callback on a config change would create a new editor
 * component type and REMOUNT an open overlay, discarding in-progress typing
 * (page re-renders recreated it per keystroke/Shift press).
 *
 * The per-activation config travels through a per-column box the component
 * reads at render time (identity never changes, so a re-render during typing
 * cannot remount the overlay and re-fire select-on-open).
 */
export function createGlideCellEditor(getOpts: () => GlideEditorOptions | null) {
  interface EditorBox {
    /** null = Glide's stock TextCellEntry, aligned to `align` (item 223). */
    cfg: GlideColumnEditor | null;
    /** Column alignment — styles the stock entry / a configured text editor. */
    align?: 'left' | 'center' | 'right';
    /** Monotonic per-activation id — the same Editor component instance is
     *  REUSED across overlay sessions, so mount-only effects can't re-run. */
    activation: number;
    skipComma: boolean;
    /** False when Glide opened the overlay BY the first typed key (`cellData`
     *  already differs from the stored value) — the editor must not select the
     *  typed char, or the next keystroke replaces it. */
    selectAllOnOpen: boolean;
    portal: HTMLElement | null;
    /** Seed for the editor's value when the cell's `data` is not a string
     *  (the kit's painted `kit-picker` cell carries the stored value on
     *  `seedValue` while the canvas paints a display name). */
    seed?: string;
    /** The overlay was opened on a painted picker cell. Keep the temp cell
     *  CUSTOM while typing — flipping Custom→Text on the first keystroke
     *  remounts the overlay and re-opens it on the next key. */
    customPicker?: boolean;
  }
  const boxes = new Map<string, { current: EditorBox | null }>();
  const components = new Map<string, React.ComponentType<any>>();
  let activationCounter = 0;

  const editorFor = (colKey: string) => {
    let box = boxes.get(colKey);
    if (!box) {
      box = { current: null };
      boxes.set(colKey, box);
    }
    let Editor = components.get(colKey);
    if (!Editor) {
      Editor = (p: any) => {
        const { value: cellValue, onChange, onFinishedEditing, isHighlighted, validatedSelection, initialValue } = p;
        const { cfg, align, activation, skipComma, selectAllOnOpen, portal, seed, customPicker } = box!.current as EditorBox;
        const isTouch = useTouchMode();
        // Type-to-open on a painted picker: Glide leaves a CUSTOM cell's data
        // untouched (a TEXT cell's data is replaced by the typed key), so the
        // first character seeds the editor itself. The typed key must not be
        // SELECTED on open, or the next keystroke replaces it ("MARY" → "ARY").
        const openedByKey = initialValue !== undefined;
        const selectOnOpen = selectAllOnOpen && !openedByKey;
        const skipLeadingComma = skipComma || openedByKey;
        const currentVal = openedByKey && seed !== undefined
          ? String(initialValue)
          : seed ?? cellValue?.data ?? '';
        // Glide seeds its overlay temp value with the typed key that OPENED
        // the editor (edit-on-type rewrites the TEXT cell's data). That seed
        // is a search query, not a value: an outside click would commit the
        // first typed key even when the picker rejects it. Picker editors
        // only commit through their own onChange.
        const isPicker = cfg !== null && (cfg.kind === 'entity' || cfg.kind === 'enum');
        useLayoutEffect(() => {
          if (isPicker) onChange(undefined as any);
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [activation]);
        // Only a value the editor actually COMMITTED (onChange) may close the
        // cell edit. The editing seed is NOT a value: a strict picker
        // (`allowFreeText: false` — I/E, D/N, crew role, categories) rejects
        // text outside its catalogue, and committing the seed on close would
        // write the first typed key into the cell anyway.
        const latestRef = useRef<{ activation: number; cell: any } | null>(null);
        const committedCell = () =>
          latestRef.current?.activation === activation ? latestRef.current.cell : undefined;

        const handleChange = (newVal: string) => {
          const next = {
            kind: GridCellKind.Text,
            data: newVal,
            displayData: newVal,
            allowOverlay: true,
          };
          latestRef.current = { activation, cell: next };
          if (customPicker && cellValue?.kind === GridCellKind.Custom) {
            // Stay on the SAME custom cell kind while typing (see EditorBox).
            const data = (cellValue.data ?? {}) as Record<string, unknown>;
            onChange({ ...cellValue, copyData: newVal, data: { ...data, value: newVal } });
          } else {
            onChange(next);
          }
        };
        // A free-text SINGLE picker (Set, a new cast name) treats the key that
        // opened the cell as its value — typing one char and leaving keeps it.
        // Strict catalogues never do: their seed is only a search query.
        const seedIsValue = openedByKey
          && cfg !== null && cfg.kind === 'entity' && cfg.mode === 'single' && cfg.allowFreeText !== false;
        const seedCell = () => ({ kind: GridCellKind.Text, data: currentVal, displayData: currentVal, allowOverlay: true });
        const closeCell = () => committedCell() ?? (seedIsValue ? seedCell() : undefined);
        const handleClose = () => onFinishedEditing(closeCell());
        const handleTabClose = () => onFinishedEditing(closeCell(), [1, 0] as any);
        // Escape leaves the whole editing session: the dropdown closes itself
        // (useEscapeCapture) and calls this — Glide's cancel path (undefined,
        // no commit), so the cell editor box goes away with the panel.
        const handleEscape = () => onFinishedEditing(undefined, [0, 0] as any);

        if (cfg === null || (cfg.kind === 'time' && !isTouch)) {
          // Glide's OWN TextCell editor, re-wrapped with the column's
          // alignment (item 223): the cell's `contentAlign` is canvas-draw-only
          // and the stock editor ignores it, so centered/right columns would
          // edit left-aligned. Same textarea + seed-selection contract as
          // Glide's default — only `textAlign` is added (and it still lands in
          // the grid's `#portal`). Time cells keep this on desktop; touch
          // opens the shared keypad below.
          const textAlign = cfg?.kind === 'time' ? cfg.align : align;
          return (
            <TextCellEntry
              style={textAlign ? { textAlign } : undefined}
              highlight={isHighlighted}
              autoFocus={cellValue?.readonly !== true}
              disabled={cellValue?.readonly === true}
              altNewline
              value={currentVal}
              validatedSelection={validatedSelection}
              onChange={e => handleChange(e.target.value)}
            />
          );
        }
        if (cfg.kind === 'enum') {
          // `initialValue` is the character that OPENED the overlay (Glide
          // handles that first key itself — no input event ever fires), so the
          // picker must take it as its search query or the first letter is
          // silently lost and the list opens on its first row. `selectAllOnOpen`
          // false keeps that character out of the next keystroke's way.
          return <AutocompleteDropdown value={currentVal} initialQuery={initialValue} selectAllOnOpen={selectOnOpen} onChange={handleChange} onExit={handleClose} onTabExit={handleTabClose} onEscape={handleEscape} options={cfg.options} showAll portalTarget={portal} defaultOpen autoFocus placeholder={cfg.placeholder} autoGrow />;
        }
        if (cfg.kind === 'text') {
          // Plain text editor (Glide's own is unavailable to custom editors):
          // Enter/Tab/Escape are handled by the clip region around us. Focus +
          // select ONCE on mount — a re-rendering ref callback would re-select
          // on every keystroke and eat the typed chars.
          const inputRef = useRef<HTMLInputElement>(null);
          /** Live uppercase rewrites the controlled value; the browser then
           *  parks the caret at the end. Remember where the user was and put
           *  it back after the re-render (mid-name edits stay put). */
          const caretRef = useRef<number | null>(null);
          const apply = (raw: string, caret: number | null) => {
            caretRef.current = caret;
            handleChange(cfg.uppercase ? raw.toUpperCase() : raw);
          };
          // The typed key that OPENED the cell is seeded raw ('m'); render and
          // commit it in the column's case so a one-key edit doesn't look (or
          // save) lowercase until the next keystroke.
          const textValue = cfg.uppercase ? currentVal.toUpperCase() : currentVal;
          useLayoutEffect(() => {
            const el = inputRef.current;
            const pos = caretRef.current;
            if (!el || pos == null) return;
            caretRef.current = null;
            el.setSelectionRange(pos, pos);
          });
          useEffect(() => {
            const el = inputRef.current;
            if (!el) return;
            el.focus();
            if (selectAllOnOpen) el.select();
            else el.setSelectionRange(el.value.length, el.value.length);
            // eslint-disable-next-line react-hooks/exhaustive-deps
          }, [activation]);
          return (
            <input
              ref={inputRef}
              className="gdg-input"
              value={textValue}
              style={cfg.align ? { textAlign: cfg.align } : undefined}
              onChange={e => apply(e.target.value, e.target.selectionStart)}
              // Enter commits like the entity dropdown (no row movement): the
              // grid canvas keeps focus so arrows keep navigating. Letting the
              // clip region handle it moved the selection and parked focus on
              // the a11y cell, killing keyboard navigation.
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  // The typed key that OPENED a text cell never fires an input
                  // event, so the seed IS the value (range fill relies on it).
                  const value = committedCell() ?? { ...seedCell(), data: textValue, displayData: textValue };
                  window.setTimeout(() => onFinishedEditing(value), 0);
                }
              }}
              // Glide's canvas/a11y focus churn can pull focus off the editor
              // right after it opens (seen on the trailing add row) — take it
              // back while the editor is still mounted. If the user clicked
              // elsewhere the editor unmounts first, so this never fights a
              // deliberate outside interaction.
              onBlur={() => {
                const reclaim = () => {
                  const el = inputRef.current;
                  if (!el || !document.contains(el) || document.activeElement === el) return;
                  const active = document.activeElement as HTMLElement | null;
                  if (active && (active.matches('td[role="gridcell"], canvas') || active === document.body)) el.focus();
                };
                requestAnimationFrame(reclaim);
                window.setTimeout(reclaim, 80);
              }}
              placeholder={cfg.placeholder}
            />
          );
        }
        if (cfg.kind === 'time') {
          // Touch (desktop returned above): open the shared time keypad on the
          // cell. Commit closes the Glide edit through the normal path.
          return (
            <TimeKeypad
              key={activation}
              value={currentVal}
              onCommit={v => { handleChange(v); handleClose(); }}
              onCancel={handleEscape}
              portalTarget={portal}
            />
          );
        }
        return <EntityDropdown value={cfg.seedValue ?? currentVal} initialQuery={initialValue} resolveEditing={cfg.resolveEditing} allowFreeText={cfg.allowFreeText} onChange={handleChange} onExit={handleClose} onTabExit={handleTabClose} onEscape={handleEscape} items={cfg.items} mode={cfg.mode} displayMode={cfg.displayMode} skipComma={skipLeadingComma} selectAllOnOpen={selectOnOpen} portalTarget={portal} defaultOpen autoFocus placeholder={cfg.placeholder} uppercase={cfg.uppercase} keepAlphabetical={cfg.keepAlphabetical} sortItems={cfg.sortItems} searchFields={cfg.searchFields} renderItem={cfg.renderItem} anchoredKeys={cfg.anchoredKeys} onCreateItem={cfg.onCreateItem} browse={cfg.browse} autoGrow style={{ height: '100%', display: 'flex', alignItems: 'center' }} />;
      };
      components.set(colKey, Editor);
    }
    return { Editor, box };
  };

  return (cellData: any & { location?: Item }): any => {
    const opts = getOpts();
    if (!opts) return undefined;
    const { readOnlyRef, columns, getValue, editors, getEditor, portalRef } = opts;
    const columnOffset = opts.columnOffset ?? 1;
    if (readOnlyRef.current) return undefined;
    const loc = cellData.location;
    // Text cells use the configured editor; the kit's painted picker cell is
    // the CLOSED face of the same picker (the chevron lane opens this overlay).
    const isKitPicker = cellData.kind === GridCellKind.Custom
      && (cellData.data as { kind?: string } | undefined)?.kind === 'kit-picker';
    if (!loc || (cellData.kind !== GridCellKind.Text && !isKitPicker)) return undefined;
    const [col, row] = loc;
    const dataCol = col - columnOffset;
    const colDef = columns[dataCol];
    if (!colDef) return undefined;
    const colKey = colDef.key;
    let editorCfg = getEditor ? getEditor(row, colKey) : editors?.[colKey];
    // A configured text editor inherits its column's alignment unless it
    // overrides it.
    if (editorCfg?.kind === 'text' && editorCfg.align === undefined && colDef.align) {
      editorCfg = { ...editorCfg, align: colDef.align };
    }
    // Centered/right text columns with no configured editor get the stock
    // Glide entry re-styled (`cfg: null`): its default editor ignores the
    // cell's `contentAlign`, so the overlay text would sit left while the
    // committed value renders aligned (item 223).
    const alignedStock = !editorCfg && (colDef.align === 'center' || colDef.align === 'right');
    if (!editorCfg && !alignedStock) return undefined;

    const seed = isKitPicker
      ? String((cellData.data as { seedValue?: string; value?: string }).seedValue
        ?? (cellData.data as { value?: string }).value ?? '')
      : undefined;
    const cellText = seed ?? String(cellData.data ?? '');
    const storedVal = String(getValue(row, colKey) ?? '');
    const skipComma = storedVal !== cellText;
    const selectAllOnOpen = !skipComma;
    const { Editor, box } = editorFor(colKey);
    box.current = { cfg: editorCfg ?? null, align: colDef.align, activation: ++activationCounter, skipComma, selectAllOnOpen, portal: portalRef.current, seed, customPicker: isKitPicker };
    // Plain text (and time, whose desktop arm IS the stock text entry) keeps
    // Glide's default overlay chrome (padding); entity/enum editors bring
    // their own trigger + panel styling.
    if (!editorCfg || editorCfg.kind === 'text' || editorCfg.kind === 'time') return { editor: Editor };
    return { editor: Editor, disablePadding: true, styleOverride: { overflow: 'visible' } };
  };
}

/**
 * Escape while a Glide cell editor is open cancels JUST the edit. A modal's
 * Escape listener (Radix, document capture) would close the enclosing dialog
 * before Glide's own overlay handler sees the key — so this window-capture
 * interceptor marks the event `preventDefault`ed while an editor is open
 * (Radix skips dismissal for handled events) and lets it continue to the
 * overlay, where Glide's native Escape path cancels the edit without
 * committing. With no editor open it stays silent and Esc behaves as before.
 *
 * Registered at grid mount, so it runs before the dropdowns' own
 * window-capture interceptors (mounted with the overlay) — entity dropdowns
 * still close themselves via their `onEscape`.
 * Spread the returned handlers onto the grid's DataEditor.
 */
export function useGlideEscapeCancel(): {
  onCellActivated: () => void;
  onFinishedEditing: () => void;
} {
  const currentDocument = useCurrentDocument();
  const openRef = useRef(false);
  useEffect(() => {
    const doc = currentDocument ?? document;
    const win = doc.defaultView;
    if (!win) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !openRef.current) return;
      e.preventDefault();
    };
    win.addEventListener('keydown', onKey, { capture: true });
    return () => win.removeEventListener('keydown', onKey, { capture: true });
  }, [currentDocument]);
  return {
    onCellActivated: () => { openRef.current = true; },
    onFinishedEditing: () => { openRef.current = false; },
  };
}
