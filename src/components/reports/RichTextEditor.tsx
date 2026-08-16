import React from 'react';
import { RichTextEditor as KitRichTextEditor, RICH_TEXT_STATE_IDLE } from '@gabriel/ui-kit';
import type { RichTextEditorHandle, RichTextState, TokenItem } from '@gabriel/ui-kit';
import { ReportFieldDef, searchReportFields, fieldChipColor, parseToken } from '../../lib/reportFields';

// App adapter: wires the kit's generic rich-text editor to the report field
// vocabulary — `{{field}}` tokens resolve to report attributes (label + group
// color) and the `@` autocomplete searches report fields.
//
// Chip clicks are forwarded to the consumer (`onTokenClick`) — the block
// properties panel renders the item-formatting controls for the last-clicked
// chip (list attributes only), patching it via the kit's replaceToken handle.

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Scope-filtered attributes for the `@` token autocomplete. */
  fields?: ReportFieldDef[];
  /** Fired whenever the caret/selection moves or formatting changes. */
  onStateChange?: (state: RichTextState) => void;
  /** Fired when a token chip is clicked (full key incl. `|`-options + rect). */
  onTokenClick?: (key: string, rect: DOMRect) => void;
}

const toToken = (f: ReportFieldDef): TokenItem => {
  const c = fieldChipColor(f.group);
  return { key: f.key, label: f.label, color: c, group: f.group };
};

const RichTextEditor = React.forwardRef<RichTextEditorHandle, RichTextEditorProps>(({ fields, onTokenClick, ...rest }, ref) => {
  const fieldsRef = React.useRef(fields);
  fieldsRef.current = fields;
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
        const { field } = parseToken(key);
        const customized = key.includes('|');
        const f = fieldsRef.current?.find(f => f.key === field);
        if (!f) return null;
        const c = fieldChipColor(f.group);
        return { label: customized ? `${f.label} *` : f.label, color: c };
      }}
      suggestionItems={q => searchReportFields(fieldsRef.current, q).map(toToken)}
      onTokenClick={onTokenClick}
    />
  );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
export { RICH_TEXT_STATE_IDLE };
export type { RichTextEditorHandle, RichTextState };
