import React from 'react';
import { Scene } from '../types';
import { ArrowUpDown, ChevronDown, Eye, Sunrise, FileText, Clock, Building2, Sun } from 'lucide-react';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import { useIsCloudProject } from '../store';

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

function SortDropdown({ open, onOpenChange, sortBy, sortDir, onSort, onCustomSort, categories, intExtLabel, dayNightLabel }: SortDropdownProps) {
  const isCloud = useIsCloudProject();

  const handleClick = (criterion: string) => {
    if ((criterion === 'int_ext' || criterion === 'day_night') && onCustomSort) {
      onCustomSort(criterion);
      return;
    }

    if (criterion === sortBy) {
      onSort(criterion, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(criterion, 'asc');
    }
  };

  const renderItem = (criterion: SortCriterion) => {
    const isActive = sortBy === criterion.key;
    const icon = criterion.icon || BUILTIN_ICONS[criterion.key] || null;
    return (
      <DropdownItem
        key={criterion.key}
        icon={icon}
        onClick={() => handleClick(criterion.key)}
        keepOpen
        rightAction={isActive ? {
          icon: sortDir === 'asc' ? <ArrowUp /> : <ArrowDown />,
          onClick: () => {},
          title: sortDir === 'asc' ? 'Ascending' : 'Descending',
        } : undefined}
      >
        {criterion.label}
      </DropdownItem>
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
      {BUILTIN_CRITERIA.map(renderItem)}
      <DropdownDivider />
      <DropdownItem
        icon={BUILTIN_ICONS.int_ext}
        onClick={() => handleClick('int_ext')}
        keepOpen
      >
        {intExtLabel || 'INT / EXT'}
      </DropdownItem>
      <DropdownItem
        icon={BUILTIN_ICONS.day_night}
        onClick={() => handleClick('day_night')}
        keepOpen
      >
        {dayNightLabel || 'Day / Night'}
      </DropdownItem>
      <DropdownDivider />
      {categories.map(renderItem)}
    </DropdownMenu>
  );
}

export { SortDropdown };
export default SortDropdown;
