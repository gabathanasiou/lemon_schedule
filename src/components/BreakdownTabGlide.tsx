import React, { useMemo, useCallback, useState } from 'react';
import DataEditor, {
  GridCellKind,
  type GridCell,
  type GridColumn,
  type Item,
  type GridSelection,
  CompactSelection,
  type GridSelection as GS,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';

const cols: GridColumn[] = [
  { title: 'One', width: 100 },
  { title: 'Two', width: 100 },
];

export function GlideBreakdownTab({ onOpenSheet }: { onOpenSheet?: (i: number) => void }) {
  const [selection, setSelection] = useState<GS>({ columns: CompactSelection.empty(), rows: CompactSelection.empty() });

  const getCellContent = useCallback(([col, row]: Item): GridCell => {
    return { kind: GridCellKind.Text, data: `C${col}R${row}`, displayData: `C${col}R${row}`, allowOverlay: true };
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
      <div style={{ height: 500 }}>
        <DataEditor
          columns={cols}
          rows={100}
          getCellContent={getCellContent}
          gridSelection={selection}
          onGridSelectionChange={setSelection}
        />
      </div>
    </div>
  );
}
