import React from 'react';
import { MousePointerSquareDashed } from 'lucide-react';
import { IS_COARSE } from '../lib/device';
import { useMarqueeMode, setMarqueeMode } from '../lib/useLongPressMenu';
import { FloatingToggle } from '@gabriel/ui-kit';

/** Floating select-mode button (coarse-pointer devices only) — kit
 *  `FloatingToggle` chrome; this module keeps only the mode state. */
export default function SelectionModeButton() {
  if (!IS_COARSE) return null;

  const mode = useMarqueeMode();
  const active = mode === 'tool';

  return (
    <FloatingToggle
      data-no-longpress
      active={active}
      aria-pressed={active}
      aria-label={active ? 'Exit Select mode' : 'Select mode'}
      title={active ? 'Exit Select mode' : 'Select mode'}
      style={{ bottom: 80, right: 16 }}
      onClick={(e) => {
        e.stopPropagation();
        setMarqueeMode(mode === 'tool' ? 'off' : 'tool');
      }}
    >
      <MousePointerSquareDashed className="w-5 h-5" />
    </FloatingToggle>
  );
}
