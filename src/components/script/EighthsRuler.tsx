import React from 'react';

/** A standard screenplay page holds ~55 lines of Courier. Eighths of a page are
 *  measured against that height; the ruler repeats per page. */
export const LINES_PER_PAGE = 55;

/**
 * Eighths ruler (roadmap 123 Phase 1 follow-up) — a right-margin scale that
 * divides every page into 8 equal parts so a scene's length can be eyeballed in
 * eighths (the scheduling unit). Purely presentational: 1px ticks are a CSS
 * repeating gradient (cheap for long scripts) and only the even eighths (2·4·6·8)
 * get a number. Recomputes from the measured content height + line height, so it
 * stays correct when the surface is resized.
 */
export function EighthsRuler({ contentHeight, lineHeight }: { contentHeight: number; lineHeight: number }) {
  const pageHeight = LINES_PER_PAGE * lineHeight;
  const eighth = pageHeight / 8;
  if (contentHeight <= 0 || eighth <= 0) return null;

  const total = Math.ceil(contentHeight / eighth);
  const labels: { top: number; n: number }[] = [];
  for (let k = 0; k < total; k++) {
    const n = (k % 8) + 1;
    if (n % 2 === 0) labels.push({ top: k * eighth, n });
  }

  return (
    <div
      data-testid="script-eighths"
      aria-hidden
      className="relative w-10 shrink-0 select-none"
      style={{
        height: contentHeight,
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${eighth - 1}px, rgb(212 212 216) ${eighth - 1}px, rgb(212 212 216) ${eighth}px)`,
      }}
    >
      {labels.map((l, i) => (
        <span
          key={i}
          className="absolute left-0 flex -translate-y-1/2 items-center gap-1 font-mono text-[9px] text-zinc-400"
          style={{ top: l.top }}
        >
          <span className="inline-block h-px w-2.5 bg-zinc-300" />
          {l.n}
        </span>
      ))}
    </div>
  );
}
