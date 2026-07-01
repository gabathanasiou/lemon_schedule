import React from 'react';
import { Keyboard, KeyboardOff } from 'lucide-react';
import { IS_COARSE } from '../lib/device';
import { useKeyboardMode } from '../lib/persist';

export default function KeyboardToggleButton() {
  if (!IS_COARSE) return null;

  const [mode, setMode] = useKeyboardMode();
  const active = mode === 'on';

  return (
    <button
      data-no-longpress
      aria-pressed={active}
      aria-label={active ? 'Keyboard input on' : 'Keyboard input off'}
      title={active ? 'Keyboard input on' : 'Keyboard input off'}
      onClick={(e) => {
        e.stopPropagation();
        setMode(active ? 'off' : 'on');
      }}
      style={{
        position: 'fixed',
        bottom: 16,
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
      {active ? <Keyboard className="w-5 h-5" /> : <KeyboardOff className="w-5 h-5" />}
    </button>
  );
}
