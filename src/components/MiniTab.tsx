import React from 'react';
import { useIsCloudProject } from '../store';
import { ExternalLink } from 'lucide-react';
import { IS_COARSE } from '../lib/device';
import { ContextMenu, ContextMenuItem } from './ContextMenu';

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
  const inactiveHover = theme === 'light' && isCloud
    ? 'text-blue-950 hover:bg-blue-950/10 hover:text-blue-950'
    : t.inactive;

  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; tabId: string } | null>(null);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollMask, setScrollMask] = React.useState('none');
  const checkScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atLeft = el.scrollLeft <= 2;
    const atRight = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2;
    if (atLeft && atRight) setScrollMask('none');
    else if (atLeft) setScrollMask('linear-gradient(to left, transparent, black 12px)');
    else if (atRight) setScrollMask('linear-gradient(to right, transparent, black 12px)');
    else setScrollMask('linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent)');
  }, []);

  React.useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll]);

  return (
    <div ref={scrollRef} onScroll={checkScroll} className={`overflow-x-auto border-b shrink-0 ${t.bar} [&::-webkit-scrollbar]:hidden`} style={{ scrollbarWidth: 'none', WebkitMaskImage: scrollMask, maskImage: scrollMask }}>
      <div className="flex items-center justify-between gap-2 shrink-0 w-fit min-w-full px-3 pt-2 pb-2">
        <div className="flex items-center gap-1 shrink-0">
        {tabs.map(tab => {
          const active = activeTab === tab.id;
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
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors shrink-0 whitespace-nowrap ${
                active ? `${activeBg} ${activeText}` : inactiveHover
              }`}
            >
              {tab.label}
            </button>
          );
        })}
        </div>
        {rightContent && <div className="flex items-center gap-2 shrink-0">{rightContent}</div>}
      </div>
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
