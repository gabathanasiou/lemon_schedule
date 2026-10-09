import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ReportBlock, ReportCollection, ReportViewMode } from '../../types';
import type { ReportCtx } from '../../lib/reportData';
import {
  FieldAux, ReportFieldDef, buildLookupTokens, fieldChipColor, fieldsForScope, getReportFieldDefs, resolveReportTokensHtml,
} from '../../lib/reportFields';
import { stripRichText, htmlProp } from '../../lib/richText';
import { getReportBlockBaseStyle } from './reportStyle';
import RichTextEditor, { RichTextEditorHandle, RICH_TEXT_STATE_IDLE, RichTextState } from './RichTextEditor';

// The ONE text renderer (roadmap 191/203): a text block renders the live
// inline editor in the designer (tokens as chips, `@` picker, formatting via
// the shared chrome) and resolved HTML everywhere else. `ReportBlockView`'s
// text case delegates here, and embedded table titles (roadmap 140) render
// through it too — so a title is a text block in every way.

export function isEmptyValue(v: string): boolean {
  return !v.trim();
}

/** True when the block renders (emptyBehavior hideBlock + an empty value = nothing). */
export function visibleFor(b: ReportBlock, value: string): boolean {
  if (!isEmptyValue(value)) return true;
  return (b.emptyBehavior ?? 'show') !== 'hideBlock';
}

const TOKEN_CHIP_RE = /(\{\{[^}]+\}\})/g;

/** Template preview: `{{field}}` tokens render as color-coded chips (one color
 *  per attribute group) so the "this is a template" nature of a text block is
 *  obvious in key mode. */
