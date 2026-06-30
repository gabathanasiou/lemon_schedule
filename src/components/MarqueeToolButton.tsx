import React from 'react';
import { MousePointerSquareDashed } from 'lucide-react';
import { IS_COARSE } from '../lib/device';
import { useMarqueeMode, setMarqueeMode } from '../lib/useLongPressMenu';

export default function MarqueeToolButton({ containerRef }: { containerRef?: React.RefObject<HTMLElement> }) {
  if (!IS_COARSE) return null;

  const mode = useMarqueeMode();
  const active = mode !== 'off';

  return (
    <button
      data-no-longpress
      aria-pressed={active}
      aria-label={active ? 'Exit marquee select' : 'Marquee select mode'}
      title={active ? 'Exit marquee select' : 'Marquee select'}
      onClick={(e) => {
        e.stopPropagation();
        setMarqueeMode(active ? 'off' : 'tool');
      }}
      style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        zIndex: 100,
        width: 44,
        height: 44,
        borderRadius: 22,
        border: active ? '2px solid #000' : '1px solid #d4d4d8',
        background: active ? '#000' : 'rgba(255,255,255,0.92)',
        color: active ? '#fff' : '#52525b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: active
          ? '0 4px 12px rgba(0,0,0,0.3)'
          : '0 2px 8px rgba(0,0,0,0.12)',
        cursor: 'pointer',
        touchAction: 'manipulation',
      }}
    >
      <MousePointerSquareDashed className="w-5 h-5" />
    </button>
  );
}
