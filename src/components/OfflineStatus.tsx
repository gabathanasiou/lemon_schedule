import React from 'react';
import { Loader2, CloudOff, WifiOff } from 'lucide-react';
import Modal from './Modal';
import { ModalFooter } from './Modal';

interface OfflineStatusProps {
  readOnly: boolean;
  isCloudProject: boolean;
  isSignedIn: boolean;
  needsReauth: boolean;
  onSignIn: () => void;
  onRetry: () => void;
  retryingConnection: boolean;
  showModal: boolean;
  setShowModal: (v: boolean) => void;
  showRestoredBanner: boolean;
}

export default function OfflineStatus({
  readOnly, isCloudProject, isSignedIn, needsReauth, onSignIn, onRetry,
  retryingConnection, showModal, setShowModal, showRestoredBanner,
}: OfflineStatusProps) {
  return (
    <>
      {showRestoredBanner && (
        <div className="bg-green-600 text-white px-4 py-1.5 flex items-center justify-center text-xs shrink-0 print:hidden">
          <span className="font-medium">Connection restored</span>
        </div>
      )}
      {readOnly && (() => {
        const isAuthIssue = isCloudProject && (!isSignedIn || needsReauth);
        return (
          <div className={`${isAuthIssue ? 'bg-amber-600' : 'bg-red-600'} text-white px-4 py-1.5 flex items-center justify-between text-xs shrink-0 print:hidden`}>
            <span className="font-medium">
              {isAuthIssue
                ? (needsReauth ? 'Session expired - sign in to resume editing' : 'Signed out of Google Drive - editing is disabled')
                : 'No Internet Connection - editing is disabled'}
            </span>
            {isAuthIssue ? (
              <button
                onClick={onSignIn}
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
        );
      })()}
      {showModal && (() => {
        const isAuthIssue = isCloudProject && (!isSignedIn || needsReauth);
        return (
          <Modal open={showModal} onClose={() => setShowModal(false)}
            title={isAuthIssue ? 'Signed out' : "You're offline"}
            icon={isAuthIssue ? <CloudOff className="w-5 h-5 text-amber-400" /> : <WifiOff className="w-5 h-5 text-zinc-400" />}
            width="max-w-md"
            footer={
              <ModalFooter>
                <button
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                >
                  OK
                </button>
                <button
                  onClick={() => {
                    if (isAuthIssue) {
                      setShowModal(false);
                      onSignIn();
                    } else {
                      onRetry();
                    }
                  }}
                  disabled={!isAuthIssue && retryingConnection}
                  className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-60 flex items-center gap-1.5"
                >
                  {!isAuthIssue && retryingConnection && <Loader2 className="w-3 h-3 animate-spin" />}
                  {isAuthIssue ? 'Sign in' : retryingConnection ? 'Reconnecting...' : 'Retry Connection'}
                </button>
              </ModalFooter>
            }
          >
            <div className="px-5 py-3 text-zinc-400 text-xs border-b border-zinc-800">
              {isAuthIssue
                ? 'You have been signed out of Google Drive. Sign in again to resume editing your cloud project.'
                : 'This cloud project needs an internet connection to stay in sync. You can keep browsing, but editing is paused until your connection returns.'}
            </div>
          </Modal>
        );
      })()}
    </>
  );
}
