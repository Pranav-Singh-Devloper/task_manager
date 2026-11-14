import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('error states', () => {
  test('a missing database shows the way back in plain words', async ({ page }) => {
    await page.route('**/api/meta', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'database_missing', message: "Your database couldn't be found." },
        }),
      }),
    );
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: "Your database couldn't be found" }),
    ).toBeVisible();
    for (const name of ['Try again', 'Use my newest backup', 'Set up a new database'])
      await expect(page.getByRole('button', { name })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });

  test('a page that does not exist says so and links home', async ({ page }) => {
    await page.goto('/this-page-is-not-here');
    await expect(page.getByRole('heading', { name: "We couldn't find that page" })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to my meetings' })).toBeVisible();
  });

  test('a meeting that does not exist says so', async ({ page }) => {
    await page.goto('/meetings/01ARZ3NDEKTSV4RRFFQ69G5FAV');
    await expect(page.getByText("We couldn't find that meeting.")).toBeVisible();
  });

  test('a lost connection while saving keeps the form, and trying again makes one meeting', async ({
    page,
  }) => {
    const topic = `Offline ${Math.random().toString(36).slice(2, 8)}`;
    await page.goto('/meetings/new?category=others');
    await page.getByRole('button', { name: 'Tomorrow' }).click();
    await page.locator('#input-start_time').fill('11:00');
    await page.locator('#input-topic').fill(topic);

    let fail = true;
    await page.route('**/api/meetings', async (route) => {
      if (route.request().method() === 'POST' && fail) {
        // The request reaches the server, but the answer is lost: the worst case for duplicates.
        await route.fetch();
        await route.abort('connectionfailed');
        fail = false;
        return;
      }
      await route.continue();
    });
    await page.getByRole('button', { name: 'Save meeting' }).click();
    await expect(page.getByText(/We couldn't save\. Your changes are still here/)).toBeVisible();
    await expect(page.locator('#input-topic')).toHaveValue(topic);

    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(topic);
    const found = await page.request.get(`/api/meetings?q=${encodeURIComponent(topic)}&scope=all`);
    expect((await found.json()).total).toBe(1);
  });
});
