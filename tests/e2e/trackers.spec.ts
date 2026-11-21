import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { uid } from './meetings.helpers';

async function serious(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

const noSideways = async (page: Page) =>
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);

async function openList(page: Page, slug: string, name: string) {
  await page.goto(`/trackers/${slug}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText('Loading…')).toHaveCount(0);
}

/** The rows shown, by their name link, whether as phone cards or a table. */
const rowLinks = (page: Page, slug: string) =>
  page.locator(`main a[href^="/trackers/${slug}/"]:visible`).filter({ hasNotText: /^Add/ });

test.describe('the home page', () => {
  test('has a card for every list, and a red number opens the list already filtered', async ({
    page,
  }) => {
    await page.goto('/');
    for (const name of ['Award Plan', 'Discussions', 'DPR', 'Track', 'Under Observation'])
      await expect(page.getByRole('heading', { level: 3, name })).toBeVisible();

    const dpr = page.locator('section').filter({ has: page.getByRole('heading', { name: 'DPR' }) });
    await dpr.getByRole('link', { name: /Late/ }).click();
    await expect(page).toHaveURL(/\/trackers\/dpr\?show=overdue/);
    await expect(page.getByRole('status').getByText('Past due date')).toBeVisible();
    await expect(rowLinks(page, 'dpr')).toHaveCount(2);
    await page.getByRole('button', { name: 'Show everything' }).click();
    await expect(rowLinks(page, 'dpr')).toHaveCount(5);
  });

  test('lists what needs attention across all the lists', async ({ page }) => {
    await page.goto('/');
    const attention = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Needs attention' }) });
    await expect(attention.getByRole('link', { name: /^DPR: 2 · Late/ })).toBeVisible();
    await expect(
      attention.getByRole('link', { name: /^Track: 1 · Not moved in 15 days/ }),
    ).toBeVisible();
  });
});

test.describe('adding and changing rows', () => {
  test('a discussion is added from the list, found by search, changed and moved to the Trash with Undo', async ({
    page,
  }) => {
    const topic = `Topic ${uid()}`;
    await openList(page, 'discussions', 'Discussions');
    await page.getByRole('main').getByRole('link', { name: 'Add discussion' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'New discussion' })).toBeVisible();
    await page.getByLabel('Discussion with').fill('Member(T)');
    await page.getByRole('option', { name: 'Member(T)' }).first().click();
    await page.getByLabel(/^Topic/).fill(topic);
    await page.getByRole('button', { name: 'Tomorrow' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Discussions' })).toBeVisible();
    await expect(page.getByText('Added.', { exact: true })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search Discussions' }).fill(topic);
    await expect(rowLinks(page, 'discussions')).toHaveCount(1);

    await rowLinks(page, 'discussions').first().click();
    await expect(page.getByRole('heading', { level: 1, name: topic })).toBeVisible();
    await page.getByRole('radio', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();

    await page.goto(`/trackers/discussions?q=${encodeURIComponent(topic)}`);
    await rowLinks(page, 'discussions').first().click();
    await page.getByRole('button', { name: 'Move to Trash' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Move to Trash' }).click();
    await expect(page.getByText('Moved to the Trash.', { exact: true })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search Discussions' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search Discussions' }).fill(topic);
    await expect(page.getByText('Nothing matches.')).toBeVisible();
    // Undo brings it straight back.
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByText('Brought back.', { exact: true })).toBeVisible();
    await expect(rowLinks(page, 'discussions')).toHaveCount(1);
  });

  test('the required name is asked for in plain words', async ({ page }) => {
    await page.goto('/trackers/under_observation/new');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Please fill in Project/work.')).toBeVisible();
  });

  test('a Track event takes its own states, and the list shows where it is now', async ({
    page,
  }) => {
    const event = `Event ${uid()}`;
    await page.goto('/trackers/track/new');
    await page.getByLabel(/^Event/).fill(event);
    await page.getByLabel('State 1', { exact: true }).fill('Sent to Member');
    await page.getByRole('button', { name: 'Reached today' }).first().click();
    await page.getByRole('button', { name: 'Add a state' }).click();
    await page.getByLabel('State 2', { exact: true }).fill('Approved');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Added.', { exact: true })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search Track' }).fill(event);
    const row = page.locator('main').locator(':is(tr, li):visible').filter({ hasText: event });
    await expect(row).toContainText('Sent to Member');
    await expect(row).not.toContainText('Approved');
  });

  test('the award target is set in place and shown under the numbers', async ({ page }) => {
    await openList(page, 'award_plan', 'Award Plan');
    await page.getByRole('button', { name: /target/ }).click();
    await page.getByLabel('Target length (km)').fill('500');
    await page.getByLabel('Target cost (₹ Cr)').fill('9000');
    await page.getByRole('button', { name: 'Save target' }).click();
    await expect(page.getByText('Target: 500 km · ₹ 9,000 Cr')).toBeVisible();
  });
});

test.describe('accessibility and layout', () => {
  for (const path of ['/', '/trackers/dpr', '/trackers/track', '/trackers/award_plan/new']) {
    test(`${path} has no serious problems and fits with high contrast at the largest size (A)`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText('Loading…')).toHaveCount(0);
      expect(await serious(page)).toEqual([]);
      const banner = page.getByRole('banner');
      await banner.getByRole('button', { name: /^A\s/ }).click();
      await banner.getByRole('button', { name: /High contrast/ }).click();
      // Let the buttons finish their short colour change before contrast is measured.
      await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
      await page.waitForTimeout(400);
      await noSideways(page);
      expect(await serious(page)).toEqual([]);
    });
  }

  test('on a phone the floating button adds to the list on screen', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile');
    await openList(page, 'dpr', 'DPR');
    await page.getByRole('link', { name: '+ Add DPR' }).click();
    await expect(page).toHaveURL(/\/trackers\/dpr\/new$/);
  });
});

test.describe('a new list', () => {
  test('is made from the sidebar, gets its columns in Admin, and has its own page and Add', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'Admin works best on a computer');
    const name = `Visits ${uid()}`;
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Main menu' })
      .getByRole('link', { name: '+ New list' })
      .click();
    await page.getByLabel(/^Name of the list/).fill(name);
    await page.getByLabel(/^What is one row called/).fill('visit');
    await page.getByRole('button', { name: 'Make the list' }).click();
    await expect(page.getByRole('heading', { name: `Columns of ${name}` })).toBeVisible();
    await expect(page.getByText(`Settings of ${name}`)).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Main menu' })
      .getByRole('link', { name: `Add — ${name}` })
      .click();
    await page.getByLabel(/^Name/).fill('Bridge at Km 12');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bridge at Km 12' })).toBeVisible();
  });
});
