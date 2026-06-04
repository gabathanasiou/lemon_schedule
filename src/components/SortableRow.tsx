import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Scene, ScheduleRow } from '../types';
import { formatDuration, parseDuration, parsePageCount, formatPageCount } from '../lib/utils';
import { useProject } from '../store';
import { CellInput } from './CellInput';
import { Tooltip } from './Tooltip';
import { Flag } from 'lucide-react';

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

export const SortableRow: React.FC<{ 
  row: ScheduleRow & { computedCallTime?: string, computedElapsed?: number }, 
  scenes: Scene[], 
  isOverlay?: boolean,
  isSelected?: boolean,
  onSelectToggle?: (e: React.MouseEvent) => void,
  isCompact?: boolean,
  textEditingEnabled?: boolean,
  sceneViolations?: string[],
}> = ({ row, scenes, isOverlay, isSelected, onSelectToggle, isCompact, textEditingEnabled, sceneViolations }) => {
  const { state, dispatch } = useProject();
  const activeVersionId = state.present.activeVersionId;

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
    dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, ...updates } });
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.3 : 1,
  };

  const commonProps = {
    ref: setNodeRef,
    style,
    onClick: onSelectToggle,
    ...listeners,
    ...attributes,
    'data-row-id': row.id,
    'data-shoot-day': row.shootDay,
    className: `group relative transition-colors shrink-0 ${isOverlay ? 'scale-[1.02] shadow-2xl cursor-grabbing ring-2 ring-black' : ''} ${isSelected ? 'ring-2 ring-blue-500 z-50' : ''} ${!textEditingEnabled && !isOverlay ? 'cursor-grab' : ''}`
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
    const noteStyle: React.CSSProperties = { background: '#591b1b', color: '#ffffff' };
    return (
      <div {...commonProps}>
        <div className="flex items-stretch">
          <table className="schedule-table flex-1">
            <tbody>
              <tr className="row-note" style={noteStyle}>
                <td className="col-sc" />
                {!isCompact ? (
                  <>
                    <td className="col-call">{row.computedCallTime}</td>
                    <td className="col-dur">
                      <CellInput
                        value={row.estimatedDuration === 0 || !row.estimatedDuration ? '--' : formatDuration(row.estimatedDuration || 0)}
                        onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
                        clearOnType
                        col="duration"
                        className={`${inputClass} text-center`}
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
                  </>
                ) : (
                  <td colSpan={3} className="col-set" style={{textAlign: 'center'}}>
                    <CellInput
                      value={row.noteText || ''}
                      onChange={val => updateRow({noteText: val.toUpperCase()})}
                      className={`${inputClass} text-center`}
                      placeholder="Enter note here..."
                      multiline
                    />
                  </td>
                )}
                <td className="col-pgs" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (row.type === 'BREAK') {
    const breakStyle: React.CSSProperties = { background: '#591b1b', color: '#ffffff' };
    return (
      <div {...commonProps}>
        <div className="flex items-stretch">
          <table className="schedule-table flex-1">
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
                  </>
                ) : (
                  <td colSpan={3} className="col-set" style={{textAlign: 'center'}}>
                    <CellInput
                      value={row.breakLabel || ''}
                      onChange={val => updateRow({breakLabel: val.toUpperCase()})}
                      className={`${inputClass} text-center`}
                      placeholder="ENTER BREAK TEXT"
                    />
                  </td>
                )}
                <td className="col-pgs" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (scene) {
    const rowStyle = sceneStyle(scene);
    const borderStyle = { ...rowStyle, borderBottom: '0.5px solid rgba(0,0,0,0.1)' };

    if (isCompact) {
      return (
        <div {...commonProps}>
          <div className="flex items-stretch">
          <table className="schedule-table flex-1">
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
                  {textEditingEnabled ? (
                    <>
                      <td className="col-ie">
                        <select value={scene.intExt} onChange={e => updateScene({intExt: e.target.value as any})} className="bg-transparent outline-none uppercase text-inherit cursor-pointer w-full">
                          <option value="INT">INT</option>
                          <option value="EXT">EXT</option>
                          <option value="INT/EXT">INT/EXT</option>
                        </select>
                      </td>
                      <td className="col-set">
                        <CellInput value={scene.set} onChange={val => updateScene({set: val})} className={`${inputClass} uppercase block`} />
                        <CellInput value={scene.description} onChange={val => updateScene({description: val})} className={`${inputClass} opacity-60 block`} placeholder="Scene Description" />
                      </td>
                      <td className="col-dn">
                        <select value={scene.dayNight} onChange={e => updateScene({dayNight: e.target.value as any})} className="bg-transparent outline-none uppercase text-inherit cursor-pointer w-full">
                          <option value="DAY">DAY</option>
                          <option value="NIGHT">NIGHT</option>
                          <option value="MORNING">MORNING</option>
                          <option value="EVENING">EVENING</option>
                          <option value="DAWN">DAWN</option>
                          <option value="DUSK">DUSK</option>
                        </select>
                      </td>
                    </>
                  ) : (
                    <td colSpan={3} className="col-set">
                      <span className="uppercase truncate block">{scene.intExt}. {scene.set} - {scene.dayNight}</span>
                      {scene.description && <span className="opacity-60 truncate block">{scene.description}</span>}
                    </td>
                  )}
                  <td className="col-cast">
                    {textEditingEnabled ? (
                      <CellInput value={scene.cast} onChange={val => updateScene({cast: val})} className={`${inputClass} text-right`} placeholder="Cast" />
                    ) : (
                      <span>{scene.cast || '—'}</span>
                    )}
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
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return (
      <div {...commonProps}>
        <div className="flex items-stretch">
          <table className="schedule-table flex-1">
            <tbody>
              <tr style={borderStyle}>
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
                  />
                </td>}
                <td className="col-ie">
                  {textEditingEnabled ? (
                    <select value={scene.intExt} onChange={e => updateScene({intExt: e.target.value as any})} className="bg-transparent outline-none uppercase text-inherit cursor-pointer text-center w-full">
                      <option value="INT">INT</option>
                      <option value="EXT">EXT</option>
                      <option value="INT/EXT">INT/EXT</option>
                    </select>
                  ) : (
                    <CellInput
                      value={scene.intExt}
                      onChange={val => updateScene({intExt: val as any})}
                      className={`${inputClass} text-left`}
                      readOnly
                    />
                  )}
                </td>
                <td className="col-set">
                  <CellInput
                    value={scene.set}
                    onChange={val => updateScene({set: val})}
                    className={`${inputClass} text-left uppercase`}
                    readOnly={!textEditingEnabled}
                  />
                </td>
                <td className="col-dn">
                  {textEditingEnabled ? (
                    <select value={scene.dayNight} onChange={e => updateScene({dayNight: e.target.value as any})} className="bg-transparent outline-none uppercase text-inherit cursor-pointer text-center w-full">
                      <option value="DAY">DAY</option>
                      <option value="NIGHT">NIGHT</option>
                      <option value="MORNING">MORNING</option>
                      <option value="EVENING">EVENING</option>
                      <option value="DAWN">DAWN</option>
                      <option value="DUSK">DUSK</option>
                    </select>
                  ) : (
                    <CellInput
                      value={scene.dayNight}
                      onChange={val => updateScene({dayNight: val as any})}
                      className={`${inputClass} text-left`}
                      readOnly
                    />
                  )}
                </td>
                <td className="col-cast">
                  <CellInput
                    value={scene.cast}
                    onChange={val => updateScene({cast: val})}
                    className={`${inputClass} text-right`}
                    placeholder="Cast"
                    readOnly={!textEditingEnabled}
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
