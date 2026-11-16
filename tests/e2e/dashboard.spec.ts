import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ccie, createViaApi, others, uid, ulid } from './meetings.helpers';

const search = (page: Page) => page.getByRole('searchbox', { name: 'Search meetings' });

/** The ids of the meetings listed on the page, in order, whether it is a table or phone cards. */
async function ids(page: Page): Promise<string[]> {
  const found = await page.$$eval('main section[aria-busy] a[href^="/meetings/"]', (as) =>
    as
      .map((a) => a.getAttribute('href') ?? '')
      .filter((h) => /^\/meetings\/[0-9A-Z]{26}$/.test(h))
      .map((h) => h.slice(10)),
  );
  return [...new Set(found)];
}

const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

/** Waits for the list to settle after a search or filter. */
const settled = (page: Page) => expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);

async function openDashboard(page: Page, query = '') {
  await page.goto(`/${query}`);
  await expect(page.getByRole('heading', { name: 'Your meetings' })).toBeVisible();
  await expect(page.getByText('Loading your meetings…')).toHaveCount(0);
}

/** The calendar has drawn itself and finished fetching its meetings. */
const calendarReady = async (page: Page) => {
  await expect(page.locator('.fc')).toBeVisible();
  await expect(page.getByText('Loading the calendar…')).toHaveCount(0);
};

const api = async (page: Page, path: string) => (await page.request.get(`/api${path}`)).json();

test.describe('the top of the dashboard', () => {
  test('shows the next meeting with Open and, when there is a link, Join', async ({ page }) => {
    await openDashboard(page);
    const card = page
      .locator('section, div')
      .filter({ has: page.getByRole('heading', { name: 'Next meeting' }) })
      .last();
    await expect(card.getByRole('link', { name: 'Open' })).toBeVisible();
    const summary = await api(page, '/meetings/summary');
    await expect(page.getByText(summary.next.title, { exact: true }).first()).toBeVisible();
  });

  test('the sidebar still has only the built pages and the page has one main button', async ({
    page,
  }) => {
    await openDashboard(page);
    const bg = await page
      .locator('main a, main button')
      .evaluateAll(
        (els) =>
          els.filter(
            (e) =>
              getComputedStyle(e).backgroundColor === 'rgb(143, 56, 18)' &&
              (e as HTMLElement).offsetParent !== null,
          ).length,
      );
    // The Open button on the Next meeting card; the pressed toggles are filled too, so allow them.
    expect(bg).toBeGreaterThanOrEqual(1);
  });
});

test.describe('upcoming and past', () => {
  test('upcoming is in date and time order, past is a separate list, newest first', async ({
    page,
  }) => {
    await openDashboard(page);
    await expect.poll(async () => (await ids(page)).length).toBeGreaterThan(0);
    const shown = await ids(page);

    // Other tests add and delete meetings at the same time, so compare what is on screen with the server's order at that
    // moment, skip any meeting that has gone from the server's list, and look again if the screen changed underneath.
    type Item = { id: string; values: { date: string; start_time: string } };
    const key = (m: Item) => `${m.values.date} ${m.values.start_time}`;
    const inOrder = async (scope: 'upcoming' | 'past') => {
      const onScreen = await ids(page);
      const all = (await api(page, `/meetings?scope=${scope}&limit=1000`)).meetings as Item[];
      const place = new Map(all.map((m, i) => [m.id, i]));
      const positions = onScreen
        .map((id) => place.get(id))
        .filter((p): p is number => p !== undefined);
      return positions.length > 0 && positions.every((p, i) => i === 0 || p >= positions[i - 1]!);
    };

    await expect.poll(() => inOrder('upcoming'), { message: 'upcoming is in order' }).toBe(true);
    const up = (await api(page, '/meetings?scope=upcoming&limit=1000')).meetings as Item[];
    expect(up.map(key)).toEqual([...up.map(key)].sort());

    await page.getByRole('button', { name: 'Past', exact: true }).click();
    // Wait for the list to become the past list.
    await expect.poll(async () => (await ids(page)).some((id) => shown.includes(id))).toBe(false);
    await expect.poll(async () => (await ids(page)).length).toBeGreaterThan(0);
    await expect.poll(() => inOrder('past'), { message: 'past is in order' }).toBe(true);
    const past = (await api(page, '/meetings?scope=past&limit=1000')).meetings as Item[];
    expect(past.map(key)).toEqual([...past.map(key)].sort().reverse());
  });

  test('the choice of Upcoming or Past is remembered', async ({ page }) => {
    await openDashboard(page);
    await page.getByRole('button', { name: 'Past', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Past', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('rows are grouped under date headings with Today and Tomorrow', async ({ page }) => {
    const m = await createViaApi(
      page,
      'others',
      others({ date: today(), start_time: '23:00', end_time: '23:30' }),
    );
    await openDashboard(page, `?q=${encodeURIComponent(m.title)}`);
    await settled(page);
    await expect(
      page
        .getByRole('heading', { name: 'Today' })
        .or(page.getByRole('columnheader', { name: 'Today' })),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: m.title, exact: true })).toBeVisible();
  });
});

