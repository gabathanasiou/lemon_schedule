import React, { useMemo, useState, useRef, useLayoutEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Scene, ScheduleRow, RibbonRow, RibbonCell, RuleViolation, SceneColorPalette, CustomCategoryDef, ProjectElement } from '../types';
import { ComputedRow, formatElapsedCaption } from '../lib/daybreakUtils';
import { formatDuration, parseDuration, parsePageCount, formatPageCount } from '../lib/utils';
import { getFieldValue, getFieldValueFromSample, FIELD_MAP, getRibbonCellBaseStyle, formatCellText, getNoteBreakPad, sceneStyle, getSelectedStripColors, getNoteBannerColors, getDayHeaderColors, getDayFooterColors, getFallbackStripColors, getCellBorderProps, computeMergeGroups, getIntExtOptions, getDayNightOptions } from '../lib/ribbonUtils';
import { RibbonCellText } from './RibbonCellText';
import { CellBorders } from '../lib/persist';
import { getFieldItems, isMultiValue } from '../lib/categories';
import { usePortalTarget } from '../lib/popoutTarget';
import { CellInput } from './CellInput';
import { Flag } from 'lucide-react';
import { useAddMode, useTouchMode } from '../lib/useMarquee';
import { EntityDropdown } from './EntityDropdown';
import DurationKeypad from './DurationKeypad';
import { SelectDropdown } from './SelectDropdown';
import { createPortal } from 'react-dom';
import { ViolationContent } from './ViolationTooltip';
import { ViolationModal } from './ViolationModal';
import SortableRowNote from './ribbon/SortableRowNote';
import SortableRowBreak from './ribbon/SortableRowBreak';
import SortableRowDaybreak from './ribbon/SortableRowDaybreak';
import SortableRowScene from './ribbon/SortableRowScene';
import { RowRenderCtx } from './ribbon/rowRenderTypes';

const ENTITY_KEYS = new Set([
  'cast', 'set', 'backgroundActors', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup',
  'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept',
]);

const sortableRowPropsEqual = (a: any, b: any) => {
  if (a.row !== b.row) return false;
  if (a.scene !== b.scene) return false;
  if (a.isOverlay !== b.isOverlay || a.isSelected !== b.isSelected || a.isFaded !== b.isFaded) return false;
  if (a.isCompact !== b.isCompact || a.textEditingEnabled !== b.textEditingEnabled) return false;
  if (a.focusedRowId !== b.focusedRowId) return false;
  if (a.sceneViolations !== b.sceneViolations || a.sectionViolations !== b.sectionViolations || a.nextSectionViolations !== b.nextSectionViolations) return false;
  if (a.ribbon !== b.ribbon || a.colWidths !== b.colWidths) return false;
  if (a.cellPaddingV !== b.cellPaddingV || a.cellPaddingH !== b.cellPaddingH) return false;
  if (a.edgePadding !== b.edgePadding || a.cellBorders !== b.cellBorders) return false;
  if (a.nextDaybreakCallTime !== b.nextDaybreakCallTime) return false;
  if (a.nextDateStr !== b.nextDateStr) return false;
  if (a.dispatch !== b.dispatch) return false;
  if (a.activeVersionId !== b.activeVersionId) return false;
  if (a.palette !== b.palette || a.castMembers !== b.castMembers) return false;
  if (a.breakdownElements !== b.breakdownElements || a.customCategories !== b.customCategories) return false;
  if (a.hiddenCategories !== b.hiddenCategories) return false;
  return true;
};

