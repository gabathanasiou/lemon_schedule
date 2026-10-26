import React from 'react';
import { MorphSearchField } from '@gabriel/ui-kit';

/**
 * The filter control shared by every Glide page toolbar (roadmap 172). The
 * kit's `MorphSearchField` is a "Filter" button until clicked, then morphs into
 * the text field; the term survives collapsing so the grid stays filtered while
 * you work. Comma-separated tags AND together (same parser as manager search) —
 * display-only, clearing restores every row. The count appears only while a
 * filter is active so the toolbar stays quiet at rest.
 */
export function GlideFilter({
  value,
  onChange,
  total,
  shown,
  placeholder = 'Filter rows…',
}: {
  value: string;
  onChange: (value: string) => void;
  /** Total rows in the grid (unfiltered). */
  total: number;
  /** Rows currently visible. */
  shown: number;
  placeholder?: string;
}) {
  const active = value.trim().length > 0;
  return (
    <div className="flex items-center gap-1.5" data-glide-filter-root>
      <MorphSearchField
        value={value}
        onChange={onChange}
        triggerLabel="Filter"
        placeholder={placeholder}
        collapsedWidth={88}
        expandedWidth={180}
        active={active}
      />
      {active && (
        <span data-glide-filter-count className="text-[10px] tabular-nums text-zinc-400 whitespace-nowrap">
          {shown} / {total}
        </span>
      )}
    </div>
  );
}
