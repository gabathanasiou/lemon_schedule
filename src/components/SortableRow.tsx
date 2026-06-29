import React, { useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Scene, ScheduleRow, RibbonRow, RibbonCell } from '../types';
import { formatDuration, parseDuration, parsePageCount, formatPageCount } from '../lib/utils';
import { getFieldValue, getFieldValueFromSample, FIELD_MAP, getRibbonCellBaseStyle, formatCellText, getNoteBreakPad, sceneStyle, getSelectedStripColors, getNoteBannerColors, getCellBorderProps, computeMergeGroups } from '../lib/ribbonUtils';
import { RibbonCellText } from './RibbonCellText';
import { CellBorders } from '../lib/persist';
import { getFieldItems, isMultiValue } from '../lib/categories';
import { useProject } from '../store';
import { CellInput } from './CellInput';
import { Tooltip } from './Tooltip';
import { Flag } from 'lucide-react';
import { useAddMode } from '../lib/useMarquee';
import { EntityDropdown } from './EntityDropdown';
import { SelectDropdown } from './SelectDropdown';
import { SCENE_RIBBON_DEFAULTS } from '../types';

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
  if (a.row.id !== b.row.id || a.row.type !== b.row.type || a.row.shootDay !== b.row.shootDay || a.row.order !== b.row.order) return false;
  if (a.row.estimatedDuration !== b.row.estimatedDuration) return false;
  if (a.row.noteText !== b.row.noteText || a.row.noteColor !== b.row.noteColor || a.row.noteTextColor !== b.row.noteTextColor) return false;
  if (a.row.breakLabel !== b.row.breakLabel || a.row.breakDuration !== b.row.breakDuration) return false;
  if (a.row.computedCallTime !== b.row.computedCallTime || a.row.computedElapsed !== b.row.computedElapsed) return false;
  if (a.scenes !== b.scenes) return false;
  if (a.isOverlay !== b.isOverlay || a.isSelected !== b.isSelected || a.isFaded !== b.isFaded) return false;
  if (a.isCompact !== b.isCompact || a.textEditingEnabled !== b.textEditingEnabled) return false;
  if (a.focusedRowId !== b.focusedRowId) return false;
  if (a.sceneViolations !== b.sceneViolations) return false;
  if (a.ribbon !== b.ribbon || a.colWidths !== b.colWidths) return false;
  if (a.cellPaddingV !== b.cellPaddingV || a.cellPaddingH !== b.cellPaddingH) return false;
  if (a.edgePadding !== b.edgePadding || a.cellBorders !== b.cellBorders) return false;
  return true;
};

