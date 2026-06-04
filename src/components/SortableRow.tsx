import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Scene, ScheduleRow, CastMember } from '../types';
import { formatDuration, parseDuration, parsePageCount, formatPageCount } from '../lib/utils';
import { useProject } from '../store';
import { CellInput } from './CellInput';
import { Tooltip } from './Tooltip';
import { Flag } from 'lucide-react';
import { useAddMode } from '../lib/useMarquee';

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

const DD_ITEM = (active: boolean) => `px-2 py-1 text-xs rounded cursor-pointer font-[Helvetica,Arial,sans-serif] font-normal transition-colors ${active ? 'bg-blue-50 text-blue-700' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`;
const DD_CONTAINER = "absolute top-full z-[100] bg-white border border-zinc-200 rounded-lg shadow-lg p-1 max-h-48 overflow-y-auto mt-1";

type CloseRef = React.MutableRefObject<(() => void) | null>;
const globalDropdownCloseRef: CloseRef = { current: null };

function useDropdown(open: boolean, ref: React.RefObject<HTMLDivElement>, onClose?: () => void) {
  useEffect(() => {
    if (open) {
      globalDropdownCloseRef.current = () => onClose?.();
      const onClick = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          onClose?.();
        }
      };
      document.addEventListener('mousedown', onClick);
      return () => {
        document.removeEventListener('mousedown', onClick);
        globalDropdownCloseRef.current = undefined;
      };
    }
  }, [open, ref, onClose]);
}

function useOpenHandler(setOpen: (v: boolean) => void) {
  return useCallback(() => {
    globalDropdownCloseRef.current?.();
    setOpen(true);
  }, [setOpen]);
}

