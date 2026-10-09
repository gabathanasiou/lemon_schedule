import React, { useEffect, useRef } from 'react';
import { GridCellKind, TextCellEntry, type Item } from '@glideapps/glide-data-grid';
import { AutocompleteDropdown } from '../components/AutocompleteDropdown';
import { EntityDropdown } from '../components/EntityDropdown';
import { useCurrentDocument } from './popoutTarget';

export type GlideColumnEditor =
  | { kind: 'enum'; options: string[]; placeholder?: string }
  | {
      kind: 'entity';
      mode: 'single' | 'multi';
      displayMode?: 'id' | 'name';
      items: { id: string; name: string }[];
      placeholder?: string;
      uppercase?: boolean;
      keepAlphabetical?: boolean;
      renderItem?: (item: any, selected: boolean) => React.ReactNode;
      /** Item keys that are element-link anchors — Anchor icon in the panel. */
      anchoredKeys?: Set<string>;
      /** Fires for a committed value with no matching item (the shared
       *  "type a new value" flow) — e.g. open the Add Crew Member modal. */
      onCreateItem?: (val: string) => void;
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
        const { value: cellValue, onChange, onFinishedEditing, isHighlighted, validatedSelection } = p;
        const { cfg, align, activation, skipComma, selectAllOnOpen, portal } = box!.current as EditorBox;
        const currentVal = cellValue?.data ?? '';
        const latestRef = useRef(cellValue);

        const handleChange = (newVal: string) => {
          const next = {
            kind: GridCellKind.Text,
            data: newVal,
            displayData: newVal,
            allowOverlay: true,
          };
          latestRef.current = next;
          onChange(next);
        };
        const handleClose = () => onFinishedEditing(latestRef.current);
        const handleTabClose = () => onFinishedEditing(latestRef.current, [1, 0] as any);
        // Escape leaves the whole editing session: the dropdown closes itself
        // (useEscapeCapture) and calls this — Glide's cancel path (undefined,
        // no commit), so the cell editor box goes away with the panel.
        const handleEscape = () => onFinishedEditing(undefined, [0, 0] as any);

        if (cfg === null) {
          // Glide's OWN TextCell editor, re-wrapped with the column's
          // alignment (item 223): the cell's `contentAlign` is canvas-draw-only
          // and the stock editor ignores it, so centered/right columns would
          // edit left-aligned. Same textarea + seed-selection contract as
          // Glide's default — only `textAlign` is added (and it still lands in
          // the grid's `#portal`).
          return (
            <TextCellEntry
              style={align ? { textAlign: align } : undefined}
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
          return <AutocompleteDropdown value={currentVal} onChange={handleChange} onExit={handleClose} onTabExit={handleTabClose} onEscape={handleEscape} options={cfg.options} showAll portalTarget={portal} defaultOpen autoFocus placeholder={cfg.placeholder} autoGrow />;
        }
        if (cfg.kind === 'text') {
          // Plain text editor (Glide's own is unavailable to custom editors):
          // Enter/Tab/Escape are handled by the clip region around us. Focus +
          // select ONCE on mount — a re-rendering ref callback would re-select
          // on every keystroke and eat the typed chars.
          const apply = (raw: string) => handleChange(cfg.uppercase ? raw.toUpperCase() : raw);
          const inputRef = useRef<HTMLInputElement>(null);
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
              value={currentVal}
              style={cfg.align ? { textAlign: cfg.align } : undefined}
              onChange={e => apply(e.target.value)}
              // Enter commits like the entity dropdown (no row movement): the
              // grid canvas keeps focus so arrows keep navigating. Letting the
              // clip region handle it moved the selection and parked focus on
              // the a11y cell, killing keyboard navigation.
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  const value = latestRef.current;
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
        return <EntityDropdown value={currentVal} onChange={handleChange} onExit={handleClose} onTabExit={handleTabClose} onEscape={handleEscape} items={cfg.items} mode={cfg.mode} displayMode={cfg.displayMode} skipComma={skipComma} selectAllOnOpen={selectAllOnOpen} portalTarget={portal} defaultOpen autoFocus placeholder={cfg.placeholder} className="text-xs" uppercase={cfg.uppercase} keepAlphabetical={cfg.keepAlphabetical} renderItem={cfg.renderItem} anchoredKeys={cfg.anchoredKeys} onCreateItem={cfg.onCreateItem} autoGrow />;
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
    if (!loc || cellData.kind !== GridCellKind.Text) return undefined;
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

    const storedVal = String(getValue(row, colKey) ?? '');
    const skipComma = storedVal !== (cellData.data ?? '');
    const selectAllOnOpen = !skipComma;
    const { Editor, box } = editorFor(colKey);
    box.current = { cfg: editorCfg ?? null, align: colDef.align, activation: ++activationCounter, skipComma, selectAllOnOpen, portal: portalRef.current };
    // Plain text keeps Glide's default overlay chrome (padding); entity/enum
    // editors bring their own trigger + panel styling.
    if (!editorCfg || editorCfg.kind === 'text') return { editor: Editor };
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
