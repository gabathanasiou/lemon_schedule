import React, { useRef, useState, useCallback, useEffect } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X, RotateCcw } from 'lucide-react';

const MIN_W = 200, MIN_H = 150;
const MAX_EDGE = 32;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  width?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  onReset?: () => void;
}

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export default function Modal({
  open,
  onClose,
  title,
  icon,
  width,
  footer,
  children,
  onReset,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [dragPos, setDragPos] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const resizeRef = useRef<{ dir: ResizeDir; startX: number; startY: number; startL: number; startT: number; startW: number; startH: number } | null>(null);

  useEffect(() => {
    if (!open) { setDragPos(null); setSize(null); }
  }, [open]);

  const captureRect = useCallback((): { left: number; top: number; width: number; height: number } | null => {
    const el = contentRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const r = captureRect(); if (!r) return;
    setDragPos(r);
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: r.left, posY: r.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [captureRect]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    setDragPos({ left: d.posX + e.clientX - d.startX, top: d.posY + e.clientY - d.startY });
  }, []);

  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  const startResize = useCallback((dir: ResizeDir) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const r = captureRect(); if (!r) return;
    setDragPos(r); setSize({ w: r.width, h: r.height });
    resizeRef.current = { dir, startX: e.clientX, startY: e.clientY, startL: r.left, startT: r.top, startW: r.width, startH: r.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [captureRect]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    const rs = resizeRef.current;
    if (!rs) return;
    e.preventDefault();
    const dx = e.clientX - rs.startX;
    const dy = e.clientY - rs.startY;
    let newW = rs.startW, newH = rs.startH, newL = rs.startL, newT = rs.startT;

    if (rs.dir.includes('e')) newW = rs.startW + dx;
    if (rs.dir.includes('w')) { newW = rs.startW - dx; newL = rs.startL + dx; }
    if (rs.dir.includes('s')) newH = rs.startH + dy;
    if (rs.dir.includes('n')) { newH = rs.startH - dy; newT = rs.startT + dy; }

    const vw = window.innerWidth, vh = window.innerHeight;
    newW = Math.max(MIN_W, Math.min(newW, vw - MAX_EDGE * 2));
    newH = Math.max(MIN_H, Math.min(newH, vh - MAX_EDGE * 2));
    if (rs.dir.includes('w')) newL = Math.max(MAX_EDGE, Math.min(newL, vw - newW - MAX_EDGE));
    if (rs.dir.includes('n')) newT = Math.max(MAX_EDGE, Math.min(newT, vh - newH - MAX_EDGE));

    setSize({ w: newW, h: newH });
    setDragPos({ left: newL, top: newT });
  }, []);

  const onResizeUp = useCallback(() => { resizeRef.current = null; }, []);

  const isDragging = dragRef.current !== null;
  const isResizing = resizeRef.current !== null;

  const hasExplicit = dragPos !== null;
  const hasSize = size !== null;

  const posClasses = hasExplicit ? '' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2';
  const sizeClasses = hasSize ? '' : `${width ? `${width} w-full` : 'max-w-xl w-full'}`;

  const combinedStyle: React.CSSProperties = {
    ...(hasExplicit ? { left: dragPos!.left, top: dragPos!.top } : {}),
    ...(hasSize ? { width: size!.w, height: size!.h } : {}),
    maxHeight: hasSize ? `calc(100vh - ${MAX_EDGE * 2}px)` : undefined,
  };

  const edgeH = 'absolute left-[10px] right-[10px] h-[6px] pointer-events-auto';
  const edgeV = 'absolute top-[10px] bottom-[10px] w-[6px] pointer-events-auto';
  const corner = 'absolute w-[10px] h-[10px] pointer-events-auto';

  return (
    <RadixDialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[9999] bg-black/20" />
        <RadixDialog.Content
          ref={contentRef}
          className={`fixed z-[10000] bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden flex flex-col focus:outline-none select-none ${posClasses} ${sizeClasses}`}
          style={{ touchAction: 'manipulation', ...(Object.keys(combinedStyle).length > 0 ? combinedStyle : {}) }}
        >
          <div
            className={`flex items-center justify-between px-5 py-2.5 border-b border-zinc-800 shrink-0 select-none bg-zinc-950 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div className="flex items-center gap-2 min-w-0">
              {icon && <span className="text-zinc-400 shrink-0">{icon}</span>}
              <RadixDialog.Title className="text-xs font-bold text-white truncate">
                {title}
              </RadixDialog.Title>
            </div>
            <div className="flex items-center gap-2">
              {onReset && (
                <button onClick={onReset} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors bg-zinc-800 hover:bg-zinc-700 rounded px-2 py-1 shrink-0">
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              )}
              <RadixDialog.Close className="text-zinc-500 hover:text-white transition-colors shrink-0">
                <X className="w-3.5 h-3.5" />
              </RadixDialog.Close>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 select-none bg-zinc-900" style={{ maxHeight: hasSize ? `calc(${size!.h}px - 40px)` : undefined }}>
            {children}
          </div>

          {footer && (
            <div className="shrink-0">
              {footer}
            </div>
          )}

          <div className="absolute inset-0 pointer-events-none">
            <div className={`${edgeH} top-0 cursor-n-resize`} onPointerDown={startResize('n')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
            <div className={`${edgeH} bottom-0 cursor-s-resize`} onPointerDown={startResize('s')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
            <div className={`${edgeV} left-0 cursor-w-resize`} onPointerDown={startResize('w')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
            <div className={`${edgeV} right-0 cursor-e-resize`} onPointerDown={startResize('e')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
            <div className={`${corner} top-0 left-0 cursor-nw-resize`} onPointerDown={startResize('nw')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
            <div className={`${corner} top-0 right-0 cursor-ne-resize`} onPointerDown={startResize('ne')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
            <div className={`${corner} bottom-0 left-0 cursor-sw-resize`} onPointerDown={startResize('sw')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
            <div className={`${corner} bottom-0 right-0 cursor-se-resize`} onPointerDown={startResize('se')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-3 px-5 py-2 border-t border-zinc-800 bg-zinc-950">
      {children}
    </div>
  );
}
