import React from 'react';
import { Project } from '../../types';
import { CAST_LIST_STYLE } from './printStyles';

export const CastListPrint: React.FC<{ castMembers: Project['castMembers']; relevantCastIds: Set<string> }> = ({ castMembers, relevantCastIds }) => {
  const sorted = [...castMembers]
    .filter(m => relevantCastIds.has(m.id))
    .sort((a, b) => {
      const na = parseInt(a.id, 10);
      const nb = parseInt(b.id, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  if (sorted.length === 0) return null;

  const ROWS = 10;
  const COLS = 3;
  const grid: (typeof sorted[0] | null)[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let i = 0; i < sorted.length; i++) {
    const col = Math.floor(i / ROWS);
    const row = i % ROWS;
    if (col < COLS) grid[row][col] = sorted[i];
  }

  return (
    <div className="cast-list-page">
      <style>{CAST_LIST_STYLE}</style>
      <h2 className="cast-list-title">CAST LIST</h2>
      <table className="cast-list-table">
        <tbody>
          {grid.map((row, ri) => (
            <tr key={ri}>
              {row.map((m, ci) => (
                <td key={ci} className="cast-list-cell">
                  {m ? <><span className="cast-list-id">{m.id}.</span> {m.name}</> : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
