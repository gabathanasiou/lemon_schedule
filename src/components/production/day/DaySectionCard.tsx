import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Light page card for the Day Manager sections — white card + zinc border +
 * collapsible header (icon · title · live summary · optional trailing action).
 * The dark ui-kit `CardSection` is the modal counterpart; this is the light
 * page recipe from DESIGN-LANGUAGE §Two-layer surface model.
 */
export interface DaySectionCardProps {
  title: string;
  icon: React.ReactNode;
  summary?: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  'data-section'?: string;
}

export const DaySectionCard: React.FC<DaySectionCardProps> = ({
  title,
  icon,
  summary,
  collapsed,
  onToggle,
  trailing,
  children,
  ...rest
}) => (
  <section
    className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden"
    {...rest}
  >
    <div className="flex items-center gap-2 px-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex flex-1 min-w-0 items-center gap-2 text-left"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5 shrink-0 text-zinc-400" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0 text-zinc-400" />}
        <span className="text-zinc-500 shrink-0">{icon}</span>
        <span className="text-xs font-semibold text-zinc-800 truncate">{title}</span>
        {summary && <span className="text-[11px] text-zinc-400 truncate">{summary}</span>}
      </button>
      {trailing}
    </div>
    {!collapsed && (
      <div className="border-t border-zinc-100 px-3 py-2.5">{children}</div>
    )}
  </section>
);

export default DaySectionCard;
