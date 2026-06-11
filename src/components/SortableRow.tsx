import React, { useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Scene, ScheduleRow, RibbonRow } from '../types';
import { formatDuration, parseDuration, parsePageCount, formatPageCount } from '../lib/utils';
import { getFieldValue, getFieldValueFromSample, FIELD_MAP } from '../lib/ribbonUtils';
import { useProject } from '../store';
import { CellInput } from './CellInput';
import { Tooltip } from './Tooltip';
import { Flag } from 'lucide-react';
import { useAddMode } from '../lib/useMarquee';
import { EntityDropdown } from './EntityDropdown';
import { SelectDropdown } from './SelectDropdown';
import { SCENE_RIBBON_DEFAULTS } from '../types';

const ENTITY_KEYS = new Set([
  'cast', 'set', 'extras', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup',
  'sfx', 'vfx', 'sound', 'music', 'animals', 'weapons', 'greenery', 'artDept',
]);

function sceneStyle(scene?: Scene | null): React.CSSProperties {
  if (!scene) return { background: '#ffffff', color: '#18181b' };
  const intExt = (scene.intExt || '').toUpperCase();
  const dayNight = (scene.dayNight || '').toUpperCase();
  if (intExt.includes('INT') && dayNight.includes('DAY')) return { background: '#ffffff', color: '#464646' };
  if (intExt.includes('EXT') && dayNight.includes('DAY')) return { background: '#bdd857', color: '#000000' };
  if (intExt.includes('INT') && dayNight.includes('NIGHT')) return { background: '#67832e', color: '#f2fce3' };
  if (intExt.includes('EXT') && dayNight.includes('NIGHT')) return { background: '#2148a7', color: '#ffffff' };
  if (intExt.includes('INT') && dayNight.includes('MORNING')) return { background: '#efbea0', color: '#4a3730' };
  if (intExt.includes('EXT') && dayNight.includes('MORNING')) return { background: '#e88aa5', color: '#ffffff' };
  if (intExt.includes('INT') && dayNight.includes('EVENING')) return { background: '#e29926', color: '#000000' };
  if (intExt.includes('EXT') && dayNight.includes('EVENING')) return { background: '#ce7d21', color: '#000000' };
  return { background: '#ffffff', color: '#18181b' };
}

