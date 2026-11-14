import type { Env } from '../env';
import type { AppState } from './google/types';

export interface Identity {
  email: string;
  name: string;
  sub: string;
}

export type SignInFailure = 'wrong_account' | 'not_set_up';

export type SignInDecision =
  { ok: true; role: 'owner' | 'admin' } | { ok: false; reason: SignInFailure };

/** True once the owner has signed in and the database has been found or created. */
export function ownerIsReady(mode: Env['googleMode'], state: AppState | null): boolean {
  if (!state?.activeSpreadsheetId) return false;
  return mode === 'mock' || Boolean(state.refreshTokenEnc && !state.tokenInvalid);
}

/** Who may sign in (§5.3). Only people on ALLOWED_EMAILS; others wait until the owner has set the app up. */
export function decideSignIn(
  env: Pick<Env, 'ownerEmail' | 'allowedEmails' | 'googleMode'>,
  state: AppState | null,
  identity: Identity,
): SignInDecision {
  const email = identity.email.toLowerCase();
  if (!env.allowedEmails.includes(email)) return { ok: false, reason: 'wrong_account' };
  if (email === env.ownerEmail) return { ok: true, role: 'owner' };
  if (!ownerIsReady(env.googleMode, state)) return { ok: false, reason: 'not_set_up' };
  return { ok: true, role: 'admin' };
}

/** Drives the "Please sign in with Google again" banner. Always false in mock mode. */
export function needsSignIn(mode: Env['googleMode'], state: AppState | null): boolean {
  if (mode === 'mock') return false;
  return !state?.refreshTokenEnc || Boolean(state.tokenInvalid);
}
