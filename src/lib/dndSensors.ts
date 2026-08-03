import React from 'react';
import { PointerSensor, TouchSensor, useSensor, useSensors, type PointerSensorOptions, type PointerSensorProps, type SensorDescriptor } from '@dnd-kit/core';
import { IS_COARSE } from './device';

/**
 * PointerSensor variant that only activates for mouse input.
 *
 * On coarse devices (e.g. iPad with a connected mouse/trackpad) the app keeps
 * TouchSensor for finger/Apple Pencil drags but must also accept pointer-based
 * mouse drags — iPadOS Safari does not synthesize touch events for mouse
 * input, so a TouchSensor-only setup makes mouse dragging impossible (while
 * the pointer-driven marquee still works).
 */
class MousePointerSensor extends PointerSensor {
  constructor(props: PointerSensorProps) {
    super(props);
  }
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: React.PointerEvent, options: PointerSensorOptions) => {
        if (event.pointerType === 'mouse') {
          return PointerSensor.activators[0].handler({ nativeEvent: event } as React.PointerEvent, options);
        }
        return false;
      },
    },
  ];
}

/**
 * App-wide drag sensors. Desktop: PointerSensor (mouse/touch via pointer
 * events). Coarse devices: TouchSensor (finger AND Apple Pencil, 200ms delay
 * to distinguish scroll) plus MousePointerSensor (mouse/trackpad,
 * distance-based like desktop). When `disabled`, drags are turned off for all
 * input types.
 */
export function useAppDragSensors(disabled: boolean, distance = 5): SensorDescriptor<any>[] {
  const touch = useSensor(TouchSensor, {
    activationConstraint: disabled ? { delay: 999999, tolerance: 0 } : { delay: 200, tolerance: 5 },
  });
  const mouse = useSensor(MousePointerSensor, {
    activationConstraint: { distance: disabled ? 999999 : distance },
  });
  const pointer = useSensor(PointerSensor, {
    activationConstraint: { distance: disabled ? 999999 : distance },
  });
  return IS_COARSE
    ? useSensors(touch, mouse)
    : useSensors(pointer);
}
