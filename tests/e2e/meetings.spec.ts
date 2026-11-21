import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ccie, createViaApi, field, others, uid, ulid } from './meetings.helpers';

async function serious(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}
const noSideScroll = async (page: Page) =>
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);

test.describe('creating a meeting', () => {
  test('pick a category, fill in its form, and land on the meeting', async ({ page }) => {
    const project = `NH-${uid()} Widening`;
    const caseId = `C-${uid()}`;
    await page.goto('/meetings/new');
    await expect(page.getByRole('heading', { name: 'What kind of meeting is it?' })).toBeVisible();
    await page.getByRole('link', { name: 'CCIE', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'New meeting' })).toBeVisible();
    await page.getByRole('button', { name: 'Tomorrow' }).click();
    await field(page, 'start_time').fill('10:30');
    await field(page, 'case_id').fill(caseId);
    await field(page, 'project_name').fill(project);
    await page.getByRole('radio', { name: '2 hours' }).click();
    await page.getByRole('button', { name: 'Save meeting' }).click();

    await expect(
      page.getByRole('heading', { name: `CCIE — ${project} (${caseId})` }),
    ).toBeVisible();
    await expect(page.getByText('Tomorrow · 10:30 AM to 12:30 PM')).toBeVisible();
    await expect(
      page.getByText('Meeting saved and added to your Google Calendar.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Scheduled', { exact: true }).first()).toBeVisible();
  });

  test('required fields say "(Required)" in words and a mistake is explained next to the field', async ({
    page,
  }) => {
    await page.goto('/meetings/new?category=ccie');
    await expect(page.getByText('(Required)').first()).toBeVisible();
    await page.getByRole('button', { name: 'Save meeting' }).click();

    const alert = page.getByRole('alert').filter({ hasText: 'need your attention' });
    await expect(alert).toContainText('4 things need your attention');
    for (const message of [
      'Please fill in Case Id.',
      'Please fill in Project Name.',
      'Please fill in Date.',
    ]) {
      await expect(alert.getByRole('link', { name: message })).toBeVisible();
    }
    await expect(page.locator('#field-case_id')).toContainText('Please fill in Case Id.');
    // The first problem is where the keyboard lands.
    await expect(field(page, 'date')).toBeFocused();
    // A summary link takes you to its field.
    await alert.getByRole('link', { name: 'Please fill in Project Name.' }).click();
    await expect(field(page, 'project_name')).toBeFocused();
  });

  test('AT (Award Target) is no longer a kind of meeting: its fields live in the Award Plan list', async ({
    page,
  }) => {
    await page.goto('/meetings/new');
    await expect(page.getByRole('link', { name: 'Others', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'AT (Award Target)' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'File Discussion' })).toHaveCount(0);
    // The project's numbers, with their units, are in the Award Plan form instead.
    await page.goto('/trackers/award_plan/new');
    await expect(page.locator('#field-length_km')).toContainText('km');
    await expect(page.locator('#input-civil_cost')).toHaveAttribute('inputmode', 'decimal');
    await expect(page.locator('#field-civil_cost')).toContainText('₹ Cr');
    await expect(page.getByRole('combobox', { name: /Mode/ })).toBeVisible();
  });

  test('a new value typed into a learning dropdown is offered the next time', async ({ page }) => {
    const piu = `PIU E2E ${uid()}`;
    await page.goto('/meetings/new?category=ccie');
    const box = page.getByRole('combobox', { name: /^PIU/ });
    await box.fill(piu);
    await page.getByRole('option', { name: `Add “${piu}”` }).click();
    await page.getByRole('button', { name: 'Tomorrow' }).click();
    await field(page, 'start_time').fill('11:00');
    await field(page, 'case_id').fill(`C-${uid()}`);
    await field(page, 'project_name').fill('Learning check');
    await page.getByRole('button', { name: 'Save meeting' }).click();
    await expect(
      page.getByText('Meeting saved and added to your Google Calendar.', { exact: true }),
    ).toBeVisible();

    await page.goto('/meetings/new?category=ccie');
    await page.getByRole('combobox', { name: /^PIU/ }).click();
    await expect(page.getByRole('option', { name: piu })).toBeVisible();
  });

  test('"+ Add new category" makes a category and opens its form', async ({ page }) => {
    const name = `E2E Visits ${uid()}`;
    await page.goto('/meetings/new');
    await page.getByRole('link', { name: '+ Add new category' }).click();
    await expect(page.getByRole('heading', { name: 'Add a category' })).toBeVisible();
    await field(page, 'name').fill(name);
    await page.getByRole('radio', { name: 'Violet' }).click();
    await page.getByRole('button', { name: 'Add category' }).click();
    await expect(page.getByText(`Kind of meeting: ${name}`)).toBeVisible();
    await page.goto('/meetings/new');
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  });

  test('a taken category name is refused in plain words', async ({ page }) => {
    await page.goto('/categories/new');
    await field(page, 'name').fill('CCIE');
    await page.getByRole('button', { name: 'Add category' }).click();
    await expect(page.locator('#field-name')).toContainText(
      'A category called "CCIE" already exists.',
    );
  });

  test('changing category keeps what was typed for the shared fields', async ({ page }) => {
    const topic = `Carry ${uid()}`;
    await page.goto('/meetings/new?category=others');
    await field(page, 'topic').fill(topic);
    await page.getByRole('link', { name: 'Change category' }).click();
    await page.getByRole('link', { name: 'Court Case', exact: true }).click();
    await expect(page.getByText('Kind of meeting: Court Case')).toBeVisible();
    await expect(field(page, 'topic')).toHaveValue(topic);
  });
});

