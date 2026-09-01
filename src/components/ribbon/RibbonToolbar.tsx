import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, ArrowRightLeft, ChevronDown, AlignLeft, AlignCenter, AlignRight, PanelTop, Equal, PanelBottom, WrapText, X, Eye, Ellipsis } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import Button from '../Button';
import { RibbonRow, RibbonCell } from '../../types';
import { getAlign } from '../../lib/ribbonUtils';

/* Kit `Button` recipes preserving the toolbar's dark-bordered look while
   letting the kit's coarse sizing (padding/font) drive the size — no fixed
   heights/fonts, so the designer toolbar scales with the global coarse knob. */
const BTN = 'rounded !bg-zinc-800 !border !border-zinc-700 !disabled:opacity-30 flex items-center transition-colors';
const BTN_LABEL = `${BTN} !text-zinc-300 hover:!bg-zinc-700`;
const BTN_LABEL_DANGER = `${BTN} !text-zinc-300 hover:!bg-red-950/50`;
const BTN_MOVE = `${BTN} !text-zinc-400 hover:!bg-zinc-700 !disabled:opacity-25`;
const BTN_CHANGE = `${BTN} !text-zinc-300 hover:!bg-zinc-700`;
const BTN_ICON = 'rounded !border flex items-center justify-center !disabled:opacity-25 transition-colors';
const BTN_ICON_ACTIVE = '!bg-blue-900/50 !border-blue-700 !text-blue-300';
const BTN_ICON_INACTIVE = '!bg-zinc-800 !border-zinc-700 !text-zinc-500 hover:!bg-zinc-700';
const BTN_X = 'rounded !border !border-zinc-700 !bg-zinc-800 !text-zinc-400 hover:!bg-zinc-700 hover:!text-zinc-200 !disabled:opacity-25 flex items-center justify-center transition-colors';

/**
 * Live number input for toolbar numeric fields. Commits clamped values on
 * every change (live preview), but keeps a free-typed draft while focused so
 * the user can type digits one at a time or clear the box before typing
 * (a clamped controlled input snaps on the first keystroke). Enter/blur
 * clamps + finalizes; Escape reverts to the committed value.
 */
function LiveNumberInput({ value, min, max, fallback, onCommit, readOnly, ariaLabel, className }: {
  value: number | undefined;
  min: number;
  max: number;
  fallback: number;
  onCommit: (v: number) => void;
  readOnly: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const focusedRef = useRef(false);
  useEffect(() => { if (!focusedRef.current) setDraft(null); }, [value]);
  const display = draft !== null ? draft : String(value ?? fallback);
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <input
      type="number"
      aria-label={ariaLabel}
      value={display}
      onFocus={() => { focusedRef.current = true; }}
      onChange={e => {
        const raw = e.target.value;
        setDraft(raw);
        const n = parseInt(raw, 10);
        if (raw !== '' && !Number.isNaN(n)) onCommit(clamp(n));
      }}
      onBlur={() => {
        focusedRef.current = false;
        if (draft === null) return;
        const n = parseInt(draft, 10);
        if (Number.isNaN(n)) {
          setDraft(null);
        } else {
          onCommit(clamp(n));
          setDraft(null);
        }
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setDraft(null); (e.target as HTMLInputElement).blur(); }
      }}
      readOnly={readOnly}
      className={className}
    />
  );
}

export interface SelCellRef {
  row: RibbonRow;
  ci: number;
  cell: RibbonCell;
}

interface RibbonToolbarProps {
  readOnly: boolean;
  selCell: SelCellRef | null;
  selId: string | null;
  numCols: number;
  rows: RibbonRow[];
  onAddColumn: (ci: number) => void;
  removeColumn: (ci: number) => void;
  addRow: () => void;
  removeRow: (rowId: string) => void;
  swapCellsAllRows: (a: number, b: number) => void;
  moveRow: (rowId: string, dir: number) => void;
  copyFromAbove: (cellId: string) => void;
  copyFromBelow: (cellId: string) => void;
  copyFromLeft: (cellId: string) => void;
  copyFromRight: (cellId: string) => void;
  setAlign: (cellId: string, align: 'left' | 'center' | 'right' | undefined) => void;
  setVerticalAlign: (cellId: string, va: 'top' | 'middle' | 'bottom' | undefined) => void;
  setOverflow: (cellId: string, mode: 'truncate' | 'wrap' | 'none' | 'visible') => void;
  setTextContent: (cellId: string, text: string) => void;
  setAffix: (cellId: string, which: 'prefix' | 'suffix', value: string) => void;
  onOpenFieldMenu: (e: React.MouseEvent) => void;
  dispatch: (action: any) => void;
  designId: string;
  cellPaddingV?: number;
  cellPaddingH?: number;
  textSize?: number;
  edgePadding?: number;
  setTextSizeOffset?: (cellId: string, offset: number | undefined) => void;
}

