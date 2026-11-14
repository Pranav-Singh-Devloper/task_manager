import { request } from '@playwright/test';

const BASE = 'http://localhost:3100';
const PAGES = [
  '/',
  '/admin',
  '/settings',
  '/design',
  '/login',
  '/meetings/new',
  '/meetings/new?category=ccie',
  '/categories/new',
  // Dynamic pages: any id compiles the route.
  '/meetings/warm-up',
  '/meetings/warm-up/edit',
  '/meetings/warm-up/reschedule',
  '/meetings/warm-up/done',
];

/**
 * Signs in once through the mock Google flow and saves the cookie for every test.
 * Also opens each page once so the dev server compiles them before the tests start.
 */
export default async function globalSetup() {
  const ctx = await request.newContext({ baseURL: BASE });
  const res = await ctx.get('/api/auth/google', { maxRedirects: 0 });
  if (res.status() !== 302) throw new Error(`Mock sign-in failed with status ${res.status()}`);
  await ctx.storageState({ path: 'tests/e2e/.auth/state.json' });
  for (const page of PAGES) await ctx.get(page, { timeout: 60_000 });
  await ctx.dispose();
}
