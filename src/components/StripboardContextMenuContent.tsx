import React from 'react';
import { ScheduleRow } from '../types';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import { Scissors, ClipboardPaste, StickyNote, Coffee, Copy, Eye, Trash2, Palette, ExternalLink, Send } from 'lucide-react';

import { IS_COARSE } from '../lib/device';

export const StripboardContextMenuContent: React.FC<{
  contextMenu: { x: number; y: number; rowId: string; containerId: number | null };
  setContextMenu: (v: null) => void;
  augmentedRows: ScheduleRow[];
  selectedRowIds: Set<string>;
  inClipboard: number;
  cutSelected: () => void;
  pasteClipboard: (targetRowId: string) => void;
  handleContextMenuAction: (action: string) => void;
  onOpenScene?: (sceneId: string) => void;
  onOpenSceneInPopout?: (sceneId: string) => void;
  shiftHeld?: boolean;
  dispatch: React.Dispatch<any>;
  activeVersion: any;
  selectNextAfterRemove?: (ids: Set<string>) => void;
  extraItems?: React.ReactNode;
  containerRef?: React.RefObject<HTMLElement>;
}> = ({
  contextMenu,
  setContextMenu,
  augmentedRows,
  selectedRowIds,
  inClipboard,
  cutSelected,
  pasteClipboard,
  handleContextMenuAction,
  onOpenScene,
  onOpenSceneInPopout,
  shiftHeld,
  dispatch,
  activeVersion,
  selectNextAfterRemove,
  extraItems,
  containerRef,
}) => {
  const row = augmentedRows.find(r => r.id === contextMenu.rowId);

  return (
    <ContextMenu open={true} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} containerRef={containerRef}>
         {selectedRowIds.size > 1 ? (() => {
            const allInBoneyard = Array.from(selectedRowIds).every(id => {
              const r = activeVersion!.rows.find(rr => rr.id === id);
              return r && r.containerId == null;
            });
            return (
            <>
              <ContextMenuItem onClick={() => { cutSelected(); setContextMenu(null); }} icon={<Scissors className="w-3.5 h-3.5" />}>Cut {selectedRowIds.size} to Buffer</ContextMenuItem>
              <ContextMenuDivider />
              {allInBoneyard ? (
                <ContextMenuItem variant="danger" onClick={() => {
                  const ids = Array.from(selectedRowIds).filter(id => {
                    const r = activeVersion.rows.find(rr => rr.id === id);
                    return !r?.pinned && r?.type !== 'DAYBREAK';
                  });
                  if (ids.length === 0) return;
                  const containerRows = activeVersion!.rows.filter((r: ScheduleRow) => r.containerId != null && r.containerId !== -1);
                  const maxOrder = containerRows.length > 0 ? Math.max(...containerRows.map(r => r.order)) : -1;
                  const newRows = activeVersion!.rows.map((r: ScheduleRow) => ids.includes(r.id) ? { ...r, containerId: 1, order: maxOrder + 1 + ids.indexOf(r.id) } : r);
                  dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion!.id, rows: newRows } });
                  selectNextAfterRemove?.(new Set(ids as string[]));
                  setContextMenu(null);
                }} icon={<Send className="w-3.5 h-3.5" />}>
                  Send {selectedRowIds.size} to Stripboard
                </ContextMenuItem>
              ) : (
                <ContextMenuItem variant="danger" onClick={() => {
                  const ids = Array.from(selectedRowIds);
                  const newRows = activeVersion!.rows.map((r: ScheduleRow) => ids.includes(r.id) ? { ...r, containerId: null, order: 999999 } : r);
                  dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion!.id, rows: newRows } });
                  selectNextAfterRemove?.(new Set(ids as string[]));
                  setContextMenu(null);
                }} icon={<Trash2 className="w-3.5 h-3.5" />}>
                  Remove {selectedRowIds.size} Ribbons
                </ContextMenuItem>
              )}
            </>
            );
          })() : (
        <>
          {inClipboard > 0 && (
            <>
              <ContextMenuItem onClick={() => { pasteClipboard(contextMenu.rowId); setContextMenu(null); }} icon={<ClipboardPaste className="w-3.5 h-3.5" />}>Paste Below ({inClipboard})</ContextMenuItem>
              <ContextMenuDivider />
            </>
          )}
          {row && (
            <>
              <ContextMenuItem onClick={() => { cutSelected(); setContextMenu(null); }} icon={<Scissors className="w-3.5 h-3.5" />}>Cut to Buffer</ContextMenuItem>
              <ContextMenuDivider />
            </>
          )}
          <ContextMenuItem onClick={() => { handleContextMenuAction('add_note'); }} icon={<StickyNote className="w-3.5 h-3.5" />}>Add Note Below</ContextMenuItem>
          <ContextMenuItem onClick={() => { handleContextMenuAction('add_break'); }} icon={<Coffee className="w-3.5 h-3.5" />}>Add Break Below</ContextMenuItem>
          {row && <ContextMenuDivider />}
          {row?.type === 'SCENE' && (
            <>
              <ContextMenuItem onClick={() => { handleContextMenuAction('duplicate'); }} icon={<Copy className="w-3.5 h-3.5" />}>Duplicate (Ghost Scene)</ContextMenuItem>
              <ContextMenuDivider />
              {!IS_COARSE && shiftHeld && onOpenSceneInPopout ? (
                <ContextMenuItem onClick={() => { if (row.sceneId && onOpenSceneInPopout) onOpenSceneInPopout(row.sceneId); setContextMenu(null); }} icon={<ExternalLink className="w-3.5 h-3.5" />}>Open in New Window</ContextMenuItem>
              ) : (
                <ContextMenuItem onClick={() => { if (row.sceneId && onOpenScene) onOpenScene(row.sceneId); setContextMenu(null); }} icon={<Eye className="w-3.5 h-3.5" />}>Open Sheet</ContextMenuItem>
              )}
              <ContextMenuDivider />
              {row?.containerId != null && (
                <ContextMenuItem onClick={() => { handleContextMenuAction('boneyard'); }} icon={<Trash2 className="w-3.5 h-3.5" />}>Send to Boneyard</ContextMenuItem>
              )}
            </>
          )}
          {(row?.type === 'NOTE' || row?.type === 'BREAK' || row?.type === 'DAYBREAK') && (
            <>
              {row?.type === 'NOTE' && (
                <>
                  <ContextMenuItem onClick={() => { handleContextMenuAction('duplicate_note'); }} icon={<Copy className="w-3.5 h-3.5" />}>Duplicate Note</ContextMenuItem>
                  <ContextMenuItem onClick={() => { handleContextMenuAction('change_color'); }} icon={<Palette className="w-3.5 h-3.5" />}>Edit Banner</ContextMenuItem>
                </>
              )}
              {row?.type === 'BREAK' && (
                <ContextMenuItem onClick={() => { handleContextMenuAction('duplicate_break'); }} icon={<Copy className="w-3.5 h-3.5" />}>Duplicate Break</ContextMenuItem>
              )}
              {row?.type === 'DAYBREAK' && (
                <ContextMenuItem onClick={() => { handleContextMenuAction('duplicate_daybreak'); }} icon={<Copy className="w-3.5 h-3.5" />}>Duplicate Daybreak</ContextMenuItem>
              )}
              <ContextMenuDivider />
              {row?.type !== 'DAYBREAK' && row?.containerId != null && (
                <ContextMenuItem onClick={() => { handleContextMenuAction('boneyard'); }} icon={<Trash2 className="w-3.5 h-3.5" />}>Send to Boneyard</ContextMenuItem>
              )}
              <ContextMenuItem onClick={() => { handleContextMenuAction('delete'); }} variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />}>Delete</ContextMenuItem>
            </>
          )}
        </>
      )}
      {extraItems && <ContextMenuDivider />}
      {extraItems}
    </ContextMenu>
  );
};