function darkenHex(hex: string): string {
  const r = Math.round(parseInt(hex.slice(1,3),16) * 0.9).toString(16).padStart(2,'0');
  const g = Math.round(parseInt(hex.slice(3,5),16) * 0.9).toString(16).padStart(2,'0');
  const b = Math.round(parseInt(hex.slice(5,7),16) * 0.9).toString(16).padStart(2,'0');
  return `#${r}${g}${b}`;
}

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
}> = ({ row, scenes, isOverlay, isSelected, isFaded, onSelectToggle, isCompact, textEditingEnabled, sceneViolations, focusedRowId, onDoubleClick, onRowNavigate, ribbon }) => {
  const { state, dispatch } = useProject();
  const activeVersionId = state.present.activeVersionId;
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
        if (key === 'set') continue;
        const existing = state.present.breakdownElements?.[key] || [];
        const existingNames = new Set(existing.map(e => (e.name || e.id).toUpperCase()));
        const items = val.split(',').map((x: string) => x.trim()).filter(Boolean);
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.3 : undefined,
  };

  const isFocused = focusedRowId === row.id;
  const commonProps = {
    ref: setNodeRef,
    style,
    ...(ctrlOrCmdHeld ? {} : listeners),
    ...attributes,
    onClick: onSelectToggle,
    onDoubleClick: () => onDoubleClick?.(row.id),
    'data-row-id': row.id,
    'data-shoot-day': row.shootDay,
    className: `group relative transition-colors shrink-0 outline-none border-b-[2px] border-black ${isFocused ? 'border-l-[4px] border-l-blue-500' : ''} ${isOverlay ? 'scale-[1.02] shadow-2xl cursor-grabbing ring-2 ring-black' : ''} ${isSelected && !isFaded ? 'shadow-[4px_0_0_0_#000000,-4px_0_0_0_#000000,0_2px_0_0_#000000,0_-2px_0_0_#000000] z-10' : ''} ${isFaded ? 'opacity-30' : ''} ${!textEditingEnabled && !isOverlay ? 'cursor-grab' : ''}`
  };

  const inputClass = "text-inherit placeholder:text-inherit placeholder:opacity-50 bg-transparent w-full h-full outline-none";

  const ribbonRowCount = ribbon?.length || 2;
  const noteBreakPad = Math.max(6, ribbonRowCount * 12 - 6);
  const noteBreakPadPx = `${noteBreakPad}px 6px`;
  const noteBreakPadPt = `${noteBreakPad}pt 6pt`;

  const hasViolations = sceneViolations && sceneViolations.length > 0;
  const violationBadge = hasViolations ? (
    <Tooltip content={sceneViolations.join('\n• ')}>
      <span className="inline-flex items-center text-red-500 ml-0.5">
        <Flag className="w-2.5 h-2.5 fill-red-500 text-red-500" />
      </span>
    </Tooltip>
  ) : null;

  const fmt = (prefix: string | undefined, val: string, suffix: string | undefined) =>
    `${prefix || ''}${prefix && val ? '\u00A0' : ''}${val}${suffix && val ? '\u00A0' : ''}${suffix || ''}`;

  if (row.type === 'NOTE') {
    const noteStyle: React.CSSProperties = { background: row.noteColor || '#591b1b', color: row.noteTextColor || '#ffffff' };
    if (isSelected && !isFaded) noteStyle.background = darkenHex(noteStyle.background as string);

    if (ribbon && ribbon.length > 0 && !isCompact) {
      const cells = ribbon[0].cells;
      const nonSpecial = cells
        .map((c, i) => ({i, w: c.width, f: c.field}))
        .filter(x => x.f !== 'duration' && x.f !== 'callTime');
      const mainCellIdx = nonSpecial.length > 0
        ? nonSpecial.reduce((a, b) => a.w >= b.w ? a : b).i
        : cells.map((c, i) => ({i, w: c.width})).reduce((a, b) => a.w >= b.w ? a : b, {i: 0, w: 0}).i;

      return (
        <div {...commonProps}>
          <div className="flex items-stretch min-w-0" style={noteStyle}>
            {cells.map((cell, ci) => {
              const wrapCell = ci === mainCellIdx;
              const cellStyle: React.CSSProperties = {
                flex: `0 0 ${cell.width}%`,
                textAlign: wrapCell ? 'center' : cell.align || 'left',
                padding: noteBreakPadPx,
                overflow: wrapCell ? 'visible' : 'hidden',
                whiteSpace: wrapCell ? 'normal' : 'nowrap',
                textOverflow: wrapCell ? undefined : 'ellipsis',
                wordBreak: wrapCell ? 'break-word' : undefined,
                fontSize: '8pt',
                lineHeight: 1.1,
                fontFamily: 'Helvetica, sans-serif',
              };
              if (wrapCell) {
                return (
                  <div key={cell.id} style={cellStyle}>
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
                  <div key={cell.id} style={cellStyle}>
                    <CellInput
                      value={row.estimatedDuration === 0 || !row.estimatedDuration ? '' : formatDuration(row.estimatedDuration || 0)}
                      onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
                      clearOnType
                      col="duration"
                      className={`${inputClass} ${cell.align === 'center' ? 'text-center' : cell.align === 'right' ? 'text-right' : 'text-left'}`}
                      navigateOnEnter={false}
                      onRowNavigate={onRowNavigate}
                    />
                  </div>
                );
              }
              if (cell.field === 'callTime') {
                const v = row.computedCallTime || '';
                return <div key={cell.id} style={cellStyle}>{v ? fmt(cell.prefix, v, cell.suffix) : ''}</div>;
              }
              return <div key={cell.id} style={cellStyle} />;
            })}
          </div>
        </div>
      );
    }

    return (
      <div {...commonProps}>
        <div className="flex items-stretch min-w-0">
          <table className="schedule-table flex-1 min-w-0">
            <tbody>
              <tr className="row-note" style={noteStyle}>
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
      </div>
    );
  }

  if (row.type === 'BREAK') {
    const breakStyle: React.CSSProperties = { background: '#591b1b', color: '#ffffff' };
    if (isSelected && !isFaded) breakStyle.background = darkenHex(breakStyle.background as string);

    if (ribbon && ribbon.length > 0 && !isCompact) {
      const cells = ribbon[0].cells;
      const nonSpecial = cells
        .map((c, i) => ({i, w: c.width, f: c.field}))
        .filter(x => x.f !== 'duration' && x.f !== 'callTime');
      const mainCellIdx = nonSpecial.length > 0
        ? nonSpecial.reduce((a, b) => a.w >= b.w ? a : b).i
        : cells.map((c, i) => ({i, w: c.width})).reduce((a, b) => a.w >= b.w ? a : b, {i: 0, w: 0}).i;

      return (
        <div {...commonProps}>
          <div className="flex items-stretch min-w-0" style={breakStyle}>
            {cells.map((cell, ci) => {
              const wrapCell = ci === mainCellIdx;
              const cellStyle: React.CSSProperties = {
                flex: `0 0 ${cell.width}%`,
                textAlign: wrapCell ? 'center' : cell.align || 'left',
                padding: noteBreakPadPx,
                overflow: wrapCell ? 'visible' : 'hidden',
                whiteSpace: wrapCell ? 'normal' : 'nowrap',
                textOverflow: wrapCell ? undefined : 'ellipsis',
                wordBreak: wrapCell ? 'break-word' : undefined,
                fontSize: '8pt',
                lineHeight: 1.1,
                fontFamily: 'Helvetica, sans-serif',
              };
              if (wrapCell) {
                return (
                  <div key={cell.id} style={cellStyle}>
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
                  <div key={cell.id} style={cellStyle}>
                    <CellInput
                      value={formatDuration(row.breakDuration || 0)}
                      onChange={val => updateRow({breakDuration: parseDuration(val)})}
                      clearOnType
                      col="duration"
                      className={`${inputClass} ${cell.align === 'center' ? 'text-center' : cell.align === 'right' ? 'text-right' : 'text-left'}`}
                      navigateOnEnter={false}
                      onRowNavigate={onRowNavigate}
                    />
                  </div>
                );
              }
              if (cell.field === 'callTime') {
                const v = row.computedCallTime || '';
                return <div key={cell.id} style={cellStyle}>{v ? fmt(cell.prefix, v, cell.suffix) : ''}</div>;
              }
              return <div key={cell.id} style={cellStyle} />;
            })}
          </div>
        </div>
      );
    }

    return (
      <div {...commonProps}>
        <div className="flex items-stretch min-w-0">
          <table className="schedule-table flex-1 min-w-0">
            <tbody>
              <tr className="row-break" style={breakStyle}>
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
      </div>
    );
  }

  const renderCellContent = (cell: import('../types').RibbonCell) => {
    const { field, width: cellWidth, align, prefix, suffix, wrap, id: cellId } = cell;
    const a = align || 'left';
    if (!field) {
      return <td key={cellId} style={{ width: `${cellWidth}%`, padding: '3pt 1pt', verticalAlign: 'top', borderBottom: '1px solid #000' }} />;
    }
    const val = scene ? getFieldValue(field, { ...scene, computedCallTime: row.computedCallTime, estimatedDuration: row.estimatedDuration }) : getFieldValueFromSample(field);
    const displayText = `${prefix || ''}${val}${suffix || ''}`;

    if (field === 'intExt') {
      return (
        <td key={cellId} style={{ width: `${cellWidth}%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, textTransform: 'uppercase', borderBottom: '1px solid #000', overflow: 'hidden' }}>
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
        <td key={cellId} style={{ width: `${cellWidth}%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, textTransform: 'uppercase', borderBottom: '1px solid #000', overflow: 'hidden' }}>
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
        <td key={cellId} style={{ width: `${cellWidth}%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
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
        <td key={cellId} style={{ width: `${cellWidth}%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
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
        <td key={cellId} style={{ width: `${cellWidth}%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
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
        <td key={cellId} style={{ width: `${cellWidth}%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
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
        <td key={cellId} style={{ width: `${cellWidth}%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
          <span style={{ fontSize: '8pt', lineHeight: 1.1, whiteSpace: wrap ? 'normal' : 'nowrap' }}>{cell.textContent || ''}</span>
        </td>
      );
    }
    if (scene && ENTITY_FIELDS.has(field)) {
      const v = ((scene as any)[field] as string) || '';
      const entityItems = entityItemsMap[field] || [];
      return (
        <td key={cellId} style={{ width: `${cellWidth}%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
          <EntityDropdown value={v} onChange={val => updateEntityField(field, val)} items={entityItems} mode="select" positioning="fixed" className="text-left w-full text-xs" readOnly={!textEditingEnabled} placeholder={fieldLabels[field] || field} />
        </td>
      );
    }
    // Generic text field (description, notes, props, etc.)
    return (
      <td key={cellId} style={{ width: `${cellWidth}%`, padding: '3pt 1pt', verticalAlign: 'top', textAlign: a as any, borderBottom: '1px solid #000', overflow: 'hidden' }}>
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

  const cellFlexBase = (cell: import('../types').RibbonCell): React.CSSProperties => ({
    flex: `0 0 ${cell.width}%`,
    minWidth: 0,
    padding: '6px 6px',
    overflow: cell.wrap ? 'visible' : 'hidden',
    textOverflow: cell.wrap ? undefined : 'ellipsis',
    whiteSpace: cell.wrap ? 'normal' : 'nowrap',
    wordBreak: cell.wrap ? 'break-word' : undefined,
    textTransform: cell.field === 'set' ? 'uppercase' : 'none',
    fontWeight: 500,
    fontSize: '8pt',
    lineHeight: 1.1,
    fontFamily: 'Helvetica, sans-serif',
  });

  const ENTITY_FIELDS = useMemo(() => new Set([
    'set', 'extras', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup', 'sfx', 'vfx', 'sound', 'music', 'animals', 'weapons', 'greenery', 'artDept',
    ...(state.present.customCategories || []).map(c => c.key),
  ]), [state.present.customCategories]);

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

  const renderCellFlex = (cell: import('../types').RibbonCell, isLast: boolean) => {
    const { field, align, prefix, suffix, wrap, id: cellId } = cell;
    const a = align || 'left';
    const style: React.CSSProperties = {
      ...cellFlexBase(cell),
      textAlign: a as any,
    };
    if (!field) return <div key={cellId} style={style} />;

    const val = scene ? getFieldValue(field, { ...scene, computedCallTime: row.computedCallTime, estimatedDuration: row.estimatedDuration }) : getFieldValueFromSample(field);
    const fieldLabel = fieldLabels[field] || field;
    const emptyStyle: React.CSSProperties = { fontStyle: 'italic', opacity: 0.5 };

    if (field === 'intExt') {
      const v = scene!.intExt || '';
      return (
        <div key={cellId} style={style}>
          {textEditingEnabled ? (
            <SelectDropdown value={v} onChange={val => updateScene({intExt: val as any})} options={['INT', 'EXT', 'INT/EXT']} className="text-left w-full" readOnly={!textEditingEnabled} positioning="fixed" placeholder={fieldLabel} />
          ) : (
            <span style={{ display: 'block', fontSize: '8pt', lineHeight: 1.1, ...(!v ? emptyStyle : {}) }}>{v ? fmt(prefix, v, suffix) : fieldLabel}</span>
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
            <span style={{ display: 'block', fontSize: '8pt', lineHeight: 1.1, ...(!v ? emptyStyle : {}) }}>{v ? fmt(prefix, v, suffix) : fieldLabel}</span>
          )}
        </div>
      );
    }
    if (field === 'cast') {
      const v = scene!.cast || '';
      return (
        <div key={cellId} style={style}>
          {textEditingEnabled ? (
            <EntityDropdown value={v} onChange={val => updateScene({cast: val})} items={castItems} className="text-left w-full text-xs" readOnly={!textEditingEnabled} mode="multi" positioning="fixed" placeholder="Cast" displayMode="id" renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '—'}</span></>} />
          ) : (
            <span style={{ display: 'block', fontSize: '8pt', lineHeight: 1.1, ...(!v ? emptyStyle : {}) }}>{v ? fmt(prefix, v, suffix) : fieldLabel}</span>
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
            <span className={inputClass} style={{ fontSize: '8pt', lineHeight: 1.1, whiteSpace: wrap ? 'normal' : 'nowrap', overflow: wrap ? 'visible' : 'hidden', textOverflow: wrap ? undefined : 'ellipsis', display: 'block', ...(!val ? emptyStyle : {}) }}>{val ? displayText : fieldLabel}</span>
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
              <span className={inputClass} style={{ display: 'block', fontSize: '8pt', lineHeight: 1.1, ...(!sv ? emptyStyle : {}) }}>{sv ? displayText : fieldLabel}</span>
            )}
            {violationBadge}
          </div>
        </div>
      );
    }
    if (field === 'text') {
      return (
        <div key={cellId} style={style}>
          <span style={{ fontSize: '8pt', lineHeight: 1.1, whiteSpace: wrap ? 'normal' : 'nowrap' }}>{cell.textContent || ''}</span>
        </div>
      );
    }
    if (field === 'callTime') {
      return (
        <div key={cellId} style={style}>
          <span style={{ display: 'block', fontSize: '8pt', lineHeight: 1.1 }}>{fmt(prefix, val, suffix)}</span>
        </div>
      );
    }
    if (scene && ENTITY_FIELDS.has(field)) {
      const v = ((scene as any)[field] as string) || '';
      const entityItems = entityItemsMap[field] || [];
      return (
        <div key={cellId} style={style}>
          {textEditingEnabled ? (
            <EntityDropdown value={v} onChange={val => updateScene({[field]: val})} items={entityItems} mode="select" positioning="fixed" className="text-left w-full text-xs" readOnly={!textEditingEnabled} placeholder={fieldLabel} />
          ) : (
            <span style={{ display: 'block', fontSize: '8pt', lineHeight: 1.1, ...(!v ? emptyStyle : {}) }}>{v ? fmt(prefix, v, suffix) : fieldLabel}</span>
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
          <span style={{ display: 'block', fontSize: '8pt', lineHeight: 1.1, ...(!val ? emptyStyle : {}) }}>{val ? displayText : fieldLabel}</span>
        )}
      </div>
    );
  };

  if (scene) {
    const rowStyle = sceneStyle(scene);
    if (isSelected && !isFaded) {
      rowStyle.background = darkenHex(rowStyle.background as string);
    }

    // ── Ribbon-based rendering (non-compact) ──
    if (ribbon && ribbon.length > 0 && !isCompact) {
      return (
        <div {...commonProps}>
          <div className="flex items-stretch min-w-0">
            <div className="flex-1 min-w-0 flex flex-col" style={rowStyle}>
              {ribbon.map((row, ri) => (
                <div key={row.id || ri} className="flex w-full min-h-0">
                  {row.cells.map((c, ci) => renderCellFlex(c, ci === row.cells.length - 1))}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (isCompact) {
      return (
        <div {...commonProps}>
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
                const breakdownKeys = ['props', 'wardrobe', 'makeup', 'extras', 'stunts', 'vehicles', 'sfx', 'vfx', 'sound', 'music', 'animals', 'weapons', 'greenery', 'artDept', 'notes'];
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
        </div>
      );
    }

    return (
      <div {...commonProps}>
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
                    mode="select"
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
      </div>
    );
  }

  return null;
};
