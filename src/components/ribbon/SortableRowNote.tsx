import React from 'react';
import { ComputedRow } from '../../lib/daybreakUtils';
import { formatDuration, parseDuration } from '../../lib/utils';
import { getRibbonCellBaseStyle, getNoteBreakPad } from '../../lib/ribbonUtils';
import { RibbonCellText } from '../RibbonCellText';
import { CellInput } from '../CellInput';
import DurationKeypad from '../DurationKeypad';
import { RowRenderCtx } from './rowRenderTypes';

export default function SortableRowNote({ row, ctx }: { row: ComputedRow; ctx: RowRenderCtx }) {
  const {
    isSelected, isFaded, isCompact, focusedRowId, onRowNavigate, ribbon, colWidths,
    cellPaddingV, cellPaddingH, edgePadding, palette, nb, sel,
    updateRow, inputClass, noteBreakPadPx, fmt, isTouchMode, alignTextClass,
  } = ctx;

  const noteStyle: React.CSSProperties = { background: row.noteColor || nb.background, color: row.noteTextColor || nb.color };
  if (isSelected && !isFaded) { noteStyle.background = sel.background; noteStyle.color = sel.color; }

  if (ribbon && ribbon.length > 0 && !isCompact) {
    const cells = ribbon[0].cells;
    const cw = colWidths ?? cells.map(() => 100 / cells.length);
    const nonSpecial = cells
      .map((c, i) => ({i, w: cw[i] ?? 0, f: c.field}))
      .filter(x => x.f !== 'duration' && x.f !== 'callTime');
    const mainCellIdx = nonSpecial.length > 0
      ? nonSpecial.reduce((a, b) => a.w >= b.w ? a : b).i
      : cells.map((c, i) => ({i, w: cw[i] ?? 0})).reduce((a, b) => a.w >= b.w ? a : b, {i: 0, w: 0}).i;

    return (
        <div className="flex items-stretch min-w-0">
          <div className="flex-1 min-w-0 flex flex-col" style={{ ...noteStyle, paddingLeft: edgePadding ?? 2, paddingRight: edgePadding ?? 2 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: cw.map(w => `${w}%`).join(' '),
            }}>
          {cells.map((cell, ci) => {
            const wrapCell = ci === mainCellIdx;
            if (wrapCell) {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                  textAlign: 'center',
                  padding: noteBreakPadPx,
                  overflow: 'visible',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  lineHeight: 1.4,
                }}>
                  <CellInput
                    value={row.noteText || ''}
                    onChange={val => updateRow({noteText: val.toUpperCase()})}
                    className={`${inputClass} text-center`}
                    placeholder="Enter note here..."
                    multiline
                    autoFocus={focusedRowId === row.id}
                    col="text"
                  />
                </div>
              );
            }
            if (cell.field === 'duration') {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                  padding: noteBreakPadPx,
                  overflow: 'visible',
                }}>
                  {isTouchMode ? (
                    <DurationKeypad
                      value={row.estimatedDuration || 0}
                      onChange={val => updateRow({estimatedDuration: val})}
                      display={!row.estimatedDuration ? '' : formatDuration(row.estimatedDuration)}
                      className={`${inputClass} ${alignTextClass(cell)}`}
                      autoFocus={focusedRowId === row.id}
                      onOpen={() => onRowNavigate?.(row.id)}
                    />
                  ) : (
                    <CellInput
                      value={row.estimatedDuration === 0 || !row.estimatedDuration ? '' : formatDuration(row.estimatedDuration || 0)}
                      onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
                      clearOnType
                      col="duration"
                      className={`${inputClass} ${alignTextClass(cell)}`}
                      suffix={cell.suffix}
                      noTruncate={!!cell.overflowVisible || cell.truncation === false}
                      onRowNavigate={onRowNavigate}
                    />
                  )}
                </div>
              );
            }
            if (cell.field === 'callTime') {
              const v = row.computedCallTime || '';
              return <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                padding: noteBreakPadPx,
                overflow: 'visible',
              }}>{v ? <RibbonCellText cell={cell}>{fmt(cell.prefix, v, cell.suffix)}</RibbonCellText> : ''}</div>;
            }
            return <div key={cell.id} style={{
              gridColumn: ci + 1, gridRow: 1,
              ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
              padding: noteBreakPadPx,
              overflow: 'visible',
            }} />;
          })}
          </div>
          </div>
        </div>
    );
  }

  return (
      <div className="flex items-stretch min-w-0">
        <table className="schedule-table flex-1 min-w-0">
          <tbody>
            <tr className="row-note" style={{ ...noteStyle, '--note-row-py': `${getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1)}px` } as any}>
              <td className="col-sc" />
              {!isCompact ? (
                <>
                  <td className="col-call">{row.computedCallTime}</td>
                  <td className="col-dur">
                    {isTouchMode ? (
                      <DurationKeypad
                        value={row.estimatedDuration || 0}
                        onChange={val => updateRow({estimatedDuration: val})}
                        display={!row.estimatedDuration ? '' : formatDuration(row.estimatedDuration)}
                        className={`${inputClass} text-center`}
                        autoFocus={focusedRowId === row.id}
                        onOpen={() => onRowNavigate?.(row.id)}
                      />
                    ) : (
                      <CellInput
                        value={row.estimatedDuration === 0 || !row.estimatedDuration ? '' : formatDuration(row.estimatedDuration || 0)}
                        onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
                        clearOnType
                        col="duration"
                        className={`${inputClass} text-center`}
                        autoFocus={focusedRowId === row.id}
                        onRowNavigate={onRowNavigate}
                      />
                    )}
                  </td>
                  <td className="col-ie" />
                  <td className="col-set" style={{textAlign: 'center'}}>
                    <CellInput
                      value={row.noteText || ''}
                      onChange={val => updateRow({noteText: val.toUpperCase()})}
                      className={`${inputClass} text-center`}
                      placeholder="Enter note here..."
                      multiline
                      col="text"
                    />
                  </td>
                  <td className="col-dn" />
                  <td className="col-cast" />
                  <td className="col-pgs" />
                </>
                ) : (
                <td colSpan={4} className="col-set">
                  <CellInput
                    value={row.noteText || ''}
                    onChange={val => updateRow({noteText: val.toUpperCase()})}
                    className={inputClass}
                    placeholder="Enter note here..."
                    multiline
                    autoFocus={focusedRowId === row.id}
                    col="text"
                  />
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>
  );
}
