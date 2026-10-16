import { describe, it, expect } from 'vitest';
import { fetchAllPages, SUPABASE_PAGE_SIZE } from '../supabase/pagination';

/** A fake page: `n` sequential items starting at `start`. */
const page = (n: number, start: number) => Array.from({ length: n }, (_, i) => start + i);

describe('fetchAllPages (roadmap 283)', () => {
  it('walks all pages with PostgREST inclusive ranges, stopping at the short page', async () => {
    const calls: [number, number][] = [];
    const data = await fetchAllPages(async (from, to) => {
      calls.push([from, to]);
      if (from === 0) return page(SUPABASE_PAGE_SIZE, 0);
      if (from === 1000) return page(SUPABASE_PAGE_SIZE, 1000);
      if (from === 2000) return page(7, 2000);
      throw new Error('unexpected page');
    });
    expect(data).toHaveLength(2007);
    expect(data[0]).toBe(0);
    expect(data[2006]).toBe(2006);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('a short first page costs one request', async () => {
    const calls: number[] = [];
    const data = await fetchAllPages(async from => {
      calls.push(from);
      return page(3, 0);
    });
    expect(data).toHaveLength(3);
    expect(calls).toEqual([0]);
  });

  it('an exact multiple of the page size costs one empty tail request', async () => {
    const calls: [number, number][] = [];
    const data = await fetchAllPages(async (from, to) => {
      calls.push([from, to]);
      return from === 0 ? page(SUPABASE_PAGE_SIZE, 0) : [];
    });
    expect(data).toHaveLength(SUPABASE_PAGE_SIZE);
    expect(calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it('propagates a page error unchanged', async () => {
    await expect(
      fetchAllPages(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });
});
