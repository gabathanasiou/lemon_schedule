import React from 'react';
import { RichTextEditor as KitRichTextEditor, RICH_TEXT_STATE_IDLE } from '@gabriel/ui-kit';
import type { RichTextEditorHandle, RichTextState, TokenItem } from '@gabriel/ui-kit';
import { ReportFieldDef, searchReportFields, fieldChipColor, parseToken, parseLookupKey, LookupTokenItem } from '../../lib/reportFields';

// App adapter: wires the kit's generic rich-text editor to the report field
// vocabulary — `{{field}}` tokens resolve to report attributes (label + group
// color) and the `@` autocomplete searches report fields. Item lookup tokens
// (`lookup.<collection>.<field>.<key>`) render with a fixed reference color.
//
// Chip selection changes are forwarded to the consumer (`onSelectionChange`) —
// the block properties panel shows the item-formatting controls while a chip
// is selected, patching it via the kit's replaceToken handle.

const LOOKUP_COLOR = { text: '#7c3aed', bg: 'rgba(124, 58, 237, 0.12)' };

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Scope-filtered attributes for the `@` token autocomplete. */
  fields?: ReportFieldDef[];
  /** Item-reference tokens ("Day 3 · Call Time", …) for the `@` autocomplete. */
  lookupTokens?: LookupTokenItem[];
  /** Fired whenever the caret/selection moves or formatting changes. */
  onStateChange?: (state: RichTextState) => void;
  /** Fired when the selected chip changes: key + doc pos, or null on deselect. */
  onSelectionChange?: (sel: { key: string; pos: number } | null) => void;
}

const toToken = (f: ReportFieldDef): TokenItem => {
  const c = fieldChipColor(f.group);
  return { key: f.key, label: f.label, color: c, group: f.group };
};

const RichTextEditor = React.forwardRef<RichTextEditorHandle, RichTextEditorProps>(({ fields, lookupTokens, onSelectionChange, ...rest }, ref) => {
  const fieldsRef = React.useRef(fields);
  fieldsRef.current = fields;
  const lookupsRef = React.useRef(lookupTokens);
  lookupsRef.current = lookupTokens;
  const editorRef = React.useRef<RichTextEditorHandle | null>(null);

  return (
    <KitRichTextEditor
      ref={node => {
        editorRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      {...rest}
      resolveToken={key => {
        const lookup = parseLookupKey(key);
        if (lookup) {
          const hit = lookupsRef.current?.find(t => t.key === key);
          return { label: hit?.label || key, color: LOOKUP_COLOR };
        }
        const { field } = parseToken(key);
        const customized = key.includes('|');
        const f = fieldsRef.current?.find(f => f.key === field);
        if (!f) return null;
        const c = fieldChipColor(f.group);
        return { label: customized ? `${f.label} *` : f.label, color: c };
      }}
      suggestionItems={q => {
        const query = q.trim().toLowerCase();
        const fieldTokens = searchReportFields(fieldsRef.current, q).map(toToken);
        const lookups = (lookupsRef.current || [])
          .filter(t => !query || t.label.toLowerCase().includes(query) || t.key.toLowerCase().includes(query))
          .map<TokenItem>(t => ({ key: t.key, label: t.label, color: LOOKUP_COLOR, group: t.group }));
        return [...fieldTokens, ...lookups];
      }}
      onSelectionChange={onSelectionChange}
    />
  );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
export { RICH_TEXT_STATE_IDLE };
export type { RichTextEditorHandle, RichTextState };
