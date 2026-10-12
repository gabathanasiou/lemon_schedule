import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, fetchAuthSettings, type AuthProviders } from './client';

/** The signed-in Supabase account, shaped for UI (never the raw session). */
export interface SupabaseAccount {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  /** A guest session created by an invite link (anonymous sign-in) — no
   *  credentials yet; "Create account" converts it in place (roadmap 229 S2). */
  isAnonymous: boolean;
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
  /** Silent guest session for invite links (no account form). Requires the
   *  project's anonymous sign-ins to be enabled; returns an error otherwise. */
  signInAnonymously: () => Promise<string | null>;
  /** Convert the current guest into a full account IN PLACE (same user id —
   *  memberships survive). Returns a human-readable error, or null. */
  upgradeAnonymousAccount: (email: string, password: string, name?: string) => Promise<SignUpResult>;
  /** Email + password. Returns a human-readable error, or null on success. */
  signInWithPassword: (email: string, password: string) => Promise<string | null>;
  signUpWithPassword: (email: string, password: string, name?: string) => Promise<SignUpResult>;
  /** Rename the signed-in account (auth metadata + the profiles row). */
  updateProfileName: (name: string) => Promise<string | null>;
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
  signInAnonymously: async () => 'Not configured',
  upgradeAnonymousAccount: async () => ({ error: 'Not configured', needsEmailConfirm: false }),
  signInWithPassword: async () => 'Not configured',
  signUpWithPassword: async () => ({ error: 'Not configured', needsEmailConfirm: false }),
  updateProfileName: async () => 'Not configured',
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
  const isAnonymous = user.is_anonymous === true;
  return {
    id: user.id,
    email: user.email ?? null,
    // Guests get a friendly name so avatars/menus read "Guest" not "?".
    name: (meta.full_name as string) || (meta.name as string) || (isAnonymous ? 'Guest' : null),
    avatarUrl: (meta.avatar_url as string) || (meta.picture as string) || null,
    isAnonymous,
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

  const signInAnonymously = useCallback(async (): Promise<string | null> => {
    if (!supabase) return 'Sign-in is not configured on this build.';
    const { error } = await supabase.auth.signInAnonymously();
    return error ? error.message : null;
  }, []);

  /** Convert the current guest to a full account without changing the user id
   *  (so the shared-project memberships they redeemed survive). With email
   *  confirmation off, GoTrue applies the email immediately; when the project
   *  requires confirmation it returns `new_email` and the caller asks the
   *  guest to confirm. */
  const upgradeAnonymousAccount = useCallback(async (email: string, password: string, name?: string): Promise<SignUpResult> => {
    if (!supabase) return { error: 'Sign-in is not configured on this build.', needsEmailConfirm: false };
    const fullName = name?.trim();
    const { data, error } = await supabase.auth.updateUser({
      email,
      password,
      data: fullName ? { full_name: fullName } : undefined,
    });
    if (error) {
      if (/already registered|already been registered|email.*in use/i.test(error.message)) {
        return { error: 'That email already has an account — sign out, then sign in to it.', needsEmailConfirm: false };
      }
      return { error: error.message, needsEmailConfirm: false };
    }
    const userId = data.user?.id;
    if (userId && fullName) {
      const { error: profileError } = await supabase.from('profiles').update({ display_name: fullName }).eq('id', userId);
      if (profileError) console.warn('profiles.display_name update failed:', profileError.message);
    }
    const needsEmailConfirm = !!(data.user as { new_email?: string } | null)?.new_email;
    return { error: null, needsEmailConfirm };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'Sign-in is not configured on this build.';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return null;
    if (/email not confirmed/i.test(error.message)) {
      return 'This email isn’t confirmed yet — open the confirmation link we emailed you.';
    }
    return error.message;
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string, name?: string): Promise<SignUpResult> => {
    if (!supabase) return { error: 'Sign-in is not configured on this build.', needsEmailConfirm: false };
    const fullName = name?.trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: appRedirectUrl(),
        // handle_new_user copies full_name into profiles.display_name.
        data: fullName ? { full_name: fullName } : undefined,
      },
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

  const updateProfileName = useCallback(async (name: string): Promise<string | null> => {
    if (!supabase) return 'Sign-in is not configured on this build.';
    const trimmed = name.trim();
    if (!trimmed) return 'Enter a name.';
    const { data, error } = await supabase.auth.updateUser({ data: { full_name: trimmed } });
    if (error) return error.message;
    // Keep the profiles row in step — it is what co-members will read once
    // presence/sharing lands (S3). Best-effort: the session metadata is the
    // UI source of truth.
    const userId = data.user?.id;
    if (userId) {
      const { error: profileError } = await supabase.from('profiles').update({ display_name: trimmed }).eq('id', userId);
      if (profileError) console.warn('profiles.display_name update failed:', profileError.message);
    }
    return null;
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
    signInAnonymously,
    upgradeAnonymousAccount,
    signInWithPassword,
    signUpWithPassword,
    updateProfileName,
    sendPasswordReset,
    signOut,
    pendingRecovery,
    completePasswordRecovery,
    dismissRecovery,
  }), [isReady, session, providers, refreshProviders, signInWithGoogle, signInWithApple, signInAnonymously, upgradeAnonymousAccount, signInWithPassword, signUpWithPassword, updateProfileName, sendPasswordReset, signOut, pendingRecovery, completePasswordRecovery, dismissRecovery]);

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
}
