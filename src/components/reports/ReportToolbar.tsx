import React, { useMemo, useState } from 'react';
import { ReportBlock, ReportCollection, ReportTableColumn } from '../../types';
import { Project } from '../../types';
import { COLLECTION_LABELS, validCollections, contextualCollectionsFor, tableItemCollection, tableFieldScope } from '../../lib/reportBlocks';
import { getReportFieldDefs, fieldsForScope, ReportFieldDef } from '../../lib/reportFields';
import { normalizeColWidths } from '../../lib/ribbonDefaults';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import { CategoryDropdown } from '../rules/CategoryDropdown';
import { FieldPicker } from './FieldPicker';
import { Tooltip } from '../Tooltip';
import { ArrowUp, ArrowDown, Copy, Trash2, Plus, Minus } from 'lucide-react';

const FONTS = ['Helvetica', 'Arial', 'Times New Roman', 'Georgia', 'Courier New'];

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

interface ReportToolbarProps {
  block: ReportBlock | null;
  parentCollection?: ReportCollection;
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

const ReportToolbar: React.FC<ReportToolbarProps> = ({ block, parentCollection, project, readOnly, selCol, onPatch, onInsertAbove, onInsertBelow, onDuplicate, onRemove, onMove, onInsertColumnAt, onAddTextToColumn }) => {
  const allFields = useMemo(() => getReportFieldDefs(project), [project]);
  const contextFields = useMemo(() => fieldsForScope(allFields, parentCollection), [allFields, parentCollection]);
  const [catOpen, setCatOpen] = useState(false);

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
  const collections = validCollections(parentCollection);

  const fieldOptions = (scope: string | null | undefined) => fieldsForScope(allFields, scope);

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
              className="w-44 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 disabled:opacity-30"
            />
          </Row>
          <Row label="Prefix">
            <input className={inputCls} disabled={disabled} value={block.prefix || ''} onChange={e => onPatch({ prefix: e.target.value })} />
          </Row>
          <Row label="Suffix">
            <input className={inputCls} disabled={disabled} value={block.suffix || ''} onChange={e => onPatch({ suffix: e.target.value })} />
          </Row>
        </>
      )}

      {(block.type === 'repeat' || block.type === 'table') && (
        <>
          {block.type === 'repeat' ? (
            <Row label="Repeat over">
              <select className={selCls} disabled={disabled} value={block.collection || 'scenes'} onChange={e => onPatch({ collection: e.target.value as ReportCollection })}>
                {collections.map(c => (
                  <option key={c} value={c}>{COLLECTION_LABELS[c]}</option>
                ))}
              </select>
            </Row>
          ) : parentCollection ? (
            <Row label="Table over">
              <select
                className={selCls}
                disabled={disabled}
                value={tableItemCollection(block, parentCollection)}
                onChange={e => onPatch({ collection: e.target.value as ReportCollection })}
              >
                {contextualCollectionsFor(parentCollection).map(c => (
                  <option key={c} value={c}>{COLLECTION_LABELS[c]}</option>
                ))}
              </select>
            </Row>
          ) : (
            <Row label="Table over">
              <select className={selCls} disabled={disabled} value={block.collection || 'scenes'} onChange={e => onPatch({ collection: e.target.value as ReportCollection })}>
                {collections.map(c => (
                  <option key={c} value={c}>{COLLECTION_LABELS[c]}</option>
                ))}
              </select>
            </Row>
          )}
          {block.type === 'repeat' && block.collection === 'elements' && (
            <Row label="Category">
              <CategoryDropdown
                value={block.category || 'props'}
                onChange={v => onPatch({ category: v })}
                allCategoryKeys={allCategoryKeys}
                categoryLabelLookup={categoryLabelLookup}
                customCategories={project.customCategories}
                open={catOpen}
                onOpenChange={setCatOpen}
                btnClass="w-36"
                itemClass="px-2 py-1.5 text-xs"
              />
            </Row>
          )}
          {block.type === 'repeat' && (
            <Row label="Item gap (px)">
              <input type="number" min={0} max={60} disabled={disabled} className={inputCls} value={block.gap ?? 8} onChange={e => onPatch({ gap: Number(e.target.value) || 0 })} />
            </Row>
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
            <div className="flex items-center gap-1 flex-wrap">
              {(block.columns || []).map((col, ci) => (
                <FieldPicker
                  key={col.id}
                  value={col.field}
                  fields={fieldOptions(tableFieldScope(block, parentCollection))}
                  onChange={f => tableOps.patchColumn(ci, { field: f })}
                  disabled={disabled}
                  className="w-36 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 disabled:opacity-30"
                />
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
                className="w-36 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 disabled:opacity-30"
              />
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
          <Row label="Ribbon mode">
            <Seg
              value={block.ribbonMode || 'all'}
              options={[
                { v: 'single', l: 'Single strip' },
                { v: 'day', l: 'Day strips' },
                { v: 'all', l: 'Whole schedule' },
              ]}
              onChange={v => onPatch({ ribbonMode: v as 'single' | 'day' | 'all' })}
              disabled={disabled}
            />
          </Row>
          <Row label="Ribbon design">
            <select className={selCls} disabled={disabled} value={block.ribbonId || project.activeRibbonId || ''} onChange={e => onPatch({ ribbonId: e.target.value })}>
              {(project.ribbonDesigns || []).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Row>
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
