import React, { useEffect } from 'react';
import { ProjectManager } from './ProjectManager';
import { APP_VERSION } from '../lib/appVersion';

/* The no-project-open screen: the ProjectManager modal floats on a flat zinc-950
   backdrop with a soft lightening ONLY at the bottom edge and the app lockup
   bottom-right. The .pm-boot body class scopes the one-screen modal-dim exception
   (index.css — the item-59 dim is zeroed here so the backdrop reads crisp). */
export function ProjectManagerBoot() {
  useEffect(() => {
    document.body.classList.add('pm-boot');
    return () => document.body.classList.remove('pm-boot');
  }, []);

  return (
    <div className="pm-boot relative h-screen w-screen overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 bg-zinc-950"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-zinc-900/70 to-transparent"
      />
      <div className="relative h-full">
        <ProjectManager />
      </div>
      <div
        className="pointer-events-none absolute bottom-4 right-5 flex items-baseline gap-2 select-none"
        aria-hidden
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
          Lemon Schedule
        </span>
        <span className="text-[10px] text-zinc-700">v{APP_VERSION}</span>
      </div>
    </div>
  );
}

export default ProjectManagerBoot;
