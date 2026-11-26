import React, { useState } from 'react';
import { SharingModal, type SharingPreview as SharingPreviewData } from '../../../components/sharing/SharingModal';
import type { InviteSuggestion, SharingState } from '../../../lib/supabase/sharing';
import { CollaborateModal } from '../../../components/collaboration/CollaborateModal';
import Button from '../../../components/Button';
import type { FixtureContext, SurfaceRender } from '../types';
import { meta } from '../surfaces/collaboration';

/** Preview-only chrome for the fixtures that need a state switch — rendered
 *  behind the real modal, reachable once it is closed. */
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

/** Dummy collaboration data for the studio: the REAL SharingModal renders
 *  the live panel with a representative owner/editor/viewer + invite + link.
 *  Actions are disabled inside the modal's preview mode; the invite/link
 *  segment still switches the two access states locally. */
const PREVIEW_SHARE: SharingState = {
  ownerId: 'studio-owner',
  allowInvites: true,
  myUserId: 'studio-owner',
  myRole: 'owner',
  members: [
    { userId: 'studio-owner', name: 'Ava Sterling', avatarUrl: null, role: 'owner' },
    { userId: 'studio-editor', name: 'Marcus Reed', avatarUrl: null, role: 'editor' },
    { userId: 'studio-viewer', name: 'Nina Park', avatarUrl: null, role: 'viewer' },
  ],
  pendingInvites: [
    { id: 'studio-invite', email: 'sam@example.com', role: 'editor', createdAt: new Date().toISOString() },
  ],
  links: [
    { id: 'studio-link', createdAt: new Date().toISOString(), expiresAt: null, token: 'studio-preview-token' },
  ],
};

const PREVIEW_SUGGESTIONS: InviteSuggestion[] = [
  { userId: 'studio-sugg-1', name: 'Jordan Blake', avatarUrl: null, email: 'jordan@example.com', source: 'team' },
  { userId: 'studio-sugg-2', name: 'Priya Shah', avatarUrl: null, email: 'priya@example.com', source: 'collaborator' },
];

const SharingPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const preview: SharingPreviewData = {
    title: ctx.project?.title || 'Untitled Project',
    state: PREVIEW_SHARE,
    suggestions: PREVIEW_SUGGESTIONS,
    mode: 'link',
    linkHref: `${window.location.origin}/#/share/studio-preview-token`,
  };
  return <SharingModal open onClose={ctx.close} preview={preview} />;
};

/** The collaborate modal is presentation-only here: the fixture simulates the
 *  copy (busy → done) instead of creating a real shared project. */
const CollaboratePreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const projectTitle = ctx.project?.title || 'Untitled Project';

  const close = () => {
    setBusy(false);
    setOpen(false);
  };

  return (
    <>
      {open && (
        <CollaborateModal
          open
          projectTitle={projectTitle}
          busy={busy}
          onCancel={close}
          onCollaborate={() => {
            setBusy(true);
            window.setTimeout(() => {
              setBusy(false);
              setOpen(false);
            }, 900);
          }}
        />
      )}
      {!open && (
        <PreviewPanel>
          <PreviewTitle>Collaborate on this project</PreviewTitle>
          <PreviewHint>
            “{projectTitle}” would be copied to your shared projects, then the sharing panel opens.
          </PreviewHint>
          <Button theme="dark" variant="primary" size="minimal" onClick={() => setOpen(true)}>
            Show modal again
          </Button>
        </PreviewPanel>
      )}
    </>
  );
};

type Id = (typeof meta)[number]['id'];

export const render: Record<Id, SurfaceRender> = {
  sharing: (ctx) => <SharingPreview ctx={ctx} />,
  collaborate: (ctx) => <CollaboratePreview ctx={ctx} />,
};
