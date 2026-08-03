import React from 'react';
import { Pencil, Printer, HelpCircle, Clock, FileText, Trash2, StickyNote, CalendarPlus, ChevronDown, Check, LayoutTemplate, Monitor, Table, Flag, Sunset } from 'lucide-react';
import { useProject } from '../../store';
import { RibbonDesign } from '../../types';
import { CellBorders, ViewMode } from '../../lib/persist';
import PageToolbar from '../PageToolbar';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import DropdownSubmenu from '../DropdownSubmenu';
import SortDropdown, { SortCriterion } from '../SortDropdown';
import { formatDuration } from '../../lib/utils';
import { BoneyardExpandButton } from '../BoneyardExpandButton';

interface SelectionSummary {
  count: number;
  totalMinutes: number;
}

interface BufferSummary {
  count: number;
}

interface SortState {
  sortBy: string;
  sortDir: 'asc' | 'desc';
  lockedCriteria: string[];
  sortCategories: SortCriterion[];
  intExtSortLabel: string;
  dayNightSortLabel: string;
}

interface ScheduleToolbarProps {
  shootViolations: unknown[];
  onShowViolations: () => void;
  selectionSummary: SelectionSummary | null;
  bufferSummary: BufferSummary | null;
  isCloud: boolean;
  boneyardCollapsed: boolean;
  onExpandBoneyard: () => void;
  // Auto day breaks
  autoDaybreakOpen: boolean;
  setAutoDaybreakOpen: (v: boolean) => void;
  handleAutoDaybreak: (mode: 'duration' | 'pages') => void;
  handleDeleteAllDaybreaks: () => void;
  hasDaybreakDays: boolean;
  // Banners
  bannerMenuOpen: boolean;
  setBannerMenuOpen: (v: boolean) => void;
  setBannerModalOpen: (v: boolean) => void;
  openBannerDeleteModal: (type: 'NOTE' | 'BREAK') => void;
  // Sort
  sortMenuOpen: boolean;
  setSortMenuOpen: (v: boolean) => void;
  sortState: SortState;
  handleToggleLock: (criterion: string) => void;
  handleSort: (criterion: string, direction: 'asc' | 'desc') => void;
  handleCustomSort: (criterion: string) => void;
  // View menu
  ribbonMenuOpen: boolean;
  setRibbonMenuOpen: (v: boolean) => void;
  ribbonDesigns: RibbonDesign[];
  activeRibbonId: string;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  cellBorders: CellBorders;
  setCellBorders: (v: CellBorders) => void;
  // Edit / print / help
  textEditingEnabled: boolean;
  setTextEditingEnabled: (v: boolean | ((p: boolean) => boolean)) => void;
  readOnly: boolean;
  onPrint?: () => void;
  onShowHelp: () => void;
}