export const TokenPreview: React.FC<{ text: string; fieldMap?: Record<string, ReportFieldDef> }> = ({ text, fieldMap }) => {
  // stripRichText removes any stored markup (editor saves wrap text in <p>,
  // old kit builds polluted it with xmlns attrs) — key mode must show the
  // template text, never tags.
  const parts = stripRichText(text).split(TOKEN_CHIP_RE);
  return (
    <>
      {parts.map((part, i) => {
        const key = part.startsWith('{{') && part.endsWith('}}') && part.length > 4 ? part.slice(2, -2).trim() : null;
        const fieldKey = key ? key.split('|')[0].trim() : null;
        const customized = key ? key.includes('|') : false;
        if (key !== null) {
          const def = fieldKey ? fieldMap?.[fieldKey] : undefined;
          const color = def ? fieldChipColor(def.group) : { text: '#52525b', bg: 'rgba(82, 82, 91, 0.12)' };
          return (
            <span key={i} style={{ background: color.text, color: '#ffffff', borderRadius: 2, padding: '1px 4px', margin: '0 2px', fontWeight: 600, fontStyle: 'normal' }}>
              {part}
              {customized && <span style={{ opacity: 0.7, marginLeft: 2 }}>*</span>}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
};

/** Designer canvas: a text block being edited in place (roadmap 191). Renders
 *  the LIVE editor adapter (tokens as chips, `@` incl. the two-stage `.`
 *  picker) in the block's computed typography so size/alignment/line breaks
 *  match the resolved preview; `onChange` patches the block per change (the
 *  CustomTable cell pattern). Publishes its handle into the canvas's shared
 *  editor channel and reports focus/selection so the chrome body and the
 *  chip-affix controls follow. */
const InlineTextBlock: React.FC<{
  block: ReportBlock;
  ctx: ReportCtx;
  parentCollection?: ReportCollection;
  parentCategory?: string;
  style: React.CSSProperties;
  onPatchBlock: (patch: Partial<ReportBlock>) => void;
  /** Values entry only: focus on mount (caret at end). Fields mode mounts
   *  editors unfocused — the click that lands in one focuses it. */
  autoFocus?: boolean;
  /** The block is selected: its editor owns the shared formatting channel. */
  selected?: boolean;
  textEditorRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  onStateChange?: (state: RichTextState) => void;
  onSelectionChange?: (sel: { key: string; pos: number } | null) => void;
  onEditEnd?: () => void;
  onFocusChange?: (focused: boolean) => void;
}> = ({ block, ctx, parentCollection, parentCategory, style, onPatchBlock, textEditorRef, onStateChange, onSelectionChange, onEditEnd, onFocusChange, autoFocus, selected }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<RichTextEditorHandle | null>(null);
  const [focused, setFocused] = useState(false);
  const fields = useMemo(() => getReportFieldDefs(ctx.project), [ctx.project]);
  const contextFields = useMemo(() => fieldsForScope(fields, parentCollection, parentCategory), [fields, parentCollection, parentCategory]);
  const lookupTokens = useMemo(
    () => buildLookupTokens(ctx.project, ctx.dayInfos.map(d => ({ index: d.section.index, chronoDay: d.chronoDay, date: d.date }))),
    [ctx.project, ctx.dayInfos],
  );
  // The editor mounts once per editing session: capture the latest callbacks
  // in a ref so re-renders never detach the channel or drop the cleanup.
  const cbRef = useRef({ onStateChange, onSelectionChange, onEditEnd, onFocusChange });
  cbRef.current = { onStateChange, onSelectionChange, onEditEnd, onFocusChange };
  // Fields mode mounts an editor per text block: only the SELECTED (or focused)
  // one owns the shared handle, so the chrome's format controls target the
  // block being worked on.
  const publish = !!selected || focused;
  const publishRef = useRef(publish);
  publishRef.current = publish;
  const setHandle = React.useCallback((node: RichTextEditorHandle | null) => {
    handleRef.current = node;
    if (!textEditorRef) return;
    if (node && publishRef.current) textEditorRef.current = node;
    else if (textEditorRef.current === node) textEditorRef.current = null;
  }, [textEditorRef]);
  React.useEffect(() => {
    if (textEditorRef && publish && handleRef.current) textEditorRef.current = handleRef.current;
    return () => { if (textEditorRef?.current === handleRef.current) textEditorRef.current = null; };
  }, [publish, textEditorRef]);
  useLayoutEffect(() => {
    // Entering editing focuses IMMEDIATELY (one click, no second click needed)
    // so the double-click (or tap-again) types in place. Token blocks mount
    // their chips a beat later (TipTap NodeViews), and that render REPLACES
    // the paragraph DOM — resetting the caret — so wait for the chips before
    // focusing.
    let raf = 0;
    let attempts = 0;
    const enter = () => {
      attempts++;
      const tip = wrapperRef.current?.querySelector<HTMLElement>('.tiptap');
      const waitingForChips = !!tip && (block.text || '').includes('{{') && !tip.querySelector('.rt-token');
      // The editor DOM and the token NodeViews settle a beat after mount.
      if ((!tip || waitingForChips) && attempts < 90) {
        raf = requestAnimationFrame(enter);
        return;
      }
      if (!tip) return;
      if (document.activeElement !== tip) {
        // focus('end') places the caret where typing continues (kit handle,
        // TipTap's focus command) — a DOM range gets clobbered by the
        // editor's own selection sync.
        if (handleRef.current) handleRef.current.focus('end');
        if (document.activeElement !== tip) tip.focus();
      }
    };
    if (autoFocus) enter();
    return () => {
      cancelAnimationFrame(raf);
      cbRef.current.onStateChange?.(RICH_TEXT_STATE_IDLE);
      cbRef.current.onSelectionChange?.(null);
    };
  }, [autoFocus, textEditorRef]);
  return (
    <div
      ref={wrapperRef}
      className="report-text-editor"
      draggable={false}
      style={style}
      onFocus={() => { setFocused(true); cbRef.current.onFocusChange?.(true); }}
      onBlur={() => { setFocused(false); cbRef.current.onFocusChange?.(false); }}
      onKeyDown={e => {
        // Escape exits editing (every change is already patched). An open
        // suggestion popup consumes Escape before this handler runs.
        if (e.key === 'Escape') { e.stopPropagation(); cbRef.current.onEditEnd?.(); }
      }}
    >
      <RichTextEditor
        ref={setHandle}
        value={block.text || ''}
        onChange={text => onPatchBlock({ text })}
        onStateChange={state => cbRef.current.onStateChange?.(state)}
        onSelectionChange={sel => cbRef.current.onSelectionChange?.(sel)}
        placeholder="Type text… type @ to insert an attribute"
        fields={contextFields}
        allFields={fields}
        lookupTokens={lookupTokens}
        ctx={ctx}
        className="w-full"
      />
    </div>
  );
};

export interface TextBlockViewProps {
  block: ReportBlock;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  /** Computed per-block aux (counterStart/dayFormat/sceneScope/dayDate). */
  aux?: FieldAux;
  item?: any;
  parentCollection?: ReportCollection;
  parentCategory?: string;
  mode?: ReportViewMode;
  showUnresolved?: boolean;
  /** Designer only: patch THIS text block (mounts the live editor). */
  onPatchBlock?: (patch: Partial<ReportBlock>) => void;
  /** Designer only: the block is being edited (Values entry; Fields always). */
  editing?: boolean;
  /** Focus on mount when the editor opens (Values entry). */
  textAutoFocus?: boolean;
  /** Designer only: the block is selected — its editor owns the chrome channel. */
  selected?: boolean;
  textEditorRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  onStateChange?: (state: RichTextState) => void;
  onSelectionChange?: (sel: { key: string; pos: number } | null) => void;
  onEditEnd?: () => void;
  onFocusChange?: (focused: boolean) => void;
}

const TextBlockView: React.FC<TextBlockViewProps> = ({ block, ctx, fieldMap, aux, item, parentCollection, parentCategory, mode, showUnresolved, onPatchBlock, editing, textAutoFocus, selected, textEditorRef, onStateChange, onSelectionChange, onEditEnd, onFocusChange }) => {
  const showKeys = mode === 'fields';
  const baseStyle = getReportBlockBaseStyle(block, ctx.project);
  if (onPatchBlock && (showKeys || editing)) {
    return (
      <InlineTextBlock
        block={block}
        ctx={ctx}
        parentCollection={parentCollection}
        parentCategory={parentCategory}
        style={baseStyle}
        onPatchBlock={onPatchBlock}
        autoFocus={textAutoFocus}
        selected={selected}
        textEditorRef={textEditorRef}
        onStateChange={onStateChange}
        onSelectionChange={onSelectionChange}
        onEditEnd={onEditEnd}
        onFocusChange={onFocusChange}
      />
    );
  }
  if (showKeys) {
    return (
      <div style={{ ...baseStyle, color: '#8f8f8f', fontStyle: 'italic' }}>
        {block.text ? <TokenPreview text={block.text} fieldMap={fieldMap} /> : '\u00A0'}
      </div>
    );
  }
  const html = resolveReportTokensHtml(ctx, fieldMap, block.text || '', item, aux, { showUnresolved });
  const text = stripRichText(html);
  if (!visibleFor(block, text)) return null;
  const st: React.CSSProperties = { ...baseStyle };
  if ((block.emptyBehavior ?? 'show') === 'hideText' && isEmptyValue(text)) st.display = 'none';
  const isHtml = html.includes('<');
  if (isHtml) {
    return <div className="report-text-block" style={st} dangerouslySetInnerHTML={htmlProp(html || '\u00A0')} />;
  }
  return <div className="report-text-block" style={{ ...st, whiteSpace: 'pre-wrap' }}>{text || '\u00A0'}</div>;
};

export default TextBlockView;