const SortableRowContent: React.FC<{ 
  row: ScheduleRow & { computedCallTime?: string, computedElapsed?: number }, 
  scenes: Scene[], 
  isSelected?: boolean,
  isFaded?: boolean,
  isCompact?: boolean,
  textEditingEnabled?: boolean,
  sceneViolations?: string[],
  focusedRowId?: string | null,
  onRowNavigate?: (rowId: string) => void,
  ribbon?: RibbonRow[],
  colWidths?: number[],
  cellPaddingV?: number,
  cellPaddingH?: number,
  edgePadding?: number,
  cellBorders?: CellBorders,
}> = React.memo(({ row, scenes, isSelected, isFaded, isCompact, textEditingEnabled, sceneViolations, focusedRowId, onRowNavigate, ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding, cellBorders }) => {
  const { state, dispatch } = useProject();
  const activeVersionId = state.present.activeVersionId;

  const scene = row.type === 'SCENE' ? scenes.find(s => s.id === row.sceneId) : null;

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
            dispatch({ type: 'ADD_ELEMENT', payload: { category: key, element: { id: item, name: item } } });
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
  const violationBadge = hasViolations ? (
    <Tooltip content={sceneViolations.join('\n• ')}>
      <span className="inline-flex items-center text-red-500 ml-0.5">
        <Flag className="w-2.5 h-2.5 fill-red-500 text-red-500" />
      </span>
    </Tooltip>
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
                    <CellInput
                      value={row.estimatedDuration === 0 || !row.estimatedDuration ? '' : formatDuration(row.estimatedDuration || 0)}
                      onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
                      clearOnType
                      col="duration"
                      className={`${inputClass} text-center`}
                      navigateOnEnter={false}
                      onRowNavigate={onRowNavigate}
                    />
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
                      <CellInput
                        value={row.estimatedDuration === 0 || !row.estimatedDuration ? '' : formatDuration(row.estimatedDuration || 0)}
                        onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
                        clearOnType
                        col="duration"
                        className={`${inputClass} text-center`}
                        navigateOnEnter={false}
                        autoFocus={focusedRowId === row.id}
                        onRowNavigate={onRowNavigate}
                      />
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
                    <CellInput
                      value={formatDuration(row.breakDuration || 0)}
                      onChange={val => updateRow({breakDuration: parseDuration(val)})}
                      clearOnType
                      col="duration"
                      className={`${inputClass} text-center`}
                      navigateOnEnter={false}
                      onRowNavigate={onRowNavigate}
                    />
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
                      <CellInput
                        value={formatDuration(row.breakDuration || 0)}
                        onChange={val => updateRow({breakDuration: parseDuration(val)})}
                        clearOnType
                        col="duration"
                        className={`${inputClass} text-center`}
                        navigateOnEnter={false}
                        autoFocus={focusedRowId === row.id}
                        onRowNavigate={onRowNavigate}
                      />
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

  const renderCellContent = (cell: RibbonCell, ci?: number) => {
    const { field, align, prefix, suffix, wrap, id: cellId } = cell;
    const a = align || 'left';
    if (!field) {
      return <td key={cellId} style={{ width: `10%`, padding: '3pt 1pt', verticalAlign: 'top', borderBottom: '1px solid #000' }} />;
    }
    const val = scene ? getFieldValue(field, { ...scene, computedCallTime: row.computedCallTime, estimatedDuration: row.estimatedDuration, sheetNumber: row.shootDay }) : getFieldValueFromSample(field);
    const displayText = `${prefix || ''}${val}${suffix || ''}`;

    if (field === 'intExt') {
      return (
        <td key={cellId} style={{ width: `10%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, textTransform: 'uppercase', borderBottom: '1px solid #000', overflow: 'hidden' }}>
          <SelectDropdown
            value={scene!.intExt}
            onChange={val => updateScene({intExt: val as any})}
            options={['INT', 'EXT', 'INT/EXT']}
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
            options={['DAY', 'NIGHT', 'MORNING', 'EVENING', 'DAWN', 'DUSK']}
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
            renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '—'}</span></>}
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
                const decimal = parsePageCount(val);
                updateScene({ pageCount: formatPageCount(decimal), pageCountDecimal: decimal });
              }}
              className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`}
              readOnly={!textEditingEnabled}
              style={{ fontSize: '8pt', lineHeight: 1.1 }}
            />
          ) : (
            <span className={inputClass} style={{ fontSize: '8pt', lineHeight: 1.1, whiteSpace: wrap ? 'normal' : 'nowrap', overflow: wrap ? 'visible' : 'hidden', textOverflow: wrap ? undefined : 'ellipsis', display: 'block' }}>
              {prefix}{val}{suffix || ' pgs'}
            </span>
          )}
        </td>
      );
    }
    if (field === 'duration') {
      return (
        <td key={cellId} style={{ width: `10%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
          <CellInput
            value={row.estimatedDuration === 0 ? '↑' : formatDuration(row.estimatedDuration || 0)}
            onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
            clearOnType
            col="duration"
            className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`}
            navigateOnEnter={false}
            autoFocus={focusedRowId === row.id}
            onRowNavigate={onRowNavigate}
          />
        </td>
      );
    }
    if (field === 'sceneNumber') {
      return (
        <td key={cellId} style={{ width: `10%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
          <div className="flex items-center gap-px">
            <CellInput
              value={scene!.sceneNumber}
              onChange={val => updateScene({sceneNumber: val})}
              className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`}
              readOnly={!textEditingEnabled}
              style={{ fontSize: '8pt', lineHeight: 1.1 }}
            />
            {violationBadge}
          </div>
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
          <EntityDropdown value={v} onChange={val => updateEntityField(field, val)} items={entityItems} mode={isMultiValue(field, state.present.customCategories) ? 'multi' : 'single'} positioning="fixed" className="text-left w-full text-xs" readOnly={!textEditingEnabled} placeholder={fieldLabels[field] || field} />
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
      if (!seen.has(v)) { items.push({ id: v, name: v }); seen.add(v); }
    }
    return items;
  }, [scenes, state.present.castMembers]);

  const renderCellFlex = (cell: RibbonCell, isLast: boolean, isLastRow: boolean, textColor: string, col?: number, gRow?: number, span?: number) => {
    const { field, align, prefix, suffix, wrap, id: cellId } = cell;
    const a = align || 'left';
    const style: React.CSSProperties = {
      ...cellFlexBase(cell, span),
      textAlign: a as any,
      ...getCellBorderProps(cellBorders, textColor, isLast, isLastRow),
    };
    if (col !== undefined && gRow !== undefined) {
      style.gridColumn = col + 1;
      style.gridRow = span ? `${gRow + 2} / span ${span}` : gRow + 2;
    }
    if (!field) return <div key={cellId} style={style} />;

    const val = scene ? getFieldValue(field, { ...scene, computedCallTime: row.computedCallTime, estimatedDuration: row.estimatedDuration, sheetNumber: row.shootDay }) : getFieldValueFromSample(field);
    const fieldLabel = fieldLabels[field] || field;
    const emptyStyle: React.CSSProperties = { fontStyle: 'italic', opacity: 0.5 };

    if (field === 'intExt') {
      const v = scene!.intExt || '';
      return (
        <div key={cellId} style={style}>
          {textEditingEnabled ? (
            <SelectDropdown value={v} onChange={val => updateScene({intExt: val as any})} options={['INT', 'EXT', 'INT/EXT']} className="text-left w-full" readOnly={!textEditingEnabled} positioning="fixed" placeholder={fieldLabel} />
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
            <SelectDropdown value={v} onChange={val => updateScene({dayNight: val as any})} options={['DAY', 'NIGHT', 'MORNING', 'EVENING', 'DAWN', 'DUSK']} className="text-left w-full" readOnly={!textEditingEnabled} positioning="fixed" placeholder={fieldLabel} />
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
            <EntityDropdown value={v} onChange={val => updateScene({cast: val})} items={castItems} className="text-left w-full" readOnly={!textEditingEnabled} mode="multi" positioning="fixed" placeholder="Cast" displayMode="id" renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '—'}</span></>} />
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
            <CellInput value={scene!.pageCount} suffix="pgs" onChange={val => { const decimal = parsePageCount(val); updateScene({ pageCount: formatPageCount(decimal), pageCountDecimal: decimal }); }} className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`} readOnly={!textEditingEnabled} placeholder={fieldLabel} />
          ) : (
            <RibbonCellText cell={cell} span={span || 1} cellPadding={cellPaddingV} className={inputClass} style={!val ? emptyStyle : undefined}>{val ? displayText : fieldLabel}</RibbonCellText>
          )}
        </div>
      );
    }
    if (field === 'duration') {
      return (
        <div key={cellId} style={style}>
          <CellInput value={row.estimatedDuration === 0 ? '↑' : formatDuration(row.estimatedDuration || 0)} onChange={val => updateRow({estimatedDuration: parseDuration(val)})} clearOnType col="duration" className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`} navigateOnEnter={false} autoFocus={focusedRowId === row.id} onRowNavigate={onRowNavigate} />
        </div>
      );
    }
    if (field === 'sceneNumber') {
      const sv = scene!.sceneNumber || '';
      const displayText = fmt(prefix, sv, suffix);
      return (
        <div key={cellId} style={style}>
          <div className="flex items-center gap-px">
            {textEditingEnabled ? (
              <CellInput value={sv} onChange={val => updateScene({sceneNumber: val})} className={`${inputClass} ${a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'}`} readOnly={!textEditingEnabled} placeholder={fieldLabel} />
            ) : (
              <RibbonCellText cell={cell} span={span || 1} cellPadding={cellPaddingV} className={inputClass} style={!sv ? emptyStyle : undefined}>{sv ? displayText : fieldLabel}</RibbonCellText>
            )}
            {violationBadge}
          </div>
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
            <EntityDropdown value={v} onChange={val => updateScene({[field]: val})} items={entityItems} mode={isMultiValue(field, state.present.customCategories) ? 'multi' : 'single'} positioning="fixed" className="text-left w-full" readOnly={!textEditingEnabled} placeholder={fieldLabel} />
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
    const rowStyle = sceneStyle(scene, state.present.colorPalette?.sceneColors);
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
                    for (let ri = g.rowIndex + 1; ri < g.rowIndex + g.span; ri++) {
                      const cell = ribbon[ri]?.cells[g.colIndex];
                      if (cell) hiddenIds.add(cell.id);
                    }
                  }
                  const items: { cell: RibbonCell; col: number; row: number; span: number }[] = [];
                  for (let ri = 0; ri < ribbon.length; ri++) {
                    for (let ci = 0; ci < ribbon[ri].cells.length; ci++) {
                      const cell = ribbon[ri].cells[ci];
                      if (hiddenIds.has(cell.id)) continue;
                      const g = mgroups.find(gg => gg.colIndex === ci && gg.rowIndex === ri);
                      items.push({ cell, col: ci, row: ri, span: g ? g.span : 1 });
                    }
                  }
                  return items.map(({ cell, col, row, span }) => renderCellFlex(cell, col === ribbon[0].cells.length - 1, row + span - 1 >= ribbon.length - 1, rowStyle.color, col, row, span));
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
                    <div className="flex items-center justify-center gap-px">
                      <CellInput
                        value={scene.sceneNumber}
                        onChange={val => updateScene({sceneNumber: val})}
                        className={`${inputClass} text-center`}
                        readOnly
                      />
                      {violationBadge}
                    </div>
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

    return (
        <div className="flex items-stretch min-w-0">
          <table className="schedule-table flex-1 min-w-0">
            <tbody>
              <tr style={rowStyle}>
                <td className="col-sc relative">
                  <div className="flex items-center justify-center gap-px">
                    <CellInput
                      value={scene.sceneNumber}
                      onChange={val => updateScene({sceneNumber: val})}
                      className={`${inputClass} text-center`}
                      readOnly={!textEditingEnabled}
                    />
                    {violationBadge}
                  </div>
                </td>
                {!isCompact && <td className="col-call">{row.computedCallTime}</td>}
                {!isCompact && <td className="col-dur">
                  <CellInput
                    value={row.estimatedDuration === 0 ? '↑' : formatDuration(row.estimatedDuration || 0)}
                    onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
                    clearOnType
                    col="duration"
                    className={`${inputClass} text-center`}
                    navigateOnEnter={false}
                    autoFocus={focusedRowId === row.id}
                    onRowNavigate={onRowNavigate}
                  />
                </td>}
                <td className="col-ie">
                  <SelectDropdown
                    value={scene.intExt}
                    onChange={val => updateScene({intExt: val as any})}
                    options={['INT', 'EXT', 'INT/EXT']}
                    className="text-left w-full"
                    readOnly={!textEditingEnabled}
                  />
                </td>
                <td className="col-set">
                  <EntityDropdown
                    value={scene.set}
                    onChange={val => updateEntityField('set', val)}
                    items={entityItemsMap['set'] || []}
                    mode="single"
                    positioning="fixed"
                    className="text-left w-full uppercase text-xs"
                    readOnly={!textEditingEnabled}
                    placeholder={fieldLabels['set'] || 'Set'}
                  />
                </td>
                <td className="col-dn">
                  <SelectDropdown
                    value={scene.dayNight}
                    onChange={val => updateScene({dayNight: val as any})}
                    options={['DAY', 'NIGHT', 'MORNING', 'EVENING', 'DAWN', 'DUSK']}
                    className="text-left w-full"
                    readOnly={!textEditingEnabled}
                  />
                </td>
                <td className="col-cast">
                  <EntityDropdown
                    value={scene.cast}
                    onChange={val => updateScene({cast: val})}
                    className="text-left w-full text-xs"
                    readOnly={!textEditingEnabled}
                    mode="multi"
                    positioning="fixed"
                    placeholder="Cast"
                    displayMode="id"
                    renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '—'}</span></>}
                  />
                </td>
                <td className="col-pgs">
                  <CellInput
                    value={scene.pageCount}
                    suffix="pgs"
                    onChange={val => {
                      const decimal = parsePageCount(val);
                      updateScene({ pageCount: formatPageCount(decimal), pageCountDecimal: decimal });
                    }}
                    className={`${inputClass} text-left`}
                    readOnly={!textEditingEnabled}
                  />
                </td>
              </tr>
              <tr style={rowStyle}>
                <td className="col-sc" />
                {!isCompact && <td className="col-call" />}
                {!isCompact && <td className="col-dur" />}
                <td colSpan={5} className="col-desc">
                  <CellInput
                    value={scene.description}
                    onChange={val => updateScene({description: val})}
                    className={`${inputClass} text-left`}
                    readOnly={!textEditingEnabled}
                    placeholder="Scene Description"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
    );
  }

  return null;
}, sortableRowPropsEqual);

