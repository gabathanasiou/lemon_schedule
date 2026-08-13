import React, { useMemo, useState } from 'react';
import { ReportBlock, ReportCollection, Project, ReportTextStyle } from '../../types';
import { baseValidCollections, contextualCollectionsFor, tableItemCollection, tableFieldScope, COLLECTION_LABELS } from '../../lib/reportBlocks';
import { getReportFieldDefs, fieldsForScope, ReportFieldDef, DAY_LIST_FIELD_KEYS } from '../../lib/reportFields';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import { DAY_FORMAT_OPTIONS, DayFormatMode } from '../../lib/utils';
import { getTextStyles, getTextStyleById, newTextStyle } from '../../lib/reportTextStyles';
import { IS_COARSE } from '../../lib/device';
import { FieldPicker } from './FieldPicker';
import CollectionMenu from './CollectionMenu';
import RichTextEditor, { RichTextEditorHandle } from './RichTextEditor';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import Modal, { ModalFooter } from '../Modal';
import { Tooltip } from '../Tooltip';
import { Plus, Minus, Check, ChevronDown, Trash2, AlignLeft, AlignCenter, AlignRight, ArrowUp, ArrowDown, Copy, Type, Repeat, Table2, Columns3, Printer, FilePlus, Ruler, Pencil, Wand2, Underline, Strikethrough } from 'lucide-react';

// ---- shared block-editor controls (toolbar + floating chrome) -----------------

export const FONTS = ['Helvetica', 'Arial', 'Times New Roman', 'Georgia', 'Courier New'];

export const BLOCK_TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  text: { label: 'Text', icon: <Type className="w-3 h-3" /> },
  field: { label: 'Attribute', icon: <Type className="w-3 h-3" /> },
  repeat: { label: 'Repeat', icon: <Repeat className="w-3 h-3" /> },
  table: { label: 'Table', icon: <Table2 className="w-3 h-3" /> },
  columns: { label: 'Columns', icon: <Columns3 className="w-3 h-3" /> },
  ribbon: { label: 'Ribbon', icon: <Printer className="w-3 h-3" /> },
  pageBreak: { label: 'Page Break', icon: <FilePlus className="w-3 h-3" /> },
  spacer: { label: 'Spacer', icon: <Ruler className="w-3 h-3" /> },
};

// Ribbon-designer toolbar vocabulary (touch devices scale up — app pattern)
export const TB_ROW_LABEL = IS_COARSE ? 'text-xs font-semibold text-zinc-600 uppercase tracking-wider shrink-0 w-24' : 'text-[9px] font-semibold text-zinc-600 uppercase tracking-wider shrink-0 w-16';
export const TB_BTN = IS_COARSE ? 'h-10 px-3.5 text-sm font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 flex items-center gap-2 transition-colors' : 'h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 flex items-center gap-1.5 transition-colors';
export const TB_BTN_ICON = IS_COARSE ? 'h-10 px-3 text-sm font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center gap-1 transition-colors' : 'h-7 px-2 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center gap-0.5 transition-colors';
export const TB_DANGER = 'hover:bg-red-950/50';
export const TB_TOGGLE = IS_COARSE ? 'h-10 w-10 rounded border flex items-center justify-center disabled:opacity-25 transition-colors' : 'h-7 w-7 rounded border flex items-center justify-center disabled:opacity-25 transition-colors';
export const TB_TOGGLE_ON = 'bg-blue-900/50 border-blue-700 text-blue-300';
export const TB_TOGGLE_OFF = 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700';
export const TB_INPUT = IS_COARSE ? 'h-10 px-2.5 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500 disabled:opacity-30' : 'h-7 px-2 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500 disabled:opacity-30';
export const TB_NUM = IS_COARSE ? 'w-14 h-9 bg-zinc-800 border border-zinc-700 rounded text-sm text-center text-zinc-300 outline-none focus:border-blue-500 shrink-0 read-only:opacity-50' : 'w-10 h-6 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-center text-zinc-300 outline-none focus:border-blue-500 shrink-0 read-only:opacity-50';
export const TB_SELECT = IS_COARSE ? 'h-10 px-3 text-sm rounded bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center gap-2 transition-colors disabled:opacity-30' : 'h-7 px-2.5 text-[10px] rounded bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center gap-1.5 transition-colors disabled:opacity-30';
export const TB_DIVIDER = IS_COARSE ? 'w-px h-7 bg-zinc-700 mx-1' : 'w-px h-5 bg-zinc-700 mx-0.5';
export const TB_SEG = 'inline-flex rounded overflow-hidden border border-zinc-700';

export const ToolButton: React.FC<{ onClick: () => void; disabled?: boolean; title: string; className?: string; children: React.ReactNode }> = ({ onClick, disabled, title, className = TB_BTN, children }) => (
  <Tooltip content={title}>
    <button onClick={onClick} disabled={disabled} aria-label={title} className={`${className} ${disabled ? 'disabled:opacity-30 disabled:pointer-events-none' : ''}`}>
      {children}
    </button>
  </Tooltip>
);

