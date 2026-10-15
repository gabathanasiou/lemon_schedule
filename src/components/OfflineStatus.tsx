import React from 'react';
import { Loader2, CloudOff, WifiOff } from 'lucide-react';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';

interface OfflineStatusProps {
  readOnly: boolean;
  isCloudProject: boolean;
  /** Shared (Supabase) project: a missing Supabase session also forces the
   *  read-only lock — that is an AUTH issue, not connectivity (229 live pass:
   *  a revoked session used to show "No Internet Connection"). */
  isOnlineProject: boolean;
  isSignedIn: boolean;
  needsReauth: boolean;
  /** Signed in to the collab account (Supabase). */
  isSupabaseSignedIn: boolean;
  onSignIn: () => void;
  /** Opens the Supabase account modal (the session-ended case). */
  onSupabaseSignIn: () => void;
  onRetry: () => void;
  retryingConnection: boolean;
  showModal: boolean;
  setShowModal: (v: boolean) => void;
  showRestoredBanner: boolean;
}

export default function OfflineStatus({
  readOnly, isCloudProject, isOnlineProject, isSignedIn, needsReauth, isSupabaseSignedIn,
  onSignIn, onSupabaseSignIn, onRetry, retryingConnection, showModal, setShowModal, showRestoredBanner,
}: OfflineStatusProps) {
  const supabaseAuthIssue = isOnlineProject && !isSupabaseSignedIn;
  const driveAuthIssue = isCloudProject && (!isSignedIn || needsReauth);
  const isAuthIssue = supabaseAuthIssue || driveAuthIssue;
  const authCopy = supabaseAuthIssue
    ? 'Signed out - sign in to resume live collaboration'
    : needsReauth
      ? 'Session expired - sign in to resume editing'
      : 'Signed out of Google Drive - editing is disabled';
  const authAction = supabaseAuthIssue ? onSupabaseSignIn : onSignIn;
  const authModalBody = supabaseAuthIssue
    ? 'This shared project needs a signed-in account to stay in sync with the rest of the team. Sign in again to resume live collaboration.'
    : 'You have been signed out of Google Drive. Sign in again to resume editing your cloud project.';

  return (
    <>
      {showRestoredBanner && (
        <div className="bg-green-600 text-white px-4 py-1.5 flex items-center justify-center text-xs shrink-0 print:hidden">
          <span className="font-medium">Connection restored</span>
        </div>
      )}
      {readOnly && (
        <div className={`${isAuthIssue ? 'bg-amber-600' : 'bg-red-600'} text-white px-4 py-1.5 flex items-center justify-between text-xs shrink-0 print:hidden`}>
          <span className="font-medium">
            {isAuthIssue ? authCopy : 'No Internet Connection - editing is disabled'}
          </span>
          {isAuthIssue ? (
            <button
              onClick={authAction}
              className="ml-3 px-2.5 py-1 rounded bg-amber-700 hover:bg-amber-500 transition-colors font-semibold"
            >
              Sign in
            </button>
          ) : (
            <button
              onClick={onRetry}
              disabled={retryingConnection}
              className="ml-3 px-2.5 py-1 rounded bg-red-700 hover:bg-red-500 transition-colors font-semibold disabled:opacity-60 flex items-center gap-1.5"
            >
              {retryingConnection && <Loader2 className="w-3 h-3 animate-spin" />}
              {retryingConnection ? 'Reconnecting...' : 'Retry Connection'}
            </button>
          )}
        </div>
      )}
      {!readOnly && isAuthIssue && (
        <div className="bg-amber-600 text-white px-4 py-1.5 flex items-center justify-between text-xs shrink-0 print:hidden">
          <span className="font-medium">{authCopy}</span>
          <button
            onClick={authAction}
            className="ml-3 px-2.5 py-1 rounded bg-amber-700 hover:bg-amber-500 transition-colors font-semibold"
          >
            Sign in
          </button>
        </div>
      )}
      {showModal && (
        <Modal open={showModal} onClose={() => setShowModal(false)}
            title={isAuthIssue ? 'Signed out' : "You're offline"}
            icon={isAuthIssue ? <CloudOff className="w-5 h-5 text-amber-400" /> : <WifiOff className="w-5 h-5 text-zinc-400" />}
            width="max-w-md"
            footer={
              <ModalFooter>
                <ModalFooterButton
                  variant="ghost"
                  onClick={() => setShowModal(false)}
                >
                  OK
                </ModalFooterButton>
                <ModalFooterButton
                  onClick={() => {
                    if (isAuthIssue) {
                      setShowModal(false);
                      authAction();
                    } else {
                      onRetry();
                    }
                  }}
                  disabled={!isAuthIssue && retryingConnection}
                >
                  {!isAuthIssue && retryingConnection && <Loader2 className="w-3 h-3 animate-spin" />}
                  {isAuthIssue ? 'Sign in' : retryingConnection ? 'Reconnecting...' : 'Retry Connection'}
                </ModalFooterButton>
              </ModalFooter>
            }
          >
            <div className="px-5 py-3 text-zinc-400 text-xs border-b border-zinc-800">
              {isAuthIssue
                ? authModalBody
                : 'This cloud project needs an internet connection to stay in sync. You can keep browsing, but editing is paused until your connection returns.'}
            </div>
          </Modal>
      )}
    </>
  );
}
