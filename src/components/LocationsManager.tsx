import React from 'react';
import { DatabaseManagerView } from '../lib/managerShell';
import { locationManagerConfig } from '../lib/locationManagerConfig';

export function LocationsManager({ headerTarget, initialType, onTypeChange }: { headerTarget?: HTMLElement | null; initialType?: string | null; onTypeChange?: (type: string) => void }) {
  return <DatabaseManagerView config={locationManagerConfig} headerTarget={headerTarget} initialCategory={initialType} onCategoryChange={onTypeChange} />;
}
