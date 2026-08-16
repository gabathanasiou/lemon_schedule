import React from 'react';
import { Eye } from 'lucide-react';
import { RibbonRow, RibbonCell, SceneColorPalette } from '../../types';
import {
  resolveSceneColor, getFallbackStripColors, computeMergeGroups,
  getFieldValueFromSample, getCellBorderProps, getRibbonCellBaseStyle, formatCellText, FIELD_MAP,
  PREVIEW_SAMPLES,
} from '../../lib/ribbonUtils';
import { RibbonCellText } from '../RibbonCellText';
import type { CellBorders } from '../../lib/persist';

interface RibbonLivePreviewProps {
  rows: RibbonRow[];
  colWidths: number[];
  palette?: SceneColorPalette;
  cellBorders: CellBorders;
  customFieldLabels: Record<string, string>;
  previewSectionRef: React.MutableRefObject<HTMLDivElement | null>;
  cellPaddingV?: number;
  cellPaddingH?: number;
  edgePadding?: number;
}

export default function RibbonLivePreview({
  rows, colWidths, palette, cellBorders, customFieldLabels, previewSectionRef,
  cellPaddingV, cellPaddingH, edgePadding,
}: RibbonLivePreviewProps) {
  return (
    <section ref={previewSectionRef} className="bg-zinc-900 rounded-lg border border-zinc-800">
      <div className="flex items-center gap-2 mb-3 px-5 pt-5">
        <Eye className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Live Preview</span>
        <span className="ml-auto text-[9px] text-zinc-600">Sample data · {rows.length} rows · {rows.reduce((s, r) => s + r.cells.length, 0)} cells</span>
      </div>

      <div style={{
        fontFamily: 'Helvetica, sans-serif', fontSize: '8pt', lineHeight: 1.1, border: '2px solid #000',
        marginBottom: '20px',
      }}>
        {rows.length >= 1 && PREVIEW_SAMPLES.map((sample, si) => {
          const rowStyle = resolveSceneColor(sample.intExt || '', sample.dayNight || '', palette?.sceneColors, getFallbackStripColors(palette));
          return (
            <div key={si} className="flex items-stretch min-w-0" style={{ borderBottom: si < PREVIEW_SAMPLES.length - 1 ? '2px solid #000' : 'none' }}>
              <div className="flex-1 min-w-0 flex flex-col" style={{ ...rowStyle, paddingTop: (edgePadding ?? 2), paddingBottom: (edgePadding ?? 2), paddingLeft: (edgePadding ?? 2), paddingRight: (edgePadding ?? 2) }}>
                <div data-preview-grid style={{
                  display: 'grid',
                  gridTemplateColumns: colWidths.map(w => `${w}%`).join(' '),
                  gridTemplateRows: `repeat(${rows.length}, auto)`,
                }}>
                  {(() => {
                    const mgroups = computeMergeGroups(rows);
                    const hiddenIds = new Set<string>();
                    for (const g of mgroups) {
                      if (g.direction === 'v') {
                        for (let ri = g.rowIndex + 1; ri < g.rowIndex + g.span; ri++) {
                          const cell = rows[ri]?.cells[g.colIndex];
                          if (cell) hiddenIds.add(cell.id);
                        }
                      } else {
                        for (let ci = g.colIndex + 1; ci < g.colIndex + g.span; ci++) {
                          const cell = rows[g.rowIndex]?.cells[ci];
                          if (cell) hiddenIds.add(cell.id);
                        }
                      }
                    }
                    const items: { id: string; col: number; row: number; vSpan: number; hSpan: number; cell: RibbonCell }[] = [];
                    for (let ri = 0; ri < rows.length; ri++) {
                      for (let ci = 0; ci < rows[ri].cells.length; ci++) {
                        const cell = rows[ri].cells[ci];
                        if (hiddenIds.has(cell.id)) continue;
                        const g = mgroups.find(gg => gg.colIndex === ci && gg.rowIndex === ri);
                        const vSpan = g?.direction === 'v' ? (g.span || 1) : 1;
                        const hSpan = g?.direction === 'h' ? (g.span || 1) : 1;
                        items.push({ id: cell.id, col: ci, row: ri, vSpan, hSpan, cell });
                      }
                    }
                    return items.map(p => {
                      const c = p.cell;
                      const span = p.vSpan || 1;
                      const val = c.field === 'text' ? (c.textContent || '') : c.field === 'sceneNumber' ? sample.sceneNumber : getFieldValueFromSample(c.field);
                      const fieldLabel = FIELD_MAP[c.field]?.label || customFieldLabels[c.field] || '';
                      const display = val || fieldLabel;
                      const lastVisRow = p.row + span - 1;
                      const lastVisCol = (p.hSpan && p.hSpan > 1) ? p.col + p.hSpan - 1 : p.col;
                      const cellBorderStyle = getCellBorderProps(cellBorders, rowStyle.color, lastVisCol >= rows[0].cells.length - 1, lastVisRow >= rows.length - 1);
                      return (
                        <div key={p.id} style={{
                          ...getRibbonCellBaseStyle(c, cellPaddingV, cellPaddingH, span),
                          gridColumn: (p.hSpan && p.hSpan > 1) ? `${p.col + 1} / span ${p.hSpan}` : p.col + 1,
                          gridRow: span > 1 ? `${p.row + 1} / span ${span}` : p.row + 1,
                          padding: span > 1 ? `0px ${cellPaddingH ?? 6}px` : `${cellPaddingV ?? 6}px ${cellPaddingH ?? 6}px`,
                          borderRight: lastVisCol < rows[0].cells.length - 1 ? (cellBorders === 'vertical' || cellBorders === 'both' ? `1px solid ${rowStyle.color}` : '1px solid rgba(0,0,0,0.12)') : 'none',
                          borderBottom: lastVisRow < rows.length - 1 ? (cellBorders === 'horizontal' || cellBorders === 'both' ? `1px solid ${rowStyle.color}` : '1px solid rgba(0,0,0,0.12)') : 'none',
                          ...cellBorderStyle,
                        }}>
                          <RibbonCellText cell={c} span={span} cellPadding={cellPaddingV} style={{ flexShrink: 1, minWidth: 0, fontStyle: val ? 'normal' : 'italic', opacity: val ? 1 : 0.5 }}>
                            {formatCellText(val ? c.prefix : undefined, display, val ? c.suffix : undefined)}
                          </RibbonCellText>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
