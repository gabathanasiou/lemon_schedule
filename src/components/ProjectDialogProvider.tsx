import React from 'react';
import { DialogProvider, ThemeProvider } from '@gabriel/ui-kit';
import { useProjectTheme } from '../store';
import { projectAccentNameOf, projectModalThemeOf } from '../lib/projectTheme';

/**
 * App-root project identity + dialogs (roadmaps 332/333).
 *
 * ONE context-only scope publishes the raw project accent for the whole app,
 * so a primary action stays project-coloured even inside a page whose
 * `ThemeScope` is deliberately neutral (the kit's identity-aware primary).
 *
 * `DialogProvider` lives HERE, inside `ProjectProvider`, instead of
 * `main.tsx`: confirm/prompt/alert render through the kit Modal, and a
 * provider mounted above every scope can never inherit the project's
 * mode/accent/surface. It uses the same mapper as the Modal shim, so dialogs
 * and modals always agree.
 */
export function ProjectDialogProvider({ children }: { children: React.ReactNode }) {
  const theme = useProjectTheme();
  const modal = projectModalThemeOf(theme);
  return (
    <ThemeProvider accent={projectAccentNameOf(theme)}>
      <DialogProvider theme="dark" accent={modal.accent} surface={modal.surface}>
        {children}
      </DialogProvider>
    </ThemeProvider>
  );
}

export default ProjectDialogProvider;
