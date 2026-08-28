import React from 'react';
import { RibbonCell } from '../types';
import { getRibbonTextWrapStyle, ribCellTextSize } from '../lib/ribbonUtils';

interface RibbonCellTextProps {
  cell: RibbonCell;
  children: React.ReactNode;
  span?: number;
  cellPadding?: number;
  /** Master text size in px (design.textSize). Unset = legacy 8pt rendering. */
  textSize?: number;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Shared component for rendering ribbon cell text with wrapping/clamping.
 * Uses -webkit-line-clamp for merged cells (span > 1, wrap off),
 * overflow:visible for wrapped cells, and ellipsis for single-row cells.
 * Passes cellPadding to getRibbonTextWrapStyle for line-height alignment.
 */
export function RibbonCellText({ cell, children, span = 1, cellPadding, textSize, style, className }: RibbonCellTextProps) {
  const ts = ribCellTextSize(textSize, cell);
  return (
    <span className={className} style={{
      fontSize: ts !== undefined ? `${ts}px` : '8pt',
      ...getRibbonTextWrapStyle(cell, span, cellPadding),
      ...style,
    }}>
      {children}
    </span>
  );
}
