import React, { useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, EyeOff, Printer, RotateCcw } from 'lucide-react';
import type { DayView } from '../../../lib/dayView';
import type { ReportBlock, ReportDesign } from '../../../types';
import ReportDesigner from '../../reports/ReportDesigner';
import DayReportPreview from '../../reports/DayReportPreview';
import CallSheetCanvas, { callSheetDayBlocks } from './CallSheetCanvas';
import DayPicker from './DayPicker';
import GroupedSelect from './GroupedSelect';

/**
 * Full-surface per-day call-sheet editor (item 10, D17): the whole design
 * fills a single white page with that day's data; the zone is edited with the
 * REAL reports-designer canvas. Header (shares the Days page's DayPicker):
 * Days back · day switcher (prev/next + DayPicker) · call-sheet design picker ·
 * Preview/Edit toggle · Reset · Print.
 */
export interface CallSheetEditPageProps {
  day: DayView;
  days: DayView[];
  design: ReportDesign;
  designs: ReportDesign[];
  zoneBlocks: ReportBlock[];
  onChangeZone: (blocks: ReportBlock[]) => void;
  onReset: () => void;
  onSelectDesign: (id: string) => void;
  onSelectDay: (sectionIndex: number) => void;
  onPrint: () => void;
  onBack: () => void;
  readOnly?: boolean;
  /** True when the day has its own stored zone content (Reset is meaningful). */
  hasOverride: boolean;
}

const isCallSheet = (d: ReportDesign) => /call\s*sheet/i.test(d.name);

const CallSheetEditPage: React.FC<CallSheetEditPageProps> = ({
  day, days, design, designs, zoneBlocks, onChangeZone, onReset, onSelectDesign, onSelectDay, onPrint, onBack, readOnly, hasOverride,
}) => {
  const [nonce, setNonce] = useState(0);
  const [preview, setPreview] = useState(false);

  // Only call-sheet designs can be per-day edited here.
  const callSheetDesigns = useMemo(() => {
    const list = designs.filter(isCallSheet);
    if (!list.some(d => d.id === design.id)) return [design, ...list];
    return list;
  }, [designs, design]);
  const designItems = useMemo(() => callSheetDesigns.map(d => ({ id: d.id, name: d.name })), [callSheetDesigns]);

  const stepDay = (delta: number) => {
    const i = days.findIndex(d => d.sectionIndex === day.sectionIndex);
    const next = days[i + delta];
    if (next) { onSelectDay(next.sectionIndex); setPreview(false); }
  };

  const editorKey = `${day.sectionIndex}:${design.id}:${nonce}`;

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-zinc-950 text-zinc-300" data-call-sheet-edit>
      <header className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800">
          <ArrowLeft className="w-3.5 h-3.5" /> Days
        </button>

        <button type="button" onClick={() => stepDay(-1)} aria-label="Previous day" className="p-1 rounded text-zinc-500 hover:bg-zinc-800 hover:text-white">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <DayPicker
          className="w-36"
          theme="dark"
          options={days}
          selectedIndex={day.sectionIndex}
          onSelect={idx => { onSelectDay(idx); setPreview(false); }}
          disabled={readOnly}
        />
        <button type="button" onClick={() => stepDay(1)} aria-label="Next day" className="p-1 rounded text-zinc-500 hover:bg-zinc-800 hover:text-white">
          <ChevronRight className="w-4 h-4" />
        </button>

        {designItems.length > 0 && (
          <>
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider ml-2">Design</span>
            <GroupedSelect
              className="w-52"
              theme="dark"
              items={designItems}
              mode="single"
              selectedIds={[design.id]}
              disabled={readOnly}
              onChange={ids => { if (ids[0]) { onSelectDesign(ids[0]); setPreview(false); } }}
            />
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPreview(v => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {preview ? 'Edit' : 'Preview'}
          </button>
          <button
            type="button"
            disabled={readOnly || !hasOverride}
            onClick={() => { onReset(); setNonce(n => n + 1); setPreview(false); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30"
            title={hasOverride ? 'Discard this day’s edits and use the template zone' : 'Using the template zone'}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset to template
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-zinc-100 text-zinc-900 font-medium hover:bg-white"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </header>

      {preview ? (
        <DayReportPreview
          key={editorKey}
          design={design}
          sectionIndex={day.sectionIndex}
          callSheetBlocks={zoneBlocks}
          onExit={() => setPreview(false)}
        />
      ) : callSheetDayBlocks(design) ? (
        <CallSheetCanvas
          key={editorKey}
          design={design}
          day={day}
          zoneBlocks={zoneBlocks}
          onChangeZone={onChangeZone}
          readOnly={readOnly}
        />
      ) : (
        <ReportDesigner
          key={editorKey}
          zone={{ designId: design.id, blocks: zoneBlocks, onChange: onChangeZone, scope: 'days' }}
        />
      )}
    </div>
  );
};

export default CallSheetEditPage;
