import React from 'react';
import { RichTextEditor as KitRichTextEditor, RICH_TEXT_STATE_IDLE } from '@gabriel/ui-kit';
import type { RichTextEditorHandle, RichTextState, TokenItem } from '@gabriel/ui-kit';
import { ReportFieldDef, searchReportFields, fieldChipColor } from '../../lib/reportFields';
import { parseToken } from '../../lib/reportFields';

// App adapter: wires the kit's generic rich-text editor to the report field
// vocabulary — `{{field}}` tokens resolve to report attributes (label + group
// color) and the `@` autocomplete searches report fields.
//
// Token item-formatting: clicking a chip opens a small popover that edits
// ONLY that chip's `{{field|prefix|suffix|separator}}` options (via the kit's
// replaceToken handle). Customized chips render with a `*` on their label.

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

/** Split a piped token key back into its parts: field, item prefix/suffix/separator. */
function splitTokenKey(key: string): { field: string; prefix: string; suffix: string; separator: string } {
  const { field, opts } = parseToken(key);
  return { field, prefix: opts.itemPrefix ?? '', suffix: opts.itemSuffix ?? '', separator: opts.itemSeparator ?? '' };
}

/** Compose a piped token key from parts (omits pipes when all empty). */
function composeTokenKey(field: string, prefix: string, suffix: string, separator: string): string {
  if (!prefix && !suffix && !separator) return field;
  return `${field}|${prefix}|${suffix}|${separator}`;
}

const ChipOptionsPopover: React.FC<{
  fieldLabel: string;
  fieldKey: string;
  initial: { prefix: string; suffix: string; separator: string };
  rect: DOMRect;
  onApply: (prefix: string, suffix: string, separator: string) => void;
  onClose: () => void;
}> = ({ fieldLabel, fieldKey, initial, rect, onApply, onClose }) => {
  const [prefix, setPrefix] = React.useState(initial.prefix);
  const [suffix, setSuffix] = React.useState(initial.suffix);
  const [separator, setSeparator] = React.useState(initial.separator);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 300));
  const top = rect.bottom + 8 < window.innerHeight - 170 ? rect.bottom + 8 : Math.max(8, rect.top - 162);
  return (
    <div
      className="fixed z-50 w-[280px] rounded-md bg-zinc-950/95 backdrop-blur-md border border-zinc-800 shadow-xl p-3 space-y-2.5"
      style={{ left, top }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
        <span>Item formatting — {fieldLabel}</span>
        <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200">✕</button>
      </div>
      {[
        { label: 'Item prefix', value: prefix, set: setPrefix, ph: '· ' },
        { label: 'Item suffix', value: suffix, set: setSuffix, ph: '' },
        { label: 'Item separator', value: separator, set: setSeparator, ph: ', ' },
      ].map(row => (
        <label key={row.label} className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-zinc-500 w-24 shrink-0">{row.label}</span>
          <input
            value={row.value}
            onChange={e => row.set(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onApply(prefix, suffix, separator); if (e.key === 'Escape') onClose(); }}
            placeholder={row.ph}
            className="flex-1 h-6 min-w-0 bg-zinc-800 border border-zinc-700 rounded px-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-blue-500"
          />
        </label>
      ))}
      <div className="flex items-center justify-between pt-0.5">
        <code className="text-[9px] text-zinc-500 truncate">{'{{' + composeTokenKey(fieldKey, prefix, suffix, separator) + '}}'}</code>
        <button
          type="button"
          onClick={() => onApply(prefix, suffix, separator)}
          className="h-6 px-2.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] font-medium text-zinc-200 hover:bg-zinc-700"
        >
          Apply
        </button>
      </div>
    </div>
  );
};

const RichTextEditor = React.forwardRef<RichTextEditorHandle, RichTextEditorProps>(({ fields, onTokenClick, ...rest }, ref) => {
  const fieldsRef = React.useRef(fields);
  fieldsRef.current = fields;
  const [chip, setChip] = React.useState<{ key: string; rect: DOMRect } | null>(null);
  const editorRef = React.useRef<RichTextEditorHandle | null>(null);

  const applyChip = (prefix: string, suffix: string, separator: string) => {
    if (!chip) return;
    const { field } = splitTokenKey(chip.key);
    editorRef.current?.replaceToken(composeTokenKey(field, prefix, suffix, separator));
    setChip(null);
  };

  const fieldOf = (key: string) => fieldsRef.current?.find(f => f.key === key);

  return (
    <>
      <KitRichTextEditor
        ref={node => {
          editorRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        {...rest}
        resolveToken={key => {
          const { field } = splitTokenKey(key);
          const customized = key.includes('|');
          const f = fieldOf(field);
          if (!f) return null;
          const c = fieldChipColor(f.group);
          return { label: customized ? `${f.label} *` : f.label, color: c };
        }}
        suggestionItems={q => searchReportFields(fieldsRef.current, q).map(toToken)}
        onTokenClick={(key, rect) => {
          setChip({ key, rect });
          onTokenClick?.(key, rect);
        }}
      />
      {chip && (
        <ChipOptionsPopover
          key={chip.key}
          fieldLabel={fieldOf(splitTokenKey(chip.key).field)?.label ?? splitTokenKey(chip.key).field}
          fieldKey={splitTokenKey(chip.key).field}
          initial={splitTokenKey(chip.key)}
          rect={chip.rect}
          onApply={applyChip}
          onClose={() => setChip(null)}
        />
      )}
    </>
  );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
export { RICH_TEXT_STATE_IDLE };
export type { RichTextEditorHandle, RichTextState };
