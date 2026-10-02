import { describe, it, expect } from 'vitest';
import { resolveReportTextStyleSpans } from '../reportTextStyles';
import type { Project, ReportTextStyle } from '../../types';

// Roadmap 193: linked named-style runs resolve against the LIVE registry at
// render time, so editing a style restyles every marked run; a stale id
// degrades to plain text (never an error marker).

const project = (styles: ReportTextStyle[]): Project => ({ reportTextStyles: styles } as Project);

const HEADING: ReportTextStyle = { id: 'ts-h1', name: 'Heading 1', fontSize: 20, bold: true, fontFamily: 'Georgia' };

describe('resolveReportTextStyleSpans', () => {
  it('resolves a marked span against the registry', () => {
    expect(resolveReportTextStyleSpans('<p><span data-text-style="ts-h1">Title</span></p>', project([HEADING])))
      .toBe('<p><span style="font-size: 20pt; font-family: Georgia; font-weight: 700">Title</span></p>');
  });

  it('editing the style definition updates every marked run', () => {
    const before = resolveReportTextStyleSpans('<span data-text-style="ts-h1">Title</span>', project([HEADING]));
    const edited = { ...HEADING, fontSize: 24, bold: false, italic: true };
    const after = resolveReportTextStyleSpans('<span data-text-style="ts-h1">Title</span>', project([edited]));
    expect(before).toContain('font-size: 20pt');
    expect(after).toContain('font-size: 24pt; font-family: Georgia; font-style: italic');
    expect(after).not.toContain('font-weight');
  });

  it('a missing/deleted style id renders as plain text', () => {
    expect(resolveReportTextStyleSpans('<span data-text-style="ts-gone">Title</span>', project([HEADING])))
      .toBe('<span>Title</span>');
  });

  it('keeps direct formatting on the marker span and lets it win conflicts', () => {
    const out = resolveReportTextStyleSpans('<span style="color: red; font-size: 9pt" data-text-style="ts-h1">Title</span>', project([HEADING]));
    expect(out).toBe('<span style="font-size: 20pt; font-family: Georgia; font-weight: 700; color: red; font-size: 9pt">Title</span>');
  });

  it('is a no-op without markers (perf guard) and passes plain HTML through', () => {
    const html = '<p><b>plain</b> {{scene.loc}}</p>';
    expect(resolveReportTextStyleSpans(html, project([HEADING]))).toBe(html);
  });
});
