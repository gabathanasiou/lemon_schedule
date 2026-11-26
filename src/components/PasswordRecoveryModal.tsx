import React from 'react';
import { useSupabaseAuth } from '../lib/supabase/auth';
import { PasswordRecoveryDialog, type PasswordRecoveryDialogState } from './PasswordRecoveryDialog';

/** App-level password-recovery provider (may land on a fresh tab, so it renders
 *  over the boot screen too). All auth state lives here; the dialog itself is
 *  the presentation (`PasswordRecoveryDialog`), shared with the Modals Studio. */
export function PasswordRecoveryModal() {
  const auth = useSupabaseAuth();
  const linkError = auth.recoveryLinkError;
  if (!auth.pendingRecovery && !linkError) return null;

  const state: PasswordRecoveryDialogState = linkError
    ? { kind: 'expired', message: linkError }
    : { kind: 'choose', email: auth.account?.email ?? null };

  return (
    <PasswordRecoveryDialog
      state={state}
      onSave={auth.completePasswordRecovery}
      onResend={auth.sendPasswordReset}
      onDismiss={linkError ? auth.dismissRecoveryLinkError : auth.dismissRecovery}
    />
  );
}
