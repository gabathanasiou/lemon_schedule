import React from 'react';
import {
  InspectorCheckbox,
  InspectorGroup,
  InspectorRow,
  InspectorSection,
  InspectorSurfaceContext,
  useInspectorSurface,
  type InspectorSurface,
} from '../inspector';

// ---- shared editor-layout surface ---------------------------------------------
// Roadmap 373: the block/column editors render on three surfaces (floating
// chrome, top toolbar, docked inspector). Their layout primitives now live in
// `src/components/inspector/` — this module is the compatibility layer the
// report editor imports, so every existing call site gets the shared grammar.

export type BlockEditorLayout = InspectorSurface;

/** The inspector surface: `panel` (docked rail) or `bar` (floating chrome). */
export const BlockEditorPanelContext = InspectorSurfaceContext;

/** True when the editor renders as the docked inspector panel. */
export const useBlockEditorPanel = () => useInspectorSurface() === 'panel';

/** The raw surface, for code that needs `'panel' | 'bar'`. */
export const useBlockEditorLayout = useInspectorSurface;

/** A labelled row — the 42px label column on the panel, inline on a bar. */
export const ContentRow: React.FC<{ label?: string; children: React.ReactNode; tall?: boolean; full?: boolean }> = ({ label, children, tall, full }) => (
  <InspectorRow label={label} tall={tall} full={full}>{children}</InspectorRow>
);

/** A labelled editor GROUP (Format, Style, Row, Column, …). */
export const EditorSection: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <InspectorSection label={label}>{children}</InspectorSection>
);

/** A cluster of related controls. A line break on a narrow panel only ever
 *  lands between the group's atomic sub-groups. */
export const EditorGroup: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <InspectorGroup className={className}>{children}</InspectorGroup>
);

/** Control row: wrapping groups on the panel, one nowrap line on a bar. */
export const editorRowCls = (panel?: boolean) =>
  panel ? 'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2' : 'flex items-center gap-1.5 flex-nowrap min-w-max';

/** Checkbox sized for the editor surfaces: plain inline, 10px muted label. */
export const EditorCheckbox: React.FC<React.ComponentProps<typeof InspectorCheckbox>> = ({ className = '', ...props }) => (
  <InspectorCheckbox {...props} className={className} />
);

/** Field width: full column in the panel, the given fixed width on bars. */
export const editorFieldCls = (panel: boolean | undefined, base: string) => (panel ? 'w-full' : base);
