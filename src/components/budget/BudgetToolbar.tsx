import React from 'react';
import { Download, FileUp, Plus, Printer, RefreshCw, Save } from 'lucide-react';
import type { ReportDesign } from '../../types';
import type { ScheduleBudgetDiff } from '../../lib/budget/diff';
import Button from '../Button';
import { GlideFilter } from '../GlideFilter';
import { BudgetActionButton, BudgetMenuButton, type BudgetAction } from './BudgetToolbarActions';

/**
 * The Budget mode's authoring actions (roadmap 334 + 348). A fragment so the
 * page can host it beside the Budget|Cost switch in ONE toolbar row.
 *
 * Item 356: the schedule-review status is a compact contextual button (icon
 * only while there is nothing to review, full label when there is).
 * Roadmap 363: Print / Save as / Export / Import are separate buttons; the
 * menus only hold their own variants, so no menu is a dumping ground.
 */
export function BudgetToolbar({
  readOnly, reviewDiff, rowFilter, onRowFilterChange, filterCounts,
  onAddMarkup, onOpenReview,
  printDesigns, onPrintDesign, onSaveDesign,
  onExportCsv, onExportJson, onImport,
}: {
  readOnly: boolean;
  reviewDiff: ScheduleBudgetDiff | null;
  rowFilter: string;
  onRowFilterChange: (value: string) => void;
  filterCounts: { shown: number; total: number };
  onAddMarkup: () => void;
  onOpenReview: () => void;
  printDesigns: ReportDesign[];
  onPrintDesign?: (design: ReportDesign) => void;
  onSaveDesign: (design: ReportDesign) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onImport: () => void;
}) {
  const updates = reviewDiff?.totalRows ?? 0;
  const upToDate = updates === 0;
  const reviewLabel = upToDate
    ? 'Up to date'
    : reviewDiff && reviewDiff.changeCount === 0
      ? `${reviewDiff.counts.check} to check from the schedule`
      : `${updates} update${updates === 1 ? '' : 's'} from the schedule`;

  const printActions: BudgetAction[] = onPrintDesign
    ? printDesigns.map(design => ({
      label: `Print ${design.name.replace('Budget — ', '')}`,
      onClick: () => onPrintDesign(design),
    }))
    : [];
  const saveActions: BudgetAction[] = printDesigns.map(design => ({
    label: `Save as ${design.name.replace('Budget — ', '')}`,
    onClick: () => onSaveDesign(design),
  }));

  return (
    <>
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
      <Button
        theme="light"
        onClick={onOpenReview}
        disabled={upToDate}
        icon={<RefreshCw className="w-3.5 h-3.5" />}
        collapse={upToDate}
        title="Review what changed in the schedule since this budget version was written"
      >
        {reviewLabel}
      </Button>
      <div className="ml-auto flex items-center gap-1 flex-wrap justify-end">
        {printActions.length > 0 && (
          <BudgetMenuButton
            icon={<Printer className="w-3.5 h-3.5" />}
            label="Print"
            actions={printActions}
            width="w-72"
            title="Print a budget report"
          />
        )}
        <BudgetMenuButton
          icon={<Save className="w-3.5 h-3.5" />}
          label="Save as"
          actions={saveActions}
          width="w-72"
          title="Save a budget report template as a report design"
        />
        <BudgetMenuButton
          icon={<Download className="w-3.5 h-3.5" />}
          label="Export"
          actions={[
            { label: 'Export CSV', onClick: onExportCsv },
            { label: 'Export JSON', onClick: onExportJson },
          ]}
          width="w-40"
          title="Export the budget"
        />
        <BudgetActionButton
          icon={<FileUp className="w-3.5 h-3.5" />}
          label="Import"
          onClick={onImport}
          disabled={readOnly}
          title="Import a budget JSON file"
        />
      </div>
    </>
  );
}