function sortCastMembers(list: CastMember[], currentIds: string[]) {
  return [...list].sort((a, b) => {
    const aSel = currentIds.includes(a.id);
    const bSel = currentIds.includes(b.id);
    if (aSel !== bSel) return aSel ? -1 : 1;
    const na = parseInt(a.id, 10);
    const nb = parseInt(b.id, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}

const CastCellInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  className?: string;
  readOnly?: boolean;
}> = ({ value, onChange, className, readOnly }) => {
  const { state } = useProject();
  const castMembers = state.present.castMembers || [];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [localIds, setLocalIds] = useState<string[]>(() =>
    (value || '').split(',').map(x => x.trim()).filter(Boolean)
  );
  const ref = useRef<HTMLDivElement>(null);

  const handleOpen = useOpenHandler(setOpen);

  useDropdown(open, ref, () => {
    onChange(localIds.join(', '));
    setOpen(false);
    setQuery('');
  });

  const add = useCallback((id: string) => {
    setLocalIds(prev => {
      const ids = [...prev];
      const idx = ids.indexOf(id);
      if (idx >= 0) ids.splice(idx, 1);
      else ids.push(id);
      return ids;
    });
    setQuery('');
  }, []);

  const commit = () => {
    onChange(localIds.join(', '));
    setOpen(false);
    setQuery('');
  };

  const filtered = castMembers.filter(m =>
    !query || m.id.toLowerCase().includes(query.toLowerCase()) || m.name.toLowerCase().includes(query.toLowerCase())
  );
  const sorted = sortCastMembers(filtered, localIds);

  if (readOnly) {
    return <span className={className}>{value || '—'}</span>;
  }

  return (
    <div ref={ref} className={`relative ${className || ''}`} onMouseDown={e => e.stopPropagation()}>
      <input
        value={open ? (query || localIds.join(', ')) : (value || '')}
        onChange={e => { setQuery(e.target.value); handleOpen(); }}
        onFocus={handleOpen}
        placeholder="Cast"
        className="text-inherit placeholder:text-inherit placeholder:opacity-50 bg-transparent w-full h-full outline-none text-left"
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); setQuery(''); }
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
        }}
      />
      {open && sorted.length > 0 && (
        <div className={`${DD_CONTAINER} left-0 min-w-[180px] max-h-56`}>
          {sorted.map(m => {
            const checked = localIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); add(m.id); }}
                className={`w-full text-left ${DD_ITEM(checked)} flex items-center gap-2`}
              >
                <span className="text-zinc-400 shrink-0">{m.id}.</span>
                <span className="truncate">{m.name || '—'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const INT_EXT_OPTIONS = ['INT', 'EXT', 'INT/EXT'];
const DAY_NIGHT_OPTIONS = ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'DAWN', 'DUSK'];

const IECellInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  className?: string;
  readOnly?: boolean;
}> = ({ value, onChange, className, readOnly }) => {
  const [open, setOpen] = useState(false);
  const initialIdx = INT_EXT_OPTIONS.indexOf(value);
  const [highlightedIndex, setHighlightedIndex] = useState(initialIdx >= 0 ? initialIdx : 0);
  const ref = useRef<HTMLDivElement>(null);

  const handleOpen = useOpenHandler(setOpen);

  useDropdown(open, ref, () => setOpen(false));

  const commit = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  if (readOnly) return <span className={className}>{value || '—'}</span>;

  return (
    <div ref={ref} className={`relative ${className || ''}`} onMouseDown={e => e.stopPropagation()}>
      <input
        value={value}
        readOnly
        onClick={() => { setHighlightedIndex(INT_EXT_OPTIONS.indexOf(value)); handleOpen(); }}
        className="bg-transparent outline-none uppercase text-inherit cursor-pointer w-full text-left"
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(i => Math.min(i + 1, INT_EXT_OPTIONS.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(i => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(INT_EXT_OPTIONS[highlightedIndex]); }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <div className={`${DD_CONTAINER} left-0 min-w-[120px]`}>
          {INT_EXT_OPTIONS.map((opt, i) => (
            <div
              key={opt}
              className={DD_ITEM(i === highlightedIndex)}
              onMouseDown={e => { e.preventDefault(); commit(opt); }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const DNCellInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  className?: string;
  readOnly?: boolean;
}> = ({ value, onChange, className, readOnly }) => {
  const [open, setOpen] = useState(false);
  const initialIdx = DAY_NIGHT_OPTIONS.indexOf(value);
  const [highlightedIndex, setHighlightedIndex] = useState(initialIdx >= 0 ? initialIdx : 0);
  const ref = useRef<HTMLDivElement>(null);

  const handleOpen = useOpenHandler(setOpen);

  useDropdown(open, ref, () => setOpen(false));

  const commit = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  if (readOnly) return <span className={className}>{value || '—'}</span>;

  return (
    <div ref={ref} className={`relative ${className || ''}`} onMouseDown={e => e.stopPropagation()}>
      <input
        value={value}
        readOnly
        onClick={() => { setHighlightedIndex(DAY_NIGHT_OPTIONS.indexOf(value)); handleOpen(); }}
        className="bg-transparent outline-none uppercase text-inherit cursor-pointer w-full text-left"
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(i => Math.min(i + 1, DAY_NIGHT_OPTIONS.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(i => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(DAY_NIGHT_OPTIONS[highlightedIndex]); }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <div className={`${DD_CONTAINER} left-0 min-w-[140px]`}>
          {DAY_NIGHT_OPTIONS.map((opt, i) => (
            <div
              key={opt}
              className={DD_ITEM(i === highlightedIndex)}
              onMouseDown={e => { e.preventDefault(); commit(opt); }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SetCellInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  className?: string;
  readOnly?: boolean;
  scenes: Scene[];
}> = ({ value, onChange, className, readOnly, scenes }) => {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const setOptions = useMemo(() => {
    const sets = new Set(scenes.map(s => s.set.toUpperCase()).filter(Boolean));
    return [...sets].sort();
  }, [scenes]);

  const filtered = open && val
    ? setOptions.filter(opt => opt.includes(val.toUpperCase()))
    : setOptions;

  const handleOpen = useOpenHandler(setOpen);

  useDropdown(open, ref, () => {
    setOpen(false);
    setVal(value);
  });

  const commit = (opt: string) => {
    onChange(opt);
    setOpen(false);
  };

  if (readOnly) return <span className={className}>{value || '—'}</span>;

  return (
    <div ref={ref} className={`relative ${className || ''}`} onMouseDown={e => e.stopPropagation()}>
      <input
        value={open ? val : value}
        onChange={e => { setVal(e.target.value.toUpperCase()); setHighlightedIndex(0); handleOpen(); }}
        onClick={() => { setVal(value); handleOpen(); }}
        className="bg-transparent outline-none uppercase text-inherit w-full text-left"
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(i => Math.min(i + 1, filtered.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(i => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(filtered[0] ? filtered[highlightedIndex] : val.toUpperCase()); }
          if (e.key === 'Escape') { setOpen(false); setVal(value); }
        }}
      />
      {open && filtered.length > 0 && (
        <div className={`${DD_CONTAINER} left-0 min-w-[160px]`}>
          {filtered.map((opt, i) => (
            <div
              key={opt}
              className={`${DD_ITEM(i === highlightedIndex)} uppercase`}
              onMouseDown={e => { e.preventDefault(); commit(opt); }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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
  bulkDuration?: string | null;
  onBulkDurationChange?: (v: string | null) => void;
}> = ({ row, scenes, isOverlay, isSelected, isFaded, onSelectToggle, isCompact, textEditingEnabled, sceneViolations, bulkDuration, onBulkDurationChange }) => {
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
    'data-row-id': row.id,
    'data-shoot-day': row.shootDay,
    className: `group relative transition-colors shrink-0 ${isOverlay ? 'scale-[1.02] shadow-2xl cursor-grabbing ring-2 ring-black' : ''} ${isFaded ? 'opacity-30' : ''} ${!textEditingEnabled && !isOverlay ? 'cursor-grab' : ''}`
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
                        value={row.estimatedDuration === 0 || !row.estimatedDuration ? '' : formatDuration(row.estimatedDuration || 0)}
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
    if (isSelected && !isFaded) breakStyle.background = darkenHex(breakStyle.background as string);
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
    if (isSelected && !isFaded) {
      rowStyle.background = darkenHex(rowStyle.background as string);
      borderStyle.background = darkenHex(borderStyle.background as string);
    }

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
                    <CastCellInput value={scene.cast} onChange={val => updateScene({cast: val})} className={`${inputClass} text-right`} readOnly />
                  </td>
                  <td className="col-pgs">
                    <CellInput
                      value={scene.pageCount}
                      onChange={val => {
                        const decimal = parsePageCount(val);
                        updateScene({ pageCount: formatPageCount(decimal), pageCountDecimal: decimal });
                      }}
                      className={`${inputClass} text-center`}
                      readOnly
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
                  {isSelected && bulkDuration !== null && row.type === 'SCENE' && onBulkDurationChange ? (
                    <CellInput
                      value={bulkDuration}
                      onChange={val => onBulkDurationChange(val || null)}
                      clearOnType
                      col="duration"
                      autoFocus
                      className={`${inputClass} text-center`}
                    />
                  ) : (
                    <CellInput
                      value={row.estimatedDuration === 0 ? '↑' : formatDuration(row.estimatedDuration || 0)}
                      onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
                      clearOnType
                      col="duration"
                      className={`${inputClass} text-center`}
                    />
                  )}
                </td>}
                <td className="col-ie">
                  <IECellInput value={scene.intExt} onChange={val => updateScene({intExt: val as any})} className="text-left w-full" readOnly={!textEditingEnabled} />
                </td>
                <td className="col-set">
                  <SetCellInput value={scene.set} onChange={val => updateScene({set: val})} className={`${inputClass} text-left uppercase`} readOnly={!textEditingEnabled} scenes={scenes} />
                </td>
                <td className="col-dn">
                  <DNCellInput value={scene.dayNight} onChange={val => updateScene({dayNight: val as any})} className="text-left w-full" readOnly={!textEditingEnabled} />
                </td>
                <td className="col-cast">
                  <CastCellInput
                    value={scene.cast}
                    onChange={val => updateScene({cast: val})}
                    className={`${inputClass} text-right`}
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
