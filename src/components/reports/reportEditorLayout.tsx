import React from 'react';
import { ContentRow as KitContentRow } from '@gabriel/ui-kit';

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

/** Wrapper for a labelled control row on each surface (wraps in the panel). */
export const editorRowCls = (panel?: boolean) =>
  panel ? 'flex flex-wrap items-center gap-1.5 min-w-0' : 'flex items-center gap-1.5 flex-nowrap min-w-max';

/** Field width: full column in the panel, the given fixed width on bars. */
export const editorFieldCls = (panel: boolean | undefined, base: string) => (panel ? 'w-full' : base);
