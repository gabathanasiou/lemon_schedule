import React from 'react';
import { GlideGridShell } from '../lib/glideShell';
import { crewGlideConfig } from '../lib/crewGlideConfig';

export function CrewGlideTab({ headerTarget, onGoToManager }: { headerTarget?: HTMLElement | null; onGoToManager?: (roleKey: string) => void }) {
  return <GlideGridShell config={crewGlideConfig} headerTarget={headerTarget} onGoToManager={onGoToManager} />;
}
