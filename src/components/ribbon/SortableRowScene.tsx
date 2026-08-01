import React from 'react';
import { ComputedRow } from '../../lib/daybreakUtils';
import { sceneStyle, getFallbackStripColors, computeMergeGroups } from '../../lib/ribbonUtils';
import { SCENE_RIBBON_DEFAULTS, RibbonCell } from '../../types';
import { Scene } from '../../types';
import { useProject } from '../../store';
import { CellInput } from '../CellInput';
import { EntityDropdown } from '../EntityDropdown';
import { RowRenderCtx } from './rowRenderTypes';

export default function SortableRowScene({ row, scene, ctx }: { row: ComputedRow; scene: Scene | null; ctx: RowRenderCtx }) {
  const { state } = useProject();
  const {
    isSelected, isFaded, isCompact, ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding,
    palette, violationBadge, renderCellFlex, updateScene, inputClass, sel,
  } = ctx;

  if (!scene) return null;

  const rowStyle = sceneStyle(scene, palette?.sceneColors, getFallbackStripColors(palette), palette?.colorRules);
  if (isSelected && !isFaded) {
    rowStyle.background = sel.background;
    rowStyle.color = sel.color;
  }

  // ── Ribbon-based rendering (non-compact) ──
  if (ribbon && ribbon.length > 0 && !isCompact) {
    const cw = colWidths ?? [];
    return (
        <div className="flex items-stretch min-w-0">
          <div className="flex-1 min-w-0 flex flex-col" style={{ ...rowStyle, paddingLeft: edgePadding ?? 2, paddingRight: edgePadding ?? 2 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: cw.map(w => `${w}%`).join(' '),
              gridTemplateRows: `${edgePadding ?? 2}px repeat(${ribbon.length}, auto) ${edgePadding ?? 2}px`,
            }}>
              {(() => {
                const mgroups = computeMergeGroups(ribbon);
                const hiddenIds = new Set<string>();
                for (const g of mgroups) {
                  if (g.direction === 'v') {
                    for (let ri = g.rowIndex + 1; ri < g.rowIndex + g.span; ri++) {
                      const cell = ribbon[ri]?.cells[g.colIndex];
                      if (cell) hiddenIds.add(cell.id);
                    }
                  } else {
                    for (let ci = g.colIndex + 1; ci < g.colIndex + g.span; ci++) {
                      const cell = ribbon[g.rowIndex]?.cells[ci];
                      if (cell) hiddenIds.add(cell.id);
                    }
                  }
                }
                const items: { cell: RibbonCell; col: number; row: number; vSpan: number; hSpan: number }[] = [];
                for (let ri = 0; ri < ribbon.length; ri++) {
                  for (let ci = 0; ci < ribbon[ri].cells.length; ci++) {
                    const cell = ribbon[ri].cells[ci];
                    if (hiddenIds.has(cell.id)) continue;
                    const g = mgroups.find(gg => gg.colIndex === ci && gg.rowIndex === ri);
                    const vSpan = g?.direction === 'v' ? (g.span || 1) : 1;
                    const hSpan = g?.direction === 'h' ? (g.span || 1) : 1;
                    items.push({ cell, col: ci, row: ri, vSpan, hSpan });
                  }
                }
                return items.map(({ cell, col, row, vSpan, hSpan }) => {
                  const isLastInRow = hSpan > 1 ? col + hSpan - 1 >= ribbon[0].cells.length - 1 : col === ribbon[0].cells.length - 1;
                  return renderCellFlex(cell, isLastInRow, row + vSpan - 1 >= ribbon.length - 1, rowStyle.color, col, row, vSpan, hSpan);
                });
              })()}
            </div>
          </div>
        </div>
    );
  }

  if (isCompact) {
    return (
        <div className="flex items-stretch min-w-0">
          <table className="schedule-table flex-1 min-w-0">
              <tbody>
                <tr style={rowStyle}>
                  <td className="col-sc relative">
                    <CellInput
                      value={scene.sceneNumber}
                      onChange={val => updateScene({sceneNumber: val})}
                      className={`${inputClass} text-center`}
                      readOnly
                    />
                    {violationBadge}
                  </td>
                  <td colSpan={3} className="col-set">
                    <span className="uppercase truncate block">{scene.intExt}. {scene.set} - {scene.dayNight}</span>
                    {scene.description && <span className="opacity-60 truncate block">{scene.description}</span>}
                  </td>
                  <td className="col-cast">
                    <EntityDropdown value={scene.cast} onChange={val => updateScene({cast: val})} className="text-right w-full" readOnly displayMode="id" />
                </td>
              </tr>
              {!isCompact && (() => {
                const ribbon = state.present.sceneRibbon || SCENE_RIBBON_DEFAULTS;
                const breakdownKeys = ['props', 'wardrobe', 'makeup', 'backgroundActors', 'stunts', 'vehicles', 'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept', 'notes'];
                const ribbonBreakdown = ribbon.filter(c => breakdownKeys.includes(c.key));
                if (ribbonBreakdown.length === 0) return null;
                return (
                  <tr style={rowStyle}>
                    <td className="col-sc" />
                    {!isCompact && <td className="col-call" />}
                    {!isCompact && <td className="col-dur" />}
                    <td colSpan={3} style={{ padding: '2px 4px', opacity: 0.7 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {ribbonBreakdown.map(c => {
                          const val = (scene as any)[c.key] as string;
                          if (!val) return null;
                          return (
                            <span key={c.key} style={{ fontSize: '7pt', whiteSpace: 'nowrap' }}>
                              <strong>{c.key}:</strong> {val}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })()}
              </tbody>
            </table>
          </div>
      );
  }

  return null;
}
