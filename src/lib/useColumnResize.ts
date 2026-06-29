import React, { useState, useCallback, useRef, useMemo } from 'react';

interface ColumnWidths {
  [key: string]: number;
}

const MIN = 30;
const MAX = 600;

export function useColumnResize(
  storageKey: string,
  defaults: ColumnWidths,
) {
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
    (columnId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = widthsRef.current[columnId] ?? defaults[columnId] ?? 100;

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(MIN, Math.min(MAX, startWidth + delta));
        setWidths(prev => ({ ...prev, [columnId]: newWidth }));
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        try {
          localStorage.setItem(storageKey, JSON.stringify(widthsRef.current));
        } catch {}
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
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
