import React from 'react';
import type { ReportBlock, ReportCollection, ReportViewMode } from '../../types';
import type { ReportCollectionItem, ReportCtx } from '../../lib/reportData';
import type { FieldAux, ReportFieldDef } from '../../lib/reportFields';
import TextBlockView from './TextBlockView';
import type { RichTextEditorHandle, RichTextState } from './RichTextEditor';

/**
 * The optional title of a block (roadmap 140) — a REAL text block
 * (`block.titleBlock`) rendered through the ONE text renderer
 * (`TextBlockView`), so it looks, edits and formats exactly like a text block
 * (default centered/bold). Used by tables/grids/repeats as a heading ABOVE the
 * block and by image/map as a caption BELOW. This wrapper only resolves WHICH
 * fragments show it.
 *
 * Fragments: `visible` is the measured paginator's "this fragment holds the
 * title unit" flag — false on continuation chunks (the title renders only when
 * `titleRepeat`), undefined outside the paginator (designer / whole blocks).
 */
interface ReportBlockTitleProps {
  /** The block that owns the title. */
  block: ReportBlock;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  item?: ReportCollectionItem;
  aux?: FieldAux;
  hint?: boolean;
  mode?: ReportViewMode;
  onPatchBlock?: (patch: Partial<ReportBlock>) => void;
  showUnresolved?: boolean;
  parentCollection?: ReportCollection;
  parentCategory?: string;
  visible?: boolean;
  selected?: boolean;
  editing?: boolean;
  textAutoFocus?: boolean;
  textEditorRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  onTextStateChange?: (state: RichTextState) => void;
  onTextSelectionChange?: (sel: { key: string; pos: number } | null) => void;
  onTextEditEnd?: () => void;
  onTextFocusChange?: (focused: boolean) => void;
}

const ReportBlockTitle: React.FC<ReportBlockTitleProps> = ({ block, ctx, fieldMap, item, aux, hint, mode, onPatchBlock, showUnresolved, parentCollection, parentCategory, visible, selected, editing, textAutoFocus, textEditorRef, onTextStateChange, onTextSelectionChange, onTextEditEnd, onTextFocusChange }) => {
  const title = block.titleBlock;
  if (block.showTitle !== true || !title) return null;
  if (visible === false && block.titleRepeat !== true) return null;
  const patchTitle = onPatchBlock
    ? (p: Partial<ReportBlock>) => onPatchBlock({ titleBlock: { ...title, ...p } })
    : undefined;
  return (
    <div className={`report-block-title report-block-title-editor${hint ? ' report-title-input' : ''}`}>
      <TextBlockView
        block={title}
        ctx={ctx}
        fieldMap={fieldMap}
        aux={aux}
        item={item}
        parentCollection={parentCollection}
        parentCategory={parentCategory}
        mode={mode}
        showUnresolved={showUnresolved}
        onPatchBlock={patchTitle}
        editing={editing}
        textAutoFocus={textAutoFocus}
        selected={selected}
        textEditorRef={textEditorRef}
        onStateChange={onTextStateChange}
        onSelectionChange={onTextSelectionChange}
        onEditEnd={onTextEditEnd}
        onFocusChange={onTextFocusChange}
      />
    </div>
  );
};

export default ReportBlockTitle;
