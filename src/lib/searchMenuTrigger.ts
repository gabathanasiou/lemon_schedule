/**
 * The kit SearchMenu's expandable trigger renders its label on ONE line and
 * does not clip it (the trigger Button has no ellipsis), so a long record name
 * spills past the fixed collapsed width. Collapsed width → a rough character
 * fit for the 12px label plus the leading icon and padding; the open panel
 * always shows the full name.
 *
 * ONE helper for every expandable SearchMenu trigger (roadmap 318) — never
 * re-derive the fit per surface.
 */
export function clipTriggerLabel(label: string, collapsedWidth: number): string {
  const fit = Math.max(12, Math.floor((collapsedWidth - 40) / 7));
  return label.length > fit ? `${label.slice(0, fit - 1)}…` : label;
}