export const Seg: React.FC<{ value: string; options: { v: string; l: string }[]; onChange: (v: string) => void; disabled?: boolean; active?: (v: string) => boolean }> = ({ value, options, onChange, disabled, active }) => (
  <div className={TB_SEG}>
    {options.map(o => {
      const on = active ? active(o.v) : value === o.v;
      return (
        <button
          key={o.v}
          disabled={disabled}
          onClick={() => onChange(o.v)}
          className={`${IS_COARSE ? 'h-10 px-3.5 text-sm' : 'h-7 px-2 text-[10px]'} font-medium transition-colors disabled:opacity-30 ${on ? 'bg-blue-900/50 text-blue-300' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'} ${o.v !== options[options.length - 1].v ? 'border-r border-zinc-700' : ''}`}
        >
          {o.l}
        </button>
      );
    })}
  </div>
);

// ---- font picker (custom dropdown, options styled in their own typeface) ------

export const FontMenu: React.FC<{ value: string; disabled: boolean; onChange: (f: string) => void }> = ({ value, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      width="w-44"
      trigger={
        <button type="button" disabled={disabled} className={`${TB_SELECT} disabled:pointer-events-none`}>
          <span className="truncate" style={{ fontFamily: value || 'Helvetica' }}>{value || 'Helvetica'}</span>
          <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
        </button>
      }
    >
      {FONTS.map(f => (
        <DropdownItem key={f} onClick={() => { onChange(f); setOpen(false); }} icon={f === value ? <Check className="w-3.5 h-3.5" /> : undefined}>
          <span style={{ fontFamily: f }}>{f}</span>
        </DropdownItem>
      ))}
    </DropdownMenu>
  );
};

// ---- structure (insert / move / duplicate / delete) ---------------------------

export interface StructureControlsProps {
  label: React.ReactNode;
  readOnly: boolean;
  onInsertAbove?: () => void;
  onInsertBelow?: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  compact?: boolean;
}

export const StructureControls: React.FC<StructureControlsProps> = ({ label, readOnly, onInsertAbove, onInsertBelow, onDuplicate, onRemove, onMove, compact }) => (
  <>
    <span className="flex items-center gap-1 text-[10px] font-medium text-zinc-400 pr-2 shrink-0">{label}</span>
    {onInsertAbove && (
      <ToolButton onClick={onInsertAbove} disabled={readOnly} title="Insert above" className={compact ? TB_BTN_ICON : TB_BTN}>
        <Plus className="w-3 h-3" /> {compact ? '' : 'Above'}
      </ToolButton>
    )}
    {onInsertBelow && (
      <ToolButton onClick={onInsertBelow} disabled={readOnly} title="Insert below" className={compact ? TB_BTN_ICON : TB_BTN}>
        <Plus className="w-3 h-3" /> {compact ? '' : 'Below'}
      </ToolButton>
    )}
    <div className={TB_DIVIDER} />
    <ToolButton onClick={() => onMove(-1)} disabled={readOnly} title="Move up" className={TB_BTN_ICON}><ArrowUp className="w-2.5 h-2.5" /></ToolButton>
    <ToolButton onClick={() => onMove(1)} disabled={readOnly} title="Move down" className={TB_BTN_ICON}><ArrowDown className="w-2.5 h-2.5" /></ToolButton>
    <ToolButton onClick={onDuplicate} disabled={readOnly} title="Duplicate" className={TB_BTN_ICON}><Copy className="w-2.5 h-2.5" /></ToolButton>
    <div className={TB_DIVIDER} />
    <ToolButton onClick={onRemove} disabled={readOnly} title="Delete" className={`${TB_BTN_ICON} ${TB_DANGER}`}><Trash2 className="w-2.5 h-2.5" /></ToolButton>
  </>
);

// ---- rich-text formatting toolbar (selection-aware, via the editor ref) --------

const RT_COLORS = ['#000000', '#b91c1c', '#b45309', '#15803d', '#1d4ed8', '#7c3aed', '#6b7280'];