export const SortableRow: React.FC<{
  row: ScheduleRow & { computedCallTime?: string, computedElapsed?: number },
  scenes: Scene[],
  isOverlay?: boolean,
  isSelected?: boolean,
  isFaded?: boolean,
  onSelectToggle?: (e: React.MouseEvent) => void,
  isCompact?: boolean,
  textEditingEnabled?: boolean,
  sceneViolations?: string[],
  focusedRowId?: string | null,
  onDoubleClick?: (id: string) => void,
  onRowNavigate?: (rowId: string) => void,
  ribbon?: RibbonRow[],
  colWidths?: number[],
  cellPaddingV?: number,
  cellPaddingH?: number,
  edgePadding?: number,
  cellBorders?: CellBorders,
}> = ({ row, scenes, isOverlay, isSelected, isFaded, onSelectToggle, isCompact, textEditingEnabled, sceneViolations, focusedRowId, onDoubleClick, onRowNavigate, ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding, cellBorders }) => {
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
    data: { type: 'ROW', row }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.3 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(ctrlOrCmdHeld ? {} : listeners)}
      {...attributes}
      onClick={onSelectToggle}
      onDoubleClick={() => onDoubleClick?.(row.id)}
      data-row-id={row.id}
      data-shoot-day={row.shootDay}
      className={`group relative transition-colors shrink-0 outline-none border-b-[2px] border-black ${isOverlay ? 'scale-[1.02] shadow-2xl cursor-grabbing ring-2 ring-black' : ''} ${isSelected && !isFaded ? 'shadow-[4px_0_0_0_#000000,-4px_0_0_0_#000000,0_2px_0_0_#000000,0_-2px_0_0_#000000] z-10' : ''} ${isFaded ? 'opacity-30' : ''} ${!textEditingEnabled && !isOverlay ? 'cursor-grab' : ''}`}
    >
      <SortableRowContent
        row={row}
        scenes={scenes}
        isSelected={isSelected}
        isFaded={isFaded}
        isCompact={isCompact}
        textEditingEnabled={textEditingEnabled}
        sceneViolations={sceneViolations}
        focusedRowId={focusedRowId}
        onRowNavigate={onRowNavigate}
        ribbon={ribbon}
        colWidths={colWidths}
        cellPaddingV={cellPaddingV}
        cellPaddingH={cellPaddingH}
        edgePadding={edgePadding}
        cellBorders={cellBorders}
      />
    </div>
  );
};
