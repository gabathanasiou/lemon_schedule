import React, { useState } from 'react';
import Button from '../Button';
import { Link2 } from 'lucide-react';
import { CrewLinkManagerModal } from './CrewLinkManagerModal';

/** Crew Manager header action (roadmap 11): opens the Crew Links manager. */
export function CrewLinksButton({ readOnly }: { readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={readOnly} title="Link crew members to specific elements">
        <Link2 className="w-3 h-3" /> Links
      </Button>
      {open && <CrewLinkManagerModal onClose={() => setOpen(false)} />}
    </>
  );
}
