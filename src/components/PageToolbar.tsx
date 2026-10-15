import React from 'react';
import { useProjectTheme } from '../store';
import { projectAccentOf } from '../lib/projectTheme';
import { ExternalLink } from 'lucide-react';
import { IS_COARSE, isTouchLike } from '../lib/device';
import { useSlidingPill, TAB_PILL } from '@gabriel/ui-kit';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import Button from './Button';
import { CHROME_BAR_INSET, CHROME_BAR_INSET_PX, CHROME_CLUSTER_GAP, CHROME_CLUSTER_GAP_PX, CHROME_ITEM_GAP, CHROME_TAB_GAP } from '../lib/chromeSpacing';

export interface ToolbarTab {
  id: string;
  label: string;
  /** Mini-tab icon (roadmap 258) — the resting face while the labels are docked. */
  icon?: React.ReactNode;
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
  const projectTheme = useProjectTheme();
  const accent = projectAccentOf(projectTheme);

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

  // Dock mode (roadmap 258): the mini tabs collapse to icons ONLY when the
  // full labels would not fit the toolbar. The strip's full-label width is
  // measured once at mount (it is stable for an instance); the sibling groups
  // are read live, so the dock never feeds back into its own measurement.
  const [tabsDock, setTabsDock] = React.useState(false);
  const stripRef = React.useRef<HTMLDivElement>(null);
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const childrenGroupRef = React.useRef<HTMLDivElement>(null);
  const rightGroupRef = React.useRef<HTMLDivElement>(null);
  /* The active sub-tab's fill is the row's measured pill (useSlidingPill +
     TAB_PILL — the Seg mechanism), so the selection box glides (roadmap 258). */
  const activeTabIdx = Math.max(0, (tabs ?? []).findIndex(t => t.id === activeTab));
  const tabPill = useSlidingPill(stripRef, tabRefs, activeTabIdx);
  const tabPillFill = TAB_PILL[theme][accent === 'emerald' ? 'emerald' : accent ? 'blue' : 'plain'];
  const requiredStripWidthRef = React.useRef<number | null>(null);
  const syncTabsDock = React.useCallback(() => {
    const el = scrollRef.current;
    const strip = stripRef.current;
    if (!el || !strip) return;
    if (requiredStripWidthRef.current == null) requiredStripWidthRef.current = Math.ceil(strip.scrollWidth);
    const others = (childrenGroupRef.current?.scrollWidth ?? 0) + (rightGroupRef.current?.scrollWidth ?? 0);
    const groups = 1 + (childrenGroupRef.current ? 1 : 0) + (rightGroupRef.current ? 1 : 0);
    // Derived from the shared scale (roadmap 264) — never hand-copy a gap here.
    const needed = requiredStripWidthRef.current + others + CHROME_BAR_INSET_PX * 2 + (groups - 1) * CHROME_CLUSTER_GAP_PX;
    setTabsDock(needed > el.clientWidth - 4);
  }, []);
  React.useLayoutEffect(() => {
    syncTabsDock();
    const el = scrollRef.current;
    const strip = stripRef.current;
    if (!el || !strip) return;
    const ro = new ResizeObserver(syncTabsDock);
    ro.observe(el);
    ro.observe(strip);
    if (childrenGroupRef.current) ro.observe(childrenGroupRef.current);
    if (rightGroupRef.current) ro.observe(rightGroupRef.current);
    return () => ro.disconnect();
  }, [syncTabsDock, tabs?.length]);

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
      className={`overflow-x-auto overscroll-x-contain border-b shrink-0 group-data-[island=left]:pl-safe group-data-[island=right]:pr-safe ${t.bar} [&::-webkit-scrollbar]:hidden touch-pan-x`}
      style={{ scrollbarWidth: 'none', WebkitMaskImage: scrollMask, maskImage: scrollMask }}>
      <div data-chrome-bar="page-toolbar" className={`flex items-center ${JUSTIFY[justify]} ${CHROME_CLUSTER_GAP} shrink-0 w-fit min-w-full ${CHROME_BAR_INSET} py-2`}>
        {tabs && tabs.length > 0 && (
          <div ref={stripRef} className={`relative flex items-center ${CHROME_TAB_GAP} shrink-0`}>
          {tabPill.style && (
            <span aria-hidden className={`absolute top-0 bottom-0 rounded pointer-events-none ${tabPillFill} ${tabPill.motionClass}`} style={tabPill.style} />
          )}
          {tabs.map((tab, i) => {
            const active = activeTab === tab.id;
            return (
              <Button
                key={tab.id}
                ref={el => { tabRefs.current[i] = el; }}
                variant="tab"
                theme={theme}
                cloud={accent}
                active={active}
                icon={tab.icon}
                collapse={tabsDock}
                iconWithLabel={false}
                data-presence-anchor={`nav:subtab:${tab.id}`}
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
                className="shrink-0 relative z-10"
              >
                {tab.label}
              </Button>
            );
          })}
          </div>
        )}
        {children && <div ref={childrenGroupRef} className={`flex items-center ${CHROME_ITEM_GAP} shrink-0`}>{children}</div>}
        {rightContent && <div ref={rightGroupRef} className={`flex items-center ${CHROME_ITEM_GAP} shrink-0`}>{rightContent}</div>}
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
