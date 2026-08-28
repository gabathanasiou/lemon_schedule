import React, { useMemo, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useProject } from '../store';
import { SortableRibbon } from './SortableRibbon';
import { ScheduleRow, Scene, RibbonRow, SceneColorPalette, RuleViolation } from '../types';
import { CellBorders } from '../lib/persist';
import { getFieldValue, FIELD_MAP, resolveSceneColor, getNoteBannerColors, getDayFooterColors, getFallbackStripColors, computeMergeGroups } from '../lib/ribbonUtils';
import { checkSection } from '../lib/rulesEngine';
import { useDaybreakSections } from '../lib/useDaybreakSections';
import { ComputedRowInput } from '../lib/daybreakUtils';
import { TEST_IDS } from '../lib/testIds';

/** Rows per virtualized chunk (≈ 12 × 43px, matched by the CSS intrinsic size). */
const CHUNK_SIZE = 12;

const CvChunk: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="cv-chunk">{children}</div>
);

const nextDateCache = new Map<string, string>();

function getSceneCardStyle(scene?: Scene | null, palette?: SceneColorPalette): React.CSSProperties {
  if (!scene) return { background: '#ffffff', color: '#18181b' };
  return resolveSceneColor(scene.intExt || '', scene.dayNight || '', palette?.sceneColors, getFallbackStripColors(palette), scene, palette?.colorRules);
}

