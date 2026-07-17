import React from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { Scene } from '../types';
import { ArrowUpDown, ChevronDown, Eye, Sunrise, FileText, Clock, Building2, Sun, Lock, LockOpen } from 'lucide-react';
import DropdownMenu, { getDropdownClasses } from './DropdownMenu';
import DropdownDivider from './DropdownDivider';
import { useIsCloudProject } from '../store';
import { IS_COARSE } from '../lib/device';

export interface SortCriterion {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface SortDropdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sortBy: string | null;
  sortDir: 'asc' | 'desc';
  lockedCriteria: string[];
  onToggleLock: (criterion: string) => void;
  onSort: (criterion: string, direction: 'asc' | 'desc') => void;
  onCustomSort?: (criterion: string) => void;
  categories: SortCriterion[];
  intExtLabel?: string;
  dayNightLabel?: string;
}

const BUILTIN_ICONS: Record<string, React.ReactNode> = {
  scene_number: <Eye className="w-3.5 h-3.5" />,
  script_day: <Sunrise className="w-3.5 h-3.5" />,
  page_count: <FileText className="w-3.5 h-3.5" />,
  duration: <Clock className="w-3.5 h-3.5" />,
  int_ext: <Building2 className="w-3.5 h-3.5" />,
  day_night: <Sun className="w-3.5 h-3.5" />,
};

const ArrowUp = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const ArrowDown = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const LockIcon = () => <Lock className="w-3 h-3" />;

const LockOpenIcon = () => <LockOpen className="w-3 h-3" />;

const BUILTIN_CRITERIA: SortCriterion[] = [
  { key: 'scene_number', label: 'Scene Number' },
  { key: 'script_day', label: 'Script Day' },
  { key: 'page_count', label: 'Page Count' },
  { key: 'duration', label: 'Duration' },
];

export function compareByCustomOrder(order: string[], getValue: (scene: Scene) => string): (a: Scene, b: Scene) => number {
  return (a, b) => {
    const valA = getValue(a);
    const valB = getValue(b);
    const idxA = order.indexOf(valA);
    const idxB = order.indexOf(valB);
    const posA = idxA === -1 ? order.length : idxA;
    const posB = idxB === -1 ? order.length : idxB;
    return posA - posB;
  };
}

export function getLockedTiebreakerResult(
  lockedCriteria: string[],
  primaryCriterion: string,
  sceneA: Scene,
  sceneB: Scene,
  customSortOrders: Record<string, string[]>,
  rowAEstimatedDuration?: number,
  rowBEstimatedDuration?: number,
): number {
  for (const lock of lockedCriteria) {
    if (lock === primaryCriterion) continue;
    let result = 0;
    if (lock === 'scene_number') {
      result = sceneA.sceneNumber.localeCompare(sceneB.sceneNumber, undefined, { numeric: true, sensitivity: 'base' });
    } else if (lock === 'script_day') {
      result = sceneA.scriptDay.localeCompare(sceneB.scriptDay, undefined, { numeric: true, sensitivity: 'base' });
    } else if (lock === 'page_count') {
      result = (sceneA.pageCountDecimal || 0) - (sceneB.pageCountDecimal || 0);
    } else if (lock === 'duration') {
      result = (rowAEstimatedDuration || 0) - (rowBEstimatedDuration || 0);
    } else if (lock === 'int_ext') {
      const order = customSortOrders['int_ext'];
      if (order) { result = compareByCustomOrder(order, s => s.intExt)(sceneA, sceneB); }
      else { result = sceneA.intExt.localeCompare(sceneB.intExt); }
    } else if (lock === 'day_night') {
      const order = customSortOrders['day_night'];
      if (order) { result = compareByCustomOrder(order, s => s.dayNight)(sceneA, sceneB); }
      else { result = sceneA.dayNight.localeCompare(sceneB.dayNight); }
    } else {
      const valA = String((sceneA as any)[lock] ?? '');
      const valB = String((sceneB as any)[lock] ?? '');
      result = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
    }
    if (result !== 0) return result;
  }
  return 0;
}

const MENU_ITEM = IS_COARSE ? 'px-4 py-3 text-xs' : 'px-3 py-2 text-xs';
const BTN_SIZE = IS_COARSE ? 'w-8 h-8' : 'w-6 h-6';
const BTN_ICON = 'w-3.5 h-3.5';

