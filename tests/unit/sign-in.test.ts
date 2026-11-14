import { describe, expect, it } from 'vitest';
import { decideSignIn, needsSignIn, ownerIsReady } from '../../server/services/signIn';

const env = {
  ownerEmail: 'dad@example.com',
  allowedEmails: ['dad@example.com', 'son@example.com'],
  googleMode: 'live' as const,
};
const id = (email: string) => ({ email, name: 'X', sub: 's' });
const ready = { jobs: {}, activeSpreadsheetId: 'sheet', refreshTokenEnc: 'v1:x' };

describe('decideSignIn', () => {
  it('sends an email that is not on the list to the wrong-account message', () => {
    expect(decideSignIn(env, ready, id('stranger@gmail.com'))).toEqual({
      ok: false,
      reason: 'wrong_account',
    });
  });

  it('is case-insensitive', () => {
    expect(decideSignIn(env, null, id('DAD@Example.com'))).toEqual({ ok: true, role: 'owner' });
  });

  it('lets the owner in even before the app is set up', () => {
    expect(decideSignIn(env, null, id('dad@example.com'))).toEqual({ ok: true, role: 'owner' });
  });

  it('makes a non-owner wait until the owner has signed in once', () => {
    expect(decideSignIn(env, null, id('son@example.com'))).toEqual({
      ok: false,
      reason: 'not_set_up',
    });
    expect(decideSignIn(env, { jobs: {} }, id('son@example.com'))).toEqual({
      ok: false,
      reason: 'not_set_up',
    });
  });

  it('lets a non-owner in once the owner has set things up', () => {
    expect(decideSignIn(env, ready, id('son@example.com'))).toEqual({ ok: true, role: 'admin' });
  });

  it('makes a non-owner wait again if the owner token is no longer valid', () => {
    expect(decideSignIn(env, { ...ready, tokenInvalid: true }, id('son@example.com'))).toEqual({
      ok: false,
      reason: 'not_set_up',
    });
  });

  it('does not need a token in mock mode', () => {
    const state = { jobs: {}, activeSpreadsheetId: 'sheet' };
    expect(ownerIsReady('mock', state)).toBe(true);
    expect(ownerIsReady('live', state)).toBe(false);
  });
});

describe('needsSignIn (the "sign in again" banner)', () => {
  it('is on when the state file is gone', () => expect(needsSignIn('live', null)).toBe(true));
  it('is on when there is no token yet', () =>
    expect(needsSignIn('live', { jobs: {} })).toBe(true));
  it('is on after invalid_grant', () =>
    expect(needsSignIn('live', { ...ready, tokenInvalid: true })).toBe(true));
  it('is off when the token is fine', () => expect(needsSignIn('live', ready)).toBe(false));
  it('is always off in mock mode', () => expect(needsSignIn('mock', null)).toBe(false));
});
