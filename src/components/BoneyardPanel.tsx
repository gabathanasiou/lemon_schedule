import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCurrentDocument } from '../lib/popoutTarget';
import { ChevronLeft } from 'lucide-react';

interface BoneyardPanelProps {
  count: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  widthKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  tone?: 'zinc' | 'white';
  className?: string;
  headerSlot?: React.ReactNode;
  children?: React.ReactNode;
}

const TONE_CLASSES = {
  zinc: 'bg-zinc-50 border-zinc-200',
  white: 'bg-white border-zinc-300',
} as const;

export const BoneyardPanel: React.FC<BoneyardPanelProps> = ({ count, collapsed, onToggleCollapsed, widthKey, defaultWidth, minWidth, maxWidth, tone = 'zinc', className, headerSlot, children }) => {
  const [width, setWidth] = useState<number>(() => {
    try { const v = localStorage.getItem(widthKey); return v ? parseInt(v, 10) : defaultWidth; } catch { return defaultWidth; }
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(width);
  const currentDocument = useCurrentDocument();
  const currentDocumentRef = useRef(currentDocument);
  currentDocumentRef.current = currentDocument;

  useEffect(() => {
    widthRef.current = width;
    localStorage.setItem(widthKey, String(width));
  }, [width, widthKey]);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const startWidth = panelRef.current?.offsetWidth || widthRef.current;
    const handlePointerMove = (e: PointerEvent) => {
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + e.clientX - startX));
      widthRef.current = newWidth;
      if (panelRef.current) panelRef.current.style.width = `${newWidth}px`;
    };
    const handlePointerUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setWidth(widthRef.current);
      currentDocumentRef.current.removeEventListener('pointermove', handlePointerMove);
      currentDocumentRef.current.removeEventListener('pointerup', handlePointerUp);
    };
    currentDocumentRef.current.addEventListener('pointermove', handlePointerMove);
    currentDocumentRef.current.addEventListener('pointerup', handlePointerUp);
  }, [minWidth, maxWidth]);

  if (collapsed) return null;

  return (
    <div ref={panelRef}
      className={`${TONE_CLASSES[tone]} border-r flex flex-col shrink-0 relative overflow-hidden ${className ?? ''}`}
      style={{ width: `${width}px` }}
    >
      <div className="px-3 pt-2 pb-1.5 border-b shrink-0 bg-zinc-50 border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 shrink-0 select-none">Boneyard</span>
            <span className="text-zinc-300 select-none shrink-0">·</span>
            <span className="text-[10px] font-semibold text-zinc-400 shrink-0">{count}</span>
          </div>
          <button
            onClick={onToggleCollapsed}
            className="p-1 -mr-1 hover:bg-zinc-200 rounded text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer shrink-0"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
        {headerSlot && (
          <div className="flex flex-wrap items-center gap-2 mt-1.5">{headerSlot}</div>
        )}
      </div>
      {children}
      <div
        className="absolute top-0 bottom-0 right-0 w-1.5 cursor-col-resize hover:bg-blue-400/40 z-30"
        onPointerDown={handleResizeStart}
        data-no-longpress
      />
    </div>
  );
};
