import React, { useState } from 'react';
import HelpModal from '../../../components/HelpModal';
import WhatsNewModal from '../../../components/WhatsNewModal';
import { AccountModal } from '../../../components/AccountModal';
import { AccountSettingsModal } from '../../../components/AccountSettingsModal';
import { PasswordRecoveryDialog, type PasswordRecoveryDialogState } from '../../../components/PasswordRecoveryDialog';
import AgentBridgeHelpModal from '../../../components/AgentBridgeHelpModal';
import NewProjectModal from '../../../components/NewProjectModal';
import { ProjectManager } from '../../../components/ProjectManager';
import { OfflineDetailsModal, type OfflineDetailsIssue } from '../../../components/OfflineDetailsModal';
import { RestoreFolderModal } from '../../../components/RestoreFolderModal';
import { ShareLinkOpeningModal } from '../../../components/ShareLinkOpeningModal';
import { useSupabaseAuth } from '../../../lib/supabase/auth';
import Button from '../../../components/Button';
import type { FixtureContext, SurfaceRender } from '../types';
import { meta } from '../surfaces/appChrome';

/** Preview-only chrome for the fixtures that need a state switch. It renders
 *  BEHIND the real modal (the kit overlay dims it); close the modal to reach
 *  the controls, exactly like the dialog ladder fixture. */

const PreviewPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen items-center justify-center p-6">
    <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] p-5 text-center">
      {children}
    </div>
  </div>
);

const PreviewTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-xs font-semibold text-[color:var(--ui-text-strong)]">{children}</div>
);

const PreviewHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] leading-relaxed text-[color:var(--ui-text-muted)]">{children}</p>
);

/** AccountModal needs a configured Supabase project; without one the real
 *  component returns null (signed-out is the true state, never mocked). */
const AccountPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const auth = useSupabaseAuth();
  return (
    <>
      <AccountModal open onClose={ctx.close} />
      {!auth.isConfigured && (
        <PreviewPanel>
          <PreviewTitle>Supabase auth is not configured</PreviewTitle>
          <PreviewHint>
            This build has no <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code>,
            so the real AccountModal renders nothing — the signed-out state is the real one. Add the
            env vars and reload to sign in.
          </PreviewHint>
        </PreviewPanel>
      )}
    </>
  );
};

/** The recovery dialog's two REAL states (valid link → choose a password;
 *  dead link → request a fresh one). Close it to switch states. */
const PasswordRecoveryPreview: React.FC = () => {
  const [open, setOpen] = useState(true);
  const [variant, setVariant] = useState<'choose' | 'expired'>('choose');
  const state: PasswordRecoveryDialogState = variant === 'choose'
    ? { kind: 'choose', email: 'sam@example.com' }
    : { kind: 'expired', message: 'That reset link has expired or has already been used.' };

  const show = (next: 'choose' | 'expired') => {
    setVariant(next);
    setOpen(true);
  };

  return (
    <>
      {open && (
        <PasswordRecoveryDialog
          state={state}
          onSave={async () => { setOpen(false); return null; }}
          onResend={async () => null}
          onDismiss={() => setOpen(false)}
        />
      )}
      {!open && (
        <PreviewPanel>
          <PreviewTitle>Password recovery</PreviewTitle>
          <PreviewHint>The real dialog, in each of its two states.</PreviewHint>
          <div className="flex flex-wrap justify-center gap-2">
            <Button theme="dark" variant="outline" size="minimal" onClick={() => show('choose')}>
              Valid link
            </Button>
            <Button theme="dark" variant="outline" size="minimal" onClick={() => show('expired')}>
              Expired link
            </Button>
          </div>
          <Button theme="dark" variant="primary" size="minimal" onClick={() => show(variant)}>
            Show dialog again
          </Button>
        </PreviewPanel>
      )}
    </>
  );
};

/** NewProjectModal is fully controlled — the preview owns the name and the
 *  creating flag. Cancel/Create both close the studio preview. */
const NewProjectPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const [name, setName] = useState('Untitled Project');
  const [creating, setCreating] = useState(false);
  return (
    <NewProjectModal
      open
      isCloud={false}
      name={name}
      onNameChange={setName}
      creating={creating}
      onCancel={ctx.close}
      onCreate={() => {
        setCreating(true);
        window.setTimeout(ctx.close, 700);
      }}
    />
  );
};