test.describe('losing the connection or the page', () => {
  test('a failed save keeps everything, and retrying makes exactly one meeting', async ({
    page,
  }) => {
    const topic = `Flaky ${uid()}`;
    await page.goto('/meetings/new?category=others');
    await page.getByRole('button', { name: 'Tomorrow' }).click();
    await field(page, 'start_time').fill('09:00');
    await field(page, 'topic').fill(topic);

    let blocked = true;
    await page.route('**/api/meetings', (route) =>
      blocked && route.request().method() === 'POST' ? route.abort() : route.continue(),
    );
    await page.getByRole('button', { name: 'Save meeting' }).click();
    const alert = page.getByRole('alert').filter({ hasText: "We couldn't save." });
    await expect(alert).toContainText("We couldn't save. Your changes are still here.");
    await expect(field(page, 'topic')).toHaveValue(topic);

    blocked = false;
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: topic })).toBeVisible();
    const list = await (await page.request.get('/api/meetings?category=others')).json();
    expect(list.meetings.filter((m: { title: string }) => m.title === topic)).toHaveLength(1);
  });

  test('an unsaved draft is offered on return, and can be restored or discarded', async ({
    page,
  }) => {
    const topic = `Draft ${uid()}`;
    await page.goto('/meetings/new?category=others');
    await field(page, 'topic').fill(topic);
    await page.waitForTimeout(700); // autosave waits a moment after typing
    await page.reload();

    const banner = page.getByRole('status').filter({ hasText: 'You have an unsaved draft.' });
    await expect(banner).toBeVisible();
    await expect(field(page, 'topic')).toHaveValue('');
    await banner.getByRole('button', { name: 'Restore' }).click();
    await expect(field(page, 'topic')).toHaveValue(topic);

    await page.reload();
    await page
      .getByRole('status')
      .filter({ hasText: 'You have an unsaved draft.' })
      .getByRole('button', { name: 'Discard' })
      .click();
    await page.reload();
    await expect(page.getByText('You have an unsaved draft.')).toHaveCount(0);
  });
});

