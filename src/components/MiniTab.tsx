import React, { useRef, useState, useLayoutEffect, useCallback } from 'react';
import { useIsCloudProject } from '../store';
import { ExternalLink, ChevronDown } from 'lucide-react';
import { IS_COARSE } from '../lib/device';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';

interface MiniTabItem {
  id: string;
  label: string;
}

interface MiniTabProps {
  tabs: MiniTabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  rightContent?: React.ReactNode;
  theme?: 'light' | 'dark';
  onPopout?: (tabId: string) => void;
  shiftHeld?: boolean;
}

const THEME = {
  light: {
    bar: 'bg-white border-zinc-200',
    inactive: 'text-zinc-500 hover:text-zinc-900',
  },
  dark: {
    bar: 'bg-zinc-900 border-zinc-800',
    inactive: 'text-zinc-500 hover:text-zinc-300',
  },
} as const;

const GAP = 4;

export default function MiniTab({ tabs, activeTab, onChange, rightContent, theme = 'light', onPopout, shiftHeld = false }: MiniTabProps) {
  const t = THEME[theme];
  const isCloud = useIsCloudProject();
  const activeBg = theme === 'light' && isCloud ? 'bg-blue-950' : 'bg-zinc-950';
  const activeText = theme === 'light' && isCloud ? 'text-blue-50' : 'text-white';

  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; tabId: string } | null>(null);
  const [overflowFromIndex, setOverflowFromIndex] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);
  const tabWidthsRef = useRef<number[]>([]);

  const measure = useCallback(() => {
    const el = measureRef.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll('[data-mtab-id]')) as HTMLElement[];
    if (items.length === 0) return;
    const containerWidth = el.parentElement?.getBoundingClientRect().width ?? 0;
    if (containerWidth <= 0) return;
    const gaps = GAP * (items.length - 1);
    const widths = items.map(i => i.getBoundingClientRect().width);
    tabWidthsRef.current = widths;
    const total = widths.reduce((a, b) => a + b, 0) + gaps;
    if (total <= containerWidth) { setOverflowFromIndex(null); return; }
    let acc = 0;
    for (let i = 0; i < widths.length; i++) {
      acc += widths[i] + (i > 0 ? GAP : 0);
      if (acc > containerWidth) { setOverflowFromIndex(i); return; }
    }
    setOverflowFromIndex(null);
  }, []);

  useLayoutEffect(() => {
    const el = measureRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [measure]);

  const overflowIdx = overflowFromIndex ?? tabs.length;
  const visibleTabs = tabs.slice(0, overflowIdx);
  const overflowTabs = tabs.slice(overflowIdx);
  const hasOverflow = overflowTabs.length > 0;
  const dropdownTriggerTheme = theme === 'dark' ? 'dark' : 'light';

  const tabBtnClass = (isActive: boolean) =>
    `px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${isActive ? `${activeBg} ${activeText}` : t.inactive}`;

  return (
    <div className={`flex items-center justify-between px-3 pt-2 pb-2 border-b shrink-0 ${t.bar}`}>
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <div ref={measureRef} className="flex items-center gap-1 min-w-0">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            const isVisible = visibleTabs.includes(tab);
            return (
              <button
                key={tab.id}
                data-mtab-id={tab.id}
                onClick={() => {
                  if (shiftHeld && !IS_COARSE && onPopout) {
                    onPopout(tab.id);
                  } else {
                    onChange(tab.id);
                  }
                }}
                onContextMenu={onPopout && !IS_COARSE ? (e: React.MouseEvent) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
                } : undefined}
                className={`${tabBtnClass(isActive)} ${isVisible ? '' : 'absolute invisible'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {hasOverflow && (
          <DropdownMenu
            open={dropdownOpen}
            onOpenChange={setDropdownOpen}
            width="w-48"
            theme={dropdownTriggerTheme}
            align="left"
            trigger={
              <button onClick={() => setDropdownOpen(p => !p)} className={`${tabBtnClass(false)} flex items-center gap-1`}>
                More
                <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
              </button>
            }
          >
            {overflowTabs.map(tab => (
              <DropdownItem key={tab.id} onClick={() => { onChange(tab.id); setDropdownOpen(false); }}>
                {tab.label}
              </DropdownItem>
            ))}
          </DropdownMenu>
        )}
      </div>
      {rightContent && <div className="flex items-center gap-2 shrink-0">{rightContent}</div>}
      {contextMenu && onPopout && (
        <ContextMenu open={true} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
          <ContextMenuItem onClick={() => { onPopout(contextMenu.tabId); setContextMenu(null); }} icon={<ExternalLink className="w-3.5 h-3.5" />}>
            Open in New Window
          </ContextMenuItem>
        </ContextMenu>
      )}
    </div>
  );
}
