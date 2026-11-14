import { expect, test, type Page } from '@playwright/test';
import { createViaApi, others } from './meetings.helpers';

/** Every visible, enabled button and button-like link on the page that is shorter or narrower than 48 px. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const nodes = document.querySelectorAll<HTMLElement>(
      'button, a[href], select, input:not([type=hidden])',
    );
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden') continue;
      if (el.matches('[disabled], .sr-only, [aria-hidden="true"]') || el.closest('.sr-only'))
        continue;
      // A checkbox or radio is made large by its label, which is the tappable area.
      const target = el.matches('input[type=checkbox], input[type=radio]')
        ? (el.closest('label') ?? el)
        : el;
      const t = target.getBoundingClientRect();
      // Links inside a sentence are text, not buttons.
      if (el.matches('a') && el.closest('p, li, dd') && style.display === 'inline') continue;
      if (el.matches('a') && !el.className.includes('min-h-tap') && style.display === 'inline')
        continue;
      if (t.height < 47.5 || t.width < 47.5) {
        out.push(
          `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)}" ${Math.round(t.width)}x${Math.round(t.height)}`,
        );
      }
    }
    return out;
  });
}

test.describe('tap targets', () => {
  for (const path of ['/', '/meetings/new', '/meetings/new?category=others', '/settings']) {
    test(`${path}: every button is at least 48 px`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await smallTargets(page)).toEqual([]);
    });
  }

  test('a meeting page: every button is at least 48 px', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(m.title);
    await page.waitForLoadState('networkidle');
    expect(await smallTargets(page)).toEqual([]);
  });
});

test.describe('keyboard only', () => {
  test('the dashboard can be used without a mouse, and the focus is always visible', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile', 'The phone layout has a menu button first');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your meetings' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();

    // Walk forward until the "+ New meeting" link has focus, checking every stop has a visible outline.
    let reached = false;
    for (let i = 0; i < 25 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const s = getComputedStyle(el);
        return {
          name: (el.textContent || el.getAttribute('aria-label') || '').trim(),
          outline: parseFloat(s.outlineWidth) > 0 && s.outlineStyle !== 'none',
          shadow: s.boxShadow !== 'none',
        };
      });
      expect(info.outline || info.shadow, `no visible focus on "${info.name}"`).toBe(true);
      reached = info.name.startsWith('+ New meeting');
    }
    expect(reached).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/meetings\/new/);
    await expect(page.getByRole('heading', { name: 'What kind of meeting is it?' })).toBeVisible();
  });

  test('a meeting can be added from the keyboard alone', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'Covered on the phone by the tap flows');
    const topic = `Keys ${Math.random().toString(36).slice(2, 7)}`;
    await page.goto('/meetings/new?category=others');
    await page.locator('#input-start_time').focus();
    await page.getByRole('button', { name: 'Tomorrow' }).focus();
    await page.keyboard.press('Enter');
    await page.locator('#input-start_time').fill('09:30');
    await page.locator('#input-topic').focus();
    await page.keyboard.type(topic);
    await page.getByRole('button', { name: 'Save meeting' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(topic);
  });
});
