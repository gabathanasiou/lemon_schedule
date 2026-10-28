import React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Button from './Button';

/**
 * The ONE Boneyard panel toggle (roadmap 324): a kit outline button that rests
 * as its panel icon and reveals the label on hover/focus — the same face the
 * menu triggers use. The icon rolls direction-aware when the panel opens or
 * closes. Used by the Schedule toolbar and the Calendar's collapsed sidebar.
 */
export function BoneyardToggle({ collapsed, onToggle, label = 'Boneyard' }: {
  collapsed: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <Button
      variant="outline"
      icon={collapsed
        ? <PanelLeftOpen className="w-3.5 h-3.5 shrink-0" />
        : <PanelLeftClose className="w-3.5 h-3.5 shrink-0" />}
      collapse
      revealOnHover
      iconRoll={collapsed ? 'up' : 'down'}
      onClick={onToggle}
      title={collapsed ? 'Show Boneyard' : 'Hide Boneyard'}
      data-presence-anchor="toolbar:boneyard:toggle"
    >
      {label}
    </Button>
  );
}

export default BoneyardToggle;
