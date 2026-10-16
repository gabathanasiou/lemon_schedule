import React, { useEffect, useMemo, useState } from 'react';
import { ProjectManager } from './ProjectManager';
import { APP_VERSION } from '../lib/appVersion';
import { usePhoneDevice } from '../lib/device';
import changelogRaw from '../../CHANGELOG.md?raw';
import { parseChangelog } from '../lib/changelog';
import WhatsNewModal from './WhatsNewModal';

/* The no-project-open screen: the ProjectManager modal floats on a flat zinc-950
   backdrop with a soft lightening ONLY at the bottom edge and the app lockup
   bottom-right (roadmap 261 — the version + newest update open What's New).
   The .pm-boot body class scopes the one-screen modal-dim exception
   (index.css — the item-59 dim is zeroed here so the backdrop reads crisp).
   The backdrop is FLOW, not `fixed inset-0` (roadmap 273/269): a fixed box is
   clipped to the inner viewport on iOS, which left white bands above and
   below — the phone gets the shell's `--app-h` treatment so the backdrop
   bleeds past the layout viewport like the app frame does. */
export function ProjectManagerBoot({ onOpenAccount }: { onOpenAccount?: () => void }) {
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const phoneDevice = usePhoneDevice();
  const latest = useMemo(() => parseChangelog(changelogRaw)[0], []);

  useEffect(() => {
    document.body.classList.add('pm-boot');
    return () => document.body.classList.remove('pm-boot');
  }, []);

  return (
    <div className={`pm-boot relative ${phoneDevice ? 'h-(--app-h)' : 'h-full'} overflow-hidden`}>
      <div
        aria-hidden
        className="absolute inset-0 bg-zinc-950"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-zinc-900/70 to-transparent"
      />
      <div className="relative h-full">
        <ProjectManager onOpenAccount={onOpenAccount} />
      </div>
      <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] flex items-baseline gap-2 select-none">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
          Lemon Schedule
        </span>
        <button
          onClick={() => setShowWhatsNew(true)}
          title="What's new"
          className="flex min-w-0 items-baseline gap-1.5 text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          <span className="shrink-0">v{APP_VERSION}</span>
          {latest?.title && (
            <>
              <span className="shrink-0 text-zinc-800">·</span>
              <span className="max-w-[46vw] truncate">{latest.title}</span>
            </>
          )}
        </button>
      </div>
      {showWhatsNew && <WhatsNewModal onClose={() => setShowWhatsNew(false)} />}
    </div>
  );
}

export default ProjectManagerBoot;
