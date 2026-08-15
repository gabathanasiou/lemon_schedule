import React from 'react';
import { RichTextEditor as KitRichTextEditor, RICH_TEXT_STATE_IDLE } from '@gabriel/ui-kit';
import type { RichTextEditorHandle, RichTextState, TokenItem } from '@gabriel/ui-kit';
import { ReportFieldDef, searchReportFields, fieldChipColor } from '../../lib/reportFields';

// App adapter: wires the kit's generic rich-text editor to the report field
// vocabulary — `{{field}}` tokens resolve to report attributes (label + group
// color) and the `@` autocomplete searches report fields.

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
}

const toToken = (f: ReportFieldDef): TokenItem => {
  const c = fieldChipColor(f.group);
  return { key: f.key, label: f.label, color: c, group: f.group };
};

const RichTextEditor = React.forwardRef<RichTextEditorHandle, RichTextEditorProps>(({ fields, ...rest }, ref) => {
  const fieldsRef = React.useRef(fields);
  fieldsRef.current = fields;
  return (
    <KitRichTextEditor
      ref={ref}
      {...rest}
      resolveToken={key => {
        const f = fieldsRef.current?.find(x => x.key === key);
        return f ? toToken(f) : null;
      }}
      suggestionItems={q => searchReportFields(fieldsRef.current, q).map(toToken)}
    />
  );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
export { RICH_TEXT_STATE_IDLE };
export type { RichTextEditorHandle, RichTextState };
