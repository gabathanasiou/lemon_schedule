import React, { useMemo, useState } from 'react';
import { ReportBlock, ReportCollection, ReportTableColumn } from '../../types';
import { Project } from '../../types';
import { baseValidCollections, contextualCollectionsFor, tableItemCollection, tableFieldScope } from '../../lib/reportBlocks';
import { getReportFieldDefs, fieldsForScope, ReportFieldDef, DAY_LIST_FIELD_KEYS } from '../../lib/reportFields';
import { normalizeColWidths } from '../../lib/ribbonDefaults';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import { DAY_FORMAT_OPTIONS, DayFormatMode } from '../../lib/utils';
import { FieldPicker } from './FieldPicker';
import CollectionMenu from './CollectionMenu';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import { Tooltip } from '../Tooltip';
import { ArrowUp, ArrowDown, Copy, Trash2, Plus, Minus, Check, ChevronDown, EyeOff } from 'lucide-react';

const FONTS = ['Helvetica', 'Arial', 'Times New Roman', 'Georgia', 'Courier New'];

// Lego scope checkbox: "Only {collection} in this {parent}". Works for every
// parent/collection pair; unsupported pairs (crew — no scene data) simply
// don't filter. Parent labels map the parent collection to its singular item.
const BASE_COLLECTION_LABELS: Record<string, string> = {
  scenes: 'scenes', scenesOfDay: 'scenes', scenesOfElement: 'scenes', scenesOfCast: 'scenes',
  days: 'days', daysOfCast: 'days',
  elements: 'elements', elementsOfCategory: 'elements', elementsOfScene: 'elements',
  categories: 'categories', cast: 'cast', crew: 'crew',
};

const PARENT_LABELS: Record<string, string> = {
  days: 'day', daysOfCast: 'day',
  scenes: 'scene', scenesOfDay: 'scene', scenesOfElement: 'scene', scenesOfCast: 'scene', elementsOfScene: 'scene',
  elements: 'element', elementsOfCategory: 'element',
  categories: 'category', cast: 'cast member', crew: 'crew member',
};

// Contextual collections are already scoped by their parent item — the Lego
// checkbox only appears for explicit base-collection selections.
const CONTEXTUAL_COLLECTIONS = new Set(['scenesOfDay', 'scenesOfElement', 'scenesOfCast', 'daysOfCast', 'elementsOfCategory', 'elementsOfScene']);

const selCls = 'bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 outline-none focus:border-zinc-500';
const inputCls = 'bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 outline-none focus:border-zinc-500 w-full';
const labelCls = 'text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1';

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <span className={labelCls}>{label}</span>
    {children}
  </div>
);

