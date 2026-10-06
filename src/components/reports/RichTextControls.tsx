import React, { useState } from 'react';
import { RICH_TEXT_STATE_IDLE, TB_DIVIDER, TB_TOGGLE, TB_TOGGLE_OFF, TB_TOGGLE_ON } from '@gabriel/ui-kit';
import { AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart } from 'lucide-react';
import { Project, ReportTextStyle } from '../../types';
import { Tooltip } from '../Tooltip';
import { RichTextEditorHandle, RichTextState } from './RichTextEditor';
import { EditorGroup, EditorSection, editorRowCls, useBlockEditorPanel } from './reportEditorLayout';
import { TextStyleMenu, TextStylesModal } from './TextStyleMenu';
import RichTextFormatBar from './RichTextFormatBar';

// ONE shared rich-text control body for every report surface that edits rich
// text in place (roadmap 191): the Format row (the shared `RichTextFormatBar`)
// + the Style row (named `TextStyleMenu` + paragraph alignment — horizontal
// for both consumers, vertical only for free-table cells). Consumed by the
// designer canvas's inline text blocks (through `BlockEditorContent`) and the
// free-table cell chrome/dock (`CustomCellControls`). The block/cell DATA
// models stay separate — only this control body is shared. A named-style pick
// that carries `onPickStyle` targets object-level `block.textStyle`; without it
// the pick patches the object style directly (cells).

export interface RichTextObjectStyle {
  fontFamily?: string;
  fontSize?: number;
  textStyle?: string;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

export interface RichTextObjectPatch {
  fontFamily?: string;
  fontSize?: number;
  textStyle?: string;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

interface RichTextControlsProps {
  project: Project;
  /** The live editor instance the controls exec against (the canvas block's
   *  inline editor, or the focused free-table cell's editor). */
  editorRef: React.RefObject<RichTextEditorHandle | null>;
  /** Formatting state at the caret — lights the toggles. */
  active?: RichTextState;
  disabled?: boolean;
  /** Object-level style shown by the pickers when the caret is collapsed. */
  value?: RichTextObjectStyle;
  /** Axes pinned by a named style (text blocks) — passed to the format bar. */
  lockedFormatting?: { bold?: string; italic?: string };
  /** Multi-cell selection with differing object overrides. */
  objectMixed?: { fontFamily?: boolean; fontSize?: boolean };
  /** Format-bar object default patch (block props or cell style). */
  onDefaults: (patch: RichTextObjectPatch) => void;
  /** Style-row object patch: alignment. */
  onStyle: (patch: RichTextObjectPatch) => void;
  /** When set, the named-style pick calls this instead of `onStyle` (text
   *  blocks clear their direct typography on a style pick). */
  onPickStyle?: (id: string) => void;
  /** "Update from selection" (text blocks with direct formatting). */
  onUpdateFromSelection?: () => void;
  /** Show the vertical-align segment (free-table cells). */
  verticalAlign?: boolean;
  /** Persist named-style edits from the styles modal. */
  onSaveTextStyles?: (styles: ReportTextStyle[]) => void;
}

export const RichTextControls: React.FC<RichTextControlsProps> = ({
  project, editorRef, active, disabled, value, lockedFormatting, objectMixed,
  onDefaults, onStyle, onPickStyle, onUpdateFromSelection, verticalAlign, onSaveTextStyles,
}) => {
  const [stylesOpen, setStylesOpen] = useState(false);
  const panel = useBlockEditorPanel();
  const rt = active ?? RICH_TEXT_STATE_IDLE;
  const hasSelection = rt.hasSelection;
  const align = value?.align ?? 'left';
  const vAlign = value?.verticalAlign ?? 'top';

  return (
    <>
      <EditorSection label="Format">
        <RichTextFormatBar
          editorRef={editorRef}
          active={rt}
          disabled={disabled}
          defaults={{ fontFamily: value?.fontFamily, fontSize: value?.fontSize }}
          lockedFormatting={lockedFormatting}
          objectMixed={objectMixed}
          onDefaults={onDefaults}
        />
      </EditorSection>
      <EditorSection label="Style">
        <div className={editorRowCls(panel)}>
          <EditorGroup>
            <TextStyleMenu
              value={hasSelection ? (rt.textStyle || '') : (value?.textStyle || '')}
              project={project}
              disabled={!!disabled}
              editorRef={editorRef}
              hasSelection={hasSelection}
              mixed={hasSelection && !!rt.textStyleMixed}
              onChange={onPickStyle ?? (id => onStyle({ textStyle: id || undefined }))}
              onEdit={() => setStylesOpen(true)}
              onUpdateFromSelection={onUpdateFromSelection}
            />
          </EditorGroup>
          <div className={TB_DIVIDER} />
          <EditorGroup>
            {(['left', 'center', 'right'] as const).map(a => {
              const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
              return (
                <Tooltip key={a} content={`Align ${a}`}>
                  <button
                    disabled={disabled}
                    onClick={() => onStyle({ align: a })}
                    className={`${TB_TOGGLE} ${align === a ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}
                  >
                    <Icon className="w-3 h-3" />
                  </button>
                </Tooltip>
              );
            })}
          </EditorGroup>
          {verticalAlign && (
            <>
              <div className={TB_DIVIDER} />
              <EditorGroup>
                {(['top', 'middle', 'bottom'] as const).map(a => {
                  const Icon = a === 'top' ? AlignVerticalJustifyStart : a === 'middle' ? AlignVerticalJustifyCenter : AlignVerticalJustifyEnd;
                  return (
                    <Tooltip key={a} content={`Vertical align ${a}`}>
                      <button
                        disabled={disabled}
                        onClick={() => onStyle({ verticalAlign: a })}
                        className={`${TB_TOGGLE} ${vAlign === a ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}
                      >
                        <Icon className="w-3 h-3" />
                      </button>
                    </Tooltip>
                  );
                })}
              </EditorGroup>
            </>
          )}
        </div>
      </EditorSection>
      <TextStylesModal
        open={stylesOpen}
        project={project}
        onClose={() => setStylesOpen(false)}
        onSave={styles => onSaveTextStyles?.(styles)}
      />
    </>
  );
};

export default RichTextControls;
