import React from 'react';
import { DatabaseManagerView } from '../lib/managerShell';
import { crewManagerConfig } from '../lib/crewManagerConfig';

export function CrewManager({ headerTarget, initialRole, onRoleChange }: { headerTarget?: HTMLElement | null; initialRole?: string | null; onRoleChange?: (role: string) => void }) {
  return <DatabaseManagerView config={crewManagerConfig} headerTarget={headerTarget} initialCategory={initialRole} onCategoryChange={onRoleChange} />;
}