/** Offline vs signed-out are distinct real states with distinct copy/actions. */
const OfflinePreview: React.FC = () => {
  const [open, setOpen] = useState(true);
  const [issue, setIssue] = useState<OfflineDetailsIssue>('offline');
  const [retrying, setRetrying] = useState(false);

  const show = (next: OfflineDetailsIssue) => {
    setIssue(next);
    setRetrying(false);
    setOpen(true);
  };

  return (
    <>
      {open && (
        <OfflineDetailsModal
          open
          issue={issue}
          retrying={retrying}
          onClose={() => setOpen(false)}
          onAction={() => {
            if (issue !== 'offline') {
              setOpen(false);
              return;
            }
            setRetrying(true);
            window.setTimeout(() => setRetrying(false), 900);
          }}
        />
      )}
      {!open && (
        <PreviewPanel>
          <PreviewTitle>Offline / signed out</PreviewTitle>
          <PreviewHint>The same detail modal the status bar opens, in each real state.</PreviewHint>
          <div className="flex flex-wrap justify-center gap-2">
            <Button theme="dark" variant="outline" size="minimal" onClick={() => show('offline')}>
              Offline
            </Button>
            <Button theme="dark" variant="outline" size="minimal" onClick={() => show('signed-out-shared')}>
              Signed out (shared)
            </Button>
            <Button theme="dark" variant="outline" size="minimal" onClick={() => show('signed-out-drive')}>
              Signed out (Drive)
            </Button>
          </div>
        </PreviewPanel>
      )}
    </>
  );
};

/** The folder picker shows the real project list; Restore only closes here
 *  (importing lives in App, and the studio never writes project data). The
 *  preview panel switches the modal's two real states. */
const RestoreFolderPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const [open, setOpen] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [now] = useState(() => Date.now());
  const title = ctx.project?.title || 'Untitled Project';
  const entries = empty ? [] : [
    { id: `${ctx.project?.id ?? 'preview'}-latest`, title, lastModified: now - 18 * 60_000 },
    { id: 'preview-yesterday', title: `${title} (yesterday)`, lastModified: now - 26 * 60 * 60_000 },
    { id: 'preview-old-cut', title: `${title} — old cut`, lastModified: now - 6 * 24 * 60 * 60_000 },
  ];

  const show = (nextEmpty: boolean) => {
    setEmpty(nextEmpty);
    setOpen(true);
  };

  return (
    <>
      {open && (
        <RestoreFolderModal
          open
          entries={entries}
          restorableCount={entries.length}
          onClose={() => setOpen(false)}
          onRestore={() => setOpen(false)}
        />
      )}
      {!open && (
        <PreviewPanel>
          <PreviewTitle>Restore from folder</PreviewTitle>
          <PreviewHint>Restoring merges the folder's projects into your list.</PreviewHint>
          <div className="flex flex-wrap justify-center gap-2">
            <Button theme="dark" variant="outline" size="minimal" onClick={() => show(false)}>
              With backups
            </Button>
            <Button theme="dark" variant="outline" size="minimal" onClick={() => show(true)}>
              Empty folder
            </Button>
          </div>
        </PreviewPanel>
      )}
    </>
  );
};

type Id = (typeof meta)[number]['id'];

export const render: Record<Id, SurfaceRender> = {
  help: (ctx) => <HelpModal open onClose={ctx.close} />,
  'whats-new': (ctx) => (
    <React.Suspense fallback={null}>
      <WhatsNewModal onClose={ctx.close} />
    </React.Suspense>
  ),
  account: (ctx) => <AccountPreview ctx={ctx} />,
  'account-settings': (ctx) => <AccountSettingsModal open onClose={ctx.close} />,
  'password-recovery': () => <PasswordRecoveryPreview />,
  'agent-bridge-help': (ctx) => (
    <AgentBridgeHelpModal onClose={ctx.close} onConfirm={() => ctx.close()} />
  ),
  'new-project': (ctx) => <NewProjectPreview ctx={ctx} />,
  'project-manager': (ctx) => <ProjectManager onClose={ctx.close} onOpenAccount={() => {}} />,
  offline: () => <OfflinePreview />,
  'restore-folder': (ctx) => <RestoreFolderPreview ctx={ctx} />,
  'share-link': () => <ShareLinkOpeningModal redeeming />,
};
