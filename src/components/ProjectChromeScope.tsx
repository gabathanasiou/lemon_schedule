import React from 'react';
import { ThemeScope } from '@gabriel/ui-kit';
import type { KitMode } from '@gabriel/ui-kit';
import { useProjectTheme } from '../store';
import { projectAccentNameOf } from '../lib/projectTheme';

export interface ProjectChromeScopeProps {
  /** `dark` for the app header / popout toolbar, `light` for page toolbars. */
  mode?: KitMode;
  /** Wrapper classes — the default `contents` keeps the scope out of layout. */
  className?: string;
  children: React.ReactNode;
}

/**
 * The ONE ambient theme for project chrome (roadmap 311). Wrapping a header,
 * page toolbar or accent action in this scope publishes the project identity
 * (`--ui-accent-*`, tab pills, menus) to every kit descendant, so components
 * stop carrying hand-picked `PROJECT_CHROME` class strings. The identity
 * source stays `useProjectTheme()`; `PROJECT_CHROME` keeps only the status-bar
 * hex.
 */
export function ProjectChromeScope({ mode = 'dark', className = 'contents', children }: ProjectChromeScopeProps) {
  const accent = projectAccentNameOf(useProjectTheme());
  return (
    <ThemeScope mode={mode} accent={accent} context="chrome" className={className}>
      {children}
    </ThemeScope>
  );
}

export default ProjectChromeScope;
