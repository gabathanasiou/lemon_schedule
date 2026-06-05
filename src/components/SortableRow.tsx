import React, { useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Scene, ScheduleRow } from '../types';
import { formatDuration, parseDuration, parsePageCount, formatPageCount } from '../lib/utils';
import { useProject } from '../store';
import { CellInput } from './CellInput';
import { Tooltip } from './Tooltip';
import { Flag } from 'lucide-react';
import { useAddMode } from '../lib/useMarquee';
import { EntityDropdown } from './EntityDropdown';
import { SelectDropdown } from './SelectDropdown';
import { AutocompleteDropdown } from './AutocompleteDropdown';

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
}> = ({ row, scenes, isOverlay, isSelected, isFaded, onSelectToggle, isCompact, textEditingEnabled, sceneViolations, focusedRowId, onDoubleClick, onRowNavigate }) => {
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

  const setOptions = useMemo(() => {
    const sets = new Set(scenes.map(s => s.set.toUpperCase()).filter(Boolean));
    return [...sets].sort();
  }, [scenes]);

  const updateRow = (updates: Partial<ScheduleRow>) => {
    if (!activeVersionId) return;
    const version = state.present.versions.find(v => v.id === activeVersionId);
    if (!version) return;
    const newRows = version.rows.map(r => r.id === row.id ? { ...r, ...updates } : r);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersionId, rows: newRows } });
  };

  const updateScene = (updates: Partial<Scene>) => {
    if (!scene) return;
    dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, ...updates } });
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.3 : undefined,
  };

  const commonProps = {
    ref: setNodeRef,
    style,
    ...(ctrlOrCmdHeld ? {} : listeners),
    ...attributes,
    onClick: onSelectToggle,
    onDoubleClick: () => onDoubleClick?.(row.id),
    'data-row-id': row.id,
    'data-shoot-day': row.shootDay,
    className: `group relative transition-colors shrink-0 outline-none border-b-[2px] border-black ${isOverlay ? 'scale-[1.02] shadow-2xl cursor-grabbing ring-2 ring-black' : ''} ${isSelected && !isFaded ? 'shadow-[4px_0_0_0_#000000,-4px_0_0_0_#000000,0_2px_0_0_#000000,0_-2px_0_0_#000000] z-10' : ''} ${isFaded ? 'opacity-30' : ''} ${!textEditingEnabled && !isOverlay ? 'cursor-grab' : ''}`
  };

  const inputClass = "text-inherit placeholder:text-inherit placeholder:opacity-50 bg-transparent w-full h-full outline-none";

  const hasViolations = sceneViolations && sceneViolations.length > 0;
  const violationBadge = hasViolations ? (
    <Tooltip content={sceneViolations.join('\n• ')}>
      <span className="inline-flex items-center text-red-500 ml-0.5">
        <Flag className="w-2.5 h-2.5 fill-red-500 text-red-500" />
      </span>
    </Tooltip>
  ) : null;

  if (row.type === 'NOTE') {
    const noteStyle: React.CSSProperties = { background: row.noteColor || '#591b1b', color: row.noteTextColor || '#ffffff' };
    if (isSelected && !isFaded) noteStyle.background = darkenHex(noteStyle.background as string);
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

  if (scene) {
    const rowStyle = sceneStyle(scene);
    if (isSelected && !isFaded) {
      rowStyle.background = darkenHex(rowStyle.background as string);
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
                  <AutocompleteDropdown
                    value={scene.set}
                    onChange={val => updateScene({set: val})}
                    options={setOptions}
                    className="text-left w-full"
                    readOnly={!textEditingEnabled}
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
                    className="text-right w-full text-xs"
                    readOnly={!textEditingEnabled}
                    mode="multi"
                    positioning="fixed"
                    placeholder="Cast"
                    displayMode="id"
                    renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name || '—'}</span></>}
                  />
                </td>
                <td className="col-pgs">
                  <CellInput
                    value={scene.pageCount}
                    onChange={val => {
                      const decimal = parsePageCount(val);
                      updateScene({ pageCount: formatPageCount(decimal), pageCountDecimal: decimal });
                    }}
                    className={`${inputClass} text-center`}
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
