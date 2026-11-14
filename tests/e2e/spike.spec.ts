import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('a test meeting with a PDF is saved to the Sheet, Calendar and Drive', async ({ page }) => {
  await page.goto('/spike');
  await page.getByLabel('Topic').fill('Budget review with the Chairman');
  await page.getByLabel('File').setInputFiles({
    name: 'agenda.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 agenda'),
  });
  await page.getByRole('button', { name: 'Save meeting' }).click();

  const status = page.getByRole('status').filter({ hasText: 'Saved to your Google Sheet' });
  await expect(status).toBeVisible();
  await expect(status).toContainText('On your Google Calendar ✓');
  await expect(status).toContainText('File saved to Google Drive:');
  await expect(status.getByRole('link', { name: /agenda\.pdf/ })).toBeVisible();
});

test('saving without a topic is stopped with a plain message', async ({ page }) => {
  await page.goto('/spike');
  await page.getByLabel('Topic').fill('   ');
  await page.getByRole('button', { name: 'Save meeting' }).click();
  // The browser's own required check stops an empty field, and the server stops a blank one.
  await expect(page.getByRole('alert').filter({ hasText: 'Please add a topic.' })).toBeVisible();
});

test('the form has no serious accessibility problems and works at A++', async ({ page }) => {
  await page.goto('/spike');
  await page.getByRole('button', { name: /^A\+\+/ }).click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
});
