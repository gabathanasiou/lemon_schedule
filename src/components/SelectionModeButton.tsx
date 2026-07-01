import React from 'react';
import { MousePointerSquareDashed } from 'lucide-react';
import { IS_COARSE } from '../lib/device';
import { useMarqueeMode, setMarqueeMode } from '../lib/useLongPressMenu';

export default function SelectionModeButton() {
  if (!IS_COARSE) return null;

  const mode = useMarqueeMode();
  const active = mode === 'tool';

  return (
    <button
      data-no-longpress
      aria-pressed={active}
      aria-label={active ? 'Exit Select mode' : 'Select mode'}
      title={active ? 'Exit Select mode' : 'Select mode'}
      onClick={(e) => {
        e.stopPropagation();
        setMarqueeMode(mode === 'tool' ? 'off' : 'tool');
      }}
      style={{
        position: 'fixed',
        bottom: 80,
        right: 16,
        zIndex: 100,
        width: 48,
        height: 48,
        borderRadius: 24,
        border: active ? '2px solid #2563eb' : '1px solid #d4d4d8',
        background: active ? '#2563eb' : 'rgba(255,255,255,0.94)',
        color: active ? '#fff' : '#52525b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: active
          ? '0 4px 16px rgba(37,99,235,0.4)'
          : '0 2px 8px rgba(0,0,0,0.14)',
        cursor: 'pointer',
        touchAction: 'manipulation',
        backdropFilter: 'blur(8px)',
      }}
    >
      <MousePointerSquareDashed className="w-5 h-5" />
    </button>
  );
}
