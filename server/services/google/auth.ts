import { randomBytes } from 'node:crypto';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { decrypt, encrypt } from '../../lib/crypto';
import type { Env } from '../../env';
import { GoogleApiError } from './errors';
import type { AppState, StateStore } from './types';
import type { Identity } from '../signIn';

export const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
export const SCOPE_CALENDAR = 'https://www.googleapis.com/auth/calendar.events';
export const IDENTITY_SCOPES = ['openid', 'email', 'profile'];
/** What only the owner is asked for (§5.2). Everyone else gets identity only. */
export const OWNER_SCOPES = [SCOPE_DRIVE, SCOPE_CALENDAR];

export function hasOwnerScopes(scopes: string[] | undefined): boolean {
  return OWNER_SCOPES.every((s) => scopes?.includes(s));
}

export interface StartOptions {
  /** The owner has signed in before and the database exists. */
  ownerReady: boolean;
  /** The stored token already covers Drive and Calendar. */
  hasScopes: boolean;
  /** "Use a different account": always show the account chooser. */
  switchAccount: boolean;
}

export interface GrantResult {
  identity: Identity;
  refreshToken?: string;
  scopes: string[];
}

export const NEEDS_SIGN_IN = 'needs_sign_in';

/**
 * The server's Google sign-in. Everything the app does in Google uses the owner's token (§5.4):
 * it lives encrypted in the state file, access tokens only in memory.
 */
export class GoogleAuth {
  private cached: { key: string; client: OAuth2Client } | null = null;

  constructor(
    private readonly env: Env,
    private readonly state: StateStore,
  ) {}

  private newClient(): OAuth2Client {
    return new OAuth2Client(
      this.env.googleClientId,
      this.env.googleClientSecret,
      this.env.googleRedirectUri,
    );
  }

  /**
   * Builds the Google sign-in URL. `prompt=consent` is used only when the owner has no working token
   * or a scope is missing; otherwise the account chooser, so he does not see the consent screen every time.
   */
  async start(options: StartOptions): Promise<{ url: string; state: string; verifier: string }> {
    const client = this.newClient();
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const state = randomBytes(16).toString('hex');
    const needFull = !options.ownerReady || !options.hasScopes;
    const prompt = [
      options.switchAccount || !needFull ? 'select_account' : null,
      needFull ? 'consent' : null,
    ]
      .filter(Boolean)
      .join(' ');
    const url = client.generateAuthUrl({
      access_type: 'offline',
      include_granted_scopes: true,
      scope: needFull ? [...IDENTITY_SCOPES, ...OWNER_SCOPES] : IDENTITY_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      prompt,
    });
    return { url, state, verifier: codeVerifier as string };
  }

  /** Exchanges the code and checks the ID token (signature, audience, verified email). */
  async complete(code: string, verifier: string): Promise<GrantResult> {
    const client = this.newClient();
    const { tokens } = await client.getToken({ code, codeVerifier: verifier });
    if (!tokens.id_token) throw new Error('Google did not return an ID token');
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.env.googleClientId as string,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified || !payload.sub)
      throw new Error('Google account email is not verified');
    return {
      identity: {
        email: payload.email.toLowerCase(),
        name: payload.given_name ?? payload.name ?? payload.email,
        sub: payload.sub,
      },
      refreshToken: tokens.refresh_token ?? undefined,
      scopes: (tokens.scope ?? '').split(' ').filter(Boolean),
    };
  }

  /** Stores the owner's refresh token, encrypted. Called only after the owner has signed in. */
  async saveOwner(
    refreshToken: string | undefined,
    scopes: string[],
    email: string,
  ): Promise<void> {
    const current: AppState = (await this.state.read()) ?? { jobs: {} };
    const key = this.env.tokenEncryptionKey as string;
    await this.state.write({
      ...current,
      ownerEmail: email,
      refreshTokenEnc: refreshToken ? encrypt(refreshToken, key) : current.refreshTokenEnc,
      grantedScopes: [...new Set([...(current.grantedScopes ?? []), ...scopes])],
      tokenInvalid: false,
    });
    this.cached = null;
  }

  /** Google rejected the refresh token. Jobs pause and everyone sees "Please sign in again". No data is lost. */
  async markInvalid(): Promise<void> {
    const current = await this.state.read();
    if (current && !current.tokenInvalid)
      await this.state.write({ ...current, tokenInvalid: true });
    this.cached = null;
  }

  /** The owner's authorised client for Google API calls. Throws a 401 when someone must sign in again. */
  async ownerClient(): Promise<OAuth2Client> {
    const state = await this.state.read();
    if (!state?.refreshTokenEnc || state.tokenInvalid) {
      throw new GoogleApiError(401, 'Please sign in with Google again.', NEEDS_SIGN_IN);
    }
    if (this.cached?.key === state.refreshTokenEnc) return this.cached.client;
    let refreshToken: string;
    try {
      refreshToken = decrypt(state.refreshTokenEnc, this.env.tokenEncryptionKey as string);
    } catch {
      // The encryption key changed or the file was edited. The owner signs in again to repair it.
      await this.markInvalid();
      throw new GoogleApiError(401, 'Please sign in with Google again.', NEEDS_SIGN_IN);
    }
    const client = this.newClient();
    client.setCredentials({ refresh_token: refreshToken });
    this.cached = { key: state.refreshTokenEnc, client };
    return client;
  }
}
