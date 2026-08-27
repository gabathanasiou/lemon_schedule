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
    };

export interface GlideEditorOptions {
  readOnlyRef: React.MutableRefObject<boolean>;
  columns: { key: string }[];
  /** Reads the stored cell value for a grid row (used for skipComma semantics). */
  getValue: (row: number, colKey: string) => string;
  /** Per-column editor config; columns without an entry use Glide's default text editor. */
  editors: Record<string, GlideColumnEditor>;
  portalRef: React.MutableRefObject<HTMLElement | null>;
}

/**
 * Builds Glide's provideEditor callback: inline enum/entity dropdowns for the
 * configured columns. Uses the component's row-marker offset (dataCol = col - 1)
 * per Glide's provideEditor contract. Shared by the scenes and crew glides.
 */
export function createGlideCellEditor(opts: GlideEditorOptions) {
  const { readOnlyRef, columns, getValue, editors, portalRef } = opts;

  return (cellData: any & { location?: Item }): any => {
    if (readOnlyRef.current) return undefined;
    const loc = cellData.location;
    if (!loc || cellData.kind !== GridCellKind.Text) return undefined;
    const [col, row] = loc;
    const dataCol = col - 1;
    const colDef = columns[dataCol];
    if (!colDef) return undefined;
    const colKey = colDef.key;
    const editorCfg = editors[colKey];
    if (!editorCfg) return undefined;

    const storedVal = String(getValue(row, colKey) ?? '');
    const skipComma = storedVal !== (cellData.data ?? '');

    const editor = (p: any) => {
      const { value: cellValue, onChange, onFinishedEditing } = p;
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

      const handleClose = () => {
        onFinishedEditing(latestRef.current);
      };

      const handleTabClose = () => {
        onFinishedEditing(latestRef.current, [1, 0] as any);
      };

      if (editorCfg.kind === 'enum') {
        return <AutocompleteDropdown value={currentVal} onChange={handleChange} onExit={handleClose} onTabExit={handleTabClose} options={editorCfg.options} showAll positioning="fixed" portalTarget={portalRef.current} defaultOpen autoFocus placeholder={editorCfg.placeholder} />;
      }
      const cfg = editorCfg;
      return <EntityDropdown value={currentVal} onChange={handleChange} onExit={handleClose} onTabExit={handleTabClose} items={cfg.items} mode={cfg.mode} displayMode={cfg.displayMode} skipComma={skipComma} positioning="fixed" portalTarget={portalRef.current} defaultOpen autoFocus placeholder={cfg.placeholder} className="text-xs" uppercase={cfg.uppercase} keepAlphabetical={cfg.keepAlphabetical} renderItem={cfg.renderItem} anchoredKeys={cfg.anchoredKeys} />;
    };
    return { editor, disablePadding: true, styleOverride: { overflow: 'visible' } };
  };
}
