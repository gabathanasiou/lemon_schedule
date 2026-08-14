import React, { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFloating, autoUpdate, offset, flip, shift, size } from '@floating-ui/react-dom';
import { useCurrentWindow } from '../lib/popoutTarget';

// ---- floating editor chrome (block/table-column/column editors) ----------------
// Portals the panel to the current window's body and positions it with Floating
// UI (strategy fixed) against an anchor inside the block card. `flip`/`shift`/
// `size` keep it fully inside the viewport (like the context menus); autoUpdate
// repositions it on scroll/resize and as the panel grows (typing, dropdowns).
// The inline anchor div (`.chrome-anchor`) must sit inside a `position: relative`
// parent — the parent's rect is the anchor.

interface FloatingChromeProps {
  className: string;
  children: React.ReactNode;
  /** External anchor element (e.g. a table column cell). When omitted, an inline
   *  anchor covering the parent is used. */
  reference?: HTMLElement | null;
}

export const FloatingChrome: React.FC<FloatingChromeProps> = ({ className, children, reference }) => {
  const win = useCurrentWindow();
  const { refs, floatingStyles } = useFloating({
    placement: 'top',
    strategy: 'fixed',
    // transform: false — positioning via left/top so the panel never becomes
    // a containing block for `position: fixed` descendants (e.g. the token
    // autocomplete popover inside the block editor), which would double-offset
    // them and clip them against the window.
    transform: false,
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableWidth, availableHeight, elements }) {
          const el = elements.floating as HTMLElement;
          el.style.maxWidth = `${availableWidth}px`;
          el.style.maxHeight = `${availableHeight}px`;
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  useLayoutEffect(() => {
    if (reference) refs.setReference(reference);
  }, [reference, refs]);

  return (
    <>
      {!reference && <div ref={refs.setReference} className="chrome-anchor" aria-hidden />}
      {win && createPortal(
        <div ref={refs.setFloating} className={className} style={floatingStyles}>
          {children}
        </div>,
        win.document.body,
      )}
    </>
  );
};
