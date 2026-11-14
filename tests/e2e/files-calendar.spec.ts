import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createViaApi, field, others, uid } from './meetings.helpers';

const pdf = (name = 'order-sheet.pdf') => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4 test file'),
});

async function serious(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

/** Fills the smallest valid "Others" meeting for tomorrow. */
async function fillOthers(page: Page, topic: string) {
  await page.goto('/meetings/new?category=others');
  await page.getByRole('button', { name: 'Tomorrow' }).click();
  await field(page, 'start_time').fill('11:00');
  await field(page, 'topic').fill(topic);
}

test.describe('files', () => {
  test('a file added in the form is saved with the meeting and shows on its page and the dashboard', async ({
    page,
  }) => {
    const topic = `Files check ${uid()}`;
    await fillOthers(page, topic);
    await page.getByTestId('file-input').setInputFiles(pdf());
    await expect(page.getByText('Will be saved with the meeting')).toBeVisible();
    await expect(page.getByText('Added order-sheet.pdf')).toBeVisible();

    await page.getByRole('button', { name: 'Save meeting' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(topic);
    const files = page.getByRole('heading', { name: 'Files', exact: true }).locator('..');
    await expect(files.getByRole('link', { name: 'Open — order-sheet.pdf' })).toBeVisible();
    await expect(files.getByRole('link', { name: /Open/ })).toHaveAttribute(
      'href',
      /drive\.mock\.local/,
    );

    await page.goto(`/?q=${encodeURIComponent(topic)}`);
    await expect(page.getByText('1 file', { exact: true }).first()).toBeVisible();
    // The file's name is searchable too.
    await page.goto('/?q=order-sheet.pdf');
    await expect(page.getByRole('link', { name: topic }).first()).toBeVisible();
  });

  test('a file can be added to and removed from a saved meeting', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}`);
    const card = page.getByRole('heading', { name: 'Files', exact: true }).locator('..');
    await expect(card.getByText('No files yet.')).toBeVisible();

    await page.getByTestId('file-input').setInputFiles(pdf('minutes.pdf'));
    await expect(card.getByRole('link', { name: 'Open — minutes.pdf' })).toBeVisible();
    await card.getByRole('button', { name: /Remove/ }).click();
    await expect(card.getByText('No files yet.')).toBeVisible();
    await expect(page.getByText('Removed minutes.pdf')).toBeVisible();
  });

  test('a kind of file that is not allowed is explained in plain words', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}`);
    await page.getByTestId('file-input').setInputFiles({
      name: 'program.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('MZ'),
    });
    await expect(page.getByText(/That kind of file cannot be added/)).toBeVisible();
    await page.getByRole('button', { name: /Close/ }).click();
    await expect(page.getByText(/That kind of file cannot be added/)).toHaveCount(0);
  });

  test('a saved draft knows which of its files are still there', async ({ page }) => {
    const topic = `Draft files ${uid()}`;
    await fillOthers(page, topic);
    await page.getByTestId('file-input').setInputFiles(pdf('draft.pdf'));
    await expect(page.getByText('Will be saved with the meeting')).toBeVisible();
    // Wait for the autosave, then come back.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('mm.draft.new.others') ?? ''))
      .toContain('draft.pdf');
    await page.goto('/meetings/new?category=others');
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('button', { name: 'Remove — draft.pdf' })).toBeVisible();
    await expect(page.getByText('Will be saved with the meeting')).toBeVisible();
    await page.evaluate(() => localStorage.removeItem('mm.draft.new.others'));
  });

  test('the files section has no serious accessibility problems', async ({ page }) => {
    await page.goto('/meetings/new?category=others');
    await page.getByTestId('file-input').setInputFiles(pdf());
    await expect(page.getByText('Will be saved with the meeting')).toBeVisible();
    expect(await serious(page)).toEqual([]);
    await page.evaluate(() => localStorage.removeItem('mm.draft.new.others'));
  });
});

test.describe('calendar', () => {
  test('a saved meeting says it was added to the calendar', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}`);
    await expect(page.getByText('On your Google Calendar ✓')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open in Calendar' })).toBeVisible();
  });

  test('when Calendar is down the meeting still saves, says so, and a retry fixes it', async ({
    page,
  }) => {
    const topic = `Retry check calendar-down-once ${uid()}`;
    await fillOthers(page, topic);
    await page.getByRole('button', { name: 'Save meeting' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(topic);
    await expect(
      page.getByText(
        'Meeting saved. It is not on your calendar yet. You can try again from the meeting page.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText('Not on your calendar yet.', { exact: true })).toBeVisible();
    expect(await serious(page)).toEqual([]);

    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('On your Google Calendar ✓')).toBeVisible();
    await expect(page.getByText('Not on your calendar yet.', { exact: true })).toHaveCount(0);
  });

  test('the dashboard marks a meeting that is not on the calendar', async ({ page }) => {
    const topic = `Marked calendar-down-once ${uid()}`;
    await createViaApi(page, 'others', others({ topic }));
    await page.goto(`/?q=${encodeURIComponent(topic)}`);
    await expect(page.getByText('Not on your calendar yet').first()).toBeVisible();
  });

  test('cancelling takes the meeting off the calendar and restoring puts it back', async ({
    page,
  }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}`);
    await page.getByRole('button', { name: 'Cancel meeting' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel meeting' }).click();
    await expect(page.getByText(/not on your calendar, because it is cancelled/)).toBeVisible();
    await page.getByRole('button', { name: 'Restore' }).first().click();
    await expect(page.getByText('On your Google Calendar ✓')).toBeVisible();
  });
});
