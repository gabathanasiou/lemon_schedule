import React from 'react';
import { CellInput } from './CellInput';
import { getDayHeaderColors, getSelectedStripColors, getRibbonCellBaseStyle, getNoteBreakPad } from '../lib/ribbonUtils';
import { RibbonRow, SceneColorPalette } from '../types';

interface SectionHeaderProps {
  dayLabel: string;
  callTime: string;
  onCallTimeChange: (val: string) => void;
  dateStr?: string;
  palette?: SceneColorPalette;
  isSelected?: boolean;
  ribbon?: RibbonRow[];
  colWidths?: number[];
  cellPaddingV?: number;
  cellPaddingH?: number;
  edgePadding?: number;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  dayLabel,
  callTime,
  onCallTimeChange,
  dateStr,
  palette,
  isSelected,
  ribbon,
  colWidths,
  cellPaddingV,
  cellPaddingH,
  edgePadding,
}) => {
  const dh = getDayHeaderColors(palette);
  const sel = getSelectedStripColors(palette);

  const bg = isSelected ? sel.background : dh.background;
  const fg = isSelected ? sel.color : dh.color;

  // Ribbon mode
  if (ribbon && ribbon.length > 0 && ribbon[0].cells.length > 0) {
    const cells = ribbon[0].cells;
    const cw = colWidths ?? cells.map(() => 100 / cells.length);
    const cpv = cellPaddingV ?? 6;
    const cph = cellPaddingH ?? 6;
    const notePadV = getNoteBreakPad(cpv, ribbon.length);
    const daybreakPadV = Math.max(cpv, Math.floor(notePadV / 2));
    const pad = `${daybreakPadV}px ${cph}px`;

    const nonSpecial = cells
      .map((c, i) => ({ i, w: cw[i] ?? 0, f: c.field }))
      .filter(x => x.f !== 'duration' && x.f !== 'callTime');
    const mainCellIdx = nonSpecial.length > 0
      ? nonSpecial.reduce((a, b) => a.w >= b.w ? a : b).i
      : cells.map((c, i) => ({ i, w: cw[i] ?? 0 })).reduce((a, b) => a.w >= b.w ? a : b, { i: 0, w: 0 }).i;

    return (
      <div style={{ background: bg, color: fg, paddingLeft: edgePadding ?? 2, paddingRight: edgePadding ?? 2, width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cw.map(w => `${w}%`).join(' ') }}>
          {cells.map((cell, ci) => {
            if (ci === mainCellIdx) {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cpv, cph, 1),
                  textAlign: 'center', padding: pad, overflow: 'visible',
                  whiteSpace: 'normal', wordBreak: 'break-word',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                }}>
                  <strong>{dayLabel}</strong>
                  {dateStr && (
                    <span style={{ fontSize: '7pt', opacity: 0.8 }}>{dateStr}</span>
                  )}
                </div>
              );
            }
            if (cell.field === 'callTime') {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cpv, cph, 1),
                  textAlign: 'center', padding: pad, overflow: 'visible',
                }}>
                  <CellInput
                    value={callTime || '08:00'}
                    onChange={onCallTimeChange}
                    clearOnType
                    col="duration"
                    className="text-center"
                    noTruncate
                  />
                </div>
              );
            }
            if (cell.field === 'duration') {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cpv, cph, 1),
                  textAlign: 'center', padding: pad, overflow: 'visible',
                }}>
                  <span style={{ fontSize: '7pt', opacity: 0.8 }}>CALL</span>
                </div>
              );
            }
            return (
              <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                ...getRibbonCellBaseStyle(cell, cpv, cph, 1),
                textAlign: 'center', padding: pad, overflow: 'visible',
              }} />
            );
          })}
        </div>
      </div>
    );
  }

  // Non-ribbon mode
  const notePadV = getNoteBreakPad(cellPaddingV ?? 6, 1);
  const padV = Math.max(cellPaddingV ?? 6, Math.floor(notePadV / 2));
  return (
    <table className="schedule-table flex-1 min-w-0">
      <tbody>
        <tr className="row-note" style={{
          background: bg,
          color: fg,
          '--note-row-py': `${padV}px`,
        } as React.CSSProperties}>
          <td className="col-sc" />
          <td className="col-call">
            <CellInput
              value={callTime || '08:00'}
              onChange={onCallTimeChange}
              clearOnType
              col="duration"
              className="bg-zinc-800 px-1.5 py-0.5 border border-transparent focus-within:border-zinc-500 text-center"
            />
          </td>
          <td className="col-dur" style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '7pt', opacity: 0.8 }}>CALL</span>
          </td>
          <td className="col-ie" />
          <td className="col-set" style={{ textAlign: 'center' }}>
            <strong>{dayLabel}</strong>
            {dateStr && (
              <span style={{ fontSize: '7pt', opacity: 0.8 }}>{dateStr}</span>
            )}
          </td>
          <td className="col-dn" />
          <td className="col-cast" />
          <td className="col-pgs" />
        </tr>
      </tbody>
    </table>
  );
};

export default SectionHeader;
