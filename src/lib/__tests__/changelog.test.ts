import { describe, it, expect } from 'vitest';
import changelogRaw from '../../../CHANGELOG.md?raw';
import { parseChangelog, formatChangelogDate } from '../changelog';

const SAMPLE = `# Changelog

Intro line the modal ignores.

## 2026-10-15

**Features**
- Account settings, with Profile and Team tabs.

**Bug fixes**
- New rows now run the cast-naming step.

**Changes**

## 2026-10-09

**Features**
- Call sheet designs gained a Precalls block.
`;

describe('parseChangelog', () => {
  it('parses day sections, groups and bullets in order', () => {
    const days = parseChangelog(SAMPLE);
    expect(days.map(d => d.date)).toEqual(['2026-10-15', '2026-10-09']);
    expect(days[0].groups.map(g => g.heading)).toEqual(['Features', 'Bug fixes']);
    expect(days[0].groups[0].items).toEqual(['Account settings, with Profile and Team tabs.']);
    expect(days[1].groups[0].items).toEqual(['Call sheet designs gained a Precalls block.']);
  });

  it('ignores content before the first day and empty groups', () => {
    expect(parseChangelog('## not a date\n- stray\n# Changelog\n## 2026-10-15\n**Changes**\n')).toEqual([]);
  });

  it('parses the real CHANGELOG.md', () => {
    const days = parseChangelog(changelogRaw);
    expect(days.length).toBeGreaterThanOrEqual(40);
    expect(new Set(days.map(d => d.date)).size).toBe(days.length);
    expect(days[0].date >= days[days.length - 1].date).toBe(true);
    for (const day of days) {
      expect(day.groups.length).toBeGreaterThan(0);
      for (const group of day.groups) expect(group.items.length).toBeGreaterThan(0);
    }
  });
});

describe('formatChangelogDate', () => {
  it('formats a day for display', () => {
    expect(formatChangelogDate('2026-10-15')).toContain('2026');
    expect(formatChangelogDate('2026-10-15')).toContain('15');
  });

  it('passes unparseable input through', () => {
    expect(formatChangelogDate('not-a-date')).toBe('not-a-date');
  });
});
