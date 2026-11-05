import React from 'react';
import type { DataEditorRef } from '@glideapps/glide-data-grid';
import { shortNameOf } from '../lib/avatarIdentity';
import type { GlidePeerSelectionRange } from '../lib/useGlidePeerSelection';

/**
 * Peer cell-selection border + name tag (docs/PRESENCE.md — peer selections).
 *
 * No background fill: a peer's selected range is marked by a border in their
 * deterministic colour and a small name tag at its top-left, so a
 * collaborator's selection is attributable without tinting the cells. While
 * the peer is actively editing a cell the border thickens (and their live
 * pointer is hidden by `PresenceOverlay`).
 *
 * Geometry is measured through the SAME `DataEditorRef.getBounds` the pointer
 * anchors use, so it follows the receiver's own scroll, column widths and font
 * scale. A range whose first cell has scrolled out keeps its visible border
 * but drops the tag (hide, don't fake). `pointer-events-none` +
 * `data-presence-chrome`: never steals a click and never counts as covering
 * the grid for the presence hit tests.
 */

/** Tag height + gap above the selected range (px). */
const TAG_HEIGHT = 18;
const TAG_GAP = 3;
/** Re-measure cadence — the grid canvas scrolls without a DOM scroll event. */
const MEASURE_MS = 80;

interface MountedTag {
  key: string;
  name: string;
  color: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Null = the selection's first cell is scrolled out; border only. */
  tagTop: number | null;
  tagMaxWidth: number;
  borderWidth: number;
}

function sameTags(a: MountedTag[], b: MountedTag[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.key !== y.key || x.name !== y.name || x.color !== y.color
      || x.left !== y.left || x.top !== y.top || x.width !== y.width
      || x.height !== y.height || x.tagTop !== y.tagTop || x.tagMaxWidth !== y.tagMaxWidth
      || x.borderWidth !== y.borderWidth) return false;
  }
  return true;
}

export function GlidePeerSelectionTags({
  gridRef, selections, headerHeight = 0,
}: {
  gridRef: React.RefObject<DataEditorRef | null>;
  selections: GlidePeerSelectionRange[];
  /** The grid's header height — the tag/border never paint over it. */
  headerHeight?: number;
}) {
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const selectionsRef = React.useRef(selections);
  selectionsRef.current = selections;
  const [tags, setTags] = React.useState<MountedTag[]>([]);

  const signature = React.useMemo(
    () => selections.map(s => `${s.userId}:${s.name}:${s.range.x},${s.range.y},${s.range.width},${s.range.height}`).join('|'),
    [selections],
  );

  React.useEffect(() => {
    if (!signature) {
      setTags(prev => (prev.length === 0 ? prev : []));
      return;
    }
    let raf = 0;
    let cancelled = false;
    let last = 0;
    const measure = () => {
      const grid = gridRef.current;
      const overlay = overlayRef.current;
      if (!grid || !overlay) return [];
      const ob = overlay.getBoundingClientRect();
      const viewTop = ob.top + headerHeight;
      const out: MountedTag[] = [];
      for (const s of selectionsRef.current) {
        const { range } = s;
        const start = grid.getBounds(range.x, range.y);
        const end = grid.getBounds(range.x + range.width - 1, range.y + range.height - 1);
        if (!start || !end) continue;
        // Clamp to the visible data area (below the header). A range whose
        // first cell scrolled out still shows its visible border, but no tag
        // (hide, don't fake a tag on a cell the peer didn't start on).
        const left = Math.max(start.x, ob.left);
        const top = Math.max(start.y, viewTop);
        const right = Math.min(end.x + end.width, ob.right);
        const bottom = Math.min(end.y + end.height, ob.bottom);
        const width = right - left;
        const height = bottom - top;
        if (width < 4 || height < 4) continue;
        const startVisible = start.x >= ob.left - 1 && start.y >= viewTop - 1;
        const topInOverlay = top - ob.top;
        out.push({
          key: s.userId,
          name: shortNameOf(s.name),
          color: s.color,
          left: left - ob.left,
          top: topInOverlay,
          width,
          height,
          tagTop: startVisible
            ? (topInOverlay >= TAG_HEIGHT + TAG_GAP ? topInOverlay - TAG_HEIGHT - TAG_GAP : topInOverlay + 2)
            : null,
          tagMaxWidth: Math.max(56, Math.min(180, ob.width - (left - ob.left) - 4)),
          borderWidth: s.editing ? 4 : 2,
        });
      }
      return out;
    };
    const tick = (t: number) => {
      if (cancelled) return;
      if (t - last >= MEASURE_MS) {
        last = t;
        const next = measure();
        setTags(prev => (sameTags(prev, next) ? prev : next));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [gridRef, headerHeight, signature]);

  if (tags.length === 0) return <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" data-presence-chrome aria-hidden />;

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-20 overflow-hidden" data-presence-chrome aria-hidden>
      {tags.map(tag => (
        <React.Fragment key={tag.key}>
          <div
            className="absolute rounded-[2px]"
            style={{ left: tag.left, top: tag.top, width: tag.width, height: tag.height, boxShadow: `inset 0 0 0 ${tag.borderWidth}px ${tag.color}` }}
          />
          {tag.tagTop != null && (
            <div
              className="absolute flex items-center overflow-hidden text-ellipsis whitespace-nowrap rounded px-1.5 font-semibold text-white shadow-sm"
              style={{
                left: tag.left,
                top: tag.tagTop,
                maxWidth: tag.tagMaxWidth,
                height: TAG_HEIGHT,
                backgroundColor: tag.color,
                fontSize: 10,
                lineHeight: `${TAG_HEIGHT}px`,
                textShadow: '0 1px 1px rgba(0,0,0,0.35)',
              }}
            >
              {tag.name}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