const Seg: React.FC<{ value: string; options: { v: string; l: string }[]; onChange: (v: string) => void; disabled?: boolean }> = ({ value, options, onChange, disabled }) => (
  <div className="flex border border-zinc-700 rounded p-0.5 gap-0.5">
    {options.map(o => (
      <button
        key={o.v}
        disabled={disabled}
        onClick={() => onChange(o.v)}
        className={`px-2 py-0.5 rounded text-xs transition-colors disabled:opacity-30 ${value === o.v ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
      >
        {o.l}
      </button>
    ))}
  </div>
);

const ToolButton: React.FC<{ onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode }> = ({ onClick, disabled, title, children }) => (
  <Tooltip content={title}>
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none"
    >
      {children}
    </button>
  </Tooltip>
);

const NestedTableMenu: React.FC<{
  block: ReportBlock;
  parentCollection: ReportCollection;
  allCategoryKeys: { key: string; isCustom: boolean }[];
  categoryLabelLookup: Record<string, string>;
  customCategories?: { key: string; icon?: string }[];
  disabled: boolean;
  onPatch: (patch: Partial<ReportBlock>) => void;
}> = ({ block, parentCollection, allCategoryKeys, categoryLabelLookup, customCategories, disabled, onPatch }) => {
  // Menu lists BASE collections only (contextual variants are implied by the
  // Lego scope checkbox); a legacy explicit contextual value stays preserved.
  const contextual = contextualCollectionsFor(parentCollection);
  const collections: ReportCollection[] = [];
  const preserved = block.collection && !contextual.includes(block.collection) && block.collection !== 'scenes' && block.collection !== 'cast'
    ? block.collection
    : null;
  if (preserved) collections.push(preserved as ReportCollection);
  for (const c of baseValidCollections(parentCollection)) {
    if (c !== 'cast' && !collections.includes(c)) collections.push(c);
  }

  return (
    <CollectionMenu
      value={tableItemCollection(block, parentCollection)}
      category={block.category || 'props'}
      collections={collections}
      categoryKeys={allCategoryKeys}
      categoryLabels={categoryLabelLookup}
      customCategories={customCategories}
      disabled={disabled}
      parentCollection={parentCollection}
      scopedToParent={block.scopedToParent !== false}
      onChange={(c, cat) => onPatch(cat ? { collection: c, category: cat } : { collection: c })}
    />
  );
};

const ExcludeCategoriesMenu: React.FC<{
  excluded: string[];
  categoryKeys: { key: string; isCustom: boolean }[];
  categoryLabels: Record<string, string>;
  disabled: boolean;
  onChange: (excluded: string[]) => void;
}> = ({ excluded, categoryKeys, categoryLabels, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  const excludedSet = new Set(excluded);
  const toggle = (key: string) => {
    const next = new Set(excludedSet);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange([...next]);
  };
  const label = excluded.length > 0 ? `${excluded.length} excluded` : 'None';
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      width="w-44"
      trigger={
        <button
          type="button"
          disabled={disabled}
          className={`flex items-center justify-between gap-1 w-44 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 disabled:opacity-30 disabled:pointer-events-none`}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
        </button>
      }
    >
      {categoryKeys.map(({ key }) => (
        <DropdownItem
          key={key}
          keepOpen
          onClick={() => toggle(key)}
          icon={excludedSet.has(key) ? <Check className="w-3.5 h-3.5" /> : undefined}
        >
          {categoryLabels[key] || key}
        </DropdownItem>
      ))}
    </DropdownMenu>
  );
};

interface ReportToolbarProps {
  block: ReportBlock | null;
  parentCollection?: ReportCollection;
  parentCategory?: string;
  project: Project;
  readOnly: boolean;
  selCol?: { colIndex: number; colsCount: number } | null;
  onPatch: (patch: Partial<ReportBlock>) => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onInsertColumnAt: (colIndex: number) => void;
  onAddTextToColumn: () => void;
}

const ReportToolbar: React.FC<ReportToolbarProps> = ({ block, parentCollection, parentCategory, project, readOnly, selCol, onPatch, onInsertAbove, onInsertBelow, onDuplicate, onRemove, onMove, onInsertColumnAt, onAddTextToColumn }) => {
  const allFields = useMemo(() => getReportFieldDefs(project), [project]);
  const contextFields = useMemo(() => fieldsForScope(allFields, parentCollection, parentCategory), [allFields, parentCollection, parentCategory]);

  const categoryLabelLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of ELEMENT_CATEGORIES) map[c.key] = getLabel(c.key, c.label, project.categoryLabels);
    for (const c of project.customCategories || []) map[c.key] = c.label;
    return map;
  }, [project.categoryLabels, project.customCategories]);

  const allCategoryKeys = useMemo(() => {
    const keys: { key: string; isCustom: boolean }[] = [];
    const seen = new Set<string>();
    for (const c of ELEMENT_CATEGORIES) { if (!seen.has(c.key)) { seen.add(c.key); keys.push({ key: c.key, isCustom: false }); } }
    for (const c of project.customCategories || []) { if (!seen.has(c.key)) { seen.add(c.key); keys.push({ key: c.key, isCustom: true }); } }
    return keys;
  }, [project.customCategories]);

  if (!block) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
        <span className="text-xs text-zinc-600">Select a block to edit it. Click an item in the palette to add it.</span>
      </div>
    );
  }

  const disabled = readOnly;

  const fieldOptions = (scope: string | null | undefined) => fieldsForScope(allFields, scope, block.category);

  // Day-list fields (Work/Hold/Travel Days) get the day-format dropdown — it
  // applies to every day-list field/column/token in this block.
  const hasDayList = block.type === 'text'
    ? [...DAY_LIST_FIELD_KEYS].some(k => (block.text || '').includes(k))
    : block.type === 'field' ? DAY_LIST_FIELD_KEYS.has(block.field || '')
    : block.type === 'table' ? (block.columns || []).some(c => DAY_LIST_FIELD_KEYS.has(c.field))
    : false;

  const tableOps = {
    addColumn: () => {
      const cols = block.columns || [];
      const n = cols.length;
      onPatch({
        columns: normalizeColWidths([...(cols.map(c => c.width)), n === 0 ? 100 : 10]).map((w, i) => i < n ? { ...cols[i], width: w } : { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, field: '', width: w }),
      });
    },
    removeColumn: () => {
      const cols = block.columns || [];
      if (cols.length <= 1) return;
      const next = cols.slice(0, -1);
      onPatch({ columns: normalizeColWidths(next.map(c => c.width)).map((w, i) => ({ ...next[i], width: w })) });
    },
    patchColumn: (ci: number, patch: Partial<ReportTableColumn>) => {
      const cols = block.columns || [];
      onPatch({ columns: cols.map((c, i) => i === ci ? { ...c, ...patch } : c) });
    },
  };

  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
      {selCol ? (
        <div className="flex items-center gap-1 pt-0.5">
          <ToolButton onClick={() => onInsertColumnAt(selCol.colIndex)} disabled={disabled} title="Insert column before"><Plus className="w-3.5 h-3.5" /> Before</ToolButton>
          <ToolButton onClick={() => onInsertColumnAt(selCol.colIndex + 1)} disabled={disabled} title="Insert column after"><Plus className="w-3.5 h-3.5" /> After</ToolButton>
          <ToolButton onClick={onAddTextToColumn} disabled={disabled} title="Add text block to column"><Plus className="w-3.5 h-3.5" /> Text</ToolButton>
          <ToolButton onClick={onRemove} disabled={disabled || selCol.colsCount <= 1} title="Delete column"><Trash2 className="w-3.5 h-3.5" /></ToolButton>
        </div>
      ) : (
        <div className="flex items-center gap-1 pt-0.5">
          <ToolButton onClick={onInsertAbove} disabled={disabled} title="Insert above"><Plus className="w-3.5 h-3.5" /> Above</ToolButton>
          <ToolButton onClick={onInsertBelow} disabled={disabled} title="Insert below"><Plus className="w-3.5 h-3.5" /> Below</ToolButton>
          <ToolButton onClick={() => onMove(-1)} disabled={disabled} title="Move up"><ArrowUp className="w-3.5 h-3.5" /></ToolButton>
          <ToolButton onClick={() => onMove(1)} disabled={disabled} title="Move down"><ArrowDown className="w-3.5 h-3.5" /></ToolButton>
          <ToolButton onClick={onDuplicate} disabled={disabled} title="Duplicate"><Copy className="w-3.5 h-3.5" /></ToolButton>
          <ToolButton onClick={onRemove} disabled={disabled} title="Delete"><Trash2 className="w-3.5 h-3.5" /></ToolButton>
        </div>
      )}

      {block.type === 'text' && (
        <Row label="Text content ({{field}} tokens)">
          <textarea
            className={inputCls}
            rows={2}
            disabled={disabled}
            value={block.text || ''}
            onChange={e => onPatch({ text: e.target.value })}
          />
          <FieldPicker
            value=""
            fields={contextFields}
            onChange={f => onPatch({ text: `${block.text || ''}{{${f}}}` })}
            disabled={disabled}
            placeholder="Insert attribute…"
            scope={parentCollection}
            className="w-44 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 disabled:opacity-30"
          />
        </Row>
      )}

      {block.type === 'field' && (
        <>
          <Row label="Field">
            <FieldPicker
              value={block.field || ''}
              fields={contextFields}
              onChange={f => onPatch({ field: f })}
              disabled={disabled}
              placeholder="Select field…"
              scope={parentCollection}
              className="w-44 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 disabled:opacity-30"
            />
          </Row>
          <Row label="Prefix">
            <input className={inputCls} disabled={disabled} value={block.prefix || ''} onChange={e => onPatch({ prefix: e.target.value })} />
          </Row>
          <Row label="Suffix">
            <input className={inputCls} disabled={disabled} value={block.suffix || ''} onChange={e => onPatch({ suffix: e.target.value })} />
          </Row>
          {block.field && allFields.find(f => f.key === block.field)?.multiValue && (
            <>
              <Row label="Item prefix">
                <input className={inputCls} disabled={disabled} value={block.itemPrefix || ''} onChange={e => onPatch({ itemPrefix: e.target.value })} placeholder="e.g. —" />
              </Row>
              <Row label="Item suffix">
                <input className={inputCls} disabled={disabled} value={block.itemSuffix || ''} onChange={e => onPatch({ itemSuffix: e.target.value })} placeholder="e.g. —" />
              </Row>
              <Row label="Separator">
                <input className={inputCls} disabled={disabled} value={block.itemSeparator ?? ', '} onChange={e => onPatch({ itemSeparator: e.target.value })} />
              </Row>
            </>
          )}
        </>
      )}

      {(block.type === 'repeat' || block.type === 'table') && (
        <>
          {block.type === 'repeat' ? (
            <Row label="Repeat over">
              <CollectionMenu
                value={block.collection || 'scenes'}
                category={block.category || 'props'}
                collections={[...contextualCollectionsFor(parentCollection), ...baseValidCollections(parentCollection).filter(c => c !== 'cast')]}
                categoryKeys={allCategoryKeys}
                categoryLabels={categoryLabelLookup}
                customCategories={project.customCategories}
                disabled={disabled}
                parentCollection={parentCollection}
                scopedToParent={block.scopedToParent !== false}
                onChange={(c, cat) => onPatch(cat ? { collection: c, category: cat } : { collection: c })}
              />
            </Row>
          ) : (
            <Row label="Table over">
              {parentCollection ? (
                <NestedTableMenu block={block} parentCollection={parentCollection} allCategoryKeys={allCategoryKeys} categoryLabelLookup={categoryLabelLookup} customCategories={project.customCategories} disabled={disabled} onPatch={onPatch} />
              ) : (
                <CollectionMenu
                  value={block.collection || 'scenes'}
                  category={block.category || 'props'}
                  collections={baseValidCollections().filter(c => c !== 'cast')}
                  categoryKeys={allCategoryKeys}
                  categoryLabels={categoryLabelLookup}
                  customCategories={project.customCategories}
                  disabled={disabled}
                  onChange={(c, cat) => onPatch(cat ? { collection: c, category: cat } : { collection: c })}
                />
              )}
            </Row>
          )}
          {block.type === 'repeat' && (
            <Row label="Item gap (px)">
              <input type="number" min={0} max={60} disabled={disabled} className={inputCls} value={block.gap ?? 8} onChange={e => onPatch({ gap: Number(e.target.value) || 0 })} />
            </Row>
          )}
          <Row label="Counter starts at">
            <Seg
              value={String(block.counterStart ?? 1)}
              options={[{ v: '1', l: '1' }, { v: '0', l: '0' }]}
              onChange={v => onPatch({ counterStart: v === '0' ? 0 : 1 })}
              disabled={disabled}
            />
          </Row>
          {parentCollection && !CONTEXTUAL_COLLECTIONS.has(block.type === 'table' ? tableItemCollection(block, parentCollection) : (block.collection || 'scenes')) && (
            <label className="flex items-center gap-1.5 text-xs text-zinc-400 pt-1">
              <input type="checkbox" checked={block.scopedToParent !== false} disabled={disabled} onChange={e => onPatch({ scopedToParent: e.target.checked })} />
              Only {BASE_COLLECTION_LABELS[block.type === 'table' ? tableItemCollection(block, parentCollection) : (block.collection || 'scenes')] || 'items'} in this {PARENT_LABELS[parentCollection] || 'item'}
            </label>
          )}
          {block.collection === 'categories' && (
            <>
              <Row label="Skip empty">
                <label className="flex items-center gap-1.5 text-xs text-zinc-400 pt-1">
                  <input type="checkbox" checked={block.skipEmptyCategories !== false} disabled={disabled} onChange={e => onPatch({ skipEmptyCategories: e.target.checked })} />
                  Skip categories with no elements
                </label>
              </Row>
              <Row label="Exclude categories">
                <ExcludeCategoriesMenu
                  excluded={block.excludedCategories || []}
                  categoryKeys={allCategoryKeys}
                  categoryLabels={categoryLabelLookup}
                  disabled={disabled}
                  onChange={list => onPatch({ excludedCategories: list })}
                />
              </Row>
            </>
          )}
        </>
      )}

      {block.type === 'table' && (
        <>
          <Row label="Layout">
            <Seg
              value={block.axis ?? 'columns'}
              options={[{ v: 'columns', l: 'Columns' }, { v: 'rows', l: 'Rows' }]}
              onChange={v => onPatch({ axis: v as 'columns' | 'rows' })}
              disabled={disabled}
            />
          </Row>
          <Row label={`${(block.axis ?? 'columns') === 'rows' ? 'Rows' : 'Columns'} (${(block.columns || []).length}${(block.axis ?? 'columns') === 'columns' ? ' · drag handles on the grid' : ''})`}>
            <div className="flex items-start gap-1 flex-wrap">
              {(block.columns || []).map((col, ci) => (
                <div key={col.id} className="flex flex-col gap-0.5">
                  <FieldPicker
                    value={col.field}
                    fields={fieldOptions(tableFieldScope(block, parentCollection))}
                    onChange={f => tableOps.patchColumn(ci, { field: f })}
                    disabled={disabled}
                    scope={tableFieldScope(block, parentCollection)}
                    className="w-36 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 disabled:opacity-30"
                  />
                  <div className="flex items-center gap-0.5">
                    <button
                      disabled={disabled}
                      title="Bold"
                      onClick={() => tableOps.patchColumn(ci, { bold: !col.bold })}
                      className={`w-6 h-5 rounded text-[11px] font-bold transition-colors disabled:opacity-30 ${col.bold ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}
                    >
                      B
                    </button>
                    <button
                      disabled={disabled}
                      title="Italic"
                      onClick={() => tableOps.patchColumn(ci, { italic: !col.italic })}
                      className={`w-6 h-5 rounded text-[11px] italic transition-colors disabled:opacity-30 ${col.italic ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}
                    >
                      I
                    </button>
                    <button
                      disabled={disabled}
                      title="Hide rows where this column is empty"
                      onClick={() => tableOps.patchColumn(ci, { skipEmpty: !col.skipEmpty })}
                      className={`w-6 h-5 rounded flex items-center justify-center transition-colors disabled:opacity-30 ${col.skipEmpty ? 'bg-amber-100 text-amber-700' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'}`}
                    >
                      <EyeOff className="w-3 h-3" />
                    </button>
                    <div className="flex border border-zinc-700 rounded p-px">
                      {(['left', 'center', 'right'] as const).map(a => (
                        <button
                          key={a}
                          disabled={disabled}
                          title={`Align ${a}`}
                          onClick={() => tableOps.patchColumn(ci, { align: a })}
                          className={`px-1 rounded text-[10px] transition-colors disabled:opacity-30 ${(col.align ?? 'left') === a ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                          {a === 'left' ? '←' : a === 'center' ? '≡' : '→'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <ToolButton onClick={tableOps.addColumn} disabled={disabled} title="Add column"><Plus className="w-3.5 h-3.5" /></ToolButton>
              <ToolButton onClick={tableOps.removeColumn} disabled={disabled} title="Remove last column"><Minus className="w-3.5 h-3.5" /></ToolButton>
            </div>
          </Row>
          {(block.axis ?? 'columns') === 'columns' ? (
            <label className="flex items-center gap-1.5 text-xs text-zinc-400 pt-1">
              <input type="checkbox" checked={!!block.showHeader} disabled={disabled} onChange={e => onPatch({ showHeader: e.target.checked })} />
              Header row
            </label>
          ) : (
            <Row label="Item header (rows mode)">
              <FieldPicker
                value={block.headerField || ''}
                fields={fieldOptions(tableFieldScope(block, parentCollection))}
                onChange={f => onPatch({ headerField: f })}
                disabled={disabled}
                placeholder="— auto —"
                scope={tableFieldScope(block, parentCollection)}
                className="w-36 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 disabled:opacity-30"
              />
            </Row>
          )}
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 pt-1">
            <input type="checkbox" checked={block.showBorders !== false} disabled={disabled} onChange={e => onPatch({ showBorders: e.target.checked })} />
            Cell borders
          </label>
          {hasDayList && (
            <Row label="Day format">
              <select
                className={selCls}
                disabled={disabled}
                value={block.dayFormat || 'dayNumDate'}
                onChange={e => onPatch({ dayFormat: e.target.value as DayFormatMode })}
              >
                {DAY_FORMAT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Row>
          )}
        </>
      )}

      {block.type === 'columns' && !selCol && (
        <Row label={`Columns (${(block.cols || []).length})`}>
          <div className="flex items-center gap-1">
            <ToolButton
              onClick={() => {
                const cols = block.cols || [];
                const n = cols.length || 1;
                onPatch({ cols: [...cols, { id: `col${Date.now().toString(36)}`, width: 100 / (n + 1), blocks: [] }].map(c => ({ ...c, width: 100 / (n + 1) })) });
              }}
              disabled={disabled}
              title="Add column"
            >
              <Plus className="w-3.5 h-3.5" /> Column
            </ToolButton>
            <ToolButton
              onClick={() => {
                const cols = block.cols || [];
                if (cols.length <= 1) return;
                const next = cols.slice(0, -1).map(c => ({ ...c, width: 100 / (cols.length - 1) }));
                onPatch({ cols: next });
              }}
              disabled={disabled || (block.cols || []).length <= 1}
              title="Remove last column"
            >
              <Minus className="w-3.5 h-3.5" /> Column
            </ToolButton>
            {block.cols?.map((col, i) => (
              <ToolButton
                key={col.id}
                onClick={() => onPatch({ cols: (block.cols || []).map((c, j) => j === i ? { ...c, blocks: [...c.blocks, { id: `b${Date.now().toString(36)}${i}`, type: 'text' }] } : c) })}
                disabled={disabled}
                title={`Add text block to column ${i + 1}`}
              >
                <Plus className="w-3 h-3" /> {i + 1}
              </ToolButton>
            ))}
          </div>
        </Row>
      )}
      {block.type === 'columns' && selCol && (
        <Row label={`Column ${selCol.colIndex + 1} of ${selCol.colsCount}`}>
          <span className="text-[10px] text-zinc-500">Select a column on the canvas, or hover a divider to resize. Click the column's empty area to select it.</span>
        </Row>
      )}

      {block.type === 'ribbon' && (
        <>
          <Row label="Ribbon design">
            <select className={selCls} disabled={disabled} value={block.ribbonId || project.activeRibbonId || ''} onChange={e => onPatch({ ribbonId: e.target.value })}>
              {(project.ribbonDesigns || []).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Row>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 pt-1">
            <input type="checkbox" checked={block.ribbonDaySection !== false} disabled={disabled} onChange={e => onPatch({ ribbonDaySection: e.target.checked })} />
            Day section (header & totals)
          </label>
        </>
      )}

      {block.type === 'spacer' && (
        <>
          <Row label="Height (px)">
            <input type="number" min={4} max={200} disabled={disabled} className={inputCls} value={block.height ?? 16} onChange={e => onPatch({ height: Number(e.target.value) || 16 })} />
          </Row>
          <Row label="Style">
            <Seg
              value={block.spacerStyle || 'none'}
              options={[
                { v: 'none', l: 'None' },
                { v: 'black', l: 'Solid' },
                { v: 'line', l: 'Line' },
                { v: 'dotted', l: 'Dotted' },
              ]}
              onChange={v => onPatch({ spacerStyle: v as 'none' | 'black' | 'line' | 'dotted' })}
              disabled={disabled}
            />
          </Row>
        </>
      )}

      {!selCol && block.type !== 'pageBreak' && (
        <>
          <Row label="Font">
            <select className={selCls} disabled={disabled} value={block.fontFamily || 'Helvetica'} onChange={e => onPatch({ fontFamily: e.target.value })}>
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Row>
          <Row label="Size (pt)">
            <input type="number" min={6} max={48} disabled={disabled} className={inputCls} value={block.fontSize ?? 10} onChange={e => onPatch({ fontSize: Number(e.target.value) || 10 })} />
          </Row>
          <Row label="Style">
            <div className="flex items-center gap-2 pt-0.5">
              <button
                disabled={disabled}
                className={`px-2 py-0.5 rounded text-xs font-bold ${block.bold ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'}`}
                onClick={() => onPatch({ bold: !block.bold })}
              >
                B
              </button>
              <button
                disabled={disabled}
                className={`px-2 py-0.5 rounded text-xs italic ${block.italic ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'}`}
                onClick={() => onPatch({ italic: !block.italic })}
              >
                I
              </button>
            </div>
          </Row>
          <Row label="Align">
            <Seg
              value={block.align || 'left'}
              options={[{ v: 'left', l: '←' }, { v: 'center', l: '≡' }, { v: 'right', l: '→' }]}
              onChange={v => onPatch({ align: v as 'left' | 'center' | 'right' })}
              disabled={disabled}
            />
          </Row>
          {(block.type === 'text' || block.type === 'field') && (
            <Row label="When empty">
              <Seg
                value={block.emptyBehavior || 'show'}
                options={[
                  { v: 'show', l: 'Show' },
                  { v: 'hideText', l: 'Hide text' },
                  { v: 'hideBlock', l: 'Hide block' },
                ]}
                onChange={v => onPatch({ emptyBehavior: v as 'show' | 'hideText' | 'hideBlock' })}
                disabled={disabled}
              />
            </Row>
          )}
        </>
      )}
    </div>
  );
};

export default ReportToolbar;
