import React, { useMemo, useState } from 'react';
import { useProject } from '../../../store';
import type { Project, ReportBlock, ReportCollection, ReportTextStyle } from '../../../types';
import { getReportFieldMap } from '../../../lib/reportFields';
import type { ReportCtx } from '../../../lib/reportData';
import {
  appendToColumn, cloneBlock, duplicateBlock, duplicateBlockTo, findBlock, insertAfter, insertBefore,
  insertColumnAt, insertInto, insertTableColumnAt, makeReportBlock, moveBlock, moveBlockTo, moveColumnAt,
  moveIntoChildren, moveIntoColumn, moveIntoNewColumn, moveTableColumn, parentCategoryOf, parentCollectionOf,
  removeBlock, removeColumnAt, removeTableColumnAt, updateBlock, wrapWithColumns, duplicateIntoNewColumn,
  insertScopeFor,
} from '../../../lib/reportBlocks';
import ReportDesignerCanvas, { type ColSel } from '../../reports/ReportDesignerCanvas';
import ReportContextMenu, { type MenuState } from '../../reports/ReportContextMenu';
import { type PaletteDropPayload } from '../../reports/ReportPalette';

/**
 * Drives the REAL reports-designer canvas over the call-sheet zone's block
 * list (roadmap 10). The zone blocks are edited with every designer tool —
 * palette + canvas drag & drop, drop zones, floating block chrome, column
 * ops, right-click menus — while the surrounding template renders read-only.
 */
interface CallSheetZoneDesignerProps {
  blocks: ReportBlock[];
  onChange: (blocks: ReportBlock[]) => void;
  readOnly?: boolean;
  ctx: ReportCtx;
  pageSize?: 'portrait' | 'landscape';
  /** Selected day in scope — zone `{{tokens}}` resolve against it. */
  dayItem?: any;
}

const CONTAINER_TYPES = new Set(['repeat', 'table', 'relative']);

