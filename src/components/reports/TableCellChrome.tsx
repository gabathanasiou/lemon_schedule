import React, { useLayoutEffect, useRef, useState } from 'react';
import { FloatingChrome } from '../FloatingChrome';
import { CellRef } from '../../lib/reportTableMerges';

// Free-table cell chrome (roadmap 189) — the discoverable path to merge cells
// and format them, anchored to the focus cell via its stable `data-cell` id
// (same FloatingChrome recipe as the columns-mode TableColumnChrome). The
// controls body (including its chrome header) is shared with the docked
// inspector — see CustomCellControls.

interface TableCellChromeProps {
  focus: CellRef;
  children: React.ReactNode;
}

const TableCellChrome: React.FC<TableCellChromeProps> = ({ focus, children }) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [reference, setReference] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const card = anchorRef.current?.closest('[data-block-id]');
    if (!card) return;
    const cell = card.querySelector<HTMLElement>(`[data-cell="${focus.rowId}:${focus.colId}"]`);
    setReference(cell instanceof HTMLElement ? cell : (card as HTMLElement));
  }, [focus.rowId, focus.colId]);
  return (
    <>
      <div ref={anchorRef} className="chrome-anchor" aria-hidden />
      <FloatingChrome className="table-cell-chrome" reference={reference}>
        <div className="py-1.5">{children}</div>
      </FloatingChrome>
    </>
  );
};

export default TableCellChrome;
