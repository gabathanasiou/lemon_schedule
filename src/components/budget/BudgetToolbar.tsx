import React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import type { ReportDesign } from '../../types';
import type { ScheduleBudgetDiff } from '../../lib/budget/diff';
import Button from '../Button';
import { GlideFilter } from '../GlideFilter';
import { BudgetEditMenu, type BudgetEditAction } from './BudgetEditMenu';

/**
 * The Budget mode's authoring actions (roadmap 334 + 348). A fragment so the
 * page can host it beside the Budget|Cost switch in ONE toolbar row.
 *
 * Item 356: the schedule-review status is a compact contextual button (icon
 * only while there is nothing to review, full label when there is), the
 * linked-lines label is gone, and Print/Export/Import live in ONE Edit menu.
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

  const printActions: BudgetEditAction[] = onPrintDesign
    ? printDesigns.map(design => ({
      label: `Print ${design.name.replace('Budget — ', '')}`,
      onClick: () => onPrintDesign(design),
    }))
    : [];
  const saveActions: BudgetEditAction[] = printDesigns.map(design => ({
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
      <div className="ml-auto flex items-center gap-1">
        <BudgetEditMenu
          printActions={printActions}
          saveActions={saveActions}
          exportActions={[
            { label: 'Export CSV', onClick: onExportCsv },
            { label: 'Export JSON', onClick: onExportJson },
          ]}
          onImport={onImport}
          importDisabled={readOnly}
        />
      </div>
    </>
  );
}
