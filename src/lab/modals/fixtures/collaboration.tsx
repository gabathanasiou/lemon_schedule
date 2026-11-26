import React, { useState } from 'react';
import { SharingModal } from '../../../components/sharing/SharingModal';
import { CollaborateModal } from '../../../components/collaboration/CollaborateModal';
import { useProject } from '../../../store';
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

/** SharingModal is driven by the OPEN shared project — on a local project it
 *  renders nothing (the real behaviour), so the studio explains why. */
const SharingPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const { currentProjectId, projectList } = useProject();
  const onlineId = projectList.find(p => p.id === currentProjectId)?.onlineId ?? null;
  return (
    <>
      <SharingModal open onClose={ctx.close} />
      {!onlineId && (
        <PreviewPanel>
          <PreviewTitle>This project isn't shared yet</PreviewTitle>
          <PreviewHint>
            The real SharingModal renders nothing until the open project is a shared (online)
            project. Open one from the studio's project picker, or run Collaborate first.
          </PreviewHint>
        </PreviewPanel>
      )}
    </>
  );
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
