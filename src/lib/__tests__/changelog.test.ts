import { describe, it, expect } from 'vitest';
import changelogRaw from '../../../CHANGELOG.md?raw';
import { parseChangelog, formatChangelogDate, parseInline, parseLeadTag } from '../changelog';

const SAMPLE = `# Changelog

Intro line the modal ignores.

## 2026-10-15 — The one with invitations

**Features**
- **Settings** — account settings gained Profile and Team tabs.

**Bug fixes**
- New rows now run the cast-naming step.

**Changes**

## 2026-10-09

**Features**
- Call sheet designs gained a Precalls block.
`;

describe('parseChangelog', () => {
  it('parses day sections, titles, groups and bullets in order', () => {
    const days = parseChangelog(SAMPLE);
    expect(days.map(d => d.date)).toEqual(['2026-10-15', '2026-10-09']);
    expect(days[0].title).toBe('The one with invitations');
    expect(days[1].title).toBeUndefined();
    expect(days[0].groups.map(g => g.heading)).toEqual(['Features', 'Bug fixes']);
    expect(days[0].groups[0].items).toEqual(['**Settings** — account settings gained Profile and Team tabs.']);
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
      expect(day.title).toBeTruthy();
      expect(day.groups.length).toBeGreaterThan(0);
      for (const group of day.groups) expect(group.items.length).toBeGreaterThan(0);
    }
    expect(new Set(days.map(d => d.title)).size).toBe(days.length);
  });
});

describe('parseInline', () => {
  it('splits bold and italic runs', () => {
    expect(parseInline('**Call sheet** gained an *optional* block')).toEqual([
      { text: 'Call sheet', bold: true },
      { text: ' gained an ' },
      { text: 'optional', italic: true },
      { text: ' block' },
    ]);
  });

  it('leaves plain text as one run', () => {
    expect(parseInline('nothing special here')).toEqual([{ text: 'nothing special here' }]);
  });

  it('leaves unclosed markers literal', () => {
    expect(parseInline('**unclosed')).toEqual([{ text: '**unclosed' }]);
    expect(parseInline('a * b')).toEqual([{ text: 'a * b' }]);
  });
});

describe('parseLeadTag', () => {
  it('splits a short bold lead into tag + rest', () => {
    expect(parseLeadTag('**Schedule** — drag a scene onto a day.')).toEqual({ tag: 'Schedule', rest: 'drag a scene onto a day.' });
    expect(parseLeadTag('**Call sheet designs** gained a Precalls block.')).toEqual({ tag: 'Call sheet designs', rest: 'gained a Precalls block.' });
  });

  it('leaves long prose bolds inline', () => {
    expect(parseLeadTag('**Opening a project whose schedule version was missing** crashed the tab.')).toBeNull();
  });

  it('returns null without a bold lead', () => {
    expect(parseLeadTag('plain bullet text')).toBeNull();
    expect(parseLeadTag('*just italic* text')).toBeNull();
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
