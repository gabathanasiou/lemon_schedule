import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Seg } from '@gabriel/ui-kit';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import { AccountAvatar } from './AccountAvatar';
import { useSupabaseAuth } from '../lib/supabase/auth';
import { TeamPanel } from './sharing/TeamPanel';
import { SessionsPanel } from './SessionsPanel';

const INPUT_CLASS = 'w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 disabled:opacity-50 ui-input';

/**
 * Account settings (roadmap 255, 266) — **Profile** (display name + read-only
 * email; the S2 profile editor), **Team** (the 254 roster, extracted to
 * TeamPanel) and **Sessions** (the 266 sign-out scopes: other devices /
 * everywhere). ONE modal, hosted by the header user cluster AND the Project
 * Manager's account bar, so the account/team/sessions are manageable anywhere
 * — no project open needed. The footer follows the tab: Profile saves, Team
 * and Sessions commit live.
 */
export function AccountSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {  const auth = useSupabaseAuth();
  const [tab, setTab] = useState('profile');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the field each time it opens (never clobber active typing).
  useEffect(() => {
    if (open) {
      setTab('profile');
      setName(auth.account?.name || '');
      setBusy(false);
      setError(null);
    }
  }, [open, auth.account?.name]);

  const account = auth.account;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const err = await auth.updateProfileName(name);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      width="max-w-lg"
      footer={
        tab === 'profile' ? (
          <ModalFooter>
            <ModalFooterButton variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </ModalFooterButton>
            <ModalFooterButton data-modal-confirm onClick={save} disabled={busy || !name.trim()}>
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              Save
            </ModalFooterButton>
          </ModalFooter>
        ) : (
          <ModalFooter>
            <ModalFooterButton data-modal-confirm onClick={onClose}>Done</ModalFooterButton>
          </ModalFooter>
        )
      }
    >
      <div className="p-6 space-y-5">
        <Seg
          variant="track"
          theme="dark"
          stretch
          tablist
          ariaLabel="Settings"
          value={tab}
          options={[
            { v: 'profile', l: 'Profile' },
            { v: 'team', l: 'Team' },
            { v: 'sessions', l: 'Sessions' },
          ]}
          onChange={setTab}
        />
        {tab === 'profile' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <AccountAvatar account={account} className="w-10 h-10" />
              <div className="min-w-0">
                <div className="text-sm text-zinc-200 truncate">{account?.name || 'No name yet'}</div>
                <div className="text-xs text-zinc-500 truncate">{account?.email}</div>
              </div>
            </div>
            <input
              autoFocus
              type="text"
              autoComplete="name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && name.trim()) void save(); }}
              placeholder="Your name"
              disabled={busy}
              className={INPUT_CLASS}
            />
            <p className="text-[11px] text-zinc-500">This is the name collaborators see.</p>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        ) : tab === 'team' ? (
          <TeamPanel />
        ) : (
          <SessionsPanel onSignedOutEverywhere={onClose} />
        )}
      </div>
    </Modal>
  );
}
