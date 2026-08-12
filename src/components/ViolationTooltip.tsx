import React from 'react';
import { RuleViolation, CastMember } from '../types';
import { useProject } from '../store';
import { HoverTooltip } from './HoverTooltip';

function resolveCastName(castId: string, castMembers: CastMember[]): string {
  const cm = castMembers.find(c => c.id === castId);
  return cm ? `${cm.id}. ${cm.name}` : castId;
}

export const ViolationContent: React.FC<{
  violations: RuleViolation[];
  castMembers: CastMember[];
  compact?: boolean;
}> = ({ violations, castMembers, compact }) => {
  const byCast = new Map<string, RuleViolation[]>();
  const general: RuleViolation[] = [];

  for (const v of violations) {
    if (v.castId) {
      if (!byCast.has(v.castId)) byCast.set(v.castId, []);
      byCast.get(v.castId)!.push(v);
    } else {
      general.push(v);
    }
  }

  const groups = Array.from(byCast.entries());
  const hasGroups = groups.length > 0;
  const hasGeneral = general.length > 0;

  if (compact) {
    return (
      <>
        {groups.map(([castId, items]) => (
          <div key={castId} className={hasGroups && castId !== groups[0][0] ? 'mt-1.5' : ''}>
            <div className="font-bold text-[10px]">{resolveCastName(castId, castMembers)}</div>
            <div className="border-t border-zinc-700 my-0.5" />
            {items.map((v, i) => (
              <div key={i} className="text-[10px] ml-1">• {v.detail || v.message}</div>
            ))}
          </div>
        ))}
        {hasGeneral && (
          <div className={hasGroups ? 'mt-1.5' : ''}>
            {hasGroups && <div className="font-bold text-[10px] text-zinc-400">General</div>}
            {hasGroups && <div className="border-t border-zinc-700 my-0.5" />}
            {general.map((v, i) => (
              <div key={i} className={i > 0 ? 'mt-0.5 pt-0.5 border-t border-zinc-700' : ''}>
                <div className="text-[10px]">• {v.message}</div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map(([castId, items]) => (
        <div key={castId} className="border border-zinc-700 rounded-lg bg-zinc-800/60 overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-zinc-700/40">
            <span className="text-[11px] font-semibold text-zinc-200">{resolveCastName(castId, castMembers)}</span>
            <span className="text-[10px] text-zinc-500 ml-auto">{items.length} violation{items.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="px-3 py-2 space-y-1">
            {items.map((v, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-zinc-600 shrink-0 leading-relaxed">•</span>
                <span className="text-[11px] text-zinc-400 leading-relaxed">{v.detail || v.message}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {hasGeneral && (
        <div className="border border-zinc-700 rounded-lg bg-zinc-800/60 overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-zinc-700/40">
            <span className="text-[11px] font-semibold text-zinc-400">General</span>
            <span className="text-[10px] text-zinc-500 ml-auto">{general.length} violation{general.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="px-3 py-2 space-y-1">
            {general.map((v, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-zinc-600 shrink-0 leading-relaxed">•</span>
                <span className="text-[11px] text-zinc-400 leading-relaxed">{v.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const ViolationTooltip: React.FC<{
  violations: RuleViolation[];
  children: React.ReactNode;
}> = ({ violations, children }) => {
  const { state } = useProject();
  const castMembers = state.present.castMembers || [];
  return (
    <HoverTooltip content={<ViolationContent violations={violations} castMembers={castMembers} compact />}>
      {children}
    </HoverTooltip>
  );
};
