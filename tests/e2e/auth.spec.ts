import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const SIGNED_OUT = { cookies: [], origins: [] };

test.describe('signed out', () => {
  test.use({ storageState: SIGNED_OUT });

  test('any page sends you to the login page with one big button', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login$/);
    const button = page.getByRole('link', { name: 'Sign in with Google' });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('signing in lands on the dashboard with your name shown', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Sign in with Google' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Your meetings' })).toBeVisible();
    await expect(page.locator('header').getByText('Demo owner')).toBeVisible();
  });

  test('an account that is not allowed gets a plain message and a way out', async ({ page }) => {
    await page.goto('/api/auth/google?as=stranger@gmail.com');
    await expect(page).toHaveURL(/\/login\?error=wrong_account/);
    const alert = page.getByRole('alert').filter({ hasText: 'You signed in as' });
    await expect(alert).toContainText('You signed in as stranger@gmail.com.');
    await expect(alert).toContainText('different Google account');
    await expect(page.getByRole('link', { name: 'Use a different account' })).toBeVisible();
  });

  test('an unknown error code still shows a friendly message', async ({ page }) => {
    await page.goto('/login?error=whatever');
    await expect(page.getByRole('alert').filter({ hasText: 'Something went wrong' })).toContainText(
      'Something went wrong while signing in',
    );
  });

  test('the login page has no serious accessibility problems, even with a message', async ({
    page,
  }) => {
    await page.goto('/login?error=not_set_up');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });

  test('the home page and privacy policy open without signing in, and are accessible', async ({
    page,
  }) => {
    for (const [path, heading] of [
      ['/about', 'Personal Manager'],
      ['/privacy', 'Privacy policy'],
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      ).toEqual([]);
    }
    await expect(page.getByText('Limited Use requirements')).toBeVisible();
  });

  test('the login page links to the home page and the privacy policy', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    await expect(page.getByRole('link', { name: 'About this app' })).toHaveAttribute(
      'href',
      '/about',
    );
  });

  test('text size and contrast work on the login page too', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'mm_text_size', value: '150', url: 'http://localhost:3100' }]);
    await page.goto('/login');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize))).toBe(
      27,
    );
  });
});

test.describe('signed in', () => {
  test('the login page is skipped', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/$/);
  });

  test('Sign out returns to the login page and locks the app again', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the Sign out button is easy to hit and the name is visible', async ({ page }) => {
    await page.goto('/');
    const box = await page.getByRole('button', { name: 'Sign out' }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
    expect(box?.width).toBeGreaterThanOrEqual(48);
  });
});
