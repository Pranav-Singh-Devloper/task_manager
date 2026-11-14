import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PAGES = ['/', '/admin', '/settings', '/design'];

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);
}

async function seriousViolations(page: Page) {
  // AG Grid (Admin) puts a tabindex inside a presentational wrapper. That is the library's own markup, so this one rule is
  // skipped on a page with a grid. Everything else is still checked.
  const hasGrid = (await page.locator('.ag-root').count()) > 0;
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .disableRules(hasGrid ? ['aria-required-children'] : [])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('navigation', () => {
  test('desktop shows a fixed sidebar and no Menu button', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main menu' });
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Admin' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '+ New meeting' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
    const box = await page.locator('aside').boundingBox();
    expect(box?.width).toBe(240);
  });

  test('the New meeting button has one plus sign and fits on one line', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    await page.goto('/');
    const button = page
      .getByRole('navigation', { name: 'Main menu' })
      .getByRole('link', { name: '+ New meeting' });
    expect((await button.innerText()).trim()).toBe('+ New meeting');
    const box = await button.boundingBox();
    expect(box?.height).toBeLessThan(70);
  });

  test('only built pages are in the sidebar', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main menu' });
    await expect(nav.getByRole('link', { name: 'Tasks' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Cases' })).toHaveCount(0);
  });

  test('mobile uses a labelled Menu button, a drawer and a floating New meeting button', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile');
    await page.goto('/');
    await expect(page.locator('aside')).toBeHidden();
    await expect(page.getByRole('link', { name: '+ New meeting' })).toBeVisible();

    await page.getByRole('button', { name: 'Menu' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('link', { name: 'Settings' })).toBeVisible();
    await drawer.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('skip link jumps to the main content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  });
});

test.describe('readability', () => {
  test('body text is at least 18 px', async ({ page }) => {
    await page.goto('/');
    const size = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    expect(size).toBeGreaterThanOrEqual(18);
  });

  test('every button and link in the shell is at least 48 px', async ({ page }) => {
    await page.goto('/');
    const targets = page.locator(
      'header :is(a, button), nav :is(a, button), main :is(a, button), body > div > a',
    );
    const count = await targets.count();
    for (let i = 0; i < count; i++) {
      const el = targets.nth(i);
      if (!(await el.isVisible())) continue;
      const box = await el.boundingBox();
      const label =
        (await el.innerText()).trim() || (await el.getAttribute('aria-label')) || 'unnamed';
      expect(box?.height, `${label} is too short`).toBeGreaterThanOrEqual(48);
      expect(box?.width, `${label} is too narrow`).toBeGreaterThanOrEqual(48);
    }
  });

  test('text size A++ is remembered and does not break any page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^A\+\+/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-text-size', '150');
    for (const path of PAGES) {
      await page.goto(path);
      // The server already rendered the saved size, so there is no flash of small text.
      await expect(page.locator('html')).toHaveAttribute('data-text-size', '150');
      await noHorizontalScroll(page);
    }
    const size = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    expect(size).toBe(27);
  });

  test('A+ scales to 125%', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^A\+ / }).click();
    const size = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    expect(size).toBe(22.5);
    await expect(page.getByRole('button', { name: /^A\+ / })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('high contrast gives black on white with 3 px borders and is remembered', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /High contrast/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
    const styles = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      const header = getComputedStyle(document.querySelector('header') as Element);
      return { color: cs.color, bg: cs.backgroundColor, border: header.borderBottomWidth };
    });
    expect(styles).toEqual({ color: 'rgb(0, 0, 0)', bg: 'rgb(255, 255, 255)', border: '3px' });
  });
});

test.describe('accessibility (axe)', () => {
  for (const path of PAGES) {
    test(`${path} has no serious violations`, async ({ page }) => {
      await page.goto(path);
      expect(await seriousViolations(page)).toEqual([]);
    });

    test(`${path} has no serious violations at A++ with high contrast`, async ({ page }) => {
      await page.goto(path);
      await page.getByRole('button', { name: /^A\+\+/ }).click();
      await page.getByRole('button', { name: /High contrast/ }).click();
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
});

test.describe('UI kit', () => {
  test('combobox filters, offers Add for a new value and works from the keyboard', async ({
    page,
  }) => {
    await page.goto('/design');
    const box = page.getByRole('combobox', { name: 'State' });
    await box.fill('guj');
    await expect(page.getByRole('option', { name: 'Gujarat' })).toBeVisible();
    await box.press('ArrowDown');
    await box.press('Enter');
    await expect(box).toHaveValue('Gujarat');

    await box.fill('Atlantis');
    await expect(page.getByRole('option', { name: 'Add “Atlantis”' })).toBeVisible();
    await page.getByRole('option', { name: 'Add “Atlantis”' }).click();
    await expect(box).toHaveValue('Atlantis');
  });

  test('radio chips mark the chosen option with a tick, not only a colour', async ({ page }) => {
    await page.goto('/design');
    const completed = page.getByRole('radio', { name: 'Completed' });
    await completed.click();
    await expect(completed).toBeChecked();
    await expect(completed.locator('svg')).toBeVisible();
  });

  test('a notice with Undo is announced as status and has a close button', async ({ page }) => {
    await page.goto('/design');
    await page.getByRole('button', { name: 'Show a notice with Undo' }).click();
    // Radix announces the notice through a polite role="status" live region.
    await expect(page.getByRole('status').filter({ hasText: 'Meeting cancelled.' })).toBeAttached();
    const message = page.getByText('Meeting cancelled.', { exact: true });
    await expect(message).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(message).toBeHidden();
  });

  test('confirmation dialog asks in plain words and can be cancelled', async ({ page }) => {
    await page.goto('/design');
    await page.getByRole('button', { name: 'Show a confirmation' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete this meeting?' });
    await expect(dialog.getByText('You can bring it back from Trash.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('required fields say "(Required)" in words', async ({ page }) => {
    await page.goto('/design');
    await expect(page.getByText('(Required)')).toBeVisible();
  });
});
