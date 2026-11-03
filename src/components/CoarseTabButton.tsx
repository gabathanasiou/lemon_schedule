import React from 'react';
import { IS_COARSE } from '../lib/device';
import Button from './Button';

/**
 * ONE tab face for the app chrome (main header tabs + PageToolbar sub-tabs).
 *
 * Coarse pointers act on the TAP: the kit `Button` owns the pointerup
 * activation + drag guard (roadmap 338), so this face only carries the tab
 * semantics (shift-click popout is a fine-pointer feature).
 */
export default function CoarseTabButton({
  variant,
  active,
  icon,
  docked,
  anchor,
  label,
  onSelect,
  onShiftPopout,
  onContextMenu,
  buttonRef,
  className,
}: {
  variant: 'tab' | 'tab-header';
  active: boolean;
  icon?: React.ReactNode;
  /** Labels collapsed to icons (roadmap 258 dock mode). */
  docked: boolean;
  /** data-presence-anchor for presence/popout identity. */
  anchor: string;
  label: string;
  onSelect: () => void;
  /** Desktop-only shift-click "open in a new window". */
  onShiftPopout?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
  className?: string;
}) {
  return (
    <Button
      ref={buttonRef}
      variant={variant}
      active={active}
      icon={icon}
      collapse={docked}
      iconWithLabel={false}
      data-presence-anchor={anchor}
      onClick={(e) => {
        if (e.shiftKey && !IS_COARSE && onShiftPopout) onShiftPopout();
        else onSelect();
      }}
      onContextMenu={onContextMenu}
      className={className}
    >
      {label}
    </Button>
  );
}
