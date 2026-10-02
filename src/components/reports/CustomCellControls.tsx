import React, { useState } from 'react';
import { ChromeHeader, FontMenu, FormatToolbar, TB_BTN_ICON, TB_DIVIDER, TB_NUM, TB_TOGGLE, TB_TOGGLE_OFF, TB_TOGGLE_ON, ToolButton } from '@gabriel/ui-kit';
import { AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, RotateCcw, TableCellsMerge, Ungroup } from 'lucide-react';
import { Project, ReportCellStyle, ReportCollection, ReportTextStyle } from '../../types';
import { LiveNumberInput } from '../LiveNumberInput';
import { Tooltip } from '../Tooltip';
import { RichTextEditorHandle, RichTextState } from './RichTextEditor';
import { ContentRow, editorRowCls } from './reportEditorLayout';
import { FieldPicker } from './FieldPicker';
import { TextStyleMenu, TextStylesModal, useReportControlContext } from './blockControls';

// Free-table cell controls (roadmap 189) — the ONE body rendered by both the
// floating cell chrome and the docked inspector: the chrome header carries
// merge/unmerge/reset (icon actions, like every editor chrome), the body the
// same rich text toolbar a text block gets (inline marks on the focused cell's
// editor), the attribute insert picker, paragraph styles (project named
// styles), per-cell typography (font/size/align, horizontal + vertical).
// Reset clears the overrides + inline formatting back to the table defaults.

interface CustomCellControlsProps {
  /** Range description, e.g. "2 × 3 cells" / "No cells selected". */
  label: string;
  canMerge: boolean;
  canUnmerge: boolean;
  project: Project;
  parentCollection?: ReportCollection;
  /** Focus cell's effective style — the typography pickers' current values. */
  styleValue?: ReportCellStyle;
  /** The focused cell's editor handle — FormatToolbar's exec target. */
  editorRef?: React.RefObject<RichTextEditorHandle | null>;
  /** Inline formatting state at the caret (lights the toggles). */
  active?: RichTextState;
  readOnly?: boolean;
  /** Docked inspector layout: stacked ContentRows (context also drives them). */
  panel?: boolean;
  onMerge: () => void;
  onUnmerge: () => void;
  onStyle: (patch: Partial<ReportCellStyle>) => void;
  onReset: () => void;
  onSaveTextStyles?: (styles: ReportTextStyle[]) => void;
  onDeselect?: () => void;
}

export const CustomCellControls: React.FC<CustomCellControlsProps> = ({
  label, canMerge, canUnmerge, project, parentCollection, styleValue, editorRef, active, readOnly, panel,
  onMerge, onUnmerge, onStyle, onReset, onSaveTextStyles, onDeselect,
}) => {
  const { contextFields } = useReportControlContext(project, parentCollection);
  const [stylesOpen, setStylesOpen] = useState(false);
  const hasSelection = label !== 'No cells selected';
  const disabled = !!readOnly || !hasSelection;
  const align = styleValue?.align ?? 'left';
  const vAlign = styleValue?.verticalAlign ?? 'top';

  const insertAttribute = (
    <FieldPicker
      value=""
      fields={contextFields}
      onChange={f => editorRef?.current?.insertToken(f)}
      disabled={disabled}
      placeholder="Insert attribute…"
      scope={parentCollection}
      className={panel ? 'w-full' : 'w-32'}
    />
  );

  return (
    <div className={panel ? 'flex flex-col gap-1.5 min-w-0 w-full' : 'flex flex-col gap-1.5 min-w-max'}>
      <ChromeHeader
        className="w-full"
        leading={
          <>
            <TableCellsMerge className="w-3 h-3 text-zinc-400" />
            <span className="text-[10px] font-semibold text-zinc-300 pr-1">{label}</span>
          </>
        }
        trailing={
          <>
            <ToolButton onClick={onMerge} disabled={disabled || !canMerge} title="Merge cells" className={TB_BTN_ICON}>
              <TableCellsMerge className="w-2.5 h-2.5" />
            </ToolButton>
            <ToolButton onClick={onUnmerge} disabled={disabled || !canUnmerge} title="Unmerge cells" className={TB_BTN_ICON}>
              <Ungroup className="w-2.5 h-2.5" />
            </ToolButton>
            <div className={TB_DIVIDER} />
            <ToolButton onClick={onReset} disabled={disabled} title="Reset to table default — clears cell styles and inline formatting" className={TB_BTN_ICON}>
              <RotateCcw className="w-2.5 h-2.5" />
            </ToolButton>
            {onDeselect && (
              <>
                <div className={TB_DIVIDER} />
                <ToolButton onClick={onDeselect} disabled={false} title="Deselect cells" className={TB_BTN_ICON}><span className="text-[10px]">✕</span></ToolButton>
              </>
            )}
          </>
        }
      />
      {editorRef && (
        <div className={panel ? 'flex flex-col gap-1.5 px-2.5 pb-1.5' : 'flex flex-col gap-1 px-2.5 pb-1.5'}>
          <ContentRow label="Format">
            <FormatToolbar
              editorRef={editorRef}
              disabled={disabled}
              active={active}
              trailing={panel ? undefined : insertAttribute}
            />
            {panel && insertAttribute}
          </ContentRow>
          <ContentRow label="Style">
            <div className={editorRowCls(panel)}>
              <TextStyleMenu
                value={styleValue?.textStyle || ''}
                project={project}
                disabled={disabled}
                onChange={id => onStyle({ textStyle: id || undefined })}
                onEdit={() => setStylesOpen(true)}
              />
              <div className={TB_DIVIDER} />
              <FontMenu value={styleValue?.fontFamily || 'Helvetica'} disabled={disabled} onChange={f => onStyle({ fontFamily: f === 'Helvetica' ? undefined : f })} />
              <Tooltip content="Font size (pt)">
                <LiveNumberInput
                  value={styleValue?.fontSize}
                  min={6}
                  max={48}
                  fallback={10}
                  disabled={disabled}
                  className={TB_NUM}
                  onCommit={v => onStyle({ fontSize: v })}
                />
              </Tooltip>
              <div className={TB_DIVIDER} />
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
              <div className={TB_DIVIDER} />
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
            </div>
          </ContentRow>
        </div>
      )}
      <TextStylesModal
        open={stylesOpen}
        project={project}
        onClose={() => setStylesOpen(false)}
        onSave={styles => onSaveTextStyles?.(styles)}
      />
    </div>
  );
};

export default CustomCellControls;
