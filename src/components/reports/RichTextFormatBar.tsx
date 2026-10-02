import React from 'react';
import { FormatToolbar, TB_PICKER } from '@gabriel/ui-kit';
import { RichTextEditorHandle, RichTextState } from './RichTextEditor';
import { LiveNumberInput } from '../LiveNumberInput';

// ONE contextual format bar for every report surface that edits rich text in
// place — text/field blocks (`ContentControls`) and free-table cells
// (`CustomCellControls`). Rules (roadmap 192):
//  - a TEXT SELECTION styles the run via the editor handle (inline marks;
//    font family/size ride on the kit's `textStyle` mark, persisted as
//    sanitized span styles);
//  - a collapsed caret styles the OBJECT default (`onDefaults`: block props
//    or `cellStyles`), which is also what the controls display when there is
//    no selection;
//  - Mixed (a selection spanning different run values) comes from the kit's
//    `RichTextState` and shows as the pickers' "Mixed" state, not an action.
// The size box is the app's LiveNumberInput (the ribbon's number recipe),
// committed with `focus: false` so typing never steals the run selection.

export interface RichTextDefaults {
  fontFamily?: string;
  fontSize?: number;
}

interface RichTextFormatBarProps {
  editorRef: React.RefObject<RichTextEditorHandle | null>;
  active: RichTextState;
  disabled?: boolean;
  /** Object-level defaults shown/applied when the caret is collapsed. */
  defaults?: RichTextDefaults;
  onDefaults: (patch: RichTextDefaults) => void;
  /** Axes pinned by a named style (whole block) — passed to the toolbar. */
  lockedFormatting?: { bold?: string; italic?: string };
  /** Object-level Mixed (a multi-cell selection with differing overrides) —
   *  ORed with the kit's run-level mixed flags. */
  objectMixed?: { fontFamily?: boolean; fontSize?: boolean };
  /** Attribute insert picker / extra controls after the divider. */
  trailing?: React.ReactNode;
}

export const RichTextFormatBar: React.FC<RichTextFormatBarProps> = ({ editorRef, active, disabled, defaults, onDefaults, lockedFormatting, objectMixed, trailing }) => {
  const hasSelection = active.hasSelection;
  const exec = (cmd: string, value?: string, opts?: { focus?: boolean }) => editorRef.current?.exec(cmd, value, opts);

  const fontValue = hasSelection
    ? (active.fontFamily || defaults?.fontFamily || '')
    : (defaults?.fontFamily || '');
  const runSize = parseFloat(active.fontSize || '');
  const sizeValue = hasSelection
    ? (Number.isFinite(runSize) ? runSize : undefined)
    : defaults?.fontSize;
  const sizeMixed = hasSelection ? active.fontSizeMixed : !!objectMixed?.fontSize;

  const onFont = (family: string) => {
    const next = family === 'Helvetica' ? undefined : family;
    if (hasSelection) exec(next ? 'fontFamily' : 'unsetFontFamily', next);
    else onDefaults({ fontFamily: next });
  };
  const onSize = (n: number) => {
    if (hasSelection) exec('fontSize', `${n}pt`, { focus: false });
    else onDefaults({ fontSize: n });
  };

  const sizeSlot = (
    // The box takes focus; keep a ghost highlight over the editor's selection
    // while it is focused (the native highlight only paints on editor focus).
    <span
      className="inline-flex"
      onFocusCapture={() => editorRef.current?.holdSelectionHighlight(true)}
      onBlurCapture={() => editorRef.current?.holdSelectionHighlight(false)}
    >
      <LiveNumberInput
        value={sizeMixed ? undefined : sizeValue}
        placeholder={sizeMixed ? 'Mixed' : undefined}
        min={6}
        max={96}
        fallback={defaults?.fontSize ?? 10}
        disabled={disabled}
        ariaLabel="Font size"
        title="Font size (pt)"
        className={`${TB_PICKER} w-14 text-center`}
        onCommit={onSize}
      />
    </span>
  );

  return (
    <FormatToolbar
      editorRef={editorRef}
      disabled={!!disabled}
      active={active}
      lockedFormatting={lockedFormatting}
      font={{ value: fontValue, mixed: hasSelection ? active.fontFamilyMixed : !!objectMixed?.fontFamily, onChange: onFont }}
      fontSizeSlot={sizeSlot}
      showClearFormatting
      trailing={trailing}
    />
  );
};

export default RichTextFormatBar;
