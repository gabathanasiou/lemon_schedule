import React, { useMemo, useState } from 'react';
import { useProject } from '../../../store';
import { useReportCtx } from '../../../lib/useReportCtx';
import { getReportFieldMap } from '../../../lib/reportFields';
import type { ReportBlock, ReportDesign, ReportTextStyle } from '../../../types';
import { findBlock, insertAfter, insertInto, makeReportBlock, moveBlock, removeBlock, updateBlock, duplicateBlock } from '../../../lib/reportBlocks';
import { REPORT_PAGE_METRICS, REPORT_PAGE_PADDING } from '../../reports/reportStyle';
import { ReportBlockView } from '../../reports/ReportBlockView';
import ReportPalette, { type PaletteDropPayload } from '../../reports/ReportPalette';
import { BLOCK_TYPE_META, BlockEditorContent } from '../../reports/blockControls';
import { ToolButton, TB_BTN_ICON } from '@gabriel/ui-kit';
import { Plus, X } from 'lucide-react';
import type { DayView } from '../../../lib/dayView';

/**
 * True WYSIWYG call-sheet editor (item 10). The whole design renders on ONE
 * white page, filled with the selected day's real data — the template's
 * scenes/crew/locations/etc. are read-only. Only the `callSheetEdit` zone is
 * editable: its blocks render as selectable cards edited through the standard
 * block chrome (above the page), with the palette rail adding to the zone.
 * Works on the design shape `days` repeat → (…, callSheetEdit, …).
 */
export function callSheetDayBlocks(design: ReportDesign): ReportBlock[] | null {
  for (const b of design.blocks || []) {
    if (b.type === 'repeat' && b.collection === 'days' && (b.children || []).some(c => c.type === 'callSheetEdit')) {
      return b.children || [];
    }
  }
  return null;
}

const ZONE_CONTAINERS = new Set(['repeat', 'table', 'relative']);

interface CallSheetCanvasProps {
  design: ReportDesign;
  day: DayView;
  zoneBlocks: ReportBlock[];
  onChangeZone: (blocks: ReportBlock[]) => void;
  readOnly?: boolean;
}

