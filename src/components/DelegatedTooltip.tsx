import React from 'react';
import { createPortal } from 'react-dom';
import { useCoarseScale, coarsePx } from '@gabriel/ui-kit';
import { useCurrentWindow } from '../lib/popoutTarget';

/**
 * Kit-style tooltip for content rendered as RAW HTML (token tags resolved into
 * static strings — React children can't be wrapped there). Any element with
 * `data-ui-tooltip="…"` gets the SAME bubble the kit `Tooltip` renders: the
 * classes/styles below mirror `@gabriel/ui-kit` Tooltip.tsx (portal, coarse
 * sizing, arrow) — keep them in sync when the kit's tooltip changes. One
 * document-level hover listener serves every tag; scroll hides the bubble
 * (the kit repositions on scroll — a static string has no anchor to track).
 */
export const DelegatedTooltip: React.FC = () => {
  const scale = useCoarseScale();
  const currentWin = useCurrentWindow();
  const [tip, setTip] = React.useState<{ text: string; x: number; y: number } | null>(null);

  React.useEffect(() => {
    const doc = currentWin.document;
    const hide = () => setTip(null);
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-ui-tooltip]') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setTip({ text: el.getAttribute('data-ui-tooltip') || '', x: r.left + r.width / 2, y: r.top });
    };
    const onOut = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-ui-tooltip]')) setTip(null);
    };
    /* Touch dismissal (roadmap 331): tapping anywhere that is NOT a tooltip
       tag clears the bubble — the tap's sticky hover never fires mouseout on a
       blank area, which left report tooltips stuck on iPhone. */
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.('[data-ui-tooltip]')) setTip(null);
    };
    doc.addEventListener('mouseover', onOver);
    doc.addEventListener('mouseout', onOut);
    doc.addEventListener('pointerdown', onDown, true);
    currentWin.addEventListener('scroll', hide, true);
    return () => {
      doc.removeEventListener('mouseover', onOver);
      doc.removeEventListener('mouseout', onOut);
      doc.removeEventListener('pointerdown', onDown, true);
      currentWin.removeEventListener('scroll', hide, true);
    };
  }, [currentWin]);

  if (!tip) return null;
  const padX = coarsePx(10, 12, scale), padY = coarsePx(6, 6, scale), fs = coarsePx(10, 12, scale);
  return createPortal(
    <div
      className="fixed rounded shadow-xl whitespace-nowrap leading-relaxed max-w-xs border border-white/20 bg-zinc-900 text-white pointer-events-none"
      style={{ padding: `${padY}px ${padX}px`, fontSize: fs, left: tip.x, top: tip.y - 4, transform: 'translate(-50%, -100%)', zIndex: 99999 }}
    >
      {tip.text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-900" />
    </div>,
    currentWin.document.body,
  );
};

export default DelegatedTooltip;
