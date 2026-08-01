import React, { useMemo, useState, useRef, useLayoutEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Scene, ScheduleRow, RibbonRow, RibbonCell, RuleViolation } from '../types';
import { ComputedRow } from '../lib/daybreakUtils';
import { formatDuration, parseDuration, parsePageCount, formatPageCount } from '../lib/utils';
import { getFieldValue, getFieldValueFromSample, FIELD_MAP, getRibbonCellBaseStyle, formatCellText, getNoteBreakPad, sceneStyle, getSelectedStripColors, getNoteBannerColors, getDayHeaderColors, getDayFooterColors, getFallbackStripColors, getCellBorderProps, computeMergeGroups, getIntExtOptions, getDayNightOptions } from '../lib/ribbonUtils';
import { RibbonCellText } from './RibbonCellText';
import { CellBorders } from '../lib/persist';
import { getFieldItems, isMultiValue } from '../lib/categories';
import { useProject } from '../store';
import { usePortalTarget } from '../lib/popoutTarget';
import { CellInput } from './CellInput';
import { Flag } from 'lucide-react';
import { useAddMode, useLastPointerType } from '../lib/useMarquee';
import { EntityDropdown } from './EntityDropdown';
import DurationKeypad from './DurationKeypad';
import { SelectDropdown } from './SelectDropdown';
import { SCENE_RIBBON_DEFAULTS } from '../types';
import { createPortal } from 'react-dom';
import { ViolationContent } from './ViolationTooltip';
import { ViolationModal } from './ViolationModal';

const ENTITY_KEYS = new Set([
  'cast', 'set', 'backgroundActors', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup',
  'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept',
]);

function darkenHex(hex: string): string {
  const r = Math.round(parseInt(hex.slice(1,3),16) * 0.9).toString(16).padStart(2,'0');
  const g = Math.round(parseInt(hex.slice(3,5),16) * 0.9).toString(16).padStart(2,'0');
  const b = Math.round(parseInt(hex.slice(5,7),16) * 0.9).toString(16).padStart(2,'0');
  return `#${r}${g}${b}`;
}

const sortableRowPropsEqual = (a: any, b: any) => {
  if (a.row.id !== b.row.id || a.row.type !== b.row.type || a.row.containerId !== b.row.containerId || a.row.order !== b.row.order) return false;
  if (a.row.estimatedDuration !== b.row.estimatedDuration) return false;
  if (a.row.noteText !== b.row.noteText || a.row.noteColor !== b.row.noteColor || a.row.noteTextColor !== b.row.noteTextColor) return false;
  if (a.row.breakLabel !== b.row.breakLabel || a.row.breakDuration !== b.row.breakDuration) return false;
  if (a.row.daybreakLabel !== b.row.daybreakLabel || a.row.daybreakCallTime !== b.row.daybreakCallTime) return false;
  if (a.row.computedCallTime !== b.row.computedCallTime || a.row.computedElapsed !== b.row.computedElapsed) return false;
  if (a.scenes !== b.scenes) return false;
  if (a.isOverlay !== b.isOverlay || a.isSelected !== b.isSelected || a.isFaded !== b.isFaded) return false;
  if (a.isCompact !== b.isCompact || a.textEditingEnabled !== b.textEditingEnabled) return false;
  if (a.focusedRowId !== b.focusedRowId) return false;
  if (a.sceneViolations !== b.sceneViolations) return false;
  if (a.ribbon !== b.ribbon || a.colWidths !== b.colWidths) return false;
  if (a.cellPaddingV !== b.cellPaddingV || a.cellPaddingH !== b.cellPaddingH) return false;
  if (a.edgePadding !== b.edgePadding || a.cellBorders !== b.cellBorders) return false;
  if (a.nextDaybreakCallTime !== b.nextDaybreakCallTime) return false;
  if (a.nextDateStr !== b.nextDateStr) return false;
  return true;
};

