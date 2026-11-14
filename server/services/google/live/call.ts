import { withBackoff } from '../../../lib/backoff';
import { GoogleApiError } from '../errors';

/** What every live adapter needs: a way to get the owner's authorised client, and a hook for a dead token. */
export interface LiveContext {
  authClient: () => Promise<import('google-auth-library').OAuth2Client>;
  onInvalidGrant: () => Promise<void>;
}

const NETWORK_CODES = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EPIPE',
];

interface GaxiosLike {
  code?: string | number;
  message?: string;
  status?: number;
  response?: { status?: number; data?: unknown };
  errors?: { reason?: string }[];
}

/** Turns whatever the Google client threw into a GoogleApiError so callers only branch on status and reason. */
export function toGoogleError(err: unknown): GoogleApiError {
  if (err instanceof GoogleApiError) return err;
  const e = (err ?? {}) as GaxiosLike;
  const data = (e.response?.data ?? {}) as { error?: unknown; error_description?: string };
  const message = e.message ?? 'Google request failed';

  if (typeof e.code === 'string' && NETWORK_CODES.includes(e.code)) {
    return new GoogleApiError(0, message, 'network');
  }
  if (/fetch failed|network|socket hang up/i.test(message) && !e.response) {
    return new GoogleApiError(0, message, 'network');
  }

  const oauthError = typeof data.error === 'string' ? data.error : undefined;
  if (oauthError === 'invalid_grant' || /invalid_grant/.test(message)) {
    return new GoogleApiError(401, data.error_description ?? message, 'invalid_grant');
  }

  const status = e.response?.status ?? e.status ?? (typeof e.code === 'number' ? e.code : 500);
  const nested = (data.error as { errors?: { reason?: string }[] } | undefined)?.errors?.[0]
    ?.reason;
  const reason = oauthError ?? e.errors?.[0]?.reason ?? nested ?? 'unknown';
  return new GoogleApiError(status, message, reason);
}

/** Runs a Google call with retry on 429 / 5xx and normalised errors. A dead refresh token is reported once. */
export async function run<T>(ctx: LiveContext, fn: () => Promise<T>): Promise<T> {
  try {
    return await withBackoff(
      async () => {
        try {
          return await fn();
        } catch (err) {
          throw toGoogleError(err);
        }
      },
      (err) => err instanceof GoogleApiError && err.retryable,
    );
  } catch (err) {
    const normalised = toGoogleError(err);
    if (normalised.reason === 'invalid_grant') await ctx.onInvalidGrant();
    throw normalised;
  }
}
