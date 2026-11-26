import React, { useRef } from 'react';
import type { ReportBlock } from '../../types';
import { resizeImageBlock, type ImageResizeResult } from '../../lib/reportImageResize';
import { imageAlignStyle, imageObjectPosition, resizeHandleMode } from '../../lib/reportImageLayout';
import { createResizeBadge } from '../../lib/resizeBadge';

interface ImageBlockViewProps {
  block: ReportBlock;
  /** Designer: the surrounding block card owns the box (width/alignment), so
   *  this wrapper fills it 100% and the drag resizes the CARD, not the image
   *  inside a full-width block. */
  boxed?: boolean;
  /** Designer only: shows the resize handle + live badge. */
  hint?: boolean;
  /** Designer only: the handle appears on the selected block. */
  selected?: boolean;
  onPatchBlock?: (patch: Partial<ReportBlock>) => void;
}

/**
 * Image block (roadmap 214/366/368) — the image BOX is the block: width is a
 * percent of the content column (clamped 5–100%), height is px or natural, and
 * the designer's card is sized to the same box. The bottom-free-corner handle
 * scales it: aspect-locked by default, Shift = free stretch (one patch on
 * release — live DOM during the drag).
 *
 * Roadmap 366: the anchor grid's X aligns the box; its Y anchors the content
 * inside an explicit-height box via `object-position`.
 */
export const ImageBlockView: React.FC<ImageBlockViewProps> = ({ block, boxed, hint, selected, onPatchBlock }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canResize = !!hint && !!selected && !!onPatchBlock;
  const persistedWidthPct = Math.min(100, Math.max(5, block.imageWidth ?? 100));
  const height = block.imageHeight;
  const fit = block.imageFit ?? 'contain';
  const align = block.imageAlign ?? 'left';
  const anchorY = block.imageAnchorY ?? 'center';
  const handleMode = resizeHandleMode(align);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canResize) return;
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!wrap || !img) return;
    e.preventDefault();
    e.stopPropagation();

    // In the designer the CARD is the box; width is a % of the card's parent
    // (the content column). Without a card (print/preview) the wrapper is the
    // box and its own parent is the column.
    const card = boxed ? wrap.closest('[data-block-id]') as HTMLElement | null : null;
    const basisParent = boxed ? wrap.parentElement?.parentElement ?? wrap.parentElement : wrap.parentElement;
    if (!basisParent) return;
    const cs = basisParent.ownerDocument.defaultView?.getComputedStyle(basisParent);
    const containerWidth = Math.max(1, basisParent.clientWidth
      - (parseFloat(cs?.paddingLeft || '0') || 0)
      - (parseFloat(cs?.paddingRight || '0') || 0));
    const startWidthPx = Math.max(1, wrap.offsetWidth);
    const startHeightPx = Math.max(1, img.offsetHeight);
    // The canvas may be display-zoomed (fit); pointer deltas are screen px,
    // the persisted geometry is layout px.
    const scale = wrap.getBoundingClientRect().width / startWidthPx || 1;
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { widthPct: persistedWidthPct, heightPx: height, startWidthPx, startHeightPx, containerWidth };
    let last: ImageResizeResult = { widthPct: persistedWidthPct, heightPx: height };
    let moved = false;

    const handle = e.currentTarget;
    handle.setPointerCapture?.(e.pointerId);
    const doc = wrap.ownerDocument;
    const badge = createResizeBadge(doc);

    const move = (ev: PointerEvent) => {
      moved = true;
      const rawDx = (ev.clientX - startX) / scale;
      // Right-aligned images resize from their LEFT edge (the right edge is the
      // anchor) and centred images grow both ways — double so the dragged edge
      // still tracks the pointer.
      const dx = rawDx * handleMode.scaleX * (handleMode.flipX ? -1 : 1);
      last = resizeImageBlock(start, { dx, dy: (ev.clientY - startY) / scale, free: ev.shiftKey });
      if (card) card.style.width = `${last.widthPct}%`;
      else wrap.style.width = `${last.widthPct}%`;
      img.style.height = last.heightPx === undefined ? 'auto' : `${last.heightPx}px`;
      const widthPx = Math.round((last.widthPct / 100) * containerWidth);
      const heightPx = last.heightPx ?? Math.round(startHeightPx * (last.widthPct / start.widthPct));
      badge.update(`${widthPx} × ${heightPx} px`, ev.clientX, ev.clientY);
    };
    const end = () => {
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', end);
      doc.removeEventListener('pointercancel', end);
      try { handle.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
      badge.remove();
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
      style={{
        position: 'relative',
        ...(boxed
          ? { width: '100%' }
          : { width: `${persistedWidthPct}%`, ...imageAlignStyle(align) }),
      }}
    >
      <img
        ref={imgRef}
        src={block.imageDataUrl}
        alt=""
        draggable={false}
        style={{
          display: 'block',
          width: '100%',
          ...(height
            ? { height, objectFit: fit, objectPosition: imageObjectPosition(align, anchorY) }
            : { height: 'auto' }),
        }}
      />
      {canResize && (
        <>
          <div
            role="slider"
            aria-label="Resize image"
            aria-valuenow={Math.round(persistedWidthPct)}
            aria-valuemin={5}
            aria-valuemax={100}
            tabIndex={-1}
            data-image-resize-handle={handleMode.side}
            onPointerDown={onPointerDown}
            style={{
              position: 'absolute',
              bottom: 2,
              ...(handleMode.side === 'left' ? { left: 2 } : { right: 2 }),
              width: 12,
              height: 12,
              borderRadius: 2,
              background: '#3b82f6',
              border: '2px solid #fff',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.18)',
              cursor: handleMode.side === 'left' ? 'nesw-resize' : 'nwse-resize',
              touchAction: 'none',
              zIndex: 5,
            }}
          />
        </>
      )}
    </div>
  );
};