const CallSheetCanvas: React.FC<CallSheetCanvasProps> = ({ design, day, zoneBlocks, onChangeZone, readOnly }) => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const ctx = useReportCtx();
  const fieldMap = useMemo(() => getReportFieldMap(project), [project]);
  const [selId, setSelId] = useState<string | null>(null);

  const dayItem = ctx?.dayInfos.find(d => d.section.index === day.sectionIndex);
  const dayBlocks = useMemo(() => callSheetDayBlocks(design), [design]);
  const metrics = REPORT_PAGE_METRICS[design.page];

  const sel = selId ? findBlock(zoneBlocks, selId)?.block ?? null : null;
  const selIsContainer = !!sel && ZONE_CONTAINERS.has(sel.type);

  const patchBlock = (id: string, patch: Partial<ReportBlock>) => onChangeZone(updateBlock(zoneBlocks, id, patch));
  const select = (id: string | null) => setSelId(id);

  const removeSel = () => {
    if (!selId) return;
    onChangeZone(removeBlock(zoneBlocks, selId));
    setSelId(null);
  };
  const duplicateSel = () => {
    if (!selId) return;
    const next = duplicateBlock(zoneBlocks, selId);
    onChangeZone(next);
  };
  const moveSel = (dir: -1 | 1) => {
    if (!selId) return;
    onChangeZone(moveBlock(zoneBlocks, selId, dir));
  };

  const makeFromPayload = (p: PaletteDropPayload): ReportBlock =>
    p.field ? makeReportBlock('text', { text: `{{${p.field}}}` }) : makeReportBlock((p.type || 'text') as ReportBlock['type']);

  const insertPayload = (payload: PaletteDropPayload) => {
    const b = makeFromPayload(payload);
    let next: ReportBlock[];
    if (selId && selIsContainer) next = insertInto(zoneBlocks, selId, b);
    else if (selId) next = insertAfter(zoneBlocks, selId, b);
    else next = [...zoneBlocks, b];
    onChangeZone(next);
    setSelId(b.id);
  };

  const addTextBlock = () => insertPayload({ kind: 'block', type: 'text' });

  // A zone card's inner editors (cells, inputs, links) own their clicks.
  const stopInner = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest?.('input, textarea, [contenteditable="true"], a, button')) return true;
    return false;
  };

  const editorProps = sel
    ? {
        block: sel,
        project,
        parentCollection: 'days' as const,
        readOnly: !!readOnly,
        onPatch: (patch: Partial<ReportBlock>) => patchBlock(sel.id, patch),
        onSaveTextStyles: (styles: ReportTextStyle[]) => dispatch({ type: 'SET_REPORT_TEXT_STYLES', payload: styles }),
        onDuplicate: duplicateSel,
        onRemove: removeSel,
        onMove: moveSel,
        trailing: (
          <ToolButton onClick={() => setSelId(null)} title="Done editing block" className={TB_BTN_ICON}>
            <X className="w-3 h-3" /> Done
          </ToolButton>
        ),
      }
    : null;

  const readOnlyView = (b: ReportBlock, i: number, item?: any, parentCollection?: string) => (
    <div key={b.id} style={{ marginTop: i === 0 ? 0 : 6 }}>
      <ReportBlockView block={b} ctx={ctx!} fieldMap={fieldMap} item={item} parentCollection={parentCollection as any} />
    </div>
  );

  return (
    <div className="flex-1 flex min-h-0 min-w-0 bg-zinc-950 text-zinc-300 select-none" data-call-sheet-canvas>
      <ReportPalette project={project} insertScope="days" insideColumns={false} readOnly={!!readOnly} onInsert={insertPayload} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {editorProps && (
          <div className="shrink-0 overflow-x-auto border-b border-zinc-800 bg-zinc-900/80" onClick={e => e.stopPropagation()}>
            <div className="bg-zinc-900 border-b border-zinc-800 rounded-b-lg select-none min-w-max">
              <BlockEditorContent {...editorProps} />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto p-6" onClick={() => setSelId(null)}>
          <div
            className="mx-auto bg-white shadow-2xl"
            style={{ width: metrics.contentWidth, padding: `${REPORT_PAGE_PADDING.v}px ${REPORT_PAGE_PADDING.h}px` }}
            data-call-sheet-page
          >
            {!ctx || !dayItem ? (
              <div className="py-16 text-center text-xs text-zinc-400">Loading day…</div>
            ) : (
              <>
                {(design.header || []).map((b, i) => readOnlyView(b, i))}
                {(dayBlocks || []).map((b, i) => {
                  if (b.type === 'pageBreak') return null;
                  if (b.type === 'callSheetEdit') {
                    return (
                      <div key={b.id} className="call-sheet-zone rounded border border-dashed border-sky-400 p-2 my-3" style={{ background: '#fbfdff' }} onClick={e => e.stopPropagation()}>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 px-1 pb-1">
                          Call Sheet Zone — editable for this day
                        </div>
                        {zoneBlocks.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => addTextBlock()}
                            disabled={readOnly}
                            className="w-full flex items-center justify-center gap-1.5 py-3 text-xs text-sky-600 hover:bg-sky-50 rounded border border-dashed border-sky-300 disabled:opacity-40"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add a block here (or use the palette)
                          </button>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {zoneBlocks.map((zb) => {
                              const meta = BLOCK_TYPE_META[zb.type] || { label: zb.type, icon: null };
                              const selected = zb.id === selId;
                              return (
                                <div
                                  key={zb.id}
                                  data-zone-block={zb.id}
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (stopInner(e)) return;
                                    setSelId(zb.id);
                                  }}
                                  className={`group rounded border bg-white transition-colors cursor-pointer ${selected ? 'border-sky-500 shadow-sm' : 'border-zinc-300 hover:border-zinc-400'}`}
                                  style={{ padding: 6 }}
                                >
                                  <div className={`flex items-center gap-1 text-[9px] uppercase tracking-wider text-zinc-400 mb-0.5 ${selected ? 'opacity-100 text-sky-600' : 'opacity-0 group-hover:opacity-100'}`}>
                                    {meta.icon}
                                    <span className="font-semibold">{meta.label}</span>
                                    {selected && <span className="normal-case tracking-normal text-sky-500">— selected, edit above</span>}
                                  </div>
                                  <ReportBlockView
                                    block={zb}
                                    ctx={ctx}
                                    fieldMap={fieldMap}
                                    item={dayItem}
                                    parentCollection="days"
                                    hint
                                    showUnresolved
                                    onPatchBlock={p => patchBlock(zb.id, p)}
                                  />
                                </div>
                              );
                            })}
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => addTextBlock()}
                                className="flex items-center justify-center gap-1 py-1.5 text-xs text-sky-600 hover:bg-sky-50 rounded border border-dashed border-sky-300"
                              >
                                <Plus className="w-3.5 h-3.5" /> Add block
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return readOnlyView(b, i, dayItem, 'days');
                })}
                {(design.footer || []).map((b, i) => readOnlyView(b, i))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallSheetCanvas;
