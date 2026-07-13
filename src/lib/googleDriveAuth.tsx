import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { GoogleOAuthProvider, useGoogleLogin, googleLogout } from '@react-oauth/google';

const SESSION_KEY = 'lemon_google_signed_in';
const TOKEN_KEY = 'lemon_google_token';

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
}

const GoogleAuthContext = createContext<GoogleAuthContextValue>({
  isSignedIn: false,
  user: null,
  accessToken: null,
  signIn: () => {},
  signOut: () => {},
  isReady: false,
  refreshToken: () => {},
});

export function useGoogleAuth() {
  return useContext(GoogleAuthContext);
}

function GoogleAuthProviderInner({ children }: { children: React.ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const accessTokenRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleTokenRefresh = useCallback((token: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    // Refresh 5 minutes before expiry (tokens live ~1 hour)
    refreshTimerRef.current = setTimeout(() => {
      doSilentRefresh();
    }, 55 * 60 * 1000);
  }, []);

  const doSilentRefresh = useCallback(() => {
    const gis = (window as any).google?.accounts?.oauth2;
    if (!gis) return;
    const client = gis.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      callback: (response: any) => {
        if (response.access_token) {
          accessTokenRef.current = response.access_token;
          sessionStorage.setItem(TOKEN_KEY, response.access_token);
          scheduleTokenRefresh(response.access_token);
        } else {
          accessTokenRef.current = null;
          setIsSignedIn(false);
          setUser(null);
          sessionStorage.removeItem(TOKEN_KEY);
          sessionStorage.removeItem(SESSION_KEY);
        }
      },
    });
    client.requestAccessToken({ prompt: '' });
  }, [scheduleTokenRefresh]);

  const fetchUserInfo = useCallback(async (token: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser({ name: data.name, email: data.email, picture: data.picture });
      } else if (res.status === 401) {
        accessTokenRef.current = null;
        setIsSignedIn(false);
        setUser(null);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // network error — keep token for retry
    }
  }, []);

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive.appdata',
    onSuccess: async (tokenResponse) => {
      accessTokenRef.current = tokenResponse.access_token;
      setIsSignedIn(true);
      sessionStorage.setItem(SESSION_KEY, '1');
      sessionStorage.setItem(TOKEN_KEY, tokenResponse.access_token);
      await fetchUserInfo(tokenResponse.access_token);
      scheduleTokenRefresh(tokenResponse.access_token);
    },
    onError: (error) => {
      console.error('Google sign-in error:', error?.error_description ?? error);
    },
  });

  const signIn = useCallback(() => {
    login();
  }, [login]);

  const signOut = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    accessTokenRef.current = null;
    setIsSignedIn(false);
    setUser(null);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
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