const GhostCard: React.FC<{ row: ComputedRowInput, scenes: Scene[]; compact?: boolean; ribbon?: RibbonRow[]; colWidths?: number[]; palette?: SceneColorPalette }> = ({ row, scenes, compact, ribbon, colWidths, palette }) => {
  const h = compact ? 'min-h-[30px]' : 'min-h-[44px]';
  const sz = compact ? 'text-[7pt]' : '';
  const noteColors = getNoteBannerColors(palette);
  if (row.type === 'NOTE') {
    const bg = row.noteColor || noteColors.background;
    const fg = row.noteTextColor || noteColors.color;
    return (
      <div className={`opacity-30 flex items-stretch ${h} border-b shrink-0 ${sz}`} style={{ background: bg, color: fg }}>
        <div className="flex-1 flex items-center justify-center px-3 italic">{row.noteText || 'Note'}</div>
      </div>
    );
  }

  if (row.type === 'BREAK') {
    return (
      <div className={`opacity-30 flex items-stretch ${h} border-b shrink-0 ${sz}`} style={{ background: noteColors.background, color: noteColors.color }}>
        <div className="flex-1 flex items-center justify-center px-3">{row.breakLabel || 'BREAK'}</div>
      </div>
    );
  }

  if (row.type === 'DAYBREAK') {
    const df = getDayFooterColors(palette);
    return (
      <div className={`opacity-30 flex items-stretch ${h} border-b shrink-0 ${sz}`} style={{ background: df.background, color: df.color }}>
        <div className="flex-1 flex items-center justify-center px-3">{row.daybreakLabel || 'End of Day'}</div>
      </div>
    );
  }

  const scene = scenes.find(s => s.id === row.sceneId);
  if (!scene) return null;

  if (ribbon && ribbon.length > 0 && ribbon[0].cells.length > 0) {
    const cw = colWidths ?? [];
    const sc = getSceneCardStyle(scene, palette);
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
    const items: { cell: RibbonRow['cells'][0]; col: number; ri: number; vSpan: number; hSpan: number }[] = [];
    for (let ri = 0; ri < ribbon.length; ri++) {
      for (let ci = 0; ci < ribbon[ri].cells.length; ci++) {
        const cell = ribbon[ri].cells[ci];
        if (hiddenIds.has(cell.id)) continue;
        const g = mgroups.find(gg => gg.colIndex === ci && gg.rowIndex === ri);
        const vSpan = g?.direction === 'v' ? (g.span || 1) : 1;
        const hSpan = g?.direction === 'h' ? (g.span || 1) : 1;
        items.push({ cell, col: ci, ri, vSpan, hSpan });
      }
    }
    return (
      <div className={`opacity-30 flex items-stretch border-b shrink-0 ${h} ${sz}`}
        style={{ ...sc, fontFamily: 'Helvetica, sans-serif', fontSize: compact ? '7pt' : '8pt', lineHeight: '1.1' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: cw.map(w => `${w}%`).join(' '),
          gridTemplateRows: `repeat(${ribbon.length}, auto)`,
          width: '100%',
        }}>
          {items.map(({ cell, col, ri, vSpan, hSpan }) => {
            const span = vSpan || 1;
            const val = cell.field === 'text' ? (cell.textContent || '') : getFieldValue(cell.field, { ...scene, computedCallTime: row.computedCallTime, estimatedDuration: row.estimatedDuration || 0 });
            const label = FIELD_MAP[cell.field]?.label || cell.field;
            const display = val ? `${cell.prefix || ''}${cell.prefix && val ? '\u00A0' : ''}${val}${cell.suffix && val ? '\u00A0' : ''}${cell.suffix || ''}` : label;
            return (
              <div key={cell.id} style={{
                gridColumn: (hSpan && hSpan > 1) ? `${col + 1} / span ${hSpan}` : col + 1,
                gridRow: span > 1 ? `${ri + 1} / span ${span}` : ri + 1,
                padding: compact ? '3pt 3pt' : '4pt 4pt',
                borderRight: '1px solid rgba(0,0,0,0.15)',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                textAlign: cell.align || 'left',
                fontWeight: cell.field === 'sceneNumber' ? 700 : 500,
                fontStyle: val ? 'normal' : 'italic',
              }}>
                {display || ''}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`opacity-30 flex items-stretch border-b shrink-0 ${h} ${sz}`} style={getSceneCardStyle(scene, palette)}>
      <div className={`flex items-center justify-center shrink-0 px-1 border-r border-black/10 ${compact ? 'w-[30px]' : 'w-[50px]'}`}>{scene.sceneNumber}</div>
      <div className="flex-1 flex items-center px-3 gap-1 min-w-0">
        <span className="uppercase shrink-0">{scene.intExt}.</span>
        <span className="uppercase truncate">{scene.set}</span>
        <span className="opacity-50 shrink-0">-</span>
        <span className="uppercase shrink-0">{scene.dayNight}</span>
      </div>
    </div>
  );
};

export const StackedGhosts: React.FC<{ rows: ComputedRowInput[]; scenes: Scene[]; ribbon?: RibbonRow[]; colWidths?: number[]; palette?: SceneColorPalette }> = ({ rows, scenes, ribbon, colWidths, palette }) => {
  if (rows.length === 0) return null;
  if (rows.length === 1) return <GhostCard row={rows[0]} scenes={scenes} ribbon={ribbon} colWidths={colWidths} palette={palette} />;
  const maxShow = Math.min(rows.length, 5);
  const rest = rows.length - maxShow;
  return (
    <div className="flex flex-col shrink-0">
      {rows.slice(0, maxShow).map((r, i) => (
        <GhostCard key={r.id} row={r} scenes={scenes} compact ribbon={ribbon} colWidths={colWidths} palette={palette} />
      ))}
      {rest > 0 && (
        <div className="opacity-30 flex items-center justify-center min-h-[30px] bg-zinc-100 text-zinc-500 text-[10px] font-bold border-b shrink-0">
          +{rest} more
        </div>
      )}
    </div>
  );
};

export const StripBlock: React.FC<{ dayInt: number, rows: ScheduleRow[], selectedIds?: Set<string>, activeDragIds?: Set<string>, onRowClick?: (id: string, e: React.MouseEvent) => void, editingTarget?: { rowId: string; fieldKey: string | null } | null, insertBeforeId?: string | null, activeRowId?: string | null, activeDragRow?: ScheduleRow | null, activeDragRows?: ScheduleRow[], chronoDay?: number, focusedRowId?: string | null, onRowDoubleClick?: (id: string, shiftKey?: boolean) => void, onRowNavigate?: (rowId: string) => void, ribbon?: RibbonRow[], colWidths?: number[], cellPaddingV?: number, cellPaddingH?: number, textSize?: number, edgePadding?: number, cellBorders?: CellBorders }> = ({ dayInt, rows, selectedIds = new Set(), activeDragIds = new Set(), onRowClick, editingTarget, insertBeforeId, activeRowId, activeDragRow, activeDragRows = [], chronoDay, focusedRowId, onRowDoubleClick, onRowNavigate, ribbon, colWidths, cellPaddingV, cellPaddingH, textSize, edgePadding, cellBorders }) => {
  const showGhosts = activeRowId && activeDragRows.length > 0;
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const { computedRows: allComputedRows, nextSectionDateMap, daybreakRowToSection } = useDaybreakSections();

  const { setNodeRef: setDropRef } = useDroppable({
    id: `day-${dayInt}`,
    data: { type: 'STRIP_DROPZONE', dayInt }
  });

  const { setNodeRef: setFooterRef } = useDroppable({
    id: `end-${dayInt}`,
    data: { type: 'STRIP_END', dayInt }
  });

  const updateDaybreakRow = useCallback((rowId: string, updates: Partial<ScheduleRow>) => {
    if (!activeVersion) return;
    const newRows = activeVersion.rows.map(r => r.id === rowId ? { ...r, ...updates } : r);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
  }, [activeVersion, dispatch]);

  const firstDaybreak = rows.find(r => r.type === 'DAYBREAK');
  const firstDaybreakCallTime = firstDaybreak?.daybreakCallTime || '08:00';

  const rowIdSet = useMemo(() => new Set(rows.map(r => r.id)), [rows]);
  const computedRows = useMemo(
    () => allComputedRows.filter(cr => rowIdSet.has(cr.id)),
    [allComputedRows, rowIdSet],
  );

  const formatNextDate = (iso: string): string => {
    if (!iso) return '';
    const cached = nextDateCache.get(iso);
    if (cached !== undefined) return cached;
    const dt = new Date(iso + 'T00:00:00');
    if (isNaN(dt.getTime())) { nextDateCache.set(iso, ''); return ''; }
    const s = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    nextDateCache.set(iso, s);
    return s;
  };
  const nextDateStrByRow = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of computedRows) {
      if (r.type === 'DAYBREAK') {
        const sec = daybreakRowToSection.get(r.id);
        m.set(r.id, sec != null ? formatNextDate(nextSectionDateMap.get(sec) || '') : '');
      }
    }
    return m;
  }, [computedRows, daybreakRowToSection, nextSectionDateMap]);

  const sectionViolationMap = useMemo(() => {
    const map = new Map<string, RuleViolation[]>();
    let sectionRows: ScheduleRow[] = [];
    let sectionBaseTime = firstDaybreakCallTime;
    for (const row of computedRows) {
      if (row.type === 'DAYBREAK') {
        const sectionDate = row.daybreakDate;
        const v = checkSection(sectionRows, sectionDate, sectionBaseTime, project.rules || [], project.scenes, project.castMembers || []);
        if (v.length > 0) map.set(row.id, v);
        sectionRows = [];
        sectionBaseTime = row.daybreakCallTime || firstDaybreakCallTime;
      } else {
        sectionRows.push(row);
      }
    }
    return map;
  }, [computedRows, project.rules, project.scenes, project.castMembers, firstDaybreakCallTime]);

  const nextSectionViolationMap = useMemo(() => {
    const map = new Map<string, RuleViolation[]>();
    const daybreaks = computedRows.filter(r => r.type === 'DAYBREAK');
    for (let i = 0; i < daybreaks.length - 1; i++) {
      const next = daybreaks[i + 1];
      const v = sectionViolationMap.get(next.id);
      if (v) map.set(daybreaks[i].id, v);
    }
    return map;
  }, [computedRows, sectionViolationMap]);

  const mergedSceneViolationMap = useMemo(() => {
    const map = new Map<string, RuleViolation[]>();
    for (const [, violations] of sectionViolationMap) {
      for (const v of violations) {
        for (const sid of (v.sceneIds || (v.sceneId ? [v.sceneId] : []))) {
          if (!map.has(sid)) map.set(sid, []);
          map.get(sid)!.push(v);
        }
      }
    }
    return map;
  }, [sectionViolationMap]);

  const nextDaybreakMap = useMemo(() => {
    const map = new Map<string, { callTime: string; rowId: string }>();
    const daybreaks = computedRows.filter(r => r.type === 'DAYBREAK');
    for (let i = 0; i < daybreaks.length - 1; i++) {
      map.set(daybreaks[i].id, { callTime: daybreaks[i].daybreakCallTime || '08:00', rowId: daybreaks[i].id });
    }
    return map;
  }, [computedRows]);

  const sortableRows = useMemo(() => {
    if (!activeVersion) return computedRows;
    const hasOtherDaybreaks = activeVersion.rows.some(r => r.type === 'DAYBREAK' && !r.pinned);
    if (hasOtherDaybreaks) return computedRows;
    return computedRows.filter(r => !r.pinned);
  }, [computedRows, activeVersion]);

  // SortableContext `items` must be identity-stable across dispatches:
  // dnd-kit re-renders every useSortable consumer when `items` changes, so a
  // fresh array per render defeats the row memoization (269 rows re-render
  // per keystroke). Key the memo by the id sequence instead.
  const sortableRowsKey = useMemo(() => sortableRows.map(r => r.id).join('|'), [sortableRows]);
  const sortableItems = useMemo(() => sortableRows.map(r => r.id), [sortableRowsKey]);

  // Row-level virtualization: chunk the rows so content-visibility can skip
  // layout/paint far from the viewport (projects keep everything in one
  // container, so the day-level window is a no-op).
  const rowChunks = useMemo(() => {
    const chunks: ScheduleRow[][] = [];
    for (let i = 0; i < sortableRows.length; i += CHUNK_SIZE) {
      chunks.push(sortableRows.slice(i, i + CHUNK_SIZE));
    }
    return chunks;
  }, [sortableRows]);

  const baseStyle = {
    fontFamily: 'Helvetica, sans-serif',
    fontSize: '8pt',
    lineHeight: '1.2',
  };

  return (
    <div data-testid={TEST_IDS.stripboardDay} className="flex flex-col">
    <div style={{ ...baseStyle, borderBottom: 'none' }} className="bg-white flex flex-col border-[2px] border-black">

      {/* Drop zone */}
      <div ref={setDropRef} className="flex flex-col min-h-0 bg-white items-stretch relative">
        {showGhosts && insertBeforeId === `day-${dayInt}` && (
          <StackedGhosts rows={activeDragRows} scenes={project.scenes} ribbon={ribbon} colWidths={colWidths} palette={project.colorPalette} />
        )}
        <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
          {rowChunks.map((chunk, ci) => (
            <CvChunk key={ci}>
              {chunk.map((r) => {
                const nextDb = r.type === 'DAYBREAK' ? nextDaybreakMap.get(r.id) : undefined;
                return (
                  <React.Fragment key={r.id}>
                    {showGhosts && insertBeforeId === r.id && (
                      <StackedGhosts rows={activeDragRows} scenes={project.scenes} ribbon={ribbon} colWidths={colWidths} palette={project.colorPalette} />
                    )}
                      <SortableRibbon 
                        row={r} 
                        scenes={project.scenes} 
                        scene={r.type === 'SCENE' ? (project.scenes.find(s => s.id === r.sceneId) ?? null) : null}
                        isSelected={selectedIds.has(r.id)}
                        isFaded={activeDragIds.has(r.id)}
                        onSelectToggle={(e) => onRowClick?.(r.id, e)}
                        isEditable={r.id === editingTarget?.rowId}
                        focusField={r.id === editingTarget?.rowId ? editingTarget.fieldKey : null}
                        sceneViolations={mergedSceneViolationMap.get(r.sceneId || '')}
                        sectionViolations={sectionViolationMap.get(r.id)}
                        nextSectionViolations={nextSectionViolationMap.get(r.id)}
                        focusedRowId={focusedRowId}
                        onDoubleClick={onRowDoubleClick}
                        onRowNavigate={onRowNavigate}
                        ribbon={ribbon}
                        colWidths={colWidths}
                        cellPaddingV={cellPaddingV} cellPaddingH={cellPaddingH}
                        textSize={textSize}
                        edgePadding={edgePadding}
                        cellBorders={cellBorders}
                        nextDaybreakCallTime={nextDb?.callTime}
                        onUpdateNextDaybreak={nextDb ? (val: string) => updateDaybreakRow(nextDb.rowId, { daybreakCallTime: val }) : undefined}
                        nextDateStr={r.type === 'DAYBREAK' ? nextDateStrByRow.get(r.id) : undefined}
                        dispatch={dispatch}
                        activeVersionId={activeVersion?.id}
                        palette={project.colorPalette}
                        castMembers={project.castMembers || []}
                        breakdownElements={project.breakdownElements}
                        customCategories={project.customCategories}
                        hiddenCategories={project.hiddenCategories}
                        elementLinks={project.elementLinks}
                      />
                  </React.Fragment>
                );
              })}
            </CvChunk>
          ))}
        </SortableContext>
        {sortableRows.length === 0 && (
          <div className="flex items-center px-4 py-3 text-[9pt] border-b-[2px] border-black italic select-none text-zinc-300"
            data-row-id={`empty-${dayInt}`}
            data-container-id={dayInt}
            style={{ fontFamily: 'Helvetica, sans-serif' }}
          >
            right-click for options
          </div>
        )}
        {sortableRows.length === 0 && <div className="flex-1" />}
      </div>
    </div>

      {/* Day Footer - end drop target */}
      {showGhosts && insertBeforeId === `end-${dayInt}` && (
        <StackedGhosts rows={activeDragRows} scenes={project.scenes} ribbon={ribbon} colWidths={colWidths} palette={project.colorPalette} />
      )}
      <div ref={setFooterRef} className="pb-20" />
    </div>
  );
};
