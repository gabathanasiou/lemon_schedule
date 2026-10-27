import React, { useState } from 'react';
import { Check, ChevronDown, Mail, X } from 'lucide-react';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import { AccountAvatar } from '../AccountAvatar';
import { DD_CHIP_TRIGGER_CLASS } from '../../lib/dropdown';
import type { CollaboratorRole, PendingInvite, SharingMember } from '../../lib/supabase/sharing';

/**
 * Presentational pieces of the User & sharing panel (roadmap 229 S2) — the
 * Apple-language roles ("Owner", "Can make changes", "View only") and the
 * people rows. State and server calls live in SharingModal.
 */

/** The dark panel's input recipe — ONE class string for the sharing/team
 *  modals' text fields. */
export const PANEL_INPUT_CLASS = 'px-3 py-2 bg-[var(--ui-panel-bg)] border border-[color:var(--ui-card-border)] rounded-md text-xs text-[color:var(--ui-input-text)] placeholder:text-[color:var(--ui-text-faint)] outline-none focus:border-[color:var(--ui-input-focus-border)] disabled:opacity-50';

/** Section caption for the sharing/team panels. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider mb-1">{children}</div>;
}

export const ROLE_LABELS: Record<CollaboratorRole, string> = {
  owner: 'Owner',
  editor: 'Can make changes',
  viewer: 'View only',
};

/** Per-person permission menu (owner only; editors/viewers never see it).
 *  Removal lives on the row's X button — one affordance per action. */
export function RoleMenu({ role, disabled, onSelect }: {
  role: CollaboratorRole;
  disabled?: boolean;
  onSelect: (role: CollaboratorRole) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      align="right"
      width="w-48"
      theme="dark"
      trigger={
        <button
          type="button"
          disabled={disabled}
          aria-label={`Permission: ${ROLE_LABELS[role]}`}
          className={`${DD_CHIP_TRIGGER_CLASS} text-xs shrink-0`}
        >
          {ROLE_LABELS[role]}
          <ChevronDown className="w-3 h-3 text-[color:var(--ui-text-faint)]" />
        </button>
      }
    >
      <DropdownItem onClick={() => onSelect('editor')} trailing={role === 'editor' ? <Check className="w-3 h-3" /> : undefined}>
        Can make changes
      </DropdownItem>
      <DropdownItem onClick={() => onSelect('viewer')} trailing={role === 'viewer' ? <Check className="w-3 h-3" /> : undefined}>
        View only
      </DropdownItem>
    </DropdownMenu>
  );
}

export function MemberRow({ member, isSelf, canManage, disabled, onRoleChange, onRemove }: {
  member: SharingMember;
  isSelf: boolean;
  /** The caller is the owner (role changes + removal are owner-only). */
  canManage: boolean;
  disabled?: boolean;
  onRoleChange: (role: CollaboratorRole) => void;
  onRemove: () => void;
}) {
  const isOwnerRow = member.role === 'owner';
  // Anonymous link visitors have no profile name — label them "Guest".
  const displayName = member.name || 'Guest';
  return (
    <div className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-md hover:bg-[var(--ui-card-bg)] transition-colors">
      <AccountAvatar account={{ id: member.userId, name: displayName, email: null, avatarUrl: member.avatarUrl, isAnonymous: !member.name }} className="w-7 h-7" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[color:var(--ui-input-text)] truncate">
          {displayName}{isSelf ? ' (you)' : ''}
        </div>
        <div className="text-[10px] text-[color:var(--ui-text-faint)]">{ROLE_LABELS[member.role]}</div>
      </div>
      {!isOwnerRow && canManage && (
        <>
          <RoleMenu role={member.role} disabled={disabled} onSelect={onRoleChange} />
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            title="Remove access"
            aria-label="Remove access"
            className="p-1 rounded-md shrink-0 text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-danger-text)] hover:bg-[var(--ui-item-hover-bg)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

export function PendingRow({ invite, canManage, disabled, onCancel }: {
  invite: PendingInvite;
  canManage: boolean;
  disabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-md hover:bg-[var(--ui-card-bg)] transition-colors">
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--ui-input-bg)] border border-[color:var(--ui-card-border)] shrink-0">
        <Mail className="w-3.5 h-3.5 text-[color:var(--ui-text-muted)]" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[color:var(--ui-input-text)] truncate">{invite.email}</div>
        <div className="text-[10px] text-[color:var(--ui-text-faint)]">Invite pending — applies when they create an account</div>
      </div>
      <span className="text-[10px] text-[color:var(--ui-text-faint)] shrink-0">{ROLE_LABELS[invite.role]}</span>
      {canManage && (
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          title="Cancel invite"
          aria-label="Cancel invite"
          className="p-1 rounded-md shrink-0 text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-danger-text)] hover:bg-[var(--ui-item-hover-bg)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
