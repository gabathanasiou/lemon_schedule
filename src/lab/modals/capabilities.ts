import type { ModalSurfaceMeta } from './types';

/**
 * Surface capability index (roadmap 374, agent-useful studio).
 *
 * The studio's source list is the ONE map from a surface to its files, so the
 * same files that drive the completeness test also drive this index: scan the
 * source text for the shared primitives a modal uses and expose the result as
 * searchable keywords + a structured list for the agent/control API.
 *
 * Static (not DOM) on purpose: closed menus/conditional tabs are still
 * "capabilities" of the surface even when the current fixture state does not
 * render them. Shared primitives are matched by their import/JSX names; the
 * scan is limited to the surface's listed files (the registry contract).
 */

export type SurfaceCapability =
  | 'dropdown'
  | 'segmented'
  | 'tabs'
  | 'checklist'
  | 'date'
  | 'colour'
  | 'map'
  | 'rich-text'
  | 'file'
  | 'table'
  | 'grid'
  | 'form'
  | 'dialog';

export const CAPABILITY_LABELS: Record<SurfaceCapability, string> = {
  dropdown: 'Dropdown',
  segmented: 'Segmented',
  tabs: 'Tabs',
  checklist: 'Checklist',
  date: 'Date',
  colour: 'Colour',
  map: 'Map',
  'rich-text': 'Rich text',
  file: 'File import',
  table: 'Table',
  grid: 'Grid',
  form: 'Form',
  dialog: 'Dialog',
};

const RULES: { capability: SurfaceCapability; test: RegExp }[] = [
  { capability: 'dropdown', test: /\b(EntityDropdown|DropdownMenu|PickerField|SelectDropdown|GroupedSelect|SearchMenu|AutocompleteDropdown|CategoryDropdown|LocationSearchMenu|ItemManagerDropdown)\b|aria-haspopup|<Dropdown/ },
  { capability: 'segmented', test: /\b(Seg|InspectorSeg)\b/ },
  { capability: 'tabs', test: /\b(TabFace|PageToolbar)\b|role="tablist"|<Tab\b/ },
  { capability: 'checklist', test: /\b(Checklist|RadioList|Checkbox)\b/ },
  { capability: 'date', test: /\b(DatePicker|DateField)\b/ },
  { capability: 'colour', test: /\b(ColorField|InspectorColor)\b/ },
  { capability: 'map', test: /\b(MapContainer|LocationPickerModal|leaflet)\b/ },
  { capability: 'rich-text', test: /\b(RichTextEditor|FormatToolbar|Mention|contentEditable)\b/ },
  { capability: 'file', test: /\b(ImportDialog|ImportResult|type="file"|accept=)\b/ },
  { capability: 'table', test: /\b(InlineGlideTable|<table)\b/ },
  { capability: 'grid', test: /\b(Glide|DataEditor|InlineGlideTable)\b/ },
  { capability: 'form', test: /<input|<textarea|<select/ },
];

// Source texts are small enough to keep in the DEV-only lab chunk; this module
// is never imported by production code.
const SOURCE_TEXT = import.meta.glob('/src/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function textOf(surface: ModalSurfaceMeta): string {
  return surface.sources
    .map((source) => SOURCE_TEXT[`/${source.replace(/^\/+/, '')}`] ?? '')
    .join('\n');
}

export function capabilitiesForSurface(surface: ModalSurfaceMeta): SurfaceCapability[] {
  const text = textOf(surface);
  const caps = new Set<SurfaceCapability>();
  if (surface.kind === 'dialog') caps.add('dialog');
  for (const rule of RULES) {
    if (rule.test.test(text)) caps.add(rule.capability);
  }
  return [...caps];
}

/** Searchable capability words for the studio picker (lowercase). */
export function capabilityKeywords(caps: SurfaceCapability[]): string {
  return caps.map((cap) => `${cap} ${CAPABILITY_LABELS[cap]}`).join(' ');
}
