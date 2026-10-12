import React from 'react';
import type { SupabaseAccount } from '../lib/supabase/auth';

/**
 * The signed-in account's avatar: the provider photo when there is one, else
 * a generated one — deterministic flat color per identity + name initials
 * (Google-style, roadmap 229 S2.5). Same account id → same color on every
 * client, so guests ("Anonymous Otter") stay visually distinct in clusters,
 * the People list and (S3) presence bubbles.
 */
const AVATAR_COLORS = ['#0f766e', '#b45309', '#7e22ce', '#be123c', '#1d4ed8', '#15803d', '#c2410c', '#4338ca', '#a16207', '#0e7490'];

function seedOf(account: SupabaseAccount | null): string {
  return account?.id || account?.name || account?.email || '?';
}

function avatarColor(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** "Sam Fisher" → "SF"; "Anonymous Otter" → "AO"; single word → first letter. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AccountAvatar({ account, className = 'w-7 h-7' }: { account: SupabaseAccount | null; className?: string }) {
  const label = account?.name || account?.email || '?';
  return (
    <span className={`flex items-center justify-center rounded-full overflow-hidden shrink-0 ${className}`}>
      {account?.avatarUrl ? (
        <img src={account.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span
          className="w-full h-full flex items-center justify-center text-[11px] font-bold text-white"
          style={{ background: avatarColor(seedOf(account)) }}
        >
          {initialsOf(label)}
        </span>
      )}
    </span>
  );
}
