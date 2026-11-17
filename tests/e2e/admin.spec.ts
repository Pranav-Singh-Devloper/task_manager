import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ccie, createViaApi, others, uid } from './meetings.helpers';

async function serious(page: Page, skip: string[] = []) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .disableRules(skip)
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

/** Chooses a category and waits until the page has really switched to it. */
async function pickCategory(page: Page, slug: string) {
  await page.getByLabel('Category', { exact: true }).selectOption(slug);
  await expect(page).toHaveURL(new RegExp(`category=${slug}`));
}

const desktopOnly = (name: string) => test.skip(name === 'mobile', 'Admin is built for a computer');

test.describe('admin on a phone', () => {
  test('says it works best on a computer, and lets the person continue', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile');
    await page.goto('/admin/health');
    await expect(page.getByText('Admin works best on a computer.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'System health' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue anyway' }).click();
    await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
  });
});

test.describe('admin tabs', () => {
  test('the six tabs are links, one level only', async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/tables$/);
    const nav = page.getByRole('navigation', { name: 'Admin sections' });
    for (const name of [
      'Data tables',
      'Columns & categories',
      'Trash',
      'Change log',
      'Backups',
      'System health',
    ])
      await expect(nav.getByRole('link', { name })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Data tables' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

test.describe('data tables', () => {
  test('shows every table, marks read-only ones, and never shows _system', async ({
    page,
  }, info) => {
    desktopOnly(info.project.name);
    await page.goto('/admin/tables');
    const select = page.getByLabel('Table', { exact: true });
    await expect(select).toContainText('_fields');
    await expect(select).toContainText('CCIE');
    await expect(select).not.toContainText('_system');
    await select.selectOption('_fields');
    await expect(page.getByText('Change these in Columns & categories or Settings.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete row' })).toHaveCount(0);
  });

  test('a cell can be edited in the grid, through the same rules as everywhere else', async ({
    page,
  }, info) => {
    desktopOnly(info.project.name);
    const m = await createViaApi(page, 'ccie', ccie({ topic: `Grid ${uid()}` }));
    const name = m.title;
    await page.goto('/admin/tables');
    await page.getByLabel('Table', { exact: true }).selectOption('CCIE');
    await page.getByLabel('Search this table').fill(name);
    await expect(page.getByText('1 row', { exact: true })).toBeVisible();
    const cell = page.locator('.ag-center-cols-container [col-id="topic"]').first();
    await cell.dblclick();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(`${name} edited`);
    await page.keyboard.press('Enter');
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    const res = await page.request.get(`/api/meetings/${m.id}`);
    expect((await res.json()).meeting.values.topic).toBe(`${name} edited`);
  });

  test('exports and the real spreadsheet are one click away', async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.goto('/admin/tables');
    await expect(page.getByRole('link', { name: 'Export CSV' })).toHaveAttribute(
      'href',
      /format=csv/,
    );
    await expect(page.getByRole('link', { name: 'Export Excel' })).toHaveAttribute(
      'href',
      /format=xlsx/,
    );
    await expect(page.getByRole('link', { name: 'Open in Google Sheets' })).toHaveAttribute(
      'href',
      /docs\.google\.com/,
    );
  });

  test('has no serious accessibility problems', async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.goto('/admin/tables');
    await expect(page.locator('.ag-center-cols-container [role="row"]').first()).toBeVisible();
    // AG Grid gives its scrolling header area a tabindex inside a presentational wrapper. That is the library's own markup,
    // so this one rule is skipped for the grid. Everything else is checked.
    expect(await serious(page, ['aria-required-children'])).toEqual([]);
  });
});