const SortableRowContent: React.FC<{ 
  row: ComputedRow,
  scenes: Scene[], 
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
}> = React.memo(({ row, scenes, isSelected, isFaded, isCompact, textEditingEnabled, sceneViolations, sectionViolations, nextSectionViolations, focusedRowId, onRowNavigate, ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding, cellBorders, nextDaybreakCallTime, onUpdateNextDaybreak, nextDateStr }) => {
  const { state, dispatch } = useProject();
  const portalTarget = usePortalTarget();
  const activeVersionId = state.present.activeVersionId;

  const lastPointerType = useLastPointerType();
  const isTouchMode = lastPointerType === 'touch' || lastPointerType === 'pen';

  const scene = row.type === 'SCENE' ? scenes.find(s => s.id === row.sceneId) : null;

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
    const version = state.present.versions.find(v => v.id === activeVersionId);
    if (!version) return;
    const newRows = version.rows.map(r => r.id === row.id ? { ...r, ...updates } : r);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersionId, rows: newRows } });
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
        const existing = state.present.breakdownElements?.[key] || [];
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
          <ViolationContent compact violations={sceneViolations} castMembers={state.present.castMembers || []} />
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
        castMembers={state.present.castMembers || []}
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
          <ViolationContent compact violations={nextSectionViolations!} castMembers={state.present.castMembers || []} />
          <div className="absolute top-full -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-900" style={{ left: `calc(50% - ${nextTipOffset}px)` }} />
        </div>,
        portalTarget ?? document.body
      )}
      <ViolationModal
        open={showNextViolationModal}
        onClose={() => setShowNextViolationModal(false)}
        title="Section Violations"
        violations={nextSectionViolations!}
        castMembers={state.present.castMembers || []}
      />
    </>
  ) : null;

  const fmt = (prefix: string | undefined, val: string, suffix: string | undefined) =>
    formatCellText(prefix, val, suffix);

  const nb = getNoteBannerColors(state.present.colorPalette);
  const sel = getSelectedStripColors(state.present.colorPalette);

  if (row.type === 'NOTE') {
    const noteStyle: React.CSSProperties = { background: row.noteColor || nb.background, color: row.noteTextColor || nb.color };
    if (isSelected && !isFaded) { noteStyle.background = sel.background; noteStyle.color = sel.color; }

    if (ribbon && ribbon.length > 0 && !isCompact) {
      const cells = ribbon[0].cells;
      const cw = colWidths ?? cells.map(() => 100 / cells.length);
      const nonSpecial = cells
        .map((c, i) => ({i, w: cw[i] ?? 0, f: c.field}))
        .filter(x => x.f !== 'duration' && x.f !== 'callTime');
      const mainCellIdx = nonSpecial.length > 0
        ? nonSpecial.reduce((a, b) => a.w >= b.w ? a : b).i
        : cells.map((c, i) => ({i, w: cw[i] ?? 0})).reduce((a, b) => a.w >= b.w ? a : b, {i: 0, w: 0}).i;

      return (
          <div className="flex items-stretch min-w-0">
            <div className="flex-1 min-w-0 flex flex-col" style={{ ...noteStyle, paddingLeft: edgePadding ?? 2, paddingRight: edgePadding ?? 2 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: cw.map(w => `${w}%`).join(' '),
              }}>
            {cells.map((cell, ci) => {
              const wrapCell = ci === mainCellIdx;
              if (wrapCell) {
                return (
                  <div key={cell.id} style={{
                    gridColumn: ci + 1, gridRow: 1,
                    ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                    textAlign: 'center',
                    padding: noteBreakPadPx,
                    overflow: 'visible',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    lineHeight: 1.4,
                  }}>
                    <CellInput
                      value={row.noteText || ''}
                      onChange={val => updateRow({noteText: val.toUpperCase()})}
                      className={`${inputClass} text-center`}
                      placeholder="Enter note here..."
                      multiline
                      autoFocus={focusedRowId === row.id}
                      col="text"
                    />
                  </div>
                );
              }
              if (cell.field === 'duration') {
                return (
                  <div key={cell.id} style={{
                    gridColumn: ci + 1, gridRow: 1,
                    ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                    textAlign: 'center',
                    padding: noteBreakPadPx,
                    overflow: 'visible',
                  }}>
                    {isTouchMode ? (
                      <DurationKeypad
                        value={row.estimatedDuration || 0}
                        onChange={val => updateRow({estimatedDuration: val})}
                        display={!row.estimatedDuration ? '' : formatDuration(row.estimatedDuration)}
                        className={`${inputClass} text-center`}
                        autoFocus={focusedRowId === row.id}
                        onOpen={() => onRowNavigate?.(row.id)}
                      />
                    ) : (
                      <CellInput
                        value={row.estimatedDuration === 0 || !row.estimatedDuration ? '' : formatDuration(row.estimatedDuration || 0)}
                        onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
                        clearOnType
                        col="duration"
                        className={`${inputClass} text-center`}
                        onRowNavigate={onRowNavigate}
                      />
                    )}
                  </div>
                );
              }
              if (cell.field === 'callTime') {
                const v = row.computedCallTime || '';
                return <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                  textAlign: 'center',
                  padding: noteBreakPadPx,
                  overflow: 'visible',
                }}>{v ? fmt(cell.prefix, v, cell.suffix) : ''}</div>;
              }
              return <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                textAlign: 'center',
                padding: noteBreakPadPx,
                overflow: 'visible',
              }} />;
            })}
            </div>
            </div>
          </div>
      );
    }

    return (
        <div className="flex items-stretch min-w-0">
          <table className="schedule-table flex-1 min-w-0">
            <tbody>
              <tr className="row-note" style={{ ...noteStyle, '--note-row-py': `${getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1)}px` } as any}>
                <td className="col-sc" />
                {!isCompact ? (
                  <>
                    <td className="col-call">{row.computedCallTime}</td>
                    <td className="col-dur">
                      {isTouchMode ? (
                        <DurationKeypad
                          value={row.estimatedDuration || 0}
                          onChange={val => updateRow({estimatedDuration: val})}
                          display={!row.estimatedDuration ? '' : formatDuration(row.estimatedDuration)}
                          className={`${inputClass} text-center`}
                          autoFocus={focusedRowId === row.id}
                          onOpen={() => onRowNavigate?.(row.id)}
                        />
                      ) : (
                        <CellInput
                          value={row.estimatedDuration === 0 || !row.estimatedDuration ? '' : formatDuration(row.estimatedDuration || 0)}
                          onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
                          clearOnType
                          col="duration"
                          className={`${inputClass} text-center`}
                          autoFocus={focusedRowId === row.id}
                          onRowNavigate={onRowNavigate}
                        />
                      )}
                    </td>
                    <td className="col-ie" />
                    <td className="col-set" style={{textAlign: 'center'}}>
                      <CellInput
                        value={row.noteText || ''}
                        onChange={val => updateRow({noteText: val.toUpperCase()})}
                        className={`${inputClass} text-center`}
                        placeholder="Enter note here..."
                        multiline
                        col="text"
                      />
                    </td>
                    <td className="col-dn" />
                    <td className="col-cast" />
                    <td className="col-pgs" />
                  </>
                  ) : (
                  <td colSpan={4} className="col-set">
                    <CellInput
                      value={row.noteText || ''}
                      onChange={val => updateRow({noteText: val.toUpperCase()})}
                      className={inputClass}
                      placeholder="Enter note here..."
                      multiline
                      autoFocus={focusedRowId === row.id}
                      col="text"
                    />
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
    );
  }

  if (row.type === 'BREAK') {
    const breakStyle: React.CSSProperties = { background: nb.background, color: nb.color };
    if (isSelected && !isFaded) { breakStyle.background = sel.background; breakStyle.color = sel.color; }

    if (ribbon && ribbon.length > 0 && !isCompact) {
      const cells = ribbon[0].cells;
      const cw = colWidths ?? cells.map(() => 100 / cells.length);
      const nonSpecial = cells
        .map((c, i) => ({i, w: cw[i] ?? 0, f: c.field}))
        .filter(x => x.f !== 'duration' && x.f !== 'callTime');
      const mainCellIdx = nonSpecial.length > 0
        ? nonSpecial.reduce((a, b) => a.w >= b.w ? a : b).i
        : cells.map((c, i) => ({i, w: cw[i] ?? 0})).reduce((a, b) => a.w >= b.w ? a : b, {i: 0, w: 0}).i;

      return (
          <div className="flex items-stretch min-w-0">
            <div className="flex-1 min-w-0 flex flex-col" style={{ ...breakStyle, paddingLeft: edgePadding ?? 2, paddingRight: edgePadding ?? 2 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: cw.map(w => `${w}%`).join(' '),
              }}>
            {cells.map((cell, ci) => {
              const wrapCell = ci === mainCellIdx;
              if (wrapCell) {
                return (
                  <div key={cell.id} style={{
                    gridColumn: ci + 1, gridRow: 1,
                    ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                    textAlign: 'center',
                    padding: noteBreakPadPx,
                    overflow: 'visible',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                  }}>
                    <CellInput
                      value={row.breakLabel || ''}
                      onChange={val => updateRow({breakLabel: val.toUpperCase()})}
                      className={`${inputClass} text-center`}
                      placeholder="ENTER BREAK TEXT"
                      multiline
                      autoFocus={focusedRowId === row.id}
                      col="text"
                    />
                  </div>
                );
              }
              if (cell.field === 'duration') {
                return (
                  <div key={cell.id} style={{
                    gridColumn: ci + 1, gridRow: 1,
                    ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                    textAlign: 'center',
                    padding: noteBreakPadPx,
                    overflow: 'visible',
                  }}>
                    {isTouchMode ? (
                      <DurationKeypad
                        value={row.breakDuration || 0}
                        onChange={val => updateRow({breakDuration: val})}
                        className={`${inputClass} text-center`}
                        autoFocus={focusedRowId === row.id}
                        onOpen={() => onRowNavigate?.(row.id)}
                      />
                    ) : (
                      <CellInput
                        value={formatDuration(row.breakDuration || 0)}
                        onChange={val => updateRow({breakDuration: parseDuration(val)})}
                        clearOnType
                        col="duration"
                        className={`${inputClass} text-center`}
                        onRowNavigate={onRowNavigate}
                      />
                    )}
                  </div>
                );
              }
              if (cell.field === 'callTime') {
                const v = row.computedCallTime || '';
                return <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                  textAlign: 'center',
                  padding: noteBreakPadPx,
                  overflow: 'visible',
                }}>{v ? fmt(cell.prefix, v, cell.suffix) : ''}</div>;
              }
              return <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                textAlign: 'center',
                padding: noteBreakPadPx,
                overflow: 'visible',
              }} />;
            })}
            </div>
            </div>
          </div>
      );
    }

    return (
        <div className="flex items-stretch min-w-0">
          <table className="schedule-table flex-1 min-w-0">
            <tbody>
              <tr className="row-break" style={{ ...breakStyle, '--note-row-py': `${getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1)}px` } as any}>
                <td className="col-sc" />
                {!isCompact ? (
                  <>
                    <td className="col-call">{row.computedCallTime}</td>
                    <td className="col-dur">
                      {isTouchMode ? (
                        <DurationKeypad
                          value={row.breakDuration || 0}
                          onChange={val => updateRow({breakDuration: val})}
                          className={`${inputClass} text-center`}
                          autoFocus={focusedRowId === row.id}
                          onOpen={() => onRowNavigate?.(row.id)}
                        />
                      ) : (
                        <CellInput
                          value={formatDuration(row.breakDuration || 0)}
                          onChange={val => updateRow({breakDuration: parseDuration(val)})}
                          clearOnType
                          col="duration"
                          className={`${inputClass} text-center`}
                          autoFocus={focusedRowId === row.id}
                          onRowNavigate={onRowNavigate}
                        />
                      )}
                    </td>
                    <td className="col-ie" />
                    <td className="col-set" style={{textAlign: 'center'}}>
                      <CellInput
                        value={row.breakLabel || ''}
                        onChange={val => updateRow({breakLabel: val.toUpperCase()})}
                        className={`${inputClass} text-center`}
                        placeholder="ENTER BREAK TEXT"
                        col="text"
                      />
                    </td>
                    <td className="col-dn" />
                    <td className="col-cast" />
                    <td className="col-pgs" />
                  </>
                  ) : (
                  <td colSpan={4} className="col-set">
                    <CellInput
                      value={row.breakLabel || ''}
                      onChange={val => updateRow({breakLabel: val.toUpperCase()})}
                      className={inputClass}
                      placeholder="ENTER BREAK TEXT"
                      autoFocus={focusedRowId === row.id}
                      col="text"
                    />
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
    );
  }

  if (row.type === 'DAYBREAK') {
    const dh = getDayHeaderColors(state.present.colorPalette);
    const df = getDayFooterColors(state.present.colorPalette);
    const daybreakStyle: React.CSSProperties = { background: df.background, color: df.color };
    if (isSelected && !isFaded) { daybreakStyle.background = sel.background; daybreakStyle.color = sel.color; }

    const sectionTotal = row.sectionTotal || 0;
    const sectionPages = row.sectionPages || 0;
    const sectionShoot = row.sectionShoot || 0;
    const sectionBreak = row.sectionBreak || 0;
    const sectionEndTime = row.sectionEndTime || '';
    const nextDaybreakNum = row.hasNextDaybreak ? parseInt((row.daybreakLabel || '').match(/\d+/)?.[0] || '0', 10) + 1 : 0;
    const nextLabel = nextDaybreakNum > 0 ? `START OF DAY ${nextDaybreakNum}` : '';

    if (ribbon && ribbon.length > 0 && !isCompact) {
      const cells = ribbon[0].cells;
      const cw = colWidths ?? cells.map(() => 100 / cells.length);
      const nonSpecial = cells
        .map((c, i) => ({i, w: cw[i] ?? 0, f: c.field}))
        .filter(x => x.f !== 'duration' && x.f !== 'callTime');
      const mainCellIdx = nonSpecial.length > 0
        ? nonSpecial.reduce((a, b) => a.w >= b.w ? a : b).i
        : cells.map((c, i) => ({i, w: cw[i] ?? 0})).reduce((a, b) => a.w >= b.w ? a : b, {i: 0, w: 0}).i;
      const notePadV = getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1);
      const daybreakPadV = Math.max(cellPaddingV ?? 6, Math.floor(notePadV / 2));
      const daybreakPadPx = `${daybreakPadV}px ${cellPaddingH ?? 6}px`;
      const lastCellIdx = cells.length - 1;
      const pageCountCell = (() => {
        for (const r of ribbon) {
          const found = r.cells.find(c => c.field === 'pageCount');
          if (found) return found;
        }
        return null;
      })();
      const pageCountColIdx = cells.findIndex((_, ci) =>
        ribbon.some(r => ci < r.cells.length && r.cells[ci].field === 'pageCount')
      );

      const durationColIdx = cells.findIndex(c => c.field === 'duration');
      const durationCell = (() => {
        for (const r of ribbon) {
          const found = r.cells.find(c => c.field === 'duration');
          if (found) return found;
        }
        return null;
      })();
      const estColIdx = mainCellIdx === cells.length - 1 && durationColIdx >= 0 ? durationColIdx : lastCellIdx;

      return (
        <div className="flex items-stretch min-w-0">
          <div className="flex-1 min-w-0 flex flex-col">
              {!row.pinned && (
              <div className="flex-1 min-w-0 flex flex-col" style={{
                ...daybreakStyle,
                paddingLeft: edgePadding ?? 2,
                paddingRight: edgePadding ?? 2,
                ...(row.hasNextDaybreak ? { borderBottom: '2px solid #000' } : {}),
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: cw.map(w => `${w}%`).join(' ') }}>
                {cells.map((cell, ci) => {
                  if (ci === mainCellIdx) {
                    return (
                      <div key={cell.id} style={{
                        gridColumn: ci + 1, gridRow: 1,
                        ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                        textAlign: 'center', padding: daybreakPadPx, overflow: 'visible',
                        whiteSpace: 'normal', wordBreak: 'break-word',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                        position: 'relative',
                      }}>
                        <span>{row.daybreakLabel || 'End of Day'}</span>
                        {row.daybreakDate && (
                          <span style={{ fontSize: '7pt', opacity: 0.8 }}>
                            {(() => { const d = new Date(row.daybreakDate + 'T00:00:00'); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); })()}
                          </span>
                        )}
                      </div>
                    );
                  }
                  if (ci === estColIdx && sectionTotal > 0) {
                    const estCell = (estColIdx === durationColIdx && durationCell) ? durationCell : cell;
                    const estAlign = estCell.align === 'right' ? 'flex-end' : estCell.align === 'left' ? 'flex-start' : 'center';
                    return (
                      <div key={cell.id} style={{
                        gridColumn: ci + 1, gridRow: 1,
                        ...getRibbonCellBaseStyle(estCell, cellPaddingV, cellPaddingH, 1),
                        padding: daybreakPadPx, overflow: 'visible',
                        whiteSpace: 'normal', wordBreak: 'break-word',
                        display: 'flex', flexDirection: 'column', alignItems: estAlign, justifyContent: 'center', gap: 1,
                      }}>
                        <span style={{ fontSize: '8pt' }}>
                          EST: {formatDuration(sectionShoot)}{sectionBreak > 0 ? <span> + {formatDuration(sectionBreak)} break</span> : null}
                        </span>
                      </div>
                    );
                  }
                  if (ci === pageCountColIdx && sectionPages > 0) {
                    const pc = pageCountCell!;
                    return (
                      <div key={cell.id} style={{
                        gridColumn: ci + 1, gridRow: 1,
                        ...getRibbonCellBaseStyle(pc, cellPaddingV, cellPaddingH, 1),
                        padding: daybreakPadPx, overflow: 'visible',
                        display: 'flex', flexDirection: 'column', alignItems: pc.align === 'right' ? 'flex-end' : pc.align === 'left' ? 'flex-start' : 'center', justifyContent: 'center', gap: 1,
                      }}>
                        <span style={{ fontSize: '7pt', opacity: 0.8 }}>Total:</span>
                        <span style={{ fontSize: '8pt' }}>{formatPageCount(sectionPages)} {pc.suffix || 'pgs'}</span>
                      </div>
                    );
                  }
                  if (cell.field === 'duration') {
                    return (
                      <div key={cell.id} style={{
                        gridColumn: ci + 1, gridRow: 1,
                        ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                        textAlign: 'center', padding: daybreakPadPx, overflow: 'visible',
                      }} />
                    );
                  }
                  if (cell.field === 'callTime') {
                    return (
                      <div key={cell.id} style={{
                        gridColumn: ci + 1, gridRow: 1,
                        ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                        textAlign: 'center', padding: daybreakPadPx, overflow: 'visible',
                      }}>
                        {sectionEndTime ? fmt(cell.prefix, sectionEndTime, cell.suffix) : ''}
                      </div>
                    );
                  }
                  return <div key={cell.id} style={{
                    gridColumn: ci + 1, gridRow: 1,
                    ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                    textAlign: 'center', padding: daybreakPadPx, overflow: 'visible',
                  }} />;
                })}
              </div>
            </div>
            )}

            {row.hasNextDaybreak && (
              <div style={{ background: (isSelected && !isFaded) ? sel.background : dh.background, color: (isSelected && !isFaded) ? sel.color : dh.color, paddingLeft: edgePadding ?? 2, paddingRight: edgePadding ?? 2 }}>
                <div style={{ display: 'grid', gridTemplateColumns: cw.map(w => `${w}%`).join(' ') }}>
                  {cells.map((cell, ci) => {
                    if (ci === mainCellIdx) {
                      return (
                        <div key={cell.id} style={{
                          gridColumn: ci + 1, gridRow: 1,
                          ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                          textAlign: 'center', padding: daybreakPadPx, overflow: 'visible',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                        }}>
                          <strong>{nextLabel}</strong>
                          {nextDateStr && <span style={{ fontSize: '7pt', opacity: 0.8 }}>{nextDateStr}</span>}
                        </div>
                      );
                    }
                    if (cell.field === 'callTime') {
                      return (
                        <div key={cell.id} style={{
                          gridColumn: ci + 1, gridRow: 1,
                          ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                          textAlign: 'center', padding: daybreakPadPx, overflow: 'visible',
                        }}>
                          <CellInput
                            value={nextDaybreakCallTime || '08:00'}
                            onChange={val => onUpdateNextDaybreak?.(val)}
                            clearOnType
                            col="duration"
                            className="text-center"
                            noTruncate
                            onRowNavigate={onRowNavigate}
                          />
                        </div>
                      );
                    }
                    if (cell.field === 'duration') {
                      return (
                        <div key={cell.id} style={{
                          gridColumn: ci + 1, gridRow: 1,
                          ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                          textAlign: 'center', padding: daybreakPadPx, overflow: 'visible',
                        }}>
                          <span style={{ fontSize: '7pt', opacity: 0.8 }}>CALL</span>
                        </div>
                      );
                    }
                    return (
                      <div key={cell.id} style={{
                        gridColumn: ci + 1, gridRow: 1,
                        ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                        textAlign: 'center', padding: daybreakPadPx, overflow: 'visible',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {ci === lastCellIdx && nextViolationBadge}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-stretch min-w-0">
        <div className="flex-1 min-w-0 flex flex-col">
          {!row.pinned && (
          <table className="schedule-table flex-1 min-w-0">
            <tbody>
              <tr className="row-note" style={{ ...daybreakStyle, '--note-row-py': `${getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1)}px` } as any}>
                <td className="col-sc" />
                {!isCompact ? (
                  <>
                    <td className="col-call">{sectionEndTime || row.computedCallTime}</td>
                    <td className="col-dur">{sectionTotal > 0 ? formatDuration(sectionTotal) : ''}</td>
                    <td className="col-ie" />
                    <td className="col-set" style={{textAlign: 'center'}}>
                      {row.daybreakLabel || 'End of Day'}
                    </td>
                    <td className="col-dn" />
                    <td className="col-cast" />
                  <td className="col-pgs" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      {sectionTotal > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                          <span style={{ fontSize: '7pt', opacity: 0.75 }}>{formatPageCount(sectionPages)} pgs · EST: {formatDuration(sectionShoot)}{sectionBreak > 0 ? <span> + {formatDuration(sectionBreak)} break</span> : null}</span>
                        </div>
                      )}
                    </td>
                  </>
                ) : (
                  <td colSpan={4} className="col-set">
                    {row.daybreakLabel || 'End of Day'}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
          )}
          {nextDaybreakNum > 0 && (
            <table className="schedule-table flex-1 min-w-0">
              <tbody>
                <tr className="row-note" style={{ background: (isSelected && !isFaded) ? sel.background : dh.background, color: (isSelected && !isFaded) ? sel.color : dh.color, '--note-row-py': `${getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1)}px` } as any}>
                  <td className="col-sc" />
                  <td className="col-call">
                    <CellInput
                      value={nextDaybreakCallTime || '08:00'}
                      onChange={val => onUpdateNextDaybreak?.(val)}
                      clearOnType
                      col="duration"
                      className="bg-zinc-800 px-1.5 py-0.5 border border-transparent focus-within:border-zinc-500 text-center"
                      onRowNavigate={onRowNavigate}
                    />
                  </td>
                  <td className="col-dur" style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '7pt', opacity: 0.8 }}>CALL</span>
                  </td>
                  <td className="col-ie" />
                  <td className="col-set" style={{ textAlign: 'center' }}>
                    <strong>{nextLabel}</strong>
                    {nextDateStr && <span style={{ fontSize: '7pt', opacity: 0.8, marginLeft: 6 }}>{nextDateStr}</span>}
                  </td>
                  <td className="col-dn" />
                  <td className="col-cast" />
                  <td className="col-pgs" style={{ textAlign: 'center' }}>
                    {nextViolationBadge}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

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
            options={getIntExtOptions(state.present.colorPalette)}
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
            options={getDayNightOptions(state.present.colorPalette)}
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
              suffix="pgs"
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
          <EntityDropdown value={v} onChange={val => updateEntityField(field, val)} items={entityItems} mode={isMultiValue(field, state.present.customCategories) ? 'multi' : 'single'} uppercase={field === 'set'} keepAlphabetical={field === 'set'} positioning="fixed" className="text-left w-full text-xs" readOnly={!textEditingEnabled} placeholder={fieldLabels[field] || field} />
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
    const hiddenSet = new Set(state.present.hiddenCategories || []);
    const fields = new Set([
      'set', 'backgroundActors', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup', 'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept',
      ...(state.present.customCategories || []).map(c => c.key),
    ]);
    for (const h of hiddenSet) fields.delete(h);
    return fields;
  }, [state.present.customCategories, state.present.hiddenCategories]);

  const fieldLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const [key, def] of Object.entries(FIELD_MAP)) labels[key] = def.label;
    for (const c of state.present.customCategories || []) labels[c.key] = c.label;
    return labels;
  }, [state.present.customCategories]);

  const entityItemsMap = useMemo(() => {
    const map: Record<string, { id: string; name: string }[]> = {};
    for (const field of ENTITY_FIELDS) {
      const sceneValues = [...new Set(scenes.map(s => ((s as any)[field] as string) || '').filter(Boolean).flatMap(v => v.split(',').map(x => x.trim())))] as string[];
      const stored = state.present.breakdownElements?.[field] || [];
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
  }, [scenes, state.present.breakdownElements]);

  const castItems = useMemo(() => {
    const sceneValues = [...new Set(scenes.map(s => s.cast || '').filter(Boolean).flatMap(v => v.split(',').map(x => x.trim())))] as string[];
    const stored = state.present.castMembers ?? [];
    const seen = new Set<string>();
    const items: { id: string; name: string }[] = [];
    for (const e of stored) {
      if (e.id && !seen.has(e.id)) { items.push(e); seen.add(e.id); }
    }
    for (const v of sceneValues) {
      if (!seen.has(v)) { items.push({ id: v, name: '' }); seen.add(v); }
    }
    return items;
  }, [scenes, state.present.castMembers]);

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
            <SelectDropdown value={v} onChange={val => updateScene({intExt: val as any})} options={getIntExtOptions(state.present.colorPalette)} className="text-left w-full" readOnly={!textEditingEnabled} positioning="fixed" placeholder={fieldLabel} />
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
            <SelectDropdown value={v} onChange={val => updateScene({dayNight: val as any})} options={getDayNightOptions(state.present.colorPalette)} className="text-left w-full" readOnly={!textEditingEnabled} positioning="fixed" placeholder={fieldLabel} />
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
            <CellInput value={scene!.pageCount} suffix="pgs" onChange={val => { if (val === '') { updateScene({ pageCount: '', pageCountDecimal: 0 }); } else { const decimal = parsePageCount(val); updateScene({ pageCount: formatPageCount(decimal), pageCountDecimal: decimal }); } }} className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`} readOnly={!textEditingEnabled} placeholder={fieldLabel} />
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
            <CellInput value={sv} onChange={val => updateScene({sceneNumber: val})} className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`} readOnly={!textEditingEnabled} placeholder={fieldLabel} />
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
            <EntityDropdown value={v} onChange={val => updateScene({[field]: val})} items={entityItems} mode={isMultiValue(field, state.present.customCategories) ? 'multi' : 'single'} uppercase={field === 'set'} keepAlphabetical={field === 'set'} positioning="fixed" className="text-left w-full" readOnly={!textEditingEnabled} placeholder={fieldLabel} />
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
          <CellInput value={val} onChange={val => updateScene({[field]: val})} className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`} readOnly={!textEditingEnabled} placeholder={fieldLabels[field] || field} multiline={!!wrap} />
        ) : (
          <RibbonCellText cell={cell} span={span || 1} cellPadding={cellPaddingV} style={!val ? emptyStyle : undefined}>{val ? displayText : fieldLabel}</RibbonCellText>
        )}
      </div>
    );
  };

  if (scene) {
    const rowStyle = sceneStyle(scene, state.present.colorPalette?.sceneColors, getFallbackStripColors(state.present.colorPalette), state.present.colorPalette?.colorRules);
    if (isSelected && !isFaded) {
      rowStyle.background = sel.background;
      rowStyle.color = sel.color;
    }

    // ── Ribbon-based rendering (non-compact) ──
    if (ribbon && ribbon.length > 0 && !isCompact) {
      const cw = colWidths ?? [];
      return (
          <div className="flex items-stretch min-w-0">
            <div className="flex-1 min-w-0 flex flex-col" style={{ ...rowStyle, paddingLeft: edgePadding ?? 2, paddingRight: edgePadding ?? 2 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: cw.map(w => `${w}%`).join(' '),
                gridTemplateRows: `${edgePadding ?? 2}px repeat(${ribbon.length}, auto) ${edgePadding ?? 2}px`,
              }}>
                {(() => {
                  const mgroups = computeMergeGroups(ribbon);
                  const hiddenIds = new Set<string>();
                  for (const g of mgroups) {
                    if (g.direction === 'v') {
                      for (let ri = g.rowIndex + 1; ri < g.rowIndex + g.span; ri++) {
                        const cell = ribbon[ri]?.cells[g.colIndex];
                        if (cell) hiddenIds.add(cell.id);
                      }
                    } else {
                      for (let ci = g.colIndex + 1; ci < g.colIndex + g.span; ci++) {
                        const cell = ribbon[g.rowIndex]?.cells[ci];
                        if (cell) hiddenIds.add(cell.id);
                      }
                    }
                  }
                  const items: { cell: RibbonCell; col: number; row: number; vSpan: number; hSpan: number }[] = [];
                  for (let ri = 0; ri < ribbon.length; ri++) {
                    for (let ci = 0; ci < ribbon[ri].cells.length; ci++) {
                      const cell = ribbon[ri].cells[ci];
                      if (hiddenIds.has(cell.id)) continue;
                      const g = mgroups.find(gg => gg.colIndex === ci && gg.rowIndex === ri);
                      const vSpan = g?.direction === 'v' ? (g.span || 1) : 1;
                      const hSpan = g?.direction === 'h' ? (g.span || 1) : 1;
                      items.push({ cell, col: ci, row: ri, vSpan, hSpan });
                    }
                  }
                  return items.map(({ cell, col, row, vSpan, hSpan }) => {
                    const isLastInRow = hSpan > 1 ? col + hSpan - 1 >= ribbon[0].cells.length - 1 : col === ribbon[0].cells.length - 1;
                    return renderCellFlex(cell, isLastInRow, row + vSpan - 1 >= ribbon.length - 1, rowStyle.color, col, row, vSpan, hSpan);
                  });
                })()}
              </div>
            </div>
          </div>
      );
    }

    if (isCompact) {
    return (
        <div className="flex items-stretch min-w-0">
          <table className="schedule-table flex-1 min-w-0">
              <tbody>
                <tr style={rowStyle}>
                  <td className="col-sc relative">
                    <CellInput
                      value={scene.sceneNumber}
                      onChange={val => updateScene({sceneNumber: val})}
                      className={`${inputClass} text-center`}
                      readOnly
                    />
                    {violationBadge}
                  </td>
                  <td colSpan={3} className="col-set">
                    <span className="uppercase truncate block">{scene.intExt}. {scene.set} - {scene.dayNight}</span>
                    {scene.description && <span className="opacity-60 truncate block">{scene.description}</span>}
                  </td>
                  <td className="col-cast">
                    <EntityDropdown value={scene.cast} onChange={val => updateScene({cast: val})} className="text-right w-full" readOnly displayMode="id" />
                </td>
              </tr>
              {!isCompact && (() => {
                const ribbon = state.present.sceneRibbon || SCENE_RIBBON_DEFAULTS;
                const breakdownKeys = ['props', 'wardrobe', 'makeup', 'backgroundActors', 'stunts', 'vehicles', 'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept', 'notes'];
                const ribbonBreakdown = ribbon.filter(c => breakdownKeys.includes(c.key));
                if (ribbonBreakdown.length === 0) return null;
                return (
                  <tr style={rowStyle}>
                    <td className="col-sc" />
                    {!isCompact && <td className="col-call" />}
                    {!isCompact && <td className="col-dur" />}
                    <td colSpan={3} style={{ padding: '2px 4px', opacity: 0.7 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {ribbonBreakdown.map(c => {
                          const val = (scene as any)[c.key] as string;
                          if (!val) return null;
                          return (
                            <span key={c.key} style={{ fontSize: '7pt', whiteSpace: 'nowrap' }}>
                              <strong>{c.key}:</strong> {val}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })()}
              </tbody>
            </table>
          </div>
      );
    }

  }
  return null;
}, sortableRowPropsEqual);

export const SortableRibbon: React.FC<{
  row: ScheduleRow & { computedCallTime?: string, computedElapsed?: number },
  scenes: Scene[],
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
  onDoubleClick?: (id: string) => void,
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
}> = ({ row, scenes, isOverlay, isSelected, isFaded, onSelectToggle, isCompact, textEditingEnabled, sceneViolations, sectionViolations, nextSectionViolations, focusedRowId, onDoubleClick, onRowNavigate, ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding, cellBorders, nextDaybreakCallTime, onUpdateNextDaybreak, nextDateStr, readOnly }) => {
  if (readOnly) {
    return (
      <SortableRowContent
        row={row}
        scenes={scenes}
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
      />
    );
  }

  const ctrlOrCmdHeld = useAddMode();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: row.id,
    disabled: row.pinned,
    data: { type: 'ROW', row }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
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
      />
    </div>
  );
};
