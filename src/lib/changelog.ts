/**
 * Parser for the public CHANGELOG.md (roadmap 259). The file is written by the
 * `/changelog` command — `## YYYY-MM-DD` day sections, each holding `**Group**`
 * headings with `- ` bullets, newest first. Pure logic so the What's New modal
 * and Vitest share one seam (the test parses the real file too).
 */

export interface ChangelogGroup {
  heading: string;
  items: string[];
}

export interface ChangelogDay {
  date: string;
  groups: ChangelogGroup[];
}

const DAY_RE = /^## (\d{4}-\d{2}-\d{2})\s*$/;
const GROUP_RE = /^\*\*(.+?)\*\*\s*$/;
const ITEM_RE = /^- (.+)$/;

export function parseChangelog(raw: string): ChangelogDay[] {
  const days: ChangelogDay[] = [];
  let day: ChangelogDay | null = null;
  let group: ChangelogGroup | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const dayMatch = DAY_RE.exec(line);
    if (dayMatch) {
      day = { date: dayMatch[1], groups: [] };
      days.push(day);
      group = null;
      continue;
    }
    if (!day) continue; // the file header / anything before the first day
    const groupMatch = GROUP_RE.exec(line);
    if (groupMatch) {
      group = { heading: groupMatch[1], items: [] };
      day.groups.push(group);
      continue;
    }
    const itemMatch = ITEM_RE.exec(line);
    if (itemMatch && group) group.items.push(itemMatch[1].trim());
  }

  // Never render an empty label or an empty day (a malformed/partial file).
  return days
    .filter(d => d.groups.some(g => g.items.length > 0))
    .map(d => ({ date: d.date, groups: d.groups.filter(g => g.items.length > 0) }));
}

/** "2026-10-15" → a local, human date ("Thu, 15 Oct 2026"); passthrough if unparseable. */
export function formatChangelogDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
