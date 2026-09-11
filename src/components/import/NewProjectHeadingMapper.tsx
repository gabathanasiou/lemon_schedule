import React from 'react';
import HeadingValueMapper from './HeadingValueMapper';
import {
  collectUnknownHeadingValuesOfProject,
  applyHeadingMappingToProject,
  knownIntExtValues,
  knownDayNightValues,
} from '../../lib/import';
import type { Project } from '../../types';

/**
 * New-project import heading mapping (roadmap 127) — the Project Manager / File
 * new-project path builds the Project first, then routes any custom/localized
 * heading values through the shared `HeadingValueMapper` before committing.
 * Same prompt as append/diff, never a silent fold. `null` renders nothing.
 */
export default function NewProjectHeadingMapper({ project, onConfirm, onCancel }: {
  project: Project | null;
  onConfirm: (project: Project) => void;
  onCancel: () => void;
}) {
  if (!project) return null;
  const unknown = collectUnknownHeadingValuesOfProject(project);
  if (unknown.intExt.length === 0 && unknown.dayNight.length === 0) return null;
  return (
    <HeadingValueMapper
      unknown={unknown}
      knownIntExt={knownIntExtValues(project)}
      knownDayNight={knownDayNightValues(project)}
      onCancel={onCancel}
      onConfirm={mapping => onConfirm(applyHeadingMappingToProject(project, mapping))}
    />
  );
}
