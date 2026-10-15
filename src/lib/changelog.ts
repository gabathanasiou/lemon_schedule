/**
 * Parser for the public CHANGELOG.md (roadmap 259/260). The file is written by
 * the `/changelog` command — `## YYYY-MM-DD — Title` day sections, each
 * holding `**Group**` headings with `- ` bullets, newest first. Pure logic so
 * the What's New modal and Vitest share one seam (the test parses the real
 * file too).
 */

export interface ChangelogGroup {
  heading: string;
  items: string[];
}

export interface ChangelogDay {
  date: string;
  /** Short playful title from the `## YYYY-MM-DD — Title` heading (roadmap 260). */
  title?: string;
  groups: ChangelogGroup[];
}

export interface ChangelogInline {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

const DAY_RE = /^## (\d{4}-\d{2}-\d{2})(?:\s+—\s+(.+?))?\s*$/;
const GROUP_RE = /^\*\*(.+?)\*\*\s*$/;
const ITEM_RE = /^- (.+)$/;

export function parseChangelog(raw: string): ChangelogDay[] {
  const days: ChangelogDay[] = [];
  let day: ChangelogDay | null = null;
  let group: ChangelogGroup | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const dayMatch = DAY_RE.exec(line);
    if (dayMatch) {
      day = { date: dayMatch[1], title: dayMatch[2]?.trim(), groups: [] };
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
    .map(d => ({ date: d.date, title: d.title, groups: d.groups.filter(g => g.items.length > 0) }));
}

/**
 * Light inline markdown for bullet bodies (roadmap 260): `**bold**` lead-ins
 * and `*italic*` asides. Unclosed markers stay literal. Pure so the modal and
 * Vitest share it.
 */
export function parseInline(text: string): ChangelogInline[] {
  const segments: ChangelogInline[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) segments.push({ text: text.slice(last, match.index) });
    if (match[1] !== undefined) segments.push({ text: match[1], bold: true });
    else segments.push({ text: match[2], italic: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

/**
 * Splits a bullet that leads with a short bold tag — `**Schedule** — drag a
 * scene onto a day.` — into the tag and the remaining text, so the modal can
 * render the tag as a chip and readers can scan by surface (roadmap 260).
 * Longer bolds are prose lead-ins and stay inline; null when there is no
 * short lead tag.
 */
export function parseLeadTag(text: string): { tag: string; rest: string } | null {
  const match = /^\*\*([^*]+)\*\*\s*/.exec(text);
  if (!match) return null;
  const tag = match[1].trim();
  if (!tag || tag.split(/\s+/).length > 5 || tag.length > 40) return null;
  const rest = text.slice(match[0].length).replace(/^(—|·|:)\s*/, '');
  return { tag, rest };
}

/** "2026-10-15" → a local, human date ("Thu, 15 Oct 2026"); passthrough if unparseable. */
export function formatChangelogDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
