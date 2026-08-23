import React, { useMemo, useState } from 'react';
import { ToolButton, Seg, SectionHeader, ContentRow, ChromeHeader, StructureControls, FormatToolbar, FontMenu, RICH_TEXT_STATE_IDLE, TB_BTN, TB_BTN_ICON, TB_DANGER, TB_TOGGLE, TB_TOGGLE_ON, TB_TOGGLE_OFF, TB_INPUT, TB_NUM, TB_DIVIDER, TB_SEG, TB_PICKER } from '@gabriel/ui-kit';
import { ReportBlock, ReportCollection, Project, ReportTextStyle } from '../../types';
import { baseValidCollections, contextualCollectionsFor, tableItemCollection, tableFieldScope, COLLECTION_LABELS, isSelfRepeat, CONTEXTUAL_COLLECTIONS, NON_SCOPABLE_COLLECTIONS } from '../../lib/reportBlocks';
import { getReportFieldDefs, fieldsForScope, ReportFieldDef, DAY_LIST_FIELD_KEYS, smartFieldLabel, parseToken, composeTokenKey, TOKEN_RE } from '../../lib/reportFields';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import { DAY_FORMAT_OPTIONS, DayFormatMode } from '../../lib/utils';
import { getTextStyles, getTextStyleById, newTextStyle } from '../../lib/reportTextStyles';
import { FieldPicker } from './FieldPicker';
import CollectionMenu from './CollectionMenu';
import RichTextEditor, { RichTextEditorHandle, RichTextState } from './RichTextEditor';
import DropdownMenu, { ItemManagerDropdown } from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import Modal, { ModalFooter } from '../Modal';
import Checkbox from '../Checkbox';
import { Tooltip } from '../Tooltip';
import { Plus, Minus, Check, ChevronDown, Trash2, X, AlignLeft, AlignCenter, AlignRight, Type, Repeat, Table2, Columns3, Printer, FilePlus, Ruler, Pencil, Wand2, Eye, EyeOff, Image as ImageIcon, MapPin, Clock, Timer, StickyNote, Coffee, PanelTop, Sheet, SkipForward } from 'lucide-react';
import { LocationPickerModal } from '../location/LocationPickerModal';
import ColorField from '../ColorField';
import { reportLocationLabel } from '../../lib/reportWeather';
import type { ReportLocation } from '../../lib/reportWeather';

// ---- shared block-editor controls (toolbar + floating chrome) -----------------

export const BLOCK_TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  text: { label: 'Text', icon: <Type className="w-3 h-3" /> },
  field: { label: 'Attribute', icon: <AlignLeft className="w-3 h-3" /> },
  repeat: { label: 'Repeat', icon: <Repeat className="w-3 h-3" /> },
  table: { label: 'Table', icon: <Table2 className="w-3 h-3" /> },
  columns: { label: 'Columns', icon: <Columns3 className="w-3 h-3" /> },
  ribbon: { label: 'Ribbon', icon: <Printer className="w-3 h-3" /> },
  pageBreak: { label: 'Page Break', icon: <FilePlus className="w-3 h-3" /> },
  spacer: { label: 'Spacer', icon: <Ruler className="w-3 h-3" /> },
  image: { label: 'Image', icon: <ImageIcon className="w-3 h-3" /> },
  map: { label: 'Map', icon: <MapPin className="w-3 h-3" /> },
  callSheetEdit: { label: 'Call Sheet Edit', icon: <Sheet className="w-3 h-3" /> },
  relative: { label: 'Relative', icon: <SkipForward className="w-3 h-3" /> },
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
  onDuplicate?: () => void;
  onRemove?: () => void;
  onMove?: (dir: -1 | 1) => void;
  compact?: boolean;   // chrome mode: icon-only structure buttons
  trailing?: React.ReactNode; // extra actions at the end of the Structure row
  /** Designer chrome only: resolved relative-block target ("→ Day 4 …"). */
  relativeTarget?: string | null;
  /** Designer chrome only: the sampled item's available locations (roadmap 6
   *  "Show location" picker — rendered only when more than one exists). */
  availableLocations?: ReportLocation[];
}

/** "Show location" row — picks WHICH of the item's available locations a
 *  text/field/map block renders (by type key, `block.locationChoice`), when
 *  more than one resolves. Shared by the attribute blocks and the map block
 *  (roadmap 9). */
