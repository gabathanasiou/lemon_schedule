/**
 * Local-overlay cue dots (roadmap 240) — the animated "this peer is inside a
 * menu/modal you cannot see" badge. User decision: animated DOTS, never a
 * spinner (which reads as a network wait) and never a halo. Rendered on the
 * presence pointer tag and the header collaborator bubble; `text-current`
 * lets each host pick the dot colour.
 */
export function PresenceDots({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[2px] ${className ?? ''}`} aria-hidden>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-[3px] h-[3px] rounded-full bg-current animate-pulse motion-reduce:animate-none"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}