function SortDropdown({ open, onOpenChange, sortBy, sortDir, lockedCriteria, onToggleLock, onSort, onCustomSort, categories, intExtLabel, dayNightLabel }: SortDropdownProps) {
  const isCloud = useIsCloudProject();
  const d = getDropdownClasses('light');

  const isLocked = (key: string) => lockedCriteria.includes(key);

  const handleClick = (criterion: string) => {
    if ((criterion === 'int_ext' || criterion === 'day_night') && onCustomSort) {
      if (isLocked(criterion) && sortBy !== criterion) return;
      onCustomSort(criterion);
      return;
    }

    if (isLocked(criterion) && sortBy !== criterion) return;

    if (criterion === sortBy) {
      onSort(criterion, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(criterion, 'asc');
    }
  };

  const renderRow = (criterion: SortCriterion) => {
    const isActive = sortBy === criterion.key;
    const locked = isLocked(criterion.key);
    const icon = criterion.icon || BUILTIN_ICONS[criterion.key] || null;
    const dirIcon = isActive ? (sortDir === 'asc' ? <ArrowUp /> : <ArrowDown />) : null;

    return (
      <div key={criterion.key} className="flex items-center w-full gap-1">
        <RadixDropdownMenu.Item
          className={`flex-1 min-w-0 ${MENU_ITEM} rounded flex items-center gap-2 transition-colors outline-none cursor-pointer select-none mr-0 ${d.itemDefault}`}
          onSelect={(e) => { e.preventDefault(); handleClick(criterion.key); }}
          onTouchStart={() => {}}
        >
          {icon && <span className={`${d.icon} shrink-0`}>{icon}</span>}
          <span className="flex-1 truncate flex items-center gap-1">
            {criterion.label}
            {dirIcon && <span className="ml-0.5">{dirIcon}</span>}
          </span>
        </RadixDropdownMenu.Item>
        <RadixDropdownMenu.Item
          className={`shrink-0 ${BTN_SIZE} rounded flex items-center justify-center outline-none cursor-pointer ${d.btnBase} hover:bg-zinc-100`}
          onSelect={(e) => { e.preventDefault(); onToggleLock(criterion.key); }}
          onTouchStart={() => {}}
        >
          {locked
            ? <Lock className={`${BTN_ICON} text-red-500`} />
            : <LockOpen className={`${BTN_ICON} text-zinc-400`} />
          }
        </RadixDropdownMenu.Item>
      </div>
    );
  };

  const renderIntExtDayNight = (criterion: 'int_ext' | 'day_night', label: string | undefined, defaultLabel: string) => {
    const isActive = sortBy === criterion;
    const locked = isLocked(criterion);
    const dirIcon = isActive ? (sortDir === 'asc' ? <ArrowUp /> : <ArrowDown />) : null;
    const display = label || defaultLabel;

    return (
      <div key={criterion} className="flex items-center w-full gap-1">
        <RadixDropdownMenu.Item
          className={`flex-1 min-w-0 ${MENU_ITEM} rounded flex items-center gap-2 transition-colors outline-none cursor-pointer select-none mr-0 ${d.itemDefault}`}
          onSelect={(e) => { e.preventDefault(); handleClick(criterion); }}
          onTouchStart={() => {}}
        >
          <span className={`${d.icon} shrink-0`}>{BUILTIN_ICONS[criterion]}</span>
          <span className="flex-1 truncate flex items-center gap-1">
            {display}
            {dirIcon && <span className="ml-0.5">{dirIcon}</span>}
          </span>
        </RadixDropdownMenu.Item>
        <RadixDropdownMenu.Item
          className={`shrink-0 ${BTN_SIZE} rounded flex items-center justify-center outline-none cursor-pointer ${d.btnBase} hover:bg-zinc-100`}
          onSelect={(e) => { e.preventDefault(); onToggleLock(criterion); }}
          onTouchStart={() => {}}
        >
          {locked
            ? <Lock className={`${BTN_ICON} text-red-500`} />
            : <LockOpen className={`${BTN_ICON} text-zinc-400`} />
          }
        </RadixDropdownMenu.Item>
      </div>
    );
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={onOpenChange}
      width="w-56"
      theme="light"
      trigger={
        <button className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none ${isCloud ? 'bg-blue-950 hover:bg-blue-900 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'}`}>
          <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
          Sort
          <ChevronDown className="w-3 h-3 shrink-0" />
        </button>
      }
    >
      {BUILTIN_CRITERIA.map(renderRow)}
      <DropdownDivider />
      {renderIntExtDayNight('int_ext', intExtLabel, 'INT / EXT')}
      {renderIntExtDayNight('day_night', dayNightLabel, 'Day / Night')}
      <DropdownDivider />
      {categories.map(renderRow)}
    </DropdownMenu>
  );
}

export { SortDropdown };
export default SortDropdown;
