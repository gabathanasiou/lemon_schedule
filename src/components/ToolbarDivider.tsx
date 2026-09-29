/**
 * Canonical toolbar group divider (docs/DESIGN-LANGUAGE.md §Toolbar composition):
 * a thin vertical rule between control groups. Never hand-write the string —
 * one recipe everywhere, light and dark.
 */
export default function ToolbarDivider({ dark = false }: { dark?: boolean }) {
  return <div aria-hidden className={`w-px h-5 shrink-0 ${dark ? 'bg-zinc-700' : 'bg-zinc-200'}`} />;
}
