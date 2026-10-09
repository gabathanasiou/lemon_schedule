import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ToolButton, Seg, SectionHeader, ChromeHeader, StructureControls, FontMenu, RICH_TEXT_STATE_IDLE, TB_BTN, TB_BTN_ICON, TB_DANGER, TB_TOGGLE, TB_TOGGLE_ON, TB_TOGGLE_OFF, TB_INPUT, TB_NUM, TB_DIVIDER, TB_PICKER } from '@gabriel/ui-kit';
import { ReportBlock, ReportCollection, Project, ReportTextStyle } from '../../types';
import { baseValidCollections, contextualCollectionsFor, tableItemCollection, tableFieldScope, COLLECTION_LABELS, isSelfRepeat, CONTEXTUAL_COLLECTIONS, NON_SCOPABLE_COLLECTIONS, blockId } from '../../lib/reportBlocks';
import { getReportFieldDefs, fieldsForScope, buildCtxLookupTokens, ReportFieldDef, DAY_LIST_FIELD_KEYS, smartFieldLabel, parseToken, composeTokenKey, TOKEN_RE } from '../../lib/reportFields';
import { ELEMENT_CATEGORIES, getLabel, getFieldItems } from '../../lib/categories';
import { DAY_FORMAT_OPTIONS, DayFormatMode } from '../../lib/utils';
import { codeForType } from '../../lib/dayTypes';
import { getTextStyles, getTextStyleById } from '../../lib/reportTextStyles';
import { FieldPicker } from './FieldPicker';
import CollectionMenu from './CollectionMenu';
import RichTextEditor, { RichTextEditorHandle, RichTextState } from './RichTextEditor';
import RichTextControls from './RichTextControls';
import type { ReportCtx } from '../../lib/reportData';
import { TextStyleMenu, TextStylesModal } from './TextStyleMenu';
import DropdownMenu from '../DropdownMenu';
import { LiveNumberInput } from '../LiveNumberInput';
import { GroupedSelect } from '../production/day/GroupedSelect';
import DropdownItem from '../DropdownItem';
import { Tooltip } from '../Tooltip';
import { Plus, Minus, Check, ChevronDown, Trash2, X, AlignLeft, AlignCenter, AlignRight, Type, Repeat, Table2, Columns3, Printer, FilePlus, Ruler, Eye, EyeOff, Image as ImageIcon, MapPin, Clock, Timer, StickyNote, Coffee, PanelTop, Sheet, SkipForward, Users } from 'lucide-react';
import { LocationPickerModal } from '../location/LocationPickerModal';
import { SKIP_EMPTY_TEST, SKIP_EMPTY_LABEL } from '../../lib/reportData';
import { stagedCategoryKeys } from '../../lib/reportGrids';
import ColorField from '../ColorField';
import { reportLocationLabel } from '../../lib/reportWeather';
import type { ReportLocation } from '../../lib/reportWeather';
import { BlockEditorPanelContext, ContentRow, EditorCheckbox, EditorGroup, editorFieldCls, editorRowCls, useBlockEditorPanel } from './reportEditorLayout';
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
  relative: { label: 'Advance', icon: <SkipForward className="w-3 h-3" /> },
  callTimes: { label: 'Call Times', icon: <Clock className="w-3 h-3" /> },
  crewTable: { label: 'Crew Table', icon: <Users className="w-3 h-3" /> },
};


