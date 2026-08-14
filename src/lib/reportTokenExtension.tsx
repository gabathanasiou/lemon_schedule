import { Mention } from '@tiptap/extension-mention';
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import React from 'react';
import { ReportFieldDef, fieldChipColor } from './reportFields';

// TipTap Token atom: `{{field}}` in stored HTML becomes an engine-native
// inline atom (chip) in the editor. The atom serializes back to the PLAIN text
// `{{field}}` (bare-string renderHTML → ProseMirror emits a text node), so
// storage stays byte-compatible with the pre-TipTap format.
//
// Selection is native: `selectable: true` (Mention's v3 default is false) so
// clicking a chip selects the whole atom — ⌫ deletes it, arrows skip it, the
// formatting toolbar targets it. TipTap's ReactNodeView handles selection
// updates (adds `ProseMirror-selectednode` + the `selected` prop).

interface TokenAttrs {
  field: string | null;
}

/** Chip renderer for a token atom — attribute label on the group color. */
export const TokenChipView: React.FC<NodeViewProps> = ({ node, selected, extension, editor, view, getPos }) => {
  const field = (node.attrs as TokenAttrs).field ?? '';
  const def = (extension.options as { fields?: ReportFieldDef[] }).fields?.find(f => f.key === field);
  const color = def ? fieldChipColor(def.group) : { text: '#52525b', bg: 'rgba(82, 82, 91, 0.12)' };
  const label = def?.label ?? `{{${field}}}`;
  return (
    <NodeViewWrapper
      as="span"
      data-type="token"
      className={`rt-token inline-block ${selected ? 'rt-token-selected' : ''}`}
      style={{
        background: color.text,
        color: '#fff',
        borderRadius: 2,
        padding: 4,
        margin: '0 2px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
      onMouseDown={(e) => {
        // Clicking the chip selects the whole atom (native NodeSelection) so
        // ⌫ deletes it, typing replaces it, and the formatting toolbar
        // targets it. preventDefault keeps PM's default caret placement from
        // landing inside the chip.
        if (e.button !== 0 || !editor.isEditable) return;
        e.preventDefault();
        if (!editor.isFocused) editor.commands.focus();
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) return;
        const $pos = view.state.doc.resolve(pos);
        const target = $pos.nodeAfter;
        if (target && NodeSelection.isSelectable(target)) {
          view.dispatch(view.state.tr.setSelection(new NodeSelection($pos)));
        }
      }}
    >
      {label}
    </NodeViewWrapper>
  );
};

/** Strip the (defensive) `<span data-type="token">…</span>` wrappers back to
 *  plain `{{field}}` text before the sanitizer runs. A no-op when renderHTML
 *  already emits bare text — kept so BOTH serialization paths verify against
 *  the same storage contract. */
export function stripTokenWrappers(html: string): string {
  return html.replace(/<span data-type="token"[^>]*>\{\{([^{}]+)\}\}<\/span>/g, '{{$1}}');
}

/** Pre-process stored HTML before `useEditor` init: plain `{{field}}` text →
 *  `<span data-type="token">` so the Token extension's parseHTML matches.
 *  Caveat: the regex can match inside attribute values of exotic pasted HTML —
 *  the sanitizer normalizes on save, so this is acceptable. */
export function preprocessTokenHtml(html: string): string {
  return html.replace(/\{\{([^{}]+)\}\}/g, (_m, field: string) =>
    `<span data-type="token" data-field="${field}">{{${field}}}</span>`);
}

export interface TokenSuggestionConfig {
  fields: ReportFieldDef[];
  suggestion?: Record<string, unknown>;
}

/** The Token extension — an atom with a native React chip view. */
export const Token = Mention.extend({
  name: 'token',
  selectable: true,
  addOptions() {
    return {
      ...this.parent?.(),
      fields: [] as ReportFieldDef[],
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(TokenChipView);
  },
  addAttributes() {
    return {
      field: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-field'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.field ? { 'data-field': attrs.field } : {}),
      },
      label: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-label'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.label ? { 'data-label': attrs.label } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="token"]' }];
  },
  // Span wrapper + save-strip: this PM version has no bare-string spec
  // shortcut, so the atom serializes as `<span data-type="token">` and
  // `stripTokenWrappers` regex-strips it back to plain `{{field}}` on save —
  // the stripped output is the storage contract.
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-type': 'token' }, HTMLAttributes), `{{${node.attrs.field ?? ''}}}`];
  },
  renderText({ node }) {
    return `{{${node.attrs.field ?? ''}}}`;
  },
});
