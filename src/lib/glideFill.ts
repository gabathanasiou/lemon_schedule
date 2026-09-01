import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Measures a glide grid's container so the DataEditor can be given explicit
 * `width`/`height`. glide-data-grid sizes itself to its CONTENT (the summed
 * column widths) when width/height are omitted, so a sparse grid (few columns)
 * shrinks instead of extending across the container. Both the breakdown glide
 * and the GlideGridShell (crew / locations / future DBs) wrap their grid in a
 * full-width flex div and feed this size back to the DataEditor.
 *
 * Pass an existing container ref (e.g. one already used for event handling) to
 * observe it; otherwise the returned `ref` is attached to the wrapper.
 */
export function useGlideFill<T extends HTMLElement>(existingRef?: RefObject<T | null>) {
  const ownRef = useRef<T>(null);
  const ref = existingRef ?? ownRef;
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize(prev =>
        prev.width === r.width && prev.height === r.height ? prev : { width: r.width, height: r.height },
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return {
    ref,
    /** `undefined` until the first measure (pass straight through to DataEditor). */
    width: size.width || undefined,
    height: size.height || undefined,
  };
}
