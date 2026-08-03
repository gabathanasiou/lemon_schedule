import React from 'react';
import { Keyboard, KeyboardOff } from 'lucide-react';
import { IS_COARSE, useHardwareKeyboard } from '../lib/device';
import { useKeyboardMode } from '../lib/persist';

/**
 * Floating keyboard-state button (coarse-pointer devices only).
 *
 * Three visual states:
 *  - ON (blue):       software keyboard enabled — entity dropdowns/grid cells accept text entry
 *  - OFF (white):     picker-only — tapping entity dropdowns opens pickers, no text entry
 *  - HARDWARE (amber): a physical keyboard is connected, so the mode toggle has no effect on
 *                      behavior; the frame stays amber to show the detection and the icon is
 *                      always the keyboard-on glyph (typing works). Still tappable to inspect.
 *
 * The state updates live: media-query changes, focus/visibility changes and physical
 * keydowns re-evaluate the hardware-keyboard detection.
 */
export default function KeyboardToggleButton() {
  const [mode, setMode] = useKeyboardMode();
  const hwKeyboard = useHardwareKeyboard();
  if (!IS_COARSE) return null;

  const active = mode === 'on';

  const frame = hwKeyboard
    ? {
        border: '1px solid #f59e0b',
        background: 'rgba(255, 251, 235, 0.94)',
        color: '#b45309',
        boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
        cursor: 'pointer',
      }
    : active
      ? {
          border: '2px solid #2563eb',
          background: '#2563eb',
          color: '#fff',
          boxShadow: '0 4px 16px rgba(37,99,235,0.4)',
          cursor: 'pointer',
        }
      : {
          border: '1px solid #d4d4d8',
          background: 'rgba(255,255,255,0.94)',
          color: '#52525b',
          boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
          cursor: 'pointer',
        };

  return (
    <button
      data-no-longpress
      aria-pressed={active}
      aria-label={hwKeyboard ? 'Hardware keyboard detected' : active ? 'Keyboard input on' : 'Keyboard input off'}
      title={
        hwKeyboard
          ? `Hardware keyboard detected — toggle has no effect. Software mode: ${active ? 'on' : 'off'}`
          : active ? 'Keyboard input on' : 'Keyboard input off'
      }
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
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'manipulation',
        backdropFilter: 'blur(8px)',
        ...frame,
      }}
    >
      {active || hwKeyboard ? <Keyboard className="w-5 h-5" /> : <KeyboardOff className="w-5 h-5" />}
    </button>
  );
}
