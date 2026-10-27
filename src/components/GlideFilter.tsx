import React from 'react';
import { Filter, Search } from 'lucide-react';
import { MorphSearchField } from '@gabriel/ui-kit';

/**
 * The filter control shared by every Glide page toolbar (roadmap 172). The
 * kit's `MorphSearchField` is a "Filter" button until clicked, then morphs into
 * the text field; the term survives collapsing so the grid stays filtered while
 * you work. Once a filter is applied the collapsed button NAMES the term and
 * swaps its magnifier for a funnel (no accent tint) — the count shows how many
 * rows survive. Comma-separated tags AND together (same parser as manager
 * search) — display-only, clearing restores every row.
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
  const query = value.trim();
  const active = query.length > 0;
  // Grow the collapsed control with the term (capped — the field itself is the
  // place to read a long query).
  const collapsedWidth = active ? Math.min(220, Math.max(88, 52 + query.length * 6.4)) : 88;
  return (
    <div className="flex items-center gap-1.5" data-glide-filter-root>
      <MorphSearchField
        value={value}
        onChange={onChange}
        triggerLabel={active ? query : 'Filter'}
        triggerIcon={active ? <Filter className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
        placeholder={placeholder}
        collapsedWidth={collapsedWidth}
        expandedWidth={180}
      />
      {active && (
        <span data-glide-filter-count className="text-[10px] tabular-nums text-[color:var(--ui-text-faint)] whitespace-nowrap">
          {shown} / {total}
        </span>
      )}
    </div>
  );
}
