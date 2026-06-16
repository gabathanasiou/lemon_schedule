import React from 'react';
import { Scene, RibbonRow } from '../types';
import { getRibbonCellBaseStyle, getFieldValue, sceneStyle } from '../lib/ribbonUtils';

function fmt(prefix: string | undefined, val: string, suffix: string | undefined): string {
  return `${prefix || ''}${prefix && val ? '\u00A0' : ''}${val}${suffix && val ? '\u00A0' : ''}${suffix || ''}`;
}

export function RibbonPreview({ scene, ribbon, cellPadding = 3, edgePadding = 2, onDoubleClick }: {
  scene: Scene;
  ribbon: RibbonRow[];
  cellPadding?: number;
  edgePadding?: number;
  onDoubleClick?: () => void;
}) {
  if (!ribbon || ribbon.length === 0) return null;

  const rowBg = sceneStyle(scene);

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
            {ribbon.map((row, ri) => (
              <div key={row.id || ri} className="flex w-full min-h-0">
                {row.cells.map(cell => {
                  const style = getRibbonCellBaseStyle(cell, cellPadding);
                  const val = cell.field ? getFieldValue(cell.field, scene) : '';
                  const text = cell.textContent || fmt(cell.prefix, val, cell.suffix);
                  return (
                    <div key={cell.id} style={style}>
                      <span style={{ display: 'block', fontSize: '8pt', lineHeight: 1.1 }}>
                        {text}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