export const RichTextToolbar: React.FC<{ editorRef: React.RefObject<RichTextEditorHandle | null>; disabled: boolean }> = ({ editorRef, disabled }) => {
  const [font, setFont] = useState('Helvetica');
  const [colorOpen, setColorOpen] = useState(false);
  const run = (cmd: string, value?: string) => editorRef.current?.exec(cmd, value);
  const btn = `${TB_TOGGLE} ${TB_TOGGLE_OFF}`;
  return (
    <div className="flex items-center gap-0.5">
      <Tooltip content="Bold">
        <button disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => run('bold')} className={`${btn} font-bold`}>B</button>
      </Tooltip>
      <Tooltip content="Italic">
        <button disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => run('italic')} className={`${btn} italic`}>I</button>
      </Tooltip>
      <Tooltip content="Underline">
        <button disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => run('underline')} className={btn}><Underline className="w-3 h-3" /></button>
      </Tooltip>
      <Tooltip content="Strikethrough">
        <button disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => run('strikeThrough')} className={btn}><Strikethrough className="w-3 h-3" /></button>
      </Tooltip>
      <div className={TB_DIVIDER} />
      <FontMenu value={font} disabled={disabled} onChange={f => { setFont(f); run('fontName', f); }} />
      <DropdownMenu
        open={colorOpen}
        onOpenChange={setColorOpen}
        theme="dark"
        width="w-36"
        trigger={
          <button type="button" disabled={disabled} className={`${TB_SELECT} disabled:pointer-events-none`} title="Text color">
            <span className="w-3 h-3 rounded-full border border-zinc-600 shrink-0" style={{ background: RT_COLORS[0] }} />
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>
        }
      >
        <div className="grid grid-cols-4 gap-1 p-2">
          {RT_COLORS.map(c => (
            <button
              key={c}
              onClick={() => { run('foreColor', c); setColorOpen(false); }}
              className="w-7 h-7 rounded border border-zinc-700 hover:border-zinc-500 transition-colors"
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
      </DropdownMenu>
    </div>
  );
};

// ---- shared block editor (floating chrome AND pinned toolbar) -----------------
// One source of truth: the same controls render in the floating chrome above a
// selected block or pinned into the top toolbar — the user can switch surfaces.

export interface BlockEditorProps {
  block: ReportBlock;
  project: Project;
  parentCollection?: ReportCollection;
  parentCategory?: string;
  readOnly: boolean;
  onPatch: (patch: Partial<ReportBlock>) => void;
  onSaveTextStyles?: (styles: ReportTextStyle[]) => void;
  onInsertAbove?: () => void;
  onInsertBelow?: () => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  onMove?: (dir: -1 | 1) => void;
  compact?: boolean;   // chrome mode: icon-only structure buttons
  trailing?: React.ReactNode; // extra actions at the end of the Structure row
}

export const BlockEditorContent: React.FC<BlockEditorProps> = ({
  block, project, parentCollection, parentCategory, readOnly, onPatch, onSaveTextStyles,
  onInsertAbove, onInsertBelow, onDuplicate, onRemove, onMove, compact, trailing,
}) => {
  const meta = BLOCK_TYPE_META[block.type] || { label: block.type, icon: null };
  const ctx: BlockCtx = { block, project, parentCollection, parentCategory, readOnly, onPatch, onSaveTextStyles };
  const isTextLike = block.type === 'text' || block.type === 'field';
  const label = (
    <span className="flex items-center gap-1">
      {meta.icon}
      {meta.label}
      {block.collection ? ` · ${COLLECTION_LABELS[block.collection]}` : ''}
    </span>
  );
  return (
    <>
      <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
        <span className={TB_ROW_LABEL}>Structure</span>
        <StructureControls
          label={label}
          readOnly={readOnly}
          onInsertAbove={onInsertAbove}
          onInsertBelow={onInsertBelow}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          onMove={onMove}
          compact={compact}
        />
        {trailing}
      </div>
      <div className="flex items-start gap-x-4 gap-y-2 px-3 py-1.5 flex-wrap min-w-max">
        <span className={`${TB_ROW_LABEL} pt-0.5`}>Content</span>
        <ContentControls {...ctx} />
      </div>
      {isTextLike && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
          <span className={TB_ROW_LABEL}>Style</span>
          <StyleControls {...ctx} />
        </div>
      )}
      {isTextLike && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
          <span className={TB_ROW_LABEL}>Layout</span>
          <LayoutControls {...ctx} />
        </div>
      )}
    </>
  );
};

// ---- shared context -----------------------------------------------------------

export interface BlockCtx {
  block: ReportBlock;
  project: Project;
  parentCollection?: ReportCollection;
  parentCategory?: string;
  readOnly: boolean;
  onPatch: (patch: Partial<ReportBlock>) => void;
  onSaveTextStyles?: (styles: ReportTextStyle[]) => void;
}

// ---- named text styles (Word/Pages-like) ---------------------------------------

/** True when the block carries direct typography overrides on top of its style. */
export function blockHasDirectFormatting(block: ReportBlock): boolean {
  return block.fontSize !== undefined || block.bold !== undefined || block.italic !== undefined || block.fontFamily !== undefined;
}

