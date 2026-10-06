import React from 'react';
import { FloatingChrome } from '../FloatingChrome';

// Free-table cell chrome (roadmap 189) — the discoverable path to merge cells
// and format them. Anchored to the whole TABLE CARD (the implicit
// `.ui-chrome-anchor` covers the card), exactly like the block chrome: the
// panel floats above the table's visible top instead of covering the row
// being worked on. The controls body (including its chrome header) is shared
// with the docked inspector — see CustomCellControls.

const TableCellChrome: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <FloatingChrome className="table-cell-chrome" anchorMode="visible">
    <div className="py-1.5">{children}</div>
  </FloatingChrome>
);

export default TableCellChrome;