const LocationChoiceRow: React.FC<{
  block: ReportBlock;
  availableLocations: ReportLocation[];
  disabled?: boolean;
  onPatch: (patch: Partial<ReportBlock>) => void;
}> = ({ block, availableLocations: choices, disabled, onPatch }) => {
  const [open, setOpen] = useState(false);
  const current = block.locationChoice || (choices[0].typeKey || '');
  return (
    <ContentRow label="Show location">
      <DropdownMenu
        open={open}
        onOpenChange={setOpen}
        theme="dark"
        width="w-56"
        trigger={
          <button type="button" disabled={disabled} className={`w-44 ${TB_PICKER}`}>
            <span className="truncate">
              {choices.find(l => l.typeKey === current)?.info
                ? (() => { const l = choices.find(x => x.typeKey === current)!; return `${l.info!.name} · ${l.info!.typeLabel}`; })()
                : reportLocationLabel(choices[0])}
            </span>
            <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
          </button>
        }
      >
        {choices.map(l => (
          <DropdownItem key={l.typeKey || 'first'} onClick={() => { onPatch({ locationChoice: l.typeKey }); setOpen(false); }} icon={l.typeKey === current ? <Check className="w-3.5 h-3.5" /> : undefined}>
            {l.info ? `${l.info.name} · ${l.info.typeLabel}` : reportLocationLabel(l)}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </ContentRow>
  );
};

export const BlockEditorContent: React.FC<BlockEditorProps> = ({
  block, project, parentCollection, parentCategory, readOnly, onPatch, onSaveTextStyles,
  onDuplicate, onRemove, onMove, compact, trailing, relativeTarget, availableLocations,
}) => {
  const meta = BLOCK_TYPE_META[block.type] || { label: block.type, icon: null };
  const ctx: BlockCtx = { block, project, parentCollection, parentCategory, readOnly, onPatch, onSaveTextStyles, relativeTarget, availableLocations };
  const isTextLike = block.type === 'text' || block.type === 'field' || block.type === 'link';
  const { allFields, contextFields } = useReportControlContext(project, parentCollection);
  const isField = block.type === 'field';
  const emptyHidden = block.emptyBehavior === 'hideBlock';
  // Text blocks: the item-formatting editor follows the editor's chip
  // SELECTION — it shows only while a chip is selected (deselect hides it).
  // Lifted here so the affix section can live in the panel where the Layout
  // section used to be.
  const editorRef = React.useRef<RichTextEditorHandle>(null);
  const [chipKey, setChipKey] = React.useState<string | null>(null);
  React.useEffect(() => { setChipKey(null); }, [block.id]);
  const chipField = chipKey ? parseToken(chipKey).field : null;
  const chipDef = chipField ? allFields.find(f => f.key === chipField) : undefined;
  const chipIsList = !!chipDef?.multiValue;
  const styleLayoutCell = isTextLike ? (
    <div className="flex flex-col gap-1.5 px-2.5 py-1.5 min-w-max">
      <SectionHeader>Style</SectionHeader>
      <div className="flex items-center gap-1.5 flex-nowrap min-w-max">
        <StyleControls {...ctx} />
      </div>
      {block.type !== 'link' && (
        <>
          <SectionHeader>Outline</SectionHeader>
          <div className="flex items-center gap-1.5 flex-nowrap min-w-max">
            <OutlineControls {...ctx} />
          </div>
        </>
      )}
      <div className="h-px bg-zinc-800 my-1" />
      <SectionHeader>Padding</SectionHeader>
      <div className="flex items-center gap-1.5 flex-nowrap min-w-max">
        <LayoutControls {...ctx} />
      </div>
      {block.type === 'text' && chipKey && chipIsList && (
        <ChipAffixSection
          chipKey={chipKey}
          fieldLabel={chipDef?.label ?? chipField}
          readOnly={readOnly}
          onChange={key => {
            setChipKey(key);
            editorRef.current?.replaceToken(key);
          }}
        />
      )}
    </div>
  ) : null;
  return (
    <div className="flex flex-col gap-1.5 min-w-max">
      {/* Header bar: block type (or attribute name) + quick controls — always
          full panel width on top; everything else stacks under it */}
      <ChromeHeader
        className="w-full"
        leading={
          isField ? (
            <>
              <span className="flex items-center text-zinc-400 shrink-0">{meta.icon}</span>
              <FieldPicker
                value={block.field || ''}
                fields={contextFields}
                onChange={f => onPatch({ field: f })}
                disabled={readOnly}
                placeholder="Select attribute…"
                scope={parentCollection}
                className={`w-44 font-semibold ${TB_PICKER}`}
              />
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-300 pr-1">
              {meta.icon}
              {meta.label}
              {block.collection && <span className="text-zinc-500 font-normal">· {COLLECTION_LABELS[block.collection]}</span>}
            </span>
          )
        }
        trailing={
          <>
            {isTextLike && (
              <ToolButton
                onClick={() => onPatch({ emptyBehavior: emptyHidden ? 'show' : 'hideBlock' })}
                title={emptyHidden ? 'Hidden when empty — click to show' : 'Show when empty — click to hide'}
                className={TB_BTN_ICON}
              >
                {emptyHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </ToolButton>
            )}
            <StructureControls
              readOnly={readOnly}
              onDuplicate={onDuplicate}
              onRemove={onRemove}
              onMove={onMove}
              compact={compact}
            />
            {trailing}
          </>
        }
      />
      {/* Style + Layout — above Content for every block type */}
      {styleLayoutCell}
      {/* Content — hidden when the block type has no content controls */}
      {block.type !== 'pageBreak' && (
        <div className="flex flex-col gap-1.5 px-2.5 py-1.5">
          <SectionHeader>Content</SectionHeader>
          <ContentControls {...ctx} editorRef={editorRef} onSelectionChange={(sel) => setChipKey(sel ? sel.key : null)} />
        </div>
      )}
    </div>
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
  /** Text blocks only: the editor handle (formatting + chip rewriting). */
  editorRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  /** Text blocks only: the selected chip changed (key + pos), or null. */
  onSelectionChange?: (sel: { key: string; pos: number } | null) => void;
  /** Designer chrome only: resolved relative-block target ("→ Day 4 …"). */
  relativeTarget?: string | null;
  /** Designer chrome only: the sampled item's available locations. */
  availableLocations?: ReportLocation[];
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
        <button type="button" disabled={disabled} className={`${TB_PICKER} w-32 disabled:pointer-events-none`}>
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
  const [selId, setSelId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const styles = draft ?? getTextStyles(project);
  const sel = styles.find(s => s.id === selId) ?? styles[0];
  const set = (next: ReportTextStyle[]) => setDraft(next);
  const patchId = (id: string, p: Partial<ReportTextStyle>) => set(styles.map(s => s.id === id ? { ...s, ...p } : s));
  const patch = (p: Partial<ReportTextStyle>) => sel && patchId(sel.id, p);
  const commit = () => { onSave(draft ?? styles); setDraft(null); setSelId(null); onClose(); };
  const close = () => { setDraft(null); setSelId(null); onClose(); };

  // Fresh editing state each time the modal opens (registry → draft).
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(null);
      setImportErr(null);
      setSelId(getTextStyles(project)[0]?.id ?? null);
    }
    wasOpen.current = open;
  }, [open, project]);

  const styleCss = (s: ReportTextStyle): React.CSSProperties => ({
    fontFamily: s.fontFamily || 'Helvetica',
    fontSize: s.fontSize,
    fontWeight: s.bold ? 700 : 400,
    fontStyle: s.italic ? 'italic' : 'normal',
  });

  const exportStyles = () => {
    const blob = new Blob([JSON.stringify(styles, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'report-text-styles.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  const importStyles = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(s => s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.fontSize === 'number')) {
          throw new Error('bad shape');
        }
        set(parsed as ReportTextStyle[]);
        setSelId((parsed[0] as ReportTextStyle).id);
        setImportErr(null);
      } catch {
        setImportErr("Couldn't import — not a valid styles file.");
      }
    };
    reader.readAsText(file);
  };

  const rowInput = 'bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 outline-none focus:border-zinc-500';
  const miniBtn = 'w-7 h-6 rounded text-[11px] transition-colors';

  return (
    <Modal
      open={open}
      onClose={close}
      title="Text styles"
      width="w-[380px]"
      footer={
        <ModalFooter>
          <button onClick={close} className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200">Cancel</button>
          <button onClick={commit} className="px-3 py-1.5 rounded text-xs bg-zinc-800 text-zinc-100 hover:bg-zinc-700">Done</button>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-3">
        <p className="text-xs text-zinc-500">Edits update every block that uses the style.</p>

        {/* one compact row: version-picker-style selector + size + bold/italic + font */}
        <div className="flex items-center gap-1">
          <ItemManagerDropdown
            open={pickerOpen}
            onClose={setPickerOpen}
            items={styles.map(s => ({ id: s.id, name: s.name }))}
            activeId={sel?.id || ''}
            closeOnSelect
            onSelect={id => setSelId(id)}
            onRename={(id, name) => patchId(id, { name })}
            onDuplicate={id => {
              const s = styles.find(x => x.id === id);
              if (!s) return;
              const copy = { ...s, id: newTextStyle('', []).id, name: `${s.name} Copy` };
              set([...styles, copy]);
              setSelId(copy.id);
              return copy.id;
            }}
            onDelete={id => {
              const next = styles.filter(s => s.id !== id);
              if (next.length === styles.length) return;
              set(next);
              if (id === selId) setSelId(next[0]?.id ?? null);
            }}
            onCreate={() => {
              const s = newTextStyle(`Style ${styles.length + 1}`, styles);
              set([...styles, s]);
              setSelId(s.id);
              return s.id;
            }}
            onImport={() => fileRef.current?.click()}
            onExport={exportStyles}
            theme="dark"
            label="Style"
            header="TEXT STYLES"
            itemLabel="Style"
            itemRender={s => {
              const st = styles.find(x => x.id === s.id);
              return st ? <span className="truncate" style={styleCss(st)}>{s.name}</span> : s.name;
            }}
            trigger={
              <button type="button" className="w-32 flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-700/60 transition-colors">
                {sel ? <span className="truncate">{sel.name}</span> : <span className="truncate text-zinc-500">No styles</span>}
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500 ml-auto shrink-0" />
              </button>
            }
          />
          {sel && (
            <>
              <input
                type="number" min={6} max={72}
                className={`${rowInput} w-14 text-center`}
                value={sel.fontSize}
                onChange={e => patch({ fontSize: Math.max(6, Math.min(72, Number(e.target.value) || 10)) })}
                title="Font size (pt)"
              />
              <button title="Bold" onClick={() => patch({ bold: !sel.bold })} className={`${miniBtn} font-bold ${sel.bold ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>B</button>
              <button title="Italic" onClick={() => patch({ italic: !sel.italic })} className={`${miniBtn} italic ${sel.italic ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>I</button>
              <FontMenu value={sel.fontFamily || 'Helvetica'} disabled={false} onChange={f => patch({ fontFamily: f === 'Helvetica' ? undefined : f })} />
            </>
          )}
        </div>

        {/* live preview — paper white so it matches print; content-sized so it
            doesn't stretch the modal wider than its controls */}
        {sel && (
          <div className="w-max max-w-full rounded-md border border-zinc-700 bg-white px-2.5 py-1.5">
            <div className="truncate whitespace-nowrap" style={{ ...styleCss(sel), color: '#000' }}>
              The quick brown fox jumps over the lazy dog
            </div>
          </div>
        )}

        {importErr && <p className="text-xs text-red-400">{importErr}</p>}

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importStyles(f); }}
        />
      </div>
    </Modal>
  );
};

const COLLECTION_LABELS_LOCAL: Record<string, string> = {
  scenes: 'scenes', scenesOfDay: 'scenes', scenesOfElement: 'scenes', scenesOfCast: 'scenes',
  days: 'days', daysOfCast: 'days',
  elements: 'elements', elementsOfCategory: 'elements', elementsOfScene: 'elements',
  categories: 'categories', cast: 'cast', crew: 'crew', violationTypes: 'violation types',
  locations: 'locations', locationsOfType: 'locations', locationTypes: 'location types',
};

const PARENT_LABELS: Record<string, string> = {
  days: 'day', daysOfCast: 'day',
  scenes: 'scene', scenesOfDay: 'scene', scenesOfElement: 'scene', scenesOfCast: 'scene', elementsOfScene: 'scene',
  elements: 'element', elementsOfCategory: 'element',
  categories: 'category', cast: 'cast member', crew: 'crew member', violationTypes: 'violation type',
  locations: 'location', locationsOfType: 'location', locationTypes: 'location type',
};

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
        <button type="button" disabled={disabled} className={`${TB_PICKER} w-32 disabled:pointer-events-none`}>
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
  parentCategory?: string;
  allCategoryKeys: { key: string; isCustom: boolean }[];
  categoryLabelLookup: Record<string, string>;
  customCategories?: { key: string; icon?: string }[];
  locationTypes?: { key: string; label: string }[];
  disabled: boolean;
  onPatch: (patch: Partial<ReportBlock>) => void;
}> = ({ block, parentCollection, parentCategory, allCategoryKeys, categoryLabelLookup, customCategories, locationTypes, disabled, onPatch }) => {
  const contextual = contextualCollectionsFor(parentCollection);
  const collections: ReportCollection[] = [];
  const preserved = block.collection && !contextual.includes(block.collection) && block.collection !== 'scenes' && block.collection !== 'cast'
    ? block.collection
    : null;
  if (preserved) collections.push(preserved as ReportCollection);
  for (const c of baseValidCollections(parentCollection)) {
    if (c !== 'cast' && !isSelfRepeat(parentCollection, c, parentCategory) && !collections.includes(c)) collections.push(c);
  }
  return (
    <CollectionMenu
      value={tableItemCollection(block, parentCollection)}
      category={block.category || 'props'}
      collections={collections}
      categoryKeys={allCategoryKeys}
      categoryLabels={categoryLabelLookup}
      customCategories={customCategories}
      locationTypes={locationTypes}
      disabled={disabled}
      parentCollection={parentCollection}
      scopedToParent={block.scopedToParent !== false}
      disabledCategories={allCategoryKeys.filter(({ key }) => isSelfRepeat(parentCollection, 'elements', parentCategory, key)).map(({ key }) => key)}
      onChange={(c, cat) => onPatch(collectionPickPatch(c, cat))}
    />
  );
};

/** Patch for a collection pick: `collection` alone would leave the block's
 *  old `category` in place (updateBlock spreads — it never deletes absent
 *  keys), so a category-less pick must clear it explicitly. */
const collectionPickPatch = (c: ReportCollection, cat?: string): Partial<ReportBlock> =>
  cat ? { collection: c, category: cat } : { collection: c, category: undefined };

/**
 * Repeat "Repeat over" menu collections — contextual variants first, then the
 * base collections minus self-redundant picks (isSelfRepeat). The block's own
 * effective current collection is ALWAYS re-included (if it was filtered out)
 * so existing self-repeat designs stay editable and keep rendering (no
 * migration). `cast` is never listed here — it's reached via the Elements
 * submenu in CollectionMenu.
 */
function repeatMenuCollections(
  current: ReportCollection | undefined,
  parentCollection: ReportCollection | undefined,
  parentCategory: string | undefined,
): ReportCollection[] {
  const effective = current || 'scenes';
  const list = [
    ...contextualCollectionsFor(parentCollection),
    ...baseValidCollections(parentCollection).filter(c => c !== 'cast' && !isSelfRepeat(parentCollection, c, parentCategory)),
  ];
  if (effective !== 'cast' && !list.includes(effective)) list.push(effective);
  return list;
}

/** Ribbon design picker for ribbon blocks (module scope — stable identity). */
const RibbonDesignMenu: React.FC<{ block: ReportBlock; project: Project; disabled: boolean; onPatch: (p: Partial<ReportBlock>) => void }> = ({ block, project, disabled, onPatch }) => {
  const [open, setOpen] = useState(false);
  const designs = project.ribbonDesigns || [];
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      width="w-44"
      trigger={
        <button type="button" disabled={disabled} className={`${TB_PICKER} w-40 disabled:pointer-events-none`}>
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

/** Ribbon block visibility toggles — compact icon row, same style as the
 *  column chrome's B/I/align toggles. */
const RibbonShowToggles: React.FC<{ block: ReportBlock; disabled: boolean; onPatch: (p: Partial<ReportBlock>) => void }> = ({ block, disabled, onPatch }) => {
  const dayBreaksOn = block.ribbonDayBreaks === true || block.ribbonHeaders === true;
  const toggles = [
    { key: 'ribbonDayBreaks', icon: <PanelTop className="w-3 h-3" />, title: 'Day breaks (START OF DAY / End of Day)', on: dayBreaksOn },
    { key: 'ribbonCallTimes', icon: <Clock className="w-3 h-3" />, title: 'Call times (strips & day breaks)', on: block.ribbonCallTimes === true },
    { key: 'ribbonDurations', icon: <Timer className="w-3 h-3" />, title: 'Durations (strips & day totals)', on: block.ribbonDurations === true },
    { key: 'ribbonNotes', icon: <StickyNote className="w-3 h-3" />, title: 'Note rows', on: block.ribbonNotes !== false },
    { key: 'ribbonBreaks', icon: <Coffee className="w-3 h-3" />, title: 'Break rows', on: block.ribbonBreaks === true },
  ];
  return (
    <div className="flex items-center gap-1 flex-nowrap min-w-max">
      {toggles.slice(0, 1).map(t => (
        <Tooltip key={t.key} content={t.title}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => t.key === 'ribbonDayBreaks'
              ? onPatch(dayBreaksOn ? { ribbonDayBreaks: false, ribbonHeaders: false } : { ribbonDayBreaks: true })
              : onPatch({ [t.key]: !t.on } as Partial<ReportBlock>)}
            className={`${TB_TOGGLE} ${t.on ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}
          >
            {t.icon}
          </button>
        </Tooltip>
      ))}
      <div className={TB_DIVIDER} />
      {toggles.slice(1).map(t => (
        <Tooltip key={t.key} content={t.title}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPatch({ [t.key]: !t.on } as Partial<ReportBlock>)}
            className={`${TB_TOGGLE} ${t.on ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}
          >
            {t.icon}
          </button>
        </Tooltip>
      ))}
    </div>
  );
};

export const ContentControls: React.FC<BlockCtx> = ({ block, project, parentCollection, parentCategory, readOnly, onPatch, editorRef, onSelectionChange, relativeTarget, availableLocations }) => {
  const { allFields, contextFields, categoryKeys, categoryLabels } = useReportControlContext(project, parentCollection);
  const disabled = readOnly;
  const fieldPickerCls = `w-36 ${TB_PICKER}`;
  const [rtActive, setRtActive] = useState<RichTextState>(RICH_TEXT_STATE_IDLE);
  const [locationOpen, setLocationOpen] = useState(false);

  const fieldOptions = (scope: string | null | undefined) => fieldsForScope(allFields, scope, block.category);

  const hasDayList = block.type === 'text'
    ? [...DAY_LIST_FIELD_KEYS].some(k => (block.text || '').includes(k))
    : block.type === 'field' ? DAY_LIST_FIELD_KEYS.has(block.field || '')
    : block.type === 'table' ? (block.columns || []).some(c => DAY_LIST_FIELD_KEYS.has(c.field))
    : false;

  // Controls group into labelled subsections (eyebrow + rule); blocks with a
  // single group get flat rows straight under the Content section instead.
  const sections: { title: string | null; rows: React.ReactNode[] }[] = [];
  const push = (title: string | null, ...rows: (React.ReactNode | null)[]) => {
    let s = sections.find(x => x.title === title);
    if (!s) { s = { title, rows: [] }; sections.push(s); }
    for (const r of rows) if (r != null) s.rows.push(r);
  };

  if (block.type === 'text') {
    const linkedStyle = getTextStyleById(project, block.textStyle);
    // A named style (or block-level direct formatting) pins bold/italic for
    // the WHOLE block — per-selection toggling on that axis is a visual no-op,
    // so the button renders lit-but-dimmed instead of misleadingly live.
    const lockTooltip = (axis: 'bold' | 'italic') => {
      const pinned = axis === 'bold' ? (block.bold ?? linkedStyle?.bold) : (block.italic ?? linkedStyle?.italic);
      if (!pinned) return undefined;
      return linkedStyle
        ? `${axis === 'bold' ? 'Bold' : 'Italic'} comes from “${linkedStyle.name}” — applies to the whole block`
        : `${axis === 'bold' ? 'Bold' : 'Italic'} is set for the whole block`;
    };
    push(null,
      <ContentRow key="content" tall>
        <FormatToolbar
          editorRef={editorRef}
          disabled={disabled}
          active={rtActive}
          lockedFormatting={{ bold: lockTooltip('bold'), italic: lockTooltip('italic') }}
          trailing={
            <FieldPicker
              value=""
              fields={contextFields}
              onChange={f => editorRef.current?.insertToken(f)}
              disabled={disabled}
              placeholder="Insert attribute…"
              scope={parentCollection}
              className={`w-32 ${TB_PICKER}`}
            />
          }
        />
        {/* Editing surface stays at a comfortable size — the block's real font
            size is only honored by the preview/print renderers. */}
        <div style={{ fontFamily: block.fontFamily || linkedStyle?.fontFamily || 'Helvetica', fontSize: 14, lineHeight: 1.5 }}>
          <RichTextEditor
            ref={editorRef}
            value={block.text || ''}
            onChange={text => onPatch({ text })}
            onStateChange={setRtActive}
            onSelectionChange={onSelectionChange}
            placeholder="Type text… type @ to insert an attribute"
            disabled={disabled}
            fields={contextFields}
            className="w-96 h-28"
          />
        </div>
      </ContentRow>,
    );
  }

  if (block.type === 'link') {
    push(null,
      <ContentRow key="label" label="Label">
        <input className={TB_INPUT + ' w-64'} disabled={disabled} value={block.text || ''} onChange={e => onPatch({ text: e.target.value })} placeholder="Link text…" />
      </ContentRow>,
      <ContentRow key="url" label="URL">
        <input className={TB_INPUT + ' w-64'} disabled={disabled} value={block.url || ''} onChange={e => onPatch({ url: e.target.value })} placeholder="https://… or {{locationMapLink}}" />
      </ContentRow>,
    );
  }

  if (block.type === 'field') {
    // the field picker itself lives in the chrome header; here only affixes
    const multi = !!block.field && !!allFields.find(f => f.key === block.field)?.multiValue;
    push(multi ? 'Value' : null,
      <ContentRow key="prefix" label="Prefix">
        <input className={TB_INPUT + ' w-20'} disabled={disabled} value={block.prefix || ''} onChange={e => onPatch({ prefix: e.target.value })} />
      </ContentRow>,
      <ContentRow key="suffix" label="Suffix">
        <input className={TB_INPUT + ' w-20'} disabled={disabled} value={block.suffix || ''} onChange={e => onPatch({ suffix: e.target.value })} />
      </ContentRow>,
    );
    if (multi) {
      push('Items',
        <ContentRow key="itemPrefix" label="Item prefix">
          <input className={TB_INPUT + ' w-20'} disabled={disabled} value={block.itemPrefix || ''} onChange={e => onPatch({ itemPrefix: e.target.value })} placeholder="e.g. —" />
        </ContentRow>,
        <ContentRow key="itemSuffix" label="Item suffix">
          <input className={TB_INPUT + ' w-20'} disabled={disabled} value={block.itemSuffix || ''} onChange={e => onPatch({ itemSuffix: e.target.value })} placeholder="e.g. —" />
        </ContentRow>,
        <ContentRow key="itemSep" label="Separator">
          <input className={TB_INPUT + ' w-20'} disabled={disabled} value={block.itemSeparator ?? ', '} onChange={e => onPatch({ itemSeparator: e.target.value })} />
        </ContentRow>,
      );
    }
  }

  if (block.type === 'repeat' || block.type === 'table') {
    push(null,
      <ContentRow key="over" label={block.type === 'repeat' ? 'Repeat over' : 'Table over'}>
        {block.type === 'repeat' ? (
          <CollectionMenu
            value={block.collection || 'scenes'}
            category={block.category || 'props'}
            collections={repeatMenuCollections(block.collection, parentCollection, parentCategory)}
            categoryKeys={categoryKeys}
            categoryLabels={categoryLabels}
            customCategories={project.customCategories}
            locationTypes={project.locationTypes}
            disabled={disabled}
            parentCollection={parentCollection}
            scopedToParent={block.scopedToParent !== false}
            disabledCategories={categoryKeys.filter(({ key }) => isSelfRepeat(parentCollection, 'elements', parentCategory, key)).map(({ key }) => key)}
            onChange={(c, cat) => onPatch(collectionPickPatch(c, cat))}
          />
        ) : parentCollection ? (
          <NestedTableMenu block={block} parentCollection={parentCollection} parentCategory={parentCategory} allCategoryKeys={categoryKeys} categoryLabelLookup={categoryLabels} customCategories={project.customCategories} locationTypes={project.locationTypes} disabled={disabled} onPatch={onPatch} />
        ) : (
          <CollectionMenu
            value={block.collection || 'scenes'}
            category={block.category || 'props'}
            collections={baseValidCollections().filter(c => c !== 'cast')}
            categoryKeys={categoryKeys}
            categoryLabels={categoryLabels}
            customCategories={project.customCategories}
            locationTypes={project.locationTypes}
            disabled={disabled}
            onChange={(c, cat) => onPatch(collectionPickPatch(c, cat))}
          />
        )}
      </ContentRow>,
      block.type === 'repeat' ? (
        <ContentRow key="gap" label="Item gap (px)">
          <input type="number" min={0} max={60} disabled={disabled} className={TB_INPUT + ' w-14'} value={block.gap ?? 8} onChange={e => onPatch({ gap: Number(e.target.value) || 0 })} />
        </ContentRow>
      ) : null,
    );
    if (block.type === 'table') {
      push('Display',
        <ContentRow key="axis" label="Axis">
          <Seg
            value={block.axis ?? 'columns'}
            options={[{ v: 'columns', l: 'Columns' }, { v: 'rows', l: 'Rows' }]}
            onChange={v => onPatch({ axis: v as 'columns' | 'rows' })}
            disabled={disabled}
          />
        </ContentRow>,
        (block.axis ?? 'columns') === 'columns' ? (
          <ContentRow key="headerBorders" label="Header & borders">
            <Checkbox checked={!!block.showHeader} disabled={disabled} onChange={on => onPatch({ showHeader: on })} label="Header row" />
            <Checkbox checked={block.showBorders !== false} disabled={disabled} onChange={on => onPatch({ showBorders: on })} label="Cell borders" />
          </ContentRow>
        ) : (
          <ContentRow key="headerBorders" label="Item header">
            <FieldPicker
              value={block.headerField || ''}
              fields={fieldOptions(tableFieldScope(block, parentCollection))}
              onChange={f => onPatch({ headerField: f })}
              disabled={disabled}
              placeholder="— auto —"
              scope={tableFieldScope(block, parentCollection)}
              className={fieldPickerCls}
            />
            <Checkbox checked={block.showBorders !== false} disabled={disabled} onChange={on => onPatch({ showBorders: on })} label="Cell borders" />
          </ContentRow>
        ),
        hasDayList ? (
          <ContentRow key="dayFormat" label="Day format">
            <DayFormatMenu value={block.dayFormat || 'dayNumDate'} disabled={disabled} onChange={v => onPatch({ dayFormat: v as DayFormatMode })} />
          </ContentRow>
        ) : null,
      );
    }
    const effective = block.type === 'table' ? tableItemCollection(block, parentCollection) : (block.collection || 'scenes');
    push('Behavior',
      <ContentRow key="counter" label="Counter starts at">
        <Seg
          value={String(block.counterStart ?? 1)}
          options={[{ v: '1', l: '1' }, { v: '0', l: '0' }]}
          onChange={v => onPatch({ counterStart: v === '0' ? 0 : 1 })}
          disabled={disabled}
        />
      </ContentRow>,
      parentCollection && !NON_SCOPABLE_COLLECTIONS.has(effective) && !CONTEXTUAL_COLLECTIONS.has(effective) ? (
        <ContentRow key="scope" label="Scope">
          <Checkbox checked={block.scopedToParent !== false} disabled={disabled} onChange={on => onPatch({ scopedToParent: on })} label={`Only ${COLLECTION_LABELS_LOCAL[effective] || 'items'} in this ${PARENT_LABELS[parentCollection] || 'item'}`} />
        </ContentRow>
      ) : null,
    );
    if (block.collection === 'categories') {
      push('Filters',
        <ContentRow key="skipEmpty" label="Skip empty">
          <Checkbox checked={block.skipEmptyCategories !== false} disabled={disabled} onChange={on => onPatch({ skipEmptyCategories: on })} label="Skip categories with no elements" />
        </ContentRow>,
        <ContentRow key="exclude" label="Exclude categories">
          <ExcludeCategoriesMenu
            excluded={block.excludedCategories || []}
            categoryKeys={categoryKeys}
            categoryLabels={categoryLabels}
            disabled={disabled}
            onChange={list => onPatch({ excludedCategories: list })}
          />
        </ContentRow>,
      );
    }
  }

  if (block.type === 'columns') {
    const cols = block.cols || [];
    push(null,
      <ContentRow key="cols" label="Columns">
        <ToolButton
          onClick={() => {
            const n = cols.length || 1;
            onPatch({ cols: [...cols, { id: `col${Date.now().toString(36)}`, width: 100 / (n + 1), blocks: [] }].map(c => ({ ...c, width: 100 / (n + 1) })) });
          }}
          disabled={disabled}
          title="Add column"
          className={TB_BTN}
        >
          <Plus className="w-3 h-3" /> Add column
        </ToolButton>
      </ContentRow>,
    );
  }

  if (block.type === 'ribbon') {
    push(null,
      <ContentRow key="ribbon" label="Ribbon design">
        <RibbonDesignMenu block={block} project={project} disabled={disabled} onPatch={onPatch} />
      </ContentRow>,
      <ContentRow key="show" label="Show">
        <RibbonShowToggles block={block} disabled={disabled} onPatch={onPatch} />
      </ContentRow>,
    );
  }

  if (block.type === 'relative') {
    const offset = block.relativeOffset ?? 1;
    const count = Math.max(1, block.relativeCount ?? 1);
    push(null,
      <ContentRow key="offset" label="Offset">
        <div className="flex items-center gap-1">
          <ToolButton onClick={() => onPatch({ relativeOffset: offset - 1 })} disabled={disabled} title="Previous item" className={TB_BTN}><Minus className="w-3 h-3" /></ToolButton>
          <input type="number" min={-20} max={20} disabled={disabled} className={TB_INPUT + ' w-12 text-center'} value={offset} onChange={e => onPatch({ relativeOffset: Number(e.target.value) || 1 })} />
          <ToolButton onClick={() => onPatch({ relativeOffset: offset + 1 })} disabled={disabled} title="Next item" className={TB_BTN}><Plus className="w-3 h-3" /></ToolButton>
        </div>
      </ContentRow>,
      <ContentRow key="count" label="Count">
        <div className="flex items-center gap-1">
          <ToolButton onClick={() => onPatch({ relativeCount: Math.max(1, count - 1) })} disabled={disabled} title="Fewer" className={TB_BTN}><Minus className="w-3 h-3" /></ToolButton>
          <input type="number" min={1} max={20} disabled={disabled} className={TB_INPUT + ' w-12 text-center'} value={count} onChange={e => onPatch({ relativeCount: Math.max(1, Number(e.target.value) || 1) })} />
          <ToolButton onClick={() => onPatch({ relativeCount: count + 1 })} disabled={disabled} title="More" className={TB_BTN}><Plus className="w-3 h-3" /></ToolButton>
        </div>
      </ContentRow>,
      relativeTarget ? (
        <ContentRow key="target" label="Resolves to">
          <span className="text-xs text-sky-600 font-semibold">{relativeTarget}</span>
        </ContentRow>
      ) : null,
    );
  }

  // "Show location" — a text/field/map block carrying a Location attribute
  // renders the item's FIRST location by default; when the item has several
  // (future: a day with multiple attached/derived locations), this row picks
  // which one by type key (roadmap 6 + 9). Hidden until more than one exists.
  const locationTokens = useMemo(() => {
    if (block.type === 'text') return [...(block.text || '').matchAll(TOKEN_RE)].map(m => parseToken(m[1]).field);
    if (block.type === 'field') return block.field ? [block.field] : [];
    return [];
  }, [block.type, block.text, block.field]);
  const hasLocationAttr = locationTokens.some(f => allFields.find(x => x.key === f)?.scope === 'locations');
  if ((block.type === 'text' || block.type === 'field') && hasLocationAttr && availableLocations && availableLocations.length > 1) {
    push(null,
      <LocationChoiceRow key="showLoc" block={block} availableLocations={availableLocations} disabled={disabled} onPatch={onPatch} />,
    );
  }

  if (block.type === 'spacer') {
    const spacerStyle = block.spacerStyle || 'none';
    push(null,
      <ContentRow key="height" label="Height (px)">
        <input type="number" min={4} max={200} disabled={disabled} className={TB_INPUT + ' w-14'} value={block.height ?? 16} onChange={e => onPatch({ height: Number(e.target.value) || 16 })} />
      </ContentRow>,
      <ContentRow key="style" label="Style">
        <Seg
          value={spacerStyle}
          options={[
            { v: 'none', l: 'None' },
            { v: 'line', l: 'Line' },
            { v: 'dotted', l: 'Dotted' },
          ]}
          onChange={v => onPatch({ spacerStyle: v as 'none' | 'line' | 'dotted' })}
          disabled={disabled}
        />
      </ContentRow>,
      ...(spacerStyle === 'line' ? [
        <ContentRow key="thickness" label="Thickness (px)">
          <input type="number" min={1} max={8} disabled={disabled} className={TB_INPUT + ' w-14'} value={block.spacerThickness ?? 1} onChange={e => onPatch({ spacerThickness: Math.min(8, Math.max(1, Number(e.target.value) || 1)) })} />
        </ContentRow>,
      ] : []),
    );
  }

  if (block.type === 'image') {
    const fileId = `report-image-input-${block.id}`;
    push(null,
      <ContentRow key="attach" label="Image">
        <input
          id={fileId}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled}
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => onPatch({ imageDataUrl: String(reader.result || '') });
            reader.readAsDataURL(f);
          }}
        />
        <label
          htmlFor={fileId}
          className={`${TB_BTN} ${disabled ? 'disabled:opacity-30 pointer-events-none' : 'cursor-pointer'}`}
        >
          {block.imageDataUrl ? 'Replace image…' : 'Attach image…'}
        </label>
        {block.imageDataUrl && (
          <ToolButton onClick={() => onPatch({ imageDataUrl: undefined, imageHeight: undefined })} disabled={disabled} title="Remove image" className={`${TB_BTN_ICON} ${TB_DANGER}`}>
            <Trash2 className="w-3 h-3" />
          </ToolButton>
        )}
      </ContentRow>,
    );
    if (block.imageDataUrl) {
      push('Size',
        <ContentRow key="height" label="Height (px)">
          <input
            type="number"
            min={0}
            max={3000}
            disabled={disabled}
            className={TB_INPUT + ' w-14'}
            value={block.imageHeight ?? ''}
            placeholder="Auto"
            onChange={e => onPatch({ imageHeight: e.target.value ? Number(e.target.value) : undefined })}
          />
          <span className="text-[9px] text-zinc-500">blank = natural size (fits the container)</span>
        </ContentRow>,
        <ContentRow key="fit" label="Fit">
          <Seg
            value={block.imageFit ?? 'contain'}
            options={[
              { v: 'contain', l: 'Contain' },
              { v: 'cover', l: 'Cover' },
              { v: 'fill', l: 'Fill' },
            ]}
            onChange={v => onPatch({ imageFit: v as 'contain' | 'cover' | 'fill' })}
            disabled={disabled}
          />
        </ContentRow>,
      );
    }
  }

  if (block.type === 'map') {
    const hasPin = block.mapLat != null && block.mapLng != null;
    const inherited = !!block.mapInheritLocation;
    push(null,
      <ContentRow key="loc" label="Location">
        {inherited ? (
          <span className="text-[10px] text-zinc-400">Comes from the day's location (London)</span>
        ) : hasPin ? (
          <>
            <span className="max-w-44 truncate text-[10px] text-zinc-400">
              {block.mapPlace || `${block.mapLat!.toFixed(4)}, ${block.mapLng!.toFixed(4)}`}
            </span>
            <ToolButton onClick={() => setLocationOpen(true)} disabled={disabled} title="Change location" className={TB_BTN}>
              <MapPin className="w-3 h-3" /> Change
            </ToolButton>
            <ToolButton
              onClick={() => onPatch({ mapLat: undefined, mapLng: undefined, mapPlace: undefined, mapAddress: undefined, mapCity: undefined, mapPostcode: undefined, mapCountry: undefined })}
              disabled={disabled}
              title="Clear location"
              className={`${TB_BTN_ICON} ${TB_DANGER}`}
            >
              <Trash2 className="w-3 h-3" />
            </ToolButton>
          </>
        ) : (
          <ToolButton onClick={() => setLocationOpen(true)} disabled={disabled} title="Set location" className={TB_BTN}>
            <MapPin className="w-3 h-3" /> Set location…
          </ToolButton>
        )}
      </ContentRow>,
      <ContentRow key="height" label="Height (px)">
        <input
          type="number"
          min={80}
          max={1200}
          disabled={disabled}
          className={TB_INPUT + ' w-14'}
          value={block.mapHeight ?? 240}
          onChange={e => onPatch({ mapHeight: Number(e.target.value) || 240 })}
        />
      </ContentRow>,
    );
    push('Map',
      <ContentRow key="inherit" label="Day location">
        <Checkbox checked={inherited} disabled={disabled} onChange={on => onPatch({ mapInheritLocation: on })} label="Use the day's location" />
      </ContentRow>,
      inherited && availableLocations && availableLocations.length > 1 ? (
        <LocationChoiceRow key="showLoc" block={block} availableLocations={availableLocations} disabled={disabled} onPatch={onPatch} />
      ) : null,
      <ContentRow key="open" label="Open in">
        <Seg
          value={block.mapOpenLink || 'none'}
          options={[
            { v: 'none', l: 'None' },
            { v: 'google', l: 'Google Maps' },
            { v: 'apple', l: 'Apple Maps' },
            { v: 'citymapper', l: 'Citymapper' },
          ]}
          onChange={v => onPatch(v === 'none' ? { mapOpenLink: undefined } : { mapOpenLink: v as 'google' | 'apple' | 'citymapper' })}
          disabled={disabled}
        />
      </ContentRow>,
      <ContentRow key="note" label="Address">
        <span className="text-[10px] text-zinc-500">Shown as a floating label on the map — clickable when an open-in service is set.</span>
      </ContentRow>,
    );
  }

  return (
    <div className="flex flex-col gap-2 min-w-max">
      {sections.map((s, i) => (
        <div key={s.title ?? `flat${i}`} className="flex flex-col gap-1 min-w-max">
          {s.title && <SectionHeader>{s.title}</SectionHeader>}
          <div className="flex flex-col gap-1.5">{s.rows}</div>
        </div>
      ))}
      {block.type === 'map' && (
        <LocationPickerModal
          open={locationOpen}
          onClose={() => setLocationOpen(false)}
          onConfirm={loc => {
            onPatch({
              mapLat: loc.lat,
              mapLng: loc.lng,
              mapPlace: loc.place,
              mapAddress: loc.address,
              mapCity: loc.city,
              mapPostcode: loc.postcode,
              mapCountry: loc.country,
            });
            setLocationOpen(false);
          }}
        />
      )}
    </div>
  );
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
      {/* block-level B/I only for field blocks — text blocks use the inline
          selection toolbar for bold/italic instead */}
      {block.type === 'field' && (
        <>
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
        </>
      )}
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

// ---- outline controls (background fill + border — text/field blocks only) ------
// The link block keeps its fixed link blue (unreadable on dark fills). The text
// color auto-switches white on dark backgrounds.

export const OutlineControls: React.FC<BlockCtx> = ({ block, readOnly, onPatch }) => (
  <>
    <Tooltip content="Background color — text turns white on dark fills">
      <span className="flex items-center">
        <ColorField value={block.background ?? '#FFFFFF'} onChange={v => onPatch({ background: v })} size="sm" hexVariant="sm" />
      </span>
    </Tooltip>
    {block.background && (
      <Tooltip content="Remove background">
        <button disabled={readOnly} onClick={() => onPatch({ background: undefined })} className={TB_BTN_ICON} title="Remove background">
          <X className="w-3 h-3" />
        </button>
      </Tooltip>
    )}
    <Tooltip content="Border around the block">
      <button
        disabled={readOnly}
        onClick={() => onPatch({ border: !block.border })}
        className={`${TB_TOGGLE} ${block.border ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}
        title="Border"
      >
        <span className="w-3 h-3 border border-current" />
      </button>
    </Tooltip>
  </>
);

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

// ---- chip item-formatting (text blocks — list attributes only) ----------------

export const ChipAffixSection: React.FC<{
  chipKey: string;
  fieldLabel: string;
  readOnly: boolean;
  onChange: (key: string) => void;
}> = ({ chipKey, fieldLabel, readOnly, onChange }) => {
  const { field, opts } = parseToken(chipKey);
  const setOpt = (kind: 'itemPrefix' | 'itemSuffix' | 'itemSeparator', value: string) => {
    onChange(composeTokenKey(
      field,
      kind === 'itemPrefix' ? value : (opts.itemPrefix ?? ''),
      kind === 'itemSuffix' ? value : (opts.itemSuffix ?? ''),
      kind === 'itemSeparator' ? value : (opts.itemSeparator ?? ''),
    ));
  };
  return (
    <>
      <SectionHeader>Item formatting — {fieldLabel}</SectionHeader>
      <div className="flex items-center gap-1.5 flex-nowrap min-w-max">
        <span className="text-[10px] text-zinc-500 shrink-0">Prefix</span>
        <input aria-label="Item prefix" readOnly={readOnly} className={TB_INPUT + ' w-20'} value={opts.itemPrefix ?? ''} onChange={e => setOpt('itemPrefix', e.target.value)} />
        <span className="text-[10px] text-zinc-500 shrink-0">Suffix</span>
        <input aria-label="Item suffix" readOnly={readOnly} className={TB_INPUT + ' w-20'} value={opts.itemSuffix ?? ''} onChange={e => setOpt('itemSuffix', e.target.value)} />
        <span className="text-[10px] text-zinc-500 shrink-0">Sep</span>
        <input aria-label="Item separator" readOnly={readOnly} className={TB_INPUT + ' w-20'} value={opts.itemSeparator ?? ''} onChange={e => setOpt('itemSeparator', e.target.value)} />
      </div>
    </>
  );
};

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
        <button type="button" disabled={disabled} className={`${TB_PICKER} w-36 disabled:pointer-events-none`}>
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
