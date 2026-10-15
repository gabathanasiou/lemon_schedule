import type { ProjectMeta } from '../../store/storage';

/**
 * What the Project Manager's Shared tab displays (roadmap 249) — the SERVER's
 * answer (`listOnlineProjects`, in `onlineProjects.ts`) and NOTHING else.
 * `null` = "we don't know", and the manager then presents no list and no
 * count as truth:
 *
 * - signed out — there is no shared list to show;
 * - the last fetch failed — a stale answer must not stand in for server truth
 *   (the "Shared count sticks at 2" report).
 *
 * The session metas in `projectList` are deliberately NOT merged in. They
 * remain the lookup fallback in the provider (open/rename/delete), but as a
 * DISPLAY source they were wrong on both sides:
 *
 * - they resurrected projects the server had dropped (external revoke, owner
 *   delete) — membership is the server's answer;
 * - they pinned a stale title — a peer's rename never reached the other
 *   window's manager even after Refresh, because the meta was written when
 *   the project was opened and always overrode the fresher row.
 *
 * They can never be LEGITIMATE members either: online entries are filtered
 * out of the persisted index (`saveProjectListToStorage`), so a session meta
 * only ever exists for a project the server already has — the rename path
 * (roadmap 253) pushes the row and refetches, and both renames and saves land
 * on the row before the list is read again.
 */
export function onlineProjectListForDisplay(input: {
  signedIn: boolean;
  serverMetas: ProjectMeta[];
  fetchFailed: boolean;
}): ProjectMeta[] | null {
  if (!input.signedIn) return null;
  if (input.fetchFailed) return null;
  return [...input.serverMetas];
}
