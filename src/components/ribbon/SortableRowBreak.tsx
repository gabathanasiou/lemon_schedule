import React from 'react';
import { ComputedRow } from '../../lib/daybreakUtils';
import { formatDuration, parseDuration } from '../../lib/utils';
import { getRibbonCellBaseStyle, getNoteBreakPad } from '../../lib/ribbonUtils';
import { RibbonCellText } from '../RibbonCellText';
import { CellInput } from '../CellInput';
import DurationKeypad from '../DurationKeypad';
import { RowRenderCtx } from './rowRenderTypes';

export default function SortableRowBreak({ row, ctx }: { row: ComputedRow; ctx: RowRenderCtx }) {
  const {
    isSelected, isFaded, isCompact, focusedRowId, onRowNavigate, ribbon, colWidths,
    cellPaddingV, cellPaddingH, edgePadding, palette, nb, sel,
    updateRow, inputClass, noteBreakPadPx, fmt, elapsedCaption, isTouchMode, alignTextClass,
  } = ctx;

  const breakStyle: React.CSSProperties = { background: nb.background, color: nb.color };
  if (isSelected && !isFaded) { breakStyle.background = sel.background; breakStyle.color = sel.color; }

  if (ribbon && ribbon.length > 0 && !isCompact) {
    const cells = ribbon[0].cells;
    const cw = colWidths ?? cells.map(() => 100 / cells.length);
    const nonSpecial = cells
      .map((c, i) => ({i, w: cw[i] ?? 0, f: c.field}))
      .filter(x => x.f !== 'duration' && x.f !== 'callTime');
    const mainCellIdx = nonSpecial.length > 0
      ? nonSpecial.reduce((a, b) => a.w >= b.w ? a : b).i
      : cells.map((c, i) => ({i, w: cw[i] ?? 0})).reduce((a, b) => a.w >= b.w ? a : b, {i: 0, w: 0}).i;
    const durationColIdx = cells.findIndex(c => c.field === 'duration');
    const estColIdx = mainCellIdx === cells.length - 1 && durationColIdx >= 0 ? durationColIdx : cells.length - 1;

    return (
        <div className="flex items-stretch min-w-0">
          <div className="flex-1 min-w-0 flex flex-col" style={{ ...breakStyle, paddingLeft: edgePadding ?? 2, paddingRight: edgePadding ?? 2 }}>
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
                }}>
                  <CellInput
                    value={row.breakLabel || ''}
                    onChange={val => updateRow({breakLabel: val.toUpperCase()})}
                    className={`${inputClass} text-center`}
                    placeholder="ENTER BREAK TEXT"
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
                      value={row.breakDuration || 0}
                      onChange={val => updateRow({breakDuration: val})}
                      className={`${inputClass} ${alignTextClass(cell)}`}
                      autoFocus={focusedRowId === row.id}
                      onOpen={() => onRowNavigate?.(row.id)}
                    />
                  ) : (
                    <CellInput
                      value={formatDuration(row.breakDuration || 0)}
                      onChange={val => updateRow({breakDuration: parseDuration(val)})}
                      clearOnType
                      col="duration"
                      className={`${inputClass} ${alignTextClass(cell)}`}
                      suffix={cell.suffix}
                      noTruncate={!!cell.overflowVisible || cell.truncation === false}
                      onRowNavigate={onRowNavigate}
                    />
                  )}
                  {ci === estColIdx && elapsedCaption && (
                    <span style={{ fontSize: '8pt' }}>{elapsedCaption}</span>
                  )}
                </div>
              );
            }
            if (ci === estColIdx && elapsedCaption) {
              const estAlign = cell.align === 'right' ? 'flex-end' : cell.align === 'left' ? 'flex-start' : 'center';
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                  padding: noteBreakPadPx, overflow: 'visible',
                  whiteSpace: 'normal', wordBreak: 'break-word',
                  display: 'flex', flexDirection: 'column', alignItems: estAlign, justifyContent: 'center', gap: 1,
                }}>
                  <span style={{ fontSize: '8pt' }}>{elapsedCaption}</span>
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
            <tr className="row-break" style={{ ...breakStyle, '--note-row-py': `${getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1)}px` } as any}>
              <td className="col-sc" />
              {!isCompact ? (
                <>
                  <td className="col-call">{row.computedCallTime}</td>
                  <td className="col-dur">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      {isTouchMode ? (
                        <DurationKeypad
                          value={row.breakDuration || 0}
                          onChange={val => updateRow({breakDuration: val})}
                          className={`${inputClass} text-center`}
                          autoFocus={focusedRowId === row.id}
                          onOpen={() => onRowNavigate?.(row.id)}
                        />
                      ) : (
                        <CellInput
                          value={formatDuration(row.breakDuration || 0)}
                          onChange={val => updateRow({breakDuration: parseDuration(val)})}
                          clearOnType
                          col="duration"
                          className={`${inputClass} text-center`}
                          autoFocus={focusedRowId === row.id}
                          onRowNavigate={onRowNavigate}
                        />
                      )}
                      {elapsedCaption && (
                        <span>{elapsedCaption}</span>
                      )}
                    </div>
                  </td>
                  <td className="col-ie" />
                  <td className="col-set" style={{textAlign: 'center'}}>
                    <CellInput
                      value={row.breakLabel || ''}
                      onChange={val => updateRow({breakLabel: val.toUpperCase()})}
                      className={`${inputClass} text-center`}
                      placeholder="ENTER BREAK TEXT"
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
                    value={row.breakLabel || ''}
                    onChange={val => updateRow({breakLabel: val.toUpperCase()})}
                    className={inputClass}
                    placeholder="ENTER BREAK TEXT"
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