export default function RibbonToolbar(props: RibbonToolbarProps) {
  const {
    readOnly, selCell, selId, numCols, rows,
    onAddColumn, removeColumn, addRow, removeRow, swapCellsAllRows, moveRow,
    copyFromAbove, copyFromBelow, copyFromLeft, copyFromRight,
    setAlign, setVerticalAlign, setOverflow, setTextContent, setAffix,
    onOpenFieldMenu, dispatch, designId, cellPaddingV, cellPaddingH, textSize, edgePadding,
    setTextSizeOffset,
  } = props;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg mb-4 divide-y divide-zinc-800 select-none min-w-max" onClick={e => e.stopPropagation()}>
      {/* Structure */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
        <span className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider shrink-0 w-16">Structure</span>
        <Tooltip content="Add Column After">
          <Button theme="dark" onClick={() => selCell && onAddColumn(selCell.ci)} disabled={readOnly || !selCell}
            className={BTN_LABEL}>
            <Plus className="w-3 h-3" /> Column
          </Button>
        </Tooltip>
        <Tooltip content="Delete Column">
          <Button theme="dark" onClick={() => selCell && removeColumn(selCell.ci)} disabled={readOnly || !selCell || numCols <= 1}
            className={BTN_LABEL_DANGER}>
            <Trash2 className="w-3 h-3" /> Column
          </Button>
        </Tooltip>
        <div className="w-px h-5 bg-zinc-700 mx-0.5" />
        <Tooltip content="Add Row">
          <Button theme="dark" onClick={() => selCell && addRow()} disabled={readOnly || !selCell}
            className={BTN_LABEL}>
            <Plus className="w-3 h-3" /> Row
          </Button>
        </Tooltip>
        <Tooltip content="Delete Row">
          <Button theme="dark" onClick={() => selCell && removeRow(selCell.row.id)} disabled={readOnly || !selCell || rows.length <= 1}
            className={BTN_LABEL_DANGER}>
            <Trash2 className="w-3 h-3" /> Row
          </Button>
        </Tooltip>
        <div className="w-px h-5 bg-zinc-700 mx-0.5" />
        <Tooltip content="Move Column Left">
          <Button theme="dark" onClick={() => selCell && swapCellsAllRows(selCell.ci, selCell.ci - 1)} disabled={readOnly || !selCell || selCell.ci === 0}
            className={BTN_MOVE}>
            <ArrowLeft className="w-2.5 h-2.5" /> Move
          </Button>
        </Tooltip>
        <Tooltip content="Move Column Right">
          <Button theme="dark" onClick={() => selCell && swapCellsAllRows(selCell.ci, selCell.ci + 1)} disabled={readOnly || !selCell || (selCell && selCell.ci >= numCols - 1)}
            className={BTN_MOVE}>
            <ArrowRight className="w-2.5 h-2.5" /> Move
          </Button>
        </Tooltip>
        <Tooltip content="Move Row Up">
          <Button theme="dark" onClick={() => selCell && moveRow(selCell.row.id, -1)} disabled={readOnly || !selCell || rows.findIndex(r => r.id === selCell.row.id) <= 0}
            className={BTN_MOVE}>
            <ArrowUp className="w-2.5 h-2.5" /> Move
          </Button>
        </Tooltip>
        <Tooltip content="Move Row Down">
          <Button theme="dark" onClick={() => selCell && moveRow(selCell.row.id, 1)} disabled={readOnly || !selCell || rows.findIndex(r => r.id === selCell.row.id) >= rows.length - 1}
            className={BTN_MOVE}>
            <ArrowDown className="w-2.5 h-2.5" /> Move
          </Button>
        </Tooltip>
      </div>
      {/* Cell */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
        <span className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider shrink-0 w-16">Cell</span>
        <Tooltip content="Change Field">
          <Button theme="dark"
            onClick={onOpenFieldMenu}
            disabled={readOnly || !selCell}
            className={BTN_CHANGE}>
            <ArrowRightLeft className="w-3 h-3" /> Change
            <ChevronDown className="w-3 h-3 text-zinc-500 ml-0.5" />
          </Button>
        </Tooltip>
        <div className="w-px h-5 bg-zinc-700 mx-0.5" />
        <Tooltip content="Copy field from row above">
          <Button theme="dark" onClick={() => selCell && copyFromAbove(selCell.cell.id)} disabled={readOnly || !selCell || rows.findIndex(r => r.id === selCell.row.id) <= 0}
            className={BTN_MOVE}>
            <ArrowDown className="w-2.5 h-2.5" /> Above
          </Button>
        </Tooltip>
        <Tooltip content="Copy field from row below">
          <Button theme="dark" onClick={() => selCell && copyFromBelow(selCell.cell.id)} disabled={readOnly || !selCell || rows.findIndex(r => r.id === selCell.row.id) >= rows.length - 1}
            className={BTN_MOVE}>
            <ArrowUp className="w-2.5 h-2.5" /> Below
          </Button>
        </Tooltip>
        <Tooltip content="Copy field from column left">
          <Button theme="dark" onClick={() => selCell && copyFromLeft(selCell.cell.id)} disabled={readOnly || !selCell || selCell.ci <= 0}
            className={BTN_MOVE}>
            <ArrowLeft className="w-2.5 h-2.5" /> Left
          </Button>
        </Tooltip>
        <Tooltip content="Copy field from column right">
          <Button theme="dark" onClick={() => selCell && copyFromRight(selCell.cell.id)} disabled={readOnly || !selCell || (selCell && selCell.ci >= selCell.row.cells.length - 1)}
            className={BTN_MOVE}>
            <ArrowRight className="w-2.5 h-2.5" /> Right
          </Button>
        </Tooltip>
      </div>
      {/* Cell Style */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
        <span className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider shrink-0 w-16">Style</span>
        {(['left', 'center', 'right'] as const).map(a => {
          const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
          const active = selCell?.cell.align === a || (!selCell?.cell.align && getAlign(selCell?.cell) === a);
          const label = a === 'left' ? 'Align Left' : a === 'center' ? 'Align Center' : 'Align Right';
          return (
            <Tooltip key={a} content={label}>
              <Button theme="dark"
                onClick={() => selCell && setAlign(selId!, active ? undefined : a)}
                disabled={readOnly || !selCell}
                className={`${BTN_ICON} ${active ? BTN_ICON_ACTIVE : BTN_ICON_INACTIVE}`}>
                <Icon className="w-3 h-3 shrink-0" />
              </Button>
            </Tooltip>
          );
        })}
        <div className="w-px h-5 bg-zinc-700 mx-0.5" />
        {(['top', 'middle', 'bottom'] as const).map(va => {
          const Icon = va === 'top' ? PanelTop : va === 'middle' ? Equal : PanelBottom;
          const active = va === 'middle'
            ? (!selCell?.cell.verticalAlign || selCell?.cell.verticalAlign === 'middle')
            : selCell?.cell.verticalAlign === va;
          const label = va === 'top' ? 'Align Top' : va === 'middle' ? 'Align Middle' : 'Align Bottom';
          return (
            <Tooltip key={va} content={label}>
              <Button theme="dark"
                onClick={() => selCell && setVerticalAlign(selId!, active && va !== 'middle' ? undefined : va)}
                disabled={readOnly || !selCell}
                className={`${BTN_ICON} ${active ? BTN_ICON_ACTIVE : BTN_ICON_INACTIVE}`}>
                <Icon className="w-3 h-3 shrink-0" />
              </Button>
            </Tooltip>
          );
        })}
        <div className="w-px h-5 bg-zinc-700 mx-0.5" />
        <div className="inline-flex items-center gap-0.5">
          {(['truncate', 'wrap', 'none', 'visible'] as const).map(mode => {
            const current = selCell?.cell.truncation === false ? 'none' : selCell?.cell.overflowVisible ? 'visible' : selCell?.cell.wrap ? 'wrap' : 'truncate';
            const active = mode === current;
            const Icon = mode === 'wrap' ? WrapText : mode === 'none' ? X : mode === 'visible' ? Eye : Ellipsis;
            const label = mode === 'wrap' ? 'Wrap' : mode === 'none' ? 'None' : mode === 'visible' ? 'Visible' : 'Truncate';
            return (
              <Tooltip key={mode} content={`Overflow: ${label}`}>
                <Button theme="dark" variant="tab" active={active}
                  onClick={() => selCell && !active && setOverflow(selId!, mode)}
                  disabled={readOnly || !selCell}
                  className={`!rounded-md ${active ? '!bg-blue-900/50 !text-blue-300' : '!bg-transparent !text-zinc-400 hover:!bg-zinc-800'}`}>
                  <Icon className="w-3 h-3 shrink-0" />
                </Button>
              </Tooltip>
            );
          })}
        </div>
        <div className="w-px h-5 bg-zinc-700 mx-0.5" />
        {selCell?.cell.field === 'text' ? (
          <Tooltip content="Static Text Content">
            <input
              value={selCell?.cell.textContent || ''}
              onChange={e => selCell && setTextContent(selCell.cell.id, e.target.value)}
              placeholder="Text content..."
              disabled={readOnly || !selCell}
              className="ui-input h-7 px-2 text-[10px] disabled:opacity-30 w-32 shrink-0"
            />
          </Tooltip>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <Tooltip content="Prefix">
              <input
                value={selCell?.cell.prefix || ''}
                onChange={e => selCell?.cell.field && setAffix(selCell.cell.id, 'prefix', e.target.value)}
                placeholder="Prefix"
                disabled={readOnly || !selCell || !selCell.cell.field}
                className="ui-input h-7 w-14 px-1.5 text-[10px] disabled:opacity-25"
              />
            </Tooltip>
            <Tooltip content="Suffix">
              <input
                value={selCell?.cell.suffix || ''}
                onChange={e => selCell?.cell.field && setAffix(selCell.cell.id, 'suffix', e.target.value)}
                placeholder="Suffix"
                disabled={readOnly || !selCell || !selCell.cell.field}
                className="ui-input h-7 w-14 px-1.5 text-[10px] disabled:opacity-25"
              />
            </Tooltip>
          </div>
        )}
        <div className="w-px h-5 bg-zinc-700 mx-0.5" />
        <span className="text-[10px] text-zinc-500 shrink-0">Size</span>
        <Tooltip content="Cell text size offset (px) vs the design master — −8…+8">
          <LiveNumberInput
            value={selCell?.cell.textSizeOffset ?? 0}
            min={-8}
            max={8}
            fallback={0}
            onCommit={v => selCell && setTextSizeOffset?.(selCell.cell.id, v)}
            readOnly={readOnly || !selCell}
            ariaLabel="Cell text size offset"
            className="ui-input w-10 h-6 text-[11px] text-center shrink-0 read-only:opacity-50"
          />
        </Tooltip>
        {selCell && (selCell.cell.textSizeOffset !== undefined && selCell.cell.textSizeOffset !== 0) && (
          <Tooltip content="Reset to design master size">
            <Button theme="dark"
              aria-label="Reset to design master size"
              onClick={() => setTextSizeOffset?.(selCell.cell.id, undefined)}
              disabled={readOnly}
              className={BTN_X}
            >
              <X className="w-3 h-3 shrink-0" />
            </Button>
          </Tooltip>
        )}
      </div>
      {/* Layout */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
        <span className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider shrink-0 w-16">Layout</span>
        <span className="text-[10px] text-zinc-500 shrink-0">Pad V</span>
        <Tooltip content="Vertical Cell Padding (px)">
          <LiveNumberInput
            value={cellPaddingV}
            min={0}
            max={24}
            fallback={6}
            onCommit={v => dispatch({ type: 'SET_RIBBON_CELL_PADDING_V', payload: { id: designId, cellPaddingV: v } })}
            readOnly={readOnly}
            ariaLabel="Vertical cell padding"
            className="ui-input w-10 h-6 text-[11px] text-center shrink-0 read-only:opacity-50"
          />
        </Tooltip>
        <span className="text-[10px] text-zinc-500 shrink-0">Pad H</span>
        <Tooltip content="Horizontal Cell Padding (px)">
          <LiveNumberInput
            value={cellPaddingH}
            min={0}
            max={24}
            fallback={6}
            onCommit={v => dispatch({ type: 'SET_RIBBON_CELL_PADDING_H', payload: { id: designId, cellPaddingH: v } })}
            readOnly={readOnly}
            ariaLabel="Horizontal cell padding"
            className="ui-input w-10 h-6 text-[11px] text-center shrink-0 read-only:opacity-50"
          />
        </Tooltip>
        <div className="w-px h-5 bg-zinc-700 mx-0.5" />
        <span className="text-[10px] text-zinc-500 shrink-0">Edge</span>
        <Tooltip content="Edge Padding (px)">
          <LiveNumberInput
            value={edgePadding}
            min={0}
            max={12}
            fallback={2}
            onCommit={v => dispatch({ type: 'SET_RIBBON_EDGE_PADDING', payload: { id: designId, edgePadding: v } })}
            readOnly={readOnly}
            ariaLabel="Edge padding"
            className="ui-input w-10 h-6 text-[11px] text-center shrink-0 read-only:opacity-50"
          />
        </Tooltip>
        <div className="w-px h-5 bg-zinc-700 mx-0.5" />
        <span className="text-[10px] text-zinc-500 shrink-0">Master Size</span>
        <Tooltip content="Master text size (px) for the whole ribbon — cells scale with it">
          <LiveNumberInput
            value={textSize}
            min={6}
            max={24}
            fallback={8}
            onCommit={v => dispatch({ type: 'SET_RIBBON_TEXT_SIZE', payload: { id: designId, textSize: v } })}
            readOnly={readOnly}
            ariaLabel="Master text size"
            className="ui-input w-10 h-6 text-[11px] text-center shrink-0 read-only:opacity-50"
          />
        </Tooltip>
      </div>
    </div>
  );
}
