import React from 'react';
import type { SupabaseAccount } from '../lib/supabase/auth';
import { avatarColor, initialsOf } from '../lib/avatarIdentity';

/**
 * The signed-in account's avatar: the provider photo when there is one, else
 * a generated one — deterministic flat color per identity + name initials
 * (Google-style, roadmap 229 S2.5). Same account id → same color on every
 * client (the palette/initials live in `lib/avatarIdentity.ts`, shared with
 * the S3 presence pointers).
 */
function seedOf(account: SupabaseAccount | null): string {
  return account?.id || account?.name || account?.email || '?';
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
