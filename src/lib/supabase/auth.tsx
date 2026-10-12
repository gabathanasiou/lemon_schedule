import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './client';

/** The signed-in Supabase account, shaped for UI (never the raw session). */
export interface SupabaseAccount {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export interface SupabaseAuthValue {
  /** The S1 feature flag — false when the deploy has no Supabase env. */
  isConfigured: boolean;
  isReady: boolean;
  account: SupabaseAccount | null;
  /** Start the Google OAuth redirect (full-page; the app comes back here). */
  signInWithGoogle: () => void;
  /** Email a magic link. Returns a human-readable error, or null on success. */
  sendMagicLink: (email: string) => Promise<string | null>;
  /** End the Supabase session (does not touch Google Drive). */
  signOut: () => Promise<void>;
}

const EMPTY: SupabaseAuthValue = {
  isConfigured: false,
  isReady: true,
  account: null,
  signInWithGoogle: () => {},
  sendMagicLink: async () => 'Not configured',
  signOut: async () => {},
};

const SupabaseAuthContext = createContext<SupabaseAuthValue>(EMPTY);

export function useSupabaseAuth(): SupabaseAuthValue {
  return useContext(SupabaseAuthContext);
}

function accountFromUser(user: User): SupabaseAccount {
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email ?? null,
    name: (meta.full_name as string) || (meta.name as string) || null,
    avatarUrl: (meta.avatar_url as string) || (meta.picture as string) || null,
  };
}

/** Where the OAuth / magic-link callback should return. Matches the app's
 *  deploy base (`/lemon_schedule/` on Pages, `/` in dev) — both must be on
 *  the Supabase redirect allow-list (docs/COLLABORATION.md §6 runbook step 4). */
function appRedirectUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${window.location.origin}${base}`;
}

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    let disposed = false;
    supabase.auth.getSession().then(({ data }) => {
      if (disposed) return;
      setSession(data.session);
      setIsReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (disposed) return;
      setSession(next);
      setIsReady(true);
    });
    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(() => {
    void supabase?.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: appRedirectUrl() },
    });
  }, []);

  const sendMagicLink = useCallback(async (email: string): Promise<string | null> => {
    if (!supabase) return 'Sign-in is not configured on this build.';
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: appRedirectUrl() },
    });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const value = useMemo<SupabaseAuthValue>(() => ({
    isConfigured: isSupabaseConfigured,
    isReady,
    account: session?.user ? accountFromUser(session.user) : null,
    signInWithGoogle,
    sendMagicLink,
    signOut,
  }), [isReady, session, signInWithGoogle, sendMagicLink, signOut]);

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
}