test.describe('the meeting page', () => {
  test('shows the title, date and time, chips, details and calculated columns', async ({
    page,
  }) => {
    const m = await createViaApi(
      page,
      'ccie',
      ccie({ date_of_initiation: '2025-02-10', contractor: 'Shree Infra Ltd' }),
    );
    await page.goto(`/meetings/${m.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(m.title);
    await expect(page.getByText('Tue, 15 Jun 2027 · 10:30 AM to 11:30 AM')).toBeVisible();
    await expect(page.getByText('CCIE', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('NHAI', { exact: true }).first()).toBeVisible();
    await expect(page.locator('dt', { hasText: 'Contractor' })).toBeVisible();
    await expect(page.getByText('Shree Infra Ltd')).toBeVisible();
    await expect(page.getByText('calculated automatically').first()).toBeVisible();
    await expect(page.getByText('Not added').first()).toBeVisible();
    // No ISO strings and no ids in the main page.
    expect(await page.locator('main').innerText()).not.toMatch(/\d{4}-\d{2}-\d{2}T|[0-9A-Z]{26}/);
  });

  test('every action is a visible labelled button, with no menus', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}`);
    for (const name of [
      'Reschedule',
      'Mark as done',
      'Edit',
      'Cancel meeting',
      'Schedule next meeting',
      'Delete',
    ]) {
      await expect(
        page.getByRole('link', { name }).or(page.getByRole('button', { name })),
      ).toBeVisible();
    }
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('a future meeting has Reschedule as its main button', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}`);
    const reschedule = page.getByRole('link', { name: 'Reschedule' });
    const done = page.getByRole('link', { name: 'Mark as done' });
    await expect(reschedule).toBeVisible();
    const bg = (l: typeof reschedule) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await bg(reschedule)).not.toBe(await bg(done));
  });

  test('a meeting that has started has Mark as done as its main button', async ({ page }) => {
    const m = await createViaApi(
      page,
      'others',
      others({ date: '2026-01-05', start_time: '09:00' }),
    );
    await page.goto(`/meetings/${m.id}`);
    const reschedule = page.getByRole('link', { name: 'Reschedule' });
    const done = page.getByRole('link', { name: 'Mark as done' });
    const bg = (l: typeof reschedule) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await bg(done)).not.toBe(await bg(reschedule));
    expect(await bg(done)).toBe('rgb(143, 56, 18)');
  });

  test('Edit changes a field, keeps the rest, and can be undone', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit meeting' })).toBeVisible();
    await expect(field(page, 'topic')).toHaveValue(m.title);
    await field(page, 'remarks').fill('Bring the signed copy');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Meeting changed.', { exact: true })).toBeVisible();
    await expect(page.getByText('Bring the signed copy')).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByText('Done. That change was undone.', { exact: true })).toBeVisible();
    await expect(page.getByText('Bring the signed copy')).toHaveCount(0);
  });

  test('cancelling asks first, and Undo brings the meeting back', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}`);
    await page.getByRole('button', { name: 'Cancel meeting' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel this meeting?' });
    await expect(dialog).toContainText('You can bring it back with Restore.');
    await dialog.getByRole('button', { name: 'Keep meeting' }).click();
    await expect(page.getByText('Cancelled', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Cancel meeting' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel meeting' }).click();
    await expect(page.getByText('Meeting cancelled.', { exact: true })).toBeVisible();
    await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByText('Scheduled', { exact: true }).first()).toBeVisible();
  });

  test('a cancelled meeting can be restored with one button', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}`);
    await page.getByRole('button', { name: 'Cancel meeting' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel meeting' }).click();
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('Meeting restored.', { exact: true })).toBeVisible();
    await expect(page.getByText('Scheduled', { exact: true }).first()).toBeVisible();
  });

  test('deleting says it can be brought back, and the meeting can be restored', async ({
    page,
  }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}`);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete this meeting?' });
    await expect(dialog).toContainText('You can bring it back from Trash.');
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Meeting deleted.', { exact: true })).toBeVisible();
    await expect(page.getByText('In Trash', { exact: true })).toBeVisible();
    await expect(
      page.getByText('This meeting is in the Trash. Restore it to change it.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('In Trash', { exact: true })).toHaveCount(0);
  });

  test('a meeting that does not exist says so plainly', async ({ page }) => {
    await page.goto('/meetings/00000000000000000000000000');
    await expect(page.getByText("We couldn't find that meeting.")).toBeVisible();
  });
});

