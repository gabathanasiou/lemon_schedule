import React from 'react';
import { Scissors, ClipboardPaste, StickyNote, Coffee, Sunset, Copy, ExternalLink, Eye, Trash2, CheckSquare, Palette, Send } from 'lucide-react';
import { ScheduleVersion, ScheduleRow } from '../../types';
import { getContainerBlock } from '../../lib/containers';
import { IS_COARSE } from '../../lib/device';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from '../ContextMenu';

export interface ScheduleContextMenuState {
  x: number;
  y: number;
  rowId: string;
  containerId: number | null;
}

interface ScheduleContextMenuProps {
  contextMenu: ScheduleContextMenuState | null;
  setContextMenu: (v: ScheduleContextMenuState | null) => void;
  version: ScheduleVersion;
  selectedRowIds: Set<string>;
  setSelectedRowIds: (v: Set<string> | ((p: Set<string>) => Set<string>)) => void;
  setLastClickedId: (id: string) => void;
  scrollToRow: (id: string) => void;
  containerIdsRef: React.MutableRefObject<Record<string, string[]>>;
  cutSelected: () => void;
  pasteClipboard: (rowId: string) => void;
  handleContextMenuAction: (action: string) => void;
  selectNextAfterRemove: (ids: Set<string>) => void;
  dispatch: (action: any) => void;
  shiftHeld: boolean;
  onOpenScene?: (sceneId: string) => void;
  onOpenSceneInPopout?: (sceneId: string) => void;
}

