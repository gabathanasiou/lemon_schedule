import type { Project } from '../../types';
import type { ProjectMeta } from '../../store/storage';
import { pruneReportTrash } from '../../store/storage';
import { supabase } from './client';
import { fetchAllPages } from './pagination';
import { serializeProject, deserializeProject } from '../projectCodec';
import { migrateElementBoardIds } from '../legacyMigration';

/**
 * Online project rows (roadmap 229 S1). ONE module for every Supabase
 * projects-table operation — `data` is the opaque `projectCodec` blob and
 * the server never parses it. RLS scopes every query to memberships: a
 * non-member sees nothing, and a viewer's writes are rejected server-side
 * (docs/COLLABORATION.md §8).
 */

export interface OnlineReadResult {
  project: Project;
  revision: number;
}

interface ProjectRow {
  id: string;
  title: string;
  data: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

/** The signed-in user's projects (RLS: owned or member of). Paged explicitly
 *  (roadmap 283): PostgREST caps one response at 1000 rows — the Shared list
 *  must survive beyond that. `updated_at` ordering has an index; `id` is the
 *  stable tiebreaker so page boundaries can't repeat or skip rows. */
export async function listOnlineProjects(): Promise<ProjectMeta[]> {
  const client = supabase;
  if (!client) return [];
  const rows = await fetchAllPages(async (from, to) => {
    const { data, error } = await client
      .from('projects')
      .select('id, title, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    return (data ?? []) as Pick<ProjectRow, 'id' | 'title' | 'created_at' | 'updated_at'>[];
  });
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    createdAt: Date.parse(row.created_at),
    lastModified: Date.parse(row.updated_at),
    onlineId: row.id,
  }));
}

/** First copy of a project to the online workspace (the Collaborate action).
 *  Row id = project id, so meta.id, the document id and (S4) the room id are
 *  one identity. `owner_id` must be the signed-in user — the insert RLS
 *  (`with check (owner_id = auth.uid())`) rejects anything else, and the
 *  `handle_new_project` trigger creates the owner membership row. */
export async function uploadProjectOnline(project: Project): Promise<void> {
  if (!supabase) throw new Error('Sign-in is not configured on this build.');
  const { data: sessionData } = await supabase.auth.getSession();
  const ownerId = sessionData.session?.user.id;
  if (!ownerId) throw new Error('Sign in to add a project to your shared projects.');
  const { error } = await supabase.from('projects').insert({
    id: project.id,
    owner_id: ownerId,
    title: project.title,
    data: serializeProject(project),
  });
  if (error) throw new Error(`Could not add the project to your shared projects (${error.message}).`);
}

export async function readOnlineProject(id: string): Promise<OnlineReadResult> {
  if (!supabase) throw new Error('Sign-in is not configured on this build.');
  const { data, error } = await supabase
    .from('projects')
    .select('data, revision')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error(error?.message || 'Project not found');
  const row = data as Pick<ProjectRow, 'data' | 'revision'>;
  const project = deserializeProject(row.data);
  // Roadmap 257: shared projects saved before Board IDs get their numbers.
  migrateElementBoardIds(project);
  // Roadmap 275: report-design trash is pruned on read, same retention as
  // local loads and Drive reads (shared projects used to accumulate it).
  if (Array.isArray(project.reportTrash)) {
    project.reportTrash = pruneReportTrash(project.reportTrash);
  }
  return { project, revision: Number(row.revision) };
}

async function updateAtRevision(
  id: string,
  payload: { title: string; data: string; revision: number },
  revision: number,
): Promise<number | null> {
  const { data, error } = await supabase!
    .from('projects')
    .update(payload)
    .eq('id', id)
    .eq('revision', revision)
    .select('revision');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return Number((data[0] as Pick<ProjectRow, 'revision'>).revision);
}

/** Whole-blob save with optimistic concurrency. A revision mismatch means a
 *  different writer landed first — S1 has no room yet, so resolve with one
 *  last-write-wins retry (the same concurrency semantics as Drive today,
 *  docs/ROADMAP.md item 228). */
export async function saveOnlineProject(id: string, project: Project, revision: number): Promise<number> {
  if (!supabase) throw new Error('Sign-in is not configured on this build.');
  const payload = { title: project.title, data: serializeProject(project), revision: revision + 1 };
  const first = await updateAtRevision(id, payload, revision);
  if (first !== null) return first;
  const { data, error } = await supabase.from('projects').select('revision').eq('id', id).single();
  if (error || !data) throw new Error(error?.message || 'Project not found');
  const fresh = Number((data as Pick<ProjectRow, 'revision'>).revision);
  const second = await updateAtRevision(id, { ...payload, revision: fresh + 1 }, fresh);
  if (second === null) throw new Error('This project changed elsewhere — try again.');
  return second;
}

/** Title-only update for a project that is not open (no revision bump — the
 *  blob is untouched; the open project's title rides its next save). */
export async function renameOnlineProject(id: string, title: string): Promise<void> {
  if (!supabase) throw new Error('Sign-in is not configured on this build.');
  const { error } = await supabase.from('projects').update({ title }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteOnlineProject(id: string): Promise<void> {
  if (!supabase) throw new Error('Sign-in is not configured on this build.');
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
