import React from 'react';
import { createAvatar } from '@dicebear/core';
import * as initials from '@dicebear/initials';
import type { SupabaseAccount } from '../lib/supabase/auth';
import { avatarColor } from '../lib/avatarIdentity';

/**
 * The signed-in account's avatar: the provider photo when there is one, else a
 * generated one — DiceBear `initials` letters (Arial, user pick 2026-10-15,
 * roadmap 231) on the person's deterministic identity colour (`avatarColor` of
 * the account id — the SAME colour as their presence pointer and name labels),
 * so one identity reads the same across pointers, bubbles, the People list and
 * the profile modal.
 */
function colorSeedOf(account: SupabaseAccount | null): string {
  return account?.id || account?.name || account?.email || '?';
}

/** DiceBear initials SVG as a data URI — letters from the display name, the
 *  circle forced to the identity colour, white letters (DiceBear default). */
function generatedAvatarUri(label: string, colorSeed: string): string {
  return createAvatar(initials, {
    seed: label,
    backgroundColor: [avatarColor(colorSeed)],
    size: 64,
  }).toDataUri();
}

export function AccountAvatar({ account, className = 'w-7 h-7' }: { account: SupabaseAccount | null; className?: string }) {
  const label = account?.name || account?.email || account?.id || '?';
  return (
    <span className={`flex items-center justify-center rounded-full overflow-hidden shrink-0 ${className}`}>
      {account?.avatarUrl ? (
        <img src={account.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <img src={generatedAvatarUri(label, colorSeedOf(account))} alt="" draggable={false} className="w-full h-full object-cover" />
      )}
    </span>
  );
}
