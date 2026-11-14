import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../server/app';
import { loadEnv } from '../../server/env';
import { createLogger } from '../../server/lib/logger';
import {
  createMockGoogle,
  type MockGoogle,
  type MockOptions,
} from '../../server/services/google/mock';

export interface TestServer {
  base: string;
  mock: MockGoogle;
  close: () => Promise<void>;
  /** fetch that never follows redirects, so tests can see them. */
  get: (path: string, init?: RequestInit) => Promise<Response>;
  /** Signs in through the mock Google flow and returns the session cookie. */
  signIn: (email?: string) => Promise<string>;
}

export const OWNER = 'dad@example.com';
export const SON = 'son@example.com';

export async function startServer(
  options: MockOptions = { seed: 'demo' },
  extraEnv: Record<string, string> = {},
): Promise<TestServer> {
  const mock = await createMockGoogle(options);
  const env = loadEnv({ OWNER_EMAIL: OWNER, ALLOWED_EMAILS: `${OWNER},${SON}`, ...extraEnv });
  const app = createApp({ env, google: mock.services, logger: createLogger('silent') });
  // Bound to IPv4 loopback so another program listening on the same port number cannot answer instead.
  const server = http.createServer(app).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const get = (path: string, init: RequestInit = {}) =>
    fetch(`${base}${path}`, { redirect: 'manual', ...init });
  const signIn = async (email = OWNER) => {
    const res = await get(`/api/auth/google?as=${encodeURIComponent(email)}`);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('mm_session='));
    if (!cookie)
      throw new Error(
        `Sign-in as ${email} did not set a session (status ${res.status}, went to ${res.headers.get('location')}, body ${(await res.text()).slice(0, 200)})`,
      );
    return cookie.split(';')[0] as string;
  };
  return {
    base,
    mock,
    get,
    signIn,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export const withSession = (cookie: string, extra: Record<string, string> = {}) => ({
  headers: { cookie, ...extra },
});
export const MUTATE = { 'x-requested-with': 'mm' };
