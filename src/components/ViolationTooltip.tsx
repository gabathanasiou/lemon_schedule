import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RuleViolation, CastMember } from '../types';
import { useProject } from '../store';

function resolveCastName(castId: string, castMembers: CastMember[]): string {
  const cm = castMembers.find(c => c.id === castId);
  return cm ? `${cm.id}. ${cm.name}` : castId;
}

export const ViolationContent: React.FC<{
  violations: RuleViolation[];
  castMembers: CastMember[];
}> = ({ violations, castMembers }) => {
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

  return (
    <>
      {groups.map(([castId, items]) => (
        <div key={castId} className={hasGroups && castId !== groups[0][0] ? 'mt-1.5' : ''}>
          <div className="font-bold text-[10px]">{resolveCastName(castId, castMembers)}</div>
          <div className="border-t border-zinc-700 my-0.5" />
          {items.map((v, i) => (
            <div key={i} className="text-[10px] ml-1">{v.detail || v.message}</div>
          ))}
        </div>
      ))}
      {hasGeneral && (
        <div className={hasGroups ? 'mt-1.5' : ''}>
          {hasGroups && <div className="font-bold text-[10px] text-zinc-400">General</div>}
          {hasGroups && <div className="border-t border-zinc-700 my-0.5" />}
          {general.map((v, i) => (
            <div key={i} className={i > 0 ? 'mt-0.5 pt-0.5 border-t border-zinc-700' : ''}>
              <div className="text-[10px]">{v.message}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export const ViolationTooltip: React.FC<{
  violations: RuleViolation[];
  children: React.ReactNode;
}> = ({ violations, children }) => {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const { state } = useProject();
  const castMembers = state.present.castMembers || [];

  const updatePos = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
  };

  useEffect(() => {
    if (show) { updatePos(); window.addEventListener('scroll', updatePos, true); }
    return () => window.removeEventListener('scroll', updatePos, true);
  }, [show]);

  return (
    <div
      ref={ref}
      className="inline-flex"
      onMouseEnter={() => { updatePos(); setShow(true); }}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && createPortal(
        <div
          className="fixed px-2.5 py-1.5 bg-zinc-900 text-white text-[10px] rounded shadow-xl leading-relaxed max-w-xs"
          style={{ left: pos.x, top: pos.y - 8, transform: 'translate(-50%, -100%)', zIndex: 99999 }}
        >
          <ViolationContent violations={violations} castMembers={castMembers} />
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-900" />
        </div>,
        document.body
      )}
    </div>
  );
};