test.describe('columns and categories', () => {
  test('a column added here shows in the form, the table and the Sheet header, and can be hidden and shown again', async ({
    page,
  }, info) => {
    desktopOnly(info.project.name);
    const label = `Extra ${uid()}`;
    await page.goto('/admin/columns');
    await pickCategory(page, 'others');
    await page.getByRole('link', { name: '+ Add column' }).click();
    await page.getByLabel('Column name').fill(label);
    await page.getByRole('button', { name: 'Add column' }).click();
    await expect(page.getByRole('heading', { name: `Columns of Others` })).toBeVisible();
    await pickCategory(page, 'others');
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();

    await page.goto('/meetings/new?category=others');
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();

    // The Sheet's own header row has it too (the table API reads the real header).
    const grid = await page.request.get('/api/admin/tables/Others?limit=1');
    const keys = ((await grid.json()).columns as { key: string }[]).map((c) => c.key);
    expect(keys).toContain(label.toLowerCase().replace(' ', '_'));

    await page.goto('/admin/columns');
    await pickCategory(page, 'others');
    await page.getByRole('button', { name: new RegExp(`^Hide.*${label}`) }).click();
    await expect(page.getByText(`Hid ${label}. Its data is kept.`)).toBeVisible();
    await page.goto('/meetings/new?category=others');
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    await page.goto('/admin/columns');
    await pickCategory(page, 'others');
    await page.getByRole('button', { name: new RegExp(`^Show.*${label}`) }).click();
    await expect(page.getByText(`${label} is shown again.`)).toBeVisible();
  });

  test('a change of type that would lose answers is explained and blocked', async ({
    page,
  }, info) => {
    desktopOnly(info.project.name);
    await page.goto('/admin/columns');
    await pickCategory(page, 'ccie');
    await page.getByRole('link', { name: /^Edit — Contractor$/ }).click();
    await page.getByLabel('What kind of answer').selectOption('date');
    await expect(page.getByText(/could make existing values unreadable/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save column' })).toBeDisabled();
  });

  test('removing a column for good needs its name typed', async ({ page }, info) => {
    desktopOnly(info.project.name);
    const label = `Gone ${uid()}`;
    await page.goto('/admin/columns/others/new');
    await page.getByLabel('Column name').fill(label);
    await page.getByRole('button', { name: 'Add column' }).click();
    await expect(page.getByRole('heading', { name: 'Columns of Others' })).toBeVisible();
    await pickCategory(page, 'others');
    await page.getByRole('link', { name: new RegExp(`^Edit — ${label}$`) }).click();
    await page.getByRole('button', { name: 'Remove column for good…' }).click();
    const confirm = page.getByRole('button', { name: 'Remove for good' });
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/^Type .* to confirm$/).fill(label);
    await confirm.click();
    await expect(page.getByRole('heading', { name: 'Columns of Others' })).toBeVisible();
    await pickCategory(page, 'others');
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  });

  test('a column can be deleted straight from the list, after typing its name', async ({
    page,
  }, info) => {
    desktopOnly(info.project.name);
    const label = `Quick ${uid()}`;
    await page.goto('/admin/columns/others/new');
    await page.getByLabel('Column name').fill(label);
    await page.getByRole('button', { name: 'Add column' }).click();
    await pickCategory(page, 'others');
    // Core columns cannot be deleted, so they have no Delete button.
    await expect(page.getByRole('button', { name: /^Delete — Title$/ })).toHaveCount(0);
    await page.getByRole('button', { name: new RegExp(`^Delete — ${label}$`) }).click();
    const confirm = page.getByRole('button', { name: 'Remove for good' });
    await expect(confirm).toBeDisabled();
    await page.getByRole('button', { name: 'Keep it' }).click();
    await expect(confirm).toHaveCount(0);
    await page.getByRole('button', { name: new RegExp(`^Delete — ${label}$`) }).click();
    await page.getByLabel(/^Type .* to confirm$/).fill(label);
    await confirm.click();
    await expect(page.getByRole('status').filter({ hasText: `Deleted ${label}` })).toBeVisible();
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  });

  test('has no serious accessibility problems', async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.goto('/admin/columns');
    await expect(page.getByRole('heading', { name: /^Columns of/ })).toBeVisible();
    expect(await serious(page)).toEqual([]);
    await page.goto('/admin/columns/others/new');
    await expect(page.getByLabel('Column name')).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });
});

test.describe('trash', () => {
  test('a deleted meeting can be restored, or deleted for good with the typed word', async ({
    page,
  }, info) => {
    desktopOnly(info.project.name);
    const keep = await createViaApi(page, 'others', others({ topic: `Trash keep ${uid()}` }));
    const toss = await createViaApi(page, 'others', others({ topic: `Trash toss ${uid()}` }));
    for (const m of [keep, toss]) {
      const r = await page.request.delete(`/api/meetings/${m.id}?rev=${m.rev}`, {
        headers: { 'X-Requested-With': 'mm' },
      });
      expect(r.ok()).toBe(true);
    }
    await page.goto('/admin/trash');
    await expect(page.getByText(keep.title, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Restore — ${keep.title}` }).click();
    await expect(page.getByText(`Restored ${keep.title}.`)).toBeVisible();
    await expect(page.getByText(keep.title, { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: `Delete forever — ${toss.title}` }).click();
    const confirm = page
      .getByRole('group', { name: 'Delete forever' })
      .getByRole('button', { name: 'Delete forever' });
    await expect(confirm).toBeDisabled();
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await confirm.click();
    await expect(page.getByText(`Deleted ${toss.title} for good.`)).toBeVisible();
    expect((await page.request.get(`/api/meetings/${toss.id}`)).status()).toBe(404);
    expect((await page.request.get(`/api/meetings/${keep.id}`)).status()).toBe(200);
  });

  test('has no serious accessibility problems', async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.goto('/admin/trash');
    await expect(page.getByRole('heading', { name: 'Trash', level: 2 })).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });
});

test.describe('change log', () => {
  test('finds a change by searching for the meeting', async ({ page }, info) => {
    desktopOnly(info.project.name);
    const m = await createViaApi(page, 'others', others());
    await page.goto('/admin/log');
    await page.getByLabel('Search the log').fill(m.id);
    await expect(page.getByText('1 entry', { exact: true })).toBeVisible();
    await expect(page.getByText(/Added in Others/)).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });
});

test.describe('backups', () => {
  test('a backup can be made and then appears in the list', async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.goto('/admin/backups');
    await page.getByRole('button', { name: 'Back up now' }).click();
    await expect(page.getByText('Backup made.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Use this backup — Backup/ }).first(),
    ).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });
});

test.describe('system health', () => {
  test('shows plain lines, and a meeting that missed the calendar can be retried from here', async ({
    page,
  }, info) => {
    desktopOnly(info.project.name);
    await createViaApi(page, 'others', others({ topic: `Health calendar-down-once ${uid()}` }));
    await page.goto('/admin/health');
    await expect(page.getByText(/Connected as .* \(mock mode\)/)).toBeVisible();
    await expect(page.getByText(/not on the calendar yet/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Retry all' }).click();
    await expect(page.getByText('Tried again.')).toBeVisible();
    await expect(page.getByText(/App \d/)).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });
});