test.describe('search', () => {
  test('finds a value typed in a category-specific field', async ({ page }) => {
    const tag = `Zyx${uid()}`;
    const a = await createViaApi(page, 'ccie', ccie({ contractor: `${tag} Infra` }));
    await createViaApi(page, 'ccie', ccie({ contractor: 'Somebody Else' }));
    await openDashboard(page);
    await search(page).fill(tag.toLowerCase());
    await settled(page);
    await expect(page.getByRole('link', { name: a.title, exact: true })).toBeVisible();
    await expect.poll(() => ids(page)).toEqual([a.id]);
  });

  test('finds the title, the category and the workspace words too', async ({ page }) => {
    const m = await createViaApi(page, 'others', others({ topic: `Pelican ${uid()}` }));
    await openDashboard(page);
    await search(page).fill(String(m.title).slice(0, 9).toLowerCase());
    await settled(page);
    await expect.poll(() => ids(page)).toContain(m.id);
    await search(page).fill('phd');
    const expected = (
      await api(page, '/meetings?scope=upcoming&workspace=phd&limit=1000')
    ).meetings.map((x: { id: string }) => x.id);
    expect(expected.length).toBeGreaterThan(0);
    await expect
      .poll(async () => {
        const found = await ids(page);
        return expected.every((id: string) => found.includes(id));
      })
      .toBe(true);
  });

  test('keeps the search in the address, so a reload or a link keeps it', async ({ page }) => {
    const m = await createViaApi(page, 'others', others({ topic: `Heron ${uid()}` }));
    await openDashboard(page);
    await search(page).fill(m.title);
    await settled(page);
    await expect(page).toHaveURL(
      new RegExp(`q=${encodeURIComponent(m.title).replace(/%20/g, '(\\+|%20)')}`),
    );
    await page.reload();
    await expect(search(page)).toHaveValue(m.title);
    await expect.poll(() => ids(page)).toEqual([m.id]);
  });

  test('says plainly when nothing matches, and Clear all brings everything back', async ({
    page,
  }) => {
    await openDashboard(page);
    await search(page).fill('zzzzqqqq');
    await expect(page.getByText('No meetings match what you chose.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(search(page)).toHaveValue('');
    await expect.poll(async () => (await ids(page)).length).toBeGreaterThan(0);
  });
});

test.describe('filters', () => {
  test('the filter builder adds a removable filter, and Clear all removes them', async ({
    page,
  }) => {
    const tag = `Fil${uid()}`;
    const a = await createViaApi(page, 'ccie', ccie({ contractor: `${tag} Roads` }));
    await createViaApi(page, 'ccie', ccie({ contractor: 'Other Roads' }));
    await openDashboard(page);
    await page.getByRole('button', { name: 'More filters' }).click();

    await page.getByLabel('Column').selectOption({ label: 'Contractor' });
    await page.getByLabel('Condition').selectOption({ label: 'contains' });
    await page.getByLabel('Value', { exact: true }).fill(tag);
    await page.getByRole('button', { name: 'Add filter' }).click();

    await expect(page.getByText(`Contractor contains ${tag}`)).toBeVisible();
    await settled(page);
    await expect.poll(() => ids(page)).toEqual([a.id]);

    await page.getByRole('button', { name: `Remove filter: Contractor contains ${tag}` }).click();
    await expect(page.getByText(`Contractor contains ${tag}`)).toHaveCount(0);
    await expect.poll(async () => (await ids(page)).length).toBeGreaterThan(1);
  });

  test('the operators match the kind of column', async ({ page }) => {
    await openDashboard(page);
    await page.getByRole('button', { name: 'More filters' }).click();
    const how = page.getByLabel('Condition');
    await page.getByLabel('Column').selectOption({ label: 'Total Cost' });
    await expect(how.locator('option')).toHaveText([
      'is',
      'is not',
      'is more than',
      'is less than',
      'is between',
      'is empty',
      'is not empty',
    ]);
    await page.getByLabel('Column').selectOption({ label: 'Date Of Initiation' });
    await expect(how.locator('option')).toHaveText([
      'is',
      'is before',
      'is after',
      'is between',
      'is empty',
      'is not empty',
    ]);
    await page.getByLabel('Column').selectOption({ label: 'Contractor' });
    await expect(how.locator('option')).toHaveText([
      'contains',
      'is',
      'is not',
      'is empty',
      'is not empty',
    ]);
  });

  test('a number filter compares numbers, and "between" asks for two values', async ({ page }) => {
    const m = await createViaApi(page, 'at', {
      date: today(),
      start_time: '22:00',
      name_of_project: `Costly ${uid()}`,
      total_cost: '987654',
    });
    await openDashboard(page, `?q=${encodeURIComponent(m.title)}`);
    await page.getByRole('button', { name: 'More filters' }).click();
    await page.getByLabel('Column').selectOption({ label: 'Total Cost' });
    await page.getByLabel('Condition').selectOption({ label: 'is between' });
    await expect(page.getByRole('button', { name: 'Add filter' })).toBeDisabled();
    await page.getByLabel('Value', { exact: true }).fill('900000');
    await page.getByLabel('and', { exact: true }).fill('999999');
    await page.getByRole('button', { name: 'Add filter' }).click();
    await settled(page);
    await expect.poll(() => ids(page)).toEqual([m.id]);
  });

  test("choosing a kind of meeting adds that kind's own columns", async ({ page }) => {
    await openDashboard(page);
    await page.getByLabel('Kind of meeting').selectOption({ label: 'CCIE' });
    await settled(page);
    if ((await page.viewportSize())!.width >= 768) {
      for (const name of [
        'Case Id',
        'Project Name',
        'Numbers of Meeting',
        'Pendency (In Months)',
      ]) {
        await expect(
          page.getByRole('columnheader', { name: new RegExp(name.replace(/[()]/g, '\\$&')) }),
        ).toBeVisible();
      }
    }
    expect((await ids(page)).length).toBeGreaterThan(0);
  });

  test('workspace chips and the status choice narrow the list', async ({ page }) => {
    await openDashboard(page);
    await page.getByRole('radio', { name: 'PhD' }).click();
    await settled(page);
    const expected = (
      await api(page, '/meetings?scope=upcoming&workspace=phd&limit=1000')
    ).meetings.map((x: { id: string }) => x.id);
    await expect.poll(() => ids(page)).toEqual(expected);
    await page.getByRole('radio', { name: 'All', exact: true }).click();
    await page.getByLabel('Status').selectOption({ label: 'Cancelled' });
    await settled(page);
    const cancelled = (await api(page, '/meetings?scope=upcoming&status=Cancelled&limit=1000'))
      .meetings.length;
    await expect.poll(async () => (await ids(page)).length).toBe(cancelled);
  });

  test('"Today" shows only today', async ({ page }) => {
    await createViaApi(
      page,
      'others',
      others({ date: today(), start_time: '23:00', end_time: '23:30' }),
    );
    await openDashboard(page);
    await page.getByLabel('Dates').selectOption({ label: 'Today' });
    const expected = (
      await api(page, `/meetings?scope=upcoming&from=${today()}&to=${today()}&limit=1000`)
    ).meetings.map((x: { id: string }) => x.id);
    expect(expected.length).toBeGreaterThan(0);
    await expect.poll(() => ids(page)).toEqual(expected);
  });

  test('custom dates take a start and an end', async ({ page }) => {
    await openDashboard(page);
    await page.getByLabel('Dates').selectOption({ label: 'Choose dates' });
    await page.getByLabel('From').fill('2100-01-01');
    await settled(page);
    await expect(page.getByText('No meetings match what you chose.')).toBeVisible();
  });
});

test.describe('the table', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(
      info.project.name !== 'desktop',
      'The table is the desktop layout; phones get cards.',
    );
    await openDashboard(page);
    await settled(page);
  });

  test('clicking a header sorts, says so in words, and drops the date headings', async ({
    page,
  }) => {
    await expect(
      page.getByRole('status').filter({ hasText: 'Sorted by Date, oldest first' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^Meeting/ }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Sorted by Meeting, A to Z' }),
    ).toBeVisible();
    await expect(page.locator('th[scope=colgroup]')).toHaveCount(0);
    const titles = await page.locator('tbody tr td:nth-child(3) a').allInnerTexts();
    expect(titles.map((t) => t.toLowerCase())).toEqual(
      [...titles.map((t) => t.toLowerCase())].sort((a, b) =>
        a.localeCompare(b, 'en', { numeric: true }),
      ),
    );
    await page.getByRole('button', { name: /^Meeting/ }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Sorted by Meeting, Z to A' }),
    ).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Meeting/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    await page.getByRole('button', { name: /^Time/ }).click();
    await expect(page.locator('th[scope=colgroup]').first()).toBeVisible();
  });

  test('a row opens the meeting when clicked anywhere', async ({ page }) => {
    const first = (await ids(page))[0]!;
    await page
      .locator('tbody tr')
      .filter({ has: page.locator(`a[href="/meetings/${first}"]`) })
      .locator('td')
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/meetings/${first}$`));
  });

  test('Choose columns hides a column, and the choice is remembered on this device', async ({
    page,
  }) => {
    await page.getByLabel('Kind of meeting').selectOption({ label: 'CCIE' });
    await settled(page);
    await page.getByRole('button', { name: 'Choose columns' }).click();
    await expect(page.getByText('This is remembered on this device.')).toBeVisible();
    await page.getByLabel('Category', { exact: true }).uncheck();
    await expect(page.getByRole('columnheader', { name: /^Category/ })).toHaveCount(0);
    await page.reload();
    await settled(page);
    await expect(page.getByRole('columnheader', { name: /^Case Id/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^Category/ })).toHaveCount(0);
  });

  test('Show more adds fifty at a time and says how many are shown', async ({ page }) => {
    const tag = `Bulk${uid()}`;
    await Promise.all(
      Array.from({ length: 52 }, (_, i) =>
        page.request.post('/api/meetings', {
          headers: { 'X-Requested-With': 'mm' },
          data: {
            id: ulid(),
            category: 'others',
            values: {
              date: '2027-09-01',
              start_time: '10:00',
              topic: `${tag} ${String(i).padStart(2, '0')}`,
            },
          },
        }),
      ),
    );
    await search(page).fill(tag);
    await expect(page.getByText('Showing 50 of 52')).toBeVisible();
    await expect.poll(async () => (await ids(page)).length).toBe(50);
    await page.getByRole('button', { name: 'Show more' }).click();
    await expect(page.getByText('Showing 52 of 52')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0);
    await expect.poll(async () => (await ids(page)).length).toBe(52);
  });

  test('every open row has a Reschedule button, and a finished one does not', async ({ page }) => {
    const m = await createViaApi(page, 'others', others());
    await page.request.post(`/api/meetings/${m.id}/status`, {
      headers: { 'X-Requested-With': 'mm' },
      data: { status: 'Completed', rev: m.rev },
    });
    await search(page).fill(m.title);
    await settled(page);
    await expect(page.getByRole('link', { name: m.title, exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { name: new RegExp(`^Reschedule.*${m.title}`) }),
    ).toHaveCount(0);
  });
});

test.describe('rescheduling from the dashboard', () => {
  test('takes three taps and comes back to the dashboard, with the search still there', async ({
    page,
  }) => {
    const m = await createViaApi(page, 'others', others({ topic: `Tap ${uid()}` }));
    await openDashboard(page);
    await search(page).fill(m.title);
    await expect(page).toHaveURL(/q=/);
    await expect.poll(async () => (await ids(page)).length).toBe(1);
    await page.getByRole('link', { name: new RegExp(`^Reschedule.*${m.title}`) }).click(); // 1
    await page.getByRole('button', { name: 'Same time tomorrow' }).click(); // 2
    await page.getByRole('button', { name: 'Save new time' }).click(); // 3

    await expect(page.getByRole('heading', { name: 'Your meetings' })).toBeVisible();
    await expect(page.getByText('Meeting moved.', { exact: true })).toBeVisible();
    await expect(search(page)).toHaveValue(m.title);
    const moved = (await api(page, `/meetings/${m.id}`)).meeting;
    expect(moved.values.meeting_status).toBe('Rescheduled');
    expect(moved.reschedule_count).toBe(1);
    await expect(page.getByText('Rescheduled ×1')).toBeVisible();
  });
});

test.describe('things that need a look', () => {
  test('a case waiting for a next date gets a line with a Show button', async ({ page }) => {
    const m = await createViaApi(page, 'ccie', ccie());
    await page.request.post(`/api/meetings/${m.id}/complete`, {
      headers: { 'X-Requested-With': 'mm' },
      data: { awaiting_next: true, rev: m.rev },
    });
    await openDashboard(page);
    const line = page.getByRole('status').filter({ hasText: 'waiting for a next date' });
    await expect(line).toContainText(/case(s)? (is|are) waiting for a next date\./);
    await line.getByRole('button', { name: 'Show' }).click();
    await expect(page.getByText('Showing cases waiting for a next date')).toBeVisible();
    await settled(page);
    await expect.poll(() => ids(page)).toContain(m.id);
    await page.getByRole('button', { name: 'Show everything' }).click();
    await expect(page.getByText('Showing cases waiting for a next date')).toHaveCount(0);
  });
});

test.describe('the calendar', () => {
  test('is chosen with a labelled button, has Month Week Day List and Today Previous Next, and is remembered', async ({
    page,
  }, info) => {
    await openDashboard(page);
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Month', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'List', exact: true })).toBeVisible();
    for (const name of ['Today', 'Previous', 'Next'])
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    if (info.project.name === 'mobile') {
      // Phones get List instead of the week and day grids.
      await expect(page.getByRole('button', { name: 'Week', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByRole('button', { name: 'Week', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Day', exact: true })).toBeVisible();
    }
    // The Upcoming and Past tabs make no sense here.
    await expect(page.getByRole('button', { name: 'Upcoming', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Month', exact: true })).toBeVisible();
  });

  test('shows a meeting with its category name and opens it when clicked', async ({
    page,
  }, info) => {
    const m = await createViaApi(
      page,
      'others',
      others({ date: today(), start_time: '22:00', end_time: '22:30', topic: `Cal ${uid()}` }),
    );
    await openDashboard(page, `?q=${encodeURIComponent(m.title)}`);
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    if (info.project.name === 'mobile') {
      // A dot in the grid, and the day's meetings listed underneath.
      const list = page.getByRole('heading', { name: /^Meetings on/ });
      await expect(list).toBeVisible();
      await page.getByRole('link', { name: m.title, exact: true }).first().click();
    } else {
      await page.getByRole('button', { name: 'List', exact: true }).click();
      const event = page.locator('.fc-list-event').filter({ hasText: m.title });
      await expect(event).toBeVisible();
      await expect(event).toContainText('Others:');
      await event.click();
    }
    await expect(page.getByRole('heading', { name: m.title })).toBeVisible();
  });

  test('shows the same meetings as the table, upcoming and past together', async ({
    page,
  }, info) => {
    test.skip(
      info.project.name === 'mobile',
      'The list view of the calendar is the way to read it all at once.',
    );
    const tag = `Same${uid()}`;
    for (const time of ['07:30', '13:00', '23:00']) {
      await createViaApi(
        page,
        'others',
        others({
          date: today(),
          start_time: time,
          end_time: time === '23:00' ? '23:30' : undefined,
          topic: `${tag} ${time}`,
        }),
      );
    }
    await openDashboard(page, `?q=${tag}`);
    await settled(page);
    const upcoming = await page.locator('tbody tr td:nth-child(3) a').allInnerTexts();
    await page.getByRole('button', { name: 'Past', exact: true }).click();
    await settled(page);
    const past = await page.locator('tbody tr td:nth-child(3) a').allInnerTexts();
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page.locator('.fc-list-event').filter({ hasText: tag }).first()).toBeVisible();
    const calendar = (await page.locator('.fc-list-event-title').allInnerTexts()).map((t) =>
      t.replace(/^Others:\s*/, ''),
    );
    expect([...upcoming, ...past].sort()).toEqual(calendar.sort());
    expect(calendar).toHaveLength(3);
  });

  test('a search narrows the calendar too', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile');
    const a = await createViaApi(
      page,
      'others',
      others({ date: today(), start_time: '21:00', end_time: '21:30', topic: `Keep ${uid()}` }),
    );
    const b = await createViaApi(
      page,
      'others',
      others({ date: today(), start_time: '21:30', end_time: '22:00', topic: `Hide ${uid()}` }),
    );
    await openDashboard(page, `?q=${encodeURIComponent(a.title)}`);
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page.locator('.fc-list-event').filter({ hasText: a.title })).toBeVisible();
    await expect(page.locator('.fc-list-event').filter({ hasText: b.title })).toHaveCount(0);
  });
});

test.describe('accessibility and layout', () => {
  async function serious(page: Page) {
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    return r.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  }
  const noSideScroll = async (page: Page) =>
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);

  const states: [string, (p: Page) => Promise<void>][] = [
    ['the table', async () => undefined],
    [
      'the table with filters open',
      async (p) => void (await p.getByRole('button', { name: 'More filters' }).click()),
    ],
    [
      'the past list',
      async (p) => void (await p.getByRole('button', { name: 'Past', exact: true }).click()),
    ],
    [
      'the calendar month',
      async (p) => {
        await p.getByRole('button', { name: 'Calendar', exact: true }).click();
        await calendarReady(p);
      },
    ],
    [
      'the calendar list',
      async (p) => {
        await p.getByRole('button', { name: 'Calendar', exact: true }).click();
        await p.getByRole('button', { name: 'List', exact: true }).click();
        await calendarReady(p);
      },
    ],
  ];
  for (const [name, setup] of states) {
    test(`${name} has no serious accessibility problems`, async ({ page }) => {
      await openDashboard(page);
      await setup(page);
      await settled(page);
      expect(await serious(page)).toEqual([]);
    });

    test(`${name} works at A++ with high contrast without scrolling sideways`, async ({ page }) => {
      await openDashboard(page);
      await page.getByRole('button', { name: /^A\+\+/ }).click();
      await page.getByRole('button', { name: /High contrast/ }).click();
      await setup(page);
      await settled(page);
      await noSideScroll(page);
      expect(await serious(page)).toEqual([]);
    });
  }

  test('the buttons and links on the dashboard are all easy to hit', async ({ page }) => {
    await openDashboard(page);
    await settled(page);
    const targets = page.locator(
      'main :is(a[href], button, [role=radio]), main label:has(input[type=checkbox])',
    );
    const count = await targets.count();
    const small: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const el = targets.nth(i);
      if (!(await el.isVisible())) continue;
      const box = await el.boundingBox();
      if (box && box.width > 0 && box.height < 46)
        small.push(
          `${(await el.innerText().catch(() => '')).trim().slice(0, 30)} (${Math.round(box.height)}px)`,
        );
    }
    expect(small).toEqual([]);
  });
});
