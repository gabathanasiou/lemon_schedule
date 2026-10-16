import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, fetchAuthSettings, type AuthProviders } from './client';
import { parseRecoveryLinkError, stripRecoveryLinkParams } from './recoveryLink';

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
  /** Revoke every OTHER session of this account — this device stays signed in
   *  (the Sessions tab's "sign out other devices"). */
  signOutOtherDevices: () => Promise<void>;
  /** Revoke EVERY session, this device included — the explicit "sign out
   *  everywhere" (never the default; see the local-scope signOut). */
  signOutEverywhere: () => Promise<void>;
  /** Permanently delete the signed-in account (roadmap 281) — owned online
   *  projects die with it; the confirm dialog says so. Human-readable error
   *  or null. */
  deleteAccount: () => Promise<string | null>;
  /** True when a password-recovery link brought the user in — show the
   *  "set a new password" surface (App-level modal). */
  pendingRecovery: boolean;
  /** A dead reset link's message (roadmap 278) — the recovery modal shows it
   *  with a re-request form. Null when the link was fine or absent. */
  recoveryLinkError: string | null;
  dismissRecoveryLinkError: () => void;
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
  signOutOtherDevices: async () => {},
  signOutEverywhere: async () => {},
  deleteAccount: async () => 'Not configured',
  pendingRecovery: false,
  recoveryLinkError: null,
  dismissRecoveryLinkError: () => {},
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

/** Captured at import time (roadmap 278, audit F6): supabase-js consumes the
 *  auth-error URL params during its async init and throws internally where
 *  nobody listens — the redirect URL must be read before its microtasks can
 *  clear it. */
const INITIAL_URL = typeof window === 'undefined' ? '' : window.location.href;

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(!isSupabaseConfigured);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [pendingRecovery, setPendingRecovery] = useState(false);
  const [recoveryLinkError, setRecoveryLinkError] = useState<string | null>(null);

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

  // A dead reset link lands with GoTrue's error params in the URL (the valid
  // path fires PASSWORD_RECOVERY instead) — surface it once, then clean the
  // address bar so a reload doesn't re-show the modal (roadmap 278).
  useEffect(() => {
    const parsed = parseRecoveryLinkError(INITIAL_URL);
    if (!parsed) return;
    setRecoveryLinkError(parsed.message);
    const clean = stripRecoveryLinkParams(window.location.href);
    if (clean !== window.location.href) window.history.replaceState(null, '', clean);
  }, []);

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
  const dismissRecoveryLinkError = useCallback(() => setRecoveryLinkError(null), []);

  const signOut = useCallback(async () => {
    // LOCAL scope, deliberately: Supabase's signOut() defaults to 'global',
    // which revokes EVERY session of the account on EVERY device — signing out
    // on one device silently killed the others' sessions (they kept their
    // "signed in" UI with a dead token; the 229 live pass hit exactly that).
    await supabase?.auth.signOut({ scope: 'local' });
  }, []);

  const signOutOtherDevices = useCallback(async () => {
    // 'others' = every session EXCEPT this one; the caller's sign-in survives.
    await supabase?.auth.signOut({ scope: 'others' });
  }, []);

  const signOutEverywhere = useCallback(async () => {
    // 'global' incl. this device — explicit and deliberate (the Sessions tab's
    // destructive action behind a confirm); the default sign-out stays LOCAL.
    await supabase?.auth.signOut({ scope: 'global' });
  }, []);

  const deleteAccount = useCallback(async (): Promise<string | null> => {
    if (!supabase) return 'Sign-in is not configured on this build.';
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) {
      // FunctionsHttpError carries the function's JSON body on `context`.
      let message = 'Could not delete the account — try again.';
      try {
        const body = await (error as { context?: Response }).context?.json?.();
        if (body?.error) message = String(body.error);
      } catch {
        /* keep the fallback */
      }
      return message;
    }
    await supabase.auth.signOut({ scope: 'local' });
    return null;
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
    signOutOtherDevices,
    signOutEverywhere,
    deleteAccount,
    pendingRecovery,
    recoveryLinkError,
    dismissRecoveryLinkError,
    completePasswordRecovery,
    dismissRecovery,
  }), [isReady, session, providers, refreshProviders, signInWithGoogle, signInWithApple, signInAnonymously, upgradeAnonymousAccount, signInWithPassword, signUpWithPassword, updateProfileName, sendPasswordReset, signOut, signOutOtherDevices, signOutEverywhere, deleteAccount, pendingRecovery, recoveryLinkError, dismissRecoveryLinkError, completePasswordRecovery, dismissRecovery]);

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
}