export const TextStyleMenu: React.FC<{
  value: string;
  project: Project;
  disabled: boolean;
  onChange: (id: string) => void;
  onEdit: () => void;
  onUpdateFromSelection?: () => void;
}> = ({ value, project, disabled, onChange, onEdit, onUpdateFromSelection }) => {
  const [open, setOpen] = useState(false);
  const styles = getTextStyles(project);
  const current = styles.find(s => s.id === value);
  const pick = (id: string) => { onChange(id); setOpen(false); };
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      width="w-52"
      trigger={
        <button type="button" disabled={disabled} className={`${TB_SELECT} w-32 disabled:pointer-events-none`}>
          <span className="truncate">{current ? current.name : 'Direct formatting'}</span>
          <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
        </button>
      }
    >
      <DropdownItem onClick={() => pick('')} icon={!value ? <Check className="w-3.5 h-3.5" /> : undefined}>
        Direct formatting
      </DropdownItem>
      <DropdownDivider />
      {styles.map(s => (
        <DropdownItem key={s.id} onClick={() => pick(s.id)} icon={s.id === value ? <Check className="w-3.5 h-3.5" /> : undefined}>
          <span style={{ fontSize: s.fontSize, fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal', fontFamily: s.fontFamily || 'Helvetica' }}>{s.name}</span>
        </DropdownItem>
      ))}
      <DropdownDivider />
      {onUpdateFromSelection && (
        <DropdownItem onClick={() => { onUpdateFromSelection(); setOpen(false); }} icon={<Wand2 className="w-3.5 h-3.5" />}>
          Update “{current?.name || 'style'}” from selection
        </DropdownItem>
      )}
      <DropdownItem onClick={() => { onEdit(); setOpen(false); }} icon={<Pencil className="w-3.5 h-3.5" />}>
        Edit styles…
      </DropdownItem>
    </DropdownMenu>
  );
};

export const TextStylesModal: React.FC<{
  open: boolean;
  project: Project;
  onClose: () => void;
  onSave: (styles: ReportTextStyle[]) => void;
}> = ({ open, project, onClose, onSave }) => {
  const [draft, setDraft] = useState<ReportTextStyle[] | null>(null);
  const styles = draft ?? getTextStyles(project);
  const set = (next: ReportTextStyle[]) => setDraft(next);
  const patch = (id: string, p: Partial<ReportTextStyle>) => set(styles.map(s => s.id === id ? { ...s, ...p } : s));
  const dup = (id: string) => {
    const s = styles.find(x => x.id === id);
    if (!s) return;
    set([...styles, { ...s, id: newTextStyle('', []).id, name: `${s.name} Copy` }]);
  };
  const del = (id: string) => set(styles.filter(s => s.id !== id));
  const commit = () => { onSave(draft ?? styles); setDraft(null); onClose(); };

  const rowInput = 'bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 outline-none focus:border-zinc-500';

  return (
    <Modal
      open={open}
      onClose={() => { setDraft(null); onClose(); }}
      title="Text styles"
      width="w-[480px]"
      footer={
        <ModalFooter>
          <button onClick={() => { setDraft(null); onClose(); }} className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200">Cancel</button>
          <button onClick={commit} className="px-3 py-1.5 rounded text-xs bg-zinc-800 text-zinc-100 hover:bg-zinc-700">Done</button>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-4">
        <p className="text-xs text-zinc-500">Named styles link to every block using them — edits update all linked blocks. Blocks with direct formatting keep those overrides on top.</p>
        <div className="space-y-2">
          {styles.map(s => (
            <div key={s.id} className="flex items-center gap-2 py-1 border-b border-zinc-800 last:border-0">
              <input className={`${rowInput} flex-1 min-w-0`} value={s.name} onChange={e => patch(s.id, { name: e.target.value })} />
              <input
                type="number" min={6} max={72}
                className={`${rowInput} w-14 text-center`}
                value={s.fontSize}
                onChange={e => patch(s.id, { fontSize: Math.max(6, Math.min(72, Number(e.target.value) || 10)) })}
                title="Font size (pt)"
              />
              <button
                title="Bold"
                onClick={() => patch(s.id, { bold: !s.bold })}
                className={`w-7 h-6 rounded text-[11px] font-bold transition-colors ${s.bold ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
              >B</button>
              <button
                title="Italic"
                onClick={() => patch(s.id, { italic: !s.italic })}
                className={`w-7 h-6 rounded text-[11px] italic transition-colors ${s.italic ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
              >I</button>
              <button title="Duplicate style" onClick={() => dup(s.id)} className="w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"><Copy className="w-3 h-3" /></button>
              <button title="Delete style" onClick={() => del(s.id)} className="w-6 h-6 rounded flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-zinc-800"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
        <button
          onClick={() => set([...styles, newTextStyle(`Style ${styles.length + 1}`, styles)])}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
        >
          <Plus className="w-3.5 h-3.5" /> Add style
        </button>
      </div>
    </Modal>
  );
};

const COLLECTION_LABELS_LOCAL: Record<string, string> = {
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

const CONTEXTUAL_COLLECTIONS = new Set(['scenesOfDay', 'scenesOfElement', 'scenesOfCast', 'daysOfCast', 'elementsOfCategory', 'elementsOfScene']);

export function useReportControlContext(project: Project, parentCollection?: ReportCollection): { allFields: ReportFieldDef[]; contextFields: ReportFieldDef[]; categoryKeys: { key: string; isCustom: boolean }[]; categoryLabels: Record<string, string>; } {
  const allFields = useMemo(() => getReportFieldDefs(project), [project]);
  const contextFields = useMemo(() => fieldsForScope(allFields, parentCollection, undefined), [allFields, parentCollection]);
  const categoryLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of ELEMENT_CATEGORIES) map[c.key] = getLabel(c.key, c.label, project.categoryLabels);
    for (const c of project.customCategories || []) map[c.key] = c.label;
    return map;
  }, [project.categoryLabels, project.customCategories]);
  const categoryKeys = useMemo(() => {
    const keys: { key: string; isCustom: boolean }[] = [];
    const seen = new Set<string>();
    for (const c of ELEMENT_CATEGORIES) { if (!seen.has(c.key)) { seen.add(c.key); keys.push({ key: c.key, isCustom: false }); } }
    for (const c of project.customCategories || []) { if (!seen.has(c.key)) { seen.add(c.key); keys.push({ key: c.key, isCustom: true }); } }
    return keys;
  }, [project.customCategories]);
  return { allFields, contextFields, categoryKeys, categoryLabels };
}

// ---- content controls (per block type) ----------------------------------------

const ExcludeCategoriesMenu: React.FC<{
  excluded: string[];
  categoryKeys: { key: string; isCustom: boolean }[];
  categoryLabels: Record<string, string>;
  disabled: boolean;
  onChange: (excluded: string[]) => void;
}> = ({ excluded, categoryKeys, categoryLabels, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  const excludedSet = new Set(excluded);
  const label = excluded.length > 0 ? `${excluded.length} excluded` : 'None';
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      width="w-44"
      trigger={
        <button type="button" disabled={disabled} className={`${TB_SELECT} w-32 disabled:pointer-events-none`}>
          <span className="truncate">{label}</span>
          <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
        </button>
      }
    >
      {categoryKeys.map(({ key }) => (
        <DropdownItem key={key} keepOpen onClick={() => {
          const next = new Set(excludedSet);
          if (next.has(key)) next.delete(key); else next.add(key);
          onChange([...next]);
        }} icon={excludedSet.has(key) ? <Check className="w-3.5 h-3.5" /> : undefined}>
          {categoryLabels[key] || key}
        </DropdownItem>
      ))}
    </DropdownMenu>
  );
};

/** Table "Table over" menu — BASE collections only, legacy explicit contextual preserved. */
const NestedTableMenu: React.FC<{
  block: ReportBlock;
  parentCollection: ReportCollection;
  allCategoryKeys: { key: string; isCustom: boolean }[];
  categoryLabelLookup: Record<string, string>;
  customCategories?: { key: string; icon?: string }[];
  disabled: boolean;
  onPatch: (patch: Partial<ReportBlock>) => void;
}> = ({ block, parentCollection, allCategoryKeys, categoryLabelLookup, customCategories, disabled, onPatch }) => {
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

export const ContentControls: React.FC<BlockCtx> = ({ block, project, parentCollection, parentCategory, readOnly, onPatch }) => {
  const { allFields, contextFields, categoryKeys, categoryLabels } = useReportControlContext(project, parentCollection);
  const disabled = readOnly;
  const labelCls = 'text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1';
  const itemCls = 'flex flex-col gap-1';
  const checkboxCls = 'flex items-center gap-1.5 text-xs text-zinc-400 pt-1';
  const fieldPickerCls = 'w-36 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 disabled:opacity-30';

  const fieldOptions = (scope: string | null | undefined) => fieldsForScope(allFields, scope, block.category);

  const hasDayList = block.type === 'text'
    ? [...DAY_LIST_FIELD_KEYS].some(k => (block.text || '').includes(k))
    : block.type === 'field' ? DAY_LIST_FIELD_KEYS.has(block.field || '')
    : block.type === 'table' ? (block.columns || []).some(c => DAY_LIST_FIELD_KEYS.has(c.field))
    : false;

  const FieldClusters: React.ReactNode[] = [];

  if (block.type === 'text') {
    const editorRef = React.useRef<RichTextEditorHandle>(null);
    const linkedStyle = getTextStyleById(project, block.textStyle);
    FieldClusters.push(
      <div key="content" className={itemCls}>
        <span className={labelCls}>{'Text content ({{field}} tokens)'}</span>
        <RichTextToolbar editorRef={editorRef} disabled={disabled} />
        <div style={{ fontFamily: block.fontFamily || linkedStyle?.fontFamily || 'Helvetica', fontSize: block.fontSize ?? linkedStyle?.fontSize ?? 10 }}>
          <RichTextEditor
            ref={editorRef}
            value={block.text || ''}
            onChange={text => onPatch({ text })}
            placeholder="Type text… or insert an attribute below"
            disabled={disabled}
            className="w-72 h-24"
          />
        </div>
        <FieldPicker
          value=""
          fields={contextFields}
          onChange={f => onPatch({ text: `${block.text || ''}{{${f}}}` })}
          disabled={disabled}
          placeholder="Insert attribute…"
          scope={parentCollection}
          className={fieldPickerCls}
        />
      </div>,
      <div key="empty" className={itemCls}>
        <span className={labelCls}>When empty</span>
        <label className={checkboxCls}>
          <input type="checkbox" checked={block.emptyBehavior !== 'hideBlock'} disabled={disabled} onChange={e => onPatch({ emptyBehavior: e.target.checked ? 'show' : 'hideBlock' })} />
          Show when empty
        </label>
      </div>,
    );
  }

  if (block.type === 'field') {
    FieldClusters.push(
      <div key="field" className={itemCls}>
        <span className={labelCls}>Field</span>
        <FieldPicker
          value={block.field || ''}
          fields={contextFields}
          onChange={f => onPatch({ field: f })}
          disabled={disabled}
          placeholder="Select field…"
          scope={parentCollection}
          className={fieldPickerCls}
        />
      </div>,
      <div key="prefix" className={itemCls}>
        <span className={labelCls}>Prefix</span>
        <input className={TB_INPUT + ' w-20'} disabled={disabled} value={block.prefix || ''} onChange={e => onPatch({ prefix: e.target.value })} />
      </div>,
      <div key="suffix" className={itemCls}>
        <span className={labelCls}>Suffix</span>
        <input className={TB_INPUT + ' w-20'} disabled={disabled} value={block.suffix || ''} onChange={e => onPatch({ suffix: e.target.value })} />
      </div>,
    );
    if (block.field && allFields.find(f => f.key === block.field)?.multiValue) {
      FieldClusters.push(
        <div key="itemPrefix" className={itemCls}>
          <span className={labelCls}>Item prefix</span>
          <input className={TB_INPUT + ' w-20'} disabled={disabled} value={block.itemPrefix || ''} onChange={e => onPatch({ itemPrefix: e.target.value })} placeholder="e.g. —" />
        </div>,
        <div key="itemSuffix" className={itemCls}>
          <span className={labelCls}>Item suffix</span>
          <input className={TB_INPUT + ' w-20'} disabled={disabled} value={block.itemSuffix || ''} onChange={e => onPatch({ itemSuffix: e.target.value })} placeholder="e.g. —" />
        </div>,
        <div key="itemSep" className={itemCls}>
          <span className={labelCls}>Separator</span>
          <input className={TB_INPUT + ' w-20'} disabled={disabled} value={block.itemSeparator ?? ', '} onChange={e => onPatch({ itemSeparator: e.target.value })} />
        </div>,
      );
    }
  }

  if (block.type === 'repeat' || block.type === 'table') {
    FieldClusters.push(
      <div key="over" className={itemCls}>
        <span className={labelCls}>{block.type === 'repeat' ? 'Repeat over' : 'Table over'}</span>
        {block.type === 'repeat' ? (
          <CollectionMenu
            value={block.collection || 'scenes'}
            category={block.category || 'props'}
            collections={[...contextualCollectionsFor(parentCollection), ...baseValidCollections(parentCollection).filter(c => c !== 'cast')]}
            categoryKeys={categoryKeys}
            categoryLabels={categoryLabels}
            customCategories={project.customCategories}
            disabled={disabled}
            parentCollection={parentCollection}
            scopedToParent={block.scopedToParent !== false}
            onChange={(c, cat) => onPatch(cat ? { collection: c, category: cat } : { collection: c })}
          />
        ) : parentCollection ? (
          <NestedTableMenu block={block} parentCollection={parentCollection} allCategoryKeys={categoryKeys} categoryLabelLookup={categoryLabels} customCategories={project.customCategories} disabled={disabled} onPatch={onPatch} />
        ) : (
          <CollectionMenu
            value={block.collection || 'scenes'}
            category={block.category || 'props'}
            collections={baseValidCollections().filter(c => c !== 'cast')}
            categoryKeys={categoryKeys}
            categoryLabels={categoryLabels}
            customCategories={project.customCategories}
            disabled={disabled}
            onChange={(c, cat) => onPatch(cat ? { collection: c, category: cat } : { collection: c })}
          />
        )}
      </div>,
    );
    if (block.type === 'repeat') {
      FieldClusters.push(
        <div key="gap" className={itemCls}>
          <span className={labelCls}>Item gap (px)</span>
          <input type="number" min={0} max={60} disabled={disabled} className={TB_INPUT + ' w-14'} value={block.gap ?? 8} onChange={e => onPatch({ gap: Number(e.target.value) || 0 })} />
        </div>,
      );
    }
    FieldClusters.push(
      <div key="counter" className={itemCls}>
        <span className={labelCls}>Counter starts at</span>
        <Seg
          value={String(block.counterStart ?? 1)}
          options={[{ v: '1', l: '1' }, { v: '0', l: '0' }]}
          onChange={v => onPatch({ counterStart: v === '0' ? 0 : 1 })}
          disabled={disabled}
        />
      </div>,
    );
    const effective = block.type === 'table' ? tableItemCollection(block, parentCollection) : (block.collection || 'scenes');
    if (parentCollection && !CONTEXTUAL_COLLECTIONS.has(effective)) {
      FieldClusters.push(
        <div key="scope" className={itemCls}>
          <span className={labelCls}>Scope</span>
          <label className={checkboxCls}>
            <input type="checkbox" checked={block.scopedToParent !== false} disabled={disabled} onChange={e => onPatch({ scopedToParent: e.target.checked })} />
            Only {COLLECTION_LABELS_LOCAL[effective] || 'items'} in this {PARENT_LABELS[parentCollection] || 'item'}
          </label>
        </div>,
      );
    }
    if (block.collection === 'categories') {
      FieldClusters.push(
        <div key="skipEmpty" className={itemCls}>
          <span className={labelCls}>Skip empty</span>
          <label className={checkboxCls}>
            <input type="checkbox" checked={block.skipEmptyCategories !== false} disabled={disabled} onChange={e => onPatch({ skipEmptyCategories: e.target.checked })} />
            Skip categories with no elements
          </label>
        </div>,
        <div key="exclude" className={itemCls}>
          <span className={labelCls}>Exclude categories</span>
          <ExcludeCategoriesMenu
            excluded={block.excludedCategories || []}
            categoryKeys={categoryKeys}
            categoryLabels={categoryLabels}
            disabled={disabled}
            onChange={list => onPatch({ excludedCategories: list })}
          />
        </div>,
      );
    }
  }

  if (block.type === 'table') {
    FieldClusters.push(
      <div key="axis" className={itemCls}>
        <span className={labelCls}>Layout</span>
        <Seg
          value={block.axis ?? 'columns'}
          options={[{ v: 'columns', l: 'Columns' }, { v: 'rows', l: 'Rows' }]}
          onChange={v => onPatch({ axis: v as 'columns' | 'rows' })}
          disabled={disabled}
        />
      </div>,
      <div key="colsHint" className={itemCls}>
        <span className={labelCls}>Columns ({block.columns?.length || 0})</span>
        <span className="text-[10px] text-zinc-500 italic">Click a column on the grid to edit its field and style.</span>
      </div>,
    );
    if ((block.axis ?? 'columns') === 'columns') {
      FieldClusters.push(
        <div key="header" className={itemCls}>
          <span className={labelCls}>Header</span>
          <label className={checkboxCls}>
            <input type="checkbox" checked={!!block.showHeader} disabled={disabled} onChange={e => onPatch({ showHeader: e.target.checked })} />
            Header row
          </label>
        </div>,
      );
    } else {
      FieldClusters.push(
        <div key="headerField" className={itemCls}>
          <span className={labelCls}>Item header (rows mode)</span>
          <FieldPicker
            value={block.headerField || ''}
            fields={fieldOptions(tableFieldScope(block, parentCollection))}
            onChange={f => onPatch({ headerField: f })}
            disabled={disabled}
            placeholder="— auto —"
            scope={tableFieldScope(block, parentCollection)}
            className={fieldPickerCls}
          />
        </div>,
      );
    }
    FieldClusters.push(
      <div key="borders" className={itemCls}>
        <span className={labelCls}>Borders</span>
        <label className={checkboxCls}>
          <input type="checkbox" checked={block.showBorders !== false} disabled={disabled} onChange={e => onPatch({ showBorders: e.target.checked })} />
          Cell borders
        </label>
      </div>,
    );
    if (hasDayList) {
      FieldClusters.push(
        <div key="dayFormat" className={itemCls}>
          <span className={labelCls}>Day format</span>
          <DayFormatMenu value={block.dayFormat || 'dayNumDate'} disabled={disabled} onChange={v => onPatch({ dayFormat: v as DayFormatMode })} />
        </div>,
      );
    }
  }

  if (block.type === 'columns') {
    const cols = block.cols || [];
    FieldClusters.push(
      <div key="cols" className={itemCls}>
        <span className={labelCls}>Columns ({cols.length})</span>
        <div className="flex items-center gap-1">
          <ToolButton
            onClick={() => {
              const n = cols.length || 1;
              onPatch({ cols: [...cols, { id: `col${Date.now().toString(36)}`, width: 100 / (n + 1), blocks: [] }].map(c => ({ ...c, width: 100 / (n + 1) })) });
            }}
            disabled={disabled}
            title="Add column"
          >
            <Plus className="w-3 h-3" /> Column
          </ToolButton>
          <ToolButton
            onClick={() => {
              if (cols.length <= 1) return;
              onPatch({ cols: cols.slice(0, -1).map(c => ({ ...c, width: 100 / (cols.length - 1) })) });
            }}
            disabled={disabled || cols.length <= 1}
            title="Remove last column"
          >
            <Minus className="w-3 h-3" /> Column
          </ToolButton>
          <span className="text-[10px] text-zinc-500 italic">Drag blocks from the palette onto a column to add content.</span>
        </div>
      </div>,
    );
  }

  if (block.type === 'ribbon') {
    const designs = project.ribbonDesigns || [];
    const RibbonDesignMenu = () => {
      const [open, setOpen] = useState(false);
      return (
        <DropdownMenu
          open={open}
          onOpenChange={setOpen}
          theme="dark"
          width="w-44"
          trigger={
            <button type="button" disabled={disabled} className={`${TB_SELECT} w-40 disabled:pointer-events-none`}>
              <span className="truncate">{designs.find(d => d.id === (block.ribbonId || project.activeRibbonId || ''))?.name || '—'}</span>
              <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
            </button>
          }
        >
          {designs.map(d => (
            <DropdownItem key={d.id} onClick={() => { onPatch({ ribbonId: d.id }); setOpen(false); }} icon={d.id === (block.ribbonId || project.activeRibbonId) ? <Check className="w-3.5 h-3.5" /> : undefined}>
              <span className="truncate">{d.name}</span>
            </DropdownItem>
          ))}
        </DropdownMenu>
      );
    };
    FieldClusters.push(
      <div key="ribbon" className={itemCls}>
        <span className={labelCls}>Ribbon design</span>
        <RibbonDesignMenu />
      </div>,
      <div key="daySection" className={itemCls}>
        <span className={labelCls}>Day section</span>
        <label className={checkboxCls}>
          <input type="checkbox" checked={block.ribbonDaySection !== false} disabled={disabled} onChange={e => onPatch({ ribbonDaySection: e.target.checked })} />
          Day section (header & totals)
        </label>
      </div>,
    );
  }

  if (block.type === 'spacer') {
    FieldClusters.push(
      <div key="height" className={itemCls}>
        <span className={labelCls}>Height (px)</span>
        <input type="number" min={4} max={200} disabled={disabled} className={TB_INPUT + ' w-14'} value={block.height ?? 16} onChange={e => onPatch({ height: Number(e.target.value) || 16 })} />
      </div>,
      <div key="style" className={itemCls}>
        <span className={labelCls}>Style</span>
        <Seg
          value={block.spacerStyle || 'none'}
          options={[
            { v: 'none', l: 'None' },
            { v: 'line', l: 'Line' },
            { v: 'dotted', l: 'Dotted' },
          ]}
          onChange={v => onPatch({ spacerStyle: v as 'none' | 'line' | 'dotted' })}
          disabled={disabled}
        />
      </div>,
    );
  }

  return <>{FieldClusters}</>;
};

// ---- style controls (typography — text/field only) -----------------------------

export const StyleControls: React.FC<BlockCtx> = ({ block, project, readOnly, onPatch, onSaveTextStyles }) => {
  const disabled = readOnly;
  const font = block.fontFamily || 'Helvetica';
  const [stylesOpen, setStylesOpen] = useState(false);
  const updateFromSelection = () => {
    const style = getTextStyles(project).find(s => s.id === block.textStyle);
    if (!style) return;
    const b = block;
    onSaveTextStyles?.(getTextStyles(project).map(s => s.id === style.id
      ? {
          ...s,
          fontSize: b.fontSize ?? s.fontSize,
          bold: b.bold ?? s.bold,
          italic: b.italic ?? s.italic,
          fontFamily: b.fontFamily ?? s.fontFamily,
        }
      : s));
    onPatch({ textStyle: style.id, fontSize: undefined, bold: undefined, italic: undefined, fontFamily: undefined });
  };
  return (
    <>
      {onSaveTextStyles && (
        <>
          <TextStyleMenu
            value={block.textStyle || ''}
            project={project}
            disabled={disabled}
            onChange={id => {
              if (!id) { onPatch({ textStyle: undefined }); return; }
              // Applying a style clears the block's direct typography so the
              // style's values take effect (Word behavior). Bake tweaks into
              // the style via "Update from selection" instead.
              onPatch({ textStyle: id, fontSize: undefined, bold: undefined, italic: undefined, fontFamily: undefined });
            }}
            onEdit={() => setStylesOpen(true)}
            onUpdateFromSelection={block.textStyle && blockHasDirectFormatting(block) ? updateFromSelection : undefined}
          />
          <div className={TB_DIVIDER} />
          <TextStylesModal open={stylesOpen} project={project} onClose={() => setStylesOpen(false)} onSave={styles => onSaveTextStyles(styles)} />
        </>
      )}
      <FontMenu value={font} disabled={disabled} onChange={f => onPatch({ fontFamily: f })} />
      <Tooltip content="Font size (pt)">
        <input
          type="number"
          min={6}
          max={48}
          disabled={disabled}
          className={TB_NUM}
          value={block.fontSize ?? 10}
          onChange={e => onPatch({ fontSize: Math.max(6, Math.min(48, Number(e.target.value) || 10)) })}
        />
      </Tooltip>
      <div className={TB_DIVIDER} />
      <Tooltip content="Bold">
        <button disabled={disabled} onClick={() => onPatch({ bold: !block.bold })} className={`${TB_TOGGLE} ${block.bold ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}>
          <span className="text-[11px] font-bold">B</span>
        </button>
      </Tooltip>
      <Tooltip content="Italic">
        <button disabled={disabled} onClick={() => onPatch({ italic: !block.italic })} className={`${TB_TOGGLE} ${block.italic ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}>
          <span className="text-[11px] italic">I</span>
        </button>
      </Tooltip>
      <div className={TB_DIVIDER} />
      {(['left', 'center', 'right'] as const).map(a => {
        const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
        const on = (block.align ?? 'left') === a;
        return (
          <Tooltip key={a} content={`Align ${a}`}>
            <button
              disabled={disabled}
              onClick={() => onPatch({ align: a })}
              className={`${TB_TOGGLE} ${on ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}
            >
              <Icon className="w-3 h-3" />
            </button>
          </Tooltip>
        );
      })}
    </>
  );
};

// ---- layout controls (padding — text/field only) -------------------------------

export const LayoutControls: React.FC<BlockCtx> = ({ block, readOnly, onPatch }) => (
  <>
    <span className="text-[10px] text-zinc-500 shrink-0">Pad V</span>
    <Tooltip content="Vertical padding (px)">
      <input
        type="number"
        min={0}
        max={24}
        readOnly={readOnly}
        className={TB_NUM}
        value={block.paddingV ?? 2}
        onChange={e => onPatch({ paddingV: Math.max(0, Math.min(24, Number(e.target.value) || 0)) })}
      />
    </Tooltip>
    <span className="text-[10px] text-zinc-500 shrink-0">Pad H</span>
    <Tooltip content="Horizontal padding (px)">
      <input
        type="number"
        min={0}
        max={24}
        readOnly={readOnly}
        className={TB_NUM}
        value={block.paddingH ?? 4}
        onChange={e => onPatch({ paddingH: Math.max(0, Math.min(24, Number(e.target.value) || 0)) })}
      />
    </Tooltip>
  </>
);

// ---- day format menu ------------------------------------------------------------

export const DayFormatMenu: React.FC<{ value: string; disabled: boolean; onChange: (v: string) => void }> = ({ value, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      width="w-40"
      trigger={
        <button type="button" disabled={disabled} className={`${TB_SELECT} w-36 disabled:pointer-events-none`}>
          <span className="truncate">{DAY_FORMAT_OPTIONS.find(o => o.key === value)?.label || value}</span>
          <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
        </button>
      }
    >
      {DAY_FORMAT_OPTIONS.map(o => (
        <DropdownItem key={o.key} onClick={() => { onChange(o.key); setOpen(false); }} icon={o.key === value ? <Check className="w-3.5 h-3.5" /> : undefined}>
          {o.label}
        </DropdownItem>
      ))}
    </DropdownMenu>
  );
};
