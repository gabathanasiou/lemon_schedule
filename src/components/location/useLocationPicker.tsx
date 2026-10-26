import React, { useCallback, useState } from 'react';
import type { Project } from '../../types';
import type { PickedLocation } from '../../lib/places';
import { LocationPickerModal } from './LocationPickerModal';

export interface LocationPickRequest {
  /** Seed the picker (e.g. a typed address for a new location). */
  initial?: Partial<PickedLocation> | null;
}

/**
 * Owns the shared {@link LocationPickerModal} for hosts that CREATE locations
 * (the crew Report-to flow, the Day Manager Locations grid). The caller's
 * opaque `target` comes back on confirm so each host applies the pick its own
 * way — assign a crew slot, attach a day location. ONE picker-mounting
 * implementation, no per-host copies.
 */
export function useLocationPicker<T>(
  project: Project,
  onConfirm: (target: T, picked: PickedLocation, type: string) => void,
) {
  const [pending, setPending] = useState<{ target: T; request: LocationPickRequest } | null>(null);
  const open = useCallback((target: T, request: LocationPickRequest = {}) => {
    setPending({ target, request });
  }, []);
  const node = (
    <LocationPickerModal
      open={pending !== null}
      onClose={() => setPending(null)}
      onConfirm={(picked, type) => {
        const current = pending;
        setPending(null);
        if (current) onConfirm(current.target, picked, type || 'set');
      }}
      initial={pending?.request.initial ?? null}
      locationTypes={project.locationTypes || []}
      defaultType="set"
    />
  );
  return { open, node };
}
