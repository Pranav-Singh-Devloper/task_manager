import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** The other specs run on still screens; this one turns animations on, as most people will see the app. */
test.use({ reducedMotion: 'no-preference' });

async function serious(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test.describe('animations on', () => {
  test('the dashboard greets you over a moving warm background, and stays accessible', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    // The heading animates word by word but keeps its full name for screen readers.
    await expect(page.getByRole('heading', { level: 1, name: 'Your meetings' })).toBeVisible();
    await expect(page.getByText(/^Good (morning|afternoon|evening)/)).toBeVisible();
    await expect(page.locator('main section canvas').first()).toBeAttached();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
    // Let the entrance animations finish before checking contrast.
    await page.waitForTimeout(2500);
    expect(await serious(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('every main page opens without errors', async ({ page }) => {
    const errors = watchErrors(page);
    for (const [path, heading] of [
      ['/settings', 'Settings'],
      ['/meetings/new', 'What kind of meeting is it?'],
      ['/meetings/new?category=ccie', 'New meeting'],
      ['/admin', 'Admin'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('moving between pages fades the new page in and leaves it fully shown', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Your meetings' })).toBeVisible();
    // On a phone the pages are listed in the Menu drawer.
    if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Settings' }).first().click();
    const heading = page.getByRole('heading', { level: 1, name: 'Settings' });
    await expect(heading).toBeVisible();
    await expect
      .poll(() =>
        heading.evaluate((el) => getComputedStyle(el.closest('main > div') ?? el).opacity),
      )
      .toBe('1');
  });

  test('Settings can turn animations off, and the choice is remembered', async ({ page }) => {
    await page.goto('/settings');
    const toggle = page.getByRole('button', { name: /^Animations/ });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');

    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
    await expect(page.getByRole('heading', { level: 1, name: 'Your meetings' })).toBeVisible();
    // A still warm wash instead of the moving background.
    await expect(page.locator('main section canvas')).toHaveCount(0);
    await expect(page.locator('main section .warm-wash')).toHaveCount(1);
  });

  test('high contrast shows no moving background', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('banner')
      .getByRole('button', { name: /High contrast/ })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
    await expect(page.locator('main section canvas')).toHaveCount(0);
  });
});

test.describe('signed out, animations on', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the sign-in page keeps one clear button over its warm background', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Personal Manager' })).toBeVisible();
    const button = page.getByRole('link', { name: 'Sign in with Google' });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('href', '/api/auth/google');
    await page.waitForTimeout(2000);
    expect(await serious(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('signed out, device asks for less motion', () => {
  test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' });

  test('the sign-in button is not rebuilt after the page loads, so focus is never lost', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { removedButtons: number }).removedButtons = 0;
      new MutationObserver((changes) => {
        for (const change of changes)
          for (const node of Array.from(change.removedNodes))
            if (
              node instanceof Element &&
              (node.matches('a[href="/api/auth/google"]') ||
                node.querySelector('a[href="/api/auth/google"]'))
            )
              (window as unknown as { removedButtons: number }).removedButtons += 1;
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Sign in with Google' })).toBeVisible();
    await page.waitForTimeout(2000);
    expect(
      await page.evaluate(() => (window as unknown as { removedButtons: number }).removedButtons),
    ).toBe(0);
  });
});