export default function ScheduleToolbar(props: ScheduleToolbarProps) {
  const { dispatch } = useProject();
  const {
    shootViolations, onShowViolations, selectionSummary, bufferSummary, isCloud,
    boneyardCollapsed, onExpandBoneyard,
    autoDaybreakOpen, setAutoDaybreakOpen, handleAutoDaybreak, handleDeleteAllDaybreaks, hasDaybreakDays,
    bannerMenuOpen, setBannerMenuOpen, setBannerModalOpen, openBannerDeleteModal,
    sortMenuOpen, setSortMenuOpen, sortState, handleToggleLock, handleSort, handleCustomSort,
    ribbonMenuOpen, setRibbonMenuOpen, ribbonDesigns, activeRibbonId, viewMode, setViewMode,
    cellBorders, setCellBorders,
    textEditingEnabled, setTextEditingEnabled, readOnly, onPrint, onShowHelp,
  } = props;

  const controls = (
    <>
      <button
        onClick={() => shootViolations.length > 0 && onShowViolations()}
        className={`flex items-center justify-center gap-1 h-7 px-2 rounded-full text-xs font-semibold transition-colors cursor-pointer select-none ${shootViolations.length > 0 ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200'}`}
        title="View All Violations"
      >
        <Flag className={`w-3.5 h-3.5 ${shootViolations.length > 0 ? 'text-red-500' : ''}`} />
        {shootViolations.length > 0 && <span className="shrink-0">{shootViolations.length}</span>}
      </button>
      <div className="w-px h-4 bg-zinc-200" />
      {selectionSummary && (
        <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span>{selectionSummary.count} strip{selectionSummary.count > 1 ? 's' : ''}</span>
          <span className="text-amber-500/60">·</span>
          <span>{formatDuration(selectionSummary.totalMinutes)}</span>
        </span>
      )}
      {bufferSummary && (
        <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          {bufferSummary.count} in buffer
        </span>
      )}
      <div className="w-px h-4 bg-zinc-200" />
      <DropdownMenu
        open={autoDaybreakOpen}
        onOpenChange={setAutoDaybreakOpen}
        width="w-44"
        theme="light"
        trigger={
          <button className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none ${isCloud ? 'bg-blue-950 hover:bg-blue-900 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'}`}>
            <Sunset className="w-3.5 h-3.5 shrink-0" />
             Day Breaks
            <ChevronDown className="w-3 h-3 shrink-0" />
          </button>
        }
      >
        <DropdownItem onClick={() => { setAutoDaybreakOpen(false); handleAutoDaybreak('duration'); }} icon={<Clock className="w-3.5 h-3.5" />}>Add by Duration</DropdownItem>
        <DropdownItem onClick={() => { setAutoDaybreakOpen(false); handleAutoDaybreak('pages'); }} icon={<FileText className="w-3.5 h-3.5" />}>Add by Pages</DropdownItem>
        <DropdownDivider />
        <DropdownItem onClick={() => { setAutoDaybreakOpen(false); handleDeleteAllDaybreaks(); }} icon={<Trash2 className="w-3.5 h-3.5" />} variant="danger" disabled={!hasDaybreakDays}>Delete All</DropdownItem>
      </DropdownMenu>
      <DropdownMenu
        open={bannerMenuOpen}
        onOpenChange={setBannerMenuOpen}
        width="w-48"
        theme="light"
        trigger={
          <button
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none ${isCloud ? 'bg-blue-950 hover:bg-blue-900 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'}`}
            title="Add note/break banners to every day, or delete banners"
          >
            <CalendarPlus className="w-3.5 h-3.5 shrink-0" />
            Banners
            <ChevronDown className="w-3 h-3 shrink-0" />
          </button>
        }
      >
        <DropdownItem onClick={() => { setBannerMenuOpen(false); setBannerModalOpen(true); }} icon={<StickyNote className="w-3.5 h-3.5" />} disabled={!hasDaybreakDays}>Add Banners</DropdownItem>
        <DropdownDivider />
        <DropdownItem onClick={() => { setBannerMenuOpen(false); openBannerDeleteModal('NOTE'); }} icon={<Trash2 className="w-3.5 h-3.5" />} variant="danger">Delete Notes</DropdownItem>
        <DropdownItem onClick={() => { setBannerMenuOpen(false); openBannerDeleteModal('BREAK'); }} icon={<Trash2 className="w-3.5 h-3.5" />} variant="danger">Delete Breaks</DropdownItem>
      </DropdownMenu>
      <SortDropdown
        open={sortMenuOpen}
        onOpenChange={setSortMenuOpen}
        sortBy={sortState.sortBy}
        sortDir={sortState.sortDir}
        lockedCriteria={sortState.lockedCriteria}
        onToggleLock={handleToggleLock}
        onSort={handleSort}
        onCustomSort={handleCustomSort}
        categories={sortState.sortCategories}
        intExtLabel={sortState.intExtSortLabel}
        dayNightLabel={sortState.dayNightSortLabel}
      />
      <div className="w-px h-4 bg-zinc-200" />
      <DropdownMenu
        open={ribbonMenuOpen}
        onOpenChange={setRibbonMenuOpen}
        width="w-48"
        theme="light"
          trigger={
            <button className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none hover:bg-zinc-200 text-zinc-600">
              View
              <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
            </button>
        }
      >
        <DropdownSubmenu id="ribbon-layout" label="Ribbon Layout" icon={<LayoutTemplate className="w-3.5 h-3.5" />} width="w-44">
          {ribbonDesigns.map(d => (
          <DropdownItem
              key={d.id}
              onClick={() => { dispatch({ type: 'SET_ACTIVE_RIBBON', payload: d.id }); setRibbonMenuOpen(false); }}
              icon={activeRibbonId === d.id ? <Check className="w-3.5 h-3.5" /> : undefined}
            >
              {d.name}
            </DropdownItem>
          ))}
        </DropdownSubmenu>
        <DropdownSubmenu id="stripboard-view" label="Stripboard View" icon={<Monitor className="w-3.5 h-3.5" />} width="w-44">
          {(['portrait', 'landscape', 'full'] as const).map(m => (
            <DropdownItem
              key={m}
              onClick={() => { setViewMode(m); setRibbonMenuOpen(false); }}
              icon={viewMode === m ? <Check className="w-3.5 h-3.5" /> : undefined}
            >
              {m === 'portrait' ? 'A4 Portrait' : m === 'landscape' ? 'A4 Landscape' : 'Full Width'}
            </DropdownItem>
          ))}
        </DropdownSubmenu>
        <DropdownDivider />
        <DropdownSubmenu id="cell-borders" label="Cell Borders" icon={<Table className="w-3.5 h-3.5" />} width="w-44">
          {(['none', 'vertical', 'horizontal', 'both'] as CellBorders[]).map(m => (
            <DropdownItem
              key={m}
              onClick={() => { setCellBorders(m); setRibbonMenuOpen(false); }}
              icon={cellBorders === m ? <Check className="w-3.5 h-3.5" /> : undefined}
            >
              {m === 'none' ? 'None' : m === 'vertical' ? 'Vertical' : m === 'horizontal' ? 'Horizontal' : 'Both'}
            </DropdownItem>
          ))}
        </DropdownSubmenu>
      </DropdownMenu>
      <button
        onClick={() => !readOnly && setTextEditingEnabled(p => !p)}
        className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none ${readOnly ? 'opacity-30 cursor-not-allowed' : ''} ${textEditingEnabled ? 'bg-blue-600 hover:bg-blue-500 text-white' : isCloud ? 'bg-blue-950 hover:bg-blue-900 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'}`}
      >
        <Pencil className="w-3.5 h-3.5 shrink-0" />
        Edit
      </button>
      <div className="w-px h-4 bg-zinc-200" />
      {onPrint && (
        <button
          onClick={onPrint}
          className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${isCloud ? 'bg-blue-950 hover:bg-blue-900 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'}`}
        >
          <Printer className="w-3.5 h-3.5 shrink-0" />
          Print
        </button>
      )}
      <div className="w-px h-4 bg-zinc-200" />
      <button
        onClick={onShowHelp}
        className="flex items-center justify-center w-7 h-7 rounded-full text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200 transition-colors cursor-pointer select-none"
        title="Keyboard Shortcuts & Help"
      >
        <HelpCircle className="w-4 h-4" />
      </button>
    </>
  );

  return (
    <PageToolbar
      theme="light"
      justify={boneyardCollapsed ? 'between' : 'end'}
      children={boneyardCollapsed ? <BoneyardExpandButton onClick={onExpandBoneyard} /> : controls}
      rightContent={boneyardCollapsed ? controls : undefined}
    />
  );
}
