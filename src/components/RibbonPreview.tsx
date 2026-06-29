import React from 'react';
import { Scene, RibbonRow } from '../types';
import { getRibbonCellBaseStyle, formatCellText, getFieldValue, sceneStyle, computeMergeGroups } from '../lib/ribbonUtils';
import { RibbonCellText } from './RibbonCellText';

function fmt(prefix: string | undefined, val: string, suffix: string | undefined): string {
  return formatCellText(prefix, val, suffix);
}

export function RibbonPreview({ scene, ribbon, colWidths, cellPadding = 3, edgePadding = 2, onDoubleClick }: {
  scene: Scene;
  ribbon: RibbonRow[];
  colWidths?: number[];
  cellPadding?: number;
  edgePadding?: number;
  onDoubleClick?: () => void;
}) {
  if (!ribbon || ribbon.length === 0) return null;

  const cw = colWidths ?? [];
  const rowBg = sceneStyle(scene);

  const mgroups = computeMergeGroups(ribbon);
  const hiddenIds = new Set<string>();
  for (const g of mgroups) {
    for (let ri = g.rowIndex + 1; ri < g.rowIndex + g.span; ri++) {
      const cell = ribbon[ri]?.cells[g.colIndex];
      if (cell) hiddenIds.add(cell.id);
    }
  }
  const items: { cell: typeof ribbon[0]['cells'][0]; col: number; row: number; span: number }[] = [];
  for (let ri = 0; ri < ribbon.length; ri++) {
    for (let ci = 0; ci < ribbon[ri].cells.length; ci++) {
      const cell = ribbon[ri].cells[ci];
      if (hiddenIds.has(cell.id)) continue;
      const g = mgroups.find(gg => gg.colIndex === ci && gg.rowIndex === ri);
      items.push({ cell, col: ci, row: ri, span: g ? g.span : 1 });
    }
  }

  return (
    <div className="border border-zinc-300 rounded overflow-hidden bg-white">
      <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-zinc-50 border-b border-zinc-300">
        Ribbon Preview
      </div>
      <div className="px-2.5 py-1.5">
        <div
          style={{ cursor: 'pointer' }}
          onDoubleClick={onDoubleClick}
          title={onDoubleClick ? 'Double-click to open in Schedule' : undefined}
        >
          <div
            className="flex flex-col min-w-0"
            style={{
              ...rowBg,
              paddingTop: edgePadding,
              paddingBottom: edgePadding,
              paddingLeft: edgePadding,
              paddingRight: edgePadding,
            }}
          >
            {cw.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: cw.map(w => `${w}%`).join(' '),
                gridTemplateRows: `repeat(${ribbon.length}, auto)`,
              }}>
                {items.map(({ cell, col, row, span }) => {
                  const style = getRibbonCellBaseStyle(cell, cellPadding, span);
                  const val = cell.field ? getFieldValue(cell.field, scene) : '';
                  const text = cell.textContent || fmt(cell.prefix, val, cell.suffix);
                  return (
                    <div key={cell.id} style={{
                      ...style,
                      gridColumn: col + 1,
                      gridRow: span ? `${row + 1} / span ${span}` : row + 1,
                    }}>
                      <RibbonCellText cell={cell} span={span}>
                        {text}
                      </RibbonCellText>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
