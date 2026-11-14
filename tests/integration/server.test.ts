import type { AddressInfo } from 'node:net';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app';
import { loadEnv } from '../../server/env';
import { createLogger } from '../../server/lib/logger';
import { createMockGoogle } from '../../server/services/google/mock';

let server: http.Server;
let base: string;
let mock: Awaited<ReturnType<typeof createMockGoogle>>;

beforeAll(async () => {
  mock = await createMockGoogle({ seed: 'empty' });
  const app = createApp({
    env: loadEnv({}),
    google: mock.services,
    logger: createLogger('silent'),
  });
  server = http.createServer(app).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('GET /api/health', () => {
  it('reports the process, mode and state file', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      mode: 'mock',
      stateFile: 'ok',
      google: 'mock',
    });
  });

  it('reports a missing state file without failing', async () => {
    mock.state.lose();
    const body = (await (await fetch(`${base}/api/health`)).json()) as { stateFile: string };
    expect(body.stateFile).toBe('missing');
  });
});

describe('API errors', () => {
  it('returns a plain-language JSON error for unknown routes', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).not.toMatch(/404|undefined|exception/i);
  });

  it('sets security headers and hides the framework', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
