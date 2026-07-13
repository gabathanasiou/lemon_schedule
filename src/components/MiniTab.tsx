import React, { useRef, useState, useLayoutEffect } from 'react';
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

export default function MiniTab({ tabs, activeTab, onChange, rightContent, theme = 'light', onPopout, shiftHeld = false }: MiniTabProps) {
  const t = THEME[theme];
  const isCloud = useIsCloudProject();
  const activeBg = theme === 'light' && isCloud ? 'bg-blue-950' : 'bg-zinc-950';
  const activeText = theme === 'light' && isCloud ? 'text-blue-50' : 'text-white';

  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; tabId: string } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const check = () => {
      const container = tabsRef.current;
      if (!container) return;
      setCollapsed(container.scrollWidth > container.clientWidth);
    };
    const ro = new ResizeObserver(check);
    ro.observe(el);
    check();
    return () => ro.disconnect();
  }, [tabs]);

  const active = tabs.find(t => t.id === activeTab);
  const dropdownTriggerTheme = theme === 'dark' ? 'dark' : 'light';

  return (
    <div ref={measureRef} className={`flex items-center justify-between px-3 pt-2 pb-2 border-b shrink-0 ${t.bar}`}>
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <div ref={tabsRef} className={`items-center gap-1 min-w-0 ${collapsed ? 'overflow-hidden h-0 invisible flex' : 'flex'}`}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
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
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                  isActive ? `${activeBg} ${activeText}` : t.inactive
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {collapsed && active && (
          <DropdownMenu
            open={dropdownOpen}
            onOpenChange={setDropdownOpen}
            width="w-48"
            theme={dropdownTriggerTheme}
            align="left"
            trigger={
              <button
                onClick={() => setDropdownOpen(p => !p)}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors flex items-center gap-1 whitespace-nowrap ${activeBg} ${activeText}`}
              >
                <span className="truncate">{active.label}</span>
                <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
              </button>
            }
          >
            {tabs.map(tab => (
              <DropdownItem
                key={tab.id}
                onClick={() => { onChange(tab.id); setDropdownOpen(false); }}
              >
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
