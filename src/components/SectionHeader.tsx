import React, { useState } from 'react';
import { CellInput } from './CellInput';
import { getDayHeaderColors, getSelectedStripColors, getRibbonCellBaseStyle, getNoteBreakPad } from '../lib/ribbonUtils';
import { RibbonRow, SceneColorPalette, RuleViolation } from '../types';
import { Flag } from 'lucide-react';
import { ViolationTooltip } from './ViolationTooltip';
import { ViolationModal } from './ViolationModal';
import { useProject } from '../store';

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
  sectionViolations?: RuleViolation[];
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
  sectionViolations,
}) => {
  const dh = getDayHeaderColors(palette);
  const sel = getSelectedStripColors(palette);

  const bg = isSelected ? sel.background : dh.background;
  const fg = isSelected ? sel.color : dh.color;

  const { state } = useProject();
  const castMembers = state.present.castMembers || [];
  const [showViolationModal, setShowViolationModal] = useState(false);

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
    const lastCellIdx = cells.length - 1;

    return (
      <>
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
            if (ci === lastCellIdx && sectionViolations && sectionViolations.length > 0) {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cpv, cph, 1),
                  textAlign: 'center', padding: pad, overflow: 'visible',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <ViolationTooltip violations={sectionViolations}>
                    <span onClick={() => setShowViolationModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: '#ef4444', fontSize: '7pt', fontWeight: 700, cursor: 'help' }}>
                      <Flag className="w-2.5 h-2.5 fill-red-400" /> {sectionViolations.length}
                    </span>
                  </ViolationTooltip>
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
      <ViolationModal
        open={showViolationModal}
        onClose={() => setShowViolationModal(false)}
        title={`${dayLabel} Violations`}
        violations={sectionViolations || []}
        castMembers={castMembers}
      />
      </>
    );
  }

  // Non-ribbon mode
  const notePadV = getNoteBreakPad(cellPaddingV ?? 6, 1);
  const padV = Math.max(cellPaddingV ?? 6, Math.floor(notePadV / 2));
  return (
    <>
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
          <td className="col-pgs" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
            {sectionViolations && sectionViolations.length > 0 && (
              <ViolationTooltip violations={sectionViolations}>
                <span onClick={() => setShowViolationModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: '#ef4444', fontSize: '7pt', fontWeight: 700, cursor: 'help' }}>
                  <Flag className="w-2.5 h-2.5 fill-red-400" /> {sectionViolations.length}
                </span>
              </ViolationTooltip>
            )}
          </td>
        </tr>
      </tbody>
    </table>
    <ViolationModal
      open={showViolationModal}
      onClose={() => setShowViolationModal(false)}
      title={`${dayLabel}`}
      subtitle={`Violations for this section`}
      violations={sectionViolations || []}
      castMembers={castMembers}
    />
    </>
  );
};

export default SectionHeader;
