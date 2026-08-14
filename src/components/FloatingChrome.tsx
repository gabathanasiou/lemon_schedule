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
      // Final hard clamp into the viewport. Floating UI's shift measures the
      // panel's *current* DOM rect (one update behind), so a large scroll jump
      // can leave it off-screen next to a scrolled-out reference — this clamp
      // uses the freshly computed coords + measured size and always wins.
      {
        name: 'viewportClamp',
        fn: (state) => {
          const { elements, rects } = state;
          const win = elements.floating.ownerDocument?.defaultView;
          if (!win) return {};
          const w = rects.floating.width;
          const h = rects.floating.height;
          const x = Math.max(8, Math.min(state.x, win.innerWidth - w - 8));
          const y = Math.max(8, Math.min(state.y, win.innerHeight - h - 8));
          return { x, y };
        },
      },
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
        <div
          ref={refs.setFloating}
          className={className}
          style={floatingStyles}
          // Portal events bubble through the React tree back to the block card
          // (React re-dispatches them along the source tree), so a click inside
          // the chrome would otherwise select/move the block underneath.
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          onDragStart={e => e.preventDefault()}
        >
          {children}
        </div>,
        win.document.body,
      )}
    </>
  );
};
