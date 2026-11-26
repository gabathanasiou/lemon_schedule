import React, { useRef, useState } from 'react';
import type { ReportBlock } from '../../types';
import { resizeImageBlock, type ImageResizeResult } from '../../lib/reportImageResize';

interface ImageBlockViewProps {
  block: ReportBlock;
  /** Designer only: shows the resize handle + live badge. */
  hint?: boolean;
  /** Designer only: the handle appears on the selected block. */
  selected?: boolean;
  onPatchBlock?: (patch: Partial<ReportBlock>) => void;
}

/**
 * Image block (roadmap 214) — width persists as a percent of the content width,
 * so the editor and print agree at any page geometry. The bottom-right handle
 * scales by dragging: aspect-locked by default, Shift = free stretch (one patch
 * on release — the drag itself is live DOM only, never a dispatch per move).
 */
export const ImageBlockView: React.FC<ImageBlockViewProps> = ({ block, hint, selected, onPatchBlock }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [drag, setDrag] = useState<(ImageResizeResult & { label: string }) | null>(null);
  const canResize = !!hint && !!selected && !!onPatchBlock;
  const widthPct = block.imageWidth ?? 100;
  const height = block.imageHeight;
  const fit = block.imageFit ?? 'contain';

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canResize) return;
    const wrap = wrapRef.current;
    const img = imgRef.current;
    const parent = wrap?.parentElement;
    if (!wrap || !img || !parent) return;
    e.preventDefault();
    e.stopPropagation();

    const cs = parent.ownerDocument.defaultView?.getComputedStyle(parent);
    const containerWidth = Math.max(1, parent.clientWidth
      - (parseFloat(cs?.paddingLeft || '0') || 0)
      - (parseFloat(cs?.paddingRight || '0') || 0));
    const startWidthPx = Math.max(1, wrap.offsetWidth);
    const startHeightPx = Math.max(1, img.offsetHeight);
    // The canvas may be display-zoomed (fit); pointer deltas are screen px,
    // the persisted geometry is layout px.
    const scale = wrap.getBoundingClientRect().width / startWidthPx || 1;
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { widthPct, heightPx: height, startWidthPx, startHeightPx, containerWidth };
    let last: ImageResizeResult = { widthPct, heightPx: height };
    let moved = false;

    const handle = e.currentTarget;
    handle.setPointerCapture?.(e.pointerId);
    const doc = wrap.ownerDocument;

    const move = (ev: PointerEvent) => {
      moved = true;
      last = resizeImageBlock(start, {
        dx: (ev.clientX - startX) / scale,
        dy: (ev.clientY - startY) / scale,
        free: ev.shiftKey,
      });
      wrap.style.width = `${last.widthPct}%`;
      img.style.height = last.heightPx === undefined ? 'auto' : `${last.heightPx}px`;
      const widthPx = Math.round((last.widthPct / 100) * containerWidth);
      const heightPx = last.heightPx ?? Math.round(startHeightPx * (last.widthPct / start.widthPct));
      setDrag({ ...last, label: `${widthPx} × ${heightPx} px` });
    };
    const end = () => {
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', end);
      doc.removeEventListener('pointercancel', end);
      try { handle.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
      setDrag(null);
      // A click on the handle (no movement) must not create an undo entry.
      if (!moved) return;
      onPatchBlock?.({
        imageWidth: last.widthPct >= 100 ? undefined : last.widthPct,
        imageHeight: last.heightPx,
      });
    };
    doc.addEventListener('pointermove', move);
    doc.addEventListener('pointerup', end);
    doc.addEventListener('pointercancel', end);
  };

  return (
    <div
      ref={wrapRef}
      data-image-block=""
      style={{ position: 'relative', width: `${widthPct}%` }}
    >
      <img
        ref={imgRef}
        src={block.imageDataUrl}
        alt=""
        draggable={false}
        style={{
          display: 'block',
          width: '100%',
          ...(height ? { height, objectFit: fit } : { height: 'auto' }),
        }}
      />
      {canResize && (
        <>
          <div
            role="slider"
            aria-label="Resize image"
            aria-valuenow={Math.round(widthPct)}
            aria-valuemin={5}
            aria-valuemax={100}
            tabIndex={-1}
            data-image-resize-handle=""
            onPointerDown={onPointerDown}
            style={{
              position: 'absolute',
              right: -6,
              bottom: -6,
              width: 12,
              height: 12,
              borderRadius: 2,
              background: '#3b82f6',
              border: '2px solid #fff',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.18)',
              cursor: 'nwse-resize',
              touchAction: 'none',
              zIndex: 5,
            }}
          />
          {drag && (
            <div
              data-image-size-badge=""
              style={{
                position: 'absolute',
                top: -22,
                right: 0,
                padding: '1px 6px',
                borderRadius: 4,
                background: '#18181b',
                color: '#fff',
                fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              {drag.label}
            </div>
          )}
        </>
      )}
    </div>
  );
};
