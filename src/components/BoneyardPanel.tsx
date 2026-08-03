import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCurrentDocument } from '../lib/popoutTarget';
import { ChevronLeft } from 'lucide-react';

interface BoneyardPanelProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  widthKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  tone?: 'zinc' | 'white';
  className?: string;
  titleSlot?: React.ReactNode;
  headerSlot?: React.ReactNode;
  children?: React.ReactNode;
}

const TONE_CLASSES = {
  zinc: 'bg-zinc-50 border-zinc-200',
  white: 'bg-white border-zinc-300',
} as const;

export const BoneyardPanel: React.FC<BoneyardPanelProps> = ({ collapsed, onToggleCollapsed, widthKey, defaultWidth, minWidth, maxWidth, tone = 'zinc', className, titleSlot, headerSlot, children }) => {
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
      <div className="px-3 pt-2 pb-2 border-b shrink-0 bg-white border-zinc-200">
        <div className="flex items-center justify-between min-h-[25px]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-zinc-700 shrink-0 select-none">Boneyard</span>
            {titleSlot}
          </div>
          <button
            onClick={onToggleCollapsed}
            className="p-1 -mr-1 hover:bg-zinc-100 rounded text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer shrink-0"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
      {headerSlot && (
        <div className="px-3 pt-2 pb-2 border-b shrink-0 bg-white border-zinc-200 flex flex-wrap items-center gap-2">
          {headerSlot}
        </div>
      )}
      {children}
      <div
        className="absolute top-0 bottom-0 right-0 w-1.5 cursor-col-resize hover:bg-blue-400/40 z-30"
        onPointerDown={handleResizeStart}
        data-no-longpress
      />
    </div>
  );
};