// ---- shared block editor (floating chrome AND pinned toolbar) -----------------
// One source of truth: the same controls render in the floating chrome above a
// selected block, pinned into the top toolbar, or docked as the left inspector
// panel — the user can switch surfaces.

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
  /** Docked inspector layout — labels above controls, fields full-width. */
  panel?: boolean;
  /** Designer chrome only: resolved relative-block target ("→ Day 4 …"). */
  relativeTarget?: string | null;
  /** Designer chrome only: the sampled item's available locations (roadmap 6
   *  "Show location" picker — rendered only when more than one exists). */
  availableLocations?: ReportLocation[];
  /** Inline text editing channel (roadmap 191): the canvas text block's live
   *  editor, so the chrome's Format/Style body targets the on-canvas instance
   *  instead of owning a second editor. */
  editorRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  /** Formatting state at the canvas editor's caret (lights the toggles). */
  active?: RichTextState;
  /** Selected chip key from the canvas editor (drives the affix controls). */
  chipKey?: string | null;
  /** Designer context (roadmap 199): the rows-mode corner label editor's
   *  `@` item lookups. Optional — the control degrades to fields-only. */
  reportCtx?: ReportCtx;
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
  const panel = useBlockEditorPanel();
  const current = block.locationChoice || (choices[0].typeKey || '');
  return (
    <ContentRow label="Show location">
      <DropdownMenu
        open={open}
        onOpenChange={setOpen}
        theme="dark"
        width="w-56"
        trigger={
          <button type="button" disabled={disabled} className={`${panel ? 'w-full' : 'w-44'} ${TB_PICKER}`}>
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

/** Candidate values for a filter field, or null when the field has no finite
 *  set (free-text). Discrete-valued fields and the flat scene/multi-value
 *  fields get a multi-select of REAL values, so filtering is picking instead
 *  of typing an exact comma string. */
function filterValueOptions(project: Project, field: string): string[] | null {
  if (field === 'intExt') return ['INT', 'EXT'];
  if (field === 'dayNight') return ['DAY', 'NIGHT'];
  if (field === 'dayTypeLabel') return (project.dayTypes || []).map(t => t.label);
  if (field === 'dayTypeCode') return (project.dayTypes || []).map(t => codeForType(project.dayTypes, t.key));
  if (field === 'locationType' || field === 'locationTypeLabel') return (project.locationTypes || []).map(t => t.label);
  if (field === 'elementCategory') return [...ELEMENT_CATEGORIES.map(c => c.label), ...(project.customCategories || []).map(c => c.label || c.key)];
  const isCustom = (project.customCategories || []).some(c => c.key === field);
  const isSceneField = ['set', 'location', 'scriptDay', 'sequence', 'unit'].includes(field);
  const isCategory = ELEMENT_CATEGORIES.some(c => c.key === field);
  if (!isSceneField && !isCustom && !isCategory) return null;
  const vals = new Set<string>();
  for (const s of project.scenes || []) {
    for (const it of getFieldItems(field, String((s as any)[field] ?? ''))) {
      const v = it.trim();
      if (v) vals.add(v);
    }
  }
  return vals.size > 0 ? [...vals].sort((a, b) => a.localeCompare(b)) : null;
}

/** "Filter rows" (item 100) — keep items whose field value is in the list.
 *  Fields with a finite value set (INT/EXT, DAY/NIGHT, sets, cast, …) use a
 *  multi-select dropdown; free-text fields use a draft box that commits on
 *  blur/Enter (CellInput semantics — committing per keystroke left one undo
 *  entry per typed character). */
const ItemFilterControl: React.FC<{
  block: ReportBlock;
  project: Project;
  fields: ReportFieldDef[];
  disabled?: boolean;
  onPatch: (patch: Partial<ReportBlock>) => void;
}> = ({ block, project, fields, disabled, onPatch }) => {
  const [open, setOpen] = useState(false);
  const panel = useBlockEditorPanel();
  const filter = block.itemFilter;
  const fieldDef = filter ? fields.find(f => f.key === filter.field) : undefined;
  const options = filter?.field ? filterValueOptions(project, filter.field) : null;
  const valuesKey = (filter?.values || []).join(', ');
  const [draft, setDraft] = useState(valuesKey);
  const focused = useRef(false);
  const canceling = useRef(false);
  // External change (field pick, undo/redo, clear) syncs the draft; typing does not.
  useEffect(() => { if (!focused.current) setDraft(valuesKey); }, [valuesKey]);

  const commit = () => {
    if (!filter?.field) return;
    const values = draft.split(',').map(s => s.trim()).filter(Boolean);
    if (values.join(',') === (filter.values || []).join(',')) return;
    onPatch({ itemFilter: { field: filter.field, values } });
  };

  return (
    <div className={panel ? 'flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0' : 'flex items-center gap-1.5'}>
      <EditorGroup className={panel ? 'w-full' : undefined}>
        <DropdownMenu
          open={open}
          onOpenChange={setOpen}
          theme="dark"
          width="w-52"
          trigger={
            <button type="button" disabled={disabled} className={`${panel ? 'w-full' : 'w-32'} ${TB_PICKER}`}>
              <span className="truncate">{fieldDef?.label || 'Pick a field'}</span>
              <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
            </button>
          }
        >
          {fields.map(f => (
            <DropdownItem key={f.key} selected={filter?.field === f.key} onClick={() => { onPatch({ itemFilter: { field: f.key, values: [] } }); setOpen(false); }}>
              {f.label}
            </DropdownItem>
          ))}
        </DropdownMenu>
      </EditorGroup>
      <EditorGroup className={panel ? 'min-w-0 flex-1' : undefined}>
        {options && options.length > 0 ? (
          <GroupedSelect
            items={options.map(o => ({ id: o, name: o }))}
            selectedIds={filter?.values || []}
            onChange={ids => onPatch({ itemFilter: { field: filter!.field, values: ids } })}
            mode="multi"
            placeholder="Values…"
            disabled={disabled}
            theme="dark"
            className={panel ? 'w-full' : 'w-44'}
          />
        ) : (
          <input
            className={`${TB_INPUT} ${panel ? 'w-full' : 'w-40'}`}
            disabled={disabled || !filter?.field}
            value={draft}
            onFocus={() => { focused.current = true; }}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => {
              focused.current = false;
              if (canceling.current) { canceling.current = false; setDraft(valuesKey); return; }
              commit();
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
              else if (e.key === 'Escape') { canceling.current = true; e.currentTarget.blur(); }
            }}
            placeholder="Values…"
          />
        )}
        {filter?.field && (
          <button type="button" disabled={disabled} onClick={() => onPatch({ itemFilter: undefined })} className={TB_BTN_ICON} title="Clear filter">
            <X className="w-3 h-3" />
          </button>
        )}
      </EditorGroup>
    </div>
  );
};

/** Call Times block (item 111): which staged category's table to render;
 *  unset = "All categories" (one table per staged category present on the day). */
const GridCategoryMenu: React.FC<{
  value?: string;
  categories: string[];
  categoryLabels: Record<string, string>;
  disabled?: boolean;
  onChange: (value: string | undefined) => void;
}> = ({ value, categories, categoryLabels, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  const panel = useBlockEditorPanel();
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      width="w-56"
      trigger={
        <button type="button" disabled={disabled} className={`${panel ? 'w-full' : 'w-44'} ${TB_PICKER}`}>
          <span className="truncate">{value ? (categoryLabels[value] || value) : 'All categories'}</span>
          <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
        </button>
      }
    >
      <DropdownItem selected={!value} icon={!value ? <Check className="w-3.5 h-3.5" /> : undefined} onClick={() => { onChange(undefined); setOpen(false); }}>
        All categories
      </DropdownItem>
      {categories.map(c => (
        <DropdownItem key={c} selected={value === c} icon={value === c ? <Check className="w-3.5 h-3.5" /> : undefined} onClick={() => { onChange(c); setOpen(false); }}>
          {categoryLabels[c] || c}
        </DropdownItem>
      ))}
    </DropdownMenu>
  );
};

/** Shared gap control — repeat items and grid-block tables use the same
 *  number input + default (`block.gap ?? 8`, item 116). */
const GapRow: React.FC<{ label?: string; value: number; disabled?: boolean; onPatch: (patch: Partial<ReportBlock>) => void }> = ({ label = 'Item gap (px)', value, disabled, onPatch }) => (
  <ContentRow label={label}>
    <LiveNumberInput value={value} min={0} max={60} fallback={8} disabled={disabled} ariaLabel={label} className={TB_INPUT + ' w-14'} onCommit={v => onPatch({ gap: v })} />
  </ContentRow>
);

/** Kit Seg; the docked panel stretches it to the column (equal segments). */
const SegControl: React.FC<React.ComponentProps<typeof Seg>> = (props) => {
  const panel = useBlockEditorPanel();
  return <Seg {...props} stretch={panel || props.stretch} />;
};

export const BlockEditorContent: React.FC<BlockEditorProps> = ({
  block, project, parentCollection, parentCategory, readOnly, onPatch, onSaveTextStyles,
  onDuplicate, onRemove, onMove, compact, trailing, panel, relativeTarget, availableLocations,
  editorRef: editorRefProp, active: activeProp, chipKey: chipKeyProp, reportCtx,
}) => {
  const meta = BLOCK_TYPE_META[block.type] || { label: block.type, icon: null };
  const isTextLike = block.type === 'text' || block.type === 'field' || block.type === 'link';
  const { allFields, contextFields } = useReportControlContext(project, parentCollection);
  const isField = block.type === 'field';
  const emptyHidden = block.emptyBehavior === 'hideBlock';
  // Text blocks: the Format/Style body binds to the canvas block's inline
  // editor (roadmap 191) — ONE editing surface; the local fallbacks keep the
  // component self-sufficient when no channel is provided.
  const ownEditorRef = React.useRef<RichTextEditorHandle>(null);
  const editorRef = editorRefProp ?? ownEditorRef;
  const [ownActive, setOwnActive] = React.useState<RichTextState>(RICH_TEXT_STATE_IDLE);
  const rtActive = activeProp ?? ownActive;
  const ctx: BlockCtx = { block, project, parentCollection, parentCategory, readOnly, onPatch, onSaveTextStyles, panel, relativeTarget, availableLocations, editorRef, active: rtActive, reportCtx };
  // The item-formatting affix follows the editor's chip SELECTION — it shows
  // only while a chip is selected. An optimistic override keeps the panel live
  // right after an affix rewrite until the canvas editor reports the new key.
  const [ownChipKey, setOwnChipKey] = React.useState<string | null>(null);
  const [chipOverride, setChipOverride] = React.useState<string | null>(null);
  React.useEffect(() => { setOwnChipKey(null); setChipOverride(null); }, [block.id]);
  React.useEffect(() => { setChipOverride(null); }, [chipKeyProp]);
  const chipKey = chipOverride ?? (chipKeyProp !== undefined ? chipKeyProp : ownChipKey);
  const chipField = chipKey ? parseToken(chipKey).field : null;
  const chipDef = chipField ? allFields.find(f => f.key === chipField) : undefined;
  const chipIsList = !!chipDef?.multiValue;
  const sectionCls = panel ? 'flex flex-col gap-1.5 px-2.5 py-1.5 min-w-0 w-full' : 'flex flex-col gap-1.5 px-2.5 py-1.5 min-w-max';
  const rowCls = editorRowCls(panel);
  const styleLayoutCell = isTextLike ? (
    <div className={sectionCls}>
      {/* Style + Padding side by side (two columns) — Outline only for field
          blocks. Text blocks' Style row lives in the Content section's shared
          RichTextControls body (roadmap 191); field/link keep whole-block
          typography + alignment here. Text blocks have no Style column, so the
          panel gives Padding the full width (a reserved empty column left the
          section rule half-length). */}
      <div className={panel ? (block.type === 'text' ? 'flex flex-col gap-1.5 min-w-0' : 'grid grid-cols-2 gap-2 items-start') : 'flex items-start gap-5'}>
        {block.type !== 'text' && (
          <div className="flex flex-col gap-1.5 min-w-0">
            <SectionHeader>Style</SectionHeader>
            <div className={rowCls}>
              <StyleControls {...ctx} />
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1.5 min-w-0">
          <SectionHeader>Padding</SectionHeader>
          <div className={rowCls}>
            <LayoutControls {...ctx} />
          </div>
        </div>
      </div>
      {block.type === 'field' && (
        <>
          <SectionHeader>Outline</SectionHeader>
          <div className={rowCls}>
            <OutlineControls {...ctx} />
          </div>
        </>
      )}
      {block.type === 'text' && chipKey && chipIsList && (
        <ChipAffixSection
          chipKey={chipKey}
          fieldLabel={chipDef?.label ?? chipField}
          readOnly={readOnly}
          onChange={key => {
            setOwnChipKey(key);
            setChipOverride(key);
            editorRef.current?.replaceToken(key);
          }}
        />
      )}
    </div>
  ) : null;
  return (
    <BlockEditorPanelContext.Provider value={!!panel}>
    <div className={panel ? 'flex flex-col gap-1.5 min-w-0 w-full' : 'flex flex-col gap-1.5 min-w-max'}>
      {/* Header bar: block type (or attribute name) + quick controls — always
          full panel width on top; everything else stacks under it */}
      <ChromeHeader
        className="w-full"
        leading={
          isField && !panel ? (
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
      {/* Content — hidden when the block type has no content controls. The
          panel skips the eyebrow: every group inside (Display/Filters/Behavior,
          Format/Style, …) carries its own section rule, so a leading "Content"
          would stack two hairlines. */}
      {block.type !== 'pageBreak' && (
        <div className="flex flex-col gap-1.5 px-2.5 py-1.5">
          {!panel && <SectionHeader>Content</SectionHeader>}
          <ContentControls {...ctx} />
        </div>
      )}
    </div>
    </BlockEditorPanelContext.Provider>
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
  /** Docked inspector layout (labels above controls, fields full-width). */
  panel?: boolean;
  /** Text blocks only: the editor handle (formatting + chip rewriting). */
  editorRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  /** Text blocks only: the inline formatting state at the caret (selection →
   *  run, collapsed → object; drives the shared Style row). */
  active?: RichTextState;
  /** Designer chrome only: resolved relative-block target ("→ Day 4 …"). */
  relativeTarget?: string | null;
  /** Designer chrome only: the sampled item's available locations. */
  availableLocations?: ReportLocation[];
  /** Designer context (roadmap 199): the rows-mode corner label editor's
   *  `@` item lookups. */
  reportCtx?: ReportCtx;
}

// ---- named text styles (Word/Pages-like) ---------------------------------------

/** True when the block carries direct typography overrides on top of its style. */
export function blockHasDirectFormatting(block: ReportBlock): boolean {
  return block.fontSize !== undefined || block.bold !== undefined || block.italic !== undefined || block.fontFamily !== undefined;
}

/** Bake a block's direct typography into its linked named style (Word-like
 *  "Update style from selection") — ONE implementation shared by the
 *  field/link StyleControls and the text-block Content controls. Returns null
 *  when the block has no linked style. */
export function updateStyleFromBlock(project: Project, block: ReportBlock): ReportTextStyle[] | null {
  const style = getTextStyles(project).find(s => s.id === block.textStyle);
  if (!style) return null;
  return getTextStyles(project).map(s => s.id === style.id
    ? {
        ...s,
        fontSize: block.fontSize ?? s.fontSize,
        bold: block.bold ?? s.bold,
        italic: block.italic ?? s.italic,
        fontFamily: block.fontFamily ?? s.fontFamily,
      }
    : s);
}

// The named-style picker + manager modal live in `TextStyleMenu.tsx` (shared
// with the RichTextControls body without a circular import) — re-exported here
// so existing imports keep working.
export { TextStyleMenu, TextStylesModal } from './TextStyleMenu';

const COLLECTION_LABELS_LOCAL: Record<string, string> = {
  scenes: 'scenes', scenesOfDay: 'scenes', scenesOfElement: 'scenes', scenesOfCast: 'scenes',
  days: 'days', daysOfCast: 'days',
  elements: 'elements', elementsOfCategory: 'elements', elementsOfScene: 'elements',
  categories: 'categories', cast: 'cast', crew: 'crew', violationTypes: 'violation types',
  locations: 'locations', locationsOfType: 'locations', locationTypes: 'location types',
  crewOfDay: 'crew', elementCallsOfDay: 'element calls', departmentCallsOfDay: 'department calls', locationsOfDay: 'locations',
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
  const panel = useBlockEditorPanel();
  const excludedSet = new Set(excluded);
  const label = excluded.length > 0 ? `${excluded.length} excluded` : 'None';
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      width="w-44"
      trigger={
        <button type="button" disabled={disabled} className={`${TB_PICKER} ${panel ? 'w-full' : 'w-32'} disabled:pointer-events-none`}>
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
  const panel = useBlockEditorPanel();
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
      width="w-40"
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
  const panel = useBlockEditorPanel();
  const designs = project.ribbonDesigns || [];
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      width="w-44"
      trigger={
        <button type="button" disabled={disabled} className={`${TB_PICKER} ${panel ? 'w-full' : 'w-40'} disabled:pointer-events-none`}>
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
  const panel = useBlockEditorPanel();
  const dayBreaksOn = block.ribbonDayBreaks === true || block.ribbonHeaders === true;
  const toggles = [
    { key: 'ribbonDayBreaks', icon: <PanelTop className="w-3 h-3" />, title: 'Day breaks (START OF DAY / End of Day)', on: dayBreaksOn },
    { key: 'ribbonCallTimes', icon: <Clock className="w-3 h-3" />, title: 'Call times (strips & day breaks)', on: block.ribbonCallTimes === true },
    { key: 'ribbonDurations', icon: <Timer className="w-3 h-3" />, title: 'Durations (strips & day totals)', on: block.ribbonDurations === true },
    { key: 'ribbonNotes', icon: <StickyNote className="w-3 h-3" />, title: 'Note rows', on: block.ribbonNotes !== false },
    { key: 'ribbonBreaks', icon: <Coffee className="w-3 h-3" />, title: 'Break rows', on: block.ribbonBreaks === true },
  ];
  return (
    <div className={panel ? 'flex flex-wrap items-center gap-1 min-w-0' : 'flex items-center gap-1 flex-nowrap min-w-max'}>
      <EditorGroup>
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
      </EditorGroup>
      <div className={TB_DIVIDER} />
      <EditorGroup>
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
      </EditorGroup>
    </div>
  );
};

export const ContentControls: React.FC<BlockCtx> = ({ block, project, parentCollection, parentCategory, readOnly, onPatch, onSaveTextStyles, editorRef, active, panel, relativeTarget, availableLocations, reportCtx }) => {
  const { allFields, contextFields, categoryKeys, categoryLabels } = useReportControlContext(project, parentCollection);
  const disabled = readOnly;
  const fieldPickerCls = panel ? `w-full ${TB_PICKER}` : `w-36 ${TB_PICKER}`;
  const pw = (base: string) => editorFieldCls(panel, base);
  const rtActive = active ?? RICH_TEXT_STATE_IDLE;
  const [locationOpen, setLocationOpen] = useState(false);

  const fieldOptions = (scope: string | null | undefined) => fieldsForScope(allFields, scope, block.category);
  // Rows-mode corner label (roadmap 199): resolves against the ENCLOSING
  // repeat item, so its `@` field list is the parent scope.
  const headerFields = useMemo(() => fieldsForScope(allFields, parentCollection), [allFields, parentCollection]);
  const headerLookupTokens = useMemo(() => reportCtx ? buildCtxLookupTokens(reportCtx) : [], [reportCtx]);

  // Day-list fields (Work/Hold/Travel + dynamic per-type day lists + the Day
  // Types rollup list): the toolbar's day-format dropdown applies to any block
  // referencing one. The static base is extended by the `dayList` registry
  // marker so dynamically-generated per-type lists register automatically.
  const dayListKeys = useMemo(() => {
    const set = new Set(DAY_LIST_FIELD_KEYS);
    for (const f of allFields) if (f.dayList) set.add(f.key);
    return set;
  }, [allFields]);

  const hasDayList = block.type === 'text'
    ? [...dayListKeys].some(k => (block.text || '').includes(k))
    : block.type === 'field' ? dayListKeys.has(block.field || '')
    : block.type === 'table' ? (block.columns || []).some(c => dayListKeys.has(c.field))
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
    const updateFromSelection = () => {
      const next = updateStyleFromBlock(project, block);
      if (!next) return;
      onSaveTextStyles?.(next);
      onPatch({ textStyle: block.textStyle, fontSize: undefined, bold: undefined, italic: undefined, fontFamily: undefined });
    };
    // The block edits INLINE on the canvas (roadmap 191) — the chrome's
    // Content section is the shared Format + Style body bound to that editor.
    push(null,
      editorRef ? (
        <RichTextControls
          key="content"
          project={project}
          editorRef={editorRef}
          active={rtActive}
          disabled={disabled}
          value={{
            fontFamily: block.fontFamily ?? linkedStyle?.fontFamily,
            fontSize: block.fontSize ?? linkedStyle?.fontSize,
            textStyle: block.textStyle,
            align: block.align,
          }}
          lockedFormatting={{ bold: lockTooltip('bold'), italic: lockTooltip('italic') }}
          onDefaults={p => onPatch(p)}
          onStyle={p => onPatch(p)}
          onPickStyle={id => {
            if (!id) { onPatch({ textStyle: undefined }); return; }
            // Applying a style clears the block's direct typography so the
            // style's values take effect (Word behavior). Bake tweaks into
            // the style via "Update from selection" instead.
            onPatch({ textStyle: id, fontSize: undefined, bold: undefined, italic: undefined, fontFamily: undefined });
          }}
          onUpdateFromSelection={block.textStyle && blockHasDirectFormatting(block) ? updateFromSelection : undefined}
          onSaveTextStyles={onSaveTextStyles}
        />
      ) : null,
    );
  }

  if (block.type === 'link') {
    push(null,
      <ContentRow key="label" label="Label">
        <input className={TB_INPUT + ' ' + pw('w-64')} disabled={disabled} value={block.text || ''} onChange={e => onPatch({ text: e.target.value })} placeholder="Link text…" />
      </ContentRow>,
      <ContentRow key="url" label="URL">
        <input className={TB_INPUT + ' ' + pw('w-64')} disabled={disabled} value={block.url || ''} onChange={e => onPatch({ url: e.target.value })} placeholder="https://… or {{locationMapLink}}" />
      </ContentRow>,
    );
  }

  if (block.type === 'field') {
    // the field picker lives in the chrome header in bar mode; the docked
    // panel puts it at the top of Content (the header must stay narrow)
    const multi = !!block.field && !!allFields.find(f => f.key === block.field)?.multiValue;
    if (panel) {
      push(null,
        <ContentRow key="field" label="Attribute">
          <FieldPicker
            value={block.field || ''}
            fields={contextFields}
            onChange={f => onPatch({ field: f })}
            disabled={disabled}
            placeholder="Select attribute…"
            scope={parentCollection}
            className={fieldPickerCls}
          />
        </ContentRow>,
      );
    }
    push(multi ? 'Value' : null,
      <ContentRow key="prefix" label="Prefix">
        <input className={TB_INPUT + ' ' + pw('w-20')} disabled={disabled} value={block.prefix || ''} onChange={e => onPatch({ prefix: e.target.value })} />
      </ContentRow>,
      <ContentRow key="suffix" label="Suffix">
        <input className={TB_INPUT + ' ' + pw('w-20')} disabled={disabled} value={block.suffix || ''} onChange={e => onPatch({ suffix: e.target.value })} />
      </ContentRow>,
    );
    if (multi) {
      push('Items',
        <ContentRow key="itemPrefix" label="Item prefix">
          <input className={TB_INPUT + ' ' + pw('w-20')} disabled={disabled} value={block.itemPrefix || ''} onChange={e => onPatch({ itemPrefix: e.target.value })} placeholder="e.g. —" />
        </ContentRow>,
        <ContentRow key="itemSuffix" label="Item suffix">
          <input className={TB_INPUT + ' ' + pw('w-20')} disabled={disabled} value={block.itemSuffix || ''} onChange={e => onPatch({ itemSuffix: e.target.value })} placeholder="e.g. —" />
        </ContentRow>,
        <ContentRow key="itemSep" label="Separator">
          <input className={TB_INPUT + ' ' + pw('w-20')} disabled={disabled} value={block.itemSeparator ?? ', '} onChange={e => onPatch({ itemSeparator: e.target.value })} />
        </ContentRow>,
      );
    }
  }

  if (block.type === 'table' && block.custom) {
    // Headers and rows are edited ON the table (roadmap 188) — the chrome
    // keeps only the mode + header/border toggles.
    push(null,
      <ContentRow key="mode" label="Mode">
        <SegControl
          value="custom"
          options={[{ v: 'custom', l: 'Free table' }, { v: 'collection', l: 'From collection' }]}
          onChange={v => { if (v === 'collection') onPatch({ custom: false }); }}
          disabled={disabled}
        />
      </ContentRow>,
      <ContentRow key="headerBorders" label="Header & borders">
        <EditorGroup className={panel ? 'w-full' : undefined}>
          <EditorCheckbox className={panel ? 'flex-1' : undefined} checked={block.showHeader !== false} disabled={disabled} onChange={on => onPatch({ showHeader: on })} label="Header row" />
          <EditorCheckbox className={panel ? 'flex-1' : undefined} checked={block.showBorders !== false} disabled={disabled} onChange={on => onPatch({ showBorders: on })} label="Cell borders" />
        </EditorGroup>
      </ContentRow>,
    );
  } else if (block.type === 'repeat' || block.type === 'table') {
    // Order reads: what the table IS (Display) → over what (Table over) →
    // which rows (Filters) → behavior (roadmap 205).
    if (block.type === 'table') {
      push('Display',
        <ContentRow key="mode" label="Mode">
          <SegControl
            value="collection"
            options={[{ v: 'custom', l: 'Free table' }, { v: 'collection', l: 'From collection' }]}
            onChange={v => {
              if (v !== 'custom') return;
              const cols = block.columns || [];
              const firstRow = { id: blockId(), cells: cols.map(() => '') };
              onPatch({ custom: true, customRows: (block.customRows && block.customRows.length > 0) ? block.customRows : [firstRow] });
            }}
            disabled={disabled}
          />
        </ContentRow>,
        <ContentRow key="axis" label="Axis">
          <SegControl
            value={block.axis ?? 'columns'}
            options={[{ v: 'columns', l: 'Columns' }, { v: 'rows', l: 'Rows' }]}
            onChange={v => onPatch({ axis: v as 'columns' | 'rows' })}
            disabled={disabled}
          />
        </ContentRow>,
        (block.axis ?? 'columns') === 'columns' ? (
          <ContentRow key="headerBorders" label="Header & borders">
            <EditorGroup className={panel ? 'w-full' : undefined}>
              <EditorCheckbox className={panel ? 'flex-1' : undefined} checked={!!block.showHeader} disabled={disabled} onChange={on => onPatch({ showHeader: on })} label="Header row" />
              <EditorCheckbox className={panel ? 'flex-1' : undefined} checked={block.showBorders !== false} disabled={disabled} onChange={on => onPatch({ showBorders: on })} label="Cell borders" />
            </EditorGroup>
          </ContentRow>
        ) : (
          <React.Fragment key="rowsHeader">
            <ContentRow label="Item header">
              <FieldPicker
                value={block.headerField || ''}
                fields={fieldOptions(tableFieldScope(block, parentCollection))}
                onChange={f => onPatch({ headerField: f })}
                disabled={disabled}
                placeholder="— auto —"
                scope={tableFieldScope(block, parentCollection)}
                className={fieldPickerCls}
              />
              <EditorCheckbox checked={block.showBorders !== false} disabled={disabled} onChange={on => onPatch({ showBorders: on })} label="Cell borders" />
            </ContentRow>
            <ContentRow label="Corner header">
              <EditorCheckbox
                className={panel ? 'flex-1' : undefined}
                checked={!!block.headerFieldLabelEnabled}
                disabled={disabled}
                onChange={on => onPatch({ headerFieldLabelEnabled: on })}
                label="Custom text"
              />
            </ContentRow>
            {block.headerFieldLabelEnabled && (
              <div className={`${pw('w-56')} min-w-0`}>
                <RichTextEditor
                  value={block.headerFieldLabel || ''}
                  onChange={html => onPatch({ headerFieldLabel: html })}
                  placeholder="Corner header…"
                  disabled={disabled}
                  fields={headerFields}
                  allFields={allFields}
                  lookupTokens={headerLookupTokens}
                  ctx={reportCtx}
                  className="w-full"
                />
              </div>
            )}
          </React.Fragment>
        ),
        hasDayList ? (
          <ContentRow key="dayFormat" label="Day format">
            <DayFormatMenu value={block.dayFormat || 'dayNumDate'} disabled={disabled} onChange={v => onPatch({ dayFormat: v as DayFormatMode })} />
          </ContentRow>
        ) : null,
      );
    }
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
            width="w-40"
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
            width="w-40"
            onChange={(c, cat) => onPatch(collectionPickPatch(c, cat))}
          />
        )}
      </ContentRow>,
      block.type === 'repeat' ? (
        <GapRow key="gap" value={block.gap ?? 8} disabled={disabled} onPatch={onPatch} />
      ) : null,
    );
    const effective = block.type === 'table' ? tableItemCollection(block, parentCollection) : (block.collection || 'scenes');
    const skipEmpty = block.collection ? SKIP_EMPTY_TEST[block.collection] : undefined;
    if (block.collection) {
      push('Filters',
        skipEmpty ? (
          <ContentRow key="skipEmpty" label="Skip empty">
            <EditorCheckbox checked={block.skipEmptyCategories !== false} disabled={disabled} onChange={on => onPatch({ skipEmptyCategories: on })} label={block.collection ? (SKIP_EMPTY_LABEL[block.collection] || 'Skip empty items') : 'Skip empty items'} />
          </ContentRow>
        ) : null,
        block.collection === 'categories' ? (
          <ContentRow key="exclude" label="Exclude categories">
            <ExcludeCategoriesMenu
              excluded={block.excludedCategories || []}
              categoryKeys={categoryKeys}
              categoryLabels={categoryLabels}
              disabled={disabled}
              onChange={list => onPatch({ excludedCategories: list })}
            />
          </ContentRow>
        ) : null,
        <ContentRow key="itemFilter" label="Filter rows">
          <ItemFilterControl block={block} project={project} fields={fieldsForScope(allFields, block.collection)} disabled={disabled} onPatch={onPatch} />
        </ContentRow>,
      );
    }
    push('Behavior',
      <ContentRow key="counter" label="Counter starts at">
        <SegControl
          value={String(block.counterStart ?? 1)}
          options={[{ v: '1', l: '1' }, { v: '0', l: '0' }]}
          onChange={v => onPatch({ counterStart: v === '0' ? 0 : 1 })}
          disabled={disabled}
        />
      </ContentRow>,
      parentCollection && !NON_SCOPABLE_COLLECTIONS.has(effective) && !CONTEXTUAL_COLLECTIONS.has(effective) ? (
        <ContentRow key="scope" label="Scope">
          <EditorCheckbox checked={block.scopedToParent !== false} disabled={disabled} onChange={on => onPatch({ scopedToParent: on })} label={`Only ${COLLECTION_LABELS_LOCAL[effective] || 'items'} in this ${PARENT_LABELS[parentCollection] || 'item'}`} />
        </ContentRow>
      ) : null,
    );
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

  if (block.type === 'callTimes') {
    push(null,
      <ContentRow key="category" label="Category">
        <GridCategoryMenu
          value={block.category}
          categories={stagedCategoryKeys(project)}
          categoryLabels={categoryLabels}
          disabled={disabled}
          onChange={v => onPatch({ category: v })}
        />
      </ContentRow>,
      <GapRow key="gap" label="Table gap (px)" value={block.gap ?? 8} disabled={disabled} onPatch={onPatch} />,
    );
  }

  if (block.type === 'relative') {
    const offset = block.relativeOffset ?? 1;
    const count = Math.max(1, block.relativeCount ?? 1);
    push(null,
      <ContentRow key="offset" label="Offset">
        <div className="flex items-center gap-1">
          <ToolButton onClick={() => onPatch({ relativeOffset: offset - 1 })} disabled={disabled} title="Previous item" className={TB_BTN}><Minus className="w-3 h-3" /></ToolButton>
          <LiveNumberInput value={offset} min={-20} max={20} fallback={1} disabled={disabled} className={TB_INPUT + ' w-12 text-center'} onCommit={v => onPatch({ relativeOffset: v })} />
          <ToolButton onClick={() => onPatch({ relativeOffset: offset + 1 })} disabled={disabled} title="Next item" className={TB_BTN}><Plus className="w-3 h-3" /></ToolButton>
        </div>
      </ContentRow>,
      <ContentRow key="count" label="Count">
        <div className="flex items-center gap-1">
          <ToolButton onClick={() => onPatch({ relativeCount: Math.max(1, count - 1) })} disabled={disabled} title="Fewer" className={TB_BTN}><Minus className="w-3 h-3" /></ToolButton>
          <LiveNumberInput value={count} min={1} max={20} fallback={1} disabled={disabled} className={TB_INPUT + ' w-12 text-center'} onCommit={v => onPatch({ relativeCount: Math.max(1, v) })} />
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
        <LiveNumberInput value={block.height} min={4} max={200} fallback={16} disabled={disabled} className={TB_INPUT + ' w-14'} onCommit={v => onPatch({ height: v })} />
      </ContentRow>,
      <ContentRow key="style" label="Style">
        <SegControl
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
          <LiveNumberInput value={block.spacerThickness} min={1} max={8} fallback={1} disabled={disabled} className={TB_INPUT + ' w-14'} onCommit={v => onPatch({ spacerThickness: v })} />
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
          <SegControl
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
          <span className="text-[10px] text-zinc-400">Comes from the day's location</span>
        ) : hasPin ? (
          <>
            <button
              onClick={() => setLocationOpen(true)}
              disabled={disabled}
              title="Change location"
              className="max-w-44 truncate text-[10px] text-zinc-400 cursor-pointer text-left hover:text-zinc-200 transition-colors"
            >
              {block.mapPlace || `${block.mapLat!.toFixed(4)}, ${block.mapLng!.toFixed(4)}`}
            </button>
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
        <LiveNumberInput value={block.mapHeight} min={80} max={1200} fallback={240} disabled={disabled} className={TB_INPUT + ' w-14'} onCommit={v => onPatch({ mapHeight: v })} />
      </ContentRow>,
    );
    push('Map',
      <ContentRow key="inherit" label="Day location">
        <EditorCheckbox checked={inherited} disabled={disabled} onChange={on => onPatch({ mapInheritLocation: on })} label="Use the day's location" />
      </ContentRow>,
      inherited && availableLocations && availableLocations.length > 1 ? (
        <LocationChoiceRow key="showLoc" block={block} availableLocations={availableLocations} disabled={disabled} onPatch={onPatch} />
      ) : null,
      <ContentRow key="open" label="Open in">
        <SegControl
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
    );
  }

  return (
    <div className={panel ? 'flex flex-col gap-2 min-w-0 w-full' : 'flex flex-col gap-2 min-w-max'}>
      {sections.map((s, i) => (
        <div key={s.title ?? `flat${i}`} className={panel ? 'flex flex-col gap-1 min-w-0 w-full' : 'flex flex-col gap-1 min-w-max'}>
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
          initial={
            block.mapLat != null && block.mapLng != null
              ? {
                  lat: block.mapLat,
                  lng: block.mapLng,
                  place: block.mapPlace,
                  address: block.mapAddress,
                  city: block.mapCity,
                  postcode: block.mapPostcode,
                  country: block.mapCountry,
                }
              : null
          }
        />
      )}
    </div>
  );
};

// ---- style controls (typography — field / link blocks) -------------------------
// Text blocks' typography + alignment live in the Content section's shared
// RichTextControls body (roadmap 191), bound to the inline canvas editor.

export const StyleControls: React.FC<BlockCtx> = ({ block, project, readOnly, onPatch, onSaveTextStyles, editorRef, active, panel }) => {
  const disabled = readOnly;
  const font = block.fontFamily || 'Helvetica';
  const hasSelection = !!active?.hasSelection;
  // With a text selection the pick shows/edits the RUN's linked id; otherwise
  // the object-level `block.textStyle` (current behavior).
  const styleId = hasSelection ? (active?.textStyle || '') : (block.textStyle || '');
  const styleMixed = hasSelection && !!active?.textStyleMixed;
  const [stylesOpen, setStylesOpen] = useState(false);
  const updateFromSelection = () => {
    const next = updateStyleFromBlock(project, block);
    if (!next) return;
    onSaveTextStyles?.(next);
    onPatch({ textStyle: block.textStyle, fontSize: undefined, bold: undefined, italic: undefined, fontFamily: undefined });
  };
  return (
    <>
      {onSaveTextStyles && (
        <>
          <EditorGroup>
            <TextStyleMenu
              value={styleId}
              project={project}
              disabled={disabled}
              editorRef={editorRef}
              hasSelection={hasSelection}
              mixed={styleMixed}
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
            <TextStylesModal open={stylesOpen} project={project} onClose={() => setStylesOpen(false)} onSave={styles => onSaveTextStyles(styles)} />
          </EditorGroup>
          <div className={TB_DIVIDER} />
        </>
      )}
      <EditorGroup>
        <FontMenu value={font} disabled={disabled} onChange={f => onPatch({ fontFamily: f })} />
        <Tooltip content="Font size (pt)">
          <LiveNumberInput
            value={block.fontSize}
            min={6}
            max={48}
            fallback={10}
            disabled={disabled}
            className={TB_NUM}
            onCommit={v => onPatch({ fontSize: v })}
          />
        </Tooltip>
      </EditorGroup>
      {/* block-level B/I only for field blocks — link blocks keep their fixed
          link look; text blocks use the shared body's run formatting */}
      {block.type === 'field' && (
        <>
          <div className={TB_DIVIDER} />
          <EditorGroup>
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
          </EditorGroup>
        </>
      )}
      <div className={TB_DIVIDER} />
      <EditorGroup>
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
      </EditorGroup>
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
    <EditorGroup>
      <span className="text-[10px] text-zinc-500 shrink-0">Pad V</span>
      <Tooltip content="Vertical padding (px)">
        <LiveNumberInput
          value={block.paddingV}
          min={0}
          max={24}
          fallback={2}
          readOnly={readOnly}
          className={TB_NUM}
          onCommit={v => onPatch({ paddingV: v })}
        />
      </Tooltip>
    </EditorGroup>
    <EditorGroup>
      <span className="text-[10px] text-zinc-500 shrink-0">Pad H</span>
      <Tooltip content="Horizontal padding (px)">
        <LiveNumberInput
          value={block.paddingH}
          min={0}
          max={24}
          fallback={4}
          readOnly={readOnly}
          className={TB_NUM}
          onCommit={v => onPatch({ paddingH: v })}
        />
      </Tooltip>
    </EditorGroup>
  </>
);

// ---- chip item-formatting (text blocks — list attributes only) ----------------

export const ChipAffixSection: React.FC<{
  chipKey: string;
  fieldLabel: string;
  readOnly: boolean;
  onChange: (key: string) => void;
}> = ({ chipKey, fieldLabel, readOnly, onChange }) => {
  const panel = useBlockEditorPanel();
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
      <div className={panel ? 'flex flex-wrap items-center gap-1.5 min-w-0' : 'flex items-center gap-1.5 flex-nowrap min-w-max'}>
        <EditorGroup className={panel ? 'min-w-0 flex-1' : undefined}>
          <span className="text-[10px] text-zinc-500 shrink-0">Prefix</span>
          <input aria-label="Item prefix" readOnly={readOnly} className={TB_INPUT + (panel ? ' flex-1' : ' w-20')} value={opts.itemPrefix ?? ''} onChange={e => setOpt('itemPrefix', e.target.value)} />
        </EditorGroup>
        <EditorGroup className={panel ? 'min-w-0 flex-1' : undefined}>
          <span className="text-[10px] text-zinc-500 shrink-0">Suffix</span>
          <input aria-label="Item suffix" readOnly={readOnly} className={TB_INPUT + (panel ? ' flex-1' : ' w-20')} value={opts.itemSuffix ?? ''} onChange={e => setOpt('itemSuffix', e.target.value)} />
        </EditorGroup>
        <EditorGroup className={panel ? 'min-w-0 flex-1' : undefined}>
          <span className="text-[10px] text-zinc-500 shrink-0">Sep</span>
          <input aria-label="Item separator" readOnly={readOnly} className={TB_INPUT + (panel ? ' flex-1' : ' w-20')} value={opts.itemSeparator ?? ''} onChange={e => setOpt('itemSeparator', e.target.value)} />
        </EditorGroup>
      </div>
    </>
  );
};

// ---- day format menu ------------------------------------------------------------

export const DayFormatMenu: React.FC<{ value: string; disabled: boolean; onChange: (v: string) => void }> = ({ value, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  const panel = useBlockEditorPanel();
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      width="w-40"
      trigger={
        <button type="button" disabled={disabled} className={`${TB_PICKER} ${panel ? 'w-full' : 'w-36'} disabled:pointer-events-none`}>
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
