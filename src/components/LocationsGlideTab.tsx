import React from 'react';
import { GlideGridShell } from '../lib/glideShell';
import { locationGlideConfig } from '../lib/locationGlideConfig';

export function LocationsGlideTab({ headerTarget, onGoToManager }: { headerTarget?: HTMLElement | null; onGoToManager?: (typeKey: string) => void }) {
  return <GlideGridShell config={locationGlideConfig} headerTarget={headerTarget} onGoToManager={onGoToManager} />;
}
