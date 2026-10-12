/**
 * Presence grid-scope registry (roadmap 229 S3) — the ONE seam between the
 * pointer tracker / overlay and canvas grids (the Glide Breakdown today;
 * Crew/Locations/Call Times can register the same way).
 *
 * A surface registers while it is mounted:
 * - `probe(x, y)`: sender side — a pointer position → the semantic cell under
 *   it (stable row/column KEYS, never pixels).
 * - `locate(target)`: receiver side — that cell → its on-screen rect on THIS
 *   client (own scroll, column widths, font scale), or null when it can't be
 *   shown (wrong tab, cell gone).
 *
 * The anchor type lives in `src/lib/supabase/presence.ts` (`kind: 'grid'`).
 */

export interface PresenceGridHit {
  rowKey: string;
  colKey: string;
  /** Fallbacks for a client whose row/column set differs (clamped on locate). */
  rowIndex: number;
  colIndex: number;
  /** Position inside the cell, 0..1 of its rect (glide, not teleport). */
  fx: number;
  fy: number;
}

export interface PresenceGridRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PresenceGridScope {
  probe: (clientX: number, clientY: number) => PresenceGridHit | null;
  locate: (target: { rowKey: string; colKey: string; rowIndex: number; colIndex: number }) => PresenceGridRect | null;
}

const scopes = new Map<string, PresenceGridScope>();

/** Register a grid scope while its surface is mounted; returns the unregister. */
export function registerPresenceGridScope(scope: string, impl: PresenceGridScope): () => void {
  scopes.set(scope, impl);
  return () => {
    if (scopes.get(scope) === impl) scopes.delete(scope);
  };
}

export function getPresenceGridScope(scope: string): PresenceGridScope | null {
  return scopes.get(scope) ?? null;
}
