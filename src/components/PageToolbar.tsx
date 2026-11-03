import React from 'react';
import { useProjectTheme } from '../store';
import { projectAccentNameOf, tabPillFillOf } from '../lib/projectTheme';
import { ExternalLink } from 'lucide-react';
import { IS_COARSE, isTouchLike } from '../lib/device';
import { useSlidingPill } from '@gabriel/ui-kit';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import Button from './Button';
import CoarseTabButton from './CoarseTabButton';
import { CHROME_BAR_INSET, CHROME_BAR_INSET_PX, CHROME_CLUSTER_GAP, CHROME_CLUSTER_GAP_PX, CHROME_ITEM_GAP, CHROME_TAB_GAP } from '../lib/chromeSpacing';
import { ProjectChromeScope } from './ProjectChromeScope';

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
  children?: React.ReactNode;
  rightContent?: React.ReactNode;
  justify?: 'between' | 'end' | 'start';
  theme?: 'light' | 'dark';
}

const JUSTIFY = {
  between: 'justify-between',
  end: 'justify-end',
  start: 'justify-start',
} as const;

export default function PageToolbar({ tabs, activeTab, onChange, onPopout, children, rightContent, justify = 'between', theme = 'light' }: PageToolbarProps) {
  const projectTheme = useProjectTheme();
  const accentName = projectAccentNameOf(projectTheme);

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
     `tabPillFillOf`), so the selection box glides (roadmap 258). */
  const activeTabIdx = Math.max(0, (tabs ?? []).findIndex(t => t.id === activeTab));
  const tabPill = useSlidingPill(stripRef, tabRefs, activeTabIdx);
  const tabPillFill = tabPillFillOf(accentName, theme);
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

  /* Tap slop: a finger tap drifts. 8px was too strict — a 10px drift read as a
     scroll and the click was suppressed, so EVERY toolbar control (Edit, help,
     print…) sometimes needed a second tap. 14px still separates a real swipe. */
  const TAP_SLOP_PX = 14;
  const dragRef = React.useRef<{ x: number; y: number; moved: boolean; pointerId: number; trigger: HTMLElement | null } | null>(null);
  const replayRef = React.useRef(false);
  const staleClearRef = React.useRef(0);
  const isInsideToolbar = React.useCallback((target: EventTarget | null) => {
    // React dispatches via the fiber tree, so events on portaled content
    // (dropdown menus) still pass through this component's ancestors —
    // only handle touches that physically start inside the toolbar DOM.
    return target instanceof Node && !!scrollRef.current?.contains(target);
  }, []);
  /* Horizontal toolbar: a touch drag scrolls it, a still tap activates the
     control. Dropdown triggers must not open mid-scroll (Radix opens on
     pointerdown), so the opening pointerdown is held back — but it is
     REPLAYED ON POINTERUP, never on click. On iOS a tap's click can be
     swallowed (a hover/active reflow, a moving host toolbar), which used to
     leave dropdowns needing several taps. pointerup still fires. */
  const onPointerDownCapture = React.useCallback((e: React.PointerEvent) => {
    window.clearTimeout(staleClearRef.current);
    /* A gesture that does not start inside the toolbar (including a tap on a
       portaled menu row, which still bubbles through this React tree) ENDS any
       pending toolbar gesture. Keeping it was the "second tap dismisses the
       menu" bug: when iOS swallowed the trigger tap's click, the stale trigger
       survived and the next menu-row pointerup replayed it — toggling the menu
       shut. */
    if (!isInsideToolbar(e.target) || !isTouchLike(e.pointerType)) {
      dragRef.current = null;
      return;
    }
    if (replayRef.current) { replayRef.current = false; return; }
    const trigger = (e.target as HTMLElement).closest('[aria-haspopup]') as HTMLElement | null;
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false, pointerId: e.pointerId, trigger };
    if (trigger) e.stopPropagation();
  }, [isInsideToolbar]);
  const onPointerMoveCapture = React.useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    // Only the gesture that armed the toolbar may move it.
    if (!d || d.pointerId !== e.pointerId || d.moved) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP_PX) d.moved = true;
  }, []);
  const onPointerUpCapture = React.useCallback((e: React.PointerEvent) => {
    if (!isTouchLike(e.pointerType)) return;
    const d = dragRef.current;
    /* Same gesture only: a pointerup on a menu row belongs to a different
       pointerId and must never replay a stale toolbar trigger. */
    if (!d || d.moved || !d.trigger || d.pointerId !== e.pointerId) return;
    // The tap is confirmed: open the menu NOW, without waiting for the click.
    replayRef.current = true;
    d.trigger.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      isPrimary: true,
      pointerType: 'touch',
      pointerId: d.pointerId,
      clientX: d.x,
      clientY: d.y,
    }));
    /* If the click never arrives (iOS tap-to-hover), drop the record shortly
       — it must never outlive its gesture. */
    window.clearTimeout(staleClearRef.current);
    staleClearRef.current = window.setTimeout(() => { dragRef.current = null; }, 1200);
  }, []);
  const onPointerCancelCapture = React.useCallback(() => {
    window.clearTimeout(staleClearRef.current);
    dragRef.current = null;
  }, []);
  const onClickCapture = React.useCallback((e: React.MouseEvent) => {
    const d = dragRef.current;
    window.clearTimeout(staleClearRef.current);
    dragRef.current = null;
    if (!d) return;
    if (!isInsideToolbar(e.target)) return;
    /* A drag is a scroll, never an action. A trigger tap was already opened
       on pointerup — swallow the click so it cannot toggle it again. */
    if (d.moved || d.trigger) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, [isInsideToolbar]);

  return (
    <ProjectChromeScope mode={theme}>
    <div ref={scrollRef} onScroll={checkScroll}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={onPointerUpCapture}
      onPointerCancelCapture={onPointerCancelCapture}
      onClickCapture={onClickCapture}
      className="overflow-x-auto overscroll-x-contain border-b border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] shrink-0 island-inset-l island-inset-r [&::-webkit-scrollbar]:hidden touch-pan-x"
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
              <CoarseTabButton
                key={tab.id}
                variant="tab"
                active={active}
                icon={tab.icon}
                docked={tabsDock}
                anchor={`nav:subtab:${tab.id}`}
                label={tab.label}
                buttonRef={el => { tabRefs.current[i] = el; }}
                onSelect={() => onChange?.(tab.id)}
                // The click's own modifier is the truth — a global Shift flag
                // goes stale when focus moves to a popout before the key-up.
                onShiftPopout={onPopout ? () => onPopout(tab.id) : undefined}
                onContextMenu={onPopout && !IS_COARSE ? (e: React.MouseEvent) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
                } : undefined}
                className="shrink-0 relative z-10"
              />
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
    </ProjectChromeScope>
  );
}
