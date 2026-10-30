import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Seg } from '@gabriel/ui-kit';
import type { Project, ReportBlock } from '../../types';
import { budgetReportColumnDefs, budgetReportMode } from '../../lib/reportBudget';
import { ContentRow, EditorCheckbox, EditorGroup } from './reportEditorLayout';
import Checklist from '../Checklist';
import DateField from '../DateField';
import Button from '../Button';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';

/**
 * Budget block inspector (`budgetTable`, roadmap 334). Extracted from
 * `blockControls.tsx` to keep that file's per-block sections readable; it
 * renders the same `ContentRow`/`EditorCheckbox` rows on every editor surface.
 */
interface BudgetBlockControlsProps {
  block: ReportBlock;
  project: Project;
  readOnly: boolean;
  onPatch: (patch: Partial<ReportBlock>) => void;
  panel?: boolean;
  /** The shared block Title section (rendered after the budget controls). */
  title?: React.ReactNode;
}

const BudgetBlockControls: React.FC<BudgetBlockControlsProps> = ({ block, project, readOnly, onPatch, panel, title }) => {
  const budget = project.budget;
  const mode = budgetReportMode(block.budgetMode);
  const [versionMenu, setVersionMenu] = useState<'primary' | 'compare' | null>(null);

  const versionItems = useMemo(
    () => (budget?.versions || []).map(v => ({ id: v.id, name: v.name })),
    [budget],
  );
  const primaryVersionId = block.budgetVersionId || budget?.activeVersionId || '';
  const compareVersionId = block.budgetCompareVersionId || '';
  const versionName = (id: string) => versionItems.find(v => v.id === id)?.name || 'Select version';

  const categoryItems = useMemo(() => [...(budget?.categories || [])]
    .sort((a, b) => a.sort - b.sort || a.number.localeCompare(b.number))
    .map(c => ({ id: c.id, label: `${c.number} ${c.name}`.trim() })), [budget]);

  const accountItems = useMemo(() => {
    const cats = block.budgetCategories;
    return [...(budget?.accounts || [])]
      .filter(a => !cats || cats.length === 0 || cats.includes(a.categoryId))
      .sort((a, b) => a.sort - b.sort || a.number.localeCompare(b.number))
      .map(a => ({ id: a.id, label: `${a.number} ${a.name}`.trim() }));
  }, [budget, block.budgetCategories]);

  const columnItems = useMemo(() => budgetReportColumnDefs(mode)
    // Percent/fringes/notes have their own toggles below.
    .filter(c => c.key !== 'percent' && c.key !== 'fringes' && c.key !== 'notes')
    .map(c => ({ id: c.key, label: c.label })), [mode]);

  if (!budget) {
    return (
      <ContentRow label="Budget">
        <span className="text-[10px] text-[color:var(--ui-text-muted)]">No budget yet — create one in the Budget tab.</span>
      </ContentRow>
    );
  }

  const selectedCategories = block.budgetCategories ?? categoryItems.map(i => i.id);
  const selectedAccounts = block.budgetAccounts ?? accountItems.map(i => i.id);
  const columnKeys = columnItems.map(i => i.id);
  const selectedColumns = block.budgetColumns && block.budgetColumns.length > 0 ? block.budgetColumns : columnKeys;

  const toggleCategory = (id: string) => {
    const cur = new Set(selectedCategories);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    const next = categoryItems.map(i => i.id).filter(k => cur.has(k));
    onPatch({ budgetCategories: next.length === categoryItems.length ? undefined : next });
  };

  const toggleAccount = (id: string) => {
    const cur = new Set(selectedAccounts);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    const next = accountItems.map(i => i.id).filter(k => cur.has(k));
    onPatch({ budgetAccounts: next.length === accountItems.length ? undefined : next });
  };

  const toggleColumn = (id: string) => {
    const cur = new Set(selectedColumns);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    const next = columnKeys.filter(k => cur.has(k));
    // Keep at least one column — a budget table with no columns can't render.
    if (next.length === 0) return;
    onPatch({ budgetColumns: next.length === columnKeys.length ? undefined : next });
  };

  return (
    <>
      <ContentRow key="mode" label="Mode">
        <Seg
          value={mode}
          options={[
            { v: 'topsheet', l: 'Top Sheet' },
            { v: 'accounts', l: 'Accounts' },
            { v: 'lines', l: 'Lines' },
            { v: 'comparison', l: 'Compare' },
            { v: 'costReport', l: 'Cost Report' },
          ]}
          onChange={v => onPatch({ budgetMode: v as 'topsheet' | 'accounts' | 'lines' | 'comparison' | 'costReport' })}
          disabled={readOnly}
          stretch={panel}
        />
      </ContentRow>

      {mode === 'comparison' && (
        <>
          <ContentRow key="budgetVersion" label="Budget">
            <DropdownMenu
              open={versionMenu === 'primary'}
              onOpenChange={open => setVersionMenu(open ? 'primary' : null)}
              width="w-56"
              theme="dark"
              trigger={(
                <Button theme="dark" className="w-full justify-between" disabled={readOnly}>
                  <span className="truncate text-xs">{versionName(primaryVersionId)}</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </Button>
              )}
            >
              {versionItems.map(v => (
                <DropdownItem
                  key={v.id}
                  onClick={() => {
                    onPatch({ budgetVersionId: v.id });
                    setVersionMenu(null);
                  }}
                  icon={v.id === primaryVersionId ? <span className="text-[10px]">✓</span> : undefined}
                >
                  <span className="truncate">{v.name}</span>
                </DropdownItem>
              ))}
            </DropdownMenu>
          </ContentRow>
          {versionItems.length > 1 ? (
            <ContentRow key="compareVersion" label="Compare to">
              <DropdownMenu
                open={versionMenu === 'compare'}
                onOpenChange={open => setVersionMenu(open ? 'compare' : null)}
                width="w-56"
                theme="dark"
                trigger={(
                  <Button theme="dark" className="w-full justify-between" disabled={readOnly}>
                    <span className="truncate text-xs">{versionName(compareVersionId)}</span>
                    <ChevronDown className="w-3 h-3 shrink-0" />
                  </Button>
                )}
              >
                {versionItems.map(v => (
                  <DropdownItem
                    key={v.id}
                    onClick={() => {
                      onPatch({ budgetCompareVersionId: v.id });
                      setVersionMenu(null);
                    }}
                    icon={v.id === compareVersionId ? <span className="text-[10px]">✓</span> : undefined}
                  >
                    <span className="truncate">{v.name}</span>
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </ContentRow>
          ) : (
            <ContentRow key="compareVersion" label="Compare to">
              <span className="text-[10px] text-[color:var(--ui-text-muted)]">
                Add a second budget version to compare.
              </span>
            </ContentRow>
          )}
        </>
      )}

      {mode === 'costReport' && (
        <>
          <ContentRow key="asOf" label="As of">
            <DateField
              value={block.costAsOf ? [block.costAsOf] : []}
              onChange={dates => onPatch({ costAsOf: dates[dates.length - 1] })}
              placeholder="Print date"
              initialView={block.costAsOf}
            />
          </ContentRow>
          <ContentRow key="period" label="Period">
            <div className="flex items-center gap-1.5">
              <DateField
                value={block.costPeriod?.from ? [block.costPeriod.from] : []}
                onChange={dates => onPatch({ costPeriod: { from: dates[dates.length - 1] || '', to: block.costPeriod?.to || '' } })}
                placeholder="From"
                initialView={block.costPeriod?.from || block.costAsOf}
              />
              <span className="text-[10px] text-[color:var(--ui-text-faint)]">–</span>
              <DateField
                value={block.costPeriod?.to ? [block.costPeriod.to] : []}
                onChange={dates => onPatch({ costPeriod: { from: block.costPeriod?.from || '', to: dates[dates.length - 1] || '' } })}
                placeholder="To"
                initialView={block.costPeriod?.to || block.costAsOf}
              />
            </div>
          </ContentRow>
        </>
      )}

      <ContentRow key="categories" label="Categories" tall>
        <Checklist
          theme="dark"
          className={panel ? 'w-full' : 'w-64'}
          items={categoryItems}
          selected={selectedCategories}
          disabled={readOnly}
          maxHeight={160}
          allSelected={!block.budgetCategories}
          onToggleAll={() => onPatch({ budgetCategories: block.budgetCategories ? undefined : [] })}
          onToggle={id => toggleCategory(String(id))}
        />
      </ContentRow>

      {accountItems.length > 0 && (
        <ContentRow key="accounts" label="Accounts" tall>
          <Checklist
            theme="dark"
            className={panel ? 'w-full' : 'w-64'}
            items={accountItems}
            selected={selectedAccounts}
            disabled={readOnly}
            maxHeight={160}
            allSelected={!block.budgetAccounts}
            onToggleAll={() => onPatch({ budgetAccounts: block.budgetAccounts ? undefined : [] })}
            onToggle={id => toggleAccount(String(id))}
          />
        </ContentRow>
      )}

      <ContentRow key="columns" label="Columns" tall>
        <Checklist
          theme="dark"
          className={panel ? 'w-full' : 'w-64'}
          items={columnItems}
          selected={selectedColumns}
          disabled={readOnly}
          maxHeight={160}
          onToggle={id => toggleColumn(String(id))}
        />
      </ContentRow>

      <ContentRow key="display" label="Show">
        <EditorGroup className={panel ? 'w-full flex-wrap' : 'flex-wrap'}>
          <EditorCheckbox checked={block.showZero === true} disabled={readOnly} onChange={on => onPatch({ showZero: on })} label="Zero rows" />
          {mode !== 'costReport' && mode !== 'comparison' && (
            <EditorCheckbox checked={block.showFringes !== false} disabled={readOnly} onChange={on => onPatch({ showFringes: on })} label="Fringes" />
          )}
          <EditorCheckbox
            checked={block.showPercent !== false}
            disabled={readOnly}
            onChange={on => onPatch({ showPercent: on })}
            label={mode === 'comparison' ? 'Variance %' : mode === 'costReport' ? '% used' : '% of total'}
          />
          {mode !== 'costReport' && mode !== 'comparison' && (
            <EditorCheckbox checked={block.showNotes === true} disabled={readOnly} onChange={on => onPatch({ showNotes: on })} label="Notes" />
          )}
        </EditorGroup>
      </ContentRow>

      {title}
    </>
  );
};

export default BudgetBlockControls;
