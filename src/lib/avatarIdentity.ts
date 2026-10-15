/**
 * Deterministic avatar identity (roadmap 229 S2.5 / 231) — the ONE place the
 * flat colour palette lives: presence pointers, name labels, peer highlights
 * and the avatar circle all read the same colour for the same person. The
 * avatar's letters render through DiceBear `initials` in `AccountAvatar`.
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

/** First word of a display name — the live-cursor label stays compact. */
export function shortNameOf(name: string): string {
  const first = name.trim().split(/\s+/).filter(Boolean)[0];
  return first || 'Someone';
}
