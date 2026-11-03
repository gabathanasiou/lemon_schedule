import React from 'react';
import { Download, FileUp, Plus, Printer, RefreshCw, Sparkles } from 'lucide-react';
import type { ReportDesign } from '../../types';
import type { ScheduleBudgetDiff } from '../../lib/budget/diff';
import Button from '../Button';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import DropdownSubmenu from '../DropdownSubmenu';
import { GlideFilter } from '../GlideFilter';

/**
 * The Budget mode's authoring actions (roadmap 334 + 348). A fragment so the
 * page can host it beside the Budget|Cost switch in ONE toolbar row.
 */
export function BudgetToolbar({
  readOnly, reviewDiff, linkedLabel, rowFilter, onRowFilterChange, filterCounts,
  onAddCategory, onAddMarkup, onOpenReview,
  printDesigns, onPrintDesign, onSaveDesign,
  onExportCsv, onExportJson, onImport,
}: {
  readOnly: boolean;
  reviewDiff: ScheduleBudgetDiff | null;
  linkedLabel: string;
  rowFilter: string;
  onRowFilterChange: (value: string) => void;
  filterCounts: { shown: number; total: number };
  onAddCategory: () => void;
  onAddMarkup: () => void;
  onOpenReview: () => void;
  printDesigns: ReportDesign[];
  onPrintDesign?: (design: ReportDesign) => void;
  onSaveDesign: (design: ReportDesign) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onImport: () => void;
}) {
  const [printOpen, setPrintOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);

  return (
    <>
      <Button theme="light" onClick={onAddCategory} disabled={readOnly}>
        <Plus className="w-3.5 h-3.5" /> Category
      </Button>
      <Button theme="light" onClick={onAddMarkup} disabled={readOnly}>
        <Plus className="w-3.5 h-3.5" /> Markup
      </Button>
      <GlideFilter
        value={rowFilter}
        onChange={onRowFilterChange}
        total={filterCounts.total}
        shown={filterCounts.shown}
        placeholder="Filter the budget…"
      />
      <span className="ml-1 flex items-center gap-1 text-[10px] text-[color:var(--ui-text-faint)]">
        <Sparkles className="w-3 h-3" /> {linkedLabel}
      </span>
      <Button
        theme="light"
        onClick={onOpenReview}
        disabled={!reviewDiff || reviewDiff.totalRows === 0}
        title="Review what changed in the schedule since this budget version was written"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        {!reviewDiff || reviewDiff.totalRows === 0
          ? 'Up to date'
          : reviewDiff.changeCount === 0
            ? `${reviewDiff.counts.check} to check from the schedule`
            : `${reviewDiff.totalRows} update${reviewDiff.totalRows === 1 ? '' : 's'} from the schedule`}
      </Button>
      <div className="ml-auto flex items-center gap-1">
        {onPrintDesign && (
          <DropdownMenu
            open={printOpen}
            onOpenChange={setPrintOpen}
            width="w-56"
            theme="light"
            trigger={<Button theme="light"><Printer className="w-3.5 h-3.5" /> Print</Button>}
          >
            {printDesigns.map(design => (
              <DropdownItem
                key={`print-${design.id}`}
                onClick={() => { setPrintOpen(false); onPrintDesign(design); }}
              >
                Print {design.name.replace('Budget — ', '')}
              </DropdownItem>
            ))}
            <DropdownDivider />
            <DropdownSubmenu id="save-budget-design" label="Save as design" width="w-56">
              {printDesigns.map(design => (
                <DropdownItem
                  key={`save-${design.id}`}
                  onClick={() => { setPrintOpen(false); onSaveDesign(design); }}
                >
                  {design.name.replace('Budget — ', '')}
                </DropdownItem>
              ))}
            </DropdownSubmenu>
          </DropdownMenu>
        )}
        <DropdownMenu
          open={exportOpen}
          onOpenChange={setExportOpen}
          width="w-44"
          theme="light"
          trigger={<Button theme="light"><Download className="w-3.5 h-3.5" /> Export</Button>}
        >
          <DropdownItem onClick={() => { setExportOpen(false); onExportCsv(); }}>Export CSV</DropdownItem>
          <DropdownItem onClick={() => { setExportOpen(false); onExportJson(); }}>Export JSON</DropdownItem>
        </DropdownMenu>
        <Button theme="light" onClick={onImport} disabled={readOnly}>
          <FileUp className="w-3.5 h-3.5" /> Import
        </Button>
      </div>
    </>
  );
}