export default function ScheduleContextMenu({
  contextMenu, setContextMenu, version, selectedRowIds, setSelectedRowIds, setLastClickedId,
  scrollToRow, containerIdsRef, cutSelected, pasteClipboard, handleContextMenuAction,
  selectNextAfterRemove, dispatch, shiftHeld, onOpenScene, onOpenSceneInPopout,
}: ScheduleContextMenuProps) {
  return (
    <ContextMenu open={!!contextMenu} x={contextMenu?.x ?? 0} y={contextMenu?.y ?? 0} onClose={() => setContextMenu(null)}>
      {(() => {
        const row = contextMenu ? version.rows.find(r => r.id === contextMenu.rowId) : null;
        const isDummy = contextMenu?.rowId.startsWith('empty-') ?? false;
        const inClipboard = version.rows.filter(r => r.containerId === -1).length;
        if (selectedRowIds.size > 1) {
          const allInBoneyard = Array.from(selectedRowIds).every(id => {
            const r = version.rows.find(rr => rr.id === id);
            return r && getContainerBlock(r) === 'boneyard';
          });
          return (
            <>
              <ContextMenuItem onClick={() => { cutSelected(); setContextMenu(null); }} icon={<Scissors className="w-3.5 h-3.5" />}>Cut {selectedRowIds.size} to Buffer</ContextMenuItem>
              <ContextMenuDivider />
              {allInBoneyard ? (
                <ContextMenuItem variant="danger" onClick={() => {
                  const ids = Array.from(selectedRowIds).filter(id => {
                    const r = version.rows.find(rr => rr.id === id);
                    return !r?.pinned && r?.type !== 'DAYBREAK';
                  });
                  if (ids.length === 0) return;
                  const containerRows = version!.rows.filter(r => r.containerId != null && r.containerId !== -1);
                  const maxOrder = containerRows.length > 0 ? Math.max(...containerRows.map(r => r.order)) : -1;
                  const newRows = version!.rows.map(r => ids.includes(r.id) ? { ...r, containerId: 1, order: maxOrder + 1 + ids.indexOf(r.id) } : r);
                  dispatch({ type: 'UPDATE_VERSION', payload: { id: version!.id, rows: newRows } });
                  selectNextAfterRemove(new Set(ids as string[]));
                  setContextMenu(null);
                }} icon={<Send className="w-3.5 h-3.5" />}>
                  Send {selectedRowIds.size} to Stripboard
                </ContextMenuItem>
              ) : (
                <ContextMenuItem variant="danger" onClick={() => {
                  const ids = Array.from(selectedRowIds).filter(id => {
                    const r = version.rows.find(rr => rr.id === id);
                    return !r?.pinned;
                  });
                  if (ids.length === 0) return;
                  const newRows = version!.rows.map(r => ids.includes(r.id) ? { ...r, containerId: null, order: 999999 } : r);
                  dispatch({ type: 'UPDATE_VERSION', payload: { id: version!.id, rows: newRows } });
                  selectNextAfterRemove(new Set(ids as string[]));
                  setContextMenu(null);
                }} icon={<Trash2 className="w-3.5 h-3.5" />}>
                  Remove {selectedRowIds.size} Ribbons
                </ContextMenuItem>
              )}
            </>
          );
        }
        return (
          <>
            {!isDummy && (
              <>
            <ContextMenuItem onClick={() => {
              const isBoneyard = row ? getContainerBlock(row) === 'boneyard' : false;
              const ids = isBoneyard ? containerIdsRef.current.boneyard : containerIdsRef.current.stripboard;
              if (ids.length > 0) {
                setSelectedRowIds(new Set(ids));
                setLastClickedId(ids[0]);
                scrollToRow(ids[0]);
              }
              setContextMenu(null);
            }} icon={<CheckSquare className="w-3.5 h-3.5" />}>Select All</ContextMenuItem>
            <ContextMenuDivider />
              </>
            )}
            {inClipboard > 0 && (
              <>
                <ContextMenuItem onClick={() => { pasteClipboard(contextMenu!.rowId); setContextMenu(null); }} icon={<ClipboardPaste className="w-3.5 h-3.5" />}>Paste Below ({inClipboard})</ContextMenuItem>
                <ContextMenuDivider />
              </>
            )}
            {row && !row.pinned && (
              <>
                <ContextMenuItem onClick={() => { cutSelected(); setContextMenu(null); }} icon={<Scissors className="w-3.5 h-3.5" />}>Cut to Buffer</ContextMenuItem>
                <ContextMenuDivider />
              </>
            )}
            <ContextMenuItem onClick={() => handleContextMenuAction('add_note')} icon={<StickyNote className="w-3.5 h-3.5" />}>Add Note Below</ContextMenuItem>
            <ContextMenuItem onClick={() => handleContextMenuAction('add_break')} icon={<Coffee className="w-3.5 h-3.5" />}>Add Break Below</ContextMenuItem>
            <ContextMenuItem onClick={() => handleContextMenuAction('add_daybreak')} icon={<Sunset className="w-3.5 h-3.5" />}>Add Day Break Below</ContextMenuItem>
            {row && !row.pinned && <ContextMenuDivider />}
            {row?.type === 'SCENE' && (
              <>
                <ContextMenuItem onClick={() => handleContextMenuAction('duplicate')} icon={<Copy className="w-3.5 h-3.5" />}>Duplicate</ContextMenuItem>
                <ContextMenuDivider />
                {!IS_COARSE && shiftHeld && onOpenSceneInPopout ? (
                  <ContextMenuItem onClick={() => { if (row.sceneId && onOpenSceneInPopout) onOpenSceneInPopout(row.sceneId); setContextMenu(null); }} icon={<ExternalLink className="w-3.5 h-3.5" />}>Open in New Window</ContextMenuItem>
                ) : (
                  <ContextMenuItem onClick={() => { if (row.sceneId && onOpenScene) onOpenScene(row.sceneId); setContextMenu(null); }} icon={<Eye className="w-3.5 h-3.5" />}>Open Sheet</ContextMenuItem>
                )}
            {row && getContainerBlock(row) === 'stripboard' && (
              <>
                <ContextMenuDivider />
                <ContextMenuItem onClick={() => handleContextMenuAction('boneyard')} icon={<Trash2 className="w-3.5 h-3.5" />}>Send to Boneyard</ContextMenuItem>
              </>
            )}
          </>
        )}
            {(row?.type === 'NOTE' || row?.type === 'BREAK' || row?.type === 'DAYBREAK') && (
              <>
                {row?.type === 'NOTE' && (
                  <>
                    <ContextMenuItem onClick={() => handleContextMenuAction('duplicate_note')} icon={<Copy className="w-3.5 h-3.5" />}>Duplicate Note</ContextMenuItem>
                    <ContextMenuItem onClick={() => handleContextMenuAction('change_color')} icon={<Palette className="w-3.5 h-3.5" />}>Edit Banner</ContextMenuItem>
                  </>
                )}
                {row?.type === 'BREAK' && (
                  <ContextMenuItem onClick={() => handleContextMenuAction('duplicate_break')} icon={<Copy className="w-3.5 h-3.5" />}>Duplicate Break</ContextMenuItem>
                )}
                {(row?.type === 'NOTE' || row?.type === 'BREAK') && <ContextMenuDivider />}
            {row && row?.type !== 'DAYBREAK' && getContainerBlock(row) === 'stripboard' && (
                  <ContextMenuItem onClick={() => handleContextMenuAction('boneyard')} icon={<Trash2 className="w-3.5 h-3.5" />}>Send to Boneyard</ContextMenuItem>
                )}
                {!row?.pinned && (
                  <ContextMenuItem onClick={() => handleContextMenuAction('delete')} variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />}>Delete</ContextMenuItem>
                )}
              </>
            )}
          </>
        );
      })()}
    </ContextMenu>
  );
}
