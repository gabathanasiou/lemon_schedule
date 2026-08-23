import React from 'react';
import { ComputedRowInput } from '../../lib/daybreakUtils';
import { formatDuration, formatPageCount } from '../../lib/utils';
import { getRibbonCellBaseStyle, getNoteBreakPad, getDayHeaderColors, getDayFooterColors, getSelectedStripColors } from '../../lib/ribbonUtils';
import { RibbonCellText } from '../RibbonCellText';
import { CellInput } from '../CellInput';
import { RowRenderCtx } from './rowRenderTypes';
import { TEST_IDS } from '../../lib/testIds';

export default function SortableRowDaybreak({ row, ctx }: { row: ComputedRowInput; ctx: RowRenderCtx }) {
  const {
    isSelected, isFaded, isCompact, focusedRowId, onRowNavigate, ribbon, colWidths,
    cellPaddingV, cellPaddingH, edgePadding, palette,
    inputClass, fmt, alignTextClass, nextDaybreakCallTime, onUpdateNextDaybreak, nextDateStr, nextViolationBadge,
  } = ctx;
  const dh = getDayHeaderColors(palette);
  const df = getDayFooterColors(palette);
  const sel = getSelectedStripColors(palette);
  const daybreakStyle: React.CSSProperties = { background: df.background, color: df.color };
  if (isSelected && !isFaded) { daybreakStyle.background = sel.background; daybreakStyle.color = sel.color; }

  const sectionTotal = row.sectionTotal || 0;
  const sectionPages = row.sectionPages || 0;
  const sectionShoot = row.sectionShoot || 0;
  const sectionBreak = row.sectionBreak || 0;
  const sectionEndTime = row.sectionEndTime || '';
  const nextDaybreakNum = row.hasNextDaybreak ? parseInt((row.daybreakLabel || '').match(/\d+/)?.[0] || '0', 10) + 1 : 0;
  const nextLabel = nextDaybreakNum > 0 ? `START OF DAY ${nextDaybreakNum}` : '';

  if (ribbon && ribbon.length > 0 && !isCompact) {
    const cells = ribbon[0].cells;
    const cw = colWidths ?? cells.map(() => 100 / cells.length);
    const nonSpecial = cells
      .map((c, i) => ({i, w: cw[i] ?? 0, f: c.field}))
      .filter(x => x.f !== 'duration' && x.f !== 'callTime');
    const mainCellIdx = nonSpecial.length > 0
      ? nonSpecial.reduce((a, b) => a.w >= b.w ? a : b).i
      : cells.map((c, i) => ({i, w: cw[i] ?? 0})).reduce((a, b) => a.w >= b.w ? a : b, {i: 0, w: 0}).i;
    const notePadV = getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1);
    const daybreakPadV = Math.max(cellPaddingV ?? 6, Math.floor(notePadV / 2));
    const daybreakPadPx = `${daybreakPadV}px ${cellPaddingH ?? 6}px`;
    const lastCellIdx = cells.length - 1;
    const pageCountCell = (() => {
      for (const r of ribbon) {
        const found = r.cells.find(c => c.field === 'pageCount');
        if (found) return found;
      }
      return null;
    })();
    const pageCountColIdx = cells.findIndex((_, ci) =>
      ribbon.some(r => ci < r.cells.length && r.cells[ci].field === 'pageCount')
    );

    const durationColIdx = cells.findIndex(c => c.field === 'duration');
    const durationCell = (() => {
      for (const r of ribbon) {
        const found = r.cells.find(c => c.field === 'duration');
        if (found) return found;
      }
      return null;
    })();
    const estColIdx = mainCellIdx === cells.length - 1 && durationColIdx >= 0 ? durationColIdx : lastCellIdx;

    return (
      <div className="flex items-stretch min-w-0">
        <div className="flex-1 min-w-0 flex flex-col">
            {!row.pinned && (
            <div className="flex-1 min-w-0 flex flex-col" style={{
              ...daybreakStyle,
              paddingLeft: edgePadding ?? 2,
              paddingRight: edgePadding ?? 2,
              ...(row.hasNextDaybreak ? { borderBottom: '2px solid #000' } : {}),
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: cw.map(w => `${w}%`).join(' ') }}>
              {cells.map((cell, ci) => {
                if (ci === mainCellIdx) {
                  return (
                    <div key={cell.id} style={{
                      gridColumn: ci + 1, gridRow: 1,
                      ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                      padding: daybreakPadPx, overflow: 'visible',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                      position: 'relative',
                    }}>
                      <RibbonCellText cell={cell}>{row.daybreakLabel || 'End of Day'}</RibbonCellText>
                      {row.daybreakDate && (
                        <span style={{ fontSize: '7pt', opacity: 0.8 }}>
                          {(() => { const d = new Date(row.daybreakDate + 'T00:00:00'); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); })()}
                        </span>
                      )}
                    </div>
                  );
                }
                if (ci === estColIdx && sectionTotal > 0) {
                  const estCell = (estColIdx === durationColIdx && durationCell) ? durationCell : cell;
                  const estAlign = estCell.align === 'right' ? 'flex-end' : estCell.align === 'left' ? 'flex-start' : 'center';
                  return (
                    <div key={cell.id} style={{
                      gridColumn: ci + 1, gridRow: 1,
                      ...getRibbonCellBaseStyle(estCell, cellPaddingV, cellPaddingH, 1),
                      padding: daybreakPadPx, overflow: 'visible',
                      whiteSpace: 'normal', wordBreak: 'break-word',
                      display: 'flex', flexDirection: 'column', alignItems: estAlign, justifyContent: 'center', gap: 1,
                    }}>
                      <span style={{ fontSize: '8pt' }}>
                        EST: {formatDuration(sectionShoot)}{sectionBreak > 0 ? <span> + {formatDuration(sectionBreak)} break</span> : null}
                      </span>
                    </div>
                  );
                }
                if (ci === pageCountColIdx && sectionPages > 0) {
                  const pc = pageCountCell!;
                  return (
                    <div key={cell.id} style={{
                      gridColumn: ci + 1, gridRow: 1,
                      ...getRibbonCellBaseStyle(pc, cellPaddingV, cellPaddingH, 1),
                      padding: daybreakPadPx, overflow: 'visible',
                      display: 'flex', flexDirection: 'column', alignItems: pc.align === 'right' ? 'flex-end' : pc.align === 'left' ? 'flex-start' : 'center', justifyContent: 'center', gap: 1,
                    }}>
                      <span style={{ fontSize: '7pt', opacity: 0.8 }}>Total:</span>
                      <RibbonCellText cell={pc}>{formatPageCount(sectionPages)} {pc.suffix || 'pgs'}</RibbonCellText>
                    </div>
                  );
                }
                if (cell.field === 'duration') {
                  return (
                    <div key={cell.id} style={{
                      gridColumn: ci + 1, gridRow: 1,
                      ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                      padding: daybreakPadPx, overflow: 'visible',
                    }} />
                  );
                }
                if (cell.field === 'callTime') {
                  return (
                    <div key={cell.id} style={{
                      gridColumn: ci + 1, gridRow: 1,
                      ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                      padding: daybreakPadPx, overflow: 'visible',
                    }}>
                      {sectionEndTime ? <RibbonCellText cell={cell}>{fmt(cell.prefix, sectionEndTime, cell.suffix)}</RibbonCellText> : ''}
                    </div>
                  );
                }
                return <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                  padding: daybreakPadPx, overflow: 'visible',
                }} />;
              })}
            </div>
          </div>
          )}

          {row.hasNextDaybreak && (
            <div style={{ background: (isSelected && !isFaded) ? sel.background : dh.background, color: (isSelected && !isFaded) ? sel.color : dh.color, paddingLeft: edgePadding ?? 2, paddingRight: edgePadding ?? 2 }}>
              <div style={{ display: 'grid', gridTemplateColumns: cw.map(w => `${w}%`).join(' ') }}>
                {cells.map((cell, ci) => {
                  if (ci === mainCellIdx) {
                    return (
                      <div key={cell.id} style={{
                        gridColumn: ci + 1, gridRow: 1,
                        ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                        padding: daybreakPadPx, overflow: 'visible',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                      }}>
                        <RibbonCellText cell={cell}><strong>{nextLabel}</strong></RibbonCellText>
                        {nextDateStr && <span style={{ fontSize: '7pt', opacity: 0.8 }}>{nextDateStr}</span>}
                      </div>
                    );
                  }
                  if (cell.field === 'callTime') {
                    return (
                      <div key={cell.id} style={{
                        gridColumn: ci + 1, gridRow: 1,
                        ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                        padding: daybreakPadPx, overflow: 'visible',
                      }}>
                        <CellInput
                          value={nextDaybreakCallTime || '08:00'}
                          onChange={val => onUpdateNextDaybreak?.(val)}
                          clearOnType
                          col="duration"
                          className={`${inputClass} ${alignTextClass(cell)}`}
                          suffix={cell.suffix}
                          noTruncate={!!cell.overflowVisible || cell.truncation === false}
                          onRowNavigate={onRowNavigate}
                        />
                      </div>
                    );
                  }
                  if (cell.field === 'duration') {
                    return (
                      <div key={cell.id} style={{
                        gridColumn: ci + 1, gridRow: 1,
                        ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                        padding: daybreakPadPx, overflow: 'visible',
                      }}>
                        <span style={{ fontSize: '7pt', opacity: 0.8 }}>CALL</span>
                      </div>
                    );
                  }
                  return (
                    <div key={cell.id} style={{
                      gridColumn: ci + 1, gridRow: 1,
                      ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                      padding: daybreakPadPx, overflow: 'visible',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {ci === lastCellIdx && nextViolationBadge}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div data-testid={TEST_IDS.daybreakRow} className="flex items-stretch min-w-0">
      <div className="flex-1 min-w-0 flex flex-col">
        {!row.pinned && (
        <table className="schedule-table flex-1 min-w-0">
          <tbody>
            <tr data-testid={TEST_IDS.sectionFooter} className="row-note" style={{ ...daybreakStyle, '--note-row-py': `${getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1)}px` } as any}>
              <td className="col-sc" />
              {!isCompact ? (
                <>
                  <td className="col-call">{sectionEndTime || row.computedCallTime}</td>
                  <td className="col-dur">{sectionTotal > 0 ? formatDuration(sectionTotal) : ''}</td>
                  <td className="col-ie" />
                  <td className="col-set" style={{textAlign: 'center'}}>
                    {row.daybreakLabel || 'End of Day'}
                  </td>
                  <td className="col-dn" />
                  <td className="col-cast" />
                <td className="col-pgs" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                    {sectionTotal > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <span style={{ fontSize: '7pt', opacity: 0.75 }}>{formatPageCount(sectionPages)} pgs · EST: {formatDuration(sectionShoot)}{sectionBreak > 0 ? <span> + {formatDuration(sectionBreak)} break</span> : null}</span>
                      </div>
                    )}
                  </td>
                </>
              ) : (
                <td colSpan={4} className="col-set">
                  {row.daybreakLabel || 'End of Day'}
                </td>
              )}
            </tr>
          </tbody>
        </table>
        )}
        {nextDaybreakNum > 0 && (
          <table className="schedule-table flex-1 min-w-0">
            <tbody>
              <tr data-testid={TEST_IDS.nextDayHeader} className="row-note" style={{ background: (isSelected && !isFaded) ? sel.background : dh.background, color: (isSelected && !isFaded) ? sel.color : dh.color, '--note-row-py': `${getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1)}px` } as any}>
                <td className="col-sc" />
                <td className="col-call">
                  <CellInput
                    value={nextDaybreakCallTime || '08:00'}
                    onChange={val => onUpdateNextDaybreak?.(val)}
                    clearOnType
                    col="duration"
                    className="bg-zinc-800 px-1.5 py-0.5 border border-transparent focus-within:border-zinc-500 text-center"
                    onRowNavigate={onRowNavigate}
                  />
                </td>
                <td className="col-dur" style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '7pt', opacity: 0.8 }}>CALL</span>
                </td>
                <td className="col-ie" />
                <td className="col-set" style={{ textAlign: 'center' }}>
                  <strong>{nextLabel}</strong>
                  {nextDateStr && <span style={{ fontSize: '7pt', opacity: 0.8, marginLeft: 6 }}>{nextDateStr}</span>}
                </td>
                <td className="col-dn" />
                <td className="col-cast" />
                <td className="col-pgs" style={{ textAlign: 'center' }}>
                  {nextViolationBadge}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
