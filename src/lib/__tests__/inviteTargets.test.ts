import { describe, expect, it } from 'vitest';
import { classifyInviteTarget } from '../inviteTargets';

const suggestions = [
  { userId: 'u-1', email: 'sara@example.com' },
  { userId: 'u-2', email: null },
];

describe('classifyInviteTarget', () => {
  it('routes a suggestion id to the member invite', () => {
    expect(classifyInviteTarget('u-1', suggestions)).toEqual({ kind: 'member', userId: 'u-1' });
    expect(classifyInviteTarget('  u-2  ', suggestions)).toEqual({ kind: 'member', userId: 'u-2' });
  });

  it('routes a well-formed email to the email invite', () => {
    expect(classifyInviteTarget('new@example.com', suggestions)).toEqual({ kind: 'email', email: 'new@example.com' });
    expect(classifyInviteTarget(' New@Example.com ', suggestions)).toEqual({ kind: 'email', email: 'New@Example.com' });
  });

  it('matches a suggestion id before treating text as an email', () => {
    // A UUID can never be a valid email, but the member branch must win
    // regardless of shape — suggestions are authoritative.
    const weird = [{ userId: 'a@b.co', email: null }];
    expect(classifyInviteTarget('a@b.co', weird)).toEqual({ kind: 'member', userId: 'a@b.co' });
  });

  it('ignores half-typed names, incomplete addresses and empty text', () => {
    expect(classifyInviteTarget('', suggestions)).toBeNull();
    expect(classifyInviteTarget('   ', suggestions)).toBeNull();
    expect(classifyInviteTarget('Sar', suggestions)).toBeNull();
    expect(classifyInviteTarget('sara@', suggestions)).toBeNull();
    expect(classifyInviteTarget('sara@example', suggestions)).toBeNull();
  });
});
