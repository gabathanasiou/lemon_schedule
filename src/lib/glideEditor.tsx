import React, { useRef } from 'react';
import { GridCellKind, type Item } from '@glideapps/glide-data-grid';
import { AutocompleteDropdown } from '../components/AutocompleteDropdown';
import { EntityDropdown } from '../components/EntityDropdown';

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
    };

export interface GlideEditorOptions {
  readOnlyRef: React.MutableRefObject<boolean>;
  columns: { key: string }[];
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
 * configured columns. Uses the component's row-marker offset (dataCol = col - 1)
 * per Glide's provideEditor contract. Shared by the scenes and crew glides.
 *
 * The editor COMPONENT is cached per column key: a fresh identity each
 * activation made Glide remount the overlay on any re-render, losing in-progress
 * typing (e.g. pressing Shift). The per-activation config travels as props.
 */
export function createGlideCellEditor(opts: GlideEditorOptions) {
  const { readOnlyRef, columns, getValue, editors, getEditor, portalRef } = opts;
  const columnOffset = opts.columnOffset ?? 1;
  const componentCache = new Map<string, React.ComponentType<any>>();

  const editorFor = (colKey: string) => {
    let Editor = componentCache.get(colKey);
    if (!Editor) {
      Editor = (p: any) => {
        const { value: cellValue, onChange, onFinishedEditing, cfg, skipComma, portal } = p;
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

        if (cfg.kind === 'enum') {
          return <AutocompleteDropdown value={currentVal} onChange={handleChange} onExit={handleClose} onTabExit={handleTabClose} options={cfg.options} showAll positioning="fixed" portalTarget={portal} defaultOpen autoFocus placeholder={cfg.placeholder} autoGrow />;
        }
        return <EntityDropdown value={currentVal} onChange={handleChange} onExit={handleClose} onTabExit={handleTabClose} items={cfg.items} mode={cfg.mode} displayMode={cfg.displayMode} skipComma={skipComma} positioning="fixed" portalTarget={portal} defaultOpen autoFocus placeholder={cfg.placeholder} className="text-xs" uppercase={cfg.uppercase} keepAlphabetical={cfg.keepAlphabetical} renderItem={cfg.renderItem} anchoredKeys={cfg.anchoredKeys} onCreateItem={cfg.onCreateItem} autoGrow />;
      };
      componentCache.set(colKey, Editor);
    }
    return Editor;
  };

  return (cellData: any & { location?: Item }): any => {
    if (readOnlyRef.current) return undefined;
    const loc = cellData.location;
    if (!loc || cellData.kind !== GridCellKind.Text) return undefined;
    const [col, row] = loc;
    const dataCol = col - columnOffset;
    const colDef = columns[dataCol];
    if (!colDef) return undefined;
    const colKey = colDef.key;
    const editorCfg = getEditor ? getEditor(row, colKey) : editors?.[colKey];
    if (!editorCfg) return undefined;

    const storedVal = String(getValue(row, colKey) ?? '');
    const skipComma = storedVal !== (cellData.data ?? '');
    const Editor = editorFor(colKey);
    const editor = (p: any) => <Editor {...p} cfg={editorCfg} skipComma={skipComma} portal={portalRef.current} />;
    return { editor, disablePadding: true, styleOverride: { overflow: 'visible' } };
  };
}
