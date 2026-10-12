import { describe, expect, it } from 'vitest';
import { generateShareToken, hashShareToken, parseShareTokenFromHash, shareLinkUrl } from '../shareTokens';

describe('shareTokens', () => {
  it('generates a base64url token of 32 random bytes', () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes → 43 base64url chars, no padding
  });

  it('hashes to the sha256 hex the database stores', async () => {
    // Known vector: sha256("rls-link-1") — the same hash hardcoded in
    // supabase/tests/rls_s2.sql.
    await expect(hashShareToken('rls-link-1'))
      .resolves.toBe('13a2387372fa81bfaaf43c8dcc5a9718bba0ae7b73aa5ca91ed4abb9f914a5b0');
    expect(await hashShareToken('rls-link-1')).toHaveLength(64);
  });

  it('builds the invite URL against the app base', () => {
    expect(shareLinkUrl('abc', 'https://example.com', '/lemon_schedule/'))
      .toBe('https://example.com/lemon_schedule/#/share/abc');
    expect(shareLinkUrl('abc', 'http://localhost:3000', '/'))
      .toBe('http://localhost:3000/#/share/abc');
  });

  it('parses only share-route hashes', () => {
    const token = generateShareToken();
    expect(parseShareTokenFromHash(`#/share/${token}`)).toBe(token);
    expect(parseShareTokenFromHash(`#/share/${token}/`)).toBe(token);
    expect(parseShareTokenFromHash('#/production/days')).toBeNull();
    expect(parseShareTokenFromHash('#/share/short')).toBeNull();
    expect(parseShareTokenFromHash('')).toBeNull();
  });
});
