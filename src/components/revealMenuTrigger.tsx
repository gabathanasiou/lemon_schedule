import React from 'react';
import { ChevronDown } from 'lucide-react';
import Button from './Button';

/**
 * The ONE icon-first menu trigger face (roadmap 324): the action's icon alone
 * at rest, its box and label revealed on hover / keyboard focus / while the
 * menu is open. Returns a Button ELEMENT, not a wrapper component — Radix
 * clones the trigger (`asChild`), so a wrapper that swallowed its props would
 * never receive the click. Shared by the View and Info menus across toolbars.
 */
export function revealMenuTrigger({
  icon,
  label,
  presenceAnchor,
  theme = 'light',
}: {
  icon: React.ReactNode;
  label: string;
  presenceAnchor: string;
  theme?: 'light' | 'dark';
}) {
  return (
    <Button
      theme={theme}
      title={label}
      aria-label={label}
      icon={icon}
      collapse
      revealOnHover
      data-presence-anchor={presenceAnchor}
    >
      {label}
      <ChevronDown className="w-3 h-3 shrink-0 text-[color:var(--ui-text-faint)]" />
    </Button>
  );
}
