import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useCurrentDocument } from './popoutTarget';
import { createResizeBadge } from './resizeBadge';

interface ColumnWidths {
  [key: string]: number;
}

const MIN = 30;
const MAX = 600;

export function useColumnResize(
  storageKey: string,
  defaults: ColumnWidths,
) {
  const currentDocument = useCurrentDocument();
  const currentDocumentRef = useRef(currentDocument);
  currentDocumentRef.current = currentDocument;
  const [widths, setWidths] = useState<ColumnWidths>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) return { ...defaults, ...JSON.parse(stored) };
    } catch {}
    return { ...defaults };
  });

  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  const startResize = useCallback(
    (columnId: string, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startWidth = widthsRef.current[columnId] ?? defaults[columnId] ?? 100;
      // Roadmap 367 — the shared live px pill (same look as every resize).
      const badge = createResizeBadge(currentDocumentRef.current);
      let latest = startWidth;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(MIN, Math.min(MAX, startWidth + delta));
        latest = newWidth;
        setWidths(prev => ({ ...prev, [columnId]: newWidth }));
        badge.update(`${newWidth} px`, ev.clientX, ev.clientY);
      };

      const onUp = () => {
        currentDocumentRef.current.removeEventListener('pointermove', onMove);
        currentDocumentRef.current.removeEventListener('pointerup', onUp);
        currentDocumentRef.current.removeEventListener('pointercancel', onUp);
        currentDocumentRef.current.body.style.cursor = '';
        currentDocumentRef.current.body.style.userSelect = '';
        badge.remove();
        try {
          localStorage.setItem(storageKey, JSON.stringify({ ...widthsRef.current, [columnId]: latest }));
        } catch {}
      };

      currentDocumentRef.current.body.style.cursor = 'col-resize';
      currentDocumentRef.current.body.style.userSelect = 'none';
      currentDocumentRef.current.addEventListener('pointermove', onMove);
      currentDocumentRef.current.addEventListener('pointerup', onUp);
      currentDocumentRef.current.addEventListener('pointercancel', onUp);
    },
    [defaults, storageKey],
  );

  const resetWidths = useCallback(() => {
    setWidths({ ...defaults });
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }, [defaults, storageKey]);

  const hasCustomWidths = useMemo(
    () => Object.keys(defaults).some(k => widths[k] !== defaults[k]),
    [widths, defaults],
  );

  return { widths, startResize, resetWidths, hasCustomWidths };
}
