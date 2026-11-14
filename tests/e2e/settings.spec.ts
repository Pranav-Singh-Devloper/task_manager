import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// These tests never change a setting that other tests depend on (time format, lengths, reminders).
test.describe('settings', () => {
  test('shows every group in plain words, and saves', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    for (const name of [
      'Text size and contrast',
      'Time',
      'New meetings',
      'Daily agenda email',
      'Add to phone home screen',
      'Sign out',
    ])
      await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings saved.')).toBeVisible();
  });

  test('explains a mistake next to the field', async ({ page }) => {
    await page.goto('/settings');
    await page.getByLabel('Which calendar').fill('');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Please say which calendar to use.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Which calendar')).toHaveValue('primary');
  });

  test('has no serious accessibility problems', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Save settings' })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });
});
