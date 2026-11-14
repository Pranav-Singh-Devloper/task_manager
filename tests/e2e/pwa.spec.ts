import { expect, request, test } from '@playwright/test';

test.describe('home-screen app', () => {
  test('the manifest, icons and offline page open without signing in', async ({ baseURL }) => {
    const anon = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const manifest = await anon.get('/manifest.webmanifest');
    expect(manifest.status()).toBe(200);
    const m = await manifest.json();
    expect(m).toMatchObject({ display: 'standalone', start_url: '/', theme_color: '#1e40af' });
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    );
    for (const icon of m.icons as { src: string }[]) {
      const r = await anon.get(icon.src);
      expect(r.status(), icon.src).toBe(200);
      expect(r.headers()['content-type']).toContain('image/png');
    }
    for (const path of ['/sw.js', '/offline.html', '/icon.svg'])
      expect((await anon.get(path)).status(), path).toBe(200);
    // Everything else still sends a signed-out visitor to the sign-in page.
    const page = await anon.get('/', { maxRedirects: 0 });
    expect(page.status()).toBe(307);
    await anon.dispose();
  });

  test('pages link the manifest and the touch icon', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      /manifest\.webmanifest/,
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  });
});