test.describe('rescheduling', () => {
  test('takes three taps: Reschedule, Same time tomorrow, Save new time', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}`);
    await page.getByRole('link', { name: 'Reschedule' }).click(); // 1
    await page.getByRole('button', { name: 'Same time tomorrow' }).click(); // 2
    await page.getByRole('button', { name: 'Save new time' }).click(); // 3

    await expect(page).toHaveURL(new RegExp(`/meetings/${m.id}$`));
    await expect(page.getByText('Meeting moved.', { exact: true })).toBeVisible();
    await expect(page.getByText('Tomorrow · 10:30 AM to 11:30 AM')).toBeVisible();
    await expect(page.getByText('Rescheduled', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Rescheduled ×1')).toBeVisible();
  });

  test('a quick choice only fills in the fields, it does not save', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}/reschedule`);
    await page.getByRole('button', { name: 'Same time next week' }).click();
    await expect(field(page, 'when_date')).toHaveValue('2027-06-22');
    await expect(field(page, 'when_start')).toHaveValue('10:30');
    const got = await (await page.request.get(`/api/meetings/${m.id}`)).json();
    expect(got.meeting.values.date).toBe('2027-06-15');
  });

  test('keeps the length, takes a reason, and the history shows old and new', async ({ page }) => {
    const m = await createViaApi(page, 'others', others({ end_time: '12:00' }));
    await page.goto(`/meetings/${m.id}/reschedule`);
    await field(page, 'when_date').fill('2027-06-20');
    await field(page, 'when_start').fill('14:00');
    await field(page, 'reason').fill('Officer unavailable');
    await page.getByRole('button', { name: 'Save new time' }).click();
    await expect(page.getByText('Sun, 20 Jun 2027 · 2:00 PM to 3:30 PM')).toBeVisible();
    await expect(page.getByText('Reason: Officer unavailable')).toBeVisible();
    await expect(
      page.getByText('Tue, 15 Jun 2027 10:30 AM → Sun, 20 Jun 2027 2:00 PM'),
    ).toBeVisible();
  });

  test('Undo moves it back', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}/reschedule`);
    await page.getByRole('button', { name: 'Same time tomorrow' }).click();
    await page.getByRole('button', { name: 'Save new time' }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByText('Tue, 15 Jun 2027 · 10:30 AM to 11:30 AM')).toBeVisible();
  });

  test('asks before changing the time of a meeting that is already done', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.request.post(`/api/meetings/${m.id}/status`, {
      headers: { 'X-Requested-With': 'mm' },
      data: { status: 'Completed', rev: m.rev },
    });
    await page.goto(`/meetings/${m.id}/reschedule`);
    await page.getByRole('button', { name: 'Same time tomorrow' }).click();
    await page.getByRole('button', { name: 'Save new time' }).click();
    const dialog = page.getByRole('dialog', { name: 'Change the time of a finished meeting?' });
    await expect(dialog).toContainText('This meeting is already marked done.');
    await dialog.getByRole('button', { name: 'Change the time' }).click();
    await expect(page.getByText('Meeting moved.', { exact: true })).toBeVisible();
  });

  test('says what is missing if the date is cleared', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}/reschedule`);
    await field(page, 'when_date').fill('');
    await page.getByRole('button', { name: 'Save new time' }).click();
    await expect(page.locator('#field-when_date')).toContainText('Please choose the new date.');
  });
});

