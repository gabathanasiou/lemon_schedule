import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Seg, ChromeHeader, FontMenu, RICH_TEXT_STATE_IDLE, TB_BTN, TB_BTN_ICON, TB_DANGER, TB_INPUT, TB_DIVIDER, TB_PICKER } from '@gabriel/ui-kit';
import { ReportBlock, ReportCollection, Project, ReportTextStyle, ReportBlockStyle } from '../../types';
import { baseValidCollections, tableItemCollection, tableFieldScope, COLLECTION_LABELS, CONTEXTUAL_COLLECTIONS, NON_SCOPABLE_COLLECTIONS, blockId, makeReportBlock, supportsTitle, titleRepeatable, reportTitleAutoLabel, collectionPickPatch, repeatMenuCollections, tableMenuCollections, selfRepeatDisabledCategories } from '../../lib/reportBlocks';
import { getReportFieldDefs, fieldsForScope, fieldScopeFor, ReportFieldDef, DAY_LIST_FIELD_KEYS, smartFieldLabel, parseToken, composeTokenKey, TOKEN_RE } from '../../lib/reportFields';
import { ELEMENT_CATEGORIES, getLabel, getFieldItems } from '../../lib/categories';
import { isImeConfirm } from '../../lib/keys';
import { DAY_FORMAT_OPTIONS, DayFormatMode } from '../../lib/utils';
import { codeForType } from '../../lib/dayTypes';
import { getTextStyles, getTextStyleById } from '../../lib/reportTextStyles';
import { FieldPicker } from './FieldPicker';
import CollectionMenu from './CollectionMenu';
import { RichTextEditorHandle, RichTextState } from './RichTextEditor';
import RichTextControls from './RichTextControls';
import { TextStyleMenu, TextStylesModal } from './TextStyleMenu';
import DropdownMenu from '../DropdownMenu';
import { LiveNumberInput } from '../LiveNumberInput';
import { GroupedSelect } from '../production/day/GroupedSelect';
import DropdownItem from '../DropdownItem';
import { Tooltip } from '../Tooltip';
import { Plus, Minus, Check, ChevronDown, Trash2, X, AlignLeft, AlignCenter, AlignRight, Type, Repeat, Table2, Columns3, Printer, FilePlus, Ruler, Eye, EyeOff, Image as ImageIcon, MapPin, Clock, Timer, StickyNote, Coffee, PanelTop, Sheet, SkipForward, Users, Wallet, Palette, MoreHorizontal, ArrowUp, ArrowDown, CopyPlus } from 'lucide-react';
import { LocationPickerModal } from '../location/LocationPickerModal';
import { SKIP_EMPTY_TEST, SKIP_EMPTY_LABEL } from '../../lib/reportData';
import { stagedCategoryKeys } from '../../lib/reportGrids';
import { projectDepartments } from '../../lib/dayCrew';
import Checklist from '../Checklist';
import { reportLocationLabel } from '../../lib/reportWeather';
import type { ReportLocation } from '../../lib/reportWeather';
import { BlockEditorPanelContext, ContentRow, EditorCheckbox, EditorGroup, EditorSection, editorFieldCls, useBlockEditorPanel } from './reportEditorLayout';
import { InspectorAction, InspectorColor, InspectorGroup, InspectorMenu, InspectorNumber, InspectorRow, InspectorSeg, InspectorSubGroup, InspectorToggle, useInspectorSurface } from '../inspector';
import BudgetBlockControls from './BudgetBlockControls';
import { AnchorGrid } from '../AnchorGrid';
import { IMAGE_ALIGNS, IMAGE_ANCHOR_ROWS } from '../../lib/reportImageLayout';
import { useDialog } from '../Dialog';
import DropdownDivider from '../DropdownDivider';
import { BUILTIN_BLOCK_STYLES, blockStyleMatches, blockStylePatch, blockStyleFromBlock, blockSurfaceOf } from '../../lib/reportBlockStyles';
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
  precalls: { label: 'Precalls', icon: <Timer className="w-3 h-3" /> },
  budgetTable: { label: 'Budget Table', icon: <Wallet className="w-3 h-3" /> },
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
  onSaveBlockStyles?: (styles: ReportBlockStyle[]) => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  onMove?: (dir: -1 | 1) => void;
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
  const current = block.locationChoice || (choices[0].typeKey || '');
  return (
    <EditorSection label="Show location">
      <InspectorRow>
        <InspectorMenu
          label="Show location"
          value={current}
          options={choices.map(l => ({
            value: l.typeKey || '',
            label: l.info ? `${l.info.name} · ${l.info.typeLabel}` : reportLocationLabel(l),
          }))}
          onChange={v => onPatch({ locationChoice: v })}
          disabled={disabled}
          menuWidth="w-56"
          width="w-44"
        />
      </InspectorRow>
    </EditorSection>
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
              <ChevronDown className="w-3 h-3 shrink-0 text-[color:var(--ui-text-faint)]" />
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
              if (e.key === 'Enter' && !isImeConfirm(e)) { e.preventDefault(); e.currentTarget.blur(); }
              else if (e.key === 'Escape') { canceling.current = true; e.currentTarget.blur(); }
            }}
            enterKeyHint="done"
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
}> = ({ value, categories, categoryLabels, disabled, onChange }) => (
  <InspectorMenu
    label="Category"
    value={value ?? ''}
    options={[
      { value: '', label: 'All categories' },
      ...categories.map(c => ({ value: c, label: categoryLabels[c] || c })),
    ]}
    onChange={v => onChange(v || undefined)}
    disabled={disabled}
    menuWidth="w-56"
    width="w-44"
  />
);

/** Shared gap control — repeat items and grid-block tables use the same
 *  number input + default (`block.gap ?? 8`, item 116). */
/** Shared gap control — repeat items and grid-block tables use the same
 *  number input + default (`block.gap ?? 8`, item 116). `ariaLabel` keeps the
 *  full domain name when the visible row label is shortened. */
const GapRow: React.FC<{ label?: string; ariaLabel?: string; value: number; disabled?: boolean; onPatch: (patch: Partial<ReportBlock>) => void }> = ({ label = 'Gap', ariaLabel = 'Item gap', value, disabled, onPatch }) => (
  <InspectorRow label={label}>
    <InspectorNumber label={ariaLabel} unit="px" value={value} min={0} max={60} fallback={8} onCommit={v => onPatch({ gap: v })} disabled={disabled} />
  </InspectorRow>
);

