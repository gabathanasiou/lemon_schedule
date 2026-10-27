import React, { useMemo, useState } from 'react';
import { EntityDropdown, type EntityItem } from '../EntityDropdown';
import { AccountAvatar } from '../AccountAvatar';
import { classifyInviteTarget, type InviteTarget } from '../../lib/inviteTargets';
import type { InviteSuggestion } from '../../lib/supabase/sharing';

/** Panel group order — Team first, then the collaborator orbit. */
const GROUP_ORDER: Record<string, number> = { Team: 0, 'People you collaborate with': 1 };

/**
 * The sharing panel's people picker (roadmap 254): the EntityDropdown
 * autocomplete — input + panel below, keyboard-first, the same feel as the
 * cast/element pickers — over the caller's invitable people. Rows carry the
 * account's avatar left, the name on top and the smaller email below; picks
 * and typed addresses are classified by `classifyInviteTarget` and handed to
 * the host, which performs the invite.
 *
 * The field re-mounts after every commit (`generation`): EntityDropdown keeps
 * the committed key in its internal `localIds` until the `value` prop changes,
 * and this field's value is always empty — without the re-mount the previous
 * pick's account id would flash in the input on the next focus.
 */
export function PeoplePicker({ suggestions, placeholder = 'Invite by name or email…', onCommit }: {
  suggestions: InviteSuggestion[];
  placeholder?: string;
  onCommit: (target: InviteTarget) => void;
}) {
  const [generation, setGeneration] = useState(0);
  const byId = useMemo(() => new Map(suggestions.map(s => [s.userId, s])), [suggestions]);
  const items = useMemo<EntityItem[]>(() => suggestions.map(s => ({
    id: s.userId,
    name: s.name || s.email || 'Member',
    group: s.source === 'team' ? 'Team' : 'People you collaborate with',
  })), [suggestions]);

  return (
    <EntityDropdown
      key={generation}
      value=""
      onChange={value => {
        const target = classifyInviteTarget(value, suggestions);
        setGeneration(g => g + 1);
        if (target) onCommit(target);
      }}
      items={items}
      mode="single"
      variant="chip"
      displayMode="id"
      placeholder={placeholder}
      className="text-xs flex-1 min-w-0"
      filterItem={(item, q) => {
        const s = byId.get(item.id);
        return `${s?.name ?? ''} ${s?.email ?? ''}`.toLowerCase().includes(q.toLowerCase());
      }}
      sortItems={list => [...list].sort((a, b) =>
        (GROUP_ORDER[a.group || ''] ?? 0) - (GROUP_ORDER[b.group || ''] ?? 0)
        || a.name.localeCompare(b.name))}
      renderItem={item => {
        const s = byId.get(item.id);
        return (
          <>
            <AccountAvatar
              account={{ id: item.id, name: s?.name ?? null, email: s?.email ?? null, avatarUrl: s?.avatarUrl ?? null, isAnonymous: false }}
              className="w-6 h-6"
            />
            <span className="flex-1 min-w-0 flex flex-col leading-tight">
              <span className="truncate">{s?.name || 'Member'}</span>
              {s?.email ? <span className="text-[10px] text-[color:var(--ui-text-faint)] truncate">{s.email}</span> : null}
            </span>
          </>
        );
      }}
    />
  );
}
