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
  /** Empty cards (an Events card with no events) have no body to fold, so
   *  they drop the chevron and read as a single action row. */
  collapsible?: boolean;
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
  collapsible = true,
  trailing,
  children,
  ...rest
}) => (
  <section
    className="bg-[var(--ui-panel-bg)] border border-[color:var(--ui-border)] rounded-xl shadow-sm overflow-hidden"
    {...rest}
  >
    <div className="flex items-center gap-2 px-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={!collapsible}
        aria-expanded={collapsible ? !collapsed : undefined}
        className="flex flex-1 min-w-0 items-center gap-2 text-left disabled:cursor-default"
      >
        {collapsible
          ? (collapsed ? <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[color:var(--ui-text-faint)]" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0 text-[color:var(--ui-text-faint)]" />)
          : <span className="w-3.5 shrink-0" />}
        <span className="text-[color:var(--ui-text-muted)] shrink-0">{icon}</span>
        <span className="text-xs font-semibold text-[color:var(--ui-text-strong)] truncate">{title}</span>
        {summary && <span className="text-[11px] text-[color:var(--ui-text-faint)] truncate">{summary}</span>}
      </button>
      {trailing}
    </div>
    {!collapsed && children != null && (
      <div className="border-t border-[color:var(--ui-border)] px-3 py-2.5">{children}</div>
    )}
  </section>
);

export default DaySectionCard;
