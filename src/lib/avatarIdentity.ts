/**
 * Deterministic avatar identity (roadmap 229 S2.5 / 231) — the ONE place the
 * flat colour palette and initials rules live. `AccountAvatar`, the sharing
 * panel and the S3 presence pointers all reuse these, so the same person has
 * the same colour on every client and every surface.
 */

const AVATAR_COLORS = ['#0f766e', '#b45309', '#7e22ce', '#be123c', '#1d4ed8', '#15803d', '#c2410c', '#4338ca', '#a16207', '#0e7490'];

/** FNV-1a over the identity seed → one of ten flat colours (stable forever). */
export function avatarColor(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** "Sam Fisher" → "SF"; "Anonymous Otter" → "AO"; single word → first letter. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** First word of a display name — the live-cursor label stays compact. */
export function shortNameOf(name: string): string {
  const first = name.trim().split(/\s+/).filter(Boolean)[0];
  return first || 'Someone';
}
