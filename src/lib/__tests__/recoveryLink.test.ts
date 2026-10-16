import { describe, it, expect } from 'vitest';
import { parseRecoveryLinkError, stripRecoveryLinkParams } from '../supabase/recoveryLink';

describe('parseRecoveryLinkError (roadmap 278)', () => {
  it('reads implicit-flow hash params and maps otp_expired to friendly copy', () => {
    const r = parseRecoveryLinkError(
      'https://app.example/lemon_schedule/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    );
    expect(r?.code).toBe('otp_expired');
    expect(r?.message).toMatch(/expired/);
  });

  it('reads PKCE query params and falls back to the description', () => {
    const r = parseRecoveryLinkError('https://app.example/?error=server_error&error_description=Something+odd');
    expect(r?.code).toBe('server_error');
    expect(r?.message).toBe('Something odd');
  });

  it('is null for ordinary URLs (app hash places, bad input)', () => {
    expect(parseRecoveryLinkError('https://app.example/lemon_schedule/#/schedule')).toBeNull();
    expect(parseRecoveryLinkError('https://app.example/')).toBeNull();
    expect(parseRecoveryLinkError('not a url')).toBeNull();
  });
});

describe('stripRecoveryLinkParams (roadmap 278)', () => {
  it('removes hash error params entirely', () => {
    expect(stripRecoveryLinkParams('https://a.example/#error=access_denied&error_code=otp_expired')).toBe('https://a.example/');
  });

  it('removes query error params but preserves unrelated ones', () => {
    expect(stripRecoveryLinkParams('https://a.example/?error=x&keep=1')).toBe('https://a.example/?keep=1');
  });

  it('leaves the app hash places untouched', () => {
    const href = 'https://a.example/lemon_schedule/#/schedule';
    expect(stripRecoveryLinkParams(href)).toBe(href);
  });
});