/** Kit Seg, adapted: the docked panel stretches it to the column (equal
 *  segments); when its labels cannot fit it becomes the same value menu. */
const SegControl: React.FC<React.ComponentProps<typeof Seg>> = ({ value, options, onChange, disabled, ariaLabel }) => (
  <InspectorSeg value={value} options={options} onChange={onChange} disabled={disabled} label={ariaLabel || 'Options'} />
);

export const BlockEditorContent: React.FC<BlockEditorProps> = ({
  block, project, parentCollection, parentCategory, readOnly, onPatch, onSaveTextStyles, onSaveBlockStyles,
  onDuplicate, onRemove, onMove, trailing, panel, relativeTarget, availableLocations,
  editorRef: editorRefProp, active: activeProp, chipKey: chipKeyProp,
}) => {
  const meta = BLOCK_TYPE_META[block.type] || { label: block.type, icon: null };
  const isTextLike = block.type === 'text' || block.type === 'field' || block.type === 'link';
  const { allFields, contextFields } = useReportControlContext(project, parentCollection, parentCategory);
  const isField = block.type === 'field';
  const emptyHidden = block.emptyBehavior === 'hideBlock';
  // Text blocks: the Format/Style body binds to the canvas block's inline
  // editor (roadmap 191) — ONE editing surface; the local fallbacks keep the
  // component self-sufficient when no channel is provided.
  const ownEditorRef = React.useRef<RichTextEditorHandle>(null);
  const editorRef = editorRefProp ?? ownEditorRef;
  const [ownActive, setOwnActive] = React.useState<RichTextState>(RICH_TEXT_STATE_IDLE);
  const rtActive = activeProp ?? ownActive;
  const ctx: BlockCtx = { block, project, parentCollection, parentCategory, readOnly, onPatch, onSaveTextStyles, onSaveBlockStyles, panel, relativeTarget, availableLocations, editorRef, active: rtActive };
  // The item-formatting affix follows the editor's chip SELECTION — it shows
  // only while a chip is selected. An optimistic override keeps the panel live
  // right after an affix rewrite until the canvas editor reports the new key.
  const [ownChipKey, setOwnChipKey] = React.useState<string | null>(null);
  const [chipOverride, setChipOverride] = React.useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = React.useState(false);
  React.useEffect(() => { setOwnChipKey(null); setChipOverride(null); }, [block.id]);
  React.useEffect(() => { setChipOverride(null); }, [chipKeyProp]);
  const chipKey = chipOverride ?? (chipKeyProp !== undefined ? chipKeyProp : ownChipKey);
  const chipField = chipKey ? parseToken(chipKey).field : null;
  const chipDef = chipField ? allFields.find(f => f.key === chipField) : undefined;
  const chipIsList = !!chipDef?.multiValue;
  const sectionCls = panel ? 'flex flex-col gap-4 px-0 py-0 min-w-0 w-full' : 'flex flex-col gap-2 px-0 py-0 min-w-max';
  const styleLayoutCell = isTextLike ? (
    <div className={sectionCls}>
      {/* Style + Padding as stacked sections (roadmap 373) — Outline for field
          AND text blocks. Text blocks' Style row lives in the Content section's
          shared RichTextControls body (roadmap 191); field/link keep
          whole-block typography + alignment here. */}
      <div className={panel ? 'flex flex-col gap-4 min-w-0' : 'flex flex-col gap-2 min-w-max'}>
        {block.type !== 'text' && (
          <EditorSection label="Style">
            <InspectorRow>
              <StyleControls {...ctx} />
            </InspectorRow>
          </EditorSection>
        )}
        <EditorSection label="Padding">
          <LayoutControls {...ctx} />
        </EditorSection>
      </div>
      {(block.type === 'field' || block.type === 'text') && (
        <EditorSection label="Outline">
          <OutlineSection {...ctx} />
        </EditorSection>
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
    <BlockEditorPanelContext.Provider value={panel ? 'panel' : 'bar'}>
    <div className={panel ? 'flex flex-col gap-4 min-w-0 w-full' : 'flex flex-col gap-2 min-w-max'}>
      {/* Header bar: block type (or attribute name) + quick controls — always
          full panel width on top; everything else stacks under it */}
      <ChromeHeader
        className="w-full"
        leading={
          isField && !panel ? (
            <>
              <span className="flex items-center text-[color:var(--ui-text-muted)] shrink-0">{meta.icon}</span>
              <FieldPicker
                value={block.field || ''}
                fields={contextFields}
                onChange={f => onPatch({ field: f })}
                disabled={readOnly}
                placeholder="Select attribute…"
                scope={fieldScopeFor(parentCollection)}
                className={`w-44 font-semibold ${TB_PICKER}`}
              />
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[color:var(--ui-text)] pr-1">
              {meta.icon}
              {meta.label}
              {block.collection && <span className="text-[color:var(--ui-text-faint)] font-normal">· {COLLECTION_LABELS[block.collection]}</span>}
            </span>
          )
        }
        trailing={
          <>
            {panel ? (
              <DropdownMenu
                open={actionsOpen}
                onOpenChange={setActionsOpen}
                theme="dark"
                width="w-48"
                trigger={
                  <button type="button" title="Block actions" aria-label="Block actions" className={`${TB_BTN_ICON} shrink-0`}>
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                }
              >
                {isTextLike && (
                  <DropdownItem
                    icon={emptyHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    onClick={() => { setActionsOpen(false); onPatch({ emptyBehavior: emptyHidden ? 'show' : 'hideBlock' }); }}
                  >
                    {emptyHidden ? 'Show when empty' : 'Hide when empty'}
                  </DropdownItem>
                )}
                {isTextLike && <DropdownDivider />}
                {onMove && <DropdownItem icon={<ArrowUp className="w-3.5 h-3.5" />} onClick={() => { setActionsOpen(false); onMove(-1); }}>Move up</DropdownItem>}
                {onMove && <DropdownItem icon={<ArrowDown className="w-3.5 h-3.5" />} onClick={() => { setActionsOpen(false); onMove(1); }}>Move down</DropdownItem>}
                {onDuplicate && <DropdownItem icon={<CopyPlus className="w-3.5 h-3.5" />} onClick={() => { setActionsOpen(false); onDuplicate(); }}>Duplicate</DropdownItem>}
                {onRemove && <DropdownItem icon={<Trash2 className="w-3.5 h-3.5" />} variant="danger" onClick={() => { setActionsOpen(false); onRemove(); }}>Delete</DropdownItem>}
              </DropdownMenu>
            ) : (
              <>
                {isTextLike && (
                  <InspectorAction
                    onClick={() => onPatch({ emptyBehavior: emptyHidden ? 'show' : 'hideBlock' })}
                    title={emptyHidden ? 'Hidden when empty — click to show' : 'Show when empty — click to hide'}
                    disabled={readOnly}
                    className={TB_BTN_ICON}
                  >
                    {emptyHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </InspectorAction>
                )}
                {isTextLike && <div className={TB_DIVIDER} />}
                {onMove && <InspectorAction title="Move up" onClick={() => onMove(-1)} disabled={readOnly} className={TB_BTN_ICON}><ArrowUp className="w-3 h-3" /></InspectorAction>}
                {onMove && <InspectorAction title="Move down" onClick={() => onMove(1)} disabled={readOnly} className={TB_BTN_ICON}><ArrowDown className="w-3 h-3" /></InspectorAction>}
                {onDuplicate && <InspectorAction title="Duplicate" onClick={onDuplicate} disabled={readOnly} className={TB_BTN_ICON}><CopyPlus className="w-3 h-3" /></InspectorAction>}
                {onRemove && <InspectorAction title="Delete" onClick={onRemove} disabled={readOnly} className={`${TB_BTN_ICON} ${TB_DANGER}`}><Trash2 className="w-3 h-3" /></InspectorAction>}
                {!readOnly && <div className={TB_DIVIDER} />}
              </>
            )}
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
        <div className={`flex flex-col ${panel ? 'gap-4' : 'gap-2'} py-0`}>
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
  onSaveBlockStyles?: (styles: ReportBlockStyle[]) => void;
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
  categories: 'categories', cast: 'cast', crew: 'crew', departments: 'departments', violationTypes: 'violation types',
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

export function useReportControlContext(project: Project, parentCollection?: ReportCollection, parentCategory?: string): { allFields: ReportFieldDef[]; contextFields: ReportFieldDef[]; categoryKeys: { key: string; isCustom: boolean }[]; categoryLabels: Record<string, string>; } {
  const allFields = useMemo(() => getReportFieldDefs(project), [project]);
  const contextFields = useMemo(() => fieldsForScope(allFields, parentCollection, parentCategory), [allFields, parentCollection, parentCategory]);
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
          <ChevronDown className="w-3 h-3 shrink-0 text-[color:var(--ui-text-faint)]" />
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
  const collections = tableMenuCollections(block, parentCollection, parentCategory);
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
      disabledCategories={selfRepeatDisabledCategories(parentCollection, parentCategory, allCategoryKeys)}
      onChange={(c, cat) => onPatch(collectionPickPatch(c, cat))}
    />
  );
};

/** Ribbon design picker for ribbon blocks (module scope — stable identity). */
const RibbonDesignMenu: React.FC<{ block: ReportBlock; project: Project; disabled: boolean; onPatch: (p: Partial<ReportBlock>) => void }> = ({ block, project, disabled, onPatch }) => {
  const designs = project.ribbonDesigns || [];
  return (
    <InspectorMenu
      label="Ribbon design"
      value={block.ribbonId || project.activeRibbonId || ''}
      options={designs.map(d => ({ value: d.id, label: d.name }))}
      onChange={id => onPatch({ ribbonId: id })}
      disabled={disabled}
      menuWidth="w-44"
      width="w-40"
      placeholder="—"
    />
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
          <InspectorToggle
            key={t.key}
            label={t.title}
            pressed={t.on}
            onChange={() => t.key === 'ribbonDayBreaks'
              ? onPatch(dayBreaksOn ? { ribbonDayBreaks: false, ribbonHeaders: false } : { ribbonDayBreaks: true })
              : onPatch({ [t.key]: !t.on } as Partial<ReportBlock>)}
            icon={t.icon}
            disabled={disabled}
          />
        ))}
      </EditorGroup>
      <div className={TB_DIVIDER} />
      <EditorGroup>
        {toggles.slice(1).map(t => (
          <InspectorToggle
            key={t.key}
            label={t.title}
            pressed={t.on}
            onChange={() => onPatch({ [t.key]: !t.on } as Partial<ReportBlock>)}
            icon={t.icon}
            disabled={disabled}
          />
        ))}
      </EditorGroup>
    </div>
  );
};

/** The Format + Style body of a text block (roadmap 191) — the ONE chrome
 *  body bound to a live canvas editor. Shared by text blocks themselves and by
 *  table titles (roadmap 140 — a title IS a text block). */
const TextContentControls: React.FC<{
  block: ReportBlock;
  project: Project;
  onPatch: (patch: Partial<ReportBlock>) => void;
  onSaveTextStyles?: (styles: ReportTextStyle[]) => void;
  editorRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  active: RichTextState;
  disabled?: boolean;
}> = ({ block, project, onPatch, onSaveTextStyles, editorRef, active, disabled }) => {
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
  if (!editorRef) return null;
  return (
    <RichTextControls
      project={project}
      editorRef={editorRef}
      active={active}
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
  );
};

export const ContentControls: React.FC<BlockCtx> = ({ block, project, parentCollection, parentCategory, readOnly, onPatch, onSaveTextStyles, onSaveBlockStyles, editorRef, active, panel, relativeTarget, availableLocations }) => {
  const { allFields, contextFields, categoryKeys, categoryLabels } = useReportControlContext(project, parentCollection, parentCategory);
  const disabled = readOnly;
  const fieldPickerCls = panel ? `w-full ${TB_PICKER}` : `w-36 ${TB_PICKER}`;
  const pw = (base: string) => editorFieldCls(panel, base);
  const rtActive = active ?? RICH_TEXT_STATE_IDLE;
  const [locationOpen, setLocationOpen] = useState(false);

  const fieldOptions = (scope: string | null | undefined) => fieldsForScope(allFields, scope, block.category);

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

  // Optional title (item 140) — table-shaped blocks, the repeat (heading) and
  // image/map (caption). The title IS a text block (`titleBlock`): same
  // renderer, same Format/Style body and padding controls as any text block,
  // default centered/bold. Turning it on seeds it from the block's auto label.
  const titleBlock = block.titleBlock;
  const patchTitle = titleBlock ? (p: Partial<ReportBlock>) => onPatch({ titleBlock: { ...titleBlock, ...p } }) : undefined;
  const titleSection = supportsTitle(block.type) ? (
    <>
      <ContentRow key="showTitle" label="Title">
        <EditorGroup className={panel ? 'w-full' : undefined}>
          <EditorCheckbox
            checked={block.showTitle === true}
            disabled={disabled}
            onChange={on => onPatch(on
              ? { showTitle: true, titleBlock: block.titleBlock || { ...makeReportBlock('text', { text: reportTitleAutoLabel(block, parentCollection) }), align: 'center', bold: true, fontSize: 12, paddingV: 10 } }
              : { showTitle: false })}
            label="Show title"
          />
          {block.showTitle === true && titleRepeatable(block.type) && (
            <EditorCheckbox checked={block.titleRepeat === true} disabled={disabled} onChange={on => onPatch({ titleRepeat: on })} label="Repeat on each page" />
          )}
        </EditorGroup>
      </ContentRow>
      {titleBlock && block.showTitle === true ? (
        <TextContentControls key="titleFormat" block={titleBlock} project={project} onPatch={p => patchTitle?.(p)} onSaveTextStyles={onSaveTextStyles} editorRef={editorRef} active={rtActive} disabled={disabled} />
      ) : null}
      {titleBlock && block.showTitle === true ? (
        <EditorSection key="titlePad" label="Padding">
          <LayoutControls block={titleBlock} project={project} readOnly={disabled} onPatch={p => patchTitle?.(p)} panel={panel} />
        </EditorSection>
      ) : null}
      {titleBlock && block.showTitle === true ? (
        <EditorSection key="titleOutline" label="Outline">
          <OutlineSection
            block={titleBlock}
            project={project}
            readOnly={disabled}
            onPatch={p => patchTitle?.(p)}
            onSaveBlockStyles={onSaveBlockStyles}
          />
        </EditorSection>
      ) : null}
    </>
  ) : null;

  if (block.type === 'text') {
    // The block edits INLINE on the canvas (roadmap 191) — the chrome's
    // Content section is the shared Format + Style body bound to that editor.
    push(null,
      <TextContentControls key="content" block={block} project={project} onPatch={onPatch} onSaveTextStyles={onSaveTextStyles} editorRef={editorRef} active={rtActive} disabled={disabled} />,
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
        <ContentRow key="field" label="Field">
          <FieldPicker
            value={block.field || ''}
            fields={contextFields}
            onChange={f => onPatch({ field: f })}
            disabled={disabled}
            placeholder="Select attribute…"
            scope={fieldScopeFor(parentCollection)}
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
        <ContentRow key="itemPrefix" label="Prefix">
          <input className={TB_INPUT + ' ' + pw('w-20')} disabled={disabled} value={block.itemPrefix || ''} onChange={e => onPatch({ itemPrefix: e.target.value })} placeholder="e.g. —" />
        </ContentRow>,
        <ContentRow key="itemSuffix" label="Suffix">
          <input className={TB_INPUT + ' ' + pw('w-20')} disabled={disabled} value={block.itemSuffix || ''} onChange={e => onPatch({ itemSuffix: e.target.value })} placeholder="e.g. —" />
        </ContentRow>,
        <ContentRow key="itemSep" label="Sep">
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
      <EditorSection key="headerBorders" label="Header & borders">
        <InspectorRow>
          <InspectorGroup>
            <EditorCheckbox checked={block.showHeader !== false} disabled={disabled} onChange={on => onPatch({ showHeader: on })} label="Header" />
            <EditorCheckbox checked={block.showBorders !== false} disabled={disabled} onChange={on => onPatch({ showBorders: on })} label="Borders" />
          </InspectorGroup>
        </InspectorRow>
      </EditorSection>,
      titleSection,
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
          <EditorSection key="headerBorders" label="Header & borders">
            <InspectorRow>
              <InspectorGroup>
                <EditorCheckbox checked={!!block.showHeader} disabled={disabled} onChange={on => onPatch({ showHeader: on })} label="Header" />
                <EditorCheckbox checked={block.showBorders !== false} disabled={disabled} onChange={on => onPatch({ showBorders: on })} label="Borders" />
              </InspectorGroup>
            </InspectorRow>
          </EditorSection>
        ) : (
          <ContentRow key="headerBorders" label="Header">
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
        ),
        hasDayList ? (
          <ContentRow key="dayFormat" label="Day">
            <DayFormatMenu value={block.dayFormat || 'dayNumDate'} disabled={disabled} onChange={v => onPatch({ dayFormat: v as DayFormatMode })} />
          </ContentRow>
        ) : null,
        titleSection,
      );
    }
    push(null,
      <ContentRow key="over" label="Over">
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
            disabledCategories={selfRepeatDisabledCategories(parentCollection, parentCategory, categoryKeys)}
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
      titleSection,
    );
    const effective = block.type === 'table' ? tableItemCollection(block, parentCollection) : (block.collection || 'scenes');
    const skipEmpty = block.collection ? SKIP_EMPTY_TEST[block.collection] : undefined;
    if (block.collection) {
      push('Filters',
        skipEmpty ? (
          <ContentRow key="skipEmpty" label="Empty">
            <EditorCheckbox checked={block.skipEmptyCategories !== false} disabled={disabled} onChange={on => onPatch({ skipEmptyCategories: on })} label={block.collection ? (SKIP_EMPTY_LABEL[block.collection] || 'Skip empty items') : 'Skip empty items'} />
          </ContentRow>
        ) : null,
        block.collection === 'categories' ? (
          <EditorSection key="exclude" label="Exclude categories">
            <InspectorRow>
              <ExcludeCategoriesMenu
                excluded={block.excludedCategories || []}
                categoryKeys={categoryKeys}
                categoryLabels={categoryLabels}
                disabled={disabled}
                onChange={list => onPatch({ excludedCategories: list })}
              />
            </InspectorRow>
          </EditorSection>
        ) : null,
        <ContentRow key="itemFilter" label="Filter">
          <ItemFilterControl block={block} project={project} fields={fieldsForScope(allFields, tableFieldScope(block, parentCollection), block.category)} disabled={disabled} onPatch={onPatch} />
        </ContentRow>,
      );
    }
    push('Behavior',
      <ContentRow key="counter" label="Start">
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
      <ContentRow key="cols" label="Cols">
        <InspectorAction
          onClick={() => {
            const n = cols.length || 1;
            onPatch({ cols: [...cols, { id: `col${Date.now().toString(36)}`, width: 100 / (n + 1), blocks: [] }].map(c => ({ ...c, width: 100 / (n + 1) })) });
          }}
          disabled={disabled}
          title="Add column"
          className={TB_BTN}
        >
          <Plus className="w-3 h-3" /> Add column
        </InspectorAction>
      </ContentRow>,
    );
  }

  if (block.type === 'ribbon') {
    push(null,
      <ContentRow key="ribbon" label="Design">
        <RibbonDesignMenu block={block} project={project} disabled={disabled} onPatch={onPatch} />
      </ContentRow>,
      <ContentRow key="show" label="Show">
        <RibbonShowToggles block={block} disabled={disabled} onPatch={onPatch} />
      </ContentRow>,
    );
  }

  if (block.type === 'callTimes') {
    push(null,
      <EditorSection key="category" label="Category">
        <InspectorRow>
          <GridCategoryMenu
            value={block.category}
            categories={stagedCategoryKeys(project)}
            categoryLabels={categoryLabels}
            disabled={disabled}
            onChange={v => onPatch({ category: v })}
          />
        </InspectorRow>
      </EditorSection>,
      <GapRow key="gap" label="Gap" ariaLabel="Table gap" value={block.gap ?? 8} disabled={disabled} onPatch={onPatch} />,
      titleSection,
    );
  } else if (block.type === 'crewTable') {
    push(null,
      <ContentRow key="repeatHeader" label="Header">
        <EditorGroup className={panel ? 'w-full' : undefined}>
          <EditorCheckbox
            checked={block.repeatHeader !== false}
            disabled={disabled}
            onChange={on => onPatch({ repeatHeader: on })}
            label="Repeat on each page"
          />
        </EditorGroup>
      </ContentRow>,
      <ContentRow key="reportTo" label="Cols">
        <EditorGroup className={panel ? 'w-full' : undefined}>
          <EditorCheckbox
            checked={block.showReportTo === true}
            disabled={disabled}
            onChange={on => onPatch({ showReportTo: on || undefined })}
            label="Show Report To"
          />
        </EditorGroup>
      </ContentRow>,
      titleSection,
    );
  } else if (block.type === 'precalls') {
    // "All" mode can be narrowed to a picked set — the block prints only the
    // ticked departments (undefined = every department on the day).
    const deptList = projectDepartments(project);
    const picked = block.precallsDepts;
    push(null,
      <ContentRow key="depts" label="Depts">
        <SegControl
          value={block.precallsAll ? 'all' : 'precalls'}
          options={[
            { v: 'precalls', l: 'With precalls' },
            { v: 'all', l: 'All' },
          ]}
          onChange={v => onPatch({ precallsAll: v === 'all' })}
          disabled={disabled}
        />
      </ContentRow>,
      ...(block.precallsAll && deptList.length > 0 ? [
        <ContentRow key="deptsPick" label="Include" tall>
          <Checklist
            theme="dark"
            className={panel ? 'w-full' : 'w-64'}
            items={deptList.map(d => ({ id: d, label: d }))}
            selected={picked ?? deptList}
            disabled={disabled}
            maxHeight={160}
            allSelected={!picked}
            onToggleAll={() => onPatch({ precallsDepts: picked ? undefined : [] })}
            onToggle={id => {
              const cur = new Set(picked ?? deptList);
              const key = String(id);
              if (cur.has(key)) cur.delete(key); else cur.add(key);
              const next = deptList.filter(d => cur.has(d));
              onPatch({ precallsDepts: next.length === deptList.length ? undefined : next });
            }}
          />
        </ContentRow>,
      ] : []),
      <ContentRow key="layout" label="Layout">
        <SegControl
          value={block.precallsLayout ?? 'horizontal'}
          options={[
            { v: 'horizontal', l: 'Horizontal' },
            { v: 'vertical', l: 'Vertical' },
          ]}
          onChange={v => onPatch({ precallsLayout: v as 'vertical' | 'horizontal' })}
          disabled={disabled}
        />
      </ContentRow>,
      titleSection,
    );
  } else if (block.type === 'budgetTable') {
    push(null,
      <BudgetBlockControls key="budget" block={block} project={project} readOnly={disabled} onPatch={onPatch} panel={panel} title={titleSection} />,
    );
  }

  if (block.type === 'relative') {
    const offset = block.relativeOffset ?? 1;
    const count = Math.max(1, block.relativeCount ?? 1);
    push(null,
      <ContentRow key="offset" label="Offset">
        <div className="flex items-center gap-1">
          <InspectorAction onClick={() => onPatch({ relativeOffset: offset - 1 })} disabled={disabled} title="Previous item" className={TB_BTN}><Minus className="w-3 h-3" /></InspectorAction>
          <InspectorNumber label="Offset" value={offset} min={-20} max={20} fallback={1} onCommit={v => onPatch({ relativeOffset: v })} disabled={disabled} />
          <InspectorAction onClick={() => onPatch({ relativeOffset: offset + 1 })} disabled={disabled} title="Next item" className={TB_BTN}><Plus className="w-3 h-3" /></InspectorAction>
        </div>
      </ContentRow>,
      <ContentRow key="count" label="Count">
        <div className="flex items-center gap-1">
          <InspectorAction onClick={() => onPatch({ relativeCount: Math.max(1, count - 1) })} disabled={disabled} title="Fewer" className={TB_BTN}><Minus className="w-3 h-3" /></InspectorAction>
          <InspectorNumber label="Count" value={count} min={1} max={20} fallback={1} onCommit={v => onPatch({ relativeCount: Math.max(1, v) })} disabled={disabled} />
          <InspectorAction onClick={() => onPatch({ relativeCount: count + 1 })} disabled={disabled} title="More" className={TB_BTN}><Plus className="w-3 h-3" /></InspectorAction>
        </div>
      </ContentRow>,
      relativeTarget ? (
        <ContentRow key="target" label="Target">
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
      <ContentRow key="height" label="Height">
        <InspectorNumber label="Spacer height" unit="px" value={block.height} min={4} max={200} fallback={16} onCommit={v => onPatch({ height: v })} disabled={disabled} />
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
        <ContentRow key="thickness" label="Width">
          <InspectorNumber label="Line thickness" unit="px" value={block.spacerThickness} min={1} max={8} fallback={1} onCommit={v => onPatch({ spacerThickness: v })} disabled={disabled} />
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
        <div className="flex items-center gap-1">
          <label
            htmlFor={fileId}
            className={`${TB_BTN} ${disabled ? 'disabled:opacity-30 pointer-events-none' : 'cursor-pointer'}`}
          >
            {block.imageDataUrl ? 'Replace image…' : 'Attach image…'}
          </label>
          {block.imageDataUrl && (
            <InspectorAction onClick={() => onPatch({ imageDataUrl: undefined, imageWidth: undefined, imageHeight: undefined })} disabled={disabled} title="Remove image" className={`${TB_BTN_ICON} ${TB_DANGER} shrink-0`}>
              <Trash2 className="w-3 h-3" />
            </InspectorAction>
          )}
        </div>
      </ContentRow>,
      titleSection,
    );
    if (block.imageDataUrl) {
      push('Size',
        <ContentRow key="size" full>
          <div className="flex items-center gap-2 flex-nowrap min-w-0">
            <AnchorGrid
              columns={IMAGE_ALIGNS}
              rows={IMAGE_ANCHOR_ROWS}
              column={block.imageAlign ?? 'left'}
              row={block.imageAnchorY ?? 'center'}
              onChange={({ column, row }) => onPatch({ imageAlign: column, imageAnchorY: row })}
              label={(column, row) => `Align ${column}, anchor ${row}`}
              ariaLabel="Image anchor"
              title="Anchor — columns align the image, rows position its content"
              disabled={disabled}
            />
            <InspectorSubGroup>
              <span className="text-[9px] text-[color:var(--ui-text-faint)]">W</span>
              <InspectorNumber
                label="Image width"
                unit="% of the content width"
                value={Math.min(100, block.imageWidth ?? 100)}
                min={5}
                max={100}
                step={1}
                fallback={100}
                onCommit={v => onPatch({ imageWidth: v >= 100 ? undefined : Math.max(5, Math.min(100, v)) })}
                disabled={disabled}
              />
            </InspectorSubGroup>
            <InspectorSubGroup>
              <span className="text-[9px] text-[color:var(--ui-text-faint)]">H</span>
              <InspectorNumber
                label="Image height"
                unit="px — blank keeps the natural aspect ratio"
                value={block.imageHeight}
                min={0}
                max={3000}
                step={10}
                fallback={0}
                placeholder="Auto"
                onCommit={v => onPatch({ imageHeight: v > 0 ? v : undefined })}
                disabled={disabled}
              />
              {block.imageHeight != null && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPatch({ imageHeight: undefined })}
                  title="Reset height to Auto (natural aspect ratio)"
                  className="h-7 shrink-0 rounded px-1.5 text-[9px] font-medium text-[color:var(--ui-text-faint)] transition-colors hover:bg-[var(--ui-item-hover-bg)] hover:text-[color:var(--ui-text-strong)] disabled:opacity-40"
                >
                  Auto
                </button>
              )}
            </InspectorSubGroup>
          </div>
        </ContentRow>,
        <ContentRow key="fit" label="Fit">
          <SegControl
            value={block.imageFit ?? 'contain'}
            options={[
              { v: 'contain', l: 'Contain' },
              { v: 'cover', l: 'Cover' },
              { v: 'fill', l: 'Fill' },
            ]}
            onChange={v => {
              const fit = v as 'contain' | 'cover' | 'fill';
              if ((fit === 'cover' || fit === 'fill') && !block.imageHeight) {
                // Cover/Fill fill a BOX — with Height Auto there is none. Freeze
                // the current rendered height once so the mode takes effect, then
                // the user can drag the height/handle.
                const img = typeof document !== 'undefined'
                  ? document.querySelector<HTMLImageElement>(`[data-block-id="${block.id}"] [data-image-block] img`)
                  : null;
                onPatch({ imageFit: fit, imageHeight: Math.max(20, Math.round(img?.offsetHeight || 240)) });
                return;
              }
              onPatch({ imageFit: fit });
            }}
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
      <EditorSection key="loc" label="Location">
        <InspectorRow>
          {inherited ? (
            <span className="text-[10px] text-[color:var(--ui-text-muted)]">Comes from the day's location</span>
          ) : hasPin ? (
            <>
              <button
                onClick={() => setLocationOpen(true)}
                disabled={disabled}
                title="Change location"
                className="max-w-44 truncate text-[10px] text-[color:var(--ui-text-muted)] cursor-pointer text-left hover:text-[color:var(--ui-text-strong)] transition-colors"
              >
                {block.mapPlace || `${block.mapLat!.toFixed(4)}, ${block.mapLng!.toFixed(4)}`}
              </button>
              <InspectorAction onClick={() => setLocationOpen(true)} disabled={disabled} title="Change location" className={TB_BTN}>
                <MapPin className="w-3 h-3" /> Change
              </InspectorAction>
              <InspectorAction
                onClick={() => onPatch({ mapLat: undefined, mapLng: undefined, mapPlace: undefined, mapAddress: undefined, mapCity: undefined, mapPostcode: undefined, mapCountry: undefined })}
                disabled={disabled}
                title="Clear location"
                className={`${TB_BTN_ICON} ${TB_DANGER}`}
              >
                <Trash2 className="w-3 h-3" />
              </InspectorAction>
            </>
          ) : (
            <InspectorAction onClick={() => setLocationOpen(true)} disabled={disabled} title="Set location" className={TB_BTN}>
              <MapPin className="w-3 h-3" /> Set location…
            </InspectorAction>
          )}
        </InspectorRow>
      </EditorSection>,
      <ContentRow key="height" label="Height">
        <InspectorNumber label="Map height" unit="px" value={block.mapHeight} min={80} max={1200} fallback={240} onCommit={v => onPatch({ mapHeight: v })} disabled={disabled} />
      </ContentRow>,
      titleSection,
    );
    push('Map',
      <ContentRow key="inherit" label="Day">
        <EditorCheckbox checked={inherited} disabled={disabled} onChange={on => onPatch({ mapInheritLocation: on })} label="Use the day's location" />
      </ContentRow>,
      inherited && availableLocations && availableLocations.length > 1 ? (
        <LocationChoiceRow key="showLoc" block={block} availableLocations={availableLocations} disabled={disabled} onPatch={onPatch} />
      ) : null,
      <ContentRow key="open" label="Open">
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
    <div className={panel ? 'flex flex-col gap-4 min-w-0 w-full' : 'flex flex-col gap-2 min-w-max'}>
      {sections.map((s, i) => (
        s.title ? (
          <EditorSection key={s.title} label={s.title}>
            {s.rows}
          </EditorSection>
        ) : (
          <div key={`flat${i}`} className="flex flex-col gap-2 min-w-0">{s.rows}</div>
        )
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
            block.mapLat != null || block.mapLng != null || block.mapPlace || block.mapAddress
              ? {
                  lat: block.mapLat ?? undefined,
                  lng: block.mapLng ?? undefined,
                  place: block.mapPlace,
                  address: block.mapAddress,
                  city: block.mapCity,
                  postcode: block.mapPostcode,
                  country: block.mapCountry,
                }
              : null
          }
          editing={block.mapLat != null || block.mapLng != null || !!block.mapPlace || !!block.mapAddress}
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
        <InspectorNumber label="Font size" unit="pt" value={block.fontSize} min={6} max={48} fallback={10} onCommit={v => onPatch({ fontSize: v })} disabled={disabled} />
      </EditorGroup>
      {/* block-level B/I only for field blocks — link blocks keep their fixed
          link look; text blocks use the shared body's run formatting */}
      {block.type === 'field' && (
        <>
          <div className={TB_DIVIDER} />
          <EditorGroup>
            <InspectorToggle label="Bold" pressed={!!block.bold} onChange={on => onPatch({ bold: on })} icon={<span className="text-[11px] font-bold">B</span>} disabled={disabled} />
            <InspectorToggle label="Italic" pressed={!!block.italic} onChange={on => onPatch({ italic: on })} icon={<span className="text-[11px] italic">I</span>} disabled={disabled} />
          </EditorGroup>
        </>
      )}
      <div className={TB_DIVIDER} />
      <EditorGroup>
        {(['left', 'center', 'right'] as const).map(a => {
          const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
          return (
            <InspectorToggle
              key={a}
              label={`Align ${a}`}
              pressed={(block.align ?? 'left') === a}
              onChange={() => onPatch({ align: a })}
              icon={<Icon className="w-3 h-3" />}
              disabled={disabled}
            />
          );
        })}
      </EditorGroup>
    </>
  );
};

// ---- outline & style presets (fill + border + block styles) --------------------
// Shared by text, field and title blocks. The link block keeps its fixed link
// blue. Text colour auto-switches white on dark fills.
//
// Layout grammar (docs/DESIGN-LANGUAGE.md §Inspector & control rows):
// - panel (docked rail): label column + control column, one concept per row
// - bar (floating chrome): groups in one wrapping row, separated by rules
// - colour is a swatch only (no hex entry); units live in tooltips/aria

interface OutlineSectionProps {
  block: ReportBlock;
  project: Project;
  readOnly?: boolean;
  onPatch: (patch: Partial<ReportBlock>) => void;
  onSaveBlockStyles?: (styles: ReportBlockStyle[]) => void;
}

const BlockStyleMenu: React.FC<OutlineSectionProps & { fullWidth?: boolean }> = ({
  block, project, readOnly, onPatch, onSaveBlockStyles, fullWidth,
}) => {
  const dialog = useDialog();
  const [open, setOpen] = useState(false);
  const disabled = !!readOnly;
  const userStyles = project.reportBlockStyles ?? [];
  const allStyles = [...userStyles, ...BUILTIN_BLOCK_STYLES];
  const matched = allStyles.find(s => blockStyleMatches(block, s));
  const matchedUser = userStyles.find(s => s.id === matched?.id);
  const swatch = (style: ReportBlockStyle) => (
    <span
      className="block h-3 w-3 rounded-[3px] border border-black/10"
      style={{ background: style.background || 'transparent' }}
    />
  );
  const applyStyle = (style: ReportBlockStyle) => {
    setOpen(false);
    onPatch(blockStylePatch(style));
  };
  const saveStyle = async () => {
    setOpen(false);
    if (!onSaveBlockStyles) return;
    const name = await dialog.prompt({ title: 'Save block style', placeholder: 'Style name' });
    if (!name?.trim()) return;
    onSaveBlockStyles([...userStyles, blockStyleFromBlock(name.trim(), block)]);
  };
  const updateStyle = () => {
    if (!matchedUser || !onSaveBlockStyles) return;
    const updated = { ...blockStyleFromBlock(matchedUser.name, block), id: matchedUser.id };
    onSaveBlockStyles(userStyles.map(s => (s.id === matchedUser.id ? updated : s)));
    setOpen(false);
  };
  const deleteStyle = async () => {
    if (!matchedUser || !onSaveBlockStyles) return;
    setOpen(false);
    const ok = await dialog.confirm({
      title: `Delete “${matchedUser.name}”?`,
      message: 'Blocks already using this style keep their look.',
      danger: true,
    });
    if (ok) onSaveBlockStyles(userStyles.filter(s => s.id !== matchedUser.id));
  };
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      width="w-52"
      trigger={
        <button
          type="button"
          disabled={disabled}
          title="Block style presets"
          className={`inline-flex h-7 items-center gap-1.5 rounded border border-[color:var(--ui-card-border)] bg-[var(--ui-input-bg)] px-2 text-[10px] font-medium text-[color:var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-item-hover-bg)] hover:text-[color:var(--ui-text-strong)] disabled:opacity-40 ${fullWidth ? 'w-full justify-between' : 'max-w-[150px]'}`}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Palette className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{matched?.name ?? 'Preset'}</span>
          </span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      }
    >
      {userStyles.map(style => (
        <DropdownItem key={style.id} icon={swatch(style)} onClick={() => applyStyle(style)}>
          {style.name}
        </DropdownItem>
      ))}
      {userStyles.length > 0 && <DropdownDivider />}
      {BUILTIN_BLOCK_STYLES.map(style => (
        <DropdownItem key={style.id} icon={swatch(style)} onClick={() => applyStyle(style)}>
          {style.name}
        </DropdownItem>
      ))}
      <DropdownDivider />
      <DropdownItem onClick={() => void saveStyle()}>Save current as style…</DropdownItem>
      {matchedUser && <DropdownItem onClick={() => updateStyle()}>Update “{matchedUser.name}”</DropdownItem>}
      {matchedUser && <DropdownItem onClick={() => void deleteStyle()}>Delete “{matchedUser.name}”</DropdownItem>}
    </DropdownMenu>
  );
};

export const OutlineSection: React.FC<OutlineSectionProps> = (props) => {
  const { block, onPatch, readOnly } = props;
  const surface = useInspectorSurface();
  const disabled = !!readOnly;
  const styleSurface = blockSurfaceOf(block);
  const fill = (
    <InspectorColor
      label="Background colour"
      value={block.background ?? '#FFFFFF'}
      onChange={v => onPatch({ background: v })}
      disabled={disabled}
      onClear={block.background ? () => onPatch({ background: undefined }) : undefined}
      clearTitle="Remove background"
    />
  );
  const border = (
    <InspectorGroup>
      <InspectorSubGroup>
        <InspectorToggle
          label={block.border ? 'Border on — click to remove' : 'Border off — click to add'}
          pressed={!!block.border}
          onChange={on => onPatch({ border: on })}
          icon={<span className="h-3 w-3 border border-current" />}
          disabled={disabled}
        />
        <InspectorColor
          label="Border colour"
          value={styleSurface.borderColor}
          onChange={v => onPatch({ borderColor: v, border: true })}
          disabled={disabled}
        />
      </InspectorSubGroup>
      <InspectorSubGroup>
        <span className="text-[10px] text-[color:var(--ui-text-muted)]">W</span>
        <InspectorNumber label="Border width" unit="px" value={block.borderWidth ?? 1} min={0} max={12} fallback={1} onCommit={v => onPatch({ borderWidth: v })} disabled={disabled} readOnly={readOnly} />
        <span className="ml-1 text-[10px] text-[color:var(--ui-text-muted)]">R</span>
        <InspectorNumber label="Corner radius" unit="px" value={block.borderRadius ?? 0} min={0} max={40} fallback={0} onCommit={v => onPatch({ borderRadius: v })} disabled={disabled} readOnly={readOnly} />
      </InspectorSubGroup>
    </InspectorGroup>
  );
  if (surface === 'panel') {
    return (
      <>
        <InspectorRow label="Preset"><BlockStyleMenu {...props} fullWidth /></InspectorRow>
        <InspectorRow label="Fill">{fill}</InspectorRow>
        <InspectorRow label="Border">{border}</InspectorRow>
      </>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <BlockStyleMenu {...props} />
      <span className="h-4 w-px shrink-0 bg-[var(--ui-border)]" />
      <span className="text-[10px] text-[color:var(--ui-text-faint)]">Fill</span>
      {fill}
      <span className="h-4 w-px shrink-0 bg-[var(--ui-border)]" />
      <span className="text-[10px] text-[color:var(--ui-text-faint)]">Border</span>
      {border}
    </div>
  );
};

// ---- layout controls (padding — text/field only) -------------------------------

export const LayoutControls: React.FC<BlockCtx> = ({ block, readOnly, onPatch }) => {
  const surface = useInspectorSurface();
  const v = surface === 'bar' ? 'Pad V' : 'V';
  const h = surface === 'bar' ? 'Pad H' : 'H';
  return (
    <InspectorRow>
      <InspectorGroup className="gap-2">
        <InspectorSubGroup>
          <span className="shrink-0 text-[10px] text-[color:var(--ui-text-muted)]" title="Vertical padding">{v}</span>
          <InspectorNumber label="Vertical padding" unit="px" value={block.paddingV} min={0} max={24} fallback={2} onCommit={v => onPatch({ paddingV: v })} readOnly={readOnly} />
        </InspectorSubGroup>
        <InspectorSubGroup>
          <span className="shrink-0 text-[10px] text-[color:var(--ui-text-muted)]" title="Horizontal padding">{h}</span>
          <InspectorNumber label="Horizontal padding" unit="px" value={block.paddingH} min={0} max={24} fallback={4} onCommit={v => onPatch({ paddingH: v })} readOnly={readOnly} />
        </InspectorSubGroup>
      </InspectorGroup>
    </InspectorRow>
  );
};

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
    <EditorSection label={`Item formatting — ${fieldLabel}`}>
      <ContentRow label="Prefix">
        <input aria-label="Item prefix" readOnly={readOnly} className={TB_INPUT + ' ' + editorFieldCls(panel, 'w-20')} value={opts.itemPrefix ?? ''} onChange={e => setOpt('itemPrefix', e.target.value)} />
      </ContentRow>
      <ContentRow label="Suffix">
        <input aria-label="Item suffix" readOnly={readOnly} className={TB_INPUT + ' ' + editorFieldCls(panel, 'w-20')} value={opts.itemSuffix ?? ''} onChange={e => setOpt('itemSuffix', e.target.value)} />
      </ContentRow>
      <ContentRow label="Sep">
        <input aria-label="Item separator" readOnly={readOnly} className={TB_INPUT + ' ' + editorFieldCls(panel, 'w-20')} value={opts.itemSeparator ?? ''} onChange={e => setOpt('itemSeparator', e.target.value)} />
      </ContentRow>
    </EditorSection>
  );
};

// ---- day format menu ------------------------------------------------------------

export const DayFormatMenu: React.FC<{ value: string; disabled: boolean; onChange: (v: string) => void }> = ({ value, disabled, onChange }) => (
  <InspectorMenu
    label="Day format"
    value={value}
    options={DAY_FORMAT_OPTIONS.map(o => ({ value: o.key, label: o.label }))}
    onChange={onChange}
    disabled={disabled}
    menuWidth="w-40"
    width="w-36"
  />
);
