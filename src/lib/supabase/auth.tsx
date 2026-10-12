import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, fetchAuthSettings, type AuthProviders } from './client';

/** The signed-in Supabase account, shaped for UI (never the raw session). */
export interface SupabaseAccount {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

/** Sign-up result: `needsEmailConfirm` = the project requires email
 *  confirmation and no session came back (dashboard setting decides). */
export interface SignUpResult {
  error: string | null;
  needsEmailConfirm: boolean;
}

export interface SupabaseAuthValue {
  /** The S1 feature flag — false when the deploy has no Supabase env. */
  isConfigured: boolean;
  isReady: boolean;
  account: SupabaseAccount | null;
  /** Enabled sign-in methods (null = not fetched yet / fetch failed). */
  providers: AuthProviders | null;
  refreshProviders: () => void;
  /** Start the OAuth redirect (full-page; the app comes back here). */
  signInWithGoogle: () => void;
  signInWithApple: () => void;
  /** Email + password. Returns a human-readable error, or null on success. */
  signInWithPassword: (email: string, password: string) => Promise<string | null>;
  signUpWithPassword: (email: string, password: string) => Promise<SignUpResult>;
  /** Email a password-reset link. Returns a human-readable error, or null. */
  sendPasswordReset: (email: string) => Promise<string | null>;
  /** End the Supabase session (does not touch Google Drive). */
  signOut: () => Promise<void>;
  /** True when a password-recovery link brought the user in — show the
   *  "set a new password" surface (App-level modal). */
  pendingRecovery: boolean;
  completePasswordRecovery: (newPassword: string) => Promise<string | null>;
  dismissRecovery: () => void;
}

const EMPTY: SupabaseAuthValue = {
  isConfigured: false,
  isReady: true,
  account: null,
  providers: null,
  refreshProviders: () => {},
  signInWithGoogle: () => {},
  signInWithApple: () => {},
  signInWithPassword: async () => 'Not configured',
  signUpWithPassword: async () => ({ error: 'Not configured', needsEmailConfirm: false }),
  sendPasswordReset: async () => 'Not configured',
  signOut: async () => {},
  pendingRecovery: false,
  completePasswordRecovery: async () => 'Not configured',
  dismissRecovery: () => {},
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

/** Where OAuth / email links should return. Matches the app's deploy base
 *  (`/lemon_schedule/` on Pages, `/` in dev) — both must be on the Supabase
 *  redirect allow-list (docs/COLLABORATION.md §6 runbook step 4). */
function appRedirectUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${window.location.origin}${base}`;
}

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(!isSupabaseConfigured);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [pendingRecovery, setPendingRecovery] = useState(false);

  const refreshProviders = useCallback(() => {
    void fetchAuthSettings().then(settings => setProviders(settings));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    refreshProviders();
    let disposed = false;
    supabase.auth.getSession().then(({ data }) => {
      if (disposed) return;
      setSession(data.session);
      setIsReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (disposed) return;
      setSession(next);
      setIsReady(true);
      if (event === 'PASSWORD_RECOVERY') setPendingRecovery(true);
      if (event === 'SIGNED_OUT') setPendingRecovery(false);
    });
    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
    };
  }, [refreshProviders]);

  const signInWithOAuth = useCallback((provider: 'google' | 'apple') => {
    void supabase?.auth.signInWithOAuth({
      provider,
      options: { redirectTo: appRedirectUrl() },
    });
  }, []);

  const signInWithGoogle = useCallback(() => signInWithOAuth('google'), [signInWithOAuth]);
  const signInWithApple = useCallback(() => signInWithOAuth('apple'), [signInWithOAuth]);

  const signInWithPassword = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'Sign-in is not configured on this build.';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return null;
    if (/email not confirmed/i.test(error.message)) {
      return 'This email isn’t confirmed yet — open the confirmation link we emailed you.';
    }
    return error.message;
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    if (!supabase) return { error: 'Sign-in is not configured on this build.', needsEmailConfirm: false };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: appRedirectUrl() },
    });
    if (error) {
      if (/already registered/i.test(error.message)) {
        return { error: 'That email already has an account — sign in instead.', needsEmailConfirm: false };
      }
      return { error: error.message, needsEmailConfirm: false };
    }
    return { error: null, needsEmailConfirm: !data.session };
  }, []);

  const sendPasswordReset = useCallback(async (email: string): Promise<string | null> => {
    if (!supabase) return 'Sign-in is not configured on this build.';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: appRedirectUrl(),
    });
    return error ? error.message : null;
  }, []);

  const completePasswordRecovery = useCallback(async (newPassword: string): Promise<string | null> => {
    if (!supabase) return 'Sign-in is not configured on this build.';
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return error.message;
    setPendingRecovery(false);
    return null;
  }, []);

  const dismissRecovery = useCallback(() => setPendingRecovery(false), []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const value = useMemo<SupabaseAuthValue>(() => ({
    isConfigured: isSupabaseConfigured,
    isReady,
    account: session?.user ? accountFromUser(session.user) : null,
    providers,
    refreshProviders,
    signInWithGoogle,
    signInWithApple,
    signInWithPassword,
    signUpWithPassword,
    sendPasswordReset,
    signOut,
    pendingRecovery,
    completePasswordRecovery,
    dismissRecovery,
  }), [isReady, session, providers, refreshProviders, signInWithGoogle, signInWithApple, signInWithPassword, signUpWithPassword, sendPasswordReset, signOut, pendingRecovery, completePasswordRecovery, dismissRecovery]);

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
}
