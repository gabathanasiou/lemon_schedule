import React from 'react';
import { useGoogleAuth } from '../lib/googleDriveAuth';
import { LogIn, LogOut, Loader2 } from 'lucide-react';

export function GoogleSignIn() {
  const { isSignedIn, user, signIn, signOut, isReady } = useGoogleAuth();

  if (!isReady) {
    return null;
  }

  if (isSignedIn && user) {
    return (
      <button
        onClick={signOut}
        className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer select-none"
        title={`Signed in as ${user.email}\nClick to disconnect`}
      >
        {user.picture ? (
          <img src={user.picture} alt="" className="w-4 h-4 rounded-full" />
        ) : (
          <div className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-[8px] font-bold">
            {(user.name || '?')[0]}
          </div>
        )}
        <span className="text-zinc-500 hover:text-zinc-300">
          <LogOut className="w-3.5 h-3.5" />
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={signIn}
      className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer select-none"
      title="Sign in with Google to sync projects to Drive"
    >
      <LogIn className="w-3.5 h-3.5" />
      <span>Sign in</span>
    </button>
  );
}
