import React from 'react';
import { Keyboard, KeyboardOff } from 'lucide-react';
import { IS_COARSE, useHardwareKeyboard } from '../lib/device';
import { useKeyboardMode } from '../lib/persist';
import { FloatingToggle } from '@gabriel/ui-kit';

/**
 * Floating keyboard-state button (coarse-pointer devices only) — kit
 * `FloatingToggle` chrome; this module keeps only the device state.
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

  return (
    <FloatingToggle
      data-no-longpress
      warn={hwKeyboard}
      active={active}
      aria-pressed={active}
      aria-label={hwKeyboard ? 'Hardware keyboard detected' : active ? 'Keyboard input on' : 'Keyboard input off'}
      title={
        hwKeyboard
          ? `Hardware keyboard detected — toggle has no effect. Software mode: ${active ? 'on' : 'off'}`
          : active ? 'Keyboard input on' : 'Keyboard input off'
      }
      style={{ bottom: 16, right: 16 }}
      onClick={(e) => {
        e.stopPropagation();
        setMode(active ? 'off' : 'on');
      }}
    >
      {active || hwKeyboard ? <Keyboard className="w-5 h-5" /> : <KeyboardOff className="w-5 h-5" />}
    </FloatingToggle>
  );
}
