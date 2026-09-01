import React from 'react';
import { useIsCloudProject } from '../store';
import { ExternalLink } from 'lucide-react';
import { IS_COARSE, isTouchLike } from '../lib/device';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import Button from './Button';

export interface ToolbarTab {
  id: string;
  label: string;
}

interface PageToolbarProps {
  tabs?: ToolbarTab[];
  activeTab?: string;
  onChange?: (id: string) => void;
  onPopout?: (tabId: string) => void;
  shiftHeld?: boolean;
  children?: React.ReactNode;
  rightContent?: React.ReactNode;
  justify?: 'between' | 'end' | 'start';
  theme?: 'light' | 'dark';
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

const JUSTIFY = {
  between: 'justify-between',
  end: 'justify-end',
  start: 'justify-start',
} as const;

export default function PageToolbar({ tabs, activeTab, onChange, onPopout, shiftHeld = false, children, rightContent, justify = 'between', theme = 'light' }: PageToolbarProps) {
  const t = THEME[theme];
  const isCloud = useIsCloudProject();

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

  const dragRef = React.useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const replayRef = React.useRef(false);
  const isInsideToolbar = React.useCallback((target: EventTarget | null) => {
    // React dispatches via the fiber tree, so events on portaled content
    // (dropdown menus) still pass through this component's ancestors —
    // only handle touches that physically start inside the toolbar DOM.
    return target instanceof Node && !!scrollRef.current?.contains(target);
  }, []);
  const onPointerDownCapture = React.useCallback((e: React.PointerEvent) => {
    if (!isTouchLike(e.pointerType)) return;
    if (!isInsideToolbar(e.target)) return;
    if (replayRef.current) { replayRef.current = false; return; }
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
    if ((e.target as HTMLElement).closest('[aria-haspopup]')) {
      // Radix opens menus on pointerdown; delay the open until the tap is confirmed (no drag)
      e.stopPropagation();
    }
  }, [isInsideToolbar]);
  const onPointerMoveCapture = React.useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.moved) return;
    if (!isInsideToolbar(e.target)) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) d.moved = true;
  }, [isInsideToolbar]);
  const onClickCapture = React.useCallback((e: React.MouseEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!isInsideToolbar(e.target)) return;
    if (d.moved) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const trigger = (e.target as HTMLElement).closest('[aria-haspopup]');
    if (trigger) {
      e.preventDefault();
      e.stopPropagation();
      replayRef.current = true;
      trigger.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerType: 'touch',
        clientX: d.x,
        clientY: d.y,
      }));
    }
  }, [isInsideToolbar]);

  return (
    <div ref={scrollRef} onScroll={checkScroll}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onClickCapture={onClickCapture}
      className={`overflow-x-auto overscroll-x-contain border-b shrink-0 ${t.bar} [&::-webkit-scrollbar]:hidden touch-pan-x`}
      style={{ scrollbarWidth: 'none', WebkitMaskImage: scrollMask, maskImage: scrollMask }}>
      <div className={`flex items-center ${JUSTIFY[justify]} gap-2 shrink-0 w-fit min-w-full px-3 pt-2 pb-2`}>
        {tabs && tabs.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
          {tabs.map(tab => {
            const active = activeTab === tab.id;
            return (
              <Button
                key={tab.id}
                variant="tab"
                theme={theme}
                cloud={isCloud}
                active={active}
                onClick={() => {
                  if (shiftHeld && !IS_COARSE && onPopout) {
                    onPopout(tab.id);
                  } else {
                    onChange?.(tab.id);
                  }
                }}
                onContextMenu={onPopout && !IS_COARSE ? (e: React.MouseEvent) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
                } : undefined}
                className="shrink-0"
              >
                {tab.label}
              </Button>
            );
          })}
          </div>
        )}
        {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
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