const CallSheetZoneDesigner: React.FC<CallSheetZoneDesignerProps> = ({ blocks, onChange, readOnly, ctx, pageSize, dayItem }) => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const fieldMap = useMemo(() => getReportFieldMap(project), [project]);
  const [selId, setSelId] = useState<string | null>(null);
  const [selCol, setSelCol] = useState<ColSel | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const selBlock = selId ? findBlock(blocks, selId)?.block ?? null : null;

  const makeFromPayload = (p: PaletteDropPayload): ReportBlock =>
    p.field
      ? makeReportBlock('text', { text: `{{${p.field}}}` })
      : makeReportBlock((p.type || 'text') as ReportBlock['type']);

  const insertAt = (id: string | null, payload: PaletteDropPayload, pos: 'after' | 'before' | 'into' | 'root') => {
    const b = makeFromPayload(payload);
    let next: ReportBlock[];
    if (pos === 'into') next = insertInto(blocks, id, b);
    else if (pos === 'before') next = id ? insertBefore(blocks, id, b) : [b, ...blocks];
    else if (id) next = insertAfter(blocks, id, b);
    else next = [...blocks, b];
    onChange(next);
    setSelId(b.id);
  };

  const zoneScope: ReportCollection = 'days';

  const canvasProps = {
    blocks,
    headerBlocks: [] as ReportBlock[],
    footerBlocks: [] as ReportBlock[],
    skipFirstHeader: false,
    skipFirstFooter: false,
    onToggleHeaderSkipFirst: () => {},
    onToggleFooterSkipFirst: () => {},
    selId,
    selCol,
    ctx,
    fieldMap,
    readOnly: !!readOnly,
    showKeys: false,
    project,
    parentCollection: zoneScope,
    rootItem: dayItem,
    onSaveTextStyles: (styles: ReportTextStyle[]) => dispatch({ type: 'SET_REPORT_TEXT_STYLES', payload: styles }),
    viewWidth: null,
    pageSize,
    bare: true,
    // One active selection at a time (like the reports designer): selecting a
    // block clears the column selection and vice-versa, so exactly ONE chrome
    // floats over the zone.
    onSelect: id => { setSelId(id); if (id) setSelCol(null); },
    onSelectCol: col => { setSelCol(col); if (col) setSelId(null); },
    onPatch: (id: string, patch: Partial<ReportBlock>) => onChange(updateBlock(blocks, id, patch)),
    onInsertAfter: (id: string | null, payload: PaletteDropPayload) => insertAt(id, payload, 'after'),
    onInsertBefore: (id: string | null, payload: PaletteDropPayload) => insertAt(id, payload, 'before'),
    onInsertInto: (id: string | null, payload: PaletteDropPayload) => insertAt(id, payload, id ? 'into' : 'root'),
    onMoveInto: (containerId: string, moveId: string) => onChange(moveIntoChildren(blocks, moveId, containerId)),
    onDuplicateInto: (containerId: string, moveId: string) => {
      const fm = findBlock(blocks, moveId);
      if (fm) onChange(insertInto(blocks, containerId, cloneBlock(fm.block)));
    },
    onMoveTo: (moveId: string, targetId: string, pos: 'before' | 'after') => onChange(moveBlockTo(blocks, moveId, targetId, pos)),
    onDuplicateTo: (moveId: string, targetId: string, pos: 'before' | 'after') => onChange(duplicateBlockTo(blocks, moveId, targetId, pos)),
    onWrap: (targetId: string, payload: PaletteDropPayload, side: 'left' | 'right') => {
      if (payload.moveId) {
        const fm = findBlock(blocks, payload.moveId);
        if (!fm) return;
        const dropped = payload.duplicate ? cloneBlock(fm.block) : fm.block;
        onChange(payload.moveId && !payload.duplicate
          ? wrapWithColumns(blocks, targetId, dropped, side, payload.moveId)
          : wrapWithColumns(blocks, targetId, dropped, side));
      } else {
        onChange(wrapWithColumns(blocks, targetId, makeFromPayload(payload), side));
      }
    },
    onInsertIntoColumn: (columnsId: string, colIndex: number, payload: PaletteDropPayload) =>
      onChange(appendToColumn(blocks, columnsId, colIndex, makeFromPayload(payload))),
    onMoveIntoColumn: (moveId: string, columnsId: string, colIndex: number) =>
      onChange(moveIntoColumn(blocks, moveId, columnsId, colIndex)),
    onDuplicateIntoColumn: (moveId: string, columnsId: string, colIndex: number) => {
      const fm = findBlock(blocks, moveId);
      if (fm) onChange(appendToColumn(blocks, columnsId, colIndex, cloneBlock(fm.block)));
    },
    onInsertNewColumn: (columnsId: string, colIndex: number, payload: PaletteDropPayload) =>
      onChange(insertColumnAt(blocks, columnsId, colIndex, makeFromPayload(payload))),
    onMoveToNewColumn: (moveId: string, columnsId: string, colIndex: number) =>
      onChange(moveIntoNewColumn(blocks, moveId, columnsId, colIndex)),
    onDuplicateToNewColumn: (moveId: string, columnsId: string, colIndex: number) =>
      onChange(duplicateIntoNewColumn(blocks, moveId, columnsId, colIndex)),
    onRemoveColumn: (columnsId: string, colIndex: number) => onChange(removeColumnAt(blocks, columnsId, colIndex)),
    onMoveColumn: (columnsId: string, from: number, to: number) => onChange(moveColumnAt(blocks, columnsId, from, to)),
    onDuplicate: (id: string) => onChange(duplicateBlock(blocks, id)),
    onRemove: (id: string) => { onChange(removeBlock(blocks, id)); if (selId === id) setSelId(null); },
    onMove: (id: string, dir: -1 | 1) => onChange(moveBlock(blocks, id, dir)),
    onMenu: (e: React.MouseEvent, id: string, colIndex?: number) => {
      setSelId(id);
      setSelCol(colIndex !== undefined ? { colsId: id, colIndex } : null);
      setMenu({ x: e.clientX, y: e.clientY, id, colIndex });
    },
    onInsertTableColumnAt: (tableId: string, colIndex: number) => onChange(insertTableColumnAt(blocks, tableId, colIndex)),
    onRemoveTableColumn: (tableId: string, colIndex: number) => onChange(removeTableColumnAt(blocks, tableId, colIndex)),
    onMoveTableColumn: (tableId: string, from: number, to: number) => onChange(moveTableColumn(blocks, tableId, from, to)),
    onInsertIntoZone: (_zone: 'header' | 'body' | 'footer', payload: PaletteDropPayload) => insertAt(null, payload, 'root'),
    editorMode: 'floating' as const,
  };

  const menuInsertScope = useMemo(() => {
    if (!menu) return null;
    const target = findBlock(blocks, menu.id)?.block ?? null;
    if (target && CONTAINER_TYPES.has(target.type)) return target.collection || null;
    return parentCollectionOf(blocks, menu.id) || null;
  }, [menu, blocks]);
  const menuInsertCategory = useMemo(() => {
    if (!menu) return undefined;
    const target = findBlock(blocks, menu.id)?.block ?? null;
    if (target && (target.collection === 'elements' || target.collection === 'cast')) return target.category;
    return parentCategoryOf(blocks, menu.id);
  }, [menu, blocks]);

  const menuSelBlock = menu ? findBlock(blocks, menu.id)?.block ?? null : null;

  return (
    <>
      <ReportDesignerCanvas {...canvasProps} />
      {menu && menuSelBlock && (
        <ReportContextMenu
          menu={menu}
          block={menuSelBlock}
          project={project}
          insertScope={menuInsertScope}
          insertCategory={menuInsertCategory}
          onClose={() => setMenu(null)}
          onChangeField={f => {
            if (menu.colIndex !== undefined && menuSelBlock.type === 'table') {
              const cols = menuSelBlock.columns || [];
              onChange(updateBlock(blocks, menu.id, { columns: cols.map((c, i) => i === menu.colIndex ? { ...c, field: f } : c) }));
            } else {
              onChange(updateBlock(blocks, menu.id, { field: f }));
            }
          }}
          onInsertAbove={() => onChange(insertBefore(blocks, menu.id, makeReportBlock('text')))}
          onInsertBelow={() => onChange(insertAfter(blocks, menu.id, makeReportBlock('text')))}
          onAddChild={() => onChange(insertInto(blocks, menu.id, makeReportBlock('text')))}
          onDuplicate={() => onChange(duplicateBlock(blocks, menu.id))}
          onRemove={() => { onChange(removeBlock(blocks, menu.id)); setSelId(null); setMenu(null); }}
          onColumnInsertAt={i => {
            if (menu.colIndex === undefined) return;
            const owner = findBlock(blocks, menu.id)?.block;
            if (owner?.type === 'table') onChange(insertTableColumnAt(blocks, menu.id, i));
            else onChange(insertColumnAt(blocks, menu.id, i, makeReportBlock('text')));
            setMenu(null);
          }}
          onColumnMove={dir => {
            if (menu.colIndex === undefined) return;
            onChange(moveTableColumn(blocks, menu.id, menu.colIndex, menu.colIndex + dir));
            setMenu(null);
          }}
          onColumnRemove={() => {
            if (menu.colIndex === undefined) return;
            const owner = findBlock(blocks, menu.id)?.block;
            if (owner?.type === 'table') onChange(removeTableColumnAt(blocks, menu.id, menu.colIndex));
            else onChange(removeColumnAt(blocks, menu.id, menu.colIndex));
            setMenu(null);
          }}
        />
      )}
    </>
  );
};

export default CallSheetZoneDesigner;