const SortableRowContent: React.FC<{ 
  row: ComputedRow,
  scenes: Scene[],
  scene?: Scene | null,
  isSelected?: boolean,
  isFaded?: boolean,
  isCompact?: boolean,
  textEditingEnabled?: boolean,
  sceneViolations?: RuleViolation[],
  sectionViolations?: RuleViolation[],
  nextSectionViolations?: RuleViolation[],
  focusedRowId?: string | null,
  onRowNavigate?: (rowId: string) => void,
  ribbon?: RibbonRow[],
  colWidths?: number[],
  cellPaddingV?: number,
  cellPaddingH?: number,
  edgePadding?: number,
  cellBorders?: CellBorders,
  nextDaybreakCallTime?: string,
  onUpdateNextDaybreak?: (val: string) => void,
  nextDateStr?: string,
  dispatch: (a: any) => void,
  activeVersionId?: string,
  palette?: SceneColorPalette,
  castMembers?: ProjectElement[],
  breakdownElements?: Record<string, ProjectElement[]>,
  customCategories?: CustomCategoryDef[],
  hiddenCategories?: string[],
}> = React.memo(({ row, scenes, scene: sceneProp, isSelected, isFaded, isCompact, textEditingEnabled, sceneViolations, nextSectionViolations, focusedRowId, onRowNavigate, ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding, cellBorders, nextDaybreakCallTime, onUpdateNextDaybreak, nextDateStr, dispatch, activeVersionId, palette, castMembers, breakdownElements, customCategories, hiddenCategories }) => {
  const portalTarget = usePortalTarget();

  const isTouchMode = useTouchMode();

  const scene = sceneProp !== undefined ? sceneProp : (row.type === 'SCENE' ? scenes.find(s => s.id === row.sceneId) ?? null : null);

  const sceneData = useMemo(() => {
    if (!scene) return null;
    return {
      ...scene,
      computedCallTime: row.computedCallTime,
      estimatedDuration: row.estimatedDuration,
      sheetNumber: String(scenes.findIndex(s => s.id === scene.id) + 1),
    };
  }, [scene, row.computedCallTime, row.estimatedDuration, scenes]);

  const updateRow = (updates: Partial<ScheduleRow>) => {
    if (!activeVersionId) return;
    dispatch({ type: 'UPDATE_ROW', payload: { versionId: activeVersionId, rowId: row.id, updates } });
  };

  const updateScene = (updates: Partial<Scene>) => {
    if (!scene) return;
    const processed = { ...updates } as Record<string, any>;
    let setCapitalized = false;
    let oldSet = '';
    if (typeof processed.set === 'string') {
      oldSet = scene.set;
      processed.set = processed.set.toUpperCase();
      if (processed.set !== oldSet) setCapitalized = true;
    }
    for (const [key, val] of Object.entries(processed)) {
      if (key === 'id') continue;
      if (typeof val === 'string' && val.trim() && (ENTITY_KEYS.has(key) || key.startsWith('_cat_'))) {
        const existing = breakdownElements?.[key] || [];
        const existingNames = new Set(existing.map(e => (key === 'cast' ? e.id : (e.name || e.id)).toUpperCase()));
        const items = getFieldItems(key, val);
        for (const item of items) {
          if (!existingNames.has(item.toUpperCase())) {
            dispatch({ type: 'ADD_ELEMENT', payload: { category: key, element: key === 'cast' ? { id: item, name: '' } : { id: item, name: item } } });
          }
        }
      }
    }
    dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, ...processed } });
    if (setCapitalized && oldSet && oldSet.toUpperCase() === processed.set) {
      dispatch({ type: 'UPDATE_ELEMENT', payload: { category: 'set', id: oldSet, updates: { id: processed.set, name: processed.set } } });
    }
  };

  const updateEntityField = (field: string, val: string) => {
    if (!scene) return;
    updateScene({ [field]: val });
  };

  const inputClass = "text-inherit placeholder:text-inherit placeholder:opacity-50 bg-transparent w-full outline-none";

  const noteBreakPadPx = `${getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1)}px ${cellPaddingH ?? 6}px`;

  const hasViolations = sceneViolations && sceneViolations.length > 0;
  const [showViolationTip, setShowViolationTip] = useState(false);
  const [showViolationModal, setShowViolationModal] = useState(false);
  const violationRef = useRef<HTMLSpanElement>(null);
  const violationTipPos = useRef({ x: 0, y: 0 });
  const sceneTipRef = useRef<HTMLDivElement>(null);
  const [sceneTipOffset, setSceneTipOffset] = useState(0);

  useLayoutEffect(() => {
    if (showViolationTip && sceneTipRef.current) {
      const r = sceneTipRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      let offset = 0;
      if (r.left < 8) offset = 8 - r.left;
      else if (r.right > vw - 8) offset = (vw - 8) - r.right;
      setSceneTipOffset(offset);
    } else {
      setSceneTipOffset(0);
    }
  }, [showViolationTip]);

  const hasNextViolations = nextSectionViolations && nextSectionViolations.length > 0;
  const [showNextViolationTip, setShowNextViolationTip] = useState(false);
  const [showNextViolationModal, setShowNextViolationModal] = useState(false);
  const nextViolationRef = useRef<HTMLSpanElement>(null);
  const nextViolationTipPos = useRef({ x: 0, y: 0 });
  const nextTipRef = useRef<HTMLDivElement>(null);
  const [nextTipOffset, setNextTipOffset] = useState(0);

  useLayoutEffect(() => {
    if (showNextViolationTip && nextTipRef.current) {
      const r = nextTipRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      let offset = 0;
      if (r.left < 8) offset = 8 - r.left;
      else if (r.right > vw - 8) offset = (vw - 8) - r.right;
      setNextTipOffset(offset);
    } else {
      setNextTipOffset(0);
    }
  }, [showNextViolationTip]);
  const violationBadge = hasViolations ? (
    <>
      <span
        ref={violationRef}
        className="absolute text-red-500 z-10 cursor-help block"
        style={{ top: 1, left: 2, lineHeight: 0 }}
        onMouseEnter={() => {
          if (violationRef.current) {
            const r = violationRef.current.getBoundingClientRect();
            violationTipPos.current = { x: r.left + r.width / 2, y: r.top };
          }
          setShowViolationTip(true);
        }}
        onMouseLeave={() => setShowViolationTip(false)}
        onClick={() => setShowViolationModal(true)}
      >
        <Flag className="w-2.5 h-2.5 fill-red-500 text-red-500" />
      </span>
      {showViolationTip && createPortal(
        <div ref={sceneTipRef} className="fixed px-2.5 py-1.5 bg-zinc-900 text-white text-[10px] rounded shadow-xl leading-relaxed max-w-lg border border-white/20" style={{ left: violationTipPos.current.x, top: violationTipPos.current.y - 20, transform: `translate(calc(-50% + ${sceneTipOffset}px), -100%)`, zIndex: 99999 }}>
          <ViolationContent compact violations={sceneViolations} castMembers={castMembers ?? []} />
          <div className="absolute top-full -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-900" style={{ left: `calc(50% - ${sceneTipOffset}px)` }} />
        </div>,
        portalTarget ?? document.body
      )}
      <ViolationModal
        open={showViolationModal}
        onClose={() => setShowViolationModal(false)}
        title={scene ? `Scene ${scene.sceneNumber} Violations` : 'Strip Violations'}
        subtitle={scene?.set || ''}
        violations={sceneViolations}
        castMembers={castMembers ?? []}
      />
    </>
  ) : null;

  const nextViolationBadge = hasNextViolations ? (
    <>
      <span
        ref={nextViolationRef}
        style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 2 }}
        onMouseEnter={() => {
          if (nextViolationRef.current) {
            const r = nextViolationRef.current.getBoundingClientRect();
            nextViolationTipPos.current = { x: r.left + r.width / 2, y: r.top };
          }
          setShowNextViolationTip(true);
        }}
        onMouseLeave={() => setShowNextViolationTip(false)}
        onClick={() => setShowNextViolationModal(true)}
      >
        <Flag className="w-2.5 h-2.5 fill-red-500 text-red-500" />
        <span style={{ fontSize: '8pt', fontWeight: 700, color: '#ef4444' }}>{nextSectionViolations!.length}</span>
      </span>
      {showNextViolationTip && createPortal(
        <div ref={nextTipRef} className="fixed px-2.5 py-1.5 bg-zinc-900 text-white text-[10px] rounded shadow-xl leading-relaxed max-w-lg border border-white/20" style={{ left: nextViolationTipPos.current.x, top: nextViolationTipPos.current.y - 20, transform: `translate(calc(-50% + ${nextTipOffset}px), -100%)`, zIndex: 99999 }}>
          <ViolationContent compact violations={nextSectionViolations!} castMembers={castMembers ?? []} />
          <div className="absolute top-full -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-900" style={{ left: `calc(50% - ${nextTipOffset}px)` }} />
        </div>,
        portalTarget ?? document.body
      )}
      <ViolationModal
        open={showNextViolationModal}
        onClose={() => setShowNextViolationModal(false)}
        title="Section Violations"
        violations={nextSectionViolations!}
        castMembers={castMembers ?? []}
      />
    </>
  ) : null;

  const fmt = (prefix: string | undefined, val: string, suffix: string | undefined) =>
    formatCellText(prefix, val, suffix);

  const elapsedCaption = formatElapsedCaption(row);

  const alignTextClass = (cell: RibbonCell) => cell.align === 'right' ? 'text-right' : cell.align === 'left' ? 'text-left' : 'text-center';

  const nb = getNoteBannerColors(palette);
  const sel = getSelectedStripColors(palette);

  const renderCellContent = (cell: RibbonCell, ci?: number) => {
    const { field, align, prefix, suffix, wrap, overflowVisible, id: cellId } = cell;
    const a = align || 'left';
    if (!field) {
      return <td key={cellId} style={{ width: `10%`, padding: '3pt 1pt', verticalAlign: 'top', borderBottom: '1px solid #000' }} />;
    }
    const val = sceneData ? getFieldValue(field, sceneData) : getFieldValueFromSample(field);
    const displayText = `${prefix || ''}${val}${suffix || ''}`;

    if (field === 'intExt') {
      return (
        <td key={cellId} style={{ width: `10%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, textTransform: 'uppercase', borderBottom: '1px solid #000', overflow: 'hidden' }}>
          <SelectDropdown
            value={scene!.intExt}
            onChange={val => updateScene({intExt: val as any})}
            options={getIntExtOptions(palette)}
            className="text-left w-full"
            readOnly={!textEditingEnabled}
            style={{ fontSize: '8pt', lineHeight: 1.1 }}
          />
        </td>
      );
    }
    if (field === 'dayNight') {
      return (
        <td key={cellId} style={{ width: `10%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, textTransform: 'uppercase', borderBottom: '1px solid #000', overflow: 'hidden' }}>
          <SelectDropdown
            value={scene!.dayNight}
            onChange={val => updateScene({dayNight: val as any})}
            options={getDayNightOptions(palette)}
            className="text-left w-full"
            readOnly={!textEditingEnabled}
            style={{ fontSize: '8pt', lineHeight: 1.1 }}
          />
        </td>
      );
    }
    if (field === 'cast') {
      return (
        <td key={cellId} style={{ width: `10%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
          <EntityDropdown
            value={scene!.cast}
            onChange={val => updateScene({cast: val})}
            className="text-left w-full text-xs"
            readOnly={!textEditingEnabled}
            mode="multi"
            positioning="fixed"
            placeholder="Cast"
            displayMode="id"
            items={castItems}
            renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '?'}</span></>}
          />
        </td>
      );
    }
    if (field === 'pageCount') {
      return (
        <td key={cellId} style={{ width: `10%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
          {textEditingEnabled ? (
            <CellInput
              value={scene!.pageCount}
              prefix={prefix}
              suffix={suffix || 'pgs'}
              onChange={val => {
                if (val === '') { updateScene({ pageCount: '', pageCountDecimal: 0 }); } else { const decimal = parsePageCount(val); updateScene({ pageCount: formatPageCount(decimal), pageCountDecimal: decimal }); }
              }}
              className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`}
              readOnly={!textEditingEnabled}
              style={{ fontSize: '8pt', lineHeight: 1.1 }}
            />
          ) : (
            <span className={inputClass} style={{ fontSize: '8pt', lineHeight: 1.1, whiteSpace: overflowVisible ? 'nowrap' : wrap ? 'normal' : 'nowrap', overflow: overflowVisible || wrap ? 'visible' : 'hidden', textOverflow: overflowVisible || wrap ? undefined : 'ellipsis', display: 'block' }}>
              {prefix}{val}{suffix || ' pgs'}
            </span>
          )}
        </td>
      );
    }
    if (field === 'duration') {
      return (
        <td key={cellId} style={{ width: `10%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
          {isTouchMode ? (
            <DurationKeypad
              value={row.estimatedDuration || 0}
              onChange={val => updateRow({estimatedDuration: val})}
              display={row.estimatedDuration === 0 ? '↑' : formatDuration(row.estimatedDuration || 0)}
              className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`}
              autoFocus={focusedRowId === row.id}
              onOpen={() => onRowNavigate?.(row.id)}
              sceneNumber={scene?.sceneNumber}
              pageCount={scene?.pageCount}
            />
          ) : (
            <CellInput
              value={row.estimatedDuration === 0 ? '↑' : formatDuration(row.estimatedDuration || 0)}
              onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
              clearOnType
              col="duration"
              className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`}
              autoFocus={focusedRowId === row.id}
              onRowNavigate={onRowNavigate}
            />
          )}
        </td>
      );
    }
    if (field === 'sceneNumber') {
      return (
        <td key={cellId} style={{ width: `10%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden', position: 'relative' }}>
          <CellInput
            value={scene!.sceneNumber}
            prefix={prefix}
            suffix={suffix}
            onChange={val => updateScene({sceneNumber: val})}
            className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`}
            readOnly={!textEditingEnabled}
            style={{ fontSize: '8pt', lineHeight: 1.1 }}
          />
          {violationBadge}
        </td>
      );
    }
    if (field === 'text') {
      return (
        <td key={cellId} style={{ width: `10%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
          <span style={{ fontSize: '8pt', lineHeight: 1.1, whiteSpace: wrap ? 'normal' : 'nowrap' }}>{cell.textContent || ''}</span>
        </td>
      );
    }
    if (scene && ENTITY_FIELDS.has(field)) {
      const v = ((scene as any)[field] as string) || '';
      const entityItems = entityItemsMap[field] || [];
      return (
        <td key={cellId} style={{ width: `10%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
          <EntityDropdown value={v} onChange={val => updateEntityField(field, val)} items={entityItems} mode={isMultiValue(field, customCategories) ? 'multi' : 'single'} uppercase={field === 'set'} keepAlphabetical={field === 'set'} positioning="fixed" className="text-left w-full text-xs" readOnly={!textEditingEnabled} placeholder={fieldLabels[field] || field} />
        </td>
      );
    }
    // Generic text field (description, notes, props, etc.)
    return (
      <td key={cellId} style={{ width: `10%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
        <CellInput
          value={displayText}
          onChange={val => updateScene({[field]: val})}
          className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`}
          readOnly={!textEditingEnabled}
          style={{ fontSize: '8pt', lineHeight: 1.1 }}
          placeholder={fieldLabels[field] || field}
        />
      </td>
    );
  };
  const cellFlexBase = (cell: RibbonCell, span = 1) => getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, span);

  const ENTITY_FIELDS = useMemo(() => {
    const hiddenSet = new Set(hiddenCategories || []);
    const fields = new Set([
      'set', 'backgroundActors', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup', 'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept',
      ...(customCategories || []).map(c => c.key),
    ]);
    for (const h of hiddenSet) fields.delete(h);
    return fields;
  }, [customCategories, hiddenCategories]);

  const fieldLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const [key, def] of Object.entries(FIELD_MAP)) labels[key] = def.label;
    for (const c of customCategories || []) labels[c.key] = c.label;
    return labels;
  }, [customCategories]);

  const entityItemsMap = useMemo(() => {
    const map: Record<string, { id: string; name: string }[]> = {};
    for (const field of ENTITY_FIELDS) {
      const sceneValues = [...new Set(scenes.map(s => ((s as any)[field] as string) || '').filter(Boolean).flatMap(v => v.split(',').map(x => x.trim())))] as string[];
      const stored = breakdownElements?.[field] || [];
      const seen = new Set<string>();
      const items: { id: string; name: string }[] = [];
      for (const e of stored) {
        const key = (e.name || e.id).toUpperCase();
        if (key && !seen.has(key)) { items.push(e); seen.add(key); }
      }
      for (const v of sceneValues) {
        const key = v.toUpperCase();
        if (!seen.has(key)) { items.push({ id: v, name: v }); seen.add(key); }
      }
      map[field] = items;
    }
    return map;
  }, [scenes, breakdownElements]);

  const castItems = useMemo(() => {
    const sceneValues = [...new Set(scenes.map(s => s.cast || '').filter(Boolean).flatMap(v => v.split(',').map(x => x.trim())))] as string[];
    const stored = castMembers ?? [];
    const seen = new Set<string>();
    const items: { id: string; name: string }[] = [];
    for (const e of stored) {
      if (e.id && !seen.has(e.id)) { items.push(e); seen.add(e.id); }
    }
    for (const v of sceneValues) {
      if (!seen.has(v)) { items.push({ id: v, name: '' }); seen.add(v); }
    }
    return items;
  }, [scenes, castMembers]);

  const renderCellFlex = (cell: RibbonCell, isLast: boolean, isLastRow: boolean, textColor: string, col?: number, gRow?: number, vSpan?: number, hSpan?: number) => {
    const { field, align, prefix, suffix, wrap, overflowVisible, id: cellId } = cell;
    const a = align || 'left';
    const span = vSpan || 1;
    const style: React.CSSProperties = {
      ...cellFlexBase(cell, span),
      textAlign: a as any,
      ...getCellBorderProps(cellBorders, textColor, isLast, isLastRow),
    };
    if (col !== undefined && gRow !== undefined) {
      style.gridColumn = (hSpan && hSpan > 1) ? `${col + 1} / span ${hSpan}` : col + 1;
      style.gridRow = span > 1 ? `${gRow + 2} / span ${span}` : gRow + 2;
    }
    if (!field) return <div key={cellId} style={style} />;

    const val = sceneData ? getFieldValue(field, sceneData) : getFieldValueFromSample(field);
    const fieldLabel = fieldLabels[field] || field;
    const emptyStyle: React.CSSProperties = { fontStyle: 'italic', opacity: 0.5 };

    if (field === 'intExt') {
      const v = scene!.intExt || '';
      return (
        <div key={cellId} style={style}>
          {textEditingEnabled ? (
            <SelectDropdown value={v} onChange={val => updateScene({intExt: val as any})} options={getIntExtOptions(palette)} className="text-left w-full" readOnly={!textEditingEnabled} positioning="fixed" placeholder={fieldLabel} />
          ) : (
            <RibbonCellText cell={cell} span={span || 1} cellPadding={cellPaddingV} style={!v ? emptyStyle : undefined}>{v ? fmt(prefix, v, suffix) : fieldLabel}</RibbonCellText>
          )}
        </div>
      );
    }
    if (field === 'dayNight') {
      const v = scene!.dayNight || '';
      return (
        <div key={cellId} style={style}>
          {textEditingEnabled ? (
            <SelectDropdown value={v} onChange={val => updateScene({dayNight: val as any})} options={getDayNightOptions(palette)} className="text-left w-full" readOnly={!textEditingEnabled} positioning="fixed" placeholder={fieldLabel} />
          ) : (
            <RibbonCellText cell={cell} span={span || 1} cellPadding={cellPaddingV} style={!v ? emptyStyle : undefined}>{v ? fmt(prefix, v, suffix) : fieldLabel}</RibbonCellText>
          )}
        </div>
      );
    }
    if (field === 'cast') {
      const v = scene!.cast || '';
      return (
        <div key={cellId} style={style}>
          {textEditingEnabled ? (
            <EntityDropdown value={v} onChange={val => updateScene({cast: val})} items={castItems} className="text-left w-full" readOnly={!textEditingEnabled} mode="multi" positioning="fixed" placeholder="Cast" displayMode="id" renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '?'}</span></>} />
          ) : (
            <RibbonCellText cell={cell} span={span || 1} cellPadding={cellPaddingV} style={!v ? emptyStyle : undefined}>{v ? fmt(prefix, v, suffix) : fieldLabel}</RibbonCellText>
          )}
        </div>
      );
    }
    if (field === 'pageCount') {
      const displayText = fmt(prefix, val, suffix || 'pgs');
      return (
        <div key={cellId} style={style}>
          {textEditingEnabled ? (
            <CellInput value={scene!.pageCount} prefix={prefix} suffix={suffix || 'pgs'} onChange={val => { if (val === '') { updateScene({ pageCount: '', pageCountDecimal: 0 }); } else { const decimal = parsePageCount(val); updateScene({ pageCount: formatPageCount(decimal), pageCountDecimal: decimal }); } }} className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`} readOnly={!textEditingEnabled} placeholder={fieldLabel} />
          ) : (
            <RibbonCellText cell={cell} span={span || 1} cellPadding={cellPaddingV} className={inputClass} style={!val ? emptyStyle : undefined}>{val ? displayText : fieldLabel}</RibbonCellText>
          )}
        </div>
      );
    }
    if (field === 'duration') {
      return (
        <div key={cellId} style={style}>
          {isTouchMode ? (
              <DurationKeypad 
                value={row.estimatedDuration || 0} 
                onChange={val => updateRow({estimatedDuration: val})} 
                display={row.estimatedDuration === 0 ? '↑' : formatDuration(row.estimatedDuration || 0)} 
                className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`} 
                autoFocus={focusedRowId === row.id} 
                onOpen={() => onRowNavigate?.(row.id)}
                sceneNumber={scene?.sceneNumber}
                pageCount={scene?.pageCount}
              />
            ) : (
              <CellInput 
                value={row.estimatedDuration === 0 ? '↑' : formatDuration(row.estimatedDuration || 0)} 
                onChange={val => updateRow({estimatedDuration: parseDuration(val)})} 
                clearOnType
                col="duration"
                className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`} 
                autoFocus={focusedRowId === row.id} 
                onRowNavigate={onRowNavigate}
              />
            )}
        </div>
      );
    }
    if (field === 'sceneNumber') {
      const sv = scene!.sceneNumber || '';
      const displayText = fmt(prefix, sv, suffix);
      return (
        <div key={cellId} style={{ ...style, position: 'relative' }}>
          {textEditingEnabled ? (
            <CellInput value={sv} prefix={prefix} suffix={suffix} onChange={val => updateScene({sceneNumber: val})} className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`} readOnly={!textEditingEnabled} placeholder={fieldLabel} />
          ) : (
            <RibbonCellText cell={cell} span={span || 1} cellPadding={cellPaddingV} className={inputClass} style={!sv ? emptyStyle : undefined}>{sv ? displayText : fieldLabel}</RibbonCellText>
          )}
          {violationBadge}
        </div>
      );
    }
    if (field === 'text') {
      return (
        <div key={cellId} style={style}>
          <RibbonCellText cell={cell} span={span || 1} cellPadding={cellPaddingV}>{cell.textContent || ''}</RibbonCellText>
        </div>
      );
    }
    if (field === 'callTime') {
      return (
        <div key={cellId} style={style}>
          <RibbonCellText cell={cell} span={span || 1} cellPadding={cellPaddingV}>{fmt(prefix, val, suffix)}</RibbonCellText>
        </div>
      );
    }
    if (scene && ENTITY_FIELDS.has(field)) {
      const v = ((scene as any)[field] as string) || '';
      const entityItems = entityItemsMap[field] || [];
      return (
        <div key={cellId} style={style}>
          {textEditingEnabled ? (
            <EntityDropdown value={v} onChange={val => updateScene({[field]: val})} items={entityItems} mode={isMultiValue(field, customCategories) ? 'multi' : 'single'} uppercase={field === 'set'} keepAlphabetical={field === 'set'} positioning="fixed" className="text-left w-full" readOnly={!textEditingEnabled} placeholder={fieldLabel} />
          ) : (
            <RibbonCellText cell={cell} span={span || 1} cellPadding={cellPaddingV} style={!v ? emptyStyle : undefined}>{v ? fmt(prefix, v, suffix) : fieldLabel}</RibbonCellText>
          )}
        </div>
      );
    }
    const displayText = fmt(prefix, val, suffix);
    return (
      <div key={cellId} style={style}>
        {textEditingEnabled ? (
          <CellInput value={val} prefix={prefix} suffix={suffix} onChange={val => updateScene({[field]: val})} className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`} readOnly={!textEditingEnabled} placeholder={fieldLabels[field] || field} multiline={!!wrap} />
        ) : (
          <RibbonCellText cell={cell} span={span || 1} cellPadding={cellPaddingV} style={!val ? emptyStyle : undefined}>{val ? displayText : fieldLabel}</RibbonCellText>
        )}
      </div>
    );
  };

  const ctx: RowRenderCtx = {
    isSelected, isFaded, isCompact, focusedRowId, onRowNavigate, ribbon, colWidths,
    cellPaddingV, cellPaddingH, edgePadding, cellBorders, nextDaybreakCallTime,
    onUpdateNextDaybreak, nextDateStr, textEditingEnabled,
    palette: palette,
    nb, sel,
    sceneData, updateRow, updateScene, updateEntityField,
    inputClass, noteBreakPadPx, fmt, elapsedCaption, alignTextClass, isTouchMode,
    violationBadge, nextViolationBadge,
    renderCellContent, renderCellFlex,
    ENTITY_FIELDS, fieldLabels, entityItemsMap, castItems,
  };

  if (row.type === 'NOTE') return <SortableRowNote row={row} ctx={ctx} />;
  if (row.type === 'BREAK') return <SortableRowBreak row={row} ctx={ctx} />;
  if (row.type === 'DAYBREAK') return <SortableRowDaybreak row={row} ctx={ctx} />;
  if (row.type === 'SCENE') return <SortableRowScene row={row} scene={scene} ctx={ctx} />;
  return null;
}, sortableRowPropsEqual);

const sortableRibbonPropsEqual = (a: any, b: any) => {
  if (a.row !== b.row) return false;
  if (a.scene !== b.scene) return false;
  if (a.isOverlay !== b.isOverlay || a.isSelected !== b.isSelected || a.isFaded !== b.isFaded) return false;
  if (a.isCompact !== b.isCompact || a.textEditingEnabled !== b.textEditingEnabled) return false;
  if (a.sceneViolations !== b.sceneViolations) return false;
  if (a.sectionViolations !== b.sectionViolations || a.nextSectionViolations !== b.nextSectionViolations) return false;
  if (a.focusedRowId !== b.focusedRowId) return false;
  if (a.ribbon !== b.ribbon || a.colWidths !== b.colWidths) return false;
  if (a.cellPaddingV !== b.cellPaddingV || a.cellPaddingH !== b.cellPaddingH) return false;
  if (a.edgePadding !== b.edgePadding || a.cellBorders !== b.cellBorders) return false;
  if (a.nextDaybreakCallTime !== b.nextDaybreakCallTime) return false;
  if (a.nextDateStr !== b.nextDateStr) return false;
  if (a.readOnly !== b.readOnly) return false;
  if (a.dispatch !== b.dispatch) return false;
  if (a.activeVersionId !== b.activeVersionId) return false;
  if (a.palette !== b.palette || a.castMembers !== b.castMembers) return false;
  if (a.breakdownElements !== b.breakdownElements || a.customCategories !== b.customCategories) return false;
  if (a.hiddenCategories !== b.hiddenCategories) return false;
  return true;
};

export const SortableRibbon = React.memo(({
  row, scenes, scene, isOverlay, isSelected, isFaded, onSelectToggle, isCompact, textEditingEnabled, sceneViolations, sectionViolations, nextSectionViolations, focusedRowId, onDoubleClick, onRowNavigate, ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding, cellBorders, nextDaybreakCallTime, onUpdateNextDaybreak, nextDateStr, readOnly, dispatch, activeVersionId, palette, castMembers, breakdownElements, customCategories, hiddenCategories,
}: {
  row: ScheduleRow & { computedCallTime?: string, computedElapsed?: number, computedDayElapsed?: number, previousBreakEndElapsed?: number },
  scenes: Scene[],
  scene?: Scene | null,
  isOverlay?: boolean,
  isSelected?: boolean,
  isFaded?: boolean,
  onSelectToggle?: (e: React.MouseEvent) => void,
  isCompact?: boolean,
  textEditingEnabled?: boolean,
  sceneViolations?: RuleViolation[],
  sectionViolations?: RuleViolation[],
  nextSectionViolations?: RuleViolation[],
  focusedRowId?: string | null,
  onDoubleClick?: (id: string, shiftKey?: boolean) => void,
  onRowNavigate?: (rowId: string) => void,
  ribbon?: RibbonRow[],
  colWidths?: number[],
  cellPaddingV?: number,
  cellPaddingH?: number,
  edgePadding?: number,
  cellBorders?: CellBorders,
  nextDaybreakCallTime?: string,
  onUpdateNextDaybreak?: (val: string) => void,
  nextDateStr?: string,
  readOnly?: boolean,
  dispatch: (a: any) => void,
  activeVersionId?: string,
  palette?: SceneColorPalette,
  castMembers?: ProjectElement[],
  breakdownElements?: Record<string, ProjectElement[]>,
  customCategories?: CustomCategoryDef[],
  hiddenCategories?: string[],
}) => {
  if (readOnly) {
    return (
      <SortableRowContent
        row={row}
        scenes={scenes}
        scene={scene}
        isSelected={false}
        isFaded={false}
        isCompact={false}
        textEditingEnabled={false}
        sceneViolations={sceneViolations}
        sectionViolations={sectionViolations}
        nextSectionViolations={nextSectionViolations}
        focusedRowId={null}
        onRowNavigate={onRowNavigate}
        ribbon={ribbon}
        colWidths={colWidths}
        cellPaddingV={cellPaddingV}
        cellPaddingH={cellPaddingH}
        edgePadding={edgePadding}
        cellBorders={cellBorders}
        nextDaybreakCallTime={nextDaybreakCallTime}
        onUpdateNextDaybreak={onUpdateNextDaybreak}
        nextDateStr={nextDateStr}
        dispatch={dispatch}
        activeVersionId={activeVersionId}
        palette={palette}
        castMembers={castMembers}
        breakdownElements={breakdownElements}
        customCategories={customCategories}
        hiddenCategories={hiddenCategories}
      />
    );
  }

  const ctrlOrCmdHeld = useAddMode();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useSortable({
    id: row.id,
    disabled: row.pinned,
    data: { type: 'ROW', row }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging && !isOverlay ? 0.3 : undefined,
    userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    WebkitTouchCallout: 'none' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(ctrlOrCmdHeld ? {} : listeners)}
      {...attributes}
      onClick={onSelectToggle}
      onDoubleClick={(e) => onDoubleClick?.(row.id, e.shiftKey)}
      data-row-id={row.id}
      data-container-id={row.containerId}
      className={`group relative transition-colors shrink-0 outline-none border-b-[2px] border-black ${isOverlay ? 'scale-[1.02] shadow-2xl cursor-grabbing ring-2 ring-black' : ''} ${isSelected && !isFaded ? 'z-10' : ''} ${isFaded ? 'opacity-30' : ''} ${!textEditingEnabled && !isOverlay ? 'cursor-grab' : ''}`}
    >
      <SortableRowContent
        row={row}
        scenes={scenes}
        scene={scene}
        isSelected={isSelected}
        isFaded={isFaded}
        isCompact={isCompact}
        textEditingEnabled={textEditingEnabled}
        sceneViolations={sceneViolations}
        sectionViolations={sectionViolations}
        nextSectionViolations={nextSectionViolations}
        focusedRowId={focusedRowId}
        onRowNavigate={onRowNavigate}
        ribbon={ribbon}
        colWidths={colWidths}
        cellPaddingV={cellPaddingV}
        cellPaddingH={cellPaddingH}
        edgePadding={edgePadding}
        cellBorders={cellBorders}
        nextDaybreakCallTime={nextDaybreakCallTime}
        onUpdateNextDaybreak={onUpdateNextDaybreak}
        nextDateStr={nextDateStr}
        dispatch={dispatch}
        activeVersionId={activeVersionId}
        palette={palette}
        castMembers={castMembers}
        breakdownElements={breakdownElements}
        customCategories={customCategories}
        hiddenCategories={hiddenCategories}
      />
    </div>
  );
}, sortableRibbonPropsEqual);
