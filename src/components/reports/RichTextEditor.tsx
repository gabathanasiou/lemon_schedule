import React from 'react';
import { RichTextEditor as KitRichTextEditor, RICH_TEXT_STATE_IDLE } from '@gabriel/ui-kit';
import type { RichTextEditorHandle, RichTextState, TokenItem } from '@gabriel/ui-kit';
import {
  ReportFieldDef, searchReportFields, fieldChipColor, parseToken, parseLookupKey, LookupTokenItem,
  lookupAttributeFields, lookupIdentityField, splitElementLookupKey, composeLookupKey,
} from '../../lib/reportFields';

// App adapter: wires the kit's generic rich-text editor to the report field
// vocabulary — `{{field}}` tokens resolve to report attributes (label + group
// color) and the `@` autocomplete searches report fields. Item lookup tokens
// (`lookup.<collection>.<field>.<key>`) render with a fixed reference color.
// The two-stage picker (item 121) lives here: `@` lists ITEMS ONLY (each entry
// in `lookupTokens` is one item keyed by its collection's identity field) and
// the kit's `.` trigger asks this adapter for that item's attributes, inserting
// the picked field as a SECOND chip (`nested` — the linked attribute bubble).
//
// Chip selection changes are forwarded to the consumer (`onSelectionChange`) —
// the block properties panel shows the item-formatting controls while a chip
// is selected, patching it via the kit's replaceToken handle.

const LOOKUP_COLOR = { text: '#7c3aed', bg: 'rgba(124, 58, 237, 0.12)' };

/** Reference caps for the `@` autocomplete: a bare `@` must never dump every
 *  scene/element of a large project into the popup. Each collection (elements
 *  per category) keeps its first matches; the total is capped too. Query
 *  narrowing happens BEFORE the caps, so a typed search reaches any item. */
const MAX_REFERENCE_RESULTS = 50;
const MAX_PER_REFERENCE_GROUP = 8;

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Scope-filtered attributes for the `@` token autocomplete. */
  fields?: ReportFieldDef[];
  /** Full registry — resolves lookup chip labels and the `.` attribute stage
   *  (the `fields` prop stays scope-filtered for the `@` field list). */
  allFields?: ReportFieldDef[];
  /** Stage-1 item references ("Bob", "Day 3 (…)", "23 · DINER") for `@`. */
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

const RichTextEditor = React.forwardRef<RichTextEditorHandle, RichTextEditorProps>(({ fields, allFields, lookupTokens, onSelectionChange, ...rest }, ref) => {
  const fieldsRef = React.useRef(fields);
  fieldsRef.current = fields;
  const allFieldsRef = React.useRef(allFields);
  allFieldsRef.current = allFields;
  const lookupsRef = React.useRef(lookupTokens);
  lookupsRef.current = lookupTokens;
  const editorRef = React.useRef<RichTextEditorHandle | null>(null);

  const resolveTokenMeta = (key: string) => {
    const lookup = parseLookupKey(key);
    if (lookup) {
      if (lookup.field === lookupIdentityField(lookup.collection)) {
        const hit = lookupsRef.current?.find(t => t.key === key);
        return { label: hit?.label || key, color: LOOKUP_COLOR };
      }
      // An attached attribute is its own chip — a nested bubble.
      const f = (allFieldsRef.current || fieldsRef.current)?.find(f => f.key === lookup.field);
      return { label: f?.label || lookup.field, color: LOOKUP_COLOR, nested: true };
    }
    const { field } = parseToken(key);
    const customized = key.includes('|');
    const f = fieldsRef.current?.find(f => f.key === field);
    if (!f) return null;
    const c = fieldChipColor(f.group);
    return { label: customized ? `${f.label} *` : f.label, color: c };
  };

  /** Stage 2: the identity chip's item-scoped attributes; each item's key is
   *  the full lookup key the kit inserts as a SECOND chip. Attribute chips
   *  themselves don't drill further (the dot does nothing). */
  const attributeItems = (chipKey: string, q: string): TokenItem[] => {
    const lookup = parseLookupKey(chipKey);
    if (!lookup || lookup.field !== lookupIdentityField(lookup.collection)) return [];
    const category = lookup.collection === 'elements' ? splitElementLookupKey(lookup.itemKey).category : undefined;
    const attrs = lookupAttributeFields(allFieldsRef.current || fieldsRef.current || [], lookup.collection, category);
    const itemLabel = lookupsRef.current?.find(t => t.key === chipKey)?.label || '';
    const query = q.trim().toLowerCase();
    return attrs
      .filter(f => !query || f.label.toLowerCase().includes(query) || f.key.toLowerCase().includes(query))
      .map(f => ({ key: composeLookupKey(lookup.collection, f.key, lookup.itemKey), label: f.label, color: LOOKUP_COLOR, group: itemLabel }));
  };

  return (
    <KitRichTextEditor
      ref={node => {
        editorRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      {...rest}
      resolveToken={resolveTokenMeta}
      suggestionItems={q => {
        const query = q.trim().toLowerCase();
        const fieldTokens = searchReportFields(fieldsRef.current, q).map(toToken);
        const perGroup = new Map<string, number>();
        const references: TokenItem[] = [];
        for (const t of lookupsRef.current || []) {
          if (references.length >= MAX_REFERENCE_RESULTS) break;
          const hint = t.hint || '';
          if (query && !t.label.toLowerCase().includes(query) && !t.key.toLowerCase().includes(query) && !hint.toLowerCase().includes(query)) continue;
          // Cap per COLLECTION (elements split by category) — hints repeat and
          // can be empty, so they must never drive the cap.
          const capKey = t.category ? `${t.collection}:${t.category}` : t.collection;
          const n = perGroup.get(capKey) ?? 0;
          if (n >= MAX_PER_REFERENCE_GROUP) continue;
          perGroup.set(capKey, n + 1);
          references.push({ key: t.key, label: t.label, color: LOOKUP_COLOR, group: t.hint });
        }
        return [...fieldTokens, ...references];
      }}
      attributeItems={attributeItems}
      onSelectionChange={onSelectionChange}
    />
  );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
export { RICH_TEXT_STATE_IDLE };
export type { RichTextEditorHandle, RichTextState };