test.describe('marking a meeting done', () => {
  test('notes, then a next date, and the next meeting is linked', async ({ page }) => {
    const m = await createViaApi(page, 'ccie', ccie());
    await page.goto(`/meetings/${m.id}`);
    await page.getByRole('link', { name: 'Mark as done' }).click();
    await expect(page.getByRole('heading', { name: 'Mark as done' })).toBeVisible();
    await field(page, 'notes').fill('Both sides agreed to revised claims.');
    await page.getByRole('radio', { name: 'Yes' }).click();
    await page.getByRole('button', { name: 'Same time next week' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const result = page.getByRole('status').filter({ hasText: 'Done. Next meeting on' });
    await expect(result).toContainText('is saved.');
    await result.getByRole('link', { name: 'Open it' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(m.title);
    await expect(page.getByRole('link', { name: /Tue, 15 Jun 2027/ })).toBeVisible(); // the previous meeting

    await page.goto(`/meetings/${m.id}`);
    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/— Notes, Tue, 15 Jun 2027 —/)).toBeVisible();
    await expect(page.getByText('Both sides agreed to revised claims.')).toBeVisible();
  });

  test('the next meeting copies the category fields', async ({ page }) => {
    const m = await createViaApi(
      page,
      'ccie',
      ccie({ state: 'Rajasthan', contractor: 'Marudhar Constructions' }),
    );
    await page.goto(`/meetings/${m.id}/done`);
    await page.getByRole('radio', { name: 'Yes' }).click();
    await page.getByRole('button', { name: 'Same time in 2 weeks' }).click();
    await expect(field(page, 'when_date')).toHaveValue('2027-06-29');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('link', { name: 'Open it' }).click();
    await expect(page.getByText('Rajasthan')).toBeVisible();
    await expect(page.getByText('Marudhar Constructions')).toBeVisible();
    await expect(page.getByText('Tue, 29 Jun 2027 · 10:30 AM to 11:30 AM')).toBeVisible();
  });

  test('No simply finishes it', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}/done`);
    await page.getByRole('radio', { name: 'No', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Done.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open it' })).toHaveCount(0);
  });

  test('Not decided yet is remembered for a case', async ({ page }) => {
    const m = await createViaApi(page, 'ccie', ccie());
    await page.goto(`/meetings/${m.id}/done`);
    await page.getByRole('radio', { name: 'Not decided yet' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('link', { name: 'Back to the meeting' }).click();
    await expect(page.getByText('Waiting for a next date', { exact: true })).toBeVisible();
  });

  test('you must answer the question', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.goto(`/meetings/${m.id}/done`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#field-answer')).toContainText(
      'Please choose Yes, No or Not decided yet.',
    );
    await page.getByRole('radio', { name: 'Yes' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#field-when_date')).toContainText('Please choose the next date.');
  });

  test('Undo reverses both meetings', async ({ page }) => {
    const m = await createViaApi(page, 'ccie', ccie());
    await page.goto(`/meetings/${m.id}/done`);
    await page.getByRole('radio', { name: 'Yes' }).click();
    await page.getByRole('button', { name: 'Same time next week' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByText('Done. That was undone.', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Back to the meeting' }).click();
    await expect(page.getByText('Scheduled', { exact: true }).first()).toBeVisible();
    // The undone next meeting is gone, so there is nothing to link to.
    await expect(page.getByText('Next meeting', { exact: true })).toHaveCount(0);
    await expect(page.getByText('This meeting is not linked to others.')).toBeVisible();
  });

  test('a second next meeting asks first, and can be opened or created anyway', async ({
    page,
  }) => {
    const m = await createViaApi(page, 'ccie', ccie());
    const first = await page.request.post(`/api/meetings/${m.id}/complete`, {
      headers: { 'X-Requested-With': 'mm' },
      data: { next: { id: ulid(), date: '2027-06-22', start_time: '10:30' }, rev: m.rev },
    });
    expect(first.status()).toBe(200);

    // The meeting is already done, so this page goes straight to the next date.
    await page.goto(`/meetings/${m.id}/done?next=1`);
    await page.getByRole('button', { name: 'Same time in 2 weeks' }).click();
    await page.getByRole('button', { name: 'Schedule next meeting' }).click();

    const alert = page.getByRole('alert').filter({ hasText: 'already has a next meeting' });
    await expect(alert).toContainText(
      'This meeting already has a next meeting on Tue, 22 Jun 2027.',
    );
    await expect(alert.getByRole('link', { name: 'Open existing' })).toBeVisible();
    await alert.getByRole('button', { name: 'Create another anyway' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Next meeting on' })).toBeVisible();
  });

  test('Schedule next meeting on a finished meeting skips the notes and the question', async ({
    page,
  }) => {
    const m = await createViaApi(page, 'ccie', ccie());
    await page.request.post(`/api/meetings/${m.id}/status`, {
      headers: { 'X-Requested-With': 'mm' },
      data: { status: 'Completed', rev: m.rev },
    });
    await page.goto(`/meetings/${m.id}/done?next=1`);
    await expect(page.getByRole('heading', { name: 'Schedule next meeting' })).toBeVisible();
    await expect(page.getByText('Notes from the meeting')).toHaveCount(0);
    await expect(page.getByText('Is there a next date?')).toHaveCount(0);
    await page.getByRole('button', { name: 'Same time next week' }).click();
    await page.getByRole('button', { name: 'Schedule next meeting' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Next meeting on' })).toBeVisible();
  });
});

test.describe('the first-time-user journey', () => {
  test('create, reschedule and mark done with a next date, with no help, in under 90 seconds', async ({
    page,
  }) => {
    const started = Date.now();
    const topic = `Journey ${uid()}`;

    await page.goto('/meetings');
    await page.getByRole('main').getByRole('link', { name: '+ New meeting' }).click();
    await page.getByRole('link', { name: 'Others', exact: true }).click();
    await page.getByRole('button', { name: 'Tomorrow' }).click();
    await field(page, 'start_time').fill('15:00');
    await field(page, 'topic').fill(topic);
    await page.getByRole('button', { name: 'Save meeting' }).click();
    await expect(page.getByRole('heading', { name: topic })).toBeVisible();

    await page.getByRole('link', { name: 'Reschedule' }).click();
    await page.getByRole('button', { name: 'Same time next week' }).click();
    await page.getByRole('button', { name: 'Save new time' }).click();
    await expect(page.getByText('Rescheduled ×1')).toBeVisible();

    await page.getByRole('link', { name: 'Mark as done' }).click();
    await page.getByRole('radio', { name: 'Yes' }).click();
    await page.getByRole('button', { name: 'Same time next week' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Done. Next meeting on' }),
    ).toBeVisible();

    expect(Date.now() - started).toBeLessThan(90_000);
  });
});

test.describe('accessibility and layout on the new screens', () => {
  const screens: [string, (page: Page) => Promise<string>][] = [
    ['the category picker', async () => '/meetings/new'],
    ['the CCIE form', async () => '/meetings/new?category=ccie'],
    ['the Award Plan form', async () => '/trackers/award_plan/new'],
    ['the add-a-category page', async () => '/categories/new'],
    ['the meeting page', async (p) => `/meetings/${(await createViaApi(p, 'ccie', ccie())).id}`],
    ['the edit page', async (p) => `/meetings/${(await createViaApi(p, 'ccie', ccie())).id}/edit`],
    [
      'the reschedule page',
      async (p) => `/meetings/${(await createViaApi(p, 'others', others())).id}/reschedule`,
    ],
    ['the done page', async (p) => `/meetings/${(await createViaApi(p, 'ccie', ccie())).id}/done`],
  ];

  for (const [name, url] of screens) {
    test(`${name} has no serious accessibility problems`, async ({ page }) => {
      await page.goto(await url(page));
      await expect(page.locator('main h1, form h1').first()).toBeVisible();
      expect(await serious(page)).toEqual([]);
    });

    test(`${name} works with high contrast at the largest size (A), and nothing scrolls sideways`, async ({
      page,
    }) => {
      await page.goto(await url(page));
      await page.getByRole('button', { name: /^A\s/ }).click();
      await page.getByRole('button', { name: /High contrast/ }).click();
      await expect(page.locator('main h1, form h1').first()).toBeVisible();
      await noSideScroll(page);
      expect(await serious(page)).toEqual([]);
    });
  }

  test('every button on the form and the meeting page is at least 48 px', async ({ page }) => {
    const m = await createViaApi(page, 'ccie', ccie());
    for (const url of [
      '/meetings/new?category=ccie',
      `/meetings/${m.id}`,
      `/meetings/${m.id}/reschedule`,
      `/meetings/${m.id}/done`,
    ]) {
      await page.goto(url);
      await expect(page.locator('h1').first()).toBeVisible();
      const targets = page.locator(
        'main :is(a[href], button), form :is(button, [role=radio]), label:has(input[type=checkbox])',
      );
      const count = await targets.count();
      for (let i = 0; i < count; i += 1) {
        const el = targets.nth(i);
        if (!(await el.isVisible())) continue;
        const box = await el.boundingBox();
        const label = (
          (await el.innerText().catch(() => '')) ||
          (await el.getAttribute('aria-label')) ||
          'unnamed'
        )
          .trim()
          .slice(0, 40);
        if (box && box.width > 0)
          expect(box.height, `${label} on ${url}`).toBeGreaterThanOrEqual(46);
      }
    }
  });

  test('the sticky Save bar does not hide the last field, and the floating New meeting button steps aside', async ({
    page,
  }, info) => {
    await page.goto('/meetings/new?category=ccie');
    // No floating button over a form; on a computer the sidebar has Add beside Meetings instead.
    await expect(page.getByRole('link', { name: '+ New meeting' })).toHaveCount(0);
    if (info.project.name === 'desktop')
      await expect(page.getByRole('link', { name: 'Add — Meetings' })).toBeVisible();
    await page.locator('#field-workspace').scrollIntoViewIfNeeded();
    const field = await page.locator('#field-workspace').boundingBox();
    const bar = await page.getByRole('button', { name: 'Save meeting' }).boundingBox();
    expect(field && bar && field.y + field.height <= bar.y + 4).toBe(true);
  });
});
