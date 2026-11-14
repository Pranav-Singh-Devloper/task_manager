import { expect, test } from '@playwright/test';

const PAGES = [
  '/',
  '/meetings/new',
  '/meetings/new?category=others',
  '/settings',
  '/admin/tables',
  '/admin/columns',
  '/admin/health',
];

test.describe('security headers', () => {
  test('every page has a strict policy with a fresh nonce, and nothing is blocked', async ({
    page,
  }) => {
    const blocked: string[] = [];
    page.on('console', (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) blocked.push(m.text());
    });
    page.on('pageerror', (e) => blocked.push(e.message));
    const nonces = new Set<string>();
    for (const path of PAGES) {
      const res = await page.goto(path);
      const csp = res?.headers()['content-security-policy'] ?? '';
      expect(csp, path).toContain("default-src 'self'");
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(csp, path).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      nonces.add(/'nonce-([^']+)'/.exec(csp)?.[1] ?? 'none');
      await page.waitForLoadState('networkidle');
    }
    expect(nonces.size).toBe(PAGES.length);
    expect(blocked).toEqual([]);
  });

  test('the app is not allowed to be shown inside another site', async ({ request }) => {
    const res = await request.get('/login');
    expect(res.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers()['x-powered-by']).toBeUndefined();
  });
});
