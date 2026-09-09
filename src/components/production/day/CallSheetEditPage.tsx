import React, { useMemo, useState } from 'react';
import { ArrowLeft, Printer, RotateCcw, Sheet } from 'lucide-react';
import type { DayView } from '../../../lib/dayView';
import type { ReportBlock, ReportDesign } from '../../../types';
import { formatDateShort } from '../../../lib/utils';
import ReportDesigner from '../../reports/ReportDesigner';
import CallSheetCanvas, { callSheetDayBlocks } from './CallSheetCanvas';
import GroupedSelect, { GroupedSelectItem } from './GroupedSelect';

/**
 * Full-surface per-day call-sheet editor (item 10, D17). Reuses the Reports
 * Designer in ZONE mode: the palette + canvas edit only the `callSheetEdit`
 * zone's blocks, which are stored per day in `daybreakMeta.callSheets[designId]`.
 * The template's zone children are the default until the day overrides them.
 */
export interface CallSheetEditPageProps {
  day: DayView;
  design: ReportDesign;
  designs: ReportDesign[];
  zoneBlocks: ReportBlock[];
  onChangeZone: (blocks: ReportBlock[]) => void;
  onReset: () => void;
  onSelectDesign: (id: string) => void;
  onPrint: () => void;
  onBack: () => void;
  readOnly?: boolean;
  /** True when the day has its own stored zone content (Reset is meaningful). */
  hasOverride: boolean;
}

const isCallSheet = (d: ReportDesign) => /call\s*sheet/i.test(d.name);

const CallSheetEditPage: React.FC<CallSheetEditPageProps> = ({
  day, design, designs, zoneBlocks, onChangeZone, onReset, onSelectDesign, onPrint, onBack, readOnly, hasOverride,
}) => {
  const [nonce, setNonce] = useState(0);

  const items: GroupedSelectItem[] = useMemo(() => designs.map(d => ({
    id: d.id,
    name: d.name,
    group: isCallSheet(d) ? 'Call Sheets' : 'Other Reports',
  })), [designs]);

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-zinc-950 text-zinc-300" data-call-sheet-edit>
      <header className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800">
          <ArrowLeft className="w-3.5 h-3.5" /> Days
        </button>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
          <Sheet className="w-3.5 h-3.5 text-zinc-500" />
          DAY {day.chronoDay} · {formatDateShort(day.date)}
        </span>
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider ml-2">Design</span>
        <GroupedSelect
          className="w-56"
          items={items}
          mode="single"
          selectedIds={[design.id]}
          disabled={readOnly}
          onChange={ids => { if (ids[0]) onSelectDesign(ids[0]); }}
        />
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            disabled={readOnly || !hasOverride}
            onClick={() => { onReset(); setNonce(n => n + 1); }}
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
      {callSheetDayBlocks(design) ? (
        <CallSheetCanvas
          key={`${day.sectionIndex}:${design.id}:${nonce}`}
          design={design}
          day={day}
          zoneBlocks={zoneBlocks}
          onChangeZone={onChangeZone}
          readOnly={readOnly}
        />
      ) : (
        <ReportDesigner
          key={`${day.sectionIndex}:${design.id}:${nonce}`}
          zone={{ designId: design.id, blocks: zoneBlocks, onChange: onChangeZone, scope: 'days' }}
        />
      )}
    </div>
  );
};

export default CallSheetEditPage;
