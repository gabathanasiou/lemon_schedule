import React from 'react';
import { Scene, ScheduleRow, RibbonCell, RibbonRow, SceneColorPalette } from '../../types';

/** Shared render context passed from SortableRowContent to the per-row-type components. */
export interface RowRenderCtx {
  isSelected?: boolean;
  isFaded?: boolean;
  isCompact?: boolean;
  focusedRowId?: string | null;
  onRowNavigate?: (rowId: string) => void;
  ribbon?: RibbonRow[];
  colWidths?: number[];
  cellPaddingV?: number;
  cellPaddingH?: number;
  textSize?: number;
  edgePadding?: number;
  cellBorders?: 'none' | 'vertical' | 'horizontal' | 'both';
  nextDaybreakCallTime?: string;
  onUpdateNextDaybreak?: (val: string) => void;
  nextDateStr?: string;
  textEditingEnabled?: boolean;
  palette: SceneColorPalette;
  nb: { background: string; color: string };
  sel: { background: string; color: string };
  // closures / values from the parent render
  sceneData: (Scene & { computedCallTime: string; estimatedDuration: number; sheetNumber: string }) | null;
  updateRow: (updates: Partial<ScheduleRow>) => void;
  updateScene: (updates: Partial<Scene>) => void;
  updateEntityField: (field: string, val: string) => void;
  inputClass: string;
  noteBreakPadPx: string;
  fmt: (prefix: string | undefined, val: string, suffix: string | undefined) => string;
  elapsedCaption: string;
  alignTextClass: (cell: RibbonCell) => string;
  isTouchMode: boolean;
  violationBadge: React.ReactNode;
  nextViolationBadge: React.ReactNode;
  renderCellContent: (cell: RibbonCell, ci?: number) => React.ReactNode;
  renderCellFlex: (cell: RibbonCell, isLast: boolean, isLastRow: boolean, textColor: string, col?: number, gRow?: number, vSpan?: number, hSpan?: number) => React.ReactNode;
  ENTITY_FIELDS: Set<string>;
  fieldLabels: Record<string, string>;
  entityItemsMap: Record<string, { id: string; name: string }[]>;
  castItems: { id: string; name: string }[];
}
