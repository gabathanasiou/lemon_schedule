import React from 'react';
import { RibbonCell } from '../types';
import { getRibbonTextWrapStyle, formatCellText } from '../lib/ribbonUtils';

interface RibbonCellTextProps {
  cell: RibbonCell;
  children: React.ReactNode;
  span?: number;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Shared component for rendering ribbon cell text with wrapping/clamping.
 * Handles -webkit-line-clamp for merged cells, overflow for wrapped cells,
 * and ellipsis for single-row cells. Caller provides formatted text as children
 * (e.g. using formatCellText).
 */
export function RibbonCellText({ cell, children, span = 1, style, className }: RibbonCellTextProps) {
  return (
    <span className={className} style={{
      fontSize: '8pt',
      ...getRibbonTextWrapStyle(cell, span),
      ...style,
    }}>
      {children}
    </span>
  );
}
