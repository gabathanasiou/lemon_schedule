import { describe, expect, it } from 'vitest';
import { resolveActiveDesignId } from '../persist';

// Roadmap 233 — the designers' EDITING FOCUS is a per-user pref; the project's
// `activeReportId` / `activeRibbonId` is only the fallback (older files, first
// run). The resolution is what makes the choice survive projects, deletions
// and reloads without ever writing the project.

const DESIGNS = ['one', 'two', 'three'];

describe('resolveActiveDesignId', () => {
  it('prefers the stored per-user pick', () => {
    expect(resolveActiveDesignId('three', DESIGNS, 'one')).toBe('three');
  });

  it('falls back to the project-level default when nothing was picked', () => {
    expect(resolveActiveDesignId(null, DESIGNS, 'two')).toBe('two');
    expect(resolveActiveDesignId(undefined, DESIGNS, 'two')).toBe('two');
    expect(resolveActiveDesignId('', DESIGNS, 'two')).toBe('two');
  });

  it('falls back to the project-level default when the pick is stale (deleted design)', () => {
    expect(resolveActiveDesignId('gone', DESIGNS, 'two')).toBe('two');
  });

  it('never resolves a pick that belongs to another project — and never rewrites it', () => {
    // Same stored value, other project: the id is not in this project's list.
    expect(resolveActiveDesignId('other-project-design', ['a', 'b'], 'a')).toBe('a');
    // …and the value is still returned for the project it belongs to.
    expect(resolveActiveDesignId('other-project-design', ['x', 'other-project-design'], null)).toBe('other-project-design');
  });

  it('falls back to the first design, then to empty', () => {
    expect(resolveActiveDesignId('gone', DESIGNS, 'also-gone')).toBe('one');
    expect(resolveActiveDesignId('gone', DESIGNS, null)).toBe('one');
    expect(resolveActiveDesignId('gone', [], 'two')).toBe('');
    expect(resolveActiveDesignId(null, [])).toBe('');
  });
});
