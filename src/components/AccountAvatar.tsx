import React from 'react';
import type { SupabaseAccount } from '../lib/supabase/auth';

/** The signed-in account's avatar: the provider photo when there is one, else
 *  the first letter on emerald. ONE renderer for the header cluster, the
 *  profile modal and anything else that shows the account. */
export function AccountAvatar({ account, className = 'w-7 h-7' }: { account: SupabaseAccount | null; className?: string }) {
  return (
    <span className={`flex items-center justify-center rounded-full overflow-hidden shrink-0 ${className}`}>
      {account?.avatarUrl ? (
        <img src={account.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="w-full h-full flex items-center justify-center bg-emerald-700 text-[11px] font-bold text-white">
          {(account?.name || account?.email || '?')[0].toUpperCase()}
        </span>
      )}
    </span>
  );
}
