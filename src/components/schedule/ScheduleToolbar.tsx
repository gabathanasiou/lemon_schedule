import React from 'react';
import { Pencil, Printer, HelpCircle, Clock, FileText, Trash2, StickyNote, CalendarPlus, ChevronDown, Check, LayoutTemplate, Monitor, Table, Flag, Sunset, Loader2 } from 'lucide-react';
import { useProject } from '../../store';
import { useDialog } from '../Dialog';
import { RibbonDesign } from '../../types';
import { CellBorders, ViewMode } from '../../lib/persist';
import PageToolbar from '../PageToolbar';
import Button from '../Button';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import DropdownSubmenu from '../DropdownSubmenu';
import { ItemManagerDropdown } from '../DropdownMenu';
import SortDropdown, { SortCriterion } from '../SortDropdown';
import { formatDuration, generateUUID } from '../../lib/utils';
import { BoneyardExpandButton, BoneyardCollapseButton } from '../BoneyardExpandButton';

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
  onCollapseBoneyard: () => void;
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
  isEditPending: boolean;
  onToggleEdit: () => void;
  readOnly: boolean;
  onPrint?: () => void;
  onShowHelp: () => void;
}

export default function ScheduleToolbar(props: ScheduleToolbarProps) {
  const { state, dispatch } = useProject();
  const project = state.present;
  const {
    shootViolations, onShowViolations, selectionSummary, bufferSummary, isCloud,
    boneyardCollapsed, onExpandBoneyard, onCollapseBoneyard,
    autoDaybreakOpen, setAutoDaybreakOpen, handleAutoDaybreak, handleDeleteAllDaybreaks, hasDaybreakDays,
    bannerMenuOpen, setBannerMenuOpen, setBannerModalOpen, openBannerDeleteModal,
    sortMenuOpen, setSortMenuOpen, sortState, handleToggleLock, handleSort, handleCustomSort,
    ribbonMenuOpen, setRibbonMenuOpen, ribbonDesigns, activeRibbonId, viewMode, setViewMode,
    cellBorders, setCellBorders,
    textEditingEnabled, setTextEditingEnabled, readOnly, onPrint, onShowHelp,
    isEditPending, onToggleEdit,
  } = props;

  const [showVersionsMenu, setShowVersionsMenu] = React.useState(false);
  const dialog = useDialog();
  const version = project.versions.find(v => v.id === project.activeVersionId);

  const versionPicker = (
    <ItemManagerDropdown
      open={showVersionsMenu}
      onClose={(open) => setShowVersionsMenu(open)}
      items={project.versions.map(v => ({ id: v.id, name: v.name }))}
      activeId={project.activeVersionId}
      closeOnSelect
      onSelect={(id) => dispatch({ type: 'SET_ACTIVE_VERSION', payload: id })}
      onRename={(id, name) => dispatch({ type: 'RENAME_VERSION', payload: { id, name } })}
      onDuplicate={(id) => {
        const v = project.versions.find(x => x.id === id);
        if (!v) return;
        const name = `${v.name} Copy`;
        const newId = generateUUID();
        dispatch({ type: 'NEW_VERSION', payload: { name, cloneFromId: id, id: newId } });
        return newId;
      }}
      onDelete={async (id) => {
        const ok = await dialog.confirm({ title: 'Delete Version?', message: 'This can be restored from Trash.', danger: true, suppressKey: 'lemon_schedule_dnwa_delete_version' });
        if (ok) dispatch({ type: 'DELETE_VERSION', payload: id });
      }}
      onCreate={() => {
        const name = `V${String(project.versions.length + 1).padStart(2, '0')}`;
        const newId = generateUUID();
        dispatch({ type: 'NEW_VERSION', payload: { name, cloneFromId: null, id: newId } });
        return newId;
      }}
      readOnly={false}
      theme="light"
      label="Version"
      header="SCHEDULE VERSIONS"
      itemLabel="Version"
      trigger={
        <Button theme="light">
          <span className="text-xs font-semibold text-zinc-400">Schedule:</span>
          <span className="text-xs font-semibold text-zinc-900">{version?.name || 'Select Version'}</span>
          <ChevronDown className="w-3 h-3 text-zinc-400" />
        </Button>
      }
    />
  );

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
          <Button variant="primary" cloud={isCloud}>
            <Sunset className="w-3.5 h-3.5 shrink-0" />
             Day Breaks
            <ChevronDown className="w-3 h-3 shrink-0" />
          </Button>
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
          <Button
            variant="primary"
            cloud={isCloud}
            title="Add note/break banners to every day, or delete banners"
          >
            <CalendarPlus className="w-3.5 h-3.5 shrink-0" />
            Banners
            <ChevronDown className="w-3 h-3 shrink-0" />
          </Button>        }
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
            <Button>
              View
              <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
            </Button>
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
      <Button
        variant="primary"
        cloud={isCloud}
        onClick={() => !readOnly && onToggleEdit()}
        disabled={readOnly}
        className={textEditingEnabled ? 'bg-blue-600! hover:bg-blue-500!' : ''}
      >
        {isEditPending ? (
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
        ) : (
          <Pencil className="w-3.5 h-3.5 shrink-0" />
        )}
        Edit
      </Button>
      <div className="w-px h-4 bg-zinc-200" />
      {onPrint && (
        <Button variant="primary" cloud={isCloud} onClick={onPrint}>
          <Printer className="w-3.5 h-3.5 shrink-0" />
          Print
        </Button>
      )}
      <div className="w-px h-4 bg-zinc-200" />
      <button
        onClick={onShowHelp}
        className="flex items-center justify-center w-7 h-7 rounded-full text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200 transition-colors cursor-pointer select-none"
        title="Keyboard Shortcuts & Help"
      >
        <HelpCircle className="w-4 h-4" />
      </button>
      <div className="w-px h-4 bg-zinc-200" />
      {versionPicker}
    </>
  );

  return (
    <PageToolbar
      theme="light"
      justify="between"
      children={boneyardCollapsed
        ? <BoneyardExpandButton onClick={onExpandBoneyard} />
        : <BoneyardCollapseButton onClick={onCollapseBoneyard} />}
      rightContent={controls}
    />
  );
}
