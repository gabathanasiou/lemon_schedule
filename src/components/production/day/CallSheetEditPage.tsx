import React, { useMemo, useState } from 'react';
import ToolbarDivider from '../../ToolbarDivider';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ChevronDown, Clock, Eye, EyeOff, Printer, RotateCcw, Sheet } from 'lucide-react';
import type { DayView } from '../../../lib/dayView';
import type { DayMeta, ReportBlock, ReportDesign } from '../../../types';
import ReportDesigner from '../../reports/ReportDesigner';
import DayReportPreview from '../../reports/DayReportPreview';
import CallSheetCanvas, { callSheetDayBlocks } from './CallSheetCanvas';
import DayPicker from './DayPicker';
import DropdownMenu from '../../DropdownMenu';
import DropdownItem from '../../DropdownItem';
import DropdownSubmenu from '../../DropdownSubmenu';

/**
 * Full-surface per-day call-sheet editor (item 10, D17): the whole design
 * fills a single white page with that day's data; the zone is edited with the
 * REAL reports-designer canvas. Controls (sub-tab toolbar or local header):
 * compact design-chip dropdown · Times · icon-only Preview/Edit · icon-only
 * Reset · icon-only Print; the shared day selector lives left of the view
 * switcher in the toolbar.
 */
export interface CallSheetEditPageProps {
  day: DayView;
  days: DayView[];
  design: ReportDesign;
  designs: ReportDesign[];
  zoneBlocks: ReportBlock[];
  onChangeZone: (blocks: ReportBlock[]) => void;
  /** Writes day properties for the selected day (live grid blocks). */
  patchMeta: (patch: Partial<DayMeta>) => void;
  /** Header right-click on a live grid → "Edit Call Time Stages…". */
  onEditCallTimesSettings?: () => void;
  onReset: () => void;
  onSelectDesign: (id: string) => void;
  onSelectDay: (sectionIndex: number) => void;
  onPrint: () => void;
  onBack: () => void;
  readOnly?: boolean;
  /** True when the day has its own stored zone content (Reset is meaningful). */
  hasOverride: boolean;
  /** When provided the controls portal into the shared sub-tab toolbar
   *  (roadmap 177); otherwise they render as the page's own header. */
  headerTarget?: HTMLElement | null;
  /** Second toolbar slot, immediately left of the view switcher (roadmap 177):
   *  the day selector portals there in BOTH Days views. */
  dayPickerTarget?: HTMLElement | null;
}

const isCallSheet = (d: ReportDesign) => /call\s*sheet/i.test(d.name);

const CallSheetEditPage: React.FC<CallSheetEditPageProps> = ({
  day, days, design, designs, zoneBlocks, onChangeZone, patchMeta, onEditCallTimesSettings, onReset, onSelectDesign, onSelectDay, onPrint, onBack, readOnly, hasOverride, headerTarget, dayPickerTarget,
}) => {
  const [nonce, setNonce] = useState(0);
  const [preview, setPreview] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Design-time aid only: force call times + durations visible in every ribbon
  // block on the editor canvas. Never saved, never printed (item 114).
  const [showRibbonTimes, setShowRibbonTimes] = useState(true);

  // Only call-sheet designs can be per-day edited here.
  const callSheetDesigns = useMemo(() => {
    const list = designs.filter(isCallSheet);
    if (!list.some(d => d.id === design.id)) return [design, ...list];
    return list;
  }, [designs, design]);

  const navOptions = useMemo(
    () => days.map(d => ({ sectionIndex: d.sectionIndex, chronoDay: d.chronoDay, date: d.date, conflicts: d.violations.length })),
    [days],
  );

  const editorKey = `${day.sectionIndex}:${design.id}:${nonce}`;

  // Controls portal into the shared sub-tab toolbar when hosted there
  // (roadmap 177); a pop-out day window falls back to the local header. The
  // day selector has its own slot, immediately left of the view switcher.
  const dayPickerNode = (
    <DayPicker
      theme="dark"
      options={navOptions}
      selectedIndex={day.sectionIndex}
      onSelect={idx => { onSelectDay(idx); }}
      disabled={readOnly}
    />
  );

  const controls = (
    <>
      {/* The main window's toolbar carries the switcher (roadmap 177); the
          local header (pop-out day windows) keeps the Days back button. */}
      {!headerTarget && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center gap-1.5 w-28 px-2 py-1 rounded text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Days
        </button>
      )}

      {!dayPickerTarget && dayPickerNode}

      <div className="ml-auto flex items-center gap-1">
        <DropdownMenu
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          width="w-56"
          theme="dark"
          trigger={
            <button
              type="button"
              title="Call sheet design and template reset"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              Settings <ChevronDown className="w-3 h-3" />
            </button>
          }
        >
          {callSheetDesigns.length > 0 && (
            <DropdownSubmenu id="cs-design" label="Design" icon={<Sheet className="w-3.5 h-3.5" />} width="w-56">
              {callSheetDesigns.map(d => (
                <DropdownItem
                  key={d.id}
                  icon={d.id === design.id ? <Check className="w-3.5 h-3.5" /> : undefined}
                  onClick={() => { setSettingsOpen(false); if (d.id !== design.id) { onSelectDesign(d.id); setPreview(false); } }}
                >
                  {d.name}
                </DropdownItem>
              ))}
            </DropdownSubmenu>
          )}
          <DropdownItem
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            disabled={readOnly || !hasOverride}
            onClick={() => { setSettingsOpen(false); onReset(); setNonce(n => n + 1); setPreview(false); }}
          >
            Reset to template
          </DropdownItem>
        </DropdownMenu>
        <ToolbarDivider dark />
        {!preview && (
          <button
            type="button"
            onClick={() => setShowRibbonTimes(v => !v)}
            title="Show call times & durations in ribbon blocks (preview only — never printed)"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs hover:bg-zinc-800 ${showRibbonTimes ? 'text-amber-400' : 'text-zinc-400 hover:text-white'}`}
          >
            <Clock className="w-3.5 h-3.5" /> Times
          </button>
        )}
        <button
          type="button"
          onClick={() => setPreview(v => !v)}
          title={preview ? 'Edit the call sheet' : 'Preview the day call sheet'}
          aria-label={preview ? 'Edit' : 'Preview'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {preview ? 'Edit' : 'Preview'}
        </button>
        <button
          type="button"
          onClick={onPrint}
          title="Print the call sheet"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      </div>
    </>
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-zinc-950 text-zinc-300" data-call-sheet-edit>
      {headerTarget ? createPortal(controls, headerTarget) : (
        <header className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900">{controls}</header>
      )}
      {dayPickerTarget && createPortal(dayPickerNode, dayPickerTarget)}

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
          patchMeta={patchMeta}
          onEditCallTimesSettings={onEditCallTimesSettings}
          readOnly={readOnly}
          showRibbonTimes={showRibbonTimes}
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
