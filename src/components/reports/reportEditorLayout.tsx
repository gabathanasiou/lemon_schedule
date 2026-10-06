import React from 'react';
import { ContentRow as KitContentRow, SectionHeader } from '@gabriel/ui-kit';
import Checkbox from '../Checkbox';

// ---- shared editor-layout surface ---------------------------------------------
// The block/column editors render on three surfaces (floating chrome, top
// toolbar, docked inspector). 'bar' keeps the wide single-row layout; 'panel'
// stacks labels above controls and fills the inspector column.

export type BlockEditorLayout = 'bar' | 'panel';

export const BlockEditorPanelContext = React.createContext(false);

/** True when the editor renders as the docked inspector panel. */
export const useBlockEditorPanel = () => React.useContext(BlockEditorPanelContext);

/** ContentRow that stacks its label above the controls in panel mode. */
export const ContentRow: React.FC<{ label?: string; children: React.ReactNode; tall?: boolean }> = ({ tall, ...props }) => (
  <KitContentRow {...props} tall={tall || useBlockEditorPanel()} />
);

/** A labelled editor GROUP (Format, Style, Row, Column, …). The panel renders
 *  the shared section eyebrow + hairline rule — the same language as every
 *  other inspector section; bars keep the kit's label-left content row so the
 *  floating chrome stays one line. */
export const EditorSection: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const panel = useBlockEditorPanel();
  if (!panel) return <KitContentRow label={label}>{children}</KitContentRow>;
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <SectionHeader>{label}</SectionHeader>
      {children}
    </div>
  );
};

/** Wrapper for a labelled control row on each surface (wraps in the panel). */
export const editorRowCls = (panel?: boolean) =>
  panel ? 'flex flex-wrap items-center gap-x-1.5 gap-y-1.5 min-w-0' : 'flex items-center gap-1.5 flex-nowrap min-w-max';

/** A cluster of related controls that wraps as ONE unit — a line break on a
 *  narrow docked rail only ever lands BETWEEN clusters (alignment trios,
 *  stepper/label pairs), never inside one. Pass `className` to override the
 *  default `shrink-0` (e.g. `min-w-0 flex-1` for growable label+input pairs). */
export const EditorGroup: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = 'shrink-0' }) => (
  <div className={`flex items-center gap-1 ${className}`}>{children}</div>
);

/** Checkbox sized for the editor surfaces: the docked panel makes it a
 *  full-width row (pass `flex-1` when siblings share the row for equal
 *  halves, like the Seg); bars keep the inline pill. */
export const EditorCheckbox: React.FC<React.ComponentProps<typeof Checkbox>> = ({ className = '', ...props }) => {
  const panel = useBlockEditorPanel();
  return <Checkbox {...props} block={panel} className={className} />;
};

/** Field width: full column in the panel, the given fixed width on bars. */
export const editorFieldCls = (panel: boolean | undefined, base: string) => (panel ? 'w-full' : base);
