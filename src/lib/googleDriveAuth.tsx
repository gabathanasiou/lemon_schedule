import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { GoogleOAuthProvider, useGoogleLogin, googleLogout } from '@react-oauth/google';

const SESSION_KEY = 'lemon_google_signed_in';

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
}

const GoogleAuthContext = createContext<GoogleAuthContextValue>({
  isSignedIn: false,
  user: null,
  accessToken: null,
  signIn: () => {},
  signOut: () => {},
  isReady: false,
});

export function useGoogleAuth() {
  return useContext(GoogleAuthContext);
}

function GoogleAuthProviderInner({ children }: { children: React.ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const accessTokenRef = useRef<string | null>(null);
  const [tokenVersion, setTokenVersion] = useState(0);

  const fetchUserInfo = useCallback(async (token: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser({ name: data.name, email: data.email, picture: data.picture });
      }
    } catch {
      // userinfo is non-critical
    }
  }, []);

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive.appdata',
    onSuccess: async (tokenResponse) => {
      accessTokenRef.current = tokenResponse.access_token;
      setIsSignedIn(true);
      sessionStorage.setItem(SESSION_KEY, '1');
      await fetchUserInfo(tokenResponse.access_token);
      setTokenVersion(v => v + 1);
    },
    onError: (error) => {
      console.error('Google sign-in error:', error);
    },
  });

  const signIn = useCallback(() => {
    login();
  }, [login]);

  const signOut = useCallback(() => {
    accessTokenRef.current = null;
    setIsSignedIn(false);
    setUser(null);
    sessionStorage.removeItem(SESSION_KEY);
    googleLogout();
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      login();
    }
    setIsReady(true);
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
