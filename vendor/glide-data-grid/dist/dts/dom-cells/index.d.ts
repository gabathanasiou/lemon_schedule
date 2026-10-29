import * as React from "react";
import type { DataEditorRef } from "../data-editor/data-editor.js";
import type { DataEditorAllProps } from "../data-editor-all.js";

export interface DomCellEntry {
    node: React.ReactNode;
    /** The box is click-through: only the node's own pointer-events:auto
     *  descendants capture (keeps the canvas selectable underneath). */
    passthrough?: boolean;
    /** Edge-to-edge: no 4px inset, no vertical centring — the node fills the
     *  whole cell (a full-cell button / hit target). */
    bleed?: boolean;
}

export type GetDomCell = (col: number, row: number) => DomCellEntry | React.ReactNode | null | false;

export interface DomCellEditorProps extends DataEditorAllProps {
    /** Real React control to mount over a cell; null/false = none. */
    getDomCell?: GetDomCell;
    /** Real React control to mount over a column HEADER; null/false = none.
     *  `col` is the data column (row-marker excluded). */
    getDomHeaderCell?: (col: number) => React.ReactNode | null | false;
    /** Extra class on each pinned box. */
    domCellClassName?: string;
    /** Px at the bottom covered by a sticky row (the trailing add row): the
     *  body bands end there, so boxes never float on the add row. */
    domCellBottomInset?: number;
}

/** DataEditor + a real DOM layer pinned over requested cells. */
export declare const DataEditorWithDomCells: React.ForwardRefExoticComponent<
    DomCellEditorProps & React.RefAttributes<DataEditorRef>
>;
