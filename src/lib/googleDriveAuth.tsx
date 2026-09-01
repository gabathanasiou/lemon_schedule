import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { GoogleOAuthProvider, useGoogleLogin, googleLogout } from '@react-oauth/google';

const SESSION_KEY = 'lemon_google_signed_in';
const TOKEN_KEY = 'lemon_google_token';
// localStorage FLAG only — "this user has signed in before". Kept as a record
// (written on login, cleared on logout) but no longer drives anything:
// restoring a GIS session from it opened Google OAuth popups on fresh tabs for
// users who were NOT actually signed in, so auto-restore was removed — new tabs
// restore only from a real sessionStorage token, or the user signs in manually.
// The token itself NEVER touches localStorage (security rule: sessionStorage +
// useRef only); GIS holds the real session (cookies/its own storage).
const SIGNED_IN_FLAG = 'lemon_google_was_signed_in';

export interface GoogleUser {
  name: string;
  email: string;
  picture: string;
}

interface GoogleAuthContextValue {
  isSignedIn: boolean;
  user: GoogleUser | null;
  accessToken: string | null;
  signIn: () => void;
  signOut: () => void;
  isReady: boolean;
  refreshToken: () => void;
  needsReauth: boolean;
  tokenVersion: number;
}

const GoogleAuthContext = createContext<GoogleAuthContextValue>({
  isSignedIn: false,
  user: null,
  accessToken: null,
  signIn: () => {},
  signOut: () => {},
  isReady: false,
  refreshToken: () => {},
  needsReauth: false,
  tokenVersion: 0,
});

export function useGoogleAuth() {
  return useContext(GoogleAuthContext);
}

function GoogleAuthProviderInner({ children }: { children: React.ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [tokenVersion, setTokenVersion] = useState(0);
  const accessTokenRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards so automatic silent refreshes can never stack popups: one in-flight
  // at a time, and once a silent attempt fails non-fatally (popup blocked /
  // user cancelled / no session), every later auto attempt no-ops until a real
  // token is minted or the user signs in with a click.
  const silentInFlightRef = useRef(false);
  const silentStoppedRef = useRef(false);

  const fetchUserInfo = useCallback(async (token: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser({ name: data.name, email: data.email, picture: data.picture });
      } else if (res.status === 401) {
        setNeedsReauth(true);
      }
    } catch {
      // network error - keep token for retry
    }
  }, []);

  const doSilentRefresh = useCallback(() => {
    // Auto attempts must never open a Google OAuth popup: skip if a refresh is
    // already in flight, or if a previous silent attempt failed non-fatally
    // (no live session / popup blocked). Only an explicit signIn() (or a fresh
    // token) resets the stop flag.
    if (silentInFlightRef.current) return;
    if (silentStoppedRef.current) return;
    const gis = (window as any).google?.accounts?.oauth2;
    if (!gis) return;
    silentInFlightRef.current = true;
    const client = gis.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      callback: (response: any) => {
        silentInFlightRef.current = false;
        if (response.access_token) {
          silentStoppedRef.current = false;
          accessTokenRef.current = response.access_token;
          sessionStorage.setItem(TOKEN_KEY, response.access_token);
          setIsSignedIn(true);
          setNeedsReauth(false);
          setTokenVersion(v => v + 1);
          fetchUserInfo(response.access_token);
          scheduleTokenRefresh(response.access_token, response.expires_in);
        } else {
          setNeedsReauth(true);
        }
      },
      error_callback: (error: any) => {
        silentInFlightRef.current = false;
        console.warn('GIS token client error:', error?.type);
        // A non-fatal failure means the user has no live Google session (or the
        // browser blocked the fallback popup) — stop retrying automatically so
        // repeated 401s / timers can't open a popup storm. The user signs in
        // with a click when they need to.
        const fatalTypes = ['session_expired', 'access_denied', 'invalid_client', 'invalid_request', 'unauthorized_client', 'unsupported_grant_type'];
        if (error?.type && fatalTypes.includes(error.type)) {
          setNeedsReauth(true);
        } else {
          silentStoppedRef.current = true;
        }
      },
    });
    client.requestAccessToken({ prompt: '' });
  }, [fetchUserInfo]);

  const scheduleTokenRefresh = useCallback((token: string, expiresIn?: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const ttl = expiresIn ?? 3600;
    const delay = Math.max((ttl - 300) * 1000, 30_000);
    refreshTimerRef.current = setTimeout(() => {
      doSilentRefresh();
    }, delay);
  }, [doSilentRefresh]);

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive.appdata',
    onSuccess: async (tokenResponse) => {
      silentInFlightRef.current = false;
      silentStoppedRef.current = false;
      accessTokenRef.current = tokenResponse.access_token;
      setIsSignedIn(true);
      setNeedsReauth(false);
      setTokenVersion(v => v + 1);
      sessionStorage.setItem(SESSION_KEY, '1');
      sessionStorage.setItem(TOKEN_KEY, tokenResponse.access_token);
      localStorage.setItem(SIGNED_IN_FLAG, '1');
      await fetchUserInfo(tokenResponse.access_token);
      scheduleTokenRefresh(tokenResponse.access_token, tokenResponse.expires_in);
    },
    onError: (error) => {
      console.error('Google sign-in error:', error?.error_description ?? error);
    },
  });

  const signIn = useCallback(() => {
    // Explicit user gesture: always allow the popup, even if a previous
    // automatic silent refresh failed and stopped the auto attempts.
    silentStoppedRef.current = false;
    login();
  }, [login]);

  const signOut = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    silentInFlightRef.current = false;
    silentStoppedRef.current = false;
    accessTokenRef.current = null;
    setIsSignedIn(false);
    setUser(null);
    setNeedsReauth(false);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SIGNED_IN_FLAG);
    googleLogout();
  }, []);

  useEffect(() => {
    const savedToken = sessionStorage.getItem(TOKEN_KEY);
    if (savedToken) {
      accessTokenRef.current = savedToken;
      setIsSignedIn(true);
      fetchUserInfo(savedToken);
      scheduleTokenRefresh(savedToken);
    }
    // No auto-restore from the localStorage flag: attempting a GIS silent
    // refresh for a session that isn't actually there opens Google OAuth
    // popups on every fresh tab for users who are NOT signed in. New tabs
    // restore only from a real sessionStorage token above; otherwise the user
    // signs in manually with a click (File menu / PM footer / banner).
    setIsReady(true);
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GoogleAuthContext.Provider
      value={{
        isSignedIn,
        user,
        accessToken: accessTokenRef.current,
        tokenVersion,
        needsReauth,
        signIn,
        signOut,
        isReady,
        refreshToken: doSilentRefresh,
      }}
    >
      {children}
    </GoogleAuthContext.Provider>
  );
}

export function GoogleAuthProvider({
  children,
  clientId,
}: {
  children: React.ReactNode;
  clientId: string;
}) {
  if (!clientId || clientId === 'YOUR_CLIENT_ID') {
    return (
      <GoogleAuthContext.Provider
        value={{
          isSignedIn: false,
          user: null,
          accessToken: null,
          signIn: () => {},
          signOut: () => {},
          isReady: true,
          refreshToken: () => {},
          needsReauth: false,
          tokenVersion: 0,
        }}
      >
        {children}
      </GoogleAuthContext.Provider>
    );
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <GoogleAuthProviderInner>{children}</GoogleAuthProviderInner>
    </GoogleOAuthProvider>
  );
}
